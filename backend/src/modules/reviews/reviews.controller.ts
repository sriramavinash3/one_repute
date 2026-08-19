import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  Logger,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { ReviewsService } from './reviews.service';
import { ReviewSyncService } from './review-sync.service';
import { ReviewAnalyticsService } from './review-analytics.service';
import { ReputationService } from './reputation.service';
import { ReviewSchedulerService } from './review-scheduler.service';
import { ReviewReplyService } from './review-reply.service';
import { ReviewQueueService } from './queues/review-queue.service';
import { GetReviewsDto, UpdateCategoryRuleDto, TriggerSyncDto } from './dto/reviews.dto';

@Controller()
@UseGuards(FirebaseAuthGuard)
export class ReviewsController {
  private readonly logger = new Logger(ReviewsController.name);

  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly syncService: ReviewSyncService,
    private readonly analyticsService: ReviewAnalyticsService,
    private readonly reputationService: ReputationService,
    private readonly schedulerService: ReviewSchedulerService,
    private readonly replyService: ReviewReplyService,
    @Inject(forwardRef(() => ReviewQueueService))
    private readonly reviewQueueService: ReviewQueueService,
  ) {}

  // ─── Reviews ─────────────────────────────────────────────────────────────────

  /** GET /api/reviews */
  @Get('reviews')
  async getReviews(@Query() query: GetReviewsDto, @Res() res: Response) {
    try {
      const result = await this.reviewsService.getReviews({
        outletId: query.outletId,
        status: query.status,
        rating: query.rating,
        search: query.search,
        sort: query.sort,
        from: query.from,
        to: query.to,
        page: Number(query.page) || 1,
        limit: Math.min(Math.max(1, Number(query.limit) || 10), 50),
      });
      return res.status(200).json(result);
    } catch (err: any) {
      this.logger.error('[ReviewsController] getReviews failed', { error: err.message });
      if (err.status === 404 || err.message?.includes('not found') || err.message?.includes('no longer available')) {
        return res.status(404).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Failed to fetch reviews' });
    }
  }

  /** GET /api/reviews/count — authoritative Total Reviews for an outlet */
  @Get('reviews/count')
  async getReviewCount(@Query('outletId') outletId: string, @Req() req: Request, @Res() res: Response) {
    if (!outletId) return res.status(400).json({ error: 'outletId parameter is required' });
    try {
      const result = await this.reviewsService.getReviewCount(outletId, (req as any).user);
      return res.status(200).json(result);
    } catch (err: any) {
      this.logger.error('[ReviewsController] getReviewCount failed', { error: err.message });
      if (err.status === 403 || err.message?.includes('Access denied')) {
        return res.status(403).json({ error: err.message });
      }
      if (err.status === 404 || err.message?.includes('not found') || err.message?.includes('no longer available')) {
        return res.status(404).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Failed to fetch review count' });
    }
  }

  /** GET /api/escalations or GET /api/reviews/escalations */
  @Get('escalations')
  @Get('reviews/escalations')
  async getEscalations(@Query('outletId') outletId: string, @Res() res: Response) {
    try {
      const data = await this.reviewsService.getEscalatedReviews(outletId);
      return res.status(200).json(data);
    } catch (err: any) {
      this.logger.error('[ReviewsController] getEscalations failed', { error: err.message });
      if (err.status === 404 || err.message?.includes('not found') || err.message?.includes('no longer available')) {
        return res.status(404).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Failed to fetch escalations' });
    }
  }

  /** GET /api/outlets/historical-summary or GET /api/reviews/historical-summary */
  @Get('outlets/historical-summary')
  @Get('reviews/historical-summary')
  async getHistoricalSummary(@Query('outletId') outletId: string, @Res() res: Response) {
    if (!outletId) return res.status(400).json({ error: 'outletId parameter is required' });
    try {
      const data = await this.reviewsService.getHistoricalSummary(outletId);
      return res.status(200).json(data);
    } catch (err: any) {
      this.logger.error('[ReviewsController] getHistoricalSummary failed', { error: err.message });
      return res.status(500).json({ error: 'Failed to fetch historical summary' });
    }
  }

  // ─── Review Reply & Reprocessing Endpoints ────────────────────────────────────

  /** POST /api/reviews/:id/reply — Publish a reply to Google Business Profile */
  @Post('reviews/:id/reply')
  async postReply(
    @Param('id') id: string,
    @Body() body: { outletId?: string; replyText: string },
    @Res() res: Response,
  ) {
    if (!body?.replyText?.trim()) {
      return res.status(400).json({ error: 'replyText is required' });
    }
    try {
      let outletId = body.outletId;
      if (!outletId) {
        const reviewData = await this.reviewsService.getReviews({ page: 1, limit: 1, search: id });
        const review = reviewData?.data?.find((r: any) => r.id === id || r.reviewId === id);
        if (review) outletId = review.outletId;
      }
      if (!outletId) {
        return res.status(400).json({ error: 'outletId parameter or valid review object required' });
      }

      const result = await this.replyService.postDirectReply(outletId, id, body.replyText.trim());
      return res.status(200).json({
        success: true,
        message: 'Reply published to Google Business Profile successfully',
        repliedAt: result.repliedAt,
      });
    } catch (err: any) {
      this.logger.error(`[ReviewsController] postReply failed for review ${id}: ${err.message}`);
      const statusCode = err.status || (err.message?.includes('not found') ? 404 : 500);
      return res.status(statusCode).json({ error: err.message || 'Failed to post reply to Google Business Profile' });
    }
  }

  /** POST /api/reviews/:id/reprocess — Internal/Manual end-to-end reprocessing of an existing review */
  @Post('reviews/:id/reprocess')
  async reprocessReview(@Param('id') id: string, @Res() res: Response) {
    try {
      const result = await this.replyService.reprocessReview(id);
      return res.status(200).json({
        success: true,
        message: 'Review reprocessed successfully',
        data: result,
      });
    } catch (err: any) {
      this.logger.error(`[ReviewsController] reprocessReview failed for review ${id}: ${err.message}`);
      const statusCode = err.status || (err.message?.includes('not found') ? 404 : 500);
      return res.status(statusCode).json({ error: err.message || 'Failed to reprocess review' });
    }
  }

  // ─── Analytics ───────────────────────────────────────────────────────────────

  /** GET /api/analytics/summary */
  @Get('analytics/summary')
  async getAnalyticsSummary(@Query('outletId') outletId: string, @Res() res: Response) {
    try {
      const data = await this.analyticsService.getSummary(outletId);
      return res.status(200).json(data);
    } catch (err: any) {
      this.logger.error('[ReviewsController] getAnalyticsSummary failed', { error: err.message });
      if (err.status === 404 || err.message?.includes('not found') || err.message?.includes('no longer available')) {
        return res.status(404).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  }

  /** GET /api/analytics/timeline */
  @Get('analytics/timeline')
  async getAnalyticsTimeline(
    @Query('outletId') outletId: string,
    @Query('dateRange') dateRange: string,
    @Res() res: Response,
  ) {
    try {
      const data = await this.analyticsService.getTimeline(outletId, dateRange);
      return res.status(200).json(data);
    } catch (err: any) {
      this.logger.error('[ReviewsController] getAnalyticsTimeline failed', { error: err.message });
      if (err.status === 404 || err.message?.includes('not found') || err.message?.includes('no longer available')) {
        return res.status(404).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Failed to fetch analytics timeline' });
    }
  }

  // ─── Reputation Insights ─────────────────────────────────────────────────────

  /** GET /api/outlets/reputation-insights */
  @Get('outlets/reputation-insights')
  async getReputationInsights(
    @Query('outletId') outletId: string,
    @Query('dateRange') dateRange: string,
    @Res() res: Response,
  ) {
    if (!outletId) return res.status(400).json({ error: 'outletId is required' });
    try {
      const data = await this.reputationService.getReputationInsights(outletId, dateRange);
      return res.status(200).json(data);
    } catch (err: any) {
      this.logger.error('[ReviewsController] getReputationInsights failed', { error: err.message });
      if (err.status === 404 || err.message?.includes('not found') || err.message?.includes('no longer available')) {
        return res.status(404).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Failed to generate reputation insights', message: err.message });
    }
  }

  /** POST /api/outlets/reputation-insights/rules */
  @Post('outlets/reputation-insights/rules')
  async updateCategoryRules(@Body() body: UpdateCategoryRuleDto, @Res() res: Response) {
    if (!body.outletId) return res.status(400).json({ error: 'Missing outletId' });
    if (!body.categoryName || !body.actionType) return res.status(400).json({ error: 'Missing parameters' });
    try {
      const data = await this.reputationService.updateCategoryRules(body.outletId, body.categoryName, body.actionType, body.inputValue);
      return res.status(200).json(data);
    } catch (err: any) {
      this.logger.error('[ReviewsController] updateCategoryRules failed', { error: err.message });
      return res.status(500).json({ error: 'Failed to update rules' });
    }
  }

  // ─── Async Review Synchronization Pipeline ───────────────────────────────────

  /** POST /api/reviews/sync — Initiate async review sync job with request coalescing */
  @Post('reviews/sync')
  async triggerSync(@Body() body: TriggerSyncDto, @Res() res: Response) {
    try {
      if (body.outletId) {
        const { status, isNew } = await this.reviewQueueService.createOrGetActiveSyncJob(
          body.outletId,
          true,
          'manual',
        );

        // If in inline fallback mode, execute immediately
        if (!this.reviewQueueService.isRedisConnected()) {
          const syncResult = await this.syncService.executeSyncJob({
            jobId: status.jobId,
            outletId: body.outletId,
            skipCooldown: true,
          });
          return res.status(200).json(syncResult);
        }

        return res.status(202).json({
          message: isNew ? 'Sync job enqueued successfully' : 'Sync job already in progress',
          jobId: status.jobId,
          status: status.status,
          stage: status.stage,
          outletId: body.outletId,
        });
      } else {
        const results = await this.schedulerService.triggerFullSync();
        return res.status(200).json({ message: 'Full sync initiated', results });
      }
    } catch (err: any) {
      this.logger.error('[ReviewsController] triggerSync failed', { error: err.message });
      return res.status(500).json({ error: 'Sync failed to initiate', message: err.message });
    }
  }

  /** GET /api/reviews/sync/status — Query real-time job status for frontend polling */
  @Get('reviews/sync/status')
  async getSyncStatus(
    @Query('jobId') jobId: string,
    @Query('outletId') outletId: string,
    @Res() res: Response,
  ) {
    const lookupId = jobId || outletId;
    if (!lookupId) {
      return res.status(400).json({ error: 'Either jobId or outletId parameter is required' });
    }
    try {
      const status = await this.reviewQueueService.getJobStatus(lookupId);
      if (!status) {
        return res.status(404).json({ error: 'Sync job status not found', jobId: lookupId });
      }
      return res.status(200).json(status);
    } catch (err: any) {
      this.logger.error('[ReviewsController] getSyncStatus failed', { error: err.message });
      return res.status(500).json({ error: 'Failed to retrieve sync job status' });
    }
  }

  /** GET /api/outlets */
  @Get('outlets')
  async getOutlets(@Req() req: Request, @Query('customerId') customerId: string, @Res() res: Response) {
    try {
      const data = await this.reviewsService.getOutlets((req as any).user?.uid, customerId);
      return res.status(200).json(data);
    } catch (err: any) {
      this.logger.error('[ReviewsController] getOutlets failed', { error: err.message });
      return res.status(500).json({ error: 'Failed to fetch outlets' });
    }
  }

  /** GET /api/outlets/:id */
  @Get('outlets/:id')
  async getOutletById(@Param('id') id: string, @Res() res: Response) {
    try {
      const data = await this.reviewsService.getOutletById(id);
      return res.status(200).json(data);
    } catch (err: any) {
      this.logger.error('[ReviewsController] getOutletById failed', { error: err.message });
      if (err.message?.includes('not found') || err.message?.includes('removed')) {
        return res.status(404).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Failed to fetch outlet details' });
    }
  }

  /** POST /api/outlets/:id, POST /api/outlets/:id/settings, PATCH /api/outlets/:id/settings */
  @Post('outlets/:id')
  @Post('outlets/:id/settings')
  @Patch('outlets/:id/settings')
  async updateOutletSettings(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    try {
      const result = await this.reviewsService.updateCustomerOutletSettings(id, body, true);
      return res.status(200).json(result);
    } catch (err: any) {
      this.logger.error('[ReviewsController] updateOutletSettings failed', { error: err.message });
      if (err.status === 404 || err.message?.includes('not found')) {
        return res.status(404).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Failed to update outlet settings' });
    }
  }
}
