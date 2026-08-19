import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { PurgeService } from './purge.service';

export class ExecutePurgeDto {
  confirmation!: string;
}

@Controller('admin/purge')
export class PurgeController {
  private readonly logger = new Logger(PurgeController.name);

  constructor(private readonly purgeService: PurgeService) {}

  @Get('dry-run')
  async getDryRunSummary(@Res() res: Response) {
    try {
      const summary = await this.purgeService.getDryRunSummary();
      return res.status(HttpStatus.OK).json(summary);
    } catch (err: any) {
      this.logger.error('[PurgeController] Dry run failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to generate dry run summary',
        message: err.message,
      });
    }
  }

  @Post('dry-run')
  async postDryRunSummary(@Res() res: Response) {
    return this.getDryRunSummary(res);
  }

  @Post('execute')
  async executePurge(@Body() dto: ExecutePurgeDto, @Res() res: Response) {
    try {
      const result = await this.purgeService.executePurge({
        confirmation: dto.confirmation,
      });
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      this.logger.error('[PurgeController] Execute purge failed', { error: err.message });
      if (err.status === 400 || err.message?.includes('Invalid confirmation phrase')) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Purge Confirmation Error',
          message: err.message,
        });
      }
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Purge Execution Failed',
        message: err.message,
      });
    }
  }
}
