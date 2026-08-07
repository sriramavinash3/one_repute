/**
 * tests/run_tests.ts
 * 
 * Direct TypeScript test runner for token service, email service, and worker specs.
 */

import { TokenService } from '../src/modules/auth/token.service';
import { EmailService } from '../src/modules/email/services/email.service';
import { EmailWorkerService } from '../src/modules/email/workers/email.worker';
import { EmailJobType } from '../src/modules/email/queues/email.job.types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runTests() {
  console.log('🚀 Running OneRepute Transactional Email Test Suite...\n');

  // --- Test 1: TokenService Cryptographic Token Tests ---
  console.log('🧪 Test Suite 1: TokenService (Cryptographic Hashing & Expiration)');
  const tokenService = new TokenService();

  const tokenInfo = tokenService.generateSecureToken(15);
  assert(tokenInfo.rawToken.length === 64, 'Generated raw token must be 64 hexadecimal characters');
  assert(tokenInfo.tokenHash !== tokenInfo.rawToken, 'Token hash must differ from raw token');
  assert(tokenInfo.expiresAt.getTime() > Date.now(), 'Token expiration must be in the future');

  const email = 'user@onerepute.com';
  await tokenService.storeToken(email, tokenInfo);

  const val1 = await tokenService.validateToken(email, tokenInfo.rawToken);
  assert(val1.valid === true, 'Token validation must succeed for valid raw token');

  await tokenService.invalidateToken(tokenInfo.rawToken);
  const val2 = await tokenService.validateToken(email, tokenInfo.rawToken);
  assert(val2.valid === false, 'Token must be single-use and invalid after usage');

  const expiredToken = tokenService.generateSecureToken(-5);
  await tokenService.storeToken(email, expiredToken);
  const val3 = await tokenService.validateToken(email, expiredToken.rawToken);
  assert(val3.valid === false, 'Expired token must be rejected');

  console.log('✅ TokenService Tests Passed!\n');

  // --- Test 2: EmailService Dispatch Tests ---
  console.log('🧪 Test Suite 2: EmailService (Job Queueing & Payload Handling)');
  
  let enqueuedJobs: any[] = [];
  const mockQueue: any = {
    addJob: async (payload: any) => {
      enqueuedJobs.push(payload);
      return `job_${Date.now()}`;
    },
  };
  const mockWorker: any = {
    processJob: async () => ({ id: 'res_1', status: 'mocked', latencyMs: 10 }),
  };

  const emailService = new EmailService(mockQueue, mockWorker, tokenService);

  const welcomeRes = await emailService.sendWelcomeEmail({
    recipientEmail: 'john@example.com',
    userName: 'John Doe',
  });
  assert(welcomeRes.success === true, 'sendWelcomeEmail should return success');
  assert(enqueuedJobs.length === 1, 'Should have enqueued 1 welcome job');
  assert(enqueuedJobs[0].type === EmailJobType.WELCOME, 'Job type must be WELCOME');

  const resetRes = await emailService.sendPasswordReset({
    recipientEmail: 'jane@example.com',
    userName: 'Jane Doe',
  });
  assert(resetRes.success === true, 'sendPasswordReset should return success');
  assert(enqueuedJobs.length === 2, 'Should have enqueued 2 jobs total');
  assert(enqueuedJobs[1].data.resetUrl.includes('token='), 'Password reset URL must include secure token parameter');

  console.log('✅ EmailService Tests Passed!\n');

  // --- Test 3: EmailWorkerService Rendering & Mock Delivery ---
  console.log('🧪 Test Suite 3: EmailWorkerService (React Template Rendering & Resend Mock)');

  let dispatchedEmails: any[] = [];
  let loggedEvents: any[] = [];

  const mockResend: any = {
    sendEmail: async (payload: any) => {
      dispatchedEmails.push(payload);
      return { id: 'mock_msg_777', status: 'mocked', latencyMs: 12 };
    },
  };
  const mockMetrics: any = {
    recordEmailEvent: async (evt: any) => {
      loggedEvents.push(evt);
    },
  };

  const workerService = new EmailWorkerService(mockResend, mockMetrics);

  const workerRes1 = await workerService.processJob({
    id: 'job_w1',
    name: EmailJobType.WELCOME,
    data: {
      type: EmailJobType.WELCOME,
      data: { recipientEmail: 'alice@example.com', userName: 'Alice' },
    },
  });

  assert(workerRes1.status === 'mocked', 'Worker execution status must be mocked');
  assert(dispatchedEmails.length === 1, 'ResendService should have received 1 rendered email');
  assert(dispatchedEmails[0].subject === 'Welcome to OneRepute 🚀', 'Subject line must match Welcome template');
  assert(loggedEvents.length === 1, 'Email event must be logged in metrics');
  assert(loggedEvents[0].status === 'DELIVERED', 'Logged event status must be DELIVERED');

  const workerRes2 = await workerService.processJob({
    id: 'job_w2',
    name: EmailJobType.REVIEW_ALERT,
    data: {
      type: EmailJobType.REVIEW_ALERT,
      data: {
        recipientEmail: 'owner@bistro.com',
        businessName: 'Bistro One',
        customerName: 'Sarah M.',
        rating: 5,
        reviewText: 'Outstanding experience!',
      },
    },
  });

  assert(workerRes2.status === 'mocked', 'Worker execution status must be mocked');
  assert(dispatchedEmails.length === 2, 'ResendService should have received 2 rendered emails total');
  assert(dispatchedEmails[1].subject.includes('5-Star Review Alert'), 'Subject line must include star rating');

  console.log('✅ EmailWorkerService Tests Passed!\n');

  console.log('🎉 ALL TRANSACTIONAL EMAIL UNIT & INTEGRATION TESTS PASSED CLEANLY!');
}

runTests().catch((err) => {
  console.error('❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
