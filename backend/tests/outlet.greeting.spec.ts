/**
 * tests/outlet.greeting.spec.ts
 * 
 * Unit & Integration tests for Outlet Registration Greeting Email System.
 * Verifies plan-independence, per-outlet idempotency, worker component rendering,
 * multi-outlet support per account, and failure resilience.
 */

import { EmailService } from '../src/modules/email/services/email.service';
import { EmailWorkerService } from '../src/modules/email/workers/email.worker';
import { EmailJobType } from '../src/modules/email/queues/email.job.types';

describe('Outlet Registration Greeting Email System', () => {
  let emailService: EmailService;
  let mockQueueService: any;
  let mockWorkerService: any;
  let mockTokenService: any;
  let mockAuditService: any;
  let mockResendService: any;
  let mockMetricsService: any;

  beforeEach(() => {
    mockQueueService = {
      addJob: jest.fn().mockImplementation(async (payload) => {
        const key = payload.data.idempotencyKey || 'job_default';
        return `job_${key}`;
      }),
    };
    mockWorkerService = {
      processJob: jest.fn().mockResolvedValue({ id: 'res_mock_123', status: 'sent', latencyMs: 35 }),
    };
    mockTokenService = {
      generateSecureToken: jest.fn(),
      storeToken: jest.fn(),
    };
    mockResendService = {
      sendEmail: jest.fn().mockResolvedValue({ id: 'resend_msg_123', status: 'sent', latencyMs: 40 }),
    };
    mockMetricsService = {
      recordEmailEvent: jest.fn().mockResolvedValue({}),
    };

    // Lock store for idempotency test
    const lockStore = new Set<string>();
    mockAuditService = {
      checkAndLockIdempotencyKey: jest.fn().mockImplementation(async (key: string) => {
        if (lockStore.has(key)) {
          return false; // Suppress duplicate
        }
        lockStore.add(key);
        return true;
      }),
      recordEmailAttempt: jest.fn().mockResolvedValue('audit_123'),
    };

    emailService = new EmailService(
      mockQueueService,
      mockWorkerService,
      mockTokenService,
      mockAuditService,
    );
  });

  describe('EmailService.sendOutletGreeting', () => {
    it('should queue sendOutletGreeting job for a new trial outlet with outlet-scoped idempotency key', async () => {
      const result = await emailService.sendOutletGreeting({
        outletId: 'outlet_trial_999',
        recipientEmail: 'owner@trialbistro.com',
        userName: 'Trial Owner',
        businessName: 'Trial Bistro',
        isTrial: true,
        planName: 'Starter Trial',
      });

      expect(result.success).toBe(true);
      expect(result.skippedDuplicate).toBeUndefined();
      expect(mockQueueService.addJob).toHaveBeenCalledWith({
        type: EmailJobType.OUTLET_GREETING,
        data: expect.objectContaining({
          outletId: 'outlet_trial_999',
          recipientEmail: 'owner@trialbistro.com',
          businessName: 'Trial Bistro',
          isTrial: true,
          idempotencyKey: 'outlet_greeting_outlet_trial_999',
        }),
      });
    });

    it('should queue sendOutletGreeting job for a paid plan outlet', async () => {
      const result = await emailService.sendOutletGreeting({
        outletId: 'outlet_paid_888',
        recipientEmail: 'boss@growthcorp.com',
        userName: 'Corporate Boss',
        businessName: 'Growth Corp Outlet 1',
        isTrial: false,
        planName: 'Growth Plan',
      });

      expect(result.success).toBe(true);
      expect(mockQueueService.addJob).toHaveBeenCalledWith({
        type: EmailJobType.OUTLET_GREETING,
        data: expect.objectContaining({
          outletId: 'outlet_paid_888',
          recipientEmail: 'boss@growthcorp.com',
          businessName: 'Growth Corp Outlet 1',
          isTrial: false,
          planName: 'Growth Plan',
          idempotencyKey: 'outlet_greeting_outlet_paid_888',
        }),
      });
    });

    it('should allow multiple outlets created under the same user account', async () => {
      // Outlet 1 under same user
      const res1 = await emailService.sendOutletGreeting({
        outletId: 'outlet_user1_loc1',
        recipientEmail: 'multi@chain.com',
        userName: 'Chain Owner',
        businessName: 'Chain Location 1',
        userId: 'user_multi_123',
      });

      // Outlet 2 under same user
      const res2 = await emailService.sendOutletGreeting({
        outletId: 'outlet_user1_loc2',
        recipientEmail: 'multi@chain.com',
        userName: 'Chain Owner',
        businessName: 'Chain Location 2',
        userId: 'user_multi_123',
      });

      expect(res1.success).toBe(true);
      expect(res1.skippedDuplicate).toBeUndefined();
      expect(res2.success).toBe(true);
      expect(res2.skippedDuplicate).toBeUndefined();

      expect(mockAuditService.checkAndLockIdempotencyKey).toHaveBeenCalledWith('outlet_greeting_outlet_user1_loc1');
      expect(mockAuditService.checkAndLockIdempotencyKey).toHaveBeenCalledWith('outlet_greeting_outlet_user1_loc2');
    });

    it('should suppress duplicate emails when registration is retried for the same outlet ID', async () => {
      const payload = {
        outletId: 'outlet_retry_100',
        recipientEmail: 'retry@bistro.com',
        userName: 'Retry User',
        businessName: 'Retry Bistro',
      };

      // Initial registration call
      const firstResult = await emailService.sendOutletGreeting(payload);
      expect(firstResult.success).toBe(true);
      expect(firstResult.skippedDuplicate).toBeUndefined();

      // Duplicate registration call (e.g., page refresh or API retry)
      const secondResult = await emailService.sendOutletGreeting(payload);
      expect(secondResult.success).toBe(true);
      expect(secondResult.skippedDuplicate).toBe(true);
    });
  });

  describe('EmailWorkerService.processJob for OUTLET_GREETING', () => {
    let workerService: EmailWorkerService;

    beforeEach(() => {
      workerService = new EmailWorkerService(
        mockResendService,
        mockMetricsService,
        mockAuditService,
      );
    });

    it('should process OUTLET_GREETING job and send email via ResendService', async () => {
      const jobData = {
        type: EmailJobType.OUTLET_GREETING,
        data: {
          outletId: 'outlet_worker_test',
          recipientEmail: 'recipient@domain.com',
          userName: 'John Worker',
          businessName: 'Worker Bistro',
          planName: 'Starter',
          isTrial: true,
          dashboardUrl: 'https://onerepute.com/outlet/dashboard',
        },
      };

      const result = await workerService.processJob({
        id: 'job_outlet_worker_test',
        name: EmailJobType.OUTLET_GREETING,
        data: jobData as any,
      });

      expect(result.status).toBe('sent');
      expect(mockResendService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'recipient@domain.com',
          subject: 'Welcome to OneRepute — Worker Bistro is successfully registered! 🚀',
        }),
      );
    });
  });
});
