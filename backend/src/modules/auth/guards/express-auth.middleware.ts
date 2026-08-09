import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { FirebaseService } from '../../firebase/firebase.service';

const ADMIN_EMAIL = 'admin@onerepute.com';

const PUBLIC_PATHS = [
  '/api/health',
  '/health',
  '/api/auth/signup',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email-token',
  '/api/auth/google',
  '/api/auth/google/onboard',
  '/api/auth/google/callback',
  '/api/auth/google/status',
  '/api/auth/onboarding-session',
  '/api/auth/onboard',
  '/api/auth/verify-user',
  '/api/payments/detect-location',
  '/api/payments/webhook',
  '/api/escalation',
  '/api/admin',
  '/api/discounts',
  '/api/tickets',
];

@Injectable()
export class FirebaseAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(FirebaseAuthMiddleware.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const rawPath = (req.originalUrl || req.baseUrl || req.path || '').split('?')[0];
    const cleanPath = rawPath.replace(/\/$/, ''); // strip trailing slash for comparison
    
    // Check if current path matches any public routes
    const isPublic = PUBLIC_PATHS.some(path => {
      return cleanPath === path || cleanPath.startsWith(path + '/');
    });

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (isPublic) {
        return next();
      }
      this.logger.warn(`Missing authorization header for protected route: ${cleanPath}`);
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }

    const idToken = authHeader.split('Bearer ')[1];

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
      let outletId = userData.outletId || null;
      if (userRole === 'outlet') {
        if (!customerId || !outletId) {
          // Fallback 1: Query customers collection where email matches
          const customerSnap = await db.collection('customers')
            .where('email', '==', decodedToken.email)
            .limit(1)
            .get();
          if (!customerSnap.empty) {
            customerId = customerId || customerSnap.docs[0].id;
            await db.collection('users').doc(decodedToken.uid).update({ customerId });
          }
        }
        if (!outletId && customerId) {
          // Fallback 2: Resolve the outlet from the customer's outlets
          const outletByCustomerSnap = await db.collection('outlets')
            .where('customerId', '==', customerId)
            .where('status', '==', 'active')
            .limit(1)
            .get();
          if (!outletByCustomerSnap.empty) {
            outletId = outletByCustomerSnap.docs[0].id;
          }
        }
        if (!outletId) {
          // Fallback 3: Check if there's any outlet owned by this user
          const ownedOutletSnap = await db.collection('outlets')
            .where('ownerId', '==', decodedToken.uid)
            .limit(1)
            .get();
          if (!ownedOutletSnap.empty) {
            outletId = outletId || ownedOutletSnap.docs[0].id;
            if (!customerId && ownedOutletSnap.docs[0].data().customerId) {
              customerId = ownedOutletSnap.docs[0].data().customerId;
              await db.collection('users').doc(decodedToken.uid).update({ customerId });
            }
          }
        }
      }

      const authUser = {
        uid: decodedToken.uid,
        email: decodedToken.email || '',
        role: userRole,
        customerId,
        outletId,
        assignedOutletIds: userData.assignedOutletIds || [],
      };

      (req as any).user = authUser;

      // Enforce path-based admin check
      const isRouteAdminRequired = cleanPath.startsWith('/api/admin');
      if (isRouteAdminRequired) {
        if (userEmail !== ADMIN_EMAIL.toLowerCase()) {
          this.logger.warn(`Non-admin email denied admin access: ${userEmail}`);
          return res.status(403).json({ error: 'Forbidden: Only admin@onerepute.com has platform administrator access' });
        }
      }

      return next();
    } catch (err: any) {
      if (isPublic) {
        return next();
      }
      this.logger.warn(`Authentication failed for route ${cleanPath}: ${err.message}`);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
  }
}
