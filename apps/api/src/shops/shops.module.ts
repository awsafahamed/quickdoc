import { Module } from '@nestjs/common';
import { PublicCatalogController, ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';
import { ShopsAdminController } from './shops-admin.controller';
import { ShopPortalController } from './shop-portal.controller';
import { ShopPortalOperationsController } from './shop-portal-operations.controller';
import { AdminGuard } from '../auth/admin.guard';
import { StorageModule } from '../storage/storage.module';
import { SupportModule } from '../support/support.module';
import { ShopSupportController } from './shop-support.controller';
import { ShopCatalogController } from './shop-catalog.controller';

@Module({
  imports: [StorageModule, SupportModule],
  controllers: [ShopsController, PublicCatalogController, ShopsAdminController, ShopPortalController, ShopPortalOperationsController, ShopSupportController, ShopCatalogController],
  providers: [ShopsService, AdminGuard],
  exports: [ShopsService],
})
export class ShopsModule {}
