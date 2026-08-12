import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { GoogleAuthController } from './google-auth.controller';
import { TokenService } from './token.service';
import { EmailModule } from '../email/email.module';
import { GoogleBusinessModule } from '../google-business/google-business.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { FirebaseAuthMiddleware } from './guards/express-auth.middleware';

@Module({
  imports: [EmailModule, GoogleBusinessModule, FirebaseModule, WhatsAppModule],
  controllers: [AuthController, GoogleAuthController],
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
