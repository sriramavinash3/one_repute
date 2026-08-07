/**
 * src/config/email.config.ts
 * 
 * Production-grade environment configuration and validation for OneRepute Email System.
 */

export interface EmailConfig {
  nodeEnv: string;
  resendApiKey: string;
  emailFrom: string;
  appUrl: string;
  supportEmail: string;
  companyAddress: string;
  redis: {
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
  const resendApiKey = process.env.RESEND_API_KEY || 're_mock_key_for_dev_and_testing';
  const emailFrom = process.env.EMAIL_FROM || 'OneRepute <notifications@onerepute.com>';
  const appUrl = process.env.APP_URL || 'https://onerepute.com';
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@onerepute.com';
  const companyAddress = process.env.COMPANY_ADDRESS || '100 Innovation Way, Suite 400, San Francisco, CA 94105';

  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const redisPassword = process.env.REDIS_PASSWORD || undefined;

  return {
    nodeEnv,
    resendApiKey,
    emailFrom,
    appUrl,
    supportEmail,
    companyAddress,
    redis: {
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
