import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { FirebaseService } from '../../firebase/firebase.service';
import { AuthUser } from '../interfaces/auth-user.interface';

const ADMIN_EMAIL = 'admin@onerepute.com';

function isQuotaExhaustedError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || '').toUpperCase();
  const code = String(err.code || '').toUpperCase();
  return (
    code === 'RESOURCE_EXHAUSTED' ||
    code === '8' ||
    err.status === 429 ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('QUOTA EXCEEDED') ||
    msg.includes('TOO MANY REQUESTS') ||
    msg.includes('RATE LIMIT')
  );
}

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 1. Deduplication: If request.user was already populated by FirebaseAuthMiddleware, pass through instantly!
    if (request.user && request.user.uid) {
      return true;
    }

    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('Missing or invalid Authorization header');
      throw new UnauthorizedException('Unauthorized: Missing or invalid token');
    }

    const idToken = authHeader.split('Bearer ')[1];

    // 2. Token cache lookup
    const cachedAuthUser = this.firebaseService.getCachedAuthUser(idToken);
    if (cachedAuthUser) {
      request.user = cachedAuthUser;
      return true;
    }

    try {
      const decodedToken = await this.firebaseService.verifyIdToken(idToken);
      
      const db = this.firebaseService.getDb();
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};

      const userEmail = (decodedToken.email || '').toLowerCase();
      const isAdminEmail = userEmail === ADMIN_EMAIL.toLowerCase();

      let userRole = userData.role || 'GUEST';

      if (isAdminEmail) {
        userRole = 'admin';
      } else if (String(userRole).toLowerCase() === 'admin' || String(userRole).toLowerCase() === 'super_admin') {
        this.logger.warn(`Demoting unauthorized admin role for email: ${userEmail}`);
        userRole = 'outlet';
      }

      let customerId = userData.customerId || null;
      if (!customerId) {
        // Fallback 1: Query customers collection where email matches
        const customerSnap = await db.collection('customers')
          .where('email', '==', userEmail)
          .limit(1)
          .get();
        if (!customerSnap.empty) {
          customerId = customerSnap.docs[0].id;
        } else {
          // Fallback 2: Check if there's any outlet assigned
          const outletSnap = await db.collection('outlets')
            .where('ownerId', '==', decodedToken.uid)
            .limit(1)
            .get();
          if (!outletSnap.empty && outletSnap.docs[0].data().customerId) {
            customerId = outletSnap.docs[0].data().customerId;
          } else {
            // Auto-provision customer context
            customerId = `cust_${decodedToken.uid}`;
            await db.collection('customers').doc(customerId).set({
              email: userEmail,
              name: userData.name || userEmail.split('@')[0],
              plan: 'plan_starter',
              billingCycle: 'monthly',
              subscriptionStatus: 'inactive',
              billingCountry: 'IN',
              currency: 'INR',
              createdAt: new Date(),
              updatedAt: new Date(),
            }, { merge: true });
          }
        }
        await db.collection('users').doc(decodedToken.uid).set({ customerId }, { merge: true });
      }

      const authUser: AuthUser = {
        uid: decodedToken.uid,
        email: decodedToken.email || '',
        role: userRole,
        customerId,
        assignedOutletIds: userData.assignedOutletIds || [],
      };

      this.firebaseService.setCachedAuthUser(idToken, authUser, decodedToken);

      request.user = authUser;
      return true;
    } catch (err: any) {
      if (isQuotaExhaustedError(err)) {
        this.logger.warn(`Firebase quota exhausted during guard authentication: ${err.message}`);
        throw new HttpException(
          { error: 'Firebase service quota limit reached. Please try again in a few moments.', code: 'RESOURCE_EXHAUSTED' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      this.logger.warn(`Firebase authentication failed: ${err.message}`);
      throw new UnauthorizedException('Unauthorized: Invalid token');
    }
  }
}
