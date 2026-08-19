/**
 * src/modules/reviews/queues/review-worker.service.ts
 *
 * BullMQ Worker handlers for review ingestion, AI enrichment, and automation execution.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { loadEmailConfig } from '../../../config/email.config';
import { ReviewSyncService } from '../review-sync.service';
import { AutomationService } from '../../workflow/automation.service';
import { ReviewQueueService } from './review-queue.service';
import {
  ReviewJobType,
  SyncOutletJobPayload,
  EnrichAIJobPayload,
  RunAutomationJobPayload,
} from './review-job.types';

@Injectable()
export class ReviewWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReviewWorkerService.name);
  private syncWorker: Worker | null = null;
  private enrichWorker: Worker | null = null;
  private automationWorker: Worker | null = null;
  private redisClient: Redis | null = null;

  constructor(
    @Inject(forwardRef(() => ReviewSyncService))
    private readonly reviewSyncService: ReviewSyncService,
    private readonly automationService: AutomationService,
    private readonly reviewQueueService: ReviewQueueService,
  ) {}

  async onModuleInit() {
    const config = loadEmailConfig();
    try {
      const options = {
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
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
        this.logger.log('[ReviewWorker] Workers connected to Redis');
        this.initWorkers();
      });

      this.redisClient.on('error', (err) => {
        // Log errors softly
      });
    } catch (err: any) {
      this.logger.warn(`[ReviewWorker] Could not connect to Redis: ${err.message}. Workers offline.`);
    }
  }

  private initWorkers() {
    if (!this.redisClient) return;

    // 1. Sync Ingestion Worker (Concurrency: 5)
    this.syncWorker = new Worker(
      'review-sync',
      async (job: Job<SyncOutletJobPayload>) => {
        this.logger.log(`[ReviewWorker] Processing Sync Job ${job.data.jobId} for outlet ${job.data.outletId}`);
        await this.reviewSyncService.executeSyncJob(job.data);
      },
      { connection: this.redisClient, concurrency: 5 },
    );

    // 2. AI Enrichment Worker (Concurrency: 10)
    this.enrichWorker = new Worker(
      'ai-enrichment',
      async (job: Job<EnrichAIJobPayload>) => {
        this.logger.debug(`[ReviewWorker] Processing AI Enrichment for review ${job.data.reviewId}`);
        await this.automationService.enrichReviewWithAI(job.data);
        await this.reviewQueueService.updateJobStatus(job.data.jobId, {
          enrichedCount: (await this.reviewQueueService.getJobStatus(job.data.jobId))?.enrichedCount! + 1 || 1,
        });
      },
      { connection: this.redisClient, concurrency: 10 },
    );

    // 3. Automation Worker (Concurrency: 10)
    this.automationWorker = new Worker(
      'review-automation',
      async (job: Job<RunAutomationJobPayload>) => {
        this.logger.debug(`[ReviewWorker] Processing Automation for review ${job.data.reviewId}`);
        await this.automationService.runReviewAutomations(job.data);
      },
      { connection: this.redisClient, concurrency: 10 },
    );

    this.syncWorker.on('failed', (job, err) => {
      this.logger.error(`[ReviewWorker] Sync Job ${job?.id} failed: ${err.message}`);
      if (job?.data?.jobId) {
        this.reviewQueueService.updateJobStatus(job.data.jobId, {
          status: 'FAILED',
          stage: 'FAILED',
          error: err.message,
        });
      }
    });
  }

  async onModuleDestroy() {
    if (this.syncWorker) await this.syncWorker.close();
    if (this.enrichWorker) await this.enrichWorker.close();
    if (this.automationWorker) await this.automationWorker.close();
    if (this.redisClient) await this.redisClient.quit();
  }
}
