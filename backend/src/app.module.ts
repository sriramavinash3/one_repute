/**
 * src/app.module.ts
 * 
 * Root NestJS module for OneRepute backend.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailModule } from './modules/email/email.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EmailModule,
    AuthModule,
  ],
})
export class AppModule {}
