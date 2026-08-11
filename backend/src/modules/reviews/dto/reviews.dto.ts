import { IsOptional, IsString, IsNumberString } from 'class-validator';

export class GetReviewsDto {
  @IsOptional() @IsString() outletId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() rating?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsNumberString() page?: string;
  @IsOptional() @IsNumberString() limit?: string;
}

export class UpdateCategoryRuleDto {
  @IsString() outletId: string;
  @IsString() categoryName: string;
  @IsString() actionType: string;
  @IsOptional() @IsString() inputValue?: string;
}

export class TriggerSyncDto {
  @IsOptional() @IsString() outletId?: string;
}
