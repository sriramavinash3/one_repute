import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { ReviewSyncService } from './review-sync.service';
import { ReviewQueueService } from './queues/review-queue.service';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class ReviewSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReviewSchedulerService.name);
  private hourlyTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly reviewSyncService: ReviewSyncService,
    private readonly firebaseService: FirebaseService,
    @Inject(forwardRef(() => ReviewQueueService))
    private readonly reviewQueueService: ReviewQueueService,
  ) {}

  onModuleInit() {
    this.startHourlySync();
    this.logger.log('Review scheduler started (hourly queue dispatch enabled)');
  }

  onModuleDestroy() {
    this.stopHourlySync();
  }

  private startHourlySync() {
    this.runSyncCycle();
    this.hourlyTimer = setInterval(() => {
      this.runSyncCycle();
    }, 60 * 60 * 1000);
  }

  private stopHourlySync() {
    if (this.hourlyTimer) {
      clearInterval(this.hourlyTimer);
      this.hourlyTimer = null;
      this.logger.log('Review scheduler stopped');
    }
  }

  private async runSyncCycle() {
    if (this.isRunning) {
      this.logger.warn('[Scheduler] Previous sync dispatch cycle still running, skipping.');
      return;
    }

    this.isRunning = true;
    this.logger.log('[Scheduler] Dispatching hourly review sync jobs to queue...');
    try {
      const db = this.firebaseService.getDb();
      const snap = await db.collection('outlets').where('status', '==', 'active').get();
      const outlets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      let dispatched = 0;
      for (const outlet of outlets as any[]) {
        if (outlet.status === 'removed' || outlet.isDeleted === true) continue;
        await this.reviewQueueService.createOrGetActiveSyncJob(outlet.id, false, 'scheduler');
        dispatched++;
      }
      this.logger.log(`[Scheduler] Hourly sync dispatch complete: enqueued jobs for ${dispatched} active outlets`);
    } catch (err: any) {
      this.logger.error(`[Scheduler] Sync dispatch failed: ${err.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  /** Trigger an immediate forced sync for a specific outlet */
  async triggerImmediateSync(outletId: string): Promise<any> {
    this.logger.log(`[Scheduler] Triggering immediate sync job for outlet: ${outletId}`);
    return this.reviewQueueService.createOrGetActiveSyncJob(outletId, true, 'manual');
  }

  /** Trigger a full sync cycle across all outlets */
  async triggerFullSync(): Promise<any[]> {
    this.logger.log('[Scheduler] Triggering full sync dispatch across all active outlets...');
    const db = this.firebaseService.getDb();
    const snap = await db.collection('outlets').where('status', '==', 'active').get();
    const outlets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const results: any[] = [];
    for (const outlet of outlets as any[]) {
      if (outlet.status === 'removed' || outlet.isDeleted === true) continue;
      const res = await this.reviewQueueService.createOrGetActiveSyncJob(outlet.id, true, 'manual');
      results.push(res.status);
    }
    return results;
  }
}
