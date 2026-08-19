import { Injectable, Logger, Optional } from '@nestjs/common';
import { Request } from 'express';
import { FirebaseService } from '../firebase/firebase.service';
import { PaymentsConfigService } from './payments-config.service';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly configService: PaymentsConfigService,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  detectCountry(req: Request, customerData?: any, userData?: any, outletData?: any): string {
    if (customerData && customerData.billingCountry) {
      this.logger.log(`Resolved country from billing records: ${customerData.billingCountry}`);
      return this.normalizeCountryCode(customerData.billingCountry);
    }

    if (userData && userData.country) {
      this.logger.log(`Resolved country from account profile: ${userData.country}`);
      return this.normalizeCountryCode(userData.country);
    }

    if (outletData && outletData.country) {
      this.logger.log(`Resolved country from outlet settings: ${outletData.country}`);
      return this.normalizeCountryCode(outletData.country);
    }

    if (req) {
      const ipCountry = req.headers['cf-ipcountry'] || req.headers['x-country-code'] || req.headers['x-ip-country'];
      if (ipCountry && typeof ipCountry === 'string' && ipCountry.trim().length === 2) {
        const code = ipCountry.trim().toUpperCase();
        this.logger.log(`Resolved country from IP headers: ${code}`);
        return code;
      }

      const acceptLang = (req.headers['accept-language'] as string) || '';
      if (acceptLang) {
        const match = acceptLang.match(/([a-zA-Z]{2})-([a-zA-Z]{2})/);
        if (match && match[2]) {
          const code = match[2].toUpperCase();
          this.logger.log(`Resolved country from Accept-Language header: ${code}`);
          return code;
        }
      }

      const clientTimezone = req.body?.timezone || req.query?.timezone || req.headers['x-timezone'] || '';
      if (clientTimezone && typeof clientTimezone === 'string') {
        const tz = clientTimezone.toLowerCase();
        if (tz.includes('kolkata') || tz.includes('calcutta') || tz.includes('delhi') || tz.includes('mumbai') || tz.includes('india') || tz.includes('ist')) {
          this.logger.log('Resolved country from timezone fallback: IN');
          return 'IN';
        }
      }
    }

    return 'IN';
  }

  normalizeCountryCode(code: string): string {
    if (!code || typeof code !== 'string') return 'IN';
    const val = code.trim().toUpperCase();
    if (val === 'INDIA') return 'IN';
    if (val === 'UNITED STATES' || val === 'USA') return 'US';
    if (val.length === 2) return val;
    return 'IN';
  }

  async getPlanPrice(planId: string, countryCode: string = 'IN') {
    try {
      const db = this.firebaseService.getDb();
      const docId = `${planId}_${countryCode.toUpperCase()}`;
      const doc = await db.collection('planPrices').doc(docId).get();
      if (doc.exists) {
        return doc.data();
      }

      const fallbackId = countryCode.toUpperCase() === 'IN' ? `${planId}_IN` : `${planId}_US`;
      const fallbackDoc = await db.collection('planPrices').doc(fallbackId).get();
      if (fallbackDoc.exists) {
        return fallbackDoc.data();
      }
    } catch (err: any) {
      this.logger.warn(`Failed to read plan price from Firestore: ${err.message}. Using config fallback.`);
    }

    const mapping = this.configService.planMappings.find(
      (m) => m.planId === planId && m.country === countryCode.toUpperCase()
    );
    if (mapping) {
      return mapping;
    }

    const fallbackMapping = this.configService.planMappings.find(
      (m) => m.planId === planId && m.country === (countryCode.toUpperCase() === 'IN' ? 'IN' : 'US')
    );
    if (fallbackMapping) {
      return fallbackMapping;
    }

    return {
      planId,
      country: 'IN',
      currency: 'INR',
      monthlyPrice: 1299,
      quarterlyPrice: 3899,
      annualPrice: 15599,
      razorpayMonthlyPlanId: 'plan_starter_in_monthly',
      razorpayQuarterlyPlanId: 'plan_starter_in_quarterly',
      razorpayAnnualPlanId: 'plan_starter_in_annual',
      status: 'active'
    };
  }

  get TrialLimits() {
    return {
      autoReplyLimit: 10,
      aiSuggestionLimit: 30,
    };
  }

  get CentralPlanDefinitions() {
    return [
      {
        id: 'plan_starter',
        name: 'Starter',
        sortOrder: 1,
        description: 'Essential AI review management for single outlets.',
        features: [
          '100 Monthly Review Responses',
          'Google Review Auto Reply',
          '≤2 Star Review AI Response',
          'Positive Review Replies',
          '1 Level WhatsApp Escalation',
          'Basic Sentiment Analysis',
          'Basic Dashboard & Comprehensive Report',
          '2 Team Members Limit',
        ],
        disabledFeatures: [
          'Smart QR Campaigns',
          'Competitor Tracking',
          'Reply Approval Mode',
          'Low Rating Pattern Detection',
          'Monthly Strategy Call',
        ],
        limits: {
          monthly_review_responses: 100,
          whatsapp_escalation_levels: 1,
          competitor_tracking: 0,
          multi_user_access: 2,
          smart_qr: false,
        }
      },
      {
        id: 'plan_growth',
        name: 'Growth',
        sortOrder: 2,
        popular: true,
        description: 'Advanced automation and insights for expanding brands.',
        features: [
          '250 Monthly Review Responses',
          'Google Review Auto Reply',
          '≤2 Star Review AI Response',
          'Positive Review Replies',
          '2 Levels WhatsApp Escalation',
          'Smart QR Campaigns',
          'Sentiment & Review Trend Insights',
          'Up to 2 Competitors Tracking',
          '3 Team Members Limit',
          'Customer Issue Categories',
        ],
        disabledFeatures: [
          'Reply Approval Mode',
          'Monthly Strategy Call',
          'Premium Support Priority',
        ],
        limits: {
          monthly_review_responses: 250,
          whatsapp_escalation_levels: 2,
          competitor_tracking: 2,
          multi_user_access: 3,
          smart_qr: true,
        }
      },
      {
        id: 'plan_premium',
        name: 'Premium',
        sortOrder: 3,
        description: 'Enterprise-grade reputation control for multi-chain outlets.',
        features: [
          '500 Monthly Review Responses',
          'Google Review Auto Reply',
          '≤2 Star Review AI Response',
          'Positive Review Replies',
          '3 Levels WhatsApp Escalation',
          'Smart QR Campaigns',
          'Advanced Sentiment Analysis',
          'Up to 5 Competitors Tracking',
          '5 Team Members Limit',
          'Reply Approval Mode',
          'Low Rating Pattern Detection',
          'Monthly Strategy Call',
          'Premium Support Priority',
        ],
        disabledFeatures: [],
        limits: {
          monthly_review_responses: 500,
          whatsapp_escalation_levels: 3,
          competitor_tracking: 5,
          multi_user_access: 5,
          smart_qr: true,
        }
      }
    ];
  }


  private allPlansCache = new Map<string, { data: any; expiresAt: number }>();

  async getAllPlans(countryCode: string = 'IN') {
    const normCountry = countryCode.toUpperCase();
    const cacheKey = `plans:central:${normCountry}`;

    if (this.cacheService) {
      try {
        const cached = await this.cacheService.get(cacheKey);
        if (cached) return cached;
      } catch {}
    }

    const memoryCached = this.allPlansCache.get(normCountry);
    if (memoryCached && memoryCached.expiresAt > Date.now()) {
      return memoryCached.data;
    }

    try {
      const db = this.firebaseService.getDb();
      let dbPlansMap = new Map();
      
      try {
        const plansSnap = await db.collection('plans').get();
        if (!plansSnap.empty) {
          plansSnap.docs.forEach(doc => {
            dbPlansMap.set(doc.id, doc.data());
          });
        }
      } catch (dbErr: any) {
        this.logger.warn(`Firestore plans query failed (${dbErr.message}). Using central plan definitions.`);
      }

      const central = this.CentralPlanDefinitions;
      const result = await Promise.all(
        central.map(async (cp) => {
          const dbPlan = dbPlansMap.get(cp.id) || {};
          const localized = await this.getPlanPrice(cp.id, countryCode);

          return {
            ...cp,
            ...dbPlan,
            id: cp.id,
            name: dbPlan.name || cp.name,
            sortOrder: dbPlan.sortOrder || cp.sortOrder,
            description: dbPlan.description || cp.description,
            features: dbPlan.features || cp.features,
            disabledFeatures: dbPlan.disabledFeatures || cp.disabledFeatures,
            limits: dbPlan.limits || cp.limits,
            monthlyPrice: localized.monthlyPrice,
            quarterlyPrice: localized.quarterlyPrice,
            annualPrice: localized.annualPrice,
            currency: localized.currency,
            currencySymbol: this.getCurrencySymbol(localized.currency),
            razorpayMonthlyPlanId: localized.razorpayMonthlyPlanId,
            razorpayQuarterlyPlanId: localized.razorpayQuarterlyPlanId,
            razorpayAnnualPlanId: localized.razorpayAnnualPlanId,
          };
        })
      );

      this.allPlansCache.set(normCountry, { data: result, expiresAt: Date.now() + 60 * 60 * 1000 });
      if (this.cacheService) {
        try {
          await this.cacheService.set(cacheKey, result, 3600); // 1 hour TTL
        } catch {}
      }
      return result;
    } catch (err: any) {
      this.logger.error(`Error in getAllPlans: ${err.message}. Returning static definitions.`);
      const targetCountry = countryCode.toUpperCase() === 'IN' ? 'IN' : 'US';
      const staticResult = this.CentralPlanDefinitions.map((cp) => {
        const mapping = this.configService.planMappings.find(m => m.planId === cp.id && m.country === targetCountry);
        const fallbackPrice = mapping ? {
          monthlyPrice: mapping.monthlyPrice,
          quarterlyPrice: mapping.quarterlyPrice,
          annualPrice: mapping.annualPrice,
          currency: mapping.currency,
          currencySymbol: this.getCurrencySymbol(mapping.currency),
          razorpayMonthlyPlanId: mapping.razorpayMonthlyPlanId,
          razorpayQuarterlyPlanId: mapping.razorpayQuarterlyPlanId,
          razorpayAnnualPlanId: mapping.razorpayAnnualPlanId,
        } : (targetCountry === 'IN'
          ? { monthlyPrice: 1299, quarterlyPrice: 3899, annualPrice: 15599, currency: 'INR', currencySymbol: '₹' }
          : { monthlyPrice: 29, quarterlyPrice: 79, annualPrice: 339, currency: 'USD', currencySymbol: '$' });
        return { ...cp, ...fallbackPrice };
      });
      return staticResult;
    }
  }

  private planCache = new Map<string, string>();

  async ensureRazorpayPlan(rzp: any, planId: string, billingCycle: string, priceAmount: number, currency: string): Promise<string> {
    try {
      const normalizedPlan = planId.startsWith('plan_') ? planId : `plan_${planId}`;
      const cacheKey = `${normalizedPlan}_${billingCycle}_${currency}_${priceAmount}`;
      
      if (this.planCache.has(cacheKey)) {
        const cachedPlanId = this.planCache.get(cacheKey)!;
        this.logger.log(`Using cached Razorpay Plan ID ${cachedPlanId} for ${cacheKey}`);
        return cachedPlanId;
      }

      const period = billingCycle === 'annual' ? 'yearly' : 'monthly';
      const interval = billingCycle === 'quarterly' ? 3 : 1;
      const planName = `OneRepute ${normalizedPlan.replace('plan_', '').toUpperCase()} ${billingCycle.toUpperCase()} (${currency}) - ${priceAmount}`;
      const amountInPaise = Math.round(priceAmount * 100);

      const createdPlan = await rzp.plans.create({
        period,
        interval,
        item: {
          name: planName,
          amount: amountInPaise,
          currency,
          description: `OneRepute Subscription ${planName}`,
        },
      });

      this.planCache.set(cacheKey, createdPlan.id);
      this.logger.log(`Successfully created Razorpay Plan dynamically: ${createdPlan.id} for ${normalizedPlan} (${billingCycle}) with amount ${amountInPaise} paise`);
      return createdPlan.id;
    } catch (err: any) {
      this.logger.error(`Failed to create dynamic Razorpay Plan: ${err.message}`);
      throw err;
    }
  }

  getCurrencySymbol(currency: string): string {
    if (currency === 'INR') return '₹';
    if (currency === 'USD') return '$';
    if (currency === 'EUR') return '€';
    if (currency === 'GBP') return '£';
    return currency || '₹';
  }
}
