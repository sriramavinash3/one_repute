import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    if (!process.env.DATABASE_URL) {
      this.logger.warn('Prisma Connection warning: DATABASE_URL is not set. Database operations will bypass PG.');
      return;
    }
    try {
      await this.$connect();
      this.logger.log('Prisma connected to database successfully.');
    } catch (err: any) {
      this.logger.warn(`Prisma connection failed: ${err.message}. Gracefully falling back to local operations.`);
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch (err) {
      // Ignore disconnect errors
    }
  }
}
