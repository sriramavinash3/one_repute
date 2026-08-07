import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class SaveEscalationSettingsDto {
  @IsOptional()
  @IsString()
  outletId?: string;

  @IsOptional()
  @IsBoolean()
  masterEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  level?: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10080)
  escalationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
