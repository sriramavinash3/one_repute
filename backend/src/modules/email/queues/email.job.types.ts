/**
 * src/modules/email/queues/email.job.types.ts
 * 
 * Typed payload definitions for all BullMQ email jobs.
 */

export enum EmailJobType {
  WELCOME = 'send-welcome-email',
  VERIFICATION = 'send-verification-email',
  PASSWORD_RESET = 'send-password-reset-email',
  PASSWORD_CHANGED = 'send-password-changed-email',
  TEAM_INVITE = 'send-team-invite-email',
  SUBSCRIPTION_ACTIVATED = 'send-subscription-activated-email',
  WEEKLY_REPORT = 'send-weekly-report-email',
  REVIEW_ALERT = 'send-review-alert-email',
  ESCALATION_ALERT = 'send-escalation-alert-email',
}

export interface BaseEmailJobData {
  userId?: string;
  recipientEmail: string;
}

export interface WelcomeJobData extends BaseEmailJobData {
  userName: string;
  dashboardUrl?: string;
}

export interface VerificationJobData extends BaseEmailJobData {
  userName: string;
  verificationUrl: string;
  expiresInHours?: number;
}

export interface PasswordResetJobData extends BaseEmailJobData {
  userName: string;
  resetUrl: string;
  expiresInMinutes?: number;
}

export interface PasswordChangedJobData extends BaseEmailJobData {
  userName: string;
  changeTimestamp?: string;
  deviceDetails?: string;
  securityUrl?: string;
}

export interface TeamInviteJobData extends BaseEmailJobData {
  inviterName: string;
  workspaceName: string;
  inviteUrl: string;
  role?: string;
  expiresInDays?: number;
}

export interface SubscriptionActivatedJobData extends BaseEmailJobData {
  userName: string;
  planName: string;
  amountPaid: string;
  renewalDate: string;
  receiptUrl?: string;
  dashboardUrl?: string;
}

export interface WeeklyReportJobData extends BaseEmailJobData {
  businessName: string;
  reportPeriod: string;
  totalReviews: number;
  averageRating: number;
  responseRate: string;
  positiveSentimentPct: number;
  analyticsUrl?: string;
}

export interface ReviewAlertJobData extends BaseEmailJobData {
  businessName: string;
  customerName: string;
  rating: number;
  reviewText: string;
  reviewDate?: string;
  dashboardUrl?: string;
  aiReplyUrl?: string;
}

export interface EscalationAlertJobData extends BaseEmailJobData {
  businessName: string;
  customerName: string;
  rating: number;
  reviewText: string;
  level: number;
  pendingSince?: string;
  dashboardUrl?: string;
}

export type EmailJobPayload =
  | { type: EmailJobType.WELCOME; data: WelcomeJobData }
  | { type: EmailJobType.VERIFICATION; data: VerificationJobData }
  | { type: EmailJobType.PASSWORD_RESET; data: PasswordResetJobData }
  | { type: EmailJobType.PASSWORD_CHANGED; data: PasswordChangedJobData }
  | { type: EmailJobType.TEAM_INVITE; data: TeamInviteJobData }
  | { type: EmailJobType.SUBSCRIPTION_ACTIVATED; data: SubscriptionActivatedJobData }
  | { type: EmailJobType.WEEKLY_REPORT; data: WeeklyReportJobData }
  | { type: EmailJobType.REVIEW_ALERT; data: ReviewAlertJobData }
  | { type: EmailJobType.ESCALATION_ALERT; data: EscalationAlertJobData };
