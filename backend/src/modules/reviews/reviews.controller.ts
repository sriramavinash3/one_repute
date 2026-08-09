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
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { ReviewsService } from './reviews.service';
import { ReviewSyncService } from './review-sync.service';
import { ReviewReplyService } from './review-reply.service';
import { ReviewAnalyticsService } from './review-analytics.service';
import { ReputationService } from './reputation.service';
import { ReviewSchedulerService } from './review-scheduler.service';
import { GetReviewsDto, EditReplyDto, UpdateCategoryRuleDto, TriggerSyncDto } from './dto/reviews.dto';

@Controller()
@UseGuards(FirebaseAuthGuard)
export class ReviewsController {
  private readonly logger = new Logger(ReviewsController.name);

  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly syncService: ReviewSyncService,
    private readonly replyService: ReviewReplyService,
    private readonly analyticsService: ReviewAnalyticsService,
    private readonly reputationService: ReputationService,
    private readonly schedulerService: ReviewSchedulerService,
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
        page: Number(query.page) || 1,
        limit: Number(query.limit) || 10,
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

  /** GET /api/escalations */
  @Get('escalations')
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

  /** PATCH /api/outlets/reviews/:id/status */
  @Patch('outlets/reviews/:id/status')
  async updateReviewStatus(@Param('id') reviewId: string, @Body('status') status: string, @Req() req: Request, @Res() res: Response) {
    try {
      const user = (req as any).user;
      const result = await this.reviewsService.updateReviewStatus(reviewId, status, user);
      if (!result.success) {
        return res.status(403).json(result);
      }
      return res.status(200).json(result);
    } catch (err: any) {
      this.logger.error('[ReviewsController] updateReviewStatus failed', { error: err.message });
      if (err.message === 'Review not found') return res.status(404).json({ error: 'Review not found' });
      return res.status(500).json({ error: 'Failed to update review status' });
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

  // ─── Approval Workflow ────────────────────────────────────────────────────────

  /** GET /api/approvals */
  @Get('approvals')
  async getApprovals(@Req() req: Request, @Res() res: Response) {
    try {
      const user = (req as any).user;
      if (!user?.customerId) return res.status(403).json({ error: 'Customer context required' });
      const data = await this.replyService.getApprovals(user.customerId);
      return res.status(200).json(data);
    } catch (err: any) {
      this.logger.error('[ReviewsController] getApprovals failed', { error: err.message });
      return res.status(500).json({ error: 'Failed to fetch approvals' });
    }
  }

  /** POST /api/approvals/:reviewId/approve */
  @Post('approvals/:reviewId/approve')
  async approveReply(@Param('reviewId') reviewId: string, @Req() req: Request, @Res() res: Response) {
    try {
      const user = (req as any).user;
      if (!user?.customerId) return res.status(403).json({ error: 'Customer context required' });
      await this.replyService.approveReply(reviewId, user.customerId, user.email || 'unknown');
      return res.status(200).json({ success: true, message: 'Response approved and posted successfully.' });
    } catch (err: any) {
      this.logger.error('[ReviewsController] approveReply failed', { error: err.message });
      if (err.status === 404) return res.status(404).json({ error: err.message });
      if (err.status === 403) return res.status(403).json({ error: err.message });
      if (err.status === 400) return res.status(400).json({ error: err.message });
      return res.status(500).json({ error: 'Failed to approve response' });
    }
  }

  /** POST /api/approvals/:reviewId/reject */
  @Post('approvals/:reviewId/reject')
  async rejectReply(@Param('reviewId') reviewId: string, @Req() req: Request, @Res() res: Response) {
    try {
      const user = (req as any).user;
      if (!user?.customerId) return res.status(403).json({ error: 'Customer context required' });
      await this.replyService.rejectReply(reviewId, user.customerId, user.email || 'unknown');
      return res.status(200).json({ success: true, message: 'Response suggestion rejected.' });
    } catch (err: any) {
      this.logger.error('[ReviewsController] rejectReply failed', { error: err.message });
      if (err.status === 404) return res.status(404).json({ error: err.message });
      if (err.status === 403) return res.status(403).json({ error: err.message });
      return res.status(500).json({ error: 'Failed to reject suggestion' });
    }
  }

  /** POST /api/approvals/:reviewId/edit */
  @Post('approvals/:reviewId/edit')
  async editAndApprove(@Param('reviewId') reviewId: string, @Body() body: EditReplyDto, @Req() req: Request, @Res() res: Response) {
    try {
      const user = (req as any).user;
      if (!user?.customerId) return res.status(403).json({ error: 'Customer context required' });
      await this.replyService.editAndApproveReply(reviewId, user.customerId, body.editedReply, user.email || 'unknown');
      return res.status(200).json({ success: true, message: 'Edited response approved and posted.' });
    } catch (err: any) {
      this.logger.error('[ReviewsController] editAndApprove failed', { error: err.message });
      if (err.status === 400) return res.status(400).json({ error: err.message });
      if (err.status === 404) return res.status(404).json({ error: err.message });
      if (err.status === 403) return res.status(403).json({ error: err.message });
      return res.status(500).json({ error: 'Failed to save edited reply' });
    }
  }

  // ─── Manual Sync ──────────────────────────────────────────────────────────────

  /** POST /api/reviews/sync */
  @Post('reviews/sync')
  async triggerSync(@Body() body: TriggerSyncDto, @Res() res: Response) {
    try {
      if (body.outletId) {
        const result = await this.schedulerService.triggerImmediateSync(body.outletId);
        return res.status(200).json(result);
      } else {
        const results = await this.schedulerService.triggerFullSync();
        return res.status(200).json({ message: 'Full sync complete', results });
      }
    } catch (err: any) {
      this.logger.error('[ReviewsController] triggerSync failed', { error: err.message });
      return res.status(500).json({ error: 'Sync failed', message: err.message });
    }
  }
}
