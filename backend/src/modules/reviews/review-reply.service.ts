import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  async postDirectReply(outletId: string, reviewId: string, replyText: string): Promise<void> {
    const db = this.firebaseService.getDb();

    // Load outlet for credentials
    const outletSnap = await db.collection('outlets').doc(outletId).get();
    if (!outletSnap.exists || outletSnap.data()?.status === 'removed' || outletSnap.data()?.isDeleted === true || outletSnap.data()?.status === 'deleted') {
      throw new NotFoundException('Outlet not found or has been removed');
    }
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
}
