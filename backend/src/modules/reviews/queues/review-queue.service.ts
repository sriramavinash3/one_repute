/**
 * src/modules/reviews/queues/review-queue.service.ts
 *
 * BullMQ Queue Manager for Review Processing Pipeline with Redis connection handling,
 * request coalescing, job state persistence, and inline fallback options.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEmailConfig } from '../../../config/email.config';
import { FirebaseService } from '../../firebase/firebase.service';
import { CacheService } from '../../cache/cache.service';
import {
  ReviewJobType,
  SyncJobStage,
  SyncJobStatus,
  SyncOutletJobPayload,
  EnrichAIJobPayload,
  RunAutomationJobPayload,
} from './review-job.types';

@Injectable()
export class ReviewQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReviewQueueService.name);
  private syncQueue: Queue | null = null;
  private enrichQueue: Queue | null = null;
  private automationQueue: Queue | null = null;
  private redisClient: Redis | null = null;
  private isConnected = false;

  // In-memory fallback job store for fast lookup and inline execution mode
  private readonly activeOutletJobs = new Map<string, string>(); // outletId -> jobId
  private readonly jobStore = new Map<string, SyncJobStatus>();

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly cacheService?: CacheService,
  ) {}

  async onModuleInit() {
    const config = loadEmailConfig();
    try {
      const options = {
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        retryStrategy: (times: number) => {
          if (times > 3) {
            this.logger.warn(`[ReviewQueue] Redis connection failed after ${times} retries. Falling back to inline queue mode.`);
            return null;
          }
          return Math.min(times * 500, 2000);
        },
      };

      if (config.redis.url) {
        this.redisClient = new Redis(config.redis.url, options);
      } else {
        this.redisClient = new Redis({
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          ...options,
        });
      }

      this.redisClient.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`[ReviewQueue] Connected to Redis`);
      });

      let errCount = 0;
      this.redisClient.on('error', (err) => {
        this.isConnected = false;
        errCount++;
        if (errCount <= 3) {
          this.logger.warn(`[ReviewQueue] Redis error (${errCount}/3): ${err.message}`);
        }
      });

      const defaultJobOptions = {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      };

      this.syncQueue = new Queue('review-sync', { connection: this.redisClient, defaultJobOptions });
      this.enrichQueue = new Queue('ai-enrichment', { connection: this.redisClient, defaultJobOptions });
      this.automationQueue = new Queue('review-automation', { connection: this.redisClient, defaultJobOptions });

    } catch (err: any) {
      this.logger.warn(`[ReviewQueue] Failed to initialize BullMQ with Redis: ${err.message}. Using inline queue mode.`);
    }
  }

  async onModuleDestroy() {
    if (this.syncQueue) await this.syncQueue.close();
    if (this.enrichQueue) await this.enrichQueue.close();
    if (this.automationQueue) await this.automationQueue.close();
    if (this.redisClient) await this.redisClient.quit();
  }

  /**
   * Request Coalescing: Check if an active sync job is already running for the outlet.
   * If yes, return the existing status. Otherwise, register a new job.
   */
  async createOrGetActiveSyncJob(outletId: string, skipCooldown = false, triggerSource: 'manual' | 'scheduler' | 'onboarding' | 'retry' = 'manual'): Promise<{ status: SyncJobStatus; isNew: boolean }> {
    const existingJobId = this.activeOutletJobs.get(outletId);
    if (existingJobId) {
      const existingStatus = await this.getJobStatus(existingJobId);
      if (existingStatus && ['QUEUED', 'FETCHING', 'PERSISTING', 'ENRICHING'].includes(existingStatus.status)) {
        this.logger.log(`[ReviewQueue] Coalescing sync request for outlet ${outletId} into active job ${existingJobId}`);
        return { status: existingStatus, isNew: false };
      }
    }

    const jobId = `sync_${outletId}_${Date.now()}`;
    const nowIso = new Date().toISOString();
    const initialStatus: SyncJobStatus = {
      jobId,
      outletId,
      status: 'QUEUED',
      stage: 'QUEUED',
      fetchedCount: 0,
      newCount: 0,
      processedCount: 0,
      enrichedCount: 0,
      error: null,
      startedAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
    };

    this.jobStore.set(jobId, initialStatus);
    this.activeOutletJobs.set(outletId, jobId);

    // Persist job metadata asynchronously to Firestore for resilience across restarts
    this.persistJobStatusToDb(initialStatus).catch(() => {});

    // Enqueue to BullMQ if Redis connected
    const payload: SyncOutletJobPayload = { jobId, outletId, skipCooldown, triggerSource };
    if (this.syncQueue && this.isConnected) {
      await this.syncQueue.add(ReviewJobType.SYNC_OUTLET, payload, { jobId });
      this.logger.log(`[ReviewQueue] Enqueued SyncJob [${jobId}] to BullMQ`);
    } else {
      this.logger.log(`[ReviewQueue] Inline mode active for SyncJob [${jobId}]`);
    }

    return { status: initialStatus, isNew: true };
  }

  /**
   * Update state of a job across memory, Redis cache, and Firestore.
   */
  async updateJobStatus(jobId: string, update: Partial<SyncJobStatus>): Promise<SyncJobStatus | null> {
    const current = this.jobStore.get(jobId) || (await this.getJobStatusFromDb(jobId));
    if (!current) return null;

    const updated: SyncJobStatus = {
      ...current,
      ...update,
      updatedAt: new Date().toISOString(),
    };

    if (['COMPLETED', 'FAILED', 'SKIPPED'].includes(updated.status)) {
      updated.completedAt = updated.completedAt || new Date().toISOString();
      if (this.activeOutletJobs.get(updated.outletId) === jobId) {
        this.activeOutletJobs.delete(updated.outletId);
      }
    }

    this.jobStore.set(jobId, updated);
    this.persistJobStatusToDb(updated).catch(() => {});
    return updated;
  }

  /**
   * Get current job status by jobId or outletId.
   */
  async getJobStatus(jobIdOrOutletId: string): Promise<SyncJobStatus | null> {
    // 1. Direct jobId match in memory
    if (this.jobStore.has(jobIdOrOutletId)) {
      return this.jobStore.get(jobIdOrOutletId)!;
    }

    // 2. Active outlet lookup
    const activeJobId = this.activeOutletJobs.get(jobIdOrOutletId);
    if (activeJobId && this.jobStore.has(activeJobId)) {
      return this.jobStore.get(activeJobId)!;
    }

    // 3. Fallback: Firestore database lookup
    return this.getJobStatusFromDb(jobIdOrOutletId);
  }

  /**
   * Enqueue AI Enrichment job
   */
  async addEnrichAIJob(payload: EnrichAIJobPayload): Promise<void> {
    if (this.enrichQueue && this.isConnected) {
      await this.enrichQueue.add(ReviewJobType.ENRICH_AI, payload, {
        jobId: `enrich_${payload.reviewId}`,
      });
    }
  }

  /**
   * Enqueue Automation job
   */
  async addAutomationJob(payload: RunAutomationJobPayload): Promise<void> {
    if (this.automationQueue && this.isConnected) {
      await this.automationQueue.add(ReviewJobType.RUN_AUTOMATION, payload, {
        jobId: `auto_${payload.reviewId}`,
      });
    }
  }

  public isRedisConnected(): boolean {
    return this.isConnected;
  }

  private async persistJobStatusToDb(status: SyncJobStatus): Promise<void> {
    try {
      const db = this.firebaseService.getDb();
      await db.collection('syncJobs').doc(status.jobId).set(status, { merge: true });
    } catch {}
  }

  private async getJobStatusFromDb(jobIdOrOutletId: string): Promise<SyncJobStatus | null> {
    try {
      const db = this.firebaseService.getDb();
      let docSnap = await db.collection('syncJobs').doc(jobIdOrOutletId).get();
      if (!docSnap.exists) {
        // Query latest by outletId
        const q = await db.collection('syncJobs')
          .where('outletId', '==', jobIdOrOutletId)
          .orderBy('startedAt', 'desc')
          .limit(1)
          .get();
        if (!q.empty) {
          docSnap = q.docs[0];
        }
      }
      if (docSnap.exists) {
        return docSnap.data() as SyncJobStatus;
      }
    } catch {}
    return null;
  }
}
