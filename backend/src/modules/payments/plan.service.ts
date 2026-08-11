import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { FirebaseService } from '../firebase/firebase.service';
import { PaymentsConfigService } from './payments-config.service';

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly configService: PaymentsConfigService,
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

  getCurrencySymbol(currency: string): string {
    if (currency === 'INR') return '₹';
    if (currency === 'USD') return '$';
    if (currency === 'EUR') return '€';
    if (currency === 'GBP') return '£';
    return currency || '₹';
  }
}
