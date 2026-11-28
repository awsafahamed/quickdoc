import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { OrderMaintenanceService } from './order-maintenance.service';

@Module({
  imports: [StorageModule],
  providers: [OrderMaintenanceService],
  exports: [OrderMaintenanceService],
})
export class OrdersModule {}
