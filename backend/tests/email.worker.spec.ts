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
});
