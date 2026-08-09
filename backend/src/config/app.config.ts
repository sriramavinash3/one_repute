import { registerAs } from '@nestjs/config';

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// Environment-aware URL defaults: localhost only for local development,
// the production domain for everything else. Explicit env vars always win.
const defaultFrontendUrl = isProduction ? 'https://onerepute.com' : 'http://localhost:5173';
const defaultAppUrl = isProduction ? 'https://onerepute.com' : 'http://localhost:3000';

export default registerAs('app', () => ({
  env: nodeEnv,
  port: parseInt(process.env.PORT || '3000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  frontendUrl: process.env.FRONTEND_BASE_URL || defaultFrontendUrl,
  appUrl: process.env.APP_URL || defaultAppUrl,
  isProduction,
  isDevelopment: nodeEnv === 'development',
  encryptionKey: process.env.ENCRYPTION_KEY || 'd9f8e7d6c5b4a39281706f5e4d3c2b1a0987654321fedcba0987654321abcdef',
}));
