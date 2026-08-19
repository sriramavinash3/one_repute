import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private _db!: admin.firestore.Firestore;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    if (admin.apps.length > 0) {
      this.logger.log('[Firebase] Already initialized, reusing existing app.');
      this._db = admin.firestore();
      return;
    }

    try {
      const projectId = this.configService.get<string>('firebase.projectId');
      const clientEmail = this.configService.get<string>('firebase.clientEmail');
      const privateKey = this.configService.get<string>('firebase.privateKey');

      if (!projectId || !clientEmail || !privateKey) {
        throw new Error('Missing Firebase Admin SDK environment credentials.');
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

      this._db = admin.firestore();
      // Use timestamps for Firestore document fields
      this._db.settings({ timestampsInSnapshots: true });

      this.logger.log('[Firebase] Admin SDK initialized successfully via NestJS');
    } catch (err: any) {
      this.logger.error(`[Firebase] Failed to initialize Admin SDK: ${err.message}`);
      throw err;
    }
  }

  private readonly tokenCache = new Map<string, { decodedToken: admin.auth.DecodedIdToken; authUser?: any; expiresAt: number }>();

  getDb(): admin.firestore.Firestore {
    if (!this._db) {
      this._db = admin.firestore();
    }
    return this._db;
  }

  private readonly inFlightAuthPromises = new Map<string, Promise<admin.auth.DecodedIdToken>>();

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    const cached = this.tokenCache.get(idToken);
    const now = Date.now();
    if (cached && cached.expiresAt > now && cached.decodedToken.exp * 1000 > now) {
      return cached.decodedToken;
    }

    if (this.inFlightAuthPromises.has(idToken)) {
      return this.inFlightAuthPromises.get(idToken)!;
    }

    const verifyPromise = (async () => {
      try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const ttlMs = Math.min(5 * 60 * 1000, Math.max(0, decodedToken.exp * 1000 - Date.now()));
        this.tokenCache.set(idToken, {
          decodedToken,
          authUser: cached?.authUser,
          expiresAt: Date.now() + ttlMs,
        });

        // Cleanup old cache entries periodically
        if (this.tokenCache.size > 200) {
          for (const [k, v] of this.tokenCache.entries()) {
            if (v.expiresAt <= Date.now()) this.tokenCache.delete(k);
          }
        }

        return decodedToken;
      } catch (err: any) {
        this.logger.warn(`Token verification failed: ${err.message}`);
        throw err;
      } finally {
        this.inFlightAuthPromises.delete(idToken);
      }
    })();

    this.inFlightAuthPromises.set(idToken, verifyPromise);
    return verifyPromise;
  }

  private readonly userProfileCache = new Map<string, { authUser: any; expiresAt: number }>();

  async getCachedUserProfile(uid: string): Promise<any | null> {
    const cached = this.userProfileCache.get(uid);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.authUser;
    }
    return null;
  }

  setCachedUserProfile(uid: string, authUser: any, ttlSeconds = 600): void {
    if (!uid || !authUser) return;
    this.userProfileCache.set(uid, {
      authUser,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  invalidateUserProfile(uid: string): void {
    if (uid) this.userProfileCache.delete(uid);
  }

  getCachedAuthUser(idToken: string): any | null {
    const cached = this.tokenCache.get(idToken);
    if (cached && cached.expiresAt > Date.now() && cached.authUser) {
      return cached.authUser;
    }
    return null;
  }

  setCachedAuthUser(idToken: string, authUser: any, decodedToken?: admin.auth.DecodedIdToken): void {
    const cached = this.tokenCache.get(idToken);
    const now = Date.now();
    const expMs = decodedToken ? decodedToken.exp * 1000 : (cached?.decodedToken?.exp ? cached.decodedToken.exp * 1000 : now + 5 * 60 * 1000);
    const ttlMs = Math.min(5 * 60 * 1000, Math.max(0, expMs - now));

    if (cached) {
      cached.authUser = authUser;
      cached.expiresAt = now + ttlMs;
    } else if (decodedToken) {
      this.tokenCache.set(idToken, {
        decodedToken,
        authUser,
        expiresAt: now + ttlMs,
      });
    }

    if (authUser && authUser.uid) {
      this.setCachedUserProfile(authUser.uid, authUser, 600);
    }
  }

  async getUser(uid: string): Promise<admin.auth.UserRecord> {
    return admin.auth().getUser(uid);
  }

  async setCustomClaims(uid: string, claims: any): Promise<void> {
    await admin.auth().setCustomUserClaims(uid, claims);
  }

  async revokeRefreshTokens(uid: string): Promise<void> {
    await admin.auth().revokeRefreshTokens(uid);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this._db.collection('_health').limit(1).get();
      return true;
    } catch (err) {
      return false;
    }
  }
}
