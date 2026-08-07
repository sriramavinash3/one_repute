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
        monthlyPrice: 999,
        annualPrice: 9999,
        razorpayMonthlyPlanId: 'plan_TMzSnSpZurSsaj',
        razorpayAnnualPlanId: 'plan_TMzSnh2gFL378S',
      },
      {
        planId: 'plan_growth',
        country: 'IN',
        currency: 'INR',
        monthlyPrice: 1999,
        annualPrice: 19999,
        razorpayMonthlyPlanId: 'plan_TMzQWSOmpu6KQ2',
        razorpayAnnualPlanId: 'plan_TMzQWgEBn2IkjK',
      },
      {
        planId: 'plan_premium',
        country: 'IN',
        currency: 'INR',
        monthlyPrice: 2999,
        annualPrice: 29999,
        razorpayMonthlyPlanId: 'plan_TMzQX3f4v5KbJ5',
        razorpayAnnualPlanId: 'plan_TMzQXH2sIjN7mJ',
      },
      {
        planId: 'plan_starter',
        country: 'US',
        currency: 'USD',
        monthlyPrice: 29,
        annualPrice: 290,
        razorpayMonthlyPlanId: 'plan_TMzQXc5SECtlgu',
        razorpayAnnualPlanId: 'plan_TMzQXsMZxYBSOo',
      },
      {
        planId: 'plan_growth',
        country: 'US',
        currency: 'USD',
        monthlyPrice: 79,
        annualPrice: 790,
        razorpayMonthlyPlanId: 'plan_TMzQYA7VdrEFPH',
        razorpayAnnualPlanId: 'plan_TMzQYPeGjHb81b',
      },
      {
        planId: 'plan_premium',
        country: 'US',
        currency: 'USD',
        monthlyPrice: 199,
        annualPrice: 1990,
        razorpayMonthlyPlanId: 'plan_TMzQYldq2RaDL7',
        razorpayAnnualPlanId: 'plan_TMzQZ3EOMHiOXr',
      },
    ];
  }
}
