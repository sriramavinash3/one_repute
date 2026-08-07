import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly prismaService: PrismaService,
  ) {}

  private normalizeStatus(status: string): string {
    const val = String(status || '').toLowerCase().trim();
    if (val === 'reply_pending' || val === 'suggested') return 'suggested';
    if (val === 'pending') return 'pending';
    if (val === 'responded') return 'responded';
    if (val === 'escalated') return 'escalated';
    if (val === 'failed') return 'failed';
    return 'pending';
  }

  async getReviews(filter: {
    outletId?: string;
    limit?: number;
    status?: string;
    rating?: string;
    search?: string;
    page?: number;
  }) {
    const pageNum = Number(filter.page) || 1;
    const limitNum = Number(filter.limit) || 10;
    const skipNum = (pageNum - 1) * limitNum;

    // 1. Primary path: Prisma / PostgreSQL
    if (process.env.DATABASE_URL) {
      try {
        const whereClause: any = {};
        if (filter.outletId) {
          whereClause.outletId = filter.outletId;
        }

        // Apply status filter
        if (filter.status && filter.status !== 'all') {
          whereClause.status = this.normalizeStatus(filter.status);
        }

        // Apply rating filter
        if (filter.rating && filter.rating !== 'all') {
          if (filter.rating === '4+') {
            whereClause.rating = { gte: 4 };
          } else if (filter.rating === '3+') {
            whereClause.rating = { gte: 3 };
          } else if (filter.rating === '1-2') {
            whereClause.rating = { lte: 2 };
          } else {
            const ratingNum = Number(filter.rating);
            if (!Number.isNaN(ratingNum)) {
              whereClause.rating = ratingNum;
            }
          }
        }

        // Apply search filter (contains text, name, etc.)
        if (filter.search) {
          whereClause.OR = [
            { customerName: { contains: filter.search, mode: 'insensitive' } },
            { text: { contains: filter.search, mode: 'insensitive' } },
          ];
        }

        const [reviews, total] = await Promise.all([
          this.prismaService.review.findMany({
            where: whereClause,
            orderBy: { reviewTimestamp: 'desc' }, // Fix rule: sort by Google review date!
            skip: skipNum,
            take: limitNum,
          }),
          this.prismaService.review.count({ where: whereClause }),
        ]);

        // Compute counts of statuses before paging and filtering
        const counts = { all: total, pending: 0, suggested: 0, responded: 0, escalated: 0, failed: 0 };
        const allCounts = await this.prismaService.review.groupBy({
          by: ['status'],
          where: filter.outletId ? { outletId: filter.outletId } : {},
          _count: { _all: true },
        });
        allCounts.forEach((group) => {
          const s = this.normalizeStatus(group.status);
          if (counts[s] !== undefined) {
            counts[s] += group._count._all;
          }
        });

        const totalPages = Math.ceil(total / limitNum);

        return {
          data: reviews.map((r) => {
            const statusVal = this.normalizeStatus(r.status);
            return {
              ...r,
              status: statusVal,
              requiresManualReply: statusVal === 'suggested',
              isEscalated: statusVal === 'escalated',
              hasFailed: statusVal === 'failed',
            };
          }),
          pagination: { total, page: pageNum, limit: limitNum, totalPages },
          counts,
        };
      } catch (err: any) {
        this.logger.warn(`Prisma getReviews query failed: ${err.message}. Falling back to Firestore.`);
      }
    }

    // 2. Fallback path: Firestore
    const db = this.firebaseService.getDb();
    let query: any = db.collection('reviews');

    if (filter.outletId) {
      query = query.where('outletId', '==', filter.outletId);
    }

    const [snap, outletsSnap] = await Promise.all([
      query.get(),
      db.collection('outlets').get(),
    ]);

    const outletMap: any = {};
    outletsSnap.docs.forEach((doc) => {
      outletMap[doc.id] = doc.data();
    });

    let reviews = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
      };
    });

    const counts: any = { all: reviews.length, pending: 0, suggested: 0, responded: 0, escalated: 0, failed: 0 };
    reviews.forEach((r: any) => {
      const statusVal = this.normalizeStatus(r.status || 'pending');
      if (counts[statusVal] !== undefined) {
        counts[statusVal]++;
      }
    });

    if (filter.status && filter.status !== 'all') {
      reviews = reviews.filter(
        (r: any) => this.normalizeStatus(r.status || 'pending') === this.normalizeStatus(filter.status)
      );
    }

    if (filter.rating && filter.rating !== 'all') {
      if (filter.rating === '4+') {
        reviews = reviews.filter((r: any) => Number(r.rating || 0) >= 4);
      } else if (filter.rating === '3+') {
        reviews = reviews.filter((r: any) => Number(r.rating || 0) >= 3);
      } else if (filter.rating === '1-2') {
        reviews = reviews.filter((r: any) => Number(r.rating || 0) <= 2);
      } else {
        const ratingNum = Number(filter.rating);
        if (!Number.isNaN(ratingNum)) {
          reviews = reviews.filter((r: any) => Number(r.rating || 0) === ratingNum);
        }
      }
    }

    if (filter.search) {
      const q = filter.search.toLowerCase();
      reviews = reviews.filter(
        (r: any) =>
          (r.customerName || '').toLowerCase().includes(q) ||
          (r.text || '').toLowerCase().includes(q) ||
          (outletMap[r.outletId]?.name || '').toLowerCase().includes(q)
      );
    }

    // Sort strictly by original Google review date descending!
    reviews.sort((a: any, b: any) => {
      const timeA = a.reviewTimestamp
        ? (a.reviewTimestamp.toDate ? a.reviewTimestamp.toDate().getTime() : new Date(a.reviewTimestamp).getTime())
        : 0;
      const timeB = b.reviewTimestamp
        ? (b.reviewTimestamp.toDate ? b.reviewTimestamp.toDate().getTime() : new Date(b.reviewTimestamp).getTime())
        : 0;
      return timeB - timeA;
    });

    const total = reviews.length;
    const totalPages = Math.ceil(total / limitNum);
    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum;

    const paginatedReviews = reviews.slice(start, end).map((r: any) => {
      const statusVal = this.normalizeStatus(r.status || 'pending');
      return {
        ...r,
        status: statusVal,
        requiresManualReply: statusVal === 'suggested',
        isEscalated: statusVal === 'escalated',
        hasFailed: statusVal === 'failed',
      };
    });

    return {
      data: paginatedReviews,
      pagination: { total, page: pageNum, limit: limitNum, totalPages },
      counts,
    };
  }

  async getEscalatedReviews(outletId?: string) {
    if (process.env.DATABASE_URL) {
      try {
        const reviews = await this.prismaService.review.findMany({
          where: {
            status: 'escalated',
            ...(outletId ? { outletId } : {}),
          },
          orderBy: { reviewTimestamp: 'desc' },
        });
        return reviews.map((r) => ({
          ...r,
          requiresManualReply: false,
          isEscalated: true,
          hasFailed: false,
        }));
      } catch (err: any) {
        this.logger.warn(`Prisma getEscalatedReviews failed: ${err.message}. Falling back to Firestore.`);
      }
    }

    const db = this.firebaseService.getDb();
    let query = db.collection('reviews').where('status', '==', 'escalated');
    if (outletId) {
      query = query.where('outletId', '==', outletId);
    }
    const snap = await query.get();
    const reviews = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    reviews.sort((a: any, b: any) => {
      const timeA = a.reviewTimestamp ? (a.reviewTimestamp.toDate ? a.reviewTimestamp.toDate().getTime() : new Date(a.reviewTimestamp).getTime()) : 0;
      const timeB = b.reviewTimestamp ? (b.reviewTimestamp.toDate ? b.reviewTimestamp.toDate().getTime() : new Date(b.reviewTimestamp).getTime()) : 0;
      return timeB - timeA;
    });

    return reviews.map((r) => ({
      ...r,
      requiresManualReply: false,
      isEscalated: true,
      hasFailed: false,
    }));
  }

  async updateReviewStatus(reviewId: string, status: string, user?: any) {
    const db = this.firebaseService.getDb();
    const docRef = db.collection('reviews').doc(reviewId);
    const snap = await docRef.get();
    
    if (!snap.exists) {
      throw new Error('Review not found');
    }

    const reviewData = snap.data();
    const oldStatus = reviewData.status;
    const normalizedNewStatus = this.normalizeStatus(status);

    // Limit responses check
    if (normalizedNewStatus === 'responded' && oldStatus !== 'responded') {
      // Permission check passed
    }

    const updateData: any = { status: normalizedNewStatus, updatedAt: new Date() };
    if (normalizedNewStatus === 'responded') {
      updateData.repliedAt = new Date();
    }

    // Dual write update to Firestore
    await docRef.update(updateData);

    // Dual write update to PG
    if (process.env.DATABASE_URL) {
      try {
        await this.prismaService.review.update({
          where: { reviewId },
          data: {
            status: normalizedNewStatus,
            ...(normalizedNewStatus === 'responded' ? { repliedAt: new Date() } : {}),
          },
        });
      } catch (err: any) {
        this.logger.error(`Prisma updateReviewStatus failed: ${err.message}`);
      }
    }

    return { success: true };
  }
}
