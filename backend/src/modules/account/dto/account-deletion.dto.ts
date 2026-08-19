import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';

export class VerifyDeletionOtpDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'Verification code must be exactly 6 digits.' })
  @Matches(/^\d{6}$/, { message: 'Verification code must contain digits only.' })
  otp!: string;
}
