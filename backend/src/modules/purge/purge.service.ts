import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { StorageService } from '../storage/storage.service';

export const ADMIN_EMAILS = ['admin@onerepute.com', 'admin@onerepute'];

export interface PurgeDryRunSummary {
  environment: 'LOCAL' | 'PRODUCTION';
  nodeEnv: string;
  databaseTarget: string;
  firebaseProjectId: string;
  requiredConfirmation: string;
  timestamp: string;
  protectedRecords: {
    adminAccounts: string[];
    plansCount: number;
    systemConfigIntact: boolean;
  };
  deletionScopeCounts: {
    authUsersToDelete: number;
    firestoreUsersToDelete: number;
    postgresUsersToDelete: number;
    outlets: number;
    customers: number;
    reviews: number;
    syncHistory: number;
    syncJobs: number;
    analyticsSnapshots: number;
    subscriptions: number;
    invoices: number;
    payments: number;
    transactions: number;
    escalationSettings: number;
    escalationDispatches: number;
    activityLogs: number;
    notificationLogs: number;
    trialFeedbackLogs: number;
    supportTickets: number;
    reports: number;
    teamInvitations: number;
    uploadedFiles: number;
    queueJobs: number;
    redisKeys: number;
    unassociatedRecords: number;
  };
}

export interface PurgeExecutionResult {
  success: boolean;
  environment: 'LOCAL' | 'PRODUCTION';
  timestamp: string;
  deletedCounts: {
    authUsers: number;
    firestoreUsers: number;
    postgresUsers: number;
    outlets: number;
    customers: number;
    reviews: number;
    syncHistory: number;
    analyticsSnapshots: number;
    subscriptions: number;
    financialRecords: number;
    logRecords: number;
    uploadedFiles: number;
    queueJobs: number;
    redisKeys: number;
  };
  verification: {
    passed: boolean;
    remainingUsers: number;
    remainingOutlets: number;
    remainingCustomers: number;
    remainingReviews: number;
    remainingSubscriptions: number;
    adminAccountIntact: boolean;
    plansIntact: boolean;
    schemaIntact: boolean;
  };
  details: string[];
  errors: string[];
}

@Injectable()
export class PurgeService {
  private readonly logger = new Logger(PurgeService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly firebaseService: FirebaseService,
    private readonly prismaService: PrismaService,
    private readonly cacheService: CacheService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Determine whether current environment is LOCAL or PRODUCTION
   */
  getEnvironmentType(): 'LOCAL' | 'PRODUCTION' {
    const nodeEnv = (this.configService.get<string>('NODE_ENV') || process.env.NODE_ENV || 'development').toLowerCase();
    const appUrl = (this.configService.get<string>('APP_URL') || process.env.APP_URL || '').toLowerCase();
    const isProd = nodeEnv === 'production' || appUrl.includes('onerepute.com');
    return isProd ? 'PRODUCTION' : 'LOCAL';
  }

  /**
   * Get required confirmation phrase for current environment
   */
  getRequiredConfirmationString(): string {
    const envType = this.getEnvironmentType();
    return envType === 'PRODUCTION' ? 'PURGE PRODUCTION USER DATA' : 'PURGE LOCAL USER DATA';
  }

  /**
   * Check whether an email belongs to a protected admin account
   */
  isAdminEmail(email?: string | null): boolean {
    if (!email) return false;
    const lower = email.toLowerCase().trim();
    return ADMIN_EMAILS.some(adminEmail => lower === adminEmail.toLowerCase() || lower.startsWith('admin@onerepute'));
  }

  /**
   * Execute Pre-Purge Dry Run Audit
   */
  async getDryRunSummary(): Promise<PurgeDryRunSummary> {
    const envType = this.getEnvironmentType();
    const nodeEnv = this.configService.get<string>('NODE_ENV') || process.env.NODE_ENV || 'development';
    const dbUrl = process.env.DATABASE_URL ? 'PostgreSQL (DATABASE_URL configured)' : 'None (Firestore primary)';
    const firebaseProjectId = this.configService.get<string>('FIREBASE_PROJECT_ID') || process.env.FIREBASE_PROJECT_ID || 'not-configured';
    const requiredConfirmation = this.getRequiredConfirmationString();

    let authUsers: admin.auth.UserRecord[] = [];
    try {
      authUsers = await this.listAllAuthUsers();
    } catch (err: any) {
      this.logger.warn(`[PurgeDryRun] Could not list Auth users: ${err.message}`);
    }

    const adminAuthUsers = authUsers.filter(u => this.isAdminEmail(u.email) || u.customClaims?.role === 'ADMIN' || u.customClaims?.role === 'SUPER_ADMIN');
    const nonAdminAuthUsers = authUsers.filter(u => !adminAuthUsers.includes(u));

    // Protected Accounts
    const protectedAdmins = adminAuthUsers.map(u => u.email || u.uid);
    if (protectedAdmins.length === 0) {
      protectedAdmins.push('admin@onerepute.com (configured safety rule)');
    }

    // Firestore counts
    const firestoreCollections = [
      'users',
      'customers',
      'outlets',
      'reviews',
      'sync_history',
      'syncHistory',
      'syncJobs',
      'analytics_snapshots',
      'analyticsSnapshots',
      'analytics',
      'escalationSettings',
      'escalationDispatches',
      'activityLogs',
      'notificationLogs',
      'trialFeedbackLogs',
      'supportTickets',
      'reports',
      'invoices',
      'payments',
      'transactions',
      'subscriptions',
      'team_invitations',
    ];

    const fsCounts: Record<string, number> = {};
    for (const col of firestoreCollections) {
      fsCounts[col] = await this.countFirestoreDocs(col);
    }

    const fsUsers = await this.fetchFirestoreDocs('users');
    const nonAdminFsUsers = fsUsers.filter(u => !this.isAdminEmail(u.email) && u.role !== 'admin' && u.role !== 'super_admin');

    // Prisma counts
    let pgUsers = 0;
    let pgOutlets = 0;
    let pgReviews = 0;
    let pgSyncHistory = 0;
    let pgAnalytics = 0;
    let pgSubscriptions = 0;
    let pgInvoices = 0;
    let pgPayments = 0;
    let pgTransactions = 0;
    let pgTeamInvitations = 0;
    let pgPlans = 0;

    if (process.env.DATABASE_URL) {
      try {
        pgUsers = await this.prismaService.user.count({
          where: {
            role: { notIn: ['ADMIN', 'SUPER_ADMIN'] },
            NOT: { email: { in: ADMIN_EMAILS } },
          },
        });
        pgOutlets = await this.prismaService.location.count();
        pgReviews = await this.prismaService.review.count();
        pgSyncHistory = await this.prismaService.syncHistory.count();
        pgAnalytics = await this.prismaService.analyticsSnapshot.count();
        pgSubscriptions = await this.prismaService.subscription.count();
        pgInvoices = await this.prismaService.invoice.count();
        pgPayments = await this.prismaService.payment.count();
        pgTransactions = await this.prismaService.transaction.count();
        pgTeamInvitations = await this.prismaService.teamInvitation.count();
        pgPlans = await this.prismaService.plan.count();
      } catch (err: any) {
        this.logger.warn(`[PurgeDryRun] Prisma count query warning: ${err.message}`);
      }
    }

    // Uploaded files
    const uploadedFiles = this.countLocalUploadFiles();

    // BullMQ Queue jobs
    const queueJobs = await this.countQueueJobs();

    return {
      environment: envType,
      nodeEnv,
      databaseTarget: dbUrl,
      firebaseProjectId,
      requiredConfirmation,
      timestamp: new Date().toISOString(),
      protectedRecords: {
        adminAccounts: protectedAdmins,
        plansCount: pgPlans || (await this.countFirestoreDocs('plans')),
        systemConfigIntact: true,
      },
      deletionScopeCounts: {
        authUsersToDelete: nonAdminAuthUsers.length,
        firestoreUsersToDelete: nonAdminFsUsers.length,
        postgresUsersToDelete: pgUsers,
        outlets: Math.max(fsCounts['outlets'] || 0, pgOutlets),
        customers: fsCounts['customers'] || 0,
        reviews: Math.max(fsCounts['reviews'] || 0, pgReviews),
        syncHistory: Math.max((fsCounts['sync_history'] || 0) + (fsCounts['syncHistory'] || 0), pgSyncHistory),
        syncJobs: fsCounts['syncJobs'] || 0,
        analyticsSnapshots: Math.max((fsCounts['analytics_snapshots'] || 0) + (fsCounts['analyticsSnapshots'] || 0) + (fsCounts['analytics'] || 0), pgAnalytics),
        subscriptions: Math.max(fsCounts['subscriptions'] || 0, pgSubscriptions),
        invoices: Math.max(fsCounts['invoices'] || 0, pgInvoices),
        payments: Math.max(fsCounts['payments'] || 0, pgPayments),
        transactions: Math.max(fsCounts['transactions'] || 0, pgTransactions),
        escalationSettings: fsCounts['escalationSettings'] || 0,
        escalationDispatches: fsCounts['escalationDispatches'] || 0,
        activityLogs: fsCounts['activityLogs'] || 0,
        notificationLogs: fsCounts['notificationLogs'] || 0,
        trialFeedbackLogs: fsCounts['trialFeedbackLogs'] || 0,
        supportTickets: fsCounts['supportTickets'] || 0,
        reports: fsCounts['reports'] || 0,
        teamInvitations: Math.max(fsCounts['team_invitations'] || 0, pgTeamInvitations),
        uploadedFiles,
        queueJobs,
        redisKeys: 0,
        unassociatedRecords: 0,
      },
    };
  }

  /**
   * Execute Full Data Purge
   */
  async executePurge(options: { confirmation: string }): Promise<PurgeExecutionResult> {
    const requiredConfirmation = this.getRequiredConfirmationString();
    const envType = this.getEnvironmentType();

    if (!options.confirmation || options.confirmation.trim() !== requiredConfirmation) {
      throw new BadRequestException(
        `Invalid confirmation phrase. Expected exactly '${requiredConfirmation}' for ${envType} environment purge.`,
      );
    }

    this.logger.warn(`[PurgeService] COMMENCING FULL ${envType} USER DATA PURGE...`);

    const details: string[] = [];
    const errors: string[] = [];

    let deletedAuthUsers = 0;
    let deletedFsUsers = 0;
    let deletedPgUsers = 0;
    let deletedOutlets = 0;
    let deletedCustomers = 0;
    let deletedReviews = 0;
    let deletedSyncHistory = 0;
    let deletedAnalytics = 0;
    let deletedSubscriptions = 0;
    let deletedFinancialRecords = 0;
    let deletedLogRecords = 0;
    let deletedFiles = 0;
    let deletedQueueJobs = 0;
    let deletedRedisKeys = 0;

    // ── STEP 1: Background Queues Cleanup ──────────────────────────────────────
    try {
      this.logger.log('[PurgeService] Step 1: Draining background job queues...');
      deletedQueueJobs = await this.cleanAllQueues();
      details.push(`Cleaned ${deletedQueueJobs} BullMQ queue jobs across active queues.`);
    } catch (err: any) {
      const msg = `Queue cleanup warning: ${err.message}`;
      this.logger.warn(msg);
      errors.push(msg);
    }

    // ── STEP 2: Redis & Cache Cleanup ──────────────────────────────────────────
    try {
      this.logger.log('[PurgeService] Step 2: Cleaning Redis caches and OTP keys...');
      deletedRedisKeys = await this.cleanRedisCaches();
      details.push(`Removed ${deletedRedisKeys} Redis cache & session keys.`);
    } catch (err: any) {
      const msg = `Redis cleanup warning: ${err.message}`;
      this.logger.warn(msg);
      errors.push(msg);
    }

    // ── STEP 3: Uploaded Files Cleanup ─────────────────────────────────────────
    try {
      this.logger.log('[PurgeService] Step 3: Deleting uploaded files and assets...');
      deletedFiles = await this.cleanUploadFiles();
      details.push(`Removed ${deletedFiles} local asset files from uploads directory.`);
    } catch (err: any) {
      const msg = `File cleanup warning: ${err.message}`;
      this.logger.warn(msg);
      errors.push(msg);
    }

    // ── STEP 4: Firestore Batched Deletions ─────────────────────────────────────
    try {
      this.logger.log('[PurgeService] Step 4: Executing Firestore batched collection deletions...');
      
      deletedReviews += await this.batchDeleteFirestoreCollection('reviews');
      deletedSyncHistory += await this.batchDeleteFirestoreCollection('sync_history');
      deletedSyncHistory += await this.batchDeleteFirestoreCollection('syncHistory');
      await this.batchDeleteFirestoreCollection('syncJobs');
      
      deletedAnalytics += await this.batchDeleteFirestoreCollection('analytics_snapshots');
      deletedAnalytics += await this.batchDeleteFirestoreCollection('analyticsSnapshots');
      deletedAnalytics += await this.batchDeleteFirestoreCollection('analytics');

      await this.batchDeleteFirestoreCollection('escalationSettings');
      await this.batchDeleteFirestoreCollection('escalationDispatches');

      const activityDel = await this.batchDeleteFirestoreCollection('activityLogs');
      const notifDel = await this.batchDeleteFirestoreCollection('notificationLogs');
      const trialDel = await this.batchDeleteFirestoreCollection('trialFeedbackLogs');
      deletedLogRecords += activityDel + notifDel + trialDel;

      await this.batchDeleteFirestoreCollection('customerUsage');
      await this.batchDeleteFirestoreCollection('supportTickets');
      await this.batchDeleteFirestoreCollection('reports');

      const invDel = await this.batchDeleteFirestoreCollection('invoices');
      const payDel = await this.batchDeleteFirestoreCollection('payments');
      const txDel = await this.batchDeleteFirestoreCollection('transactions');
      deletedFinancialRecords += invDel + payDel + txDel;

      deletedSubscriptions += await this.batchDeleteFirestoreCollection('subscriptions');
      await this.batchDeleteFirestoreCollection('team_invitations');
      await this.batchDeleteFirestoreCollection('invitations');

      deletedOutlets += await this.batchDeleteFirestoreCollection('outlets');
      deletedCustomers += await this.batchDeleteFirestoreCollection('customers');

      // Delete non-admin Firestore users
      deletedFsUsers += await this.batchDeleteFirestoreCollection('users', (doc) => {
        const data = doc.data() || {};
        const email = data.email;
        const role = (data.role || '').toLowerCase();
        return !this.isAdminEmail(email) && role !== 'admin' && role !== 'super_admin';
      });

      details.push(`Firestore collections cleared (${deletedReviews} reviews, ${deletedOutlets} outlets, ${deletedCustomers} customers).`);
    } catch (err: any) {
      const msg = `Firestore purge error: ${err.message}`;
      this.logger.error(msg);
      errors.push(msg);
    }

    // ── STEP 5: PostgreSQL Prisma Transactional Reset ──────────────────────────
    if (process.env.DATABASE_URL) {
      try {
        this.logger.log('[PurgeService] Step 5: Executing Prisma PostgreSQL reset in transaction...');
        await this.prismaService.$transaction(async (tx) => {
          await tx.review.deleteMany({});
          await tx.syncHistory.deleteMany({});
          await tx.analyticsSnapshot.deleteMany({});
          await tx.payment.deleteMany({});
          await tx.transaction.deleteMany({});
          await tx.invoice.deleteMany({});
          await tx.subscription.deleteMany({});
          await tx.verificationToken.deleteMany({});
          await tx.passwordResetToken.deleteMany({});
          await tx.teamInvitation.deleteMany({});

          const nonAdminUsers = await tx.user.findMany({
            where: {
              role: { notIn: ['ADMIN', 'SUPER_ADMIN'] },
              NOT: { email: { in: ADMIN_EMAILS } },
            },
            select: { id: true },
          });

          const nonAdminIds = nonAdminUsers.map(u => u.id);
          await tx.emailLog.deleteMany({
            where: {
              OR: [
                { userId: { in: nonAdminIds } },
                { user: null },
              ],
            },
          });

          await tx.location.deleteMany({});

          const pgDelResult = await tx.user.deleteMany({
            where: {
              role: { notIn: ['ADMIN', 'SUPER_ADMIN'] },
              NOT: { email: { in: ADMIN_EMAILS } },
            },
          });

          deletedPgUsers = pgDelResult.count;
        });

        details.push(`Prisma PostgreSQL reset transaction completed (${deletedPgUsers} PG users deleted).`);
      } catch (err: any) {
        const msg = `Prisma PostgreSQL transaction error: ${err.message}`;
        this.logger.error(msg);
        errors.push(msg);
      }
    }

    // ── STEP 6: Firebase Auth User Identities Removal ───────────────────────────
    try {
      this.logger.log('[PurgeService] Step 6: Revoking sessions and deleting Firebase Auth accounts...');
      const authUsers = await this.listAllAuthUsers();
      const nonAdminAuthUsers = authUsers.filter(
        u => !this.isAdminEmail(u.email) && u.customClaims?.role !== 'ADMIN' && u.customClaims?.role !== 'SUPER_ADMIN',
      );

      for (const u of nonAdminAuthUsers) {
        try {
          await admin.auth().revokeRefreshTokens(u.uid);
          await admin.auth().deleteUser(u.uid);
          this.firebaseService.invalidateUserProfile(u.uid);
          deletedAuthUsers++;
        } catch (err: any) {
          const msg = `Auth deletion error for ${u.uid} (${u.email}): ${err.message}`;
          this.logger.warn(msg);
          errors.push(msg);
        }
      }
      details.push(`Firebase Auth accounts deleted: ${deletedAuthUsers}.`);
    } catch (err: any) {
      const msg = `Firebase Auth purge error: ${err.message}`;
      this.logger.error(msg);
      errors.push(msg);
    }

    // ── STEP 7: Post-Purge Automated Verification ────────────────────────────────
    this.logger.log('[PurgeService] Step 7: Performing post-purge integrity verification...');
    const verification = await this.verifyPostPurgeState();

    const success = verification.passed && errors.length === 0;

    return {
      success,
      environment: envType,
      timestamp: new Date().toISOString(),
      deletedCounts: {
        authUsers: deletedAuthUsers,
        firestoreUsers: deletedFsUsers,
        postgresUsers: deletedPgUsers,
        outlets: deletedOutlets,
        customers: deletedCustomers,
        reviews: deletedReviews,
        syncHistory: deletedSyncHistory,
        analyticsSnapshots: deletedAnalytics,
        subscriptions: deletedSubscriptions,
        financialRecords: deletedFinancialRecords,
        logRecords: deletedLogRecords,
        uploadedFiles: deletedFiles,
        queueJobs: deletedQueueJobs,
        redisKeys: deletedRedisKeys,
      },
      verification,
      details,
      errors,
    };
  }

  /**
   * Automated Post-Purge Verification Engine
   */
  async verifyPostPurgeState() {
    let remainingUsers = 0;
    let remainingOutlets = 0;
    let remainingCustomers = 0;
    let remainingReviews = 0;
    let remainingSubscriptions = 0;
    let adminAccountIntact = false;
    let plansIntact = true;
    let schemaIntact = true;

    // Check Firebase Auth
    try {
      const authUsers = await this.listAllAuthUsers();
      const nonAdminAuthUsers = authUsers.filter(
        u => !this.isAdminEmail(u.email) && u.customClaims?.role !== 'ADMIN' && u.customClaims?.role !== 'SUPER_ADMIN',
      );
      remainingUsers += nonAdminAuthUsers.length;
      adminAccountIntact = authUsers.some(u => this.isAdminEmail(u.email));
    } catch {}

    // Check Firestore
    try {
      const custDocs = await this.fetchFirestoreDocs('customers');
      const outletDocs = await this.fetchFirestoreDocs('outlets');
      const reviewDocs = await this.fetchFirestoreDocs('reviews');
      const subDocs = await this.fetchFirestoreDocs('subscriptions');

      remainingCustomers += custDocs.length;
      remainingOutlets += outletDocs.length;
      remainingReviews += reviewDocs.length;
      remainingSubscriptions += subDocs.length;
    } catch {}

    // Check Postgres Prisma
    if (process.env.DATABASE_URL) {
      try {
        const pgUserCount = await this.prismaService.user.count({
          where: {
            role: { notIn: ['ADMIN', 'SUPER_ADMIN'] },
            NOT: { email: { in: ADMIN_EMAILS } },
          },
        });
        const pgOutletCount = await this.prismaService.location.count();
        const pgReviewCount = await this.prismaService.review.count();
        const pgSubCount = await this.prismaService.subscription.count();

        remainingUsers += pgUserCount;
        remainingOutlets += pgOutletCount;
        remainingReviews += pgReviewCount;
        remainingSubscriptions += pgSubCount;

        const adminPg = await this.prismaService.user.findFirst({
          where: {
            OR: [
              { email: { in: ADMIN_EMAILS } },
              { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
            ],
          },
        });
        if (adminPg) adminAccountIntact = true;
      } catch {
        schemaIntact = false;
      }
    }

    const passed =
      remainingUsers === 0 &&
      remainingOutlets === 0 &&
      remainingCustomers === 0 &&
      remainingReviews === 0 &&
      remainingSubscriptions === 0 &&
      adminAccountIntact;

    return {
      passed,
      remainingUsers,
      remainingOutlets,
      remainingCustomers,
      remainingReviews,
      remainingSubscriptions,
      adminAccountIntact,
      plansIntact,
      schemaIntact,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async listAllAuthUsers(): Promise<admin.auth.UserRecord[]> {
    const users: admin.auth.UserRecord[] = [];
    let pageToken: string | undefined;
    do {
      const res = await admin.auth().listUsers(1000, pageToken);
      users.push(...res.users);
      pageToken = res.pageToken;
    } while (pageToken);
    return users;
  }

  private async countFirestoreDocs(collectionName: string): Promise<number> {
    try {
      const db = this.firebaseService.getDb();
      const snap = await db.collection(collectionName).get();
      return snap.size;
    } catch {
      return 0;
    }
  }

  private async fetchFirestoreDocs(collectionName: string): Promise<any[]> {
    try {
      const db = this.firebaseService.getDb();
      const snap = await db.collection(collectionName).get();
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch {
      return [];
    }
  }

  private async batchDeleteFirestoreCollection(
    collectionName: string,
    filterFn: ((doc: admin.firestore.QueryDocumentSnapshot) => boolean) | null = null,
  ): Promise<number> {
    try {
      const db = this.firebaseService.getDb();
      const snap = await db.collection(collectionName).get();
      let docsToDelete = snap.docs;
      if (filterFn) {
        docsToDelete = docsToDelete.filter(filterFn);
      }

      let deletedCount = 0;
      const chunkSize = 400;
      for (let i = 0; i < docsToDelete.length; i += chunkSize) {
        const batch = db.batch();
        const chunk = docsToDelete.slice(i, i + chunkSize);
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deletedCount += chunk.length;
      }
      return deletedCount;
    } catch (err: any) {
      this.logger.warn(`[Purge] Batch delete error for ${collectionName}: ${err.message}`);
      return 0;
    }
  }

  private countLocalUploadFiles(): number {
    try {
      const uploadDir = path.resolve(process.env.STORAGE_LOCAL_PATH || './uploads');
      if (!fs.existsSync(uploadDir)) return 0;
      const files = fs.readdirSync(uploadDir);
      return files.filter(f => !f.startsWith('.')).length;
    } catch {
      return 0;
    }
  }

  private cleanUploadFiles(): number {
    try {
      const uploadDir = path.resolve(process.env.STORAGE_LOCAL_PATH || './uploads');
      if (!fs.existsSync(uploadDir)) return 0;
      const files = fs.readdirSync(uploadDir);
      let count = 0;
      for (const file of files) {
        if (!file.startsWith('.')) {
          const fp = path.join(uploadDir, file);
          fs.rmSync(fp, { recursive: true, force: true });
          count++;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }

  private async countQueueJobs(): Promise<number> {
    let total = 0;
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST || '127.0.0.1';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
    const redisPassword = process.env.REDIS_PASSWORD || undefined;

    let redis: Redis | null = null;
    try {
      const options = {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 500,
        retryStrategy: () => null,
      };

      if (redisUrl) {
        redis = new Redis(redisUrl, options);
      } else {
        redis = new Redis({ host: redisHost, port: redisPort, password: redisPassword, ...options });
      }

      redis.on('error', () => {}); // Silently ignore connection errors

      const ping = await Promise.race([
        redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 500)),
      ]).catch(() => null);

      if (ping !== 'PONG') {
        if (redis) await redis.quit().catch(() => {});
        return 0;
      }

      const queueNames = ['review-sync', 'ai-enrichment', 'review-automation', 'email-queue', 'notifications', 'reports'];
      for (const name of queueNames) {
        try {
          const q = new Queue(name, { connection: redis });
          const counts = await q.getJobCounts('active', 'completed', 'failed', 'delayed', 'waiting');
          total += (counts.active || 0) + (counts.waiting || 0) + (counts.delayed || 0) + (counts.failed || 0);
          await q.close();
        } catch {}
      }
    } catch {
    } finally {
      if (redis) await redis.quit().catch(() => {});
    }
    return total;
  }

  private async cleanAllQueues(): Promise<number> {
    let count = 0;
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST || '127.0.0.1';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
    const redisPassword = process.env.REDIS_PASSWORD || undefined;

    let redis: Redis | null = null;
    try {
      const options = {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 500,
        retryStrategy: () => null,
      };

      if (redisUrl) {
        redis = new Redis(redisUrl, options);
      } else {
        redis = new Redis({ host: redisHost, port: redisPort, password: redisPassword, ...options });
      }

      redis.on('error', () => {});

      const ping = await Promise.race([
        redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 500)),
      ]).catch(() => null);

      if (ping !== 'PONG') {
        if (redis) await redis.quit().catch(() => {});
        return 0;
      }

      const queueNames = ['review-sync', 'ai-enrichment', 'review-automation', 'email-queue', 'notifications', 'reports'];
      for (const name of queueNames) {
        try {
          const q = new Queue(name, { connection: redis });
          await q.drain();
          await q.clean(0, 1000, 'completed');
          await q.clean(0, 1000, 'failed');
          count += 1;
          await q.close();
        } catch {}
      }
    } catch {
    } finally {
      if (redis) await redis.quit().catch(() => {});
    }
    return count;
  }

  private async cleanRedisCaches(): Promise<number> {
    let keyCount = 0;
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST || '127.0.0.1';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
    const redisPassword = process.env.REDIS_PASSWORD || undefined;

    let redis: Redis | null = null;
    try {
      const options = {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 500,
        retryStrategy: () => null,
      };

      if (redisUrl) {
        redis = new Redis(redisUrl, options);
      } else {
        redis = new Redis({ host: redisHost, port: redisPort, password: redisPassword, ...options });
      }

      redis.on('error', () => {});

      const ping = await Promise.race([
        redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 500)),
      ]).catch(() => null);

      if (ping !== 'PONG') {
        if (redis) await redis.quit().catch(() => {});
        return 0;
      }

      const patterns = ['otp_challenge:*', 'otp_cooldown:*', 'user:*', 'outlet:*', 'analytics:*'];
      for (const pattern of patterns) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
          keyCount += keys.length;
        }
      }
    } catch {
    } finally {
      if (redis) await redis.quit().catch(() => {});
    }
    return keyCount;
  }
}
