/**
 * src/modules/email/dto/email.dto.ts
 * 
 * Strongly-typed DTOs for all transactional email triggers.
 */

export interface BaseEmailDto {
  recipientEmail: string;
  userId?: string;
  idempotencyKey?: string;
}

export interface SendWelcomeEmailDto extends BaseEmailDto {
  userName: string;
  dashboardUrl?: string;
}

export interface SendVerificationEmailDto extends BaseEmailDto {
  userName: string;
  verificationUrl?: string;
  expiresInHours?: number;
}

export interface SendPasswordResetDto extends BaseEmailDto {
  userName: string;
  resetUrl?: string;
  expiresInMinutes?: number;
}

export interface SendPasswordChangedDto extends BaseEmailDto {
  userName: string;
  changeTimestamp?: string;
  deviceDetails?: string;
  securityUrl?: string;
}

export interface SendInvitationDto extends BaseEmailDto {
  inviterName: string;
  workspaceName: string;
  inviteUrl?: string;
  role?: string;
  expiresInDays?: number;
}

export interface SendSubscriptionActivatedDto extends BaseEmailDto {
  userName: string;
  planName: string;
  amountPaid: string;
  renewalDate: string;
  receiptUrl?: string;
  dashboardUrl?: string;
}

export interface SendWeeklyReportDto extends BaseEmailDto {
  businessName: string;
  reportPeriod: string;
  totalReviews: number;
  averageRating: number;
  responseRate: string;
  positiveSentimentPct: number;
  analyticsUrl?: string;
}

export interface SendFifteenDayReportDto extends BaseEmailDto {
  businessName: string;
  reportPeriod: string;
  totalReviews: number;
  averageRating: number;
  responseRate: string;
  positiveSentimentPct: number;
  analyticsUrl?: string;
  customerName?: string;
}

export interface SendOnboardingConfirmedDto extends BaseEmailDto {
  userName: string;
  businessName: string;
  planName: string;
  isTrial?: boolean;
  dashboardUrl?: string;
}

export interface SendReviewAlertDto extends BaseEmailDto {
  businessName: string;
  customerName: string;
  rating: number;
  reviewText: string;
  reviewDate?: string;
  dashboardUrl?: string;
  aiReplyUrl?: string;
}

export interface SendEscalationEmailDto extends BaseEmailDto {
  businessName: string;
  customerName: string;
  rating: number;
  reviewText: string;
  level: number;
  pendingSince?: string;
  dashboardUrl?: string;
}

export interface SendAccountDeletionOtpDto extends BaseEmailDto {
  otpCode: string;
  userName?: string;
  expiresInMinutes?: number;
}
