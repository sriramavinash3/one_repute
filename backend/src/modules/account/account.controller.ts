import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AccountService } from './account.service';
import { VerifyDeletionOtpDto } from './dto/account-deletion.dto';

@Controller('account')
@UseGuards(FirebaseAuthGuard)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post('delete/request')
  @HttpCode(HttpStatus.OK)
  async requestDeletionOtp(@CurrentUser() user: AuthUser) {
    return this.accountService.requestDeletionOtp(user);
  }

  @Post('delete/verify')
  @HttpCode(HttpStatus.OK)
  async verifyDeletionOtp(
    @CurrentUser() user: AuthUser,
    @Body() dto: VerifyDeletionOtpDto,
  ) {
    return this.accountService.verifyDeletionOtp(user, dto.otp);
  }
}
