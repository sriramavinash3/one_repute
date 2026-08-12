/**
 * tests/email.worker.spec.ts
 * 
 * Integration & unit tests for EmailWorker processing and Resend mock dispatching.
 */

import { EmailWorkerService } from '../src/modules/email/workers/email.worker';
import { EmailJobType } from '../src/modules/email/queues/email.job.types';

describe('EmailWorkerService', () => {
  let emailWorkerService: EmailWorkerService;
  let mockResendService: any;
  let mockMetricsService: any;

  beforeEach(() => {
    mockResendService = {
      sendEmail: jest.fn().mockResolvedValue({
        id: 'mock_msg_999',
        status: 'mocked',
        latencyMs: 15,
      }),
    };

    mockMetricsService = {
      recordEmailEvent: jest.fn().mockResolvedValue(undefined),
    };

    emailWorkerService = new EmailWorkerService(mockResendService, mockMetricsService);
  });

  it('should process WELCOME email job and render React template', async () => {
    const jobData = {
      type: EmailJobType.WELCOME,
      data: {
        recipientEmail: 'test@example.com',
        userName: 'Test User',
      },
    };

    const result = await emailWorkerService.processJob({
      id: 'job_1',
      name: EmailJobType.WELCOME,
      data: jobData as any,
    });

    expect(result.status).toBe('mocked');
    expect(mockResendService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com',
        subject: 'Welcome to OneRepute 🚀',
      }),
    );
    expect(mockMetricsService.recordEmailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'test@example.com',
        status: 'DELIVERED',
        template: EmailJobType.WELCOME,
      }),
    );
  });

  it('should process REVIEW_ALERT job with star rating payload', async () => {
    const jobData = {
      type: EmailJobType.REVIEW_ALERT,
      data: {
        recipientEmail: 'manager@restaurant.com',
        businessName: 'Grand Restaurant',
        customerName: 'Bob R.',
        rating: 1,
        reviewText: 'Food took too long to arrive.',
      },
    };

    const result = await emailWorkerService.processJob({
      id: 'job_2',
      name: EmailJobType.REVIEW_ALERT,
      data: jobData as any,
    });

    expect(result.status).toBe('mocked');
    expect(mockResendService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'manager@restaurant.com',
        subject: 'New 1-Star Review Alert for Grand Restaurant',
      }),
    );
  });

  it('should process FIFTEEN_DAY_REPORT email job', async () => {
    const jobData = {
      type: EmailJobType.FIFTEEN_DAY_REPORT,
      data: {
        recipientEmail: 'owner@bistro.com',
        businessName: 'Bistro One',
        reportPeriod: 'Last 15 Days',
        totalReviews: 30,
        averageRating: 4.9,
        responseRate: '99%',
        positiveSentimentPct: 97,
      },
    };

    const result = await emailWorkerService.processJob({
      id: 'job_3',
      name: EmailJobType.FIFTEEN_DAY_REPORT,
      data: jobData as any,
    });

    expect(result.status).toBe('mocked');
    expect(mockResendService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@bistro.com',
        subject: '15-Day Reputation Performance Report for Bistro One',
      }),
    );
  });

  it('should process ONBOARDING_CONFIRMED email job', async () => {
    const jobData = {
      type: EmailJobType.ONBOARDING_CONFIRMED,
      data: {
        recipientEmail: 'owner@bistro.com',
        userName: 'Alice',
        businessName: 'Bistro One',
        planName: 'Growth',
        isTrial: true,
      },
    };

    const result = await emailWorkerService.processJob({
      id: 'job_4',
      name: EmailJobType.ONBOARDING_CONFIRMED,
      data: jobData as any,
    });

    expect(result.status).toBe('mocked');
    expect(mockResendService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@bistro.com',
        subject: 'Business Setup Complete: Welcome Bistro One to OneRepute',
      }),
    );
  });
});
