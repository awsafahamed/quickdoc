import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from '../auth/admin.guard';
import { ShopRegistrationDto } from './shop-registration.dto';
import { ShopServiceDto } from './shop-service.dto';

@Controller('shops')
@UseGuards(AuthGuard('jwt'))
export class ShopsAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('register')
  async register(
    @Req() request: { user: { id: string; roles: string[] } },
    @Body() dto: ShopRegistrationDto,
  ) {
    if (!request.user.roles.includes('SHOP_OWNER')) {
      throw new ForbiddenException('A shop owner account is required');
    }
    const existing = await this.prisma.shop.findFirst({ where: { ownerId: request.user.id } });
    if (existing) return { data: existing };
    const shop = await this.prisma.shop.create({
      data: {
        ownerId: request.user.id,
        name: dto.name,
        phone: dto.phone,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });
    return { data: shop };
  }

  @Get('applications')
  @UseGuards(AdminGuard)
  async applications() {
    return { data: await this.prisma.shop.findMany({ orderBy: { createdAt: 'desc' } }) };
  }

  @Patch(':id/verification')
  @UseGuards(AdminGuard)
  async verification(@Param('id') id: string, @Body() body: { status: 'APPROVED' | 'REJECTED' | 'SUSPENDED' }) {
    const shop = await this.prisma.shop.update({
      where: { id },
      data: { status: body.status, isOpen: body.status === 'APPROVED' },
    });
    return { data: shop };
  }

  @Get(':id/services')
  @UseGuards(AdminGuard)
  async services(@Param('id') id: string) {
    return { data: await this.prisma.shopService.findMany({ where: { shopId: id }, orderBy: { code: 'asc' } }) };
  }

  @Post(':id/services')
  @UseGuards(AdminGuard)
  async upsertService(@Param('id') id: string, @Body() dto: ShopServiceDto) {
    if (dto.shopId !== id) return { error: 'Shop ID mismatch' };
    const service = await this.prisma.shopService.upsert({
      where: { shopId_code: { shopId: id, code: dto.code } },
      create: { shopId: id, code: dto.code, enabled: dto.enabled, price: dto.price },
      update: { enabled: dto.enabled, price: dto.price },
    });
    return { data: service };
  }
}
