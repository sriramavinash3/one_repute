import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import { GoogleBusinessService } from '../google-business/google-business.service';

interface SyncOptions {
  skipCooldown?: boolean;
  skipDeduplication?: boolean;
}

export interface SyncResult {
  outletId: string;
  outletName: string;
  fetched: number;
  new: number;
  processed: number;
  status: 'success' | 'error' | 'skipped';
  error?: string;
}

@Injectable()
export class ReviewSyncService {
  private readonly logger = new Logger(ReviewSyncService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly firebaseService: FirebaseService,
    private readonly googleBusinessService: GoogleBusinessService,
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

  async syncAllOutlets(options: SyncOptions = {}): Promise<SyncResult[]> {
    const db = this.firebaseService.getDb();
    const snap = await db.collection('outlets').where('status', '==', 'active').get();
    const outlets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const results: SyncResult[] = [];
    for (const outlet of outlets as any[]) {
      const result = await this.syncOutlet(outlet, options);
      results.push(result);
    }
    return results;
  }

  async syncSingleOutlet(outletId: string, options: SyncOptions = {}): Promise<SyncResult> {
    const db = this.firebaseService.getDb();
    const snap = await db.collection('outlets').doc(outletId).get();
    if (!snap.exists) {
      return { outletId, outletName: '', fetched: 0, new: 0, processed: 0, status: 'error', error: 'Outlet not found' };
    }
    const outlet = { id: snap.id, ...snap.data() } as any;
    // Guard: do not sync removed or deleted outlets
    if (outlet.status === 'removed' || outlet.isDeleted === true || outlet.status === 'deleted') {
      this.logger.warn(`[Sync] Skipping sync for removed outlet ${outletId}`);
      return { outletId, outletName: outlet.name || '', fetched: 0, new: 0, processed: 0, status: 'error', error: 'Outlet has been removed' };
    }
    return this.syncOutlet(outlet, options);
  }

  private async syncOutlet(outlet: any, options: SyncOptions): Promise<SyncResult> {
    const { skipCooldown = false } = options;

    // 1. Cooldown check
    if (!skipCooldown) {
      const cooldownMinutes = Number(outlet.syncCooldownMinutes || 180);
      const lastFetchAt = this.toDate(outlet.lastReviewFetchAt);
      if (lastFetchAt) {
        const elapsedMs = Date.now() - lastFetchAt.getTime();
        if (elapsedMs < cooldownMinutes * 60 * 1000) {
          this.logger.debug(`[Sync] Cooldown active for outlet ${outlet.id}, skipping.`);
          return { outletId: outlet.id, outletName: outlet.name, fetched: 0, new: 0, processed: 0, status: 'skipped' };
        }
      }
    }

    // 2. Validate credentials
    const targetLocationId = outlet.googleLocationId || outlet.googleActiveLocation || (Array.isArray(outlet.googleLocations) && outlet.googleLocations[0]?.id) || null;

    if (outlet.googleTokenInvalid === true || outlet.googleConnectionStatus === 'invalid_grant') {
      this.logger.warn(`[Sync] Skipping sync for outlet ${outlet.id}: Google authorization invalid/revoked (invalid_grant). Reconnection required.`);
      return {
        outletId: outlet.id,
        outletName: outlet.name,
        fetched: 0, new: 0, processed: 0,
        status: 'error',
        error: 'Google authorization revoked or expired (invalid_grant). Reconnection required.',
      };
    }

    if (!outlet.googleAccountId || !targetLocationId || !outlet.googleRefreshToken) {
      this.logger.warn(`[Sync] Missing credentials for outlet ${outlet.id}: accountId=${!!outlet.googleAccountId}, locationId=${!!targetLocationId}, refreshToken=${!!outlet.googleRefreshToken}`);
      return {
        outletId: outlet.id,
        outletName: outlet.name,
        fetched: 0, new: 0, processed: 0,
        status: 'error',
        error: 'Missing Google credentials',
      };
    }

    let rawReviews: any[] = [];
    try {
      rawReviews = await this.googleBusinessService.fetchReviews(
        outlet.googleAccountId,
        targetLocationId,
        outlet.googleRefreshToken,
      );
    } catch (err: any) {
      const isInvalidGrant = /invalid_grant/i.test(err?.message || '') ||
        err?.response?.data?.error === 'invalid_grant' ||
        /invalid_token/i.test(err?.message || '') ||
        /unauthorized_client/i.test(err?.message || '');

      if (isInvalidGrant) {
        this.logger.error(`[Sync] Google OAuth token for outlet ${outlet.id} is invalid or revoked (invalid_grant). Flagging outlet for reconnection.`);
        
        try {
          const db = this.firebaseService.getDb();
          await db.collection('outlets').doc(outlet.id).update({
            googleConnectionStatus: 'invalid_grant',
            googleTokenInvalid: true,
            googleTokenInvalidAt: new Date(),
            lastSyncError: 'Google account connection revoked or expired (invalid_grant). Please reconnect Google Business Profile.',
          });
        } catch (dbErr: any) {
          this.logger.error(`[Sync] Failed to update outlet ${outlet.id} on invalid_grant: ${dbErr.message}`);
        }

        await this.writeSyncHistory(outlet.id, 0, 0, 0, 'error', 'Google account connection revoked or expired (invalid_grant). Reconnection required.');

        return {
          outletId: outlet.id,
          outletName: outlet.name,
          fetched: 0, new: 0, processed: 0,
          status: 'error',
          error: 'Google authorization revoked or expired (invalid_grant). Please reconnect your Google Business Profile.',
        };
      }

      this.logger.error(`[Sync] Failed to fetch reviews for outlet ${outlet.id}: ${err.message}`);
      await this.writeSyncHistory(outlet.id, 0, 0, 0, 'error', err.message);
      return { outletId: outlet.id, outletName: outlet.name, fetched: 0, new: 0, processed: 0, status: 'error', error: err.message };
    }

    const fetched = rawReviews.length;
    const db = this.firebaseService.getDb();
    const knownHashes = new Set<string>(Array.isArray(outlet.fetchedReviewHashes) ? outlet.fetchedReviewHashes : []);
    let newCount = 0;
    let latestReviewTimestamp: Date | null = this.toDate(outlet.latestReviewTimestamp);

    // 3. Normalize, deduplicate, and save
    for (const raw of rawReviews) {
      const reviewTimestamp = raw.updateTime || raw.createTime || null;
      const rating = this.normalizeRating(raw.starRating);
      const customerName = raw.reviewer?.displayName || 'Anonymous';
      const text = raw.comment || '';
      const placeId = outlet.placeId || null;
      const providerReviewId = raw.reviewId || raw.name || null;
      const rawName = raw.name || null;

      const reviewHash = this.computeReviewHash({ placeId, customerName, text, rating, reviewTimestamp });

      if (knownHashes.has(reviewHash)) continue;

      // Check DB dedup
      const exists = await this.reviewExistsInFirestore(db, outlet.id, providerReviewId, reviewHash);
      if (exists) {
        knownHashes.add(reviewHash);
        continue;
      }

      // Parse the original Google timestamp — NOT insertion timestamp
      const parsedTimestamp = reviewTimestamp ? new Date(reviewTimestamp) : new Date();

      // Dual-write: Firestore primary
      const payload: any = {
        reviewId: reviewHash,
        outletId: outlet.id,
        placeId,
        providerSource: 'GBP',
        providerReviewId,
        reviewTimestamp: parsedTimestamp,  // original Google date!
        customerName,
        rating,
        text,
        rawName,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        aiResponse: null,
        replySuggestion: null,
      };

      try {
        const docRef = db.collection('reviews').doc(reviewHash);
        await docRef.create(payload);
      } catch {
        // Already exists — skip
        knownHashes.add(reviewHash);
        continue;
      }

      // Dual-write: Postgres
      if (process.env.DATABASE_URL) {
        try {
          await this.prismaService.review.upsert({
            where: { reviewId: reviewHash },
            create: {
              id: reviewHash,
              reviewId: reviewHash,
              outletId: outlet.id,
              placeId,
              providerSource: 'GBP',
              providerReviewId: providerReviewId || reviewHash,
              reviewTimestamp: parsedTimestamp, // original Google date!
              customerName,
              rating,
              text,
              rawName,
              status: 'pending',
            },
            update: {},
          });
        } catch (err: any) {
          this.logger.error(`[Sync] Postgres upsert failed for review ${reviewHash}: ${err.message}`);
        }
      }

      knownHashes.add(reviewHash);
      newCount++;

      if (!latestReviewTimestamp || parsedTimestamp > latestReviewTimestamp) {
        latestReviewTimestamp = parsedTimestamp;
      }
    }

    // 4. Update outlet's sync state
    await db.collection('outlets').doc(outlet.id).update({
      lastReviewFetchAt: new Date(),
      latestReviewTimestamp: latestReviewTimestamp || null,
      fetchedReviewHashes: Array.from(knownHashes).slice(-500),
    });

    await this.writeSyncHistory(outlet.id, fetched, newCount, 0, 'success');

    this.logger.log(`[Sync] Outlet ${outlet.id}: fetched=${fetched}, new=${newCount}`);
    return { outletId: outlet.id, outletName: outlet.name, fetched, new: newCount, processed: newCount, status: 'success' };
  }

  private async reviewExistsInFirestore(db: any, outletId: string, providerReviewId: string | null, reviewHash: string): Promise<boolean> {
    try {
      const [byHash, byProvider] = await Promise.all([
        db.collection('reviews').where('reviewId', '==', reviewHash).limit(1).get(),
        providerReviewId
          ? db.collection('reviews').where('outletId', '==', outletId).where('providerReviewId', '==', providerReviewId).limit(1).get()
          : Promise.resolve({ empty: true }),
      ]);
      return !byHash.empty || !byProvider.empty;
    } catch {
      return false;
    }
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
