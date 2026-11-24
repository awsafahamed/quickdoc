import { Module } from '@nestjs/common';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';
import { ShopsAdminController } from './shops-admin.controller';
import { ShopPortalController } from './shop-portal.controller';

@Module({
  controllers: [ShopsController, ShopsAdminController, ShopPortalController],
  providers: [ShopsService],
  exports: [ShopsService],
})
export class ShopsModule {}
