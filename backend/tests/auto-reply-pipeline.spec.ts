/**
 * tests/auto-reply-pipeline.spec.ts
 *
 * End-to-End Test Matrix Suite for Automated Review Reply Pipeline.
 * Tests automation trigger conditions, AI generation, Google Business Profile
 * reply publishing, OAuth error handling, idempotency, and dual-write persistence.
 */

import { AutomationService } from '../src/modules/workflow/automation.service';
import { ReviewReplyService } from '../src/modules/reviews/review-reply.service';

describe('Automated Review Reply Pipeline — End-to-End Test Matrix', () => {
  let automationService: AutomationService;
  let replyService: ReviewReplyService;
  let firebaseServiceMock: any;
  let prismaServiceMock: any;
  let aiServiceMock: any;
  let googleBusinessServiceMock: any;
  let notificationServiceMock: any;
  let whatsappServiceMock: any;
  let configServiceMock: any;

  let store: Record<string, any>;
  let outletStore: Record<string, any>;

  beforeEach(() => {
    store = {};
    outletStore = {
      outlet_1: {
        id: 'outlet_1',
        name: 'Grand Bistro',
        autoResponseEnabled: true,
        minRatingForAutoResponse: 4,
        googleAccountId: 'accounts/12345',
        googleLocationId: 'locations/67890',
        googleRefreshToken: 'valid-refresh-token',
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
          return {
            doc: () => ({ get: jest.fn(), update: jest.fn() }),
            where: () => ({ limit: () => ({ get: jest.fn().mockResolvedValue({ docs: [] }) }) }),
          };
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
        text: 'Thank you for visiting Grand Bistro! We are thrilled you enjoyed your experience.',
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
      get: jest.fn((key: string) => {
        if (key === 'APP_URL') return 'https://app.onerepute.com';
        return null;
      }),
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
  });

  // ---------------------------------------------------------------------------
  // Test 1: 5-Star Review -> Automatic Reply Published
  // ---------------------------------------------------------------------------
  it('Test 1: 5-star review automatically generates AI reply and publishes to Google Business Profile', async () => {
    store['rev_5star'] = {
      id: 'rev_5star',
      outletId: 'outlet_1',
      rating: 5,
      text: 'Amazing food and excellent service!',
      customerName: 'John Doe',
      rawName: 'accounts/12345/locations/67890/reviews/rev_5star',
      status: 'pending',
    };

    await automationService.onReviewReceived({
      reviewId: 'rev_5star',
      outletId: 'outlet_1',
      outletName: 'Grand Bistro',
      rating: 5,
      reviewText: 'Amazing food and excellent service!',
      customerName: 'John Doe',
    });

    expect(aiServiceMock.generateReviewReply).toHaveBeenCalledWith({
      outletName: 'Grand Bistro',
      customerName: 'John Doe',
      rating: 5,
      reviewText: 'Amazing food and excellent service!',
    });

    expect(googleBusinessServiceMock.postReply).toHaveBeenCalledWith(
      'accounts/12345',
      'locations/67890',
      'valid-refresh-token',
      'accounts/12345/locations/67890/reviews/rev_5star',
      'Thank you for visiting Grand Bistro! We are thrilled you enjoyed your experience.',
    );

    expect(store['rev_5star'].status).toBe('responded');
    expect(store['rev_5star'].repliedAt).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Test 2: 1-Star Review -> Verify Automation Rules (No Auto-Reply, Escalation Triggered)
  // ---------------------------------------------------------------------------
  it('Test 2: 1-star review generates AI suggestion (status: suggested), sends alert, does not auto-publish to Google', async () => {
    store['rev_1star'] = {
      id: 'rev_1star',
      outletId: 'outlet_1',
      rating: 1,
      text: 'Terrible service and cold food.',
      customerName: 'Alice Smith',
      rawName: 'accounts/12345/locations/67890/reviews/rev_1star',
      status: 'pending',
    };

    await automationService.onReviewReceived({
      reviewId: 'rev_1star',
      outletId: 'outlet_1',
      outletName: 'Grand Bistro',
      rating: 1,
      reviewText: 'Terrible service and cold food.',
      customerName: 'Alice Smith',
      managerPhone: '+919999999999',
    });

    // Google API reply MUST NOT be called because rating 1 < minRating 4
    expect(googleBusinessServiceMock.postReply).not.toHaveBeenCalled();

    // AI reply generated as suggestion for manual approval
    expect(store['rev_1star'].status).toBe('suggested');
    expect(store['rev_1star'].aiResponse).toBeDefined();

    // Negative review alert sent to manager
    expect(notificationServiceMock.sendNegativeReviewAlert).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 3: Review Without Text -> Handles Star-Only Rating
  // ---------------------------------------------------------------------------
  it('Test 3: Review without text generates valid non-empty AI reply and publishes', async () => {
    store['rev_notext'] = {
      id: 'rev_notext',
      outletId: 'outlet_1',
      rating: 5,
      text: '',
      customerName: 'Bob Johnson',
      rawName: 'accounts/12345/locations/67890/reviews/rev_notext',
      status: 'pending',
    };

    await automationService.onReviewReceived({
      reviewId: 'rev_notext',
      outletId: 'outlet_1',
      outletName: 'Grand Bistro',
      rating: 5,
      reviewText: '',
      customerName: 'Bob Johnson',
    });

    expect(googleBusinessServiceMock.postReply).toHaveBeenCalled();
    expect(store['rev_notext'].status).toBe('responded');
  });

  // ---------------------------------------------------------------------------
  // Test 4: Review With Long Text -> Handles Generation Correctly
  // ---------------------------------------------------------------------------
  it('Test 4: Review with long text processes safely within limits', async () => {
    const longText = 'Great place '.repeat(200);
    store['rev_long'] = {
      id: 'rev_long',
      outletId: 'outlet_1',
      rating: 4,
      text: longText,
      customerName: 'Charlie Brown',
      rawName: 'accounts/12345/locations/67890/reviews/rev_long',
      status: 'pending',
    };

    await automationService.onReviewReceived({
      reviewId: 'rev_long',
      outletId: 'outlet_1',
      outletName: 'Grand Bistro',
      rating: 4,
      reviewText: longText,
      customerName: 'Charlie Brown',
    });

    expect(googleBusinessServiceMock.postReply).toHaveBeenCalled();
    expect(store['rev_long'].status).toBe('responded');
  });

  // ---------------------------------------------------------------------------
  // Test 5: AI Provider Temporary Failure -> Status Set to Failed with Error
  // ---------------------------------------------------------------------------
  it('Test 5: AI provider failure sets status to failed with diagnostic message', async () => {
    aiServiceMock.generateReviewReply.mockRejectedValueOnce(new Error('AI API rate limit exceeded'));

    store['rev_aifail'] = {
      id: 'rev_aifail',
      outletId: 'outlet_1',
      rating: 5,
      text: 'Awesome experience',
      customerName: 'David Lee',
      status: 'pending',
    };

    await automationService.onReviewReceived({
      reviewId: 'rev_aifail',
      outletId: 'outlet_1',
      outletName: 'Grand Bistro',
      rating: 5,
      reviewText: 'Awesome experience',
      customerName: 'David Lee',
    });

    expect(store['rev_aifail'].status).toBe('failed');
    expect(store['rev_aifail'].lastError).toContain('AI reply generation failed');
  });

  // ---------------------------------------------------------------------------
  // Test 6 & 7: Invalid Google Authorization / Expired Token Handling
  // ---------------------------------------------------------------------------
  it('Test 6 & 7: Google OAuth invalid_grant marks review as failed with clear message', async () => {
    googleBusinessServiceMock.postReply.mockRejectedValueOnce(new Error('invalid_grant: Google authorization revoked'));

    store['rev_authfail'] = {
      id: 'rev_authfail',
      outletId: 'outlet_1',
      rating: 5,
      text: 'Superb food',
      customerName: 'Eva Green',
      rawName: 'accounts/12345/locations/67890/reviews/rev_authfail',
      status: 'pending',
    };

    await automationService.onReviewReceived({
      reviewId: 'rev_authfail',
      outletId: 'outlet_1',
      outletName: 'Grand Bistro',
      rating: 5,
      reviewText: 'Superb food',
      customerName: 'Eva Green',
    });

    expect(store['rev_authfail'].status).toBe('failed');
    expect(store['rev_authfail'].lastError).toContain('invalid_grant');
  });

  // ---------------------------------------------------------------------------
  // Test 8: Duplicate Trigger -> Idempotency Prevents Duplicate Google Reply
  // ---------------------------------------------------------------------------
  it('Test 8: Idempotency guard skips duplicate Google API call if review is already responded', async () => {
    store['rev_dup'] = {
      id: 'rev_dup',
      outletId: 'outlet_1',
      rating: 5,
      text: 'Loved it!',
      customerName: 'Frank White',
      rawName: 'accounts/12345/locations/67890/reviews/rev_dup',
      status: 'responded',
      aiResponse: 'Thank you for visiting Grand Bistro! We are thrilled you enjoyed your experience.',
    };

    const res = await replyService.postDirectReply('outlet_1', 'rev_dup', 'Thank you for visiting Grand Bistro! We are thrilled you enjoyed your experience.');

    expect(res.success).toBe(true);
    expect(googleBusinessServiceMock.postReply).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 9: Multiple Outlets -> Uses Correct Credentials and Location
  // ---------------------------------------------------------------------------
  it('Test 9: Reply uses target outlet credentials and location ID', async () => {
    outletStore['outlet_2'] = {
      id: 'outlet_2',
      name: 'Downtown Diner',
      autoResponseEnabled: true,
      minRatingForAutoResponse: 4,
      googleAccountId: 'accounts/99999',
      googleLocationId: 'locations/88888',
      googleRefreshToken: 'token-downtown',
      status: 'active',
    };

    store['rev_outlet2'] = {
      id: 'rev_outlet2',
      outletId: 'outlet_2',
      rating: 5,
      text: 'Great burgers',
      customerName: 'Grace Hopper',
      rawName: 'accounts/99999/locations/88888/reviews/rev_outlet2',
      status: 'pending',
    };

    await automationService.onReviewReceived({
      reviewId: 'rev_outlet2',
      outletId: 'outlet_2',
      outletName: 'Downtown Diner',
      rating: 5,
      reviewText: 'Great burgers',
      customerName: 'Grace Hopper',
    });

    expect(googleBusinessServiceMock.postReply).toHaveBeenCalledWith(
      'accounts/99999',
      'locations/88888',
      'token-downtown',
      'accounts/99999/locations/88888/reviews/rev_outlet2',
      expect.any(String),
    );
  });

  // ---------------------------------------------------------------------------
  // Test 10: Reprocessing Existing Eligible Review
  // ---------------------------------------------------------------------------
  it('Test 10: reprocessReview re-evaluates existing review and publishes to Google', async () => {
    store['rev_existing'] = {
      id: 'rev_existing',
      outletId: 'outlet_1',
      rating: 5,
      text: 'Old review needing reply',
      customerName: 'Henry Ford',
      rawName: 'accounts/12345/locations/67890/reviews/rev_existing',
      status: 'pending',
    };

    const res = await replyService.reprocessReview('rev_existing');

    expect(res.success).toBe(true);
    expect(res.published).toBe(true);
    expect(googleBusinessServiceMock.postReply).toHaveBeenCalled();
    expect(store['rev_existing'].status).toBe('responded');
  });

  // ---------------------------------------------------------------------------
  // Test 11 & 12: Google API Success Persists State Correctly in DB
  // ---------------------------------------------------------------------------
  it('Test 11 & 12: Confirmed Google response updates database state to responded', async () => {
    store['rev_confirm'] = {
      id: 'rev_confirm',
      outletId: 'outlet_1',
      rating: 4,
      text: 'Good food',
      customerName: 'Ian Malcolm',
      rawName: 'accounts/12345/locations/67890/reviews/rev_confirm',
      status: 'pending',
    };

    const res = await replyService.postDirectReply('outlet_1', 'rev_confirm', 'Thanks Ian!');

    expect(res.success).toBe(true);
    expect(store['rev_confirm'].status).toBe('responded');
    expect(store['rev_confirm'].aiResponse).toBe('Thanks Ian!');
    expect(store['rev_confirm'].repliedAt).toBeDefined();
  });
});
