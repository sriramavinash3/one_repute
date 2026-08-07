import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleBusinessService } from '../google-business/google-business.service';
import { AIService } from '../ai/ai.service';

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
  }): Promise<string> {
    const { outletName, customerName, rating, reviewText } = params;
    const result = await this.aiService.generateReviewReply({
      outletName,
      customerName,
      rating,
      reviewText,
    });
    return result.text;
  }

  async getApprovals(customerId: string) {
    const db = this.firebaseService.getDb();
    const snap = await db.collection('reviews')
      .where('customerId', '==', customerId)
      .where('status', '==', 'suggested')
      .get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async approveReply(reviewId: string, customerId: string, approvedBy: string): Promise<void> {
    const { db, docRef, data } = await this.getReviewDoc(reviewId, customerId);

    const finalResponse = data.replySuggestion || data.aiResponse;
    if (!finalResponse) {
      throw new BadRequestException('No suggested response exists to approve.');
    }



    await docRef.update({
      status: 'responded',
      aiResponse: finalResponse,
      repliedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvalStatus: 'approved',
      approvedBy,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('activityLogs').add({
      type: 'REPLY_APPROVED',
      payload: { reviewId, customerId, approvedBy },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (process.env.DATABASE_URL) {
      try {
        await this.prismaService.review.updateMany({
          where: { reviewId },
          data: { status: 'responded', repliedAt: new Date(), aiResponse: finalResponse },
        });
      } catch (err: any) {
        this.logger.error(`Prisma approve sync failed: ${err.message}`);
      }
    }
  }

  async rejectReply(reviewId: string, customerId: string, rejectedBy: string): Promise<void> {
    const { db, docRef } = await this.getReviewDoc(reviewId, customerId);


    await docRef.update({
      status: 'pending',
      replySuggestion: null,
      aiResponse: null,
      approvalStatus: 'rejected',
      rejectedBy,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('activityLogs').add({
      type: 'REPLY_REJECTED',
      payload: { reviewId, customerId, rejectedBy },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (process.env.DATABASE_URL) {
      try {
        await this.prismaService.review.updateMany({
          where: { reviewId },
          data: { status: 'pending', replySuggestion: null, aiResponse: null },
        });
      } catch (err: any) {
        this.logger.error(`Prisma reject sync failed: ${err.message}`);
      }
    }
  }

  async editAndApproveReply(reviewId: string, customerId: string, editedReply: string, approvedBy: string): Promise<void> {
    if (!editedReply || editedReply.trim().length === 0) {
      throw new BadRequestException('Reply text cannot be empty.');
    }

    const { db, docRef } = await this.getReviewDoc(reviewId, customerId);


    await docRef.update({
      status: 'responded',
      aiResponse: editedReply,
      replySuggestion: editedReply,
      repliedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvalStatus: 'edited_and_approved',
      approvedBy,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('activityLogs').add({
      type: 'REPLY_EDITED_AND_APPROVED',
      payload: { reviewId, customerId, approvedBy },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (process.env.DATABASE_URL) {
      try {
        await this.prismaService.review.updateMany({
          where: { reviewId },
          data: { status: 'responded', repliedAt: new Date(), aiResponse: editedReply, replySuggestion: editedReply },
        });
      } catch (err: any) {
        this.logger.error(`Prisma edit/approve sync failed: ${err.message}`);
      }
    }
  }

  async postDirectReply(outletId: string, reviewId: string, replyText: string): Promise<void> {
    const db = this.firebaseService.getDb();

    // Load outlet for credentials
    const outletSnap = await db.collection('outlets').doc(outletId).get();
    if (!outletSnap.exists) throw new NotFoundException('Outlet not found');
    const outlet = outletSnap.data() as any;

    // Load review for rawName
    const reviewSnap = await db.collection('reviews').doc(reviewId).get();
    if (!reviewSnap.exists) throw new NotFoundException('Review not found');
    const review = reviewSnap.data() as any;

    if (!outlet.googleAccountId || !outlet.googleLocationId || !outlet.googleRefreshToken) {
      throw new BadRequestException('Outlet missing Google credentials');
    }
    if (!review.rawName) {
      throw new BadRequestException('Review missing GBP resource name');
    }

    await this.googleBusinessService.postReply(
      outlet.googleAccountId,
      outlet.googleLocationId,
      outlet.googleRefreshToken,
      review.rawName,
      replyText,
    );
  }

  private async getReviewDoc(reviewId: string, customerId: string) {
    const db = this.firebaseService.getDb();
    const docRef = db.collection('reviews').doc(reviewId);
    const snap = await docRef.get();

    if (!snap.exists) throw new NotFoundException('Review not found');
    const data = snap.data() as any;
    if (data.customerId !== customerId) throw new ForbiddenException('Access denied');

    return { db, docRef, data };
  }
}
