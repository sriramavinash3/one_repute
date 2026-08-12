import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetLogsQueryDto {
  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  pageSize?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class DeleteLogsDto {
  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsNumber()
  olderThanDays?: number;
}

export class CreateAdminOutletDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  googlePlaceId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;
}

export class UpdateOutletStatusDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateOutletSettingsDto {
  @IsOptional()
  name?: string;

  @IsOptional()
  address?: string;

  @IsOptional()
  email?: string;

  @IsOptional()
  whatsappNumber?: string;

  @IsOptional()
  escalationThreshold?: number;

  @IsOptional()
  settings?: any;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @IsOptional()
  @IsNumber()
  aiCredits?: number;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;
}

export class SaveBillingPriceDto {
  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  monthlyPrice?: number | string;

  @IsOptional()
  quarterlyPrice?: number | string;

  @IsOptional()
  annualPrice?: number | string;

  @IsOptional()
  @IsString()
  razorpayMonthlyPlanId?: string;

  @IsOptional()
  @IsString()
  razorpayQuarterlyPlanId?: string;

  @IsOptional()
  @IsString()
  razorpayAnnualPlanId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateDiscountDto {
  @IsString()
  code: string;

  @IsString()
  type: string;

  @IsNumber()
  value: number;

  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateTicketDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;
}
