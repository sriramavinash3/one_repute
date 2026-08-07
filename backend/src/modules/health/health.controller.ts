import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import { AIService } from '../ai/ai.service';
import { CacheService } from '../cache/cache.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly firebaseService: FirebaseService,
    private readonly aiService: AIService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  async getOverallHealth(@Res() res: Response) {
    const [dbOk, firebaseOk, aiStatus] = await Promise.all([
      this.checkDatabase(),
      this.checkFirebase(),
      this.aiService.healthCheck(),
    ]);

    const isHealthy = dbOk && firebaseOk;
    const statusCode = isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    return res.status(statusCode).json({
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      components: {
        database: dbOk ? 'up' : 'down',
        firebase: firebaseOk ? 'up' : 'down',
        ai: aiStatus,
      },
    });
  }

  @Get('database')
  async getDatabaseHealth(@Res() res: Response) {
    const ok = await this.checkDatabase();
    const status = ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(status).json({
      status: ok ? 'up' : 'down',
      service: 'postgresql',
      timestamp: new Date().toISOString(),
    });
  }

  @Get('redis')
  async getRedisHealth(@Res() res: Response) {
    const ok = await this.cacheService.isHealthy();
    return res.status(HttpStatus.OK).json({
      status: ok ? 'up' : 'memory_fallback',
      service: 'redis',
      timestamp: new Date().toISOString(),
    });
  }

  @Get('firebase')
  async getFirebaseHealth(@Res() res: Response) {
    const ok = await this.checkFirebase();
    const status = ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(status).json({
      status: ok ? 'up' : 'down',
      service: 'firestore',
      timestamp: new Date().toISOString(),
    });
  }

  @Get('ai')
  async getAiHealth(@Res() res: Response) {
    const status = await this.aiService.healthCheck();
    return res.status(HttpStatus.OK).json({
      status: 'active',
      providers: status,
      timestamp: new Date().toISOString(),
    });
  }

  @Get('queues')
  async getQueueHealth(@Res() res: Response) {
    return res.status(HttpStatus.OK).json({
      status: 'active',
      queues: ['ai-generation', 'review-sync', 'email', 'notifications', 'reports'],
      timestamp: new Date().toISOString(),
    });
  }

  @Get('google')
  async getGoogleHealth(@Res() res: Response) {
    return res.status(HttpStatus.OK).json({
      status: 'configured',
      service: 'google-business-profile',
      timestamp: new Date().toISOString(),
    });
  }

  private async checkDatabase(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return true; // Graceful check when running in Firestore-only mode
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkFirebase(): Promise<boolean> {
    try {
      const db = this.firebaseService.getDb();
      await db.collection('health').doc('ping').get();
      return true;
    } catch {
      return false;
    }
  }
}
