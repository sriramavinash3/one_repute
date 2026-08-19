import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleBusinessService } from '../google-business/google-business.service';
import { AIService } from '../ai/ai.service';

import { consumeTrialResponseAllowance, releaseTrialResponseAllowance } from '../../common/utils/trial-entitlement.util';

@Injectable()
export class ReviewReplyService {
  private readonly logger = new Logger(ReviewReplyService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly firebaseService: FirebaseService,
    private readonly prismaService: PrismaService,
    private readonly googleBusinessService: GoogleBusinessService,
    private readonly aiService: AIService,
  ) {}

  async generateAiSuggestion(params: {
    outletName: string;
    customerName: string;
    rating: number;
    reviewText: string;
    customerId?: string;
  }): Promise<string> {
    const { outletName, customerName, rating, reviewText, customerId } = params;

    let trialResult = { allowedCount: 1, isTrial: false, remaining: Infinity, used: 0 };
    if (customerId) {
      const db = this.firebaseService.getDb();
      trialResult = await consumeTrialResponseAllowance(db, customerId, 1);
      if (trialResult.isTrial && trialResult.allowedCount === 0) {
        throw new BadRequestException('Trial limit of 30 AI review responses reached. Upgrade to a paid plan to continue generating AI responses.');
      }
    }

    try {
      const result = await this.aiService.generateReviewReply({
        outletName,
        customerName,
        rating,
        reviewText,
      });
      return result.text;
    } catch (err: any) {
      if (trialResult.isTrial && customerId) {
        const db = this.firebaseService.getDb();
        await releaseTrialResponseAllowance(db, customerId, 1);
      }
      throw err;
    }
  }

  /**
   * Dual-write review state to both Firestore and PostgreSQL via Prisma.
   */
  private async dualWriteReviewUpdate(reviewId: string, updateData: any): Promise<void> {
    const db = this.firebaseService.getDb();

    // 1. Update Firestore
    try {
      await db.collection('reviews').doc(reviewId).update({
        ...updateData,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err: any) {
      this.logger.error(`[DualWrite] Firestore update failed for review ${reviewId}: ${err.message}`);
    }

    // 2. Update PostgreSQL (Prisma)
    if (process.env.DATABASE_URL) {
      try {
        const prismaUpdateData: any = {};
        if (updateData.status !== undefined) prismaUpdateData.status = updateData.status;
        if (updateData.aiResponse !== undefined) prismaUpdateData.aiResponse = updateData.aiResponse;
        if (updateData.replySuggestion !== undefined) prismaUpdateData.replySuggestion = updateData.replySuggestion;
        if (updateData.repliedAt !== undefined) prismaUpdateData.repliedAt = updateData.repliedAt;

        if (Object.keys(prismaUpdateData).length > 0) {
          try {
            await this.prismaService.review.update({
              where: { reviewId },
              data: prismaUpdateData,
            });
          } catch {
            await this.prismaService.review.update({
              where: { id: reviewId },
              data: prismaUpdateData,
            });
          }
        }
      } catch (prismaErr: any) {
        this.logger.warn(`[DualWrite] Prisma update skipped for review ${reviewId}: ${prismaErr.message}`);
      }
    }
  }

  /**
   * Post a reply directly to Google Business Profile for a review and update persistence.
   */
  async postDirectReply(outletId: string, reviewId: string, replyText: string): Promise<{ success: boolean; repliedAt: Date }> {
    const db = this.firebaseService.getDb();

    // 1. Load outlet for credentials
    const outletSnap = await db.collection('outlets').doc(outletId).get();
    if (!outletSnap.exists || outletSnap.data()?.status === 'removed' || outletSnap.data()?.isDeleted === true || outletSnap.data()?.status === 'deleted') {
      throw new NotFoundException(`Outlet ${outletId} not found or has been removed`);
    }
    const outlet = outletSnap.data() as any;

    // 2. Load review
    const reviewSnap = await db.collection('reviews').doc(reviewId).get();
    if (!reviewSnap.exists) {
      throw new NotFoundException(`Review ${reviewId} not found`);
    }
    const review = reviewSnap.data() as any;

    const targetLocationId = outlet.googleLocationId || outlet.googleActiveLocation || (Array.isArray(outlet.googleLocations) && outlet.googleLocations[0]?.id) || null;

    if (!outlet.googleAccountId || !targetLocationId || !outlet.googleRefreshToken) {
      this.logger.error(`GOOGLE_REPLY_FAILED reviewId=${reviewId} outletId=${outletId} stage=GOOGLE_AUTH errorCode=MISSING_CREDENTIALS errorMessage="Outlet missing Google credentials"`);
      throw new BadRequestException('Outlet missing Google credentials (account ID, location ID, or refresh token)');
    }

    const resourceName = review.rawName || review.providerReviewId || reviewId;
    if (!resourceName) {
      this.logger.error(`GOOGLE_REPLY_FAILED reviewId=${reviewId} outletId=${outletId} stage=GOOGLE_API errorCode=MISSING_RESOURCE_NAME errorMessage="Review missing GBP resource name"`);
      throw new BadRequestException('Review missing Google Business Profile resource name');
    }

    // Idempotency check: If review is already responded, skip calling API again
    if (review.status === 'responded' && review.aiResponse === replyText) {
      this.logger.log(`GOOGLE_REPLY_SUCCESS reviewId=${reviewId} outletId=${outletId} status=already_responded timestamp=${new Date().toISOString()}`);
      return { success: true, repliedAt: review.repliedAt ? new Date(review.repliedAt) : new Date() };
    }

    this.logger.log(`GOOGLE_REPLY_START reviewId=${reviewId} outletId=${outletId} resourceName=${resourceName}`);

    const repliedAt = new Date();

    try {
      await this.googleBusinessService.postReply(
        outlet.googleAccountId,
        targetLocationId,
        outlet.googleRefreshToken,
        resourceName,
        replyText,
      );

      // Persist success state
      await this.dualWriteReviewUpdate(reviewId, {
        status: 'responded',
        aiResponse: replyText,
        replySuggestion: replyText,
        repliedAt,
        processedAt: repliedAt,
        lastError: null,
      });

      this.logger.log(`GOOGLE_REPLY_SUCCESS reviewId=${reviewId} outletId=${outletId} timestamp=${repliedAt.toISOString()}`);
      return { success: true, repliedAt };
    } catch (err: any) {
      const isAuthError = /invalid_grant|unauthorized|forbidden|invalid_token/i.test(err?.message || '');
      const stage = isAuthError ? 'GOOGLE_AUTH' : 'GOOGLE_API';
      const errorCode = err.code || (isAuthError ? 'INVALID_GRANT' : 'GOOGLE_API_ERROR');

      this.logger.error(`GOOGLE_REPLY_FAILED reviewId=${reviewId} outletId=${outletId} stage=${stage} errorCode=${errorCode} errorMessage="${err.message}"`);

      // Persist failure state
      await this.dualWriteReviewUpdate(reviewId, {
        status: 'failed',
        aiResponse: replyText,
        replySuggestion: replyText,
        lastError: err.message,
      });

      if (isAuthError) {
        throw new BadRequestException(`Google authorization failed (invalid_grant). Reconnection required: ${err.message}`);
      }
      throw new InternalServerErrorException(`Google API failed to publish reply: ${err.message}`);
    }
  }

  /**
   * Reprocess an existing eligible review end-to-end:
   * Evaluate rules -> generate AI reply -> publish to Google Business Profile -> update database state.
   */
  async reprocessReview(reviewId: string): Promise<any> {
    const db = this.firebaseService.getDb();
    const reviewSnap = await db.collection('reviews').doc(reviewId).get();

    if (!reviewSnap.exists) {
      throw new NotFoundException(`Review ${reviewId} not found`);
    }

    const review = { id: reviewSnap.id, ...reviewSnap.data() } as any;
    const outletId = review.outletId;

    const outletSnap = await db.collection('outlets').doc(outletId).get();
    if (!outletSnap.exists) {
      throw new NotFoundException(`Outlet ${outletId} not found for review ${reviewId}`);
    }
    const outlet = outletSnap.data() as any;

    const outletName = outlet.name || 'Business';
    const customerName = review.customerName || 'Customer';
    const rating = Number(review.rating || 5);
    const reviewText = review.text || '';

    this.logger.log(`AUTO_REPLY_START reviewId=${reviewId} outletId=${outletId} mode=manual_reprocess provider=ai model=default`);

    let replyText = review.aiResponse || review.replySuggestion;
    if (!replyText) {
      const customerId = outlet.customerId || outlet.userId || outlet.ownerId || null;
      let trialResult = { allowedCount: 1, isTrial: false, remaining: Infinity, used: 0 };
      if (customerId) {
        trialResult = await consumeTrialResponseAllowance(db, customerId, 1);
        if (trialResult.isTrial && trialResult.allowedCount === 0) {
          throw new BadRequestException('Trial limit of 30 AI review responses reached. Upgrade to a paid plan to continue generating AI responses.');
        }
      }

      try {
        const aiResult = await this.aiService.generateReviewReply({
          outletName,
          customerName,
          rating,
          reviewText,
        });
        replyText = aiResult.text;
        this.logger.log(`AUTO_REPLY_GENERATED reviewId=${reviewId} outletId=${outletId} generationSuccess=true responseLength=${replyText.length}`);
      } catch (aiErr: any) {
        if (trialResult.isTrial && customerId) {
          await releaseTrialResponseAllowance(db, customerId, 1);
        }
        this.logger.error(`AUTO_REPLY_GENERATION_FAILED reviewId=${reviewId} outletId=${outletId} errorCode=AI_FAILED errorMessage="${aiErr.message}"`);
        await this.dualWriteReviewUpdate(reviewId, {
          status: 'failed',
          lastError: `AI generation failed: ${aiErr.message}`,
        });
        throw new InternalServerErrorException(`AI response generation failed: ${aiErr.message}`);
      }
    }

    // Evaluate automation settings
    const autoResponseEnabled = outlet.autoResponseEnabled ?? outlet.settings?.autoResponseEnabled ?? true;
    const minRating = Number(outlet.minRatingForAutoResponse ?? outlet.settings?.minRatingForAutoResponse ?? 4);

    if (autoResponseEnabled && rating >= minRating) {
      const publishResult = await this.postDirectReply(outletId, reviewId, replyText);
      const updatedSnap = await db.collection('reviews').doc(reviewId).get();
      return { success: true, review: { id: reviewId, ...updatedSnap.data() }, published: true, repliedAt: publishResult.repliedAt };
    } else {
      await this.dualWriteReviewUpdate(reviewId, {
        status: 'suggested',
        replySuggestion: replyText,
        aiResponse: replyText,
      });
      const updatedSnap = await db.collection('reviews').doc(reviewId).get();
      return { success: true, review: { id: reviewId, ...updatedSnap.data() }, published: false, reason: `Rating ${rating} is below min auto reply threshold ${minRating} or auto response disabled.` };
    }
  }
}
