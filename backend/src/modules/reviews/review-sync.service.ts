/**
 * src/modules/reviews/review-sync.service.ts
 *
 * High-performance, set-oriented review synchronization engine.
 * Decouples ingestion from AI enrichment, batches Firestore & PostgreSQL writes,
 * and tracks granular job progress via ReviewQueueService.
 */

import { Injectable, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import { GoogleBusinessService } from '../google-business/google-business.service';
import { AutomationService } from '../workflow/automation.service';
import { ReviewQueueService } from './queues/review-queue.service';
import { SyncOutletJobPayload, SyncResult } from './queues/review-job.types';

export { SyncResult };

interface SyncOptions {
  skipCooldown?: boolean;
  skipDeduplication?: boolean;
}

@Injectable()
export class ReviewSyncService {
  private readonly logger = new Logger(ReviewSyncService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly firebaseService: FirebaseService,
    private readonly googleBusinessService: GoogleBusinessService,
    private readonly automationService: AutomationService,
    @Optional()
    @Inject(forwardRef(() => ReviewQueueService))
    private readonly reviewQueueService?: ReviewQueueService,
  ) {}

  private computeReviewHash(data: {
    placeId?: string;
    customerName: string;
    text: string;
    rating: number;
    reviewTimestamp: string;
  }): string {
    const crypto = require('crypto');
    const str = `${data.placeId || ''}|${data.customerName}|${data.rating}|${(data.text || '').slice(0, 200)}|${data.reviewTimestamp || ''}`;
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  private normalizeRating(starRating: any): number {
    const ratingMap: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
    if (typeof starRating === 'number') return starRating;
    return ratingMap[starRating] ?? 0;
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * Execute sync job asynchronously (Invoked by Worker or Queue Manager)
   */
  async executeSyncJob(payload: SyncOutletJobPayload): Promise<SyncResult> {
    const { jobId, outletId, skipCooldown = false } = payload;
    const db = this.firebaseService.getDb();

    // 1. Fetch Outlet Metadata
    const snap = await db.collection('outlets').doc(outletId).get();
    if (!snap.exists) {
      const err = 'Outlet not found';
      if (this.reviewQueueService) {
        await this.reviewQueueService.updateJobStatus(jobId, { status: 'FAILED', stage: 'FAILED', error: err });
      }
      return { outletId, outletName: '', fetched: 0, new: 0, processed: 0, status: 'error', error: err };
    }

    const outlet = { id: snap.id, ...snap.data() } as any;
    if (outlet.status === 'removed' || outlet.isDeleted === true || outlet.status === 'deleted') {
      const err = 'Outlet has been removed';
      if (this.reviewQueueService) {
        await this.reviewQueueService.updateJobStatus(jobId, { status: 'SKIPPED', stage: 'SKIPPED', error: err });
      }
      return { outletId, outletName: outlet.name || '', fetched: 0, new: 0, processed: 0, status: 'error', error: err };
    }

    // 2. Cooldown Guard
    if (!skipCooldown) {
      const cooldownMinutes = Number(outlet.syncCooldownMinutes || 180);
      const lastFetchAt = this.toDate(outlet.lastReviewFetchAt);
      if (lastFetchAt) {
        const elapsedMs = Date.now() - lastFetchAt.getTime();
        if (elapsedMs < cooldownMinutes * 60 * 1000) {
          this.logger.debug(`[Sync] Cooldown active for outlet ${outletId}, skipping.`);
          if (this.reviewQueueService) {
            await this.reviewQueueService.updateJobStatus(jobId, { status: 'SKIPPED', stage: 'SKIPPED' });
          }
          return { outletId, outletName: outlet.name, fetched: 0, new: 0, processed: 0, status: 'skipped' };
        }
      }
    }

    // 3. Credentials Guard
    const targetLocationId = outlet.googleLocationId || outlet.googleActiveLocation || (Array.isArray(outlet.googleLocations) && outlet.googleLocations[0]?.id) || null;

    if (outlet.googleTokenInvalid === true || outlet.googleConnectionStatus === 'invalid_grant' || !outlet.googleAccountId || !targetLocationId || !outlet.googleRefreshToken) {
      const err = 'Google authorization invalid or missing credentials';
      if (this.reviewQueueService) {
        await this.reviewQueueService.updateJobStatus(jobId, { status: 'FAILED', stage: 'FAILED', error: err });
      }
      return { outletId, outletName: outlet.name, fetched: 0, new: 0, processed: 0, status: 'error', error: err };
    }

    // 4. Update Job State to FETCHING
    if (this.reviewQueueService) {
      await this.reviewQueueService.updateJobStatus(jobId, { status: 'FETCHING', stage: 'FETCHING' });
    }

    let rawReviews: any[] = [];
    try {
      rawReviews = await this.googleBusinessService.fetchReviews(
        outlet.googleAccountId,
        targetLocationId,
        outlet.googleRefreshToken,
      );
    } catch (err: any) {
      this.logger.error(`[Sync] Google fetchReviews error for ${outletId}: ${err.message}`);
      if (this.reviewQueueService) {
        await this.reviewQueueService.updateJobStatus(jobId, { status: 'FAILED', stage: 'FAILED', error: err.message });
      }
      await this.writeSyncHistory(outletId, 0, 0, 0, 'error', err.message);
      return { outletId, outletName: outlet.name, fetched: 0, new: 0, processed: 0, status: 'error', error: err.message };
    }

    const fetchedCount = rawReviews.length;
    if (this.reviewQueueService) {
      await this.reviewQueueService.updateJobStatus(jobId, {
        fetchedCount,
        status: 'PERSISTING',
        stage: 'PERSISTING',
      });
    }

    const knownHashes = new Set<string>(Array.isArray(outlet.fetchedReviewHashes) ? outlet.fetchedReviewHashes : []);
    const isFirstOnboardingSync = !outlet.onboardingCompletedAt;

    // Sort raw reviews by timestamp descending
    rawReviews.sort((a, b) => {
      const timeA = new Date(a.updateTime || a.createTime || 0).getTime();
      const timeB = new Date(b.updateTime || b.createTime || 0).getTime();
      return timeB - timeA;
    });

    let newCount = 0;
    let latestReviewTimestamp: Date | null = this.toDate(outlet.latestReviewTimestamp);
    let unrespondedOnboardingCount = 0;

    const firestoreDocsToCreate: { id: string; payload: any }[] = [];
    const prismaRecordsToUpsert: any[] = [];
    const downstreamJobsToDispatch: { reviewId: string; rating: number; reviewText: string; customerName: string; shouldAI: boolean; isImported: boolean }[] = [];

    // 5. Transform Reviews for Bulk Ingestion
    for (const raw of rawReviews) {
      const reviewTimestamp = raw.updateTime || raw.createTime || null;
      const rating = this.normalizeRating(raw.starRating);
      const customerName = raw.reviewer?.displayName || 'Anonymous';
      const text = raw.comment || '';
      const placeId = outlet.placeId || null;
      const providerReviewId = raw.reviewId || raw.name || null;
      const rawName = raw.name || null;
      const hasExistingGmbReply = Boolean(raw.reviewReply?.comment);
      const gmbReplyText = raw.reviewReply?.comment || null;
      const gmbReplyTime = raw.reviewReply?.updateTime ? new Date(raw.reviewReply.updateTime) : null;

      const reviewHash = this.computeReviewHash({ placeId, customerName, text, rating, reviewTimestamp });
      if (knownHashes.has(reviewHash)) continue;

      const parsedTimestamp = reviewTimestamp ? new Date(reviewTimestamp) : new Date();

      let initialStatus = 'pending';
      let aiResponseValue: string | null = null;
      let shouldGenerateAI = false;

      if (isFirstOnboardingSync) {
        if (hasExistingGmbReply) {
          initialStatus = 'responded';
          aiResponseValue = gmbReplyText;
          shouldGenerateAI = false;
        } else {
          unrespondedOnboardingCount++;
          if (unrespondedOnboardingCount <= 10) {
            initialStatus = 'pending';
            shouldGenerateAI = true;
          } else {
            initialStatus = 'imported';
            aiResponseValue = null;
            shouldGenerateAI = false;
          }
        }
      } else {
        initialStatus = 'pending';
        shouldGenerateAI = true;
      }

      const reviewPayload: any = {
        reviewId: reviewHash,
        outletId: outlet.id,
        placeId,
        providerSource: 'GBP',
        providerReviewId,
        reviewTimestamp: parsedTimestamp,
        customerName,
        rating,
        text,
        rawName,
        status: initialStatus,
        isImported: isFirstOnboardingSync,
        isOnboarding: isFirstOnboardingSync,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        aiResponse: aiResponseValue,
        replySuggestion: aiResponseValue,
        ...(hasExistingGmbReply ? { repliedAt: gmbReplyTime || parsedTimestamp } : {}),
      };

      firestoreDocsToCreate.push({ id: reviewHash, payload: reviewPayload });

      if (process.env.DATABASE_URL) {
        prismaRecordsToUpsert.push({
          id: reviewHash,
          reviewId: reviewHash,
          outletId: outlet.id,
          placeId,
          providerSource: 'GBP',
          providerReviewId: providerReviewId || reviewHash,
          reviewTimestamp: parsedTimestamp,
          customerName,
          rating,
          text,
          rawName,
          status: initialStatus,
          isImported: isFirstOnboardingSync,
          isOnboarding: isFirstOnboardingSync,
          aiResponse: aiResponseValue,
          replySuggestion: aiResponseValue,
          ...(hasExistingGmbReply ? { repliedAt: gmbReplyTime || parsedTimestamp } : {}),
        });
      }

      knownHashes.add(reviewHash);
      newCount++;

      if (!latestReviewTimestamp || parsedTimestamp > latestReviewTimestamp) {
        latestReviewTimestamp = parsedTimestamp;
      }

      downstreamJobsToDispatch.push({
        reviewId: reviewHash,
        rating,
        reviewText: text,
        customerName,
        shouldAI: shouldGenerateAI,
        isImported: isFirstOnboardingSync,
      });
    }

    // 6. Set-Oriented Batch Write into Firestore (db.batch() in chunks of 100)
    const chunkSize = 100;
    for (let i = 0; i < firestoreDocsToCreate.length; i += chunkSize) {
      const chunk = firestoreDocsToCreate.slice(i, i + chunkSize);
      const batch = db.batch();
      for (const item of chunk) {
        const docRef = db.collection('reviews').doc(item.id);
        batch.set(docRef, item.payload, { merge: true });
      }
      try {
        await batch.commit();
      } catch (batchErr: any) {
        this.logger.error(`[Sync] Firestore batch commit error: ${batchErr.message}`);
      }
    }

    // 7. Set-Oriented Batch Upsert into PostgreSQL via Prisma
    if (process.env.DATABASE_URL && prismaRecordsToUpsert.length > 0) {
      try {
        // Execute bounded parallel upserts in chunks of 20 to avoid database connection exhaustion
        const prismaChunkSize = 20;
        for (let i = 0; i < prismaRecordsToUpsert.length; i += prismaChunkSize) {
          const chunk = prismaRecordsToUpsert.slice(i, i + prismaChunkSize);
          await Promise.all(
            chunk.map((rec) =>
              this.prismaService.review.upsert({
                where: { reviewId: rec.reviewId },
                create: rec,
                update: {},
              }).catch((e) => this.logger.warn(`Prisma upsert warning for ${rec.reviewId}: ${e.message}`))
            )
          );
        }
      } catch (pgErr: any) {
        this.logger.error(`[Sync] PostgreSQL bulk upsert error: ${pgErr.message}`);
      }
    }

    // Core Ingestion Complete! Core data is now persisted and visible in dashboard.
    if (this.reviewQueueService) {
      await this.reviewQueueService.updateJobStatus(jobId, {
        newCount,
        processedCount: newCount,
        status: 'ENRICHING',
        stage: 'ENRICHING',
      });
    }

    // 8. Decoupled AI & Automation Dispatch
    for (const jobItem of downstreamJobsToDispatch) {
      if (this.reviewQueueService && this.reviewQueueService.isRedisConnected()) {
        // Enqueue to BullMQ for asynchronous worker processing
        if (jobItem.shouldAI) {
          await this.reviewQueueService.addEnrichAIJob({
            jobId,
            reviewId: jobItem.reviewId,
            outletId: outlet.id,
            outletName: outlet.name || 'Business',
            rating: jobItem.rating,
            reviewText: jobItem.reviewText,
            customerName: jobItem.customerName,
            isFirstOnboardingSync,
          });
        }
        await this.reviewQueueService.addAutomationJob({
          jobId,
          reviewId: jobItem.reviewId,
          outletId: outlet.id,
          outletName: outlet.name || 'Business',
          rating: jobItem.rating,
          reviewText: jobItem.reviewText,
          customerName: jobItem.customerName,
          managerPhone: outlet.managerPhone || outlet.whatsappNumber,
          managerEmail: outlet.email,
          isImported: jobItem.isImported,
        });
      } else {
        // Fallback: Inline processing if Redis is unavailable
        if (jobItem.shouldAI) {
          this.automationService.enrichReviewWithAI({
            reviewId: jobItem.reviewId,
            outletId: outlet.id,
            outletName: outlet.name || 'Business',
            rating: jobItem.rating,
            reviewText: jobItem.reviewText,
            customerName: jobItem.customerName,
          }).catch((err) => this.logger.error(`[Inline AI] Failed for ${jobItem.reviewId}: ${err.message}`));
        }
        this.automationService.runReviewAutomations({
          reviewId: jobItem.reviewId,
          outletId: outlet.id,
          outletName: outlet.name || 'Business',
          rating: jobItem.rating,
          reviewText: jobItem.reviewText,
          customerName: jobItem.customerName,
          managerPhone: outlet.managerPhone || outlet.whatsappNumber,
          managerEmail: outlet.email,
          isImported: jobItem.isImported,
        }).catch((err) => this.logger.error(`[Inline Automation] Failed for ${jobItem.reviewId}: ${err.message}`));
      }
    }

    // 9. Update Outlet Sync State & Onboarding Metadata
    const updateState: any = {
      lastReviewFetchAt: new Date(),
      latestReviewTimestamp: latestReviewTimestamp || null,
      fetchedReviewHashes: Array.from(knownHashes).slice(-500),
    };

    if (isFirstOnboardingSync) {
      updateState.onboardingCompletedAt = new Date();
      updateState.onboardingReviewCount = fetchedCount;
      updateState.onboardingBaselineTimestamp = new Date();
    }

    await db.collection('outlets').doc(outlet.id).update(updateState);
    await this.writeSyncHistory(outlet.id, fetchedCount, newCount, newCount, 'success');

    if (this.reviewQueueService) {
      await this.reviewQueueService.updateJobStatus(jobId, {
        status: 'COMPLETED',
        stage: 'COMPLETED',
      });
    }

    this.logger.log(`[Sync] Outlet ${outlet.id} complete: fetched=${fetchedCount}, new=${newCount}`);
    return { outletId: outlet.id, outletName: outlet.name, fetched: fetchedCount, new: newCount, processed: newCount, status: 'success' };
  }

  /**
   * Sync single outlet entry point (Dispatches to ReviewQueueService or executes async)
   */
  async syncSingleOutlet(outletId: string, options: SyncOptions = {}): Promise<SyncResult> {
    if (this.reviewQueueService) {
      const { status } = await this.reviewQueueService.createOrGetActiveSyncJob(outletId, options.skipCooldown, 'manual');
      // If Redis is connected, the worker executes the job in background.
      // If Redis is not connected, run execution synchronously as fallback.
      if (!this.reviewQueueService.isRedisConnected()) {
        return this.executeSyncJob({ jobId: status.jobId, outletId, skipCooldown: options.skipCooldown });
      }
      return {
        outletId,
        outletName: '',
        fetched: status.fetchedCount,
        new: status.newCount,
        processed: status.processedCount,
        status: 'success',
      };
    }
    return this.executeSyncJob({ jobId: `sync_${outletId}_${Date.now()}`, outletId, skipCooldown: options.skipCooldown });
  }

  /**
   * Sync all active outlets (Dispatches concurrent jobs to queue)
   */
  async syncAllOutlets(options: SyncOptions = {}): Promise<SyncResult[]> {
    const db = this.firebaseService.getDb();
    const snap = await db.collection('outlets').where('status', '==', 'active').get();
    const outlets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const results: SyncResult[] = [];
    for (const outlet of outlets as any[]) {
      const res = await this.syncSingleOutlet(outlet.id, options);
      results.push(res);
    }
    return results;
  }

  private async writeSyncHistory(
    outletId: string,
    fetched: number,
    newCount: number,
    processed: number,
    status: string,
    errorMessage?: string,
  ) {
    if (!process.env.DATABASE_URL) return;
    try {
      await this.prismaService.syncHistory.create({
        data: {
          outletId,
          fetchedCount: fetched,
          newCount,
          processedCount: processed,
          status,
          errorMessage: errorMessage || null,
        },
      });
    } catch (err: any) {
      this.logger.error(`[Sync] Failed to write SyncHistory: ${err.message}`);
    }
  }
}
