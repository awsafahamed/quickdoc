import { Module } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { PrintModule } from '../print/print.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrintModule, StorageModule],
  controllers: [CustomerController],
})
export class CustomerModule {}
