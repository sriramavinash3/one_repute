/**
 * src/modules/auth/auth.module.ts
 */

import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { TokenService } from './token.service';
import { EmailModule } from '../email/email.module';
import { FirebaseAuthMiddleware } from './guards/express-auth.middleware';

@Module({
  imports: [EmailModule],
  controllers: [AuthController],
  providers: [TokenService],
  exports: [TokenService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(FirebaseAuthMiddleware)
      .forRoutes('*');
  }
}
