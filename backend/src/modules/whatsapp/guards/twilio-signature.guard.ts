import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as twilio from 'twilio';

@Injectable()
export class TwilioSignatureGuard implements CanActivate {
  private readonly logger = new Logger(TwilioSignatureGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    // Test bypass for unit test suites when explicitly configured in test env
    if (process.env.NODE_ENV === 'test' && req.headers['x-test-bypass-signature'] === 'true') {
      return true;
    }

    const twilioSignature = req.headers['x-twilio-signature'] as string;
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN') || process.env.TWILIO_AUTH_TOKEN;

    if (!authToken || authToken.trim() === '') {
      this.logger.error('[TwilioSignatureGuard] TWILIO_AUTH_TOKEN is not configured');
      throw new UnauthorizedException('Twilio authentication is not configured');
    }

    if (!twilioSignature) {
      this.logger.warn('[TwilioSignatureGuard] Rejected request: Missing X-Twilio-Signature header');
      throw new UnauthorizedException('Unauthorized: Missing Twilio signature');
    }

    // Reconstruct request URL from headers (Nginx reverse proxy headers)
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
    const originalUrl = req.originalUrl || req.url || '';

    const reconstructedUrl = `${proto}://${host}${originalUrl}`;

    const explicitCallback = this.configService.get<string>('TWILIO_STATUS_CALLBACK_URL') || process.env.TWILIO_STATUS_CALLBACK_URL;
    const publicApiUrl = this.configService.get<string>('PUBLIC_API_URL') || process.env.PUBLIC_API_URL;

    let publicApiCallbackUrl: string | undefined;
    if (publicApiUrl) {
      publicApiCallbackUrl = `${publicApiUrl.replace(/\/+$/, '')}${originalUrl}`;
    }

    const candidateUrls = [
      reconstructedUrl,
      ...(explicitCallback ? [explicitCallback] : []),
      ...(publicApiCallbackUrl ? [publicApiCallbackUrl] : []),
    ];

    const body = req.body || {};

    let isValid = false;
    for (const url of candidateUrls) {
      try {
        if (twilio.validateRequest(authToken, twilioSignature, url, body)) {
          isValid = true;
          break;
        }
      } catch (err: any) {
        this.logger.warn(`[TwilioSignatureGuard] Signature check threw error for candidate URL '${url}': ${err.message}`);
      }
    }

    if (!isValid) {
      this.logger.warn(`[TwilioSignatureGuard] Rejected request: Invalid Twilio signature for target URL '${reconstructedUrl}'`);
      throw new UnauthorizedException('Unauthorized: Invalid Twilio signature');
    }

    return true;
  }
}
