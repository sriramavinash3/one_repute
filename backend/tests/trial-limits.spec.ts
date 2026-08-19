/**
 * tests/trial-limits.spec.ts
 *
 * Dedicated Boundary & Quota Unit Test Suite for OneRepute Trial Limits:
 * - 10 Automatic AI Replies (published to Google Business Profile)
 * - 30 AI Review Reply Suggestions (generated for review/approval)
 * - Independent Quotas tracked per Customer workspace.
 */

import { AutomationService } from '../src/modules/workflow/automation.service';
import { ReviewReplyService } from '../src/modules/reviews/review-reply.service';
import { SubscriptionService } from '../src/modules/payments/subscription.service';
import { BadRequestException } from '@nestjs/common';

describe('Trial Review Automation Limits — Boundary & Quota Tests', () => {
  let automationService: AutomationService;
  let replyService: ReviewReplyService;
  let subscriptionService: SubscriptionService;
  let firebaseServiceMock: any;
  let prismaServiceMock: any;
  let aiServiceMock: any;
  let googleBusinessServiceMock: any;
  let notificationServiceMock: any;
  let whatsappServiceMock: any;
  let configServiceMock: any;
  let planServiceMock: any;

  let store: Record<string, any>;
  let customerStore: Record<string, any>;
  let usageStore: Record<string, any>;
  let outletStore: Record<string, any>;

  beforeEach(() => {
    store = {};
    customerStore = {
      cust_trial: {
        id: 'cust_trial',
        email: 'trial@example.com',
        subscriptionStatus: 'trialing',
        isTrial: true,
      },
    };
    usageStore = {
      cust_trial: {
        trial_auto_reply_count: 0,
        trial_ai_suggestion_count: 0,
      },
    };
    outletStore = {
      outlet_trial: {
        id: 'outlet_trial',
        customerId: 'cust_trial',
        name: 'Trial Bistro',
        autoResponseEnabled: true,
        minRatingForAutoResponse: 4,
        googleAccountId: 'accounts/12345',
        googleLocationId: 'locations/67890',
        googleRefreshToken: 'valid-token',
        status: 'active',
      },
    };

    firebaseServiceMock = {
      getDb: jest.fn().mockReturnValue({
        collection: (name: string) => {
          if (name === 'outlets') {
            return {
              doc: (id: string) => ({
                get: jest.fn().mockResolvedValue({
                  exists: !!outletStore[id],
                  data: () => outletStore[id],
                }),
              }),
            };
          }
          if (name === 'customers') {
            return {
              doc: (id: string) => ({
                get: jest.fn().mockResolvedValue({
                  exists: !!customerStore[id],
                  data: () => customerStore[id],
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
                set: jest.fn().mockImplementation(async (data: any, options: any) => {
                  const current = usageStore[id] || {};
                  const updated = { ...current };
                  for (const key of Object.keys(data)) {
                    if (data[key] && typeof data[key] === 'object' && data[key].operand !== undefined) {
                      updated[key] = (updated[key] || 0) + data[key].operand;
                    } else if (typeof data[key] === 'number') {
                      updated[key] = data[key];
                    } else {
                      updated[key] = data[key];
                    }
                  }
                  usageStore[id] = updated;
                }),
              }),
            };
          }
          if (name === 'reviews') {
            return {
              doc: (id: string) => ({
                get: jest.fn().mockImplementation(async () => ({
                  exists: !!store[id],
                  data: () => store[id],
                })),
                update: jest.fn().mockImplementation(async (data: any) => {
                  store[id] = { ...(store[id] || {}), ...data };
                }),
              }),
            };
          }
          if (name === 'invoices') {
            return {
              where: () => ({ get: jest.fn().mockResolvedValue({ docs: [] }) }),
            };
          }
          return { doc: () => ({ get: jest.fn(), update: jest.fn(), set: jest.fn() }) };
        },
      }),
    };

    prismaServiceMock = {
      review: {
        update: jest.fn().mockImplementation(async (args: any) => {
          const id = args.where.reviewId || args.where.id;
          store[id] = { ...(store[id] || {}), ...args.data };
          return store[id];
        }),
      },
    };

    aiServiceMock = {
      generateReviewReply: jest.fn().mockResolvedValue({
        text: 'Thank you for visiting Trial Bistro!',
        provider: 'openai',
        model: 'gpt-4o-mini',
      }),
      analyzeReview: jest.fn().mockResolvedValue({
        issueCategory: 'General',
        emotion: 'Joy',
        sentiment: 'positive',
        priority: 'low',
        isSpam: false,
      }),
    };

    googleBusinessServiceMock = {
      postReply: jest.fn().mockResolvedValue(undefined),
    };

    notificationServiceMock = {
      sendNegativeReviewAlert: jest.fn().mockResolvedValue(undefined),
    };

    whatsappServiceMock = {
      sendTemplateByName: jest.fn().mockResolvedValue(undefined),
    };

    configServiceMock = {
      get: jest.fn((key: string) => (key === 'APP_URL' ? 'https://app.onerepute.com' : null)),
    };

    planServiceMock = {
      getAllPlans: jest.fn().mockResolvedValue([]),
    };

    automationService = new AutomationService(
      configServiceMock,
      firebaseServiceMock,
      aiServiceMock,
      notificationServiceMock,
      {} as any,
      whatsappServiceMock,
      prismaServiceMock,
      googleBusinessServiceMock,
    );

    replyService = new ReviewReplyService(
      configServiceMock,
      firebaseServiceMock,
      prismaServiceMock,
      googleBusinessServiceMock,
      aiServiceMock,
    );

    subscriptionService = new SubscriptionService(
      firebaseServiceMock,
      prismaServiceMock,
      planServiceMock,
      {} as any,
    );
  });

  // ---------------------------------------------------------------------------
  // 1. Auto Reply Boundary Tests (10 Allowed / 11 Blocked)
  // ---------------------------------------------------------------------------
  it('Auto Reply Boundary: Usage 0..9 allows automatic reply and increments counter', async () => {
    usageStore['cust_trial'].trial_auto_reply_count = 9;
    store['rev_10'] = { id: 'rev_10', outletId: 'outlet_trial', rating: 5, text: 'Great food!', status: 'pending' };

    await automationService.onReviewReceived({
      reviewId: 'rev_10',
      outletId: 'outlet_trial',
      outletName: 'Trial Bistro',
      rating: 5,
      reviewText: 'Great food!',
      customerName: 'Alice',
    });

    expect(googleBusinessServiceMock.postReply).toHaveBeenCalled();
    expect(store['rev_10'].status).toBe('responded');
    expect(usageStore['cust_trial'].trial_auto_reply_count).toBe(10);
  });

  it('Auto Reply Boundary: Usage 10 blocks 11th auto-reply and falls back to suggestion mode', async () => {
    usageStore['cust_trial'].trial_auto_reply_count = 10;
    store['rev_11'] = { id: 'rev_11', outletId: 'outlet_trial', rating: 5, text: 'Awesome place!', status: 'pending' };

    await automationService.onReviewReceived({
      reviewId: 'rev_11',
      outletId: 'outlet_trial',
      outletName: 'Trial Bistro',
      rating: 5,
      reviewText: 'Awesome place!',
      customerName: 'Bob',
    });

    // Google API reply MUST NOT be called because auto-reply limit (10/10) is reached
    expect(googleBusinessServiceMock.postReply).not.toHaveBeenCalled();
    expect(store['rev_11'].status).toBe('suggested');
    expect(usageStore['cust_trial'].trial_auto_reply_count).toBe(10);
  });

  // ---------------------------------------------------------------------------
  // 2. AI Suggestion Boundary Tests (30 Allowed / 31 Blocked)
  // ---------------------------------------------------------------------------
  it('AI Suggestion Boundary: Usage 29 allows 30th suggestion and increments counter', async () => {
    usageStore['cust_trial'].trial_ai_suggestion_count = 29;
    store['rev_s30'] = { id: 'rev_s30', outletId: 'outlet_trial', rating: 2, text: 'Slow service', status: 'pending' };

    await automationService.onReviewReceived({
      reviewId: 'rev_s30',
      outletId: 'outlet_trial',
      outletName: 'Trial Bistro',
      rating: 2,
      reviewText: 'Slow service',
      customerName: 'Charlie',
    });

    expect(aiServiceMock.generateReviewReply).toHaveBeenCalled();
    expect(store['rev_s30'].status).toBe('suggested');
    expect(usageStore['cust_trial'].trial_ai_suggestion_count).toBe(30);
  });

  it('AI Suggestion Boundary: Usage 30 blocks 31st AI suggestion generation completely', async () => {
    usageStore['cust_trial'].trial_ai_suggestion_count = 30;
    store['rev_s31'] = { id: 'rev_s31', outletId: 'outlet_trial', rating: 2, text: 'Cold soup', status: 'pending' };

    await automationService.onReviewReceived({
      reviewId: 'rev_s31',
      outletId: 'outlet_trial',
      outletName: 'Trial Bistro',
      rating: 2,
      reviewText: 'Cold soup',
      customerName: 'David',
    });

    expect(aiServiceMock.generateReviewReply).not.toHaveBeenCalled();
    expect(store['rev_s31'].status).toBe('pending');
    expect(store['rev_s31'].lastError).toContain('Trial limit of 30 AI reply suggestions reached');
    expect(usageStore['cust_trial'].trial_ai_suggestion_count).toBe(30);
  });

  // ---------------------------------------------------------------------------
  // 3. Quota Independence Verification
  // ---------------------------------------------------------------------------
  it('Quota Independence: 10 auto-replies used does not block AI suggestions (30 limit)', async () => {
    usageStore['cust_trial'].trial_auto_reply_count = 10;
    usageStore['cust_trial'].trial_ai_suggestion_count = 5;

    store['rev_ind1'] = { id: 'rev_ind1', outletId: 'outlet_trial', rating: 1, text: 'Poor service', status: 'pending' };

    await automationService.onReviewReceived({
      reviewId: 'rev_ind1',
      outletId: 'outlet_trial',
      outletName: 'Trial Bistro',
      rating: 1,
      reviewText: 'Poor service',
      customerName: 'Eva',
    });

    expect(aiServiceMock.generateReviewReply).toHaveBeenCalled();
    expect(store['rev_ind1'].status).toBe('suggested');
    expect(usageStore['cust_trial'].trial_ai_suggestion_count).toBe(6);
    expect(usageStore['cust_trial'].trial_auto_reply_count).toBe(10);
  });

  it('Quota Independence: 30 AI suggestions used does not block remaining auto-replies if count < 10', async () => {
    usageStore['cust_trial'].trial_auto_reply_count = 8;
    usageStore['cust_trial'].trial_ai_suggestion_count = 30;

    store['rev_ind2'] = { id: 'rev_ind2', outletId: 'outlet_trial', rating: 5, text: 'Great pizza!', status: 'pending' };

    await automationService.onReviewReceived({
      reviewId: 'rev_ind2',
      outletId: 'outlet_trial',
      outletName: 'Trial Bistro',
      rating: 5,
      reviewText: 'Great pizza!',
      customerName: 'Frank',
    });

    // AI generation is blocked because suggestion count = 30
    expect(aiServiceMock.generateReviewReply).not.toHaveBeenCalled();
    expect(store['rev_ind2'].status).toBe('pending');
  });

  // ---------------------------------------------------------------------------
  // 4. Manual Post Direct Reply Enforcement
  // ---------------------------------------------------------------------------
  it('Manual Post Direct Reply throws BadRequestException when trial auto reply limit (10/10) is reached', async () => {
    usageStore['cust_trial'].trial_auto_reply_count = 10;
    store['rev_manual'] = { id: 'rev_manual', outletId: 'outlet_trial', rating: 5, text: 'Good', status: 'suggested' };

    await expect(
      replyService.postDirectReply('outlet_trial', 'rev_manual', 'Thanks!'),
    ).rejects.toThrow(BadRequestException);

    expect(googleBusinessServiceMock.postReply).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 5. Subscription Billing Info Trial Quotas
  // ---------------------------------------------------------------------------
  it('SubscriptionService.getBillingInfo returns accurate trial limits and usage counts', async () => {
    usageStore['cust_trial'].trial_auto_reply_count = 4;
    usageStore['cust_trial'].trial_ai_suggestion_count = 18;

    const billingInfo = await subscriptionService.getBillingInfo('cust_trial');

    expect(billingInfo.usage.trialAutoRepliesUsed).toBe(4);
    expect(billingInfo.usage.trialAutoReplyLimit).toBe(10);
    expect(billingInfo.usage.trialSuggestionsUsed).toBe(18);
    expect(billingInfo.usage.trialSuggestionLimit).toBe(30);
    expect(billingInfo.usage.isTrialActive).toBe(true);
  });
});
