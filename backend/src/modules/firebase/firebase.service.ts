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

  getDb(): admin.firestore.Firestore {
    if (!this._db) {
      this._db = admin.firestore();
    }
    return this._db;
  }

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    try {
      return await admin.auth().verifyIdToken(idToken);
    } catch (err: any) {
      this.logger.warn(`Token verification failed: ${err.message}`);
      throw err;
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
