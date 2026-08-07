/**
 * src/modules/auth/auth.module.ts
 */

import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { TokenService } from './token.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [AuthController],
  providers: [TokenService],
  exports: [TokenService],
})
export class AuthModule {}
