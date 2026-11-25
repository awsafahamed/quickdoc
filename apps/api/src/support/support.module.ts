import { Module } from '@nestjs/common';
import { AdminSupportController, CustomerSupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  controllers: [CustomerSupportController, AdminSupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
