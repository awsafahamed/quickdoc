import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShopRegistrationDto } from './shop-registration.dto';
import { ShopServiceDto } from './shop-service.dto';

@Controller('shops')
export class ShopsAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('register')
  async register(@Body() dto: ShopRegistrationDto) {
    const existing = await this.prisma.shop.findFirst({ where: { ownerId: dto.ownerId } });
    if (existing) return { data: existing };
    const shop = await this.prisma.shop.create({
      data: {
        ownerId: dto.ownerId,
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
  async applications() {
    return { data: await this.prisma.shop.findMany({ orderBy: { createdAt: 'desc' } }) };
  }

  @Patch(':id/verification')
  async verification(@Param('id') id: string, @Body() body: { status: 'APPROVED' | 'REJECTED' | 'SUSPENDED' }) {
    const shop = await this.prisma.shop.update({
      where: { id },
      data: { status: body.status, isOpen: body.status === 'APPROVED' },
    });
    return { data: shop };
  }

  @Get(':id/services')
  async services(@Param('id') id: string) {
    return { data: await this.prisma.shopService.findMany({ where: { shopId: id }, orderBy: { code: 'asc' } }) };
  }

  @Post(':id/services')
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
