import { Controller, Post, Req, Headers, HttpStatus, Logger, HttpCode } from '@nestjs/common';
import { Request } from 'express';
import { WebhookService } from './webhook.service';

@Controller('payments')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: Request,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    if (!signature) {
      this.logger.warn('Received Razorpay webhook request without signature header');
      return { error: 'Missing signature header' };
    }

    const payloadString = JSON.stringify(req.body);
    const isValid = this.webhookService.verifySignature(payloadString, signature);
    
    if (!isValid) {
      this.logger.warn('Razorpay webhook signature verification failed');
      return { error: 'Signature verification failed' };
    }

    await this.webhookService.processWebhook(req.body);
    return { status: 'processed' };
  }
}
