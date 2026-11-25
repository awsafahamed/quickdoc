import { Module } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { PrintModule } from '../print/print.module';

@Module({
  imports: [PrintModule],
  controllers: [CustomerController],
})
export class CustomerModule {}
