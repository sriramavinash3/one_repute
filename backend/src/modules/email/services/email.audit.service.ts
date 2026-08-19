/**
 * src/modules/email/services/email.audit.service.ts
 * 
 * Production-grade persistent email audit logger & idempotency manager.
 * Stores transactional email logs in Firestore ('email_logs') and Prisma DB.
 */

import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../firebase/firebase.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface EmailAuditLogEntry {
  id?: string;
  userId?: string;
  recipientEmail: string;
  template: string;
  subject?: string;
  provider: string;
  status: 'QUEUED' | 'SENDING' | 'DELIVERED' | 'FAILED' | 'BOUNCED' | 'SKIPPED_DUPLICATE';
  queueId?: string;
  providerMessageId?: string;
  latencyMs?: number;
  failureReason?: string;
  retries?: number;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable()
export class EmailAuditService {
  private readonly logger = new Logger(EmailAuditService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly prismaService: PrismaService,
  ) {}

  /**
   * Check if an idempotency key exists and is still valid to prevent duplicate email dispatches
   */
  async checkAndLockIdempotencyKey(key: string, ttlSeconds: number = 86400): Promise<boolean> {
    if (!key) return true; // No key provided, allow processing

    try {
      const db = this.firebaseService.getDb();
      const lockRef = db.collection('email_idempotency').doc(key);
      const doc = await lockRef.get();

      if (doc.exists) {
        const data = doc.data();
        const createdAt = data?.createdAt?.toDate ? data.createdAt.toDate() : new Date(data?.createdAt || 0);
        const ageInSeconds = (Date.now() - createdAt.getTime()) / 1000;

        if (ageInSeconds < ttlSeconds) {
          this.logger.log(`[IDEMPOTENCY] Duplicate email dispatch suppressed for key: ${key}`);
          return false; // Lock exists and valid, block duplicate
        }
      }

      // Record lock with timestamp
      await lockRef.set({
        key,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      });

      return true;
    } catch (err: any) {
      this.logger.warn(`[IDEMPOTENCY] Failed to check idempotency lock key '${key}': ${err.message}. Proceeding safely.`);
      return true;
    }
  }

  /**
   * Persist email audit record to Firestore & optional Postgres Prisma store
   */
  async recordEmailAttempt(entry: EmailAuditLogEntry): Promise<string> {
    const docId = entry.id || `email_log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();

    const sanitizedEntry = {
      id: docId,
      userId: entry.userId || null,
      recipientEmail: entry.recipientEmail,
      template: entry.template,
      subject: entry.subject || '',
      provider: entry.provider || 'resend',
      status: entry.status,
      queueId: entry.queueId || null,
      providerMessageId: entry.providerMessageId || null,
      latencyMs: entry.latencyMs || 0,
      failureReason: entry.failureReason ? String(entry.failureReason).substring(0, 500) : null,
      retries: entry.retries || 0,
      idempotencyKey: entry.idempotencyKey || null,
      metadata: entry.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    // 1. Write to Firestore 'email_logs' collection
    try {
      const db = this.firebaseService.getDb();
      await db.collection('email_logs').doc(docId).set(sanitizedEntry, { merge: true });
    } catch (fsErr: any) {
      this.logger.error(`Failed to write email audit record to Firestore: ${fsErr.message}`);
    }

    // 2. Write to Prisma DB if DATABASE_URL is active
    if (process.env.DATABASE_URL) {
      try {
        await (this.prismaService as any).emailLog?.upsert({
          where: { id: docId },
          update: {
            status: sanitizedEntry.status,
            providerMessageId: sanitizedEntry.providerMessageId,
            latencyMs: sanitizedEntry.latencyMs,
            failureReason: sanitizedEntry.failureReason,
            retries: sanitizedEntry.retries,
            updatedAt: now,
          },
          create: sanitizedEntry,
        });
      } catch (prismaErr: any) {
        // Silently capture if Prisma table doesn't exist
      }
    }

    this.logger.log(`[EMAIL AUDIT LOGGED] ID: ${docId} | Template: ${entry.template} | To: ${entry.recipientEmail} | Status: ${entry.status}`);
    return docId;
  }

  /**
   * Update existing email record status
   */
  async updateEmailStatus(docId: string, update: Partial<EmailAuditLogEntry>): Promise<void> {
    if (!docId) return;
    const now = new Date();

    try {
      const db = this.firebaseService.getDb();
      const payload: any = {
        updatedAt: now,
      };

      if (update.status) payload.status = update.status;
      if (update.providerMessageId) payload.providerMessageId = update.providerMessageId;
      if (update.latencyMs !== undefined) payload.latencyMs = update.latencyMs;
      if (update.failureReason !== undefined) payload.failureReason = update.failureReason ? String(update.failureReason).substring(0, 500) : null;
      if (update.retries !== undefined) payload.retries = update.retries;

      await db.collection('email_logs').doc(docId).set(payload, { merge: true });
    } catch (err: any) {
      this.logger.error(`Failed updating email status for docId ${docId}: ${err.message}`);
    }
  }

  /**
   * Query recent email logs for status verification
   */
  async getLatestEmailLogs(recipientEmail?: string, limit: number = 20): Promise<EmailAuditLogEntry[]> {
    try {
      const db = this.firebaseService.getDb();
      let query: any = db.collection('email_logs');

      if (recipientEmail) {
        query = query.where('recipientEmail', '==', recipientEmail);
      }

      const snap = await query.orderBy('createdAt', 'desc').limit(limit).get();
      return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    } catch (err: any) {
      this.logger.warn(`Could not fetch email logs: ${err.message}`);
      return [];
    }
  }
}
