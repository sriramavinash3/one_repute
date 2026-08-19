/**
 * src/modules/email/dto/email.dto.ts
 * 
 * Strongly-typed DTOs for all transactional email triggers.
 */

export interface SendWelcomeEmailDto {
  recipientEmail: string;
  userName: string;
  userId?: string;
  dashboardUrl?: string;
}

export interface SendVerificationEmailDto {
  recipientEmail: string;
  userName: string;
  userId?: string;
  verificationUrl?: string;
  expiresInHours?: number;
}

export interface SendPasswordResetDto {
  recipientEmail: string;
  userName: string;
  userId?: string;
  resetUrl?: string;
  expiresInMinutes?: number;
}

export interface SendPasswordChangedDto {
  recipientEmail: string;
  userName: string;
  userId?: string;
  changeTimestamp?: string;
  deviceDetails?: string;
  securityUrl?: string;
}

export interface SendInvitationDto {
  recipientEmail: string;
  inviterName: string;
  workspaceName: string;
  userId?: string;
  inviteUrl?: string;
  role?: string;
  expiresInDays?: number;
}

export interface SendSubscriptionActivatedDto {
  recipientEmail: string;
  userName: string;
  planName: string;
  amountPaid: string;
  renewalDate: string;
  userId?: string;
  receiptUrl?: string;
  dashboardUrl?: string;
}

export interface SendWeeklyReportDto {
  recipientEmail: string;
  businessName: string;
  reportPeriod: string;
  totalReviews: number;
  averageRating: number;
  responseRate: string;
  positiveSentimentPct: number;
  userId?: string;
  analyticsUrl?: string;
}

export interface SendFifteenDayReportDto {
  recipientEmail: string;
  businessName: string;
  reportPeriod: string;
  totalReviews: number;
  averageRating: number;
  responseRate: string;
  positiveSentimentPct: number;
  userId?: string;
  analyticsUrl?: string;
  customerName?: string;
}

export interface SendOnboardingConfirmedDto {
  recipientEmail: string;
  userName: string;
  businessName: string;
  planName: string;
  isTrial?: boolean;
  userId?: string;
  dashboardUrl?: string;
}

export interface SendReviewAlertDto {
  recipientEmail: string;
  businessName: string;
  customerName: string;
  rating: number;
  reviewText: string;
  userId?: string;
  reviewDate?: string;
  dashboardUrl?: string;
  aiReplyUrl?: string;
}

export interface SendEscalationEmailDto {
  recipientEmail: string;
  businessName: string;
  customerName: string;
  rating: number;
  reviewText: string;
  level: number;
  pendingSince?: string;
  userId?: string;
  dashboardUrl?: string;
}

export interface SendAccountDeletionOtpDto {
  recipientEmail: string;
  otpCode: string;
  userName?: string;
  userId?: string;
  expiresInMinutes?: number;
}
