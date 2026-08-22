import { Controller, Get, Post, Body, Req, UseGuards, HttpStatus, HttpCode, Logger, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { PaymentService } from './payment.service';
import { SubscriptionService } from './subscription.service';
import { PlanService } from './plan.service';
import { FirebaseService } from '../firebase/firebase.service';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { CreateSubscriptionDto, VerifyPaymentDto, ChangePlanDto, VerifyAndProvisionOutletDto } from './dto/payment.dto';
import { INTERNATIONAL_BILLING_ENABLED } from '../../config/feature-flags.config';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly subscriptionService: SubscriptionService,
    private readonly planService: PlanService,
    private readonly firebaseService: FirebaseService,
  ) {}

  @Get('detect-location')
  async detectLocation(@Req() req: Request) {
    if (!INTERNATIONAL_BILLING_ENABLED) {
      return { country: 'IN', currency: 'INR', symbol: '₹' };
    }
    try {
      let customerData: any = null;
      let userData: any = null;
      let outletData: any = null;

      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const idToken = authHeader.split('Bearer ')[1];
          const decodedToken = await this.firebaseService.verifyIdToken(idToken);
          const db = this.firebaseService.getDb();
          
          const userDoc = await db.collection('users').doc(decodedToken.uid).get();
          if (userDoc.exists) {
            userData = userDoc.data();
            if (userData.customerId) {
              const customerDoc = await db.collection('customers').doc(userData.customerId).get();
              if (customerDoc.exists) {
                customerData = customerDoc.data();
              }
            }
            if (userData.outletId) {
              const outletDoc = await db.collection('outlets').doc(userData.outletId).get();
              if (outletDoc.exists) {
                outletData = outletDoc.data();
              }
            }
          }
        } catch (e) {
          // Ignore invalid token errors and fallback
        }
      }

      const country = this.planService.detectCountry(req, customerData, userData, outletData);
      const starterPrice = await this.planService.getPlanPrice('plan_starter', country);

      return {
        country,
        currency: starterPrice.currency,
        symbol: this.planService.getCurrencySymbol(starterPrice.currency),
      };
    } catch (err: any) {
      this.logger.error(`Failed to detect user country location: ${err.message}`);
      return { country: 'IN', currency: 'INR', symbol: '₹' };
    }
  }

  @Post('create-subscription')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async createSubscription(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSubscriptionDto,
  ) {
    const countryCode = (dto.countryCode || 'IN').toUpperCase();
    if (!INTERNATIONAL_BILLING_ENABLED && countryCode !== 'IN') {
      throw new ForbiddenException('International Billing is unavailable. We launch it soon.');
    }
    const resolvedCustomerId = dto.customerId || user.customerId || `cust_${user.uid}`;
    const skipTrial = dto.skipTrial !== undefined ? dto.skipTrial : true;
    const result = await this.paymentService.createSubscription(
      resolvedCustomerId,
      dto.planId,
      dto.billingCycle || 'monthly',
      countryCode,
      dto.discountCode,
      skipTrial,
    );
    return result;
  }

  @Post('verify')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async verifyPayment(
    @CurrentUser() user: AuthUser,
    @Body() dto: VerifyPaymentDto,
  ) {
    const resolvedCustomerId = (user.role === 'admin' && dto.customerId) ? dto.customerId : (user.customerId || `cust_${user.uid}`);
    const result = await this.paymentService.verifyPayment(
      dto.razorpay_payment_id,
      dto.razorpay_signature,
      dto.razorpay_subscription_id,
      resolvedCustomerId,
    );
    return result;
  }

  @Post('verify-and-provision-outlet')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async verifyAndProvisionOutlet(
    @CurrentUser() user: AuthUser,
    @Body() dto: VerifyAndProvisionOutletDto,
  ) {
    const result = await this.paymentService.verifyAndProvisionOutlet(
      user.uid,
      user.email,
      dto,
    );
    return result;
  }

  @Get('billing-info')
  @UseGuards(FirebaseAuthGuard)
  async getBillingInfo(@CurrentUser() user: AuthUser) {
    const customerId = user.customerId || `cust_${user.uid}`;
    const result = await this.subscriptionService.getBillingInfo(customerId);
    return result;
  }

  @Post('change-plan')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePlan(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePlanDto,
  ) {
    const customerId = user.customerId;
    if (!customerId) {
      return { error: 'Customer context missing' };
    }
    const result = await this.subscriptionService.changePlan(
      customerId,
      dto.newPlanId,
      dto.billingCycle || 'monthly',
    );
    return result;
  }

  @Post('cancel')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async cancelSubscription(@CurrentUser() user: AuthUser) {
    const customerId = user.customerId;
    if (!customerId) {
      return { error: 'Customer context missing' };
    }
    const result = await this.subscriptionService.cancelSubscription(customerId);
    return result;
  }

  @Post('resume')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async resumeSubscription(@CurrentUser() user: AuthUser) {
    const customerId = user.customerId;
    if (!customerId) {
      return { error: 'Customer context missing' };
    }
    const result = await this.subscriptionService.resumeSubscription(customerId);
    return result;
  }
}

