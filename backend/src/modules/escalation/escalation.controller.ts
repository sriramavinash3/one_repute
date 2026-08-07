import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { EscalationService } from './escalation.service';
import { SaveEscalationSettingsDto } from './dto/escalation.dto';

@Controller('escalation')
export class EscalationController {
  private readonly logger = new Logger(EscalationController.name);

  constructor(private readonly escalationService: EscalationService) {}

  /**
   * Helper to resolve target outletId from user context or request parameters
   */
  private resolveOutletId(req: Request, paramOutletId?: string): string {
    if (paramOutletId) return paramOutletId;
    const user = (req as any).user;
    if (user?.assignedOutletIds && user.assignedOutletIds.length > 0) {
      return user.assignedOutletIds[0];
    }
    if (user?.customerId) return user.customerId;
    if (user?.uid) return user.uid;
    return 'default_outlet';
  }

  /**
   * GET /api/escalation/settings
   * GET /api/escalation/settings/:outletId
   */
  @Get('settings')
  async getSettings(@Req() req: Request, @Query('outletId') queryOutletId: string, @Res() res: Response) {
    try {
      const user = (req as any).user;
      const outletId = this.resolveOutletId(req, queryOutletId);
      const settings = await this.escalationService.getSettings(outletId, user?.customerId);
      return res.status(HttpStatus.OK).json(settings);
    } catch (err: any) {
      this.logger.error('[EscalationController] getSettings failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch escalation settings' });
    }
  }

  @Get('settings/:outletId')
  async getSettingsForOutlet(@Param('outletId') outletIdParam: string, @Req() req: Request, @Res() res: Response) {
    try {
      const user = (req as any).user;
      const settings = await this.escalationService.getSettings(outletIdParam, user?.customerId);
      return res.status(HttpStatus.OK).json(settings);
    } catch (err: any) {
      this.logger.error('[EscalationController] getSettingsForOutlet failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch escalation settings' });
    }
  }

  /**
   * POST /api/escalation/settings
   * PUT /api/escalation/settings
   */
  @Post('settings')
  async saveSettingsPost(@Body() dto: SaveEscalationSettingsDto, @Req() req: Request, @Res() res: Response) {
    return this.handleSaveSettings(dto, req, res);
  }

  @Put('settings')
  async saveSettingsPut(@Body() dto: SaveEscalationSettingsDto, @Req() req: Request, @Res() res: Response) {
    return this.handleSaveSettings(dto, req, res);
  }

  private async handleSaveSettings(dto: SaveEscalationSettingsDto, req: Request, res: Response) {
    try {
      const outletId = this.resolveOutletId(req, dto.outletId);
      const result = await this.escalationService.saveSettings(outletId, dto);
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      this.logger.error('[EscalationController] saveSettings failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to save escalation settings', message: err.message });
    }
  }

  /**
   * DELETE /api/escalation/settings/:id
   */
  @Delete('settings/:id')
  async deleteLevel(@Param('id') levelParam: string, @Query('outletId') queryOutletId: string, @Req() req: Request, @Res() res: Response) {
    try {
      const level = parseInt(levelParam, 10);
      if (isNaN(level) || level < 1 || level > 3) {
        return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid escalation level' });
      }
      const outletId = this.resolveOutletId(req, queryOutletId);
      const result = await this.escalationService.deleteLevel(outletId, level);
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      this.logger.error('[EscalationController] deleteLevel failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to delete level settings' });
    }
  }

  /**
   * GET /api/escalation/history
   */
  @Get('history')
  async getHistory(@Query('outletId') queryOutletId: string, @Req() req: Request, @Res() res: Response) {
    try {
      const outletId = this.resolveOutletId(req, queryOutletId);
      const history = await this.escalationService.getHistory(outletId);
      return res.status(HttpStatus.OK).json(history);
    } catch (err: any) {
      this.logger.error('[EscalationController] getHistory failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch escalation history' });
    }
  }

  /**
   * GET /api/escalation/status/:reviewId
   */
  @Get('status/:reviewId')
  async getReviewStatus(@Param('reviewId') reviewId: string, @Res() res: Response) {
    try {
      const status = await this.escalationService.getReviewStatus(reviewId);
      return res.status(HttpStatus.OK).json(status);
    } catch (err: any) {
      this.logger.error('[EscalationController] getReviewStatus failed', { error: err.message });
      if (err.status === 404) return res.status(HttpStatus.NOT_FOUND).json({ error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch review escalation status' });
    }
  }
}
