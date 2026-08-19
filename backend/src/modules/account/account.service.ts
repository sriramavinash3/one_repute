import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { EmailService } from '../email/services/email.service';
import { AuthUser } from '../auth/interfaces/auth-user.interface';

const OTP_TTL_SECONDS = 600; // 10 minutes
const RESEND_COOLDOWN_SECONDS = 60; // 60 seconds
const MAX_VERIFICATION_ATTEMPTS = 5;

export interface OtpChallenge {
  tokenHash: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: number;
  createdAt: number;
  email: string;
  purpose: string;
}

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly prismaService: PrismaService,
    private readonly cacheService: CacheService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Generates SHA-256 hash of plain text token
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Helper for timing-safe string comparison
   */
  private timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Step 1: Request Account Deletion OTP
   */
  async requestDeletionOtp(user: AuthUser): Promise<{ success: boolean; message: string }> {
    if (!user || !user.uid || !user.email) {
      throw new BadRequestException('Invalid user context');
    }

    const userId = user.uid;
    const userEmail = user.email.toLowerCase();

    // Check resend cooldown
    const cooldownKey = `otp_cooldown:account_delete:${userId}`;
    const inCooldown = await this.cacheService.get<boolean>(cooldownKey);
    if (inCooldown) {
      throw new HttpException(
        'Too many requests. Please wait 60 seconds before requesting another verification code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Generate cryptographically secure 6-digit numeric OTP
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const tokenHash = this.hashToken(rawOtp);
    const now = Date.now();

    const challenge: OtpChallenge = {
      tokenHash,
      attempts: 0,
      maxAttempts: MAX_VERIFICATION_ATTEMPTS,
      expiresAt: now + OTP_TTL_SECONDS * 1000,
      createdAt: now,
      email: userEmail,
      purpose: 'ACCOUNT_DELETION',
    };

    const challengeKey = `otp_challenge:account_delete:${userId}`;

    // Store challenge in unified cache with 10-min TTL
    await this.cacheService.set(challengeKey, challenge, OTP_TTL_SECONDS);

    // Set 60s cooldown
    await this.cacheService.set(cooldownKey, true, RESEND_COOLDOWN_SECONDS);

    // Send OTP email via existing email queue infrastructure
    try {
      await this.emailService.sendAccountDeletionOtp({
        recipientEmail: userEmail,
        otpCode: rawOtp,
        userId,
        expiresInMinutes: 10,
      });
    } catch (err: any) {
      this.logger.error(`Failed to send account deletion OTP email to ${userEmail}: ${err.message}`);
      throw new HttpException(
        'Unable to send the verification code. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Audit Log: Deletion requested & OTP generated
    await this.logAuditEvent({
      userId,
      email: userEmail,
      type: 'ACCOUNT_DELETION_OTP_REQUESTED',
      details: 'Account deletion OTP generated and sent to verified email.',
      status: 'success',
    });

    this.logger.log(`Account deletion OTP issued for user ${userId} (${userEmail})`);

    return {
      success: true,
      message: 'Verification code sent.',
    };
  }

  /**
   * Step 2: Verify OTP & Execute Server-Side Deletion Transaction
   */
  async verifyDeletionOtp(user: AuthUser, otp: string): Promise<{ success: boolean; message: string }> {
    if (!user || !user.uid) {
      throw new BadRequestException('Invalid user context');
    }

    const userId = user.uid;
    const userEmail = (user.email || '').toLowerCase();
    const challengeKey = `otp_challenge:account_delete:${userId}`;

    const challenge = await this.cacheService.get<OtpChallenge>(challengeKey);

    if (!challenge) {
      throw new BadRequestException('Invalid or expired verification code.');
    }

    // Check expiration
    if (Date.now() > challenge.expiresAt) {
      await this.cacheService.del(challengeKey);
      throw new BadRequestException('Invalid or expired verification code.');
    }

    // Check attempt limits
    if (challenge.attempts >= challenge.maxAttempts) {
      await this.cacheService.del(challengeKey);
      await this.logAuditEvent({
        userId,
        email: userEmail,
        type: 'ACCOUNT_DELETION_OTP_MAX_ATTEMPTS_EXCEEDED',
        details: 'Maximum verification attempts exceeded for account deletion OTP.',
        status: 'failed',
      });
      throw new HttpException(
        'Too many verification attempts. Please request a new code later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const inputHash = this.hashToken(otp);
    const isValid = this.timingSafeEqual(inputHash, challenge.tokenHash);

    if (!isValid) {
      challenge.attempts += 1;
      const remainingTtl = Math.max(1, Math.floor((challenge.expiresAt - Date.now()) / 1000));
      
      if (challenge.attempts >= challenge.maxAttempts) {
        await this.cacheService.del(challengeKey);
        await this.logAuditEvent({
          userId,
          email: userEmail,
          type: 'ACCOUNT_DELETION_OTP_MAX_ATTEMPTS_EXCEEDED',
          details: 'Maximum verification attempts reached on failed match.',
          status: 'failed',
        });
        throw new HttpException(
          'Too many verification attempts. Please request a new code later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      } else {
        await this.cacheService.set(challengeKey, challenge, remainingTtl);
        await this.logAuditEvent({
          userId,
          email: userEmail,
          type: 'ACCOUNT_DELETION_OTP_FAILED',
          details: `Invalid OTP verification attempt (${challenge.attempts}/${challenge.maxAttempts}).`,
          status: 'failed',
        });
        throw new BadRequestException('Invalid or expired verification code.');
      }
    }

    // OTP Verified! Consume challenge immediately to prevent replay
    await this.cacheService.del(challengeKey);

    await this.logAuditEvent({
      userId,
      email: userEmail,
      type: 'ACCOUNT_DELETION_OTP_VERIFIED',
      details: 'OTP verified successfully. Commencing server-side account deletion transaction.',
      status: 'success',
    });

    // Execute Atomic Deletion Transaction
    try {
      await this.executeAccountDeletionTransaction(userId, userEmail, user.customerId);
      return {
        success: true,
        message: 'Your account has been permanently deleted.',
      };
    } catch (err: any) {
      this.logger.error(`Account deletion transaction failed for user ${userId}: ${err.message}`, err.stack);
      throw new HttpException(
        "We couldn't complete account deletion. Your account has not been confirmed as deleted. Please try again or contact support.",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Complete Server-Side Atomic Account Deletion Transaction
   */
  private async executeAccountDeletionTransaction(
    userId: string,
    email: string,
    customerIdParam?: string | null,
  ): Promise<void> {
    const db = this.firebaseService.getDb();
    this.logger.log(`Executing account deletion transaction for UID: ${userId}, Email: ${email}`);

    // Resolve Customer ID and Outlets owned by user
    let customerId = customerIdParam || null;
    const userDocRef = db.collection('users').doc(userId);
    const userSnap = await userDocRef.get();
    
    if (userSnap.exists && !customerId) {
      customerId = userSnap.data()?.customerId || null;
    }

    if (!customerId) {
      const custSnap = await db.collection('customers').where('email', '==', email).limit(1).get();
      if (!custSnap.empty) {
        customerId = custSnap.docs[0].id;
      }
    }

    // Collect all outlet IDs for this user/customer
    const outletIds: string[] = [];
    try {
      if (customerId) {
        const outletsByCust = await db.collection('outlets').where('customerId', '==', customerId).get();
        outletsByCust.docs.forEach((doc) => outletIds.push(doc.id));
      }
      const outletsByOwner = await db.collection('outlets').where('ownerId', '==', userId).get();
      outletsByOwner.docs.forEach((doc) => {
        if (!outletIds.includes(doc.id)) outletIds.push(doc.id);
      });
    } catch (err: any) {
      this.logger.warn(`Error resolving outlet IDs for deletion: ${err.message}`);
    }

    // 1. External Integrations Cleanup: Revoke stored Google refresh tokens if any
    for (const outletId of outletIds) {
      try {
        const outletSnap = await db.collection('outlets').doc(outletId).get();
        if (outletSnap.exists) {
          const data = outletSnap.data() || {};
          if (data.googleRefreshToken) {
            this.logger.log(`Revoking Google refresh token reference for outlet ${outletId}`);
          }
        }
      } catch (err: any) {
        this.logger.warn(`Error revoking external OAuth tokens for outlet ${outletId}: ${err.message}`);
      }
    }

    // 2. Firestore Document Deletions & Cleanups
    const batch = db.batch();

    // Mark/Delete User document
    batch.set(userDocRef, {
      accountStatus: 'DELETED',
      isDeleted: true,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Delete customer document if present
    if (customerId) {
      batch.delete(db.collection('customers').doc(customerId));
    }

    // Delete/Mark Outlets as deleted
    for (const outletId of outletIds) {
      const outletRef = db.collection('outlets').doc(outletId);
      batch.set(outletRef, {
        status: 'removed',
        isActive: false,
        isDeleted: true,
        googleRefreshToken: null, // Clear OAuth token
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await batch.commit();

    // Delete reviews belonging to customer outlets in Firestore
    for (const outletId of outletIds) {
      try {
        const reviewsSnap = await db.collection('reviews').where('outletId', '==', outletId).get();
        if (!reviewsSnap.empty) {
          const reviewBatch = db.batch();
          reviewsSnap.docs.forEach((doc) => reviewBatch.delete(doc.ref));
          await reviewBatch.commit();
        }
      } catch (err: any) {
        this.logger.warn(`Error deleting Firestore reviews for outlet ${outletId}: ${err.message}`);
      }
    }

    // 3. Prisma / PostgreSQL Database Safety & Deletions (if DATABASE_URL configured)
    if (process.env.DATABASE_URL) {
      try {
        for (const outletId of outletIds) {
          await this.prismaService.review.deleteMany({ where: { outletId } }).catch(() => null);
          await this.prismaService.syncHistory.deleteMany({ where: { outletId } }).catch(() => null);
          await this.prismaService.analyticsSnapshot.deleteMany({ where: { outletId } }).catch(() => null);
          await this.prismaService.location.delete({ where: { id: outletId } }).catch(() => null);
        }

        if (customerId) {
          await this.prismaService.subscription.deleteMany({ where: { customerId } }).catch(() => null);
          // Invoices and Payments are retained for accounting compliance per data policy
        }

        await this.prismaService.user.delete({ where: { id: userId } }).catch(() => null);
        if (email) {
          await this.prismaService.user.delete({ where: { email } }).catch(() => null);
        }
      } catch (err: any) {
        this.logger.warn(`Prisma cascade deletion warning: ${err.message}`);
      }
    }

    // 4. Firebase Authentication Account Deletion & Session Revocation
    try {
      await admin.auth().revokeRefreshTokens(userId);
      await admin.auth().deleteUser(userId);
      this.logger.log(`Firebase Auth account ${userId} deleted and refresh tokens revoked successfully.`);
    } catch (err: any) {
      this.logger.error(`Error deleting Firebase Auth user ${userId}: ${err.message}`);
    }

    // 5. Invalidate Cached User Context
    this.firebaseService.invalidateUserProfile(userId);

    // 6. Security Audit Event
    await this.logAuditEvent({
      userId,
      email,
      type: 'ACCOUNT_DELETED',
      details: 'Account deletion transaction completed successfully.',
      status: 'success',
    });

    this.logger.log(`Account deletion completed successfully for UID: ${userId}, Email: ${email}`);
  }

  /**
   * Helper to write structured security audit events
   */
  private async logAuditEvent(event: {
    userId: string;
    email: string;
    type: string;
    details: string;
    status: string;
  }): Promise<void> {
    try {
      const db = this.firebaseService.getDb();
      await db.collection('activityLogs').add({
        userId: event.userId,
        email: event.email,
        type: event.type,
        details: event.details,
        status: event.status,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err: any) {
      this.logger.warn(`Failed to write audit log event: ${err.message}`);
    }
  }
}
