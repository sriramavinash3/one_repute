import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  planId: string;

  @IsString()
  @IsOptional()
  @IsIn(['monthly', 'quarterly', 'annual'])
  billingCycle?: string = 'monthly';

  @IsString()
  @IsOptional()
  customerId?: string;

  @IsString()
  @IsOptional()
  countryCode?: string;

  @IsString()
  @IsOptional()
  discountCode?: string;

  @IsOptional()
  skipTrial?: boolean;
}

export class VerifyPaymentDto {
  @IsString()
  @IsNotEmpty()
  razorpay_payment_id: string;

  @IsString()
  @IsNotEmpty()
  razorpay_signature: string;

  @IsString()
  @IsNotEmpty()
  razorpay_subscription_id: string;

  @IsString()
  @IsOptional()
  customerId?: string;
}

export class ChangePlanDto {
  @IsString()
  @IsNotEmpty()
  newPlanId: string;

  @IsString()
  @IsOptional()
  @IsIn(['monthly', 'quarterly', 'annual'])
  billingCycle?: string = 'monthly';
}

export class VerifyAndProvisionOutletDto {
  @IsString()
  @IsOptional()
  razorpay_payment_id?: string;

  @IsString()
  @IsOptional()
  razorpay_signature?: string;

  @IsString()
  @IsOptional()
  razorpay_subscription_id?: string;

  @IsString()
  @IsNotEmpty()
  planId: string;

  @IsNotEmpty()
  location: any;

  @IsOptional()
  isTrial?: boolean;
}

