import { Injectable, Logger, Optional } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { validateActiveOutlet } from '../../common/utils/outlet-validator';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly prismaService: PrismaService,
    @Optional() private readonly cacheService?: CacheService,
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

  /**
   * Parse a `from`/`to` query value into a Date.
   * Accepts full ISO datetimes (e.g. "2026-08-13T18:30:00.000Z") or bare
   * "YYYY-MM-DD" dates. Bare dates are interpreted as UTC day boundaries:
   * `endOfDay=false` → 00:00:00.000Z, `endOfDay=true` → 23:59:59.999Z,
   * so a range always covers the complete selected days.
   */
  private parseDateBound(value?: string, endOfDay = false): Date | undefined {
    if (!value) return undefined;
    const raw = String(value).trim();
    if (!raw) return undefined;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      if (endOfDay) {
        parsed.setUTCHours(23, 59, 59, 999);
      } else {
        parsed.setUTCHours(0, 0, 0, 0);
      }
    }
    return parsed;
  }

  private reviewTimeMs(value: any): number | null {
    if (!value) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const ms = Date.parse(value);
      return Number.isNaN(ms) ? null : ms;
    }
    if (value instanceof Date) return value.getTime();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (value._seconds != null || value.seconds != null) {
      const seconds = value._seconds ?? value.seconds;
      return Number(seconds) * 1000;
    }
    return null;
  }

  private emptyReviewsResult(pageNum: number, limitNum: number) {
    return {
      data: [],
      pagination: { total: 0, page: pageNum, limit: limitNum, totalPages: 0 },
      counts: { all: 0, pending: 0, suggested: 0, responded: 0, escalated: 0, failed: 0 },
    };
  }

  async getReviews(filter: {
    outletId?: string;
    limit?: number;
    status?: string;
    rating?: string;
    search?: string;
    page?: number;
    sort?: string;
    from?: string;
    to?: string;
  }) {
    const pageNum = Number(filter.page) || 1;
    const limitNum = Number(filter.limit) || 10;
    const skipNum = (pageNum - 1) * limitNum;

    const fromDate = this.parseDateBound(filter.from, false);
    const toDate = this.parseDateBound(filter.to, true);

    // Invalid or reversed date ranges are treated as an empty result set so
    // callers never receive out-of-range or unsorted data.
    const invalidDateRange = Boolean(
      (filter.from && !fromDate) ||
      (filter.to && !toDate) ||
      (fromDate && toDate && fromDate.getTime() > toDate.getTime()),
    );

    if (filter.outletId) {
      await validateActiveOutlet(this.firebaseService.getDb(), filter.outletId);
    }

    // 1. Primary path: Prisma / PostgreSQL
    if (process.env.DATABASE_URL) {
      try {
        if (invalidDateRange) {
          return this.emptyReviewsResult(pageNum, limitNum);
        }

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

        // Apply date-range filter against the original Google review date.
        if (fromDate || toDate) {
          whereClause.reviewTimestamp = {};
          if (fromDate) whereClause.reviewTimestamp.gte = fromDate;
          if (toDate) whereClause.reviewTimestamp.lte = toDate;
        }

        const sortOrder: 'asc' | 'desc' = filter.sort === 'date_asc' ? 'asc' : 'desc';

        const [reviews, total] = await Promise.all([
          this.prismaService.review.findMany({
            where: whereClause,
            // Sort by Google review date, with a stable id tiebreak for
            // identical timestamps so pagination never skips/duplicates rows.
            orderBy: [{ reviewTimestamp: sortOrder }, { id: sortOrder }],
            skip: skipNum,
            take: limitNum,
          }),
          this.prismaService.review.count({ where: whereClause }),
        ]);

        if (total === 0 && filter.outletId) {
          this.logger.debug(`Prisma returned 0 reviews for outlet ${filter.outletId}. Falling back to Firestore store.`);
        } else {
          // Compute counts of statuses before paging and filtering. When a date
          // range is applied the counts reflect only that range.
          const counts = { all: total, pending: 0, suggested: 0, responded: 0, escalated: 0, failed: 0 };
          const countsWhere: any = filter.outletId ? { outletId: filter.outletId } : {};
          if (fromDate || toDate) {
            countsWhere.reviewTimestamp = {};
            if (fromDate) countsWhere.reviewTimestamp.gte = fromDate;
            if (toDate) countsWhere.reviewTimestamp.lte = toDate;
          }
          const allCounts = await this.prismaService.review.groupBy({
            by: ['status'],
            where: countsWhere,
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
            totalReviews: total,
            totalPages,
            currentPage: pageNum,
            pagination: { total, page: pageNum, limit: limitNum, totalPages },
            counts,
          };
        }
      } catch (err: any) {
        this.logger.warn(`Prisma getReviews query failed: ${err.message}. Falling back to Firestore.`);
      }
    }

    // 2. Fallback path: Firestore
    const db = this.firebaseService.getDb();

    if (invalidDateRange) {
      return this.emptyReviewsResult(pageNum, limitNum);
    }

    let query: any = db.collection('reviews');
    const outletMap: any = {};

    if (filter.outletId) {
      query = query.where('outletId', '==', filter.outletId);
      try {
        const outletDoc = await db.collection('outlets').doc(filter.outletId).get();
        if (outletDoc.exists) {
          outletMap[filter.outletId] = outletDoc.data();
        }
      } catch (err: any) {
        this.logger.warn(`Could not load outlet metadata for ${filter.outletId}: ${err.message}`);
      }
    }

    const snap = await query.limit(500).get();

    let reviews = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
      };
    });

    // Apply date-range filter against the original Google review date.
    if (fromDate || toDate) {
      reviews = reviews.filter((r: any) => {
        const ts = this.reviewTimeMs(r.reviewTimestamp || r.createdAt);
        if (ts == null) return false;
        if (fromDate && ts < fromDate.getTime()) return false;
        if (toDate && ts > toDate.getTime()) return false;
        return true;
      });
    }

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

    // Sort strictly by original Google review date, with a stable id tiebreak
    // for identical timestamps.
    const sortOrder: 'asc' | 'desc' = filter.sort === 'date_asc' ? 'asc' : 'desc';
    const sortDir = sortOrder === 'asc' ? 1 : -1;
    reviews.sort((a: any, b: any) => {
      const timeA = this.reviewTimeMs(a.reviewTimestamp || a.createdAt) ?? 0;
      const timeB = this.reviewTimeMs(b.reviewTimestamp || b.createdAt) ?? 0;
      const timeDiff = (timeA - timeB) * sortDir;
      if (timeDiff !== 0) return timeDiff;
      return String(a.id).localeCompare(String(b.id)) * sortDir;
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
      totalReviews: total,
      totalPages,
      currentPage: pageNum,
      pagination: { total, page: pageNum, limit: limitNum, totalPages },
      counts,
    };
  }

  /** Invalidate cached count & historical summary when reviews change */
  async invalidateOutletReviewCaches(outletId: string): Promise<void> {
    if (!outletId || !this.cacheService) return;
    try {
      await Promise.all([
        this.cacheService.del(`reviews:count:${outletId}`),
        this.cacheService.del(`historical-summary:${outletId}`),
      ]);
    } catch {}
  }

  /**
   * Authoritative Total Reviews count for an outlet.
   * Database-level aggregate (Prisma COUNT / Firestore count()), never loads
   * review rows. Uses the same outlet scope and eligibility rules as the
   * reviews list (getReviews), so the KPI always matches the list total.
   */
  async getReviewCount(
    outletId?: string,
    user?: { uid?: string; email?: string; role?: string; customerId?: string },
  ) {
    if (outletId) {
      await validateActiveOutlet(this.firebaseService.getDb(), outletId, user, this.cacheService);
    } else {
      return { outletId: null, totalReviews: 0, total: 0 };
    }

    const cacheKey = `reviews:count:${outletId}`;
    if (this.cacheService) {
      try {
        const cachedCount = await this.cacheService.get<number>(cacheKey);
        if (cachedCount !== null && typeof cachedCount === 'number') {
          return { outletId, totalReviews: cachedCount, total: cachedCount, cached: true };
        }
      } catch {}
    }

    let prismaCount = 0;

    // 1. Primary path: Prisma / PostgreSQL — database-level COUNT.
    if (process.env.DATABASE_URL) {
      try {
        prismaCount = await this.prismaService.review.count({
          where: { outletId },
        });
      } catch (err: any) {
        this.logger.warn(`Prisma getReviewCount failed: ${err.message}.`);
      }
    }

    // 2. Fallback path: Firestore aggregate count.
    let firestoreCount = 0;
    const db = this.firebaseService.getDb();
    if (db && typeof db.collection === 'function') {
      try {
        const snap = await db
          .collection('reviews')
          .where('outletId', '==', outletId)
          .count()
          .get();
        firestoreCount = Number(snap.data()?.count ?? 0);
      } catch (err: any) {
        try {
          const snap = await db
            .collection('reviews')
            .where('outletId', '==', outletId)
            .get();
          firestoreCount = snap.size || 0;
        } catch {
          firestoreCount = 0;
        }
      }
    }

    const totalReviews = Math.max(prismaCount, firestoreCount);

    if (this.cacheService) {
      try {
        await this.cacheService.set(cacheKey, totalReviews, 300); // 5 min TTL
      } catch {}
    }

    return { outletId, totalReviews, total: totalReviews };
  }

  async getEscalatedReviews(outletId?: string) {
    if (outletId) {
      await validateActiveOutlet(this.firebaseService.getDb(), outletId, undefined, this.cacheService);
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

    const cacheKey = `historical-summary:${outletId}`;
    if (this.cacheService) {
      try {
        const cached = await this.cacheService.get(cacheKey);
        if (cached) return cached;
      } catch {}
    }

    const db = this.firebaseService.getDb();
    const outletData = await validateActiveOutlet(db, outletId, undefined, this.cacheService);

    const onboardingReviewCount = outletData?.onboardingReviewCount || 0;
    const onboardingCompletedAt = outletData?.onboardingCompletedAt || null;

    let reviews: any[] = [];
    if (process.env.DATABASE_URL) {
      try {
        reviews = await this.prismaService.review.findMany({
          where: { outletId },
          orderBy: { reviewTimestamp: 'desc' },
          take: 100,
        });
      } catch (err: any) {
        this.logger.warn(`Prisma getHistoricalSummary failed: ${err.message}`);
      }
    }

    if (!reviews.length) {
      const snap = await db.collection('reviews').where('outletId', '==', outletId).limit(100).get();
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

    const result = {
      onboardingReviewCount: counts.totalOnboarding,
      onboardingCompletedAt,
      latest10Imported: importedReviews.slice(0, 10),
      latest30ExistingResponses: existingResponses.slice(0, 30),
      statusCounts: counts,
    };

    if (this.cacheService) {
      try {
        await this.cacheService.set(cacheKey, result, 900); // 15 min TTL
      } catch {}
    }

    return result;
  }

  async getOutlets(userId?: string, customerId?: string) {
    const db = this.firebaseService.getDb();
    const map = new Map<string, any>();

    if (customerId) {
      const snapCust = await db.collection('outlets').where('customerId', '==', customerId).get();
      snapCust.docs.forEach((d: any) => map.set(d.id, { id: d.id, ...d.data() }));
    }

    if (userId) {
      const snapOwner = await db.collection('outlets').where('ownerId', '==', userId).get();
      snapOwner.docs.forEach((d: any) => map.set(d.id, { id: d.id, ...d.data() }));
    }

    if (!customerId && !userId) {
      const snapAll = await db.collection('outlets').get();
      snapAll.docs.forEach((d: any) => map.set(d.id, { id: d.id, ...d.data() }));
    }

    return Array.from(map.values()).filter(
      (o: any) => o.isDeleted !== true && o.status !== 'removed' && o.status !== 'deleted',
    );
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
