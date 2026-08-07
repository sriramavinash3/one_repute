/**
 * src/main.ts
 * 
 * NestJS Application Entrypoint with unified Express fallback router.
 */

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  // 1. Initialize Firebase Admin SDK
  try {
    const { getDb } = require('../config/firebase');
    getDb();
  } catch (err: any) {
    logger.warn(`Firebase initialization note: ${err.message}`);
  }

  // 2. Create NestJS Application
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: ['http://localhost:5173', 'https://onerepute.com', 'https://www.onerepute.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // 3. Mount existing Express application middleware for legacy routes (/api/outlets, /api/reviews, etc.)
  try {
    let legacyExpressApp;
    try {
      legacyExpressApp = require('../app');
    } catch (e) {
      legacyExpressApp = require('../../app');
    }
    app.use(legacyExpressApp);
  } catch (err: any) {
    logger.warn(`Legacy Express app mount note: ${err.message}`);
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port);
  logger.log(`OneRepute Unified NestJS Server is running on port ${port} with /api prefix`);
}

if (require.main === module) {
  bootstrap();
}

export { bootstrap };
