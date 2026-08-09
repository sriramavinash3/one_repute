import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { validateActiveOutlet } from '../../common/utils/outlet-validator';

@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  private toDate(val: any): Date | null {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val.toDate === 'function') return val.toDate();
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  async getReputationInsights(outletId: string, dateRange: string = '30d') {
    const db = this.firebaseService.getDb();
    await validateActiveOutlet(db, outletId);

    const [reviewsSnap, outletSnap] = await Promise.all([
      db.collection('reviews').where('outletId', '==', outletId).get(),
      db.collection('outlets').doc(outletId).get(),
    ]);

    const categoryRules: Record<string, any> =
      outletSnap.exists && outletSnap.data()?.categoryRules ? outletSnap.data()!.categoryRules : {};

    const nowMs = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    let totalThresholdMs: number, recentThresholdMs: number, pastThresholdMs: number;
    let labelPeriod = '14 days';

    switch (dateRange) {
      case '7d':
        totalThresholdMs = nowMs - 7 * msPerDay;
        recentThresholdMs = nowMs - 3 * msPerDay;
        pastThresholdMs = nowMs - 7 * msPerDay;
        labelPeriod = '3 days';
        break;
      case '90d':
        totalThresholdMs = nowMs - 90 * msPerDay;
        recentThresholdMs = nowMs - 45 * msPerDay;
        pastThresholdMs = nowMs - 90 * msPerDay;
        labelPeriod = '45 days';
        break;
      case 'all':
        totalThresholdMs = 0;
        recentThresholdMs = nowMs - 60 * msPerDay;
        pastThresholdMs = nowMs - 120 * msPerDay;
        labelPeriod = '60 days';
        break;
      default: // 30d
        totalThresholdMs = nowMs - 30 * msPerDay;
        recentThresholdMs = nowMs - 14 * msPerDay;
        pastThresholdMs = nowMs - 28 * msPerDay;
        labelPeriod = '14 days';
    }

    const totalThreshold = new Date(totalThresholdMs);
    const recentThreshold = new Date(recentThresholdMs);
    const pastThreshold = new Date(pastThresholdMs);

    const categoryStats: Record<string, { mentions: number; ratingsRecent: number[]; ratingsPast: number[] }> = {};
    const customerRiskScores: Record<string, number> = {};
    let outletRiskScore = 0;

    for (const doc of reviewsSnap.docs) {
      const data = doc.data();
      let cat = data.issueCategory as string;
      if (!cat) continue;

      // Apply category merge rules
      if (categoryRules[cat]?.mappedTo) {
        cat = categoryRules[cat].mappedTo;
      }

      if (!categoryStats[cat]) {
        categoryStats[cat] = { mentions: 0, ratingsRecent: [], ratingsPast: [] };
      }

      // Always use original Google review timestamp
      const reviewTime = this.toDate(data.reviewTimestamp) ?? new Date();

      if (reviewTime >= totalThreshold) {
        categoryStats[cat].mentions++;
      }
      if (reviewTime >= recentThreshold) {
        categoryStats[cat].ratingsRecent.push(Number(data.rating) || 3);
      } else if (reviewTime >= pastThreshold && reviewTime < recentThreshold) {
        categoryStats[cat].ratingsPast.push(Number(data.rating) || 3);
      }

      // Risk scoring for customers with low ratings
      const rating = Number(data.rating) || 3;
      if (rating <= 3) {
        const customer = data.customerName || 'Anonymous';
        customerRiskScores[customer] = (customerRiskScores[customer] || 0) + (4 - rating);
        outletRiskScore += (4 - rating);
      }
    }

    const adminCategories: any[] = [];
    const improvedOutlets: any[] = [];
    const decliningOutlets: any[] = [];

    Object.entries(categoryStats).forEach(([name, stats], idx) => {
      const avgRecent =
        stats.ratingsRecent.length > 0
          ? stats.ratingsRecent.reduce((a, b) => a + b, 0) / stats.ratingsRecent.length
          : 0;
      const avgPast =
        stats.ratingsPast.length > 0
          ? stats.ratingsPast.reduce((a, b) => a + b, 0) / stats.ratingsPast.length
          : 0;

      let trendStr = '0%';
      let improvementDiff = 0;
      if (avgPast > 0 && avgRecent > 0) {
        const percentChange = ((avgRecent - avgPast) / avgPast) * 100;
        trendStr = percentChange > 0 ? `+${percentChange.toFixed(1)}%` : `${percentChange.toFixed(1)}%`;
        improvementDiff = avgRecent - avgPast;
      } else if (avgRecent > 0 && avgPast === 0) {
        trendStr = '+100%';
        improvementDiff = avgRecent;
      }

      let status = 'Active';
      const manualStatus = categoryRules[name]?.status || null;
      if (manualStatus) {
        status = manualStatus;
      } else if (avgRecent > 0 && avgRecent <= 2.5) {
        status = 'Operational Risk';
      } else if (avgRecent > 0 && avgRecent <= 3.5) {
        status = 'Important';
      }

      const displayName = categoryRules[name]?.newName || name;
      const customNote = categoryRules[name]?.customNote || null;

      adminCategories.push({ id: `CAT-${idx}`, name: displayName, originalName: name, mentions: stats.mentions, trend: trendStr, status, customNote });

      if (improvementDiff > 0.5) {
        improvedOutlets.push({ name: displayName, improvement: `+${improvementDiff.toFixed(1)}★`, period: labelPeriod });
      } else if (improvementDiff < -0.5) {
        decliningOutlets.push({ name: displayName, improvement: `${improvementDiff.toFixed(1)}★`, period: labelPeriod });
      }
    });

    if (adminCategories.length === 0) {
      adminCategories.push({ id: 'CAT-1', name: 'Service Speed', mentions: 0, trend: '0%', status: 'Active' });
    }

    const alerts: any[] = [];
    if (decliningOutlets.length > 0) {
      alerts.push({ id: 'AL-1', type: 'pattern', title: 'Negative review spike alert', description: `${decliningOutlets[0].name} has seen a significant drop in ratings.`, severity: 'high' });
    }
    const highRiskCat = adminCategories.find((c) => c.status === 'Operational Risk');
    if (highRiskCat) {
      alerts.push({ id: 'AL-2', type: 'pattern', title: 'Low rating pattern alert', description: `${highRiskCat.name} is consistently receiving low ratings.`, severity: 'high' });
    }
    if (alerts.length === 0) {
      alerts.push({ id: 'AL-3', type: 'pattern', title: 'Monitoring issues', description: 'System is tracking new patterns. No critical alerts.', severity: 'medium' });
    }

    const customerRiskRanking = Object.entries(customerRiskScores)
      .map(([name, score]) => ({ name, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return {
      alerts,
      adminCategories,
      improvedOutlets,
      decliningOutlets,
      customerRiskRanking,
      outletRiskScore,
    };
  }

  async updateCategoryRules(outletId: string, categoryName: string, actionType: string, inputValue?: string) {
    const db = this.firebaseService.getDb();
    await validateActiveOutlet(db, outletId);
    const outletRef = db.collection('outlets').doc(outletId);
    const outletSnap = await outletRef.get();
    const categoryRules = outletSnap.exists && outletSnap.data()?.categoryRules ? { ...outletSnap.data()!.categoryRules } : {};

    if (!categoryRules[categoryName]) categoryRules[categoryName] = {};

    switch (actionType) {
      case 'Rename category':
        categoryRules[categoryName].newName = inputValue;
        break;
      case 'Merge into similar category':
      case 'Correct AI misclassification':
        categoryRules[categoryName].mappedTo = inputValue;
        break;
      case 'Tag as Operational Risk':
        categoryRules[categoryName].status = 'Operational Risk';
        break;
      case 'Mark as Important':
        categoryRules[categoryName].status = 'Important';
        break;
      case 'Add custom insight note':
        categoryRules[categoryName].customNote = inputValue;
        break;
    }

    await outletRef.update({ categoryRules });
    return { success: true, categoryRules };
  }
}
