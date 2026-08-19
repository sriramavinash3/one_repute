/**
 * src/config/email.config.ts
 * 
 * Production-grade environment configuration and validation for OneRepute Email System.
 */

export interface EmailConfig {
  nodeEnv: string;
  resendApiKey: string;
  emailFrom: string;
  fallbackEmailFrom: string;
  timeoutMs: number;
  appUrl: string;
  frontendUrl: string;
  supportEmail: string;
  companyAddress: string;
  redis: {
    url?: string;
    host: string;
    port: number;
    password?: string;
    tls?: boolean;
  };
  queue: {
    name: string;
    concurrency: number;
    maxRetries: number;
    backoffDelayMs: number;
  };
}

export function loadEmailConfig(): EmailConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  const resendApiKey = process.env.RESEND_API_KEY || 're_mock_key_for_dev_and_testing';
  const emailFrom = process.env.EMAIL_FROM || 'OneRepute <notifications@onerepute.com>';
  const fallbackEmailFrom = process.env.FALLBACK_EMAIL_FROM || 'OneRepute <onboarding@resend.dev>';
  const timeoutMs = parseInt(process.env.EMAIL_TIMEOUT_MS || '10000', 10);
  
  const defaultFrontendUrl = isProduction ? 'https://onerepute.com' : 'http://localhost:5173';
  const defaultAppUrl = isProduction ? 'https://onerepute.com' : 'http://localhost:3000';

  const frontendUrl = process.env.FRONTEND_BASE_URL || defaultFrontendUrl;
  const appUrl = process.env.APP_URL || defaultAppUrl;
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@onerepute.com';
  const companyAddress = process.env.COMPANY_ADDRESS || '';

  const redisUrl = process.env.REDIS_URL || undefined;
  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const redisPassword = process.env.REDIS_PASSWORD || undefined;

  return {
    nodeEnv,
    resendApiKey,
    emailFrom,
    fallbackEmailFrom,
    timeoutMs,
    appUrl,
    frontendUrl,
    supportEmail,
    companyAddress,
    redis: {
      url: redisUrl,
      host: redisHost,
      port: redisPort,
      password: redisPassword,
    },
    queue: {
      name: 'email-queue',
      concurrency: 5,
      maxRetries: 3,
      backoffDelayMs: 2000,
    },
  };
}
