/**
 * config/env.js
 *
 * Validates and exports all environment variables at startup.
 * Fails fast with a clear error if required vars are missing.
 */

'use strict';

const requiredVars = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'OPENAI_API_KEY',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'GOOGLE_PLACES_API_KEY',
];

function validateEnv() {
  const missing = requiredVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[Config] Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

validateEnv();

module.exports = {
  // App
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Google
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback',
  },

  // Frontend
  frontendBaseUrl: process.env.FRONTEND_BASE_URL || 'http://localhost:5173',

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS, 10) || 150,
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.75,
  },

  // WhatsApp
  whatsapp: {
    provider: process.env.WHATSAPP_PROVIDER || 'twilio',
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      from: process.env.TWILIO_WHATSAPP_FROM,
    },
    dialog360: {
      apiKey: process.env.DIALOG360_API_KEY,
      fromNumber: process.env.DIALOG360_FROM_NUMBER,
    },
  },

  // Firebase
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Replace escaped newlines from env var
    privateKey: process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined,
  },

  // Cron
  cron: {
    schedule: process.env.CRON_SCHEDULE || '*/10 * * * *',
    batchSize: parseInt(process.env.REVIEW_BATCH_SIZE, 10) || 30,
    lockTtlMs: parseInt(process.env.CRON_LOCK_TTL_MS, 10) || 240000,
  },


  // Google Places (search/autocomplete)
  googlePlaces: {
    apiKey: process.env.GOOGLE_PLACES_API_KEY,
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },

  // Scraper limits
  scraper: {
    maxReviews: parseInt(process.env.SCRAPER_MAX_REVIEWS, 10) || 50,
  },
};
