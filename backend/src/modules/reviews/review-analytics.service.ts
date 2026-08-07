import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class ReviewAnalyticsService {
  private readonly logger = new Logger(ReviewAnalyticsService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  private toDate(val: any): Date | null {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val.toDate === 'function') return val.toDate();
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  async getSummary(outletId?: string) {
    const db = this.firebaseService.getDb();
    let query: any = db.collection('reviews');
    if (outletId) query = query.where('outletId', '==', outletId);

    const snap = await query.get();
    const all: any[] = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

    let totalReviews = 0, totalResponded = 0, totalEscalated = 0;
    let totalSuggested = 0, totalPending = 0, totalFailed = 0;
    let ratingSum = 0, ratingCount = 0;
    let positiveCount = 0, negativeCount = 0, neutralCount = 0;

    // Weekly bucket: 7 days, keyed by day-of-week label
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyReviews: Record<string, number> = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
    const weeklyResponses: Record<string, number> = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };

    const nowMs = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = new Date(nowMs - sevenDaysMs);

    for (const review of all) {
      totalReviews++;
      const status = (review.status || 'pending').toLowerCase();

      if (status === 'responded') totalResponded++;
      else if (status === 'escalated') totalEscalated++;
      else if (status === 'suggested' || status === 'reply_pending') totalSuggested++;
      else if (status === 'pending') totalPending++;
      else if (status === 'failed') totalFailed++;

      const rating = Number(review.rating || 0);
      if (rating > 0) {
        ratingSum += rating;
        ratingCount++;
        if (rating >= 4) positiveCount++;
        else if (rating <= 2) negativeCount++;
        else neutralCount++;
      }

      // Sort by original Google review timestamp — NOT createdAt
      const reviewDate = this.toDate(review.reviewTimestamp) || this.toDate(review.createdAt) || null;
      if (reviewDate && reviewDate >= sevenDaysAgo) {
        const dayLabel = dayLabels[reviewDate.getDay()];
        weeklyReviews[dayLabel] = (weeklyReviews[dayLabel] || 0) + 1;
        if (status === 'responded') {
          weeklyResponses[dayLabel] = (weeklyResponses[dayLabel] || 0) + 1;
        }
      }
    }

    const avgRating = ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : 0;
    const sentimentTotal = positiveCount + neutralCount + negativeCount;

    const weeklyTrend = dayLabels.map((name) => ({
      name,
      reviews: weeklyReviews[name] || 0,
      responses: weeklyResponses[name] || 0,
    }));

    return {
      totalReviews,
      totalResponded,
      totalEscalated,
      totalSuggested,
      totalPending,
      totalFailed,
      avgRating,
      sentiment: {
        positive: sentimentTotal > 0 ? Math.round((positiveCount / sentimentTotal) * 100) : 0,
        neutral: sentimentTotal > 0 ? Math.round((neutralCount / sentimentTotal) * 100) : 0,
        negative: sentimentTotal > 0 ? Math.round((negativeCount / sentimentTotal) * 100) : 0,
      },
      weeklyTrend,
    };
  }

  async getTimeline(outletId?: string, dateRange: string = '30d') {
    const db = this.firebaseService.getDb();
    let query: any = db.collection('reviews');
    if (outletId) query = query.where('outletId', '==', outletId);
    const snap = await query.get();
    const all: any[] = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

    const nowMs = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    let daysBack = 30;
    if (dateRange === '7d') daysBack = 7;
    else if (dateRange === '90d') daysBack = 90;
    else if (dateRange === 'all') daysBack = 365 * 5;

    const buckets: Record<string, { date: string; count: number; avgRating: number; ratings: number[] }> = {};

    for (const review of all) {
      // Always use original Google review timestamp
      const reviewDate = this.toDate(review.reviewTimestamp);
      if (!reviewDate) continue;

      if (nowMs - reviewDate.getTime() > daysBack * msPerDay) continue;

      const dateKey = reviewDate.toISOString().slice(0, 10); // YYYY-MM-DD
      if (!buckets[dateKey]) {
        buckets[dateKey] = { date: dateKey, count: 0, avgRating: 0, ratings: [] };
      }
      buckets[dateKey].count++;
      buckets[dateKey].ratings.push(Number(review.rating || 0));
    }

    return Object.values(buckets)
      .map((b) => ({
        date: b.date,
        count: b.count,
        avgRating: b.ratings.length > 0 ? Math.round((b.ratings.reduce((a, c) => a + c, 0) / b.ratings.length) * 10) / 10 : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
