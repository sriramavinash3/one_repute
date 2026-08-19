/**
 * tests/trial-lifecycle.spec.ts
 *
 * Automated Unit Test Suite for Product-Wide 15-Day Trial Period from Onboarding:
 * - TRIAL_DURATION_DAYS = 15 calendar days
 * - Calculated strictly from user/workspace onboarding timestamp
 * - Backend authoritative enforcement
 * - Existing users preservation (no arbitrary reset)
 * - Paid plan precedence over trial expiry
 * - Preserved 10 auto-reply and 30 AI suggestion quotas
 */

import { SubscriptionService } from '../src/modules/payments/subscription.service';
import { PaymentsConfigService, TRIAL_DURATION_DAYS } from '../src/modules/payments/payments-config.service';

describe('Product-Wide 15-Day Trial Period from Onboarding Test Suite', () => {
  let subscriptionService: SubscriptionService;
  let paymentsConfigService: PaymentsConfigService;
  let firebaseServiceMock: any;
  let planServiceMock: any;
  let customerStore: Record<string, any>;
  let usageStore: Record<string, any>;

  beforeEach(() => {
    customerStore = {};
    usageStore = {};

    firebaseServiceMock = {
      getDb: jest.fn().mockReturnValue({
        collection: (name: string) => {
          if (name === 'customers') {
            return {
              doc: (id: string) => ({
                get: jest.fn().mockImplementation(async () => ({
                  exists: !!customerStore[id],
                  data: () => customerStore[id],
                })),
                set: jest.fn().mockImplementation(async (data: any, options: any) => {
                  customerStore[id] = { ...(customerStore[id] || {}), ...data };
                }),
              }),
            };
          }
          if (name === 'customerUsage') {
            return {
              doc: (id: string) => ({
                get: jest.fn().mockImplementation(async () => ({
                  exists: !!usageStore[id],
                  data: () => usageStore[id],
                })),
              }),
            };
          }
          if (name === 'invoices') {
            return {
              where: () => ({ get: jest.fn().mockResolvedValue({ docs: [] }) }),
            };
          }
          return { doc: () => ({ get: jest.fn(), set: jest.fn() }) };
        },
      }),
    };

    planServiceMock = {
      getAllPlans: jest.fn().mockResolvedValue([]),
    };

    paymentsConfigService = new PaymentsConfigService({
      get: jest.fn(),
    } as any);

    subscriptionService = new SubscriptionService(
      firebaseServiceMock,
      {} as any,
      planServiceMock,
      paymentsConfigService,
    );
  });

  // 1. Authoritative Constant Test
  it('PaymentsConfigService returns authoritative TRIAL_DURATION_DAYS = 15', () => {
    expect(TRIAL_DURATION_DAYS).toBe(15);
    expect(paymentsConfigService.trialDays).toBe(15);
  });

  // 2. New Onboarding Lifecycle Test (Day 0, 1, 7, 14, 15)
  it('New Onboarding Lifecycle: Day 0 starts with 15 remaining trial days calculated from onboardingAt', async () => {
    const onboardingAt = new Date();
    customerStore['cust_new'] = {
      id: 'cust_new',
      email: 'new@example.com',
      subscriptionStatus: 'trialing',
      onboardingAt,
      createdAt: onboardingAt,
      isTrial: true,
    };

    const info = await subscriptionService.getBillingInfo('cust_new');

    expect(info.subscription.status).toBe('trialing');
    expect(info.subscription.remainingTrialDays).toBe(15);
    expect(info.subscription.trialDurationDays).toBe(15);

    const expectedEndDate = new Date(onboardingAt.getTime() + 15 * 24 * 60 * 60 * 1000);
    expect(new Date(info.subscription.trialEndDate).toISOString()).toBe(expectedEndDate.toISOString());
  });

  it('During Trial (Day 7): Correct remaining days are derived from onboardingAt', async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    customerStore['cust_day7'] = {
      id: 'cust_day7',
      email: 'day7@example.com',
      subscriptionStatus: 'trialing',
      onboardingAt: sevenDaysAgo,
      createdAt: sevenDaysAgo,
      isTrial: true,
    };

    const info = await subscriptionService.getBillingInfo('cust_day7');

    expect(info.subscription.status).toBe('trialing');
    expect(info.subscription.remainingTrialDays).toBe(8);
  });

  it('Trial Expiration (Day 15+): Transitioned to expired when trial date passes', async () => {
    const sixteenDaysAgo = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000);
    customerStore['cust_exp'] = {
      id: 'cust_exp',
      email: 'expired@example.com',
      subscriptionStatus: 'trialing',
      onboardingAt: sixteenDaysAgo,
      createdAt: sixteenDaysAgo,
      isTrial: true,
    };

    const info = await subscriptionService.getBillingInfo('cust_exp');

    expect(info.subscription.status).toBe('expired');
    expect(info.subscription.remainingTrialDays).toBe(0);
  });

  // 3. Existing User Preservation Test (No arbitrary reset)
  it('Existing Users: Account onboarded 20 days ago remains expired and is NOT granted a new 15-day trial', async () => {
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    customerStore['cust_old'] = {
      id: 'cust_old',
      email: 'olduser@example.com',
      subscriptionStatus: 'trialing',
      onboardingAt: twentyDaysAgo,
      createdAt: twentyDaysAgo,
      isTrial: true,
    };

    const info = await subscriptionService.getBillingInfo('cust_old');

    expect(info.subscription.status).toBe('expired');
    expect(info.subscription.remainingTrialDays).toBe(0);
  });

  // 4. Paid Subscription Precedence Test
  it('Paid Precedence: Paid subscription status active takes precedence over onboarding timestamp > 15 days', async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    customerStore['cust_paid'] = {
      id: 'cust_paid',
      email: 'paid@example.com',
      subscriptionStatus: 'active',
      plan: 'plan_growth',
      onboardingAt: thirtyDaysAgo,
      createdAt: thirtyDaysAgo,
    };

    const info = await subscriptionService.getBillingInfo('cust_paid');

    expect(info.subscription.status).toBe('active');
    expect(info.subscription.plan).toBe('plan_growth');
  });

  // 5. Preserved Trial Quotas Test
  it('Preserved Quotas: Returns trialAutoReplyLimit = 10 and trialSuggestionLimit = 30', async () => {
    customerStore['cust_quotas'] = {
      id: 'cust_quotas',
      subscriptionStatus: 'trialing',
      onboardingAt: new Date(),
    };
    usageStore['cust_quotas'] = {
      trial_auto_reply_count: 4,
      trial_ai_suggestion_count: 12,
    };

    const info = await subscriptionService.getBillingInfo('cust_quotas');

    expect(info.usage.trialAutoRepliesUsed).toBe(4);
    expect(info.usage.trialAutoReplyLimit).toBe(10);
    expect(info.usage.trialSuggestionsUsed).toBe(12);
    expect(info.usage.trialSuggestionLimit).toBe(30);
  });
});
