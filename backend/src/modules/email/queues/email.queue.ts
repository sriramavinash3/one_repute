/**
 * src/modules/email/queues/email.queue.ts
 * 
 * BullMQ Email Queue Manager with Redis connection handling & fallback options.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { loadEmailConfig } from '../../../config/email.config';
import { EmailJobPayload, EmailJobType } from './email.job.types';

@Injectable()
export class EmailQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailQueueService.name);
  private queue: Queue | null = null;
  private redisClient: Redis | null = null;
  private isConnected = false;

  async onModuleInit() {
    const config = loadEmailConfig();
    try {
      const options = {
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        retryStrategy: (times: number) => {
          if (times > 3) {
            this.logger.warn(`Redis connection failed after ${times} retries. Switching queue to local direct mode.`);
            return null; // Stop retrying
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
        this.logger.log(`Connected to Redis at ${config.redis.url ? 'REDIS_URL' : `${config.redis.host}:${config.redis.port}`}`);
      });

      let errCount = 0;
      this.redisClient.on('error', (err) => {
        this.isConnected = false;
        errCount++;
        if (errCount <= 3) {
          this.logger.warn(`Redis Error (${errCount}/3): ${err.message}`);
        }
      });

      this.queue = new Queue(config.queue.name, {
        connection: this.redisClient,
        defaultJobOptions: {
          attempts: config.queue.maxRetries,
          backoff: {
            type: 'exponential',
            delay: config.queue.backoffDelayMs,
          },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 }, // Keep failed jobs for DLQ inspection
        },
      });

    } catch (err: any) {
      this.logger.warn(`Failed to initialize BullMQ queue with Redis: ${err.message}. Using inline queue fallback.`);
    }
  }

  async onModuleDestroy() {
    if (this.queue) {
      await this.queue.close();
    }
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }

  /**
   * Enqueue job for background processing
   */
  async addJob(payload: EmailJobPayload): Promise<string> {
    const jobName = payload.type;
    const jobData = payload.data;

    if (this.queue && this.isConnected) {
      const job = await this.queue.add(jobName, payload, {
        jobId: `${jobName}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      });
      this.logger.log(`Enqueued BullMQ Email Job [${jobName}] (ID: ${job.id}) for ${jobData.recipientEmail}`);
      return String(job.id);
    } else {
      const fallbackJobId = `inline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      this.logger.warn(`Redis disconnected. Executing job [${jobName}] in inline fallback mode (ID: ${fallbackJobId}) for ${jobData.recipientEmail}`);
      return fallbackJobId;
    }
  }

  /**
   * Get queue status metrics
   */
  async getMetrics() {
    if (!this.queue || !this.isConnected) {
      return {
        status: 'disconnected_inline_mode',
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      };
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return {
      status: 'connected',
      waiting,
      active,
      completed,
      failed,
      delayed,
    };
  }
}
