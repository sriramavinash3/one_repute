import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ReviewSyncService, SyncResult } from './review-sync.service';

@Injectable()
export class ReviewSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReviewSchedulerService.name);
  private hourlyTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private readonly reviewSyncService: ReviewSyncService) {}

  onModuleInit() {
    this.startHourlySync();
    this.logger.log('Review scheduler started (hourly sync enabled)');
  }

  onModuleDestroy() {
    this.stopHourlySync();
  }

  private startHourlySync() {
    // Run once immediately on startup, then every 60 minutes
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
      this.logger.warn('[Scheduler] Previous sync cycle still running, skipping.');
      return;
    }

    this.isRunning = true;
    this.logger.log('[Scheduler] Starting hourly review sync cycle...');
    try {
      const results = await this.reviewSyncService.syncAllOutlets({ skipCooldown: false });
      const succeeded = results.filter((r) => r.status === 'success').length;
      const skipped = results.filter((r) => r.status === 'skipped').length;
      const failed = results.filter((r) => r.status === 'error').length;
      this.logger.log(`[Scheduler] Sync cycle complete: ${succeeded} synced, ${skipped} skipped, ${failed} failed`);
    } catch (err: any) {
      this.logger.error(`[Scheduler] Sync cycle failed: ${err.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  /** Trigger an immediate forced sync for a specific outlet (e.g. on onboarding) */
  async triggerImmediateSync(outletId: string): Promise<SyncResult> {
    this.logger.log(`[Scheduler] Triggering immediate sync for outlet: ${outletId}`);
    return this.reviewSyncService.syncSingleOutlet(outletId, { skipCooldown: true });
  }

  /** Trigger a full sync cycle across all outlets (e.g. admin manual trigger) */
  async triggerFullSync(): Promise<SyncResult[]> {
    this.logger.log('[Scheduler] Triggering manual full sync...');
    return this.reviewSyncService.syncAllOutlets({ skipCooldown: true });
  }
}
