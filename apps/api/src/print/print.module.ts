import { Module } from '@nestjs/common';
import { PrintController } from './print.controller';
import { PrintPricingService } from './print-pricing.service';

@Module({
  controllers: [PrintController],
  providers: [PrintPricingService],
  exports: [PrintPricingService],
})
export class PrintModule {}
