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

    // 1. Token Cache Check (by Token string)
    let cachedAuthUser = this.firebaseService.getCachedAuthUser(idToken);
    if (cachedAuthUser) {
      (req as any).user = cachedAuthUser;

      const isRouteAdminRequired = cleanPath.startsWith('/api/admin');
      if (isRouteAdminRequired) {
        if ((cachedAuthUser.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
          this.logger.warn(`Non-admin email denied admin access: ${cachedAuthUser.email}`);
          return res.status(403).json({ error: 'Forbidden: Only admin@onerepute.com has platform administrator access' });
        }
      }

      return next();
    }

    try {
      const decodedToken = await this.firebaseService.verifyIdToken(idToken);

      // 2. Profile Cache Check (by UID)
      cachedAuthUser = await this.firebaseService.getCachedUserProfile(decodedToken.uid);
      if (cachedAuthUser) {
        this.firebaseService.setCachedAuthUser(idToken, cachedAuthUser, decodedToken);
        (req as any).user = cachedAuthUser;

        const isRouteAdminRequired = cleanPath.startsWith('/api/admin');
        if (isRouteAdminRequired) {
          if ((cachedAuthUser.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
            this.logger.warn(`Non-admin email denied admin access: ${cachedAuthUser.email}`);
            return res.status(403).json({ error: 'Forbidden: Only admin@onerepute.com has platform administrator access' });
          }
        }

        return next();
      }

      let userData: any = {};

      try {
        const db = this.firebaseService.getDb();
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        userData = userDoc.exists ? userDoc.data() : {};
      } catch (dbErr: any) {
        this.logger.warn(`Firestore user lookup failed (${dbErr.message}). Falling back to decoded token claims.`);
      }

      const userEmail = (decodedToken.email || '').toLowerCase();
      const isAdminEmail = userEmail === ADMIN_EMAIL.toLowerCase();

      let userRole = userData.role || (decodedToken as any).role || 'GUEST';

      if (isAdminEmail) {
        userRole = 'admin';
      } else if (String(userRole).toLowerCase() === 'admin' || String(userRole).toLowerCase() === 'super_admin') {
        this.logger.warn(`Demoting unauthorized admin role for email: ${userEmail}`);
        userRole = 'outlet';
      }

      let customerId = userData.customerId || (decodedToken as any).customerId || null;
      let outletId = userData.outletId || (decodedToken as any).outletId || null;

      if (userRole === 'outlet' && (!customerId || !outletId)) {
        try {
          const db = this.firebaseService.getDb();
          if (!customerId || !outletId) {
            const customerSnap = await db.collection('customers')
              .where('email', '==', decodedToken.email)
              .limit(1)
              .get();
            if (!customerSnap.empty) {
              customerId = customerId || customerSnap.docs[0].id;
            }
          }
          if (!outletId && customerId) {
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
            const ownedOutletSnap = await db.collection('outlets')
              .where('ownerId', '==', decodedToken.uid)
              .limit(1)
              .get();
            if (!ownedOutletSnap.empty) {
              outletId = outletId || ownedOutletSnap.docs[0].id;
              if (!customerId && ownedOutletSnap.docs[0].data().customerId) {
                customerId = ownedOutletSnap.docs[0].data().customerId;
              }
            }
          }
        } catch (dbQueryErr: any) {
          this.logger.warn(`Firestore relation lookup skipped due to database status: ${dbQueryErr.message}`);
        }
      }

      const authUser = {
        uid: decodedToken.uid,
        email: decodedToken.email || '',
        role: userRole === 'GUEST' ? 'outlet' : userRole,
        customerId: customerId || `cust_${decodedToken.uid}`,
        outletId,
        assignedOutletIds: userData.assignedOutletIds || [],
      };

      this.firebaseService.setCachedAuthUser(idToken, authUser, decodedToken);

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
      if (isQuotaExhaustedError(err)) {
        this.logger.warn(`Firebase Auth token verification quota exhausted for route ${cleanPath}: ${err.message}`);
        return res.status(429).json({ error: 'System quota temporarily exceeded. Please try again in a moment.', code: 'RESOURCE_EXHAUSTED' });
      }
      this.logger.warn(`Authentication failed for route ${cleanPath}: ${err.message}`);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
  }
}
