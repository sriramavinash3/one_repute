/**
 * tests/email.service.spec.ts
 * 
 * Unit tests for EmailService API and DTO dispatching.
 */

import { EmailService } from '../src/modules/email/services/email.service';

describe('EmailService', () => {
  let emailService: EmailService;
  let mockQueueService: any;
  let mockWorkerService: any;
  let mockTokenService: any;

  beforeEach(() => {
    mockQueueService = {
      addJob: jest.fn().mockResolvedValue('job_test_123'),
    };
    mockWorkerService = {
      processJob: jest.fn().mockResolvedValue({ id: 'res_123', status: 'sent', latencyMs: 42 }),
    };
    mockTokenService = {
      generateSecureToken: jest.fn().mockReturnValue({
        rawToken: 'mock_raw_token_123',
        tokenHash: 'mock_hash',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      }),
      storeToken: jest.fn().mockResolvedValue({}),
    };

    emailService = new EmailService(mockQueueService, mockWorkerService, mockTokenService);
  });

  it('should enqueue sendWelcomeEmail job', async () => {
    const result = await emailService.sendWelcomeEmail({
      recipientEmail: 'john@example.com',
      userName: 'John Doe',
    });

    expect(result.success).toBe(true);
    expect(result.jobId).toBe('job_test_123');
    expect(mockQueueService.addJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'send-welcome-email',
        data: expect.objectContaining({
          recipientEmail: 'john@example.com',
          userName: 'John Doe',
        }),
      }),
    );
  });

  it('should generate secure token for sendVerificationEmail if URL is omitted', async () => {
    const result = await emailService.sendVerificationEmail({
      recipientEmail: 'john@example.com',
      userName: 'John Doe',
    });

    expect(result.success).toBe(true);
    expect(mockTokenService.generateSecureToken).toHaveBeenCalled();
    expect(mockQueueService.addJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'send-verification-email',
        data: expect.objectContaining({
          verificationUrl: expect.stringContaining('token=mock_raw_token_123'),
        }),
      }),
    );
  });

  it('should generate secure token for sendPasswordReset if URL is omitted', async () => {
    const result = await emailService.sendPasswordReset({
      recipientEmail: 'jane@example.com',
      userName: 'Jane Doe',
    });

    expect(result.success).toBe(true);
    expect(mockTokenService.generateSecureToken).toHaveBeenCalledWith(15);
    expect(mockQueueService.addJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'send-password-reset-email',
        data: expect.objectContaining({
          resetUrl: expect.stringContaining('token=mock_raw_token_123'),
        }),
      }),
    );
  });

  it('should enqueue sendReviewAlert job', async () => {
    const result = await emailService.sendReviewAlert({
      recipientEmail: 'owner@bistro.com',
      businessName: 'Bistro One',
      customerName: 'Alice',
      rating: 5,
      reviewText: 'Great service and food!',
    });

    expect(result.success).toBe(true);
    expect(mockQueueService.addJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'send-review-alert-email',
      }),
    );
  });

  it('should enqueue sendFifteenDayReport job', async () => {
    const result = await emailService.sendFifteenDayReport({
      recipientEmail: 'owner@bistro.com',
      businessName: 'Bistro One',
      reportPeriod: 'Last 15 Days',
      totalReviews: 24,
      averageRating: 4.9,
      responseRate: '98%',
      positiveSentimentPct: 96,
    });

    expect(result.success).toBe(true);
    expect(mockQueueService.addJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'send-fifteen-day-report-email',
      }),
    );
  });

  it('should enqueue sendOnboardingConfirmed job', async () => {
    const result = await emailService.sendOnboardingConfirmed({
      recipientEmail: 'owner@bistro.com',
      userName: 'Alice',
      businessName: 'Bistro One',
      planName: 'Growth',
      isTrial: true,
    });

    expect(result.success).toBe(true);
    expect(mockQueueService.addJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'send-onboarding-confirmed-email',
      }),
    );
  });
});
