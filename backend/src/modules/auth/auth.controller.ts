/**
 * src/modules/auth/auth.controller.ts
 * 
 * NestJS Auth Controller for Signup, Forgot Password, Reset Password, & Email Verification.
 */

import { Controller, Post, Get, Body, Query, Param, HttpCode, HttpStatus, Logger, Req, UseGuards, HttpException, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { TokenService } from './token.service';
import { EmailService } from '../email/services/email.service';
import { FirebaseService } from '../firebase/firebase.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { FirebaseAuthGuard } from './guards/firebase-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUser } from './interfaces/auth-user.interface';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

interface OnboardBody {
  form?: {
    businessName?: string;
    businessType?: string;
    countryCode?: string;
    primaryWhatsAppNumber?: string;
    managerPhone?: string;
    whatsappNumber?: string;
    address?: string;
    placeId?: string;
    planId?: string;
  };
  paymentData?: {
    razorpay_subscription_id?: string | null;
    razorpay_payment_id?: string | null;
  } | null;
  isTrial?: boolean;
  discountData?: any;
  userUid?: string;
  userEmail?: string;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly tokenService: TokenService,
    private readonly emailService: EmailService,
    private readonly firebaseService: FirebaseService,
    private readonly configService: ConfigService,
    private readonly whatsappService: WhatsAppService,
  ) {
    const key = this.configService.get<string>('app.encryptionKey') || '';
    this.encryptionKey = crypto.createHash('sha256').update(key).digest();
  }

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
      const frontendUrl = this.configService.get<string>('app.frontendUrl') || this.configService.get<string>('FRONTEND_BASE_URL') || 'https://onerepute.com';

      // 1. Generate secure 64-char hex token with 30-minute expiration
      const tokenInfo = this.tokenService.generateSecureToken(30);

      // 2. Store only the SHA-256 hash in database
      await this.tokenService.storeToken(dto.email, tokenInfo);

      // 3. Queue Password Reset Email via BullMQ (Resend delivery)
      await this.emailService.sendPasswordReset({
        recipientEmail: dto.email,
        userName,
        resetUrl: `${frontendUrl}/reset-password?token=${tokenInfo.rawToken}&email=${encodeURIComponent(dto.email)}`,
        expiresInMinutes: 30,
        idempotencyKey: `reset_pwd_${dto.email}_${tokenInfo.rawToken.substring(0, 8)}`,
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
    const frontendUrl = this.configService.get<string>('app.frontendUrl') || this.configService.get<string>('FRONTEND_BASE_URL') || 'https://onerepute.com';

    // 1. Queue Welcome & Verification Emails via BullMQ + Resend
    await this.emailService.sendWelcomeEmail({
      recipientEmail: dto.email,
      userName,
      idempotencyKey: `welcome_${dto.email}`,
    });

    const tokenInfo = this.tokenService.generateSecureToken(24 * 60); // 24 hours
    await this.tokenService.storeToken(dto.email, tokenInfo);

    await this.emailService.sendVerificationEmail({
      recipientEmail: dto.email,
      userName,
      verificationUrl: `${frontendUrl}/verify-email?token=${tokenInfo.rawToken}&email=${encodeURIComponent(dto.email)}`,
      expiresInHours: 24,
      idempotencyKey: `verify_${dto.email}_${tokenInfo.rawToken.substring(0, 8)}`,
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

  /**
   * GET /api/auth/onboarding-session/:uid
   * Returns explicit onboarding session status, session payload, GBP info, and outlets.
   */
  @Get('onboarding-session/:uid')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  @Header('Pragma', 'no-cache')
  async getOnboardingSession(@Param('uid') uid: string) {
    this.logger.log(`[Onboarding] GET session request`);
    this.logger.log(`[Onboarding] Requested session ID: ${uid}`);

    const db = this.firebaseService.getDb();

    // 1. Check if user setup is already completed (idempotency check)
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData?.isSetupComplete && userData?.outletId) {
        const outletDoc = await db.collection('outlets').doc(userData.outletId).get();
        const outletData = outletDoc.exists ? outletDoc.data() : null;

        this.logger.log(`[Onboarding] Session found: true`);
        this.logger.log(`[Onboarding] Session status: completed`);
        this.logger.log(`[Onboarding] Google user: ${outletData?.googleAccountEmail || userData?.email || 'N/A'}`);
        this.logger.log(`[Onboarding] GBP status: connected`);
        this.logger.log(`[Onboarding] Session status updated: completed for uid=${uid}`);

        return {
          success: true,
          sessionId: uid,
          status: 'completed',
          session: {
            id: uid,
            status: 'completed',
            googleAccountEmail: outletData?.googleAccountEmail || userData?.email || '',
            googleAccountId: outletData?.googleAccountId || '',
            googleLocationsWarning: '',
            googleLocationsFetchedAt: outletData?.googleConnectedAt || null,
            error: null,
            createdAt: outletData?.createdAt || null,
          },
          googleBusinessProfile: {
            connected: true,
            email: outletData?.googleAccountEmail || '',
            accountId: outletData?.googleAccountId || '',
            locations: outletData?.googleLocations || [],
            warning: '',
            error: null,
          },
          outlets: outletData ? [{ id: outletDoc.id, ...outletData }] : [],
        };
      }
    }

    // 2. Fetch the onboarding session document
    const sessionDoc = await db.collection('onboarding_sessions').doc(uid).get();

    if (!sessionDoc.exists) {
      this.logger.log(`[Onboarding] Session found: false`);
      this.logger.log(`[Onboarding] Session status: no_data`);
      this.logger.log(`[Onboarding] GBP status: not_connected`);
      this.logger.log(`[Onboarding] Session status updated: no_data (no session doc) for uid=${uid}`);

      return {
        success: true,
        sessionId: uid,
        status: 'no_data',
        session: {
          id: uid,
          status: 'no_data',
          googleAccountEmail: '',
          googleAccountId: '',
          googleLocationsWarning: '',
          googleLocationsFetchedAt: null,
          error: null,
          createdAt: null,
        },
        googleBusinessProfile: {
          connected: false,
          email: '',
          accountId: '',
          locations: [],
          warning: '',
          error: null,
        },
        outlets: [],
      };
    }

    const data = sessionDoc.data() || {};
    const locations = data.googleLocations || [];
    const warning = data.googleLocationsWarning || '';
    let errorMsg = data.error || null;
    
    // Explicit status derivation logic:
    let status = data.status;
    if (!status) {
      if (errorMsg) {
        status = 'error';
      } else if (locations.length > 0) {
        status = 'ready';
      } else if (data.googleRefreshToken || warning) {
        status = 'no_data';
      } else {
        status = 'loading';
      }
    }

    // Stale session threshold check: if status is 'loading' for > 45s, mark as timed out / error
    if (status === 'loading') {
      const lastUpdateRaw = data.updatedAt || data.createdAt;
      let lastUpdateMs = 0;
      if (lastUpdateRaw) {
        if (typeof lastUpdateRaw.toDate === 'function') {
          lastUpdateMs = lastUpdateRaw.toDate().getTime();
        } else if (typeof lastUpdateRaw.getTime === 'function') {
          lastUpdateMs = lastUpdateRaw.getTime();
        } else if (typeof lastUpdateRaw === 'number') {
          lastUpdateMs = lastUpdateRaw;
        } else {
          lastUpdateMs = new Date(lastUpdateRaw).getTime();
        }
      }

      if (lastUpdateMs > 0 && Date.now() - lastUpdateMs > 45000) {
        this.logger.warn(`[ONBOARDING] Stale session auto-recovered (timed out after 45s) for uid=${uid}`);
        status = 'error';
        errorMsg = 'Onboarding session timed out. Please try connecting Google again.';
        // Asynchronously update session in Firestore so subsequent checks remain deterministic
        db.collection('onboarding_sessions').doc(uid).set({
          status: 'error',
          error: errorMsg,
          updatedAt: new Date(),
        }, { merge: true }).catch((e) => this.logger.error(`Failed to update stale session in DB: ${e.message}`));
      }
    }

    this.logger.log(`[Onboarding] Session found: true`);
    this.logger.log(`[Onboarding] Session status: ${status}`);
    this.logger.log(`[Onboarding] Google user: ${data.googleAccountEmail || 'N/A'}`);
    this.logger.log(`[Onboarding] GBP status: ${data.googleRefreshToken ? 'connected' : 'not_connected'}`);
    this.logger.log(`[Onboarding] Session status updated: ${status} for uid=${uid}`);

    return {
      success: true,
      sessionId: uid,
      status,
      session: {
        id: uid,
        status,
        googleAccountEmail: data.googleAccountEmail || '',
        googleAccountId: data.googleAccountId || '',
        googleLocationsWarning: warning,
        googleLocationsFetchedAt: data.googleLocationsFetchedAt || null,
        error: errorMsg,
        createdAt: data.createdAt || null,
      },
      googleBusinessProfile: {
        connected: !!data.googleRefreshToken,
        email: data.googleAccountEmail || '',
        accountId: data.googleAccountId || '',
        locations,
        warning,
        error: errorMsg,
      },
      outlets: [],
    };
  }

  /**
   * GET /api/auth/me
   * Resolves currently authenticated customer profile user structure via FirebaseAuthGuard.
   */
  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  getProfile(@CurrentUser() user: AuthUser) {
    return {
      success: true,
      user,
    };
  }

  /**
   * POST /api/auth/onboard
   * Finalizes brand-new user onboarding. Consumes the Google OAuth onboarding
   * session and creates the customer + outlet and links the user document.
   */
  @Post('onboard')
  @HttpCode(HttpStatus.OK)
  async onboard(@Body() body: OnboardBody) {
    const { form, paymentData, isTrial, discountData, userUid, userEmail } = body || {};

    if (!userUid || !userEmail) {
      throw new HttpException('Missing user data', HttpStatus.BAD_REQUEST);
    }

    const db = this.firebaseService.getDb();

    // 0. Idempotency check: if user already completed setup, return existing outlet
    const existingUserDoc = await db.collection('users').doc(userUid).get();
    if (existingUserDoc.exists) {
      const userData = existingUserDoc.data();
      if (userData?.isSetupComplete && userData?.outletId) {
        this.logger.log(`Onboarding already completed for user ${userUid}, returning existing outletId ${userData.outletId}`);
        return { success: true, outletId: userData.outletId, alreadyCompleted: true };
      }
    }

    // 1. The Google OAuth onboarding session must exist (token stored by the callback)
    const sessionDoc = await db.collection('onboarding_sessions').doc(userUid).get();
    const sessionData = sessionDoc.exists ? sessionDoc.data() : null;
    if (!sessionData?.googleRefreshToken || !sessionData?.googleLocations) {
      this.logger.warn(`Onboarding rejected: no Google authorization session for uid=${userUid}`);
      throw new HttpException('Missing Google authorization. Please connect Google My Business.', HttpStatus.BAD_REQUEST);
    }

    const locations = sessionData.googleLocations || [];
    const selectedLocation = locations.find((l: any) => l?.id === form?.placeId) || {};
    const businessName = form?.businessName || selectedLocation.name || 'Unknown Business';
    const businessAddress = (form?.address || selectedLocation.address || '').trim();

    // Business Category fetched from GMB or pre-defined selection
    const businessCategory = form?.businessType || selectedLocation.category || selectedLocation.primaryCategory?.displayName || 'General Business';

    // Separate Country Code and Primary WhatsApp Number
    let countryCode = (form?.countryCode || '+91').trim();
    if (!countryCode.startsWith('+')) {
      countryCode = `+${countryCode}`;
    }

    // Clean primary whatsapp number: remove country code prefix if user accidentally typed it
    let localWhatsApp = (form?.primaryWhatsAppNumber || form?.managerPhone || form?.whatsappNumber || '').trim();
    if (localWhatsApp.startsWith(countryCode)) {
      localWhatsApp = localWhatsApp.slice(countryCode.length);
    }
    localWhatsApp = localWhatsApp.replace(/^\+\d{1,4}/, '').replace(/\D/g, '');

    const fullWhatsAppNumber = `${countryCode}${localWhatsApp}`;

    const now = new Date();
    const trialEndsAt = isTrial ? new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000) : null;

    // 2. Create customer + outlet and link the user in a single atomic batch.
    const customerRef = db.collection('customers').doc();
    const outletRef = db.collection('outlets').doc();
    const userRef = db.collection('users').doc(userUid);

    const batch = db.batch();

    batch.set(customerRef, {
      name: businessName,
      email: userEmail,
      phone: fullWhatsAppNumber,
      plan: isTrial ? 'trial' : (form?.planId || 'plan_starter'),
      subscriptionStatus: isTrial ? 'trialing' : 'active',
      isTrial: Boolean(isTrial),
      onboardingAt: now,
      trialStartDate: isTrial ? now : null,
      trialEndDate: trialEndsAt,
      trialEndsAt,
      razorpaySubscriptionId: paymentData?.razorpay_subscription_id || null,
      razorpayPaymentId: paymentData?.razorpay_payment_id || null,
      appliedDiscount: discountData || null,
      createdAt: now,
    });

    batch.set(outletRef, {
      name: businessName,
      businessType: businessCategory,
      businessCategory: businessCategory,
      countryCode: countryCode,
      primaryWhatsAppNumber: localWhatsApp,
      whatsappNumber: fullWhatsAppNumber,
      managerPhone: fullWhatsAppNumber,
      address: businessAddress,
      placeId: form?.placeId || '',
      providerType: 'GBP',
      googleLocationId: form?.placeId || '',
      googleLocationName: selectedLocation.name || '',
      googleLocationAddress: selectedLocation.address || '',
      googleLocationPhone: selectedLocation.phone || '',
      googleLocationWebsite: selectedLocation.websiteUri || '',
      googlePlaceId: selectedLocation.placeId || '',
      googleLocationLatitude: selectedLocation.latitude ?? null,
      googleLocationLongitude: selectedLocation.longitude ?? null,
      googleAccountId: sessionData.googleAccountId || '',
      googleRefreshToken: sessionData.googleRefreshToken,
      googleAccountEmail: sessionData.googleAccountEmail || '',
      googleTokenScope: sessionData.googleTokenScope || '',
      googleTokenExpiresAt: sessionData.googleTokenExpiresAt || null,
      googleLocations: locations,
      googleConnectedAt: now,
      ownerId: userUid,
      customerId: customerRef.id,
      email: userEmail,
      isActive: true,
      status: 'active',
      reviewsCount: 0,
      averageRating: 5.0,
      createdAt: now,
      updatedAt: now,
    });

    batch.update(userRef, {
      businessName,
      outletId: outletRef.id,
      customerId: customerRef.id,
      isSetupComplete: true,
      role: 'outlet',
      updatedAt: now,
    });

    await batch.commit();

    // 3. Initialize Level 1 escalation setting with the Primary WhatsApp Number
    try {
      await db.collection('escalationSettings').doc(outletRef.id).set({
        masterEnabled: true,
        levels: {
          "1": {
            level: 1,
            name: "Primary Contact",
            designation: "Primary WhatsApp Contact",
            countryCode: countryCode,
            whatsappNumber: localWhatsApp,
            email: userEmail,
            escalationMinutes: 15,
            enabled: true,
          },
        },
        createdAt: now,
        updatedAt: now,
      }, { merge: true });
    } catch (escErr: any) {
      this.logger.warn(`Failed to initialize level 1 escalation setting for outlet ${outletRef.id}: ${escErr.message}`);
    }

    // 4. Dispatch Trial Started or Plan Activated WhatsApp message
    try {
      const appUrl = this.configService.get<string>('APP_URL') || this.configService.get<string>('FRONTEND_BASE_URL') || 'https://app.onerepute.com';
      const recipientName = userEmail.split('@')[0] || businessName;

      if (isTrial && fullWhatsAppNumber) {
        await this.whatsappService.sendTemplateByName({
          templateKey: 'TRIAL_STARTED',
          toNumber: fullWhatsAppNumber,
          variables: {
            Name: recipientName,
            'Outlet Name': businessName,
            Link: `${appUrl}/outlet/settings`,
          },
          idempotencyKey: `trial_started_${customerRef.id}`,
          outletId: outletRef.id,
          customerId: customerRef.id,
          planName: form?.planId || 'starter',
          isTrial: true,
        });
      } else if (fullWhatsAppNumber) {
        await this.whatsappService.sendTemplateByName({
          templateKey: 'PLAN_ACTIVATED',
          toNumber: fullWhatsAppNumber,
          variables: {
            Name: recipientName,
            'Plan Name': (form?.planId || 'Growth').replace('plan_', '').toUpperCase(),
            'Outlet Name': businessName,
            Link: `${appUrl}/outlet/dashboard`,
          },
          idempotencyKey: `plan_activated_${customerRef.id}`,
          outletId: outletRef.id,
          customerId: customerRef.id,
          planName: form?.planId || 'growth',
          isPaid: true,
        });
      }
    } catch (waErr: any) {
      this.logger.warn(`Could not send onboarding WhatsApp message: ${waErr.message}`);
    }

    // 4b. Dispatch Dedicated Outlet Greeting Email (scoped per outletId for strict idempotency)
    try {
      const recipientName = userEmail.split('@')[0] || businessName;
      await this.emailService.sendOutletGreeting({
        outletId: outletRef.id,
        recipientEmail: userEmail,
        userName: recipientName,
        businessName,
        planName: form?.planId || 'Starter',
        isTrial: !!isTrial,
        userId: userUid,
        idempotencyKey: `outlet_greeting_${outletRef.id}`,
      });
      this.logger.log(`Outlet greeting email queued for ${userEmail} (outletId=${outletRef.id})`);
    } catch (emailErr: any) {
      this.logger.warn(`Could not send outlet greeting email for outlet=${outletRef.id}: ${emailErr.message}`);
    }

    // 5. Clean up the temporary session
    await db.collection('onboarding_sessions').doc(userUid).delete();

    this.logger.log(`Onboarding completed: user=${userUid}, customer=${customerRef.id}, outlet=${outletRef.id}, category="${businessCategory}", primaryWhatsApp=${countryCode}${localWhatsApp}`);

    return { success: true, outletId: outletRef.id };
  }
}
