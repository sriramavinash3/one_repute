import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { validateActiveOutlet } from '../../common/utils/outlet-validator';

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

    if (filter.outletId) {
      await validateActiveOutlet(this.firebaseService.getDb(), filter.outletId);
    }

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
    if (outletId) {
      await validateActiveOutlet(this.firebaseService.getDb(), outletId);
    }
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

  async getHistoricalSummary(outletId: string) {
    if (!outletId) throw new Error('outletId is required');

    const db = this.firebaseService.getDb();
    const outletSnap = await db.collection('outlets').doc(outletId).get();
    const outletData = outletSnap.exists ? outletSnap.data() : {};

    const onboardingReviewCount = outletData?.onboardingReviewCount || 0;
    const onboardingCompletedAt = outletData?.onboardingCompletedAt || null;

    let reviews: any[] = [];
    if (process.env.DATABASE_URL) {
      try {
        reviews = await this.prismaService.review.findMany({
          where: { outletId },
          orderBy: { reviewTimestamp: 'desc' },
        });
      } catch (err: any) {
        this.logger.warn(`Prisma getHistoricalSummary failed: ${err.message}`);
      }
    }

    if (!reviews.length) {
      const snap = await db.collection('reviews').where('outletId', '==', outletId).get();
      reviews = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      reviews.sort((a: any, b: any) => {
        const timeA = a.reviewTimestamp ? (a.reviewTimestamp.toDate ? a.reviewTimestamp.toDate().getTime() : new Date(a.reviewTimestamp).getTime()) : 0;
        const timeB = b.reviewTimestamp ? (b.reviewTimestamp.toDate ? b.reviewTimestamp.toDate().getTime() : new Date(b.reviewTimestamp).getTime()) : 0;
        return timeB - timeA;
      });
    }

    const importedReviews = reviews.filter((r) => r.isImported || r.isOnboarding || r.status === 'imported');
    const existingResponses = reviews.filter((r) => r.status === 'responded' || (r.aiResponse && r.aiResponse.trim().length > 0));

    const counts = {
      totalOnboarding: onboardingReviewCount || importedReviews.length,
      importedCount: importedReviews.length,
      existingResponsesCount: existingResponses.length,
      responded: reviews.filter((r) => r.status === 'responded').length,
      pending: reviews.filter((r) => r.status === 'pending').length,
      escalated: reviews.filter((r) => r.status === 'escalated' || (r.escalationStatus && r.escalationStatus !== 'no_escalation')).length,
      imported: reviews.filter((r) => r.status === 'imported').length,
    };

    return {
      onboardingReviewCount: counts.totalOnboarding,
      onboardingCompletedAt,
      latest10Imported: importedReviews.slice(0, 10),
      latest30ExistingResponses: existingResponses.slice(0, 30),
      statusCounts: counts,
    };
  }

  async getOutlets(userId?: string, customerId?: string) {
    const db = this.firebaseService.getDb();
    let snap: any;
    if (customerId) {
      snap = await db.collection('outlets').where('customerId', '==', customerId).where('status', '==', 'active').get();
    } else {
      snap = await db.collection('outlets').where('status', '==', 'active').get();
    }
    return snap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .filter((o: any) => o.isDeleted !== true && o.status !== 'removed');
  }

  async getOutletById(outletId: string) {
    const db = this.firebaseService.getDb();
    await validateActiveOutlet(db, outletId);
    const docSnap = await db.collection('outlets').doc(outletId).get();
    if (!docSnap.exists) {
      throw new Error(`Outlet ${outletId} not found`);
    }
    const data = docSnap.data();
    if (data?.status === 'removed' || data?.isDeleted === true || data?.status === 'deleted') {
      throw new Error(`Outlet ${outletId} has been removed`);
    }
    return { id: docSnap.id, ...data };
  }

  async updateCustomerOutletSettings(outletId: string, payload: any, isCustomerCall = true) {
    const db = this.firebaseService.getDb();
    await validateActiveOutlet(db, outletId);

    // SECURITY ENFORCEMENT (Requirement 6):
    // All fields populated from Google Business Profile MUST be read-only/non-editable.
    // If a customer attempts to modify Google-sourced business information by manually calling the API,
    // we strip out those fields and log a security warning.
    const googleSourcedFields = [
      'name',
      'businessType',
      'businessCategory',
      'address',
      'phone',
      'website',
      'websiteUri',
      'googleLocationName',
      'googleLocationAddress',
      'googleLocationPhone',
      'googleLocationWebsite',
    ];

    if (isCustomerCall && payload) {
      googleSourcedFields.forEach((field) => {
        if (field in payload) {
          this.logger.warn(
            `[Security] Customer API call attempted to modify read-only Google-sourced field '${field}' on outlet ${outletId}. Field modification rejected.`,
          );
          delete payload[field];
        }
      });
    }

    const updateData: any = { updatedAt: new Date() };

    // Contact Email is the ONLY editable business information field exception (Requirement 3)
    if (payload.email !== undefined) {
      updateData.email = String(payload.email || '').trim();
    }

    // Allowed non-Google settings (WhatsApp notification parameters)
    if (payload.whatsappNumber !== undefined) {
      updateData.whatsappNumber = String(payload.whatsappNumber || '').trim();
    }
    if (payload.primaryWhatsAppNumber !== undefined) {
      updateData.primaryWhatsAppNumber = String(payload.primaryWhatsAppNumber || '').trim();
    }
    if (payload.escalationThreshold !== undefined) {
      updateData.escalationThreshold = Number(payload.escalationThreshold);
    }
    if (payload.settings !== undefined) {
      updateData.settings = payload.settings;
    }

    await db.collection('outlets').doc(outletId).set(updateData, { merge: true });

    // Sync Prisma Location table if DATABASE_URL is set
    if (process.env.DATABASE_URL) {
      try {
        const prismaUpdate: any = {};
        if (payload.whatsappNumber !== undefined) prismaUpdate.whatsappNumber = payload.whatsappNumber;
        if (payload.escalationThreshold !== undefined) prismaUpdate.escalationThreshold = Number(payload.escalationThreshold);
        if (Object.keys(prismaUpdate).length > 0) {
          await this.prismaService.location.update({
            where: { id: outletId },
            data: prismaUpdate,
          });
        }
      } catch (err: any) {
        this.logger.warn(`Prisma location update warning for ${outletId}: ${err.message}`);
      }
    }

    const updatedDoc = await db.collection('outlets').doc(outletId).get();
    return {
      success: true,
      id: outletId,
      message: 'Settings updated successfully',
      outlet: { id: outletId, ...updatedDoc.data() },
    };
  }
}
