import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GoogleBusinessService } from './google-business.service';

@Module({
  imports: [ConfigModule],
  providers: [GoogleBusinessService],
  exports: [GoogleBusinessService],
})
export class GoogleBusinessModule {}
