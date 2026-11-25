import { Module } from '@nestjs/common';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';
import { ShopsAdminController } from './shops-admin.controller';
import { ShopPortalController } from './shop-portal.controller';
import { ShopPortalOperationsController } from './shop-portal-operations.controller';
import { AdminGuard } from '../auth/admin.guard';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [ShopsController, ShopsAdminController, ShopPortalController, ShopPortalOperationsController],
  providers: [ShopsService, AdminGuard],
  exports: [ShopsService],
})
export class ShopsModule {}
