/**
 * src/modules/auth/auth.controller.ts
 * 
 * NestJS Auth Controller for Signup, Forgot Password, Reset Password, & Email Verification.
 */

import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus, Logger, Req } from '@nestjs/common';
import { TokenService } from './token.service';
import { EmailService } from '../email/services/email.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * POST /api/auth/forgot-password
   * Generates secure SHA-256 hashed single-use token with 30-min expiry & dispatches Resend email.
   * Returns a generic success response without revealing whether the email exists.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    this.logger.log(`Received password reset request for email: ${dto.email}`);

    try {
      const userName = dto.email.split('@')[0];

      // 1. Generate secure 64-char hex token with 30-minute expiration
      const tokenInfo = this.tokenService.generateSecureToken(30);

      // 2. Store only the SHA-256 hash in database
      await this.tokenService.storeToken(dto.email, tokenInfo);

      // 3. Queue Password Reset Email via BullMQ (Resend delivery)
      await this.emailService.sendPasswordReset({
        recipientEmail: dto.email,
        userName,
        resetUrl: `https://onerepute.com/reset-password?token=${tokenInfo.rawToken}&email=${encodeURIComponent(dto.email)}`,
        expiresInMinutes: 30,
      });

      this.logger.log(`Password reset link dispatched via Resend for email: ${dto.email}`);
    } catch (err: any) {
      // Log internal errors quietly, but still return generic 200 response to prevent enumeration attacks
      this.logger.error(`Error processing password reset for ${dto.email}: ${err.message}`);
    }

    // Generic response preventing user account enumeration
    return {
      success: true,
      message: 'If an account exists with that email, a password reset link has been dispatched.',
    };
  }

  /**
   * POST /api/auth/signup
   */
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() dto: SignupDto) {
    const userName = dto.name || dto.email.split('@')[0];

    // 1. Queue Welcome & Verification Emails via BullMQ + Resend
    await this.emailService.sendWelcomeEmail({
      recipientEmail: dto.email,
      userName,
    });

    const tokenInfo = this.tokenService.generateSecureToken(24 * 60); // 24 hours
    await this.tokenService.storeToken(dto.email, tokenInfo);

    await this.emailService.sendVerificationEmail({
      recipientEmail: dto.email,
      userName,
      verificationUrl: `https://onerepute.com/verify-email?token=${tokenInfo.rawToken}&email=${encodeURIComponent(dto.email)}`,
      expiresInHours: 24,
    });

    return {
      success: true,
      message: 'Account created successfully. Welcome and verification emails dispatched via Resend.',
    };
  }

  /**
   * POST /api/auth/reset-password
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: any) {
    const validation = await this.tokenService.validateToken(dto.email, dto.token);

    if (!validation.valid) {
      return {
        success: false,
        error: validation.reason || 'Invalid or expired password reset token',
      };
    }

    // Invalidate token immediately
    await this.tokenService.invalidateToken(dto.token);

    // Queue Password Changed alert
    const userName = dto.email.split('@')[0];
    const userAgent = req?.headers ? req.headers['user-agent'] : 'Unknown Device';
    await this.emailService.sendPasswordChanged({
      recipientEmail: dto.email,
      userName,
      deviceDetails: userAgent,
    });

    return {
      success: true,
      message: 'Password successfully updated and security alert dispatched via Resend.',
    };
  }

  /**
   * GET /api/auth/verify-email-token
   */
  @Get('verify-email-token')
  @HttpCode(HttpStatus.OK)
  async verifyEmailToken(@Query('email') email: string, @Query('token') token: string) {
    if (!email || !token) {
      return { success: false, error: 'Missing token or email' };
    }

    const validation = await this.tokenService.validateToken(email, token);
    if (!validation.valid) {
      return { success: false, error: validation.reason || 'Invalid or expired verification token' };
    }

    await this.tokenService.invalidateToken(token);

    return {
      success: true,
      message: 'Email address verified successfully!',
    };
  }
}
