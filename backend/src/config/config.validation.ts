import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
  PORT: Joi.number().default(3000),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
    .default('info'),

  // Frontend & App Base URLs
  FRONTEND_BASE_URL: Joi.string().uri().default('http://localhost:5173'),
  APP_URL: Joi.string().uri().default('http://localhost:3000'),

  // Database
  DATABASE_URL: Joi.string().optional(),

  // Redis & BullMQ
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  // Google APIs
  GOOGLE_CLIENT_ID: Joi.string().optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().optional(),
  GOOGLE_REDIRECT_URI: Joi.string().optional(),
  GOOGLE_PLACES_API_KEY: Joi.string().optional(),

  // AI LLM Providers
  AI_DEFAULT_PROVIDER: Joi.string().valid('openai', 'gemini', 'claude', 'azure').default('openai'),
  OPENAI_API_KEY: Joi.string().optional(),
  OPENAI_BASE_URL: Joi.string().default('https://api.aicredits.in/v1'),
  OPENAI_MODEL: Joi.string().default('gpt-4o-mini'),
  OPENAI_MAX_TOKENS: Joi.number().default(150),
  OPENAI_TEMPERATURE: Joi.number().default(0.75),
  GEMINI_API_KEY: Joi.string().allow('').optional(),
  ANTHROPIC_API_KEY: Joi.string().allow('').optional(),

  // WhatsApp Integration
  WHATSAPP_PROVIDER: Joi.string().valid('twilio', '360dialog').default('twilio'),
  TWILIO_ACCOUNT_SID: Joi.string().allow('').optional(),
  TWILIO_AUTH_TOKEN: Joi.string().allow('').optional(),
  TWILIO_WHATSAPP_FROM: Joi.string().allow('').optional(),
  DIALOG360_API_KEY: Joi.string().allow('').optional(),
  DIALOG360_FROM_NUMBER: Joi.string().allow('').optional(),

  // Email Infrastructure
  RESEND_API_KEY: Joi.string().allow('').optional(),

  // Firebase
  FIREBASE_PROJECT_ID: Joi.string().optional(),
  FIREBASE_CLIENT_EMAIL: Joi.string().optional(),
  FIREBASE_PRIVATE_KEY: Joi.string().optional(),

  // Storage
  STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),
  STORAGE_LOCAL_PATH: Joi.string().default('./uploads'),
  AWS_S3_BUCKET: Joi.string().allow('').optional(),
  AWS_S3_REGION: Joi.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
});
