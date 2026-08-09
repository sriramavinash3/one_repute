/**
 * src/modules/email/email.integration.js
 * 
 * Express Bridge for EmailService & TokenService.
 * Enables seamless integration of transactional email queuing into existing Express routes.
 */

'use strict';

function loadModule(path) {
  try {
    return require(path);
  } catch (err) {
    return require('../../../dist/src/modules/' + path.replace('./', '').replace('../', ''));
  }
}

const { EmailService } = loadModule('./email/services/email.service');
const { EmailQueueService } = loadModule('./email/queues/email.queue');
const { EmailWorkerService } = loadModule('./email/workers/email.worker');
const { EmailMetricsService } = loadModule('./email/metrics/email.metrics.service');
const { ResendService } = loadModule('./email/resend/resend.service');
const { TokenService } = loadModule('./auth/token.service');
const logger = console;

// Instantiate singletons for Express routes
const resendService = new ResendService();
const metricsService = new EmailMetricsService();
const tokenService = new TokenService();
const emailQueueService = new EmailQueueService();
const emailWorkerService = new EmailWorkerService(resendService, metricsService);

// Initialize queue & worker asynchronously
emailQueueService.onModuleInit().catch((err) => {
  logger.warn('[EmailBridge] Queue init notice:', err.message);
});

emailWorkerService.onModuleInit().catch((err) => {
  logger.warn('[EmailBridge] Worker init notice:', err.message);
});

const emailService = new EmailService(emailQueueService, emailWorkerService, tokenService);

module.exports = {
  emailService,
  tokenService,
  metricsService,
  emailQueueService,

  /**
   * Queue Welcome Email on Signup
   */
  async queueWelcomeEmail(recipientEmail, userName, userId) {
    try {
      return await emailService.sendWelcomeEmail({ recipientEmail, userName, userId });
    } catch (err) {
      logger.error(`[EmailBridge] Failed to queue Welcome Email for ${recipientEmail}:`, err.message);
    }
  },

  /**
   * Queue Email Verification on Signup
   */
  async queueVerificationEmail(recipientEmail, userName, userId) {
    try {
      return await emailService.sendVerificationEmail({ recipientEmail, userName, userId });
    } catch (err) {
      logger.error(`[EmailBridge] Failed to queue Verification Email for ${recipientEmail}:`, err.message);
    }
  },

  /**
   * Queue Password Reset Email
   */
  async queuePasswordResetEmail(recipientEmail, userName, userId) {
    try {
      return await emailService.sendPasswordReset({ recipientEmail, userName, userId });
    } catch (err) {
      logger.error(`[EmailBridge] Failed to queue Password Reset Email for ${recipientEmail}:`, err.message);
    }
  },

  /**
   * Queue Password Changed Alert
   */
  async queuePasswordChangedEmail(recipientEmail, userName, userId, deviceDetails) {
    try {
      return await emailService.sendPasswordChanged({ recipientEmail, userName, userId, deviceDetails });
    } catch (err) {
      logger.error(`[EmailBridge] Failed to queue Password Changed Alert for ${recipientEmail}:`, err.message);
    }
  },

  /**
   * Queue Team Workspace Invitation
   */
  async queueTeamInviteEmail(recipientEmail, inviterName, workspaceName, role = 'Member') {
    try {
      return await emailService.sendInvitation({ recipientEmail, inviterName, workspaceName, role });
    } catch (err) {
      logger.error(`[EmailBridge] Failed to queue Team Invite Email for ${recipientEmail}:`, err.message);
    }
  },

  /**
   * Queue Subscription Activated Email
   */
  async queueSubscriptionActivatedEmail(recipientEmail, userName, planName, amountPaid, renewalDate) {
    try {
      return await emailService.sendSubscriptionActivated({ recipientEmail, userName, planName, amountPaid, renewalDate });
    } catch (err) {
      logger.error(`[EmailBridge] Failed to queue Subscription Confirmation for ${recipientEmail}:`, err.message);
    }
  },

  /**
   * Queue Weekly Reputation Performance Report
   */
  async queueWeeklyReportEmail(recipientEmail, businessName, reportPeriod, totalReviews, averageRating, responseRate, positiveSentimentPct) {
    try {
      return await emailService.sendWeeklyReport({
        recipientEmail,
        businessName,
        reportPeriod,
        totalReviews,
        averageRating,
        responseRate,
        positiveSentimentPct,
      });
    } catch (err) {
      logger.error(`[EmailBridge] Failed to queue Weekly Report for ${recipientEmail}:`, err.message);
    }
  },

  /**
   * Queue New Review Alert Email
   */
  async queueReviewAlertEmail(recipientEmail, businessName, customerName, rating, reviewText) {
    try {
      return await emailService.sendReviewAlert({ recipientEmail, businessName, customerName, rating, reviewText });
    } catch (err) {
      logger.error(`[EmailBridge] Failed to queue Review Alert for ${recipientEmail}:`, err.message);
    }
  },

  /**
   * Queue Review Escalation Email
   */
  async queueEscalationEmail(recipientEmail, level, businessName, customerName, rating, reviewText, pendingSince) {
    try {
      return await emailService.sendEscalationEmail({
        recipientEmail,
        level,
        businessName,
        customerName,
        rating,
        reviewText,
        pendingSince,
      });
    } catch (err) {
      logger.error(`[EmailBridge] Failed to queue Escalation Email for ${recipientEmail}:`, err.message);
    }
  },
};
