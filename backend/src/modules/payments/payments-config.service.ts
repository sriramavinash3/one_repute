import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PaymentsConfigService {
  constructor(private readonly configService: ConfigService) {}

  get razorpayKeyId(): string {
    return this.configService.get<string>('RAZORPAY_KEY_ID') || '';
  }

  get razorpayKeySecret(): string {
    return this.configService.get<string>('RAZORPAY_KEY_SECRET') || '';
  }

  get razorpayWebhookSecret(): string {
    return this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') || 'your_razorpay_webhook_secret';
  }

  get trialDays(): number {
    return 7;
  }

  get planMappings() {
    return [
      {
        planId: 'plan_starter',
        country: 'IN',
        currency: 'INR',
        monthlyPrice: 1299,
        quarterlyPrice: 3899,
        annualPrice: 15599,
        razorpayMonthlyPlanId: 'plan_starter_in_monthly',
        razorpayQuarterlyPlanId: 'plan_starter_in_quarterly',
        razorpayAnnualPlanId: 'plan_starter_in_annual',
      },
      {
        planId: 'plan_growth',
        country: 'IN',
        currency: 'INR',
        monthlyPrice: 1999,
        quarterlyPrice: 4999,
        annualPrice: 17999,
        razorpayMonthlyPlanId: 'plan_growth_in_monthly',
        razorpayQuarterlyPlanId: 'plan_growth_in_quarterly',
        razorpayAnnualPlanId: 'plan_growth_in_annual',
      },
      {
        planId: 'plan_premium',
        country: 'IN',
        currency: 'INR',
        monthlyPrice: 2999,
        quarterlyPrice: 7999,
        annualPrice: 25999,
        razorpayMonthlyPlanId: 'plan_premium_in_monthly',
        razorpayQuarterlyPlanId: 'plan_premium_in_quarterly',
        razorpayAnnualPlanId: 'plan_premium_in_annual',
      },
      {
        planId: 'plan_starter',
        country: 'US',
        currency: 'USD',
        monthlyPrice: 29,
        quarterlyPrice: 79,
        annualPrice: 339,
        razorpayMonthlyPlanId: 'plan_starter_us_monthly',
        razorpayQuarterlyPlanId: 'plan_starter_us_quarterly',
        razorpayAnnualPlanId: 'plan_starter_us_annual',
      },
      {
        planId: 'plan_growth',
        country: 'US',
        currency: 'USD',
        monthlyPrice: 39,
        quarterlyPrice: 109,
        annualPrice: 399,
        razorpayMonthlyPlanId: 'plan_growth_us_monthly',
        razorpayQuarterlyPlanId: 'plan_growth_us_quarterly',
        razorpayAnnualPlanId: 'plan_growth_us_annual',
      },
      {
        planId: 'plan_premium',
        country: 'US',
        currency: 'USD',
        monthlyPrice: 49,
        quarterlyPrice: 139,
        annualPrice: 499,
        razorpayMonthlyPlanId: 'plan_premium_us_monthly',
        razorpayQuarterlyPlanId: 'plan_premium_us_quarterly',
        razorpayAnnualPlanId: 'plan_premium_us_annual',
      },
    ];
  }
}
