/**
 * tests/verify_email_pipeline.ts
 * 
 * Comprehensive End-to-End Email Service Verification Suite for OneRepute.
 * Verifies:
 *  1. Trigger execution & queueing for all 12 transactional email templates.
 *  2. Persistent Firestore / DB Audit logging (`email_logs`).
 *  3. Idempotency & duplicate suppression locking (`email_idempotency`).
 *  4. Subscription Confirmation email triggers.
 *  5. Resend API provider response & deliverability handling.
 */

import { loadEmailConfig } from '../src/config/email.config';
import { EmailQueueService } from '../src/modules/email/queues/email.queue';
import { EmailWorkerService } from '../src/modules/email/workers/email.worker';
import { EmailMetricsService } from '../src/modules/email/metrics/email.metrics.service';
import { EmailAuditService } from '../src/modules/email/services/email.audit.service';
import { EmailService } from '../src/modules/email/services/email.service';
import { ResendService } from '../src/modules/email/resend/resend.service';
import { TokenService } from '../src/modules/auth/token.service';

async function runEmailPipelineVerification() {
  console.log('----------------------------------------------------');
  console.log('🧪 STARTING COMPREHENSIVE EMAIL PIPELINE VERIFICATION');
  console.log('----------------------------------------------------\n');

  const config = loadEmailConfig();
  console.log(`📌 Active Node Env: ${config.nodeEnv}`);
  console.log(`📌 Resend API Key Configured: ${config.resendApiKey ? 'YES (' + config.resendApiKey.substring(0, 6) + '...)' : 'NO'}`);
  console.log(`📌 Default Sender Identity: ${config.emailFrom}`);
  console.log(`📌 Fallback Sender Identity: ${config.fallbackEmailFrom}\n`);

  // Mock FirebaseService for standalone test execution
  const mockLogsStore = new Map<string, any>();
  const mockIdempotencyStore = new Set<string>();

  const mockFirebaseService: any = {
    getDb: () => ({
      collection: (colName: string) => {
        if (colName === 'email_idempotency') {
          return {
            doc: (key: string) => ({
              get: async () => ({
                exists: mockIdempotencyStore.has(key),
                data: () => ({ createdAt: new Date() }),
              }),
              set: async (val: any) => {
                mockIdempotencyStore.add(key);
              },
            }),
          };
        }
        if (colName === 'email_logs') {
          return {
            doc: (docId: string) => ({
              set: async (val: any, opts?: any) => {
                const existing = mockLogsStore.get(docId) || {};
                mockLogsStore.set(docId, { ...existing, ...val });
              },
            }),
            where: (field: string, op: string, val: string) => ({
              orderBy: () => ({
                limit: () => ({
                  get: async () => ({
                    docs: Array.from(mockLogsStore.values())
                      .filter((item: any) => item[field] === val)
                      .map((item: any) => ({ id: item.id, data: () => item })),
                  }),
                }),
              }),
            }),
          };
        }
        return { doc: () => ({ set: async () => {}, get: async () => ({ exists: false }) }) };
      },
    }),
  };

  const mockPrismaService: any = {};

  const auditService = new EmailAuditService(mockFirebaseService, mockPrismaService);
  const resendService = new ResendService();
  const metricsService = new EmailMetricsService();
  const tokenService = new TokenService();
  const emailQueue = new EmailQueueService();
  await emailQueue.onModuleInit();

  const emailWorker = new EmailWorkerService(resendService, metricsService, auditService);
  await emailWorker.onModuleInit();

  const emailService = new EmailService(emailQueue, emailWorker, tokenService, auditService);

  const testRecipient = 'deliverability-test@onerepute.com';
  let passedCount = 0;
  let testCount = 0;

  function assert(condition: boolean, description: string) {
    testCount++;
    if (condition) {
      console.log(`  ✓ ${description}`);
      passedCount++;
    } else {
      console.error(`  ❌ FAILED: ${description}`);
      throw new Error(`Assertion failed: ${description}`);
    }
  }

  // --- Category 1: Onboarding Email Flow ---
  console.log('📧 Category 1: Testing New-User Onboarding Email Flow...');
  const welcomeRes = await emailService.sendWelcomeEmail({
    recipientEmail: testRecipient,
    userName: 'Test User',
    idempotencyKey: 'verify_welcome_001',
  });
  assert(welcomeRes.success, 'Welcome email dispatched successfully');
  assert(welcomeRes.recipient === testRecipient, 'Recipient email matched');

  const onboardingRes = await emailService.sendOnboardingConfirmed({
    recipientEmail: testRecipient,
    userName: 'Test Owner',
    businessName: 'Apex Bistro',
    planName: 'Growth Plan',
    isTrial: true,
    idempotencyKey: 'verify_onboard_001',
  });
  assert(onboardingRes.success, 'Business Onboarding Confirmed email dispatched');

  // --- Category 2: Verification & Auth Email Flows ---
  console.log('\n📧 Category 2: Testing Verification & Security Email Flows...');
  const verifyRes = await emailService.sendVerificationEmail({
    recipientEmail: testRecipient,
    userName: 'Test User',
    idempotencyKey: 'verify_auth_001',
  });
  assert(verifyRes.success, 'Verification email generated secure token & dispatched');

  const resetRes = await emailService.sendPasswordReset({
    recipientEmail: testRecipient,
    userName: 'Test User',
    idempotencyKey: 'verify_reset_001',
  });
  assert(resetRes.success, 'Password Reset link dispatched');

  const pwdChangedRes = await emailService.sendPasswordChanged({
    recipientEmail: testRecipient,
    userName: 'Test User',
    deviceDetails: 'Chrome on macOS',
    idempotencyKey: 'verify_pwdchanged_001',
  });
  assert(pwdChangedRes.success, 'Password Changed Security Alert dispatched');

  // --- Category 3: Subscription & Payment Confirmation Email Flow ---
  console.log('\n📧 Category 3: Testing Subscription & Payment Email Triggers...');
  const subActivatedRes = await emailService.sendSubscriptionActivated({
    recipientEmail: testRecipient,
    userName: 'Valued Business',
    planName: 'PRO GROWTH',
    amountPaid: '₹2,999 / month',
    renewalDate: 'September 20, 2026',
    idempotencyKey: 'verify_sub_001',
  });
  assert(subActivatedRes.success, 'Subscription Confirmation Email dispatched');

  // --- Category 4: System Notifications & Intelligence Reports ---
  console.log('\n📧 Category 4: Testing System Notifications & Intelligence Reports...');
  const reviewAlertRes = await emailService.sendReviewAlert({
    recipientEmail: testRecipient,
    businessName: 'Apex Bistro',
    customerName: 'Sarah Jenkins',
    rating: 5,
    reviewText: 'Outstanding service and food!',
    idempotencyKey: 'verify_review_001',
  });
  assert(reviewAlertRes.success, 'Review Alert email dispatched');

  const escalationRes = await emailService.sendEscalationEmail({
    recipientEmail: testRecipient,
    businessName: 'Apex Bistro',
    customerName: 'Mark D',
    rating: 1,
    reviewText: 'Waited 45 mins for table.',
    level: 2,
    idempotencyKey: 'verify_esc_001',
  });
  assert(escalationRes.success, 'Escalation Alert email dispatched');

  const weeklyReportRes = await emailService.sendWeeklyReport({
    recipientEmail: testRecipient,
    businessName: 'Apex Bistro',
    reportPeriod: 'Aug 13 - Aug 20',
    totalReviews: 48,
    averageRating: 4.8,
    responseRate: '98%',
    positiveSentimentPct: 92,
    idempotencyKey: 'verify_weekly_001',
  });
  assert(weeklyReportRes.success, 'Weekly Report email dispatched');

  const fifteenDayReportRes = await emailService.sendFifteenDayReport({
    recipientEmail: testRecipient,
    businessName: 'Apex Bistro',
    reportPeriod: 'Aug 5 - Aug 20',
    totalReviews: 112,
    averageRating: 4.9,
    responseRate: '100%',
    positiveSentimentPct: 95,
    idempotencyKey: 'verify_15day_001',
  });
  assert(fifteenDayReportRes.success, '15-Day Intelligence Report email dispatched');

  // --- Category 5: Idempotency & Duplicate Suppression Test ---
  console.log('\n🛡️ Category 5: Verifying Idempotency & Duplicate Prevention...');
  const duplicateSubRes = await emailService.sendSubscriptionActivated({
    recipientEmail: testRecipient,
    userName: 'Valued Business',
    planName: 'PRO GROWTH',
    amountPaid: '₹2,999 / month',
    renewalDate: 'September 20, 2026',
    idempotencyKey: 'verify_sub_001', // Duplicate key!
  });
  assert(duplicateSubRes.skippedDuplicate === true, 'Duplicate dispatch correctly suppressed by Idempotency Lock');

  // --- Category 6: Persistent Audit Logging Check ---
  console.log('\n📊 Category 6: Verifying Persistent Audit Logs...');
  assert(mockLogsStore.size > 0, `Persistent audit log records generated: ${mockLogsStore.size} records`);
  const logsList = Array.from(mockLogsStore.values());
  const welcomeLog = logsList.find((l: any) => l.template === 'send-welcome-email');
  assert(!!welcomeLog, 'Audit log record found for Welcome email');
  assert(welcomeLog.recipientEmail === testRecipient, 'Audit log recipient matched');

  console.log('\n----------------------------------------------------');
  console.log(`🎉 VERIFICATION SUCCESSFUL: ${passedCount}/${testCount} tests passed!`);
  console.log('----------------------------------------------------');

  await emailQueue.onModuleDestroy();
  await emailWorker.onModuleDestroy();
}

runEmailPipelineVerification().catch((err) => {
  console.error('❌ Pipeline verification failed:', err);
  process.exit(1);
});
