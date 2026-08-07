import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsController } from './payments.controller';
import { PaymentService } from './payment.service';
import { SubscriptionService } from './subscription.service';
import { PlanService } from './plan.service';
import { PaymentsConfigService } from './payments-config.service';

@Module({
  imports: [ConfigModule],
  controllers: [PaymentsController],
  providers: [
    PaymentService,
    SubscriptionService,
    PlanService,
    PaymentsConfigService,
  ],
  exports: [
    PaymentService,
    SubscriptionService,
    PlanService,
    PaymentsConfigService,
  ],
})
export class PaymentsModule {}
