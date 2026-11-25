import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsBoolean, IsEmail, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateObjectStorageService } from '../storage/private-object-storage.service';

class ShopProfileDto {
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Length(5, 500) address!: string;
  @IsString() @Length(7, 20) phone!: string;
  @IsNumber({ maxDecimalPlaces: 7 }) latitude!: number;
  @IsNumber({ maxDecimalPlaces: 7 }) longitude!: number;
}

class OpeningHourDto {
  @IsNumber() @Min(0) dayOfWeek!: number;
  @IsString() opensAt!: string;
  @IsString() closesAt!: string;
  @IsOptional() @IsBoolean() isClosed?: boolean;
}

class ShopServiceDto {
  @IsString() code!: string;
  @IsBoolean() enabled!: boolean;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price!: number;
}

class StaffDto {
  @IsEmail() email!: string;
}

@Controller('shop/me')
@UseGuards(AuthGuard('jwt'))
export class ShopPortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PrivateObjectStorageService,
  ) {}

  private async shopForOwner(userId: string) {
    const shop = await this.prisma.shop.findFirst({ where: { ownerId: userId } });
    if (!shop) throw new BadRequestException('No print shop is linked to this account');
    return shop;
  }

  @Get()
  async profile(@Req() req: { user: { id: string } }) {
    return { data: await this.prisma.shop.findFirst({ where: { ownerId: req.user.id }, include: { services: true, openingHours: true, staff: true } }) };
  }

  @Patch()
  async updateProfile(@Req() req: { user: { id: string } }, @Body() dto: ShopProfileDto) {
    const shop = await this.shopForOwner(req.user.id);
    return { data: await this.prisma.shop.update({ where: { id: shop.id }, data: { name: dto.name, address: dto.address, phone: dto.phone, latitude: dto.latitude, longitude: dto.longitude } }) };
  }

  @Patch('availability')
  async availability(@Req() req: { user: { id: string } }, @Body() body: { isOpen: boolean }) {
    const shop = await this.shopForOwner(req.user.id);
    if (shop.status !== 'APPROVED') throw new BadRequestException('Shop must be approved before accepting orders');
    return { data: await this.prisma.shop.update({ where: { id: shop.id }, data: { isOpen: body.isOpen } }) };
  }

  @Get('services')
  async services(@Req() req: { user: { id: string } }) {
    const shop = await this.shopForOwner(req.user.id);
    return { data: await this.prisma.shopService.findMany({ where: { shopId: shop.id }, orderBy: { code: 'asc' } }) };
  }

  @Post('services')
  async upsertService(@Req() req: { user: { id: string } }, @Body() dto: ShopServiceDto) {
    const shop = await this.shopForOwner(req.user.id);
    return { data: await this.prisma.shopService.upsert({ where: { shopId_code: { shopId: shop.id, code: dto.code } }, create: { shopId: shop.id, code: dto.code, enabled: dto.enabled, price: dto.price }, update: { enabled: dto.enabled, price: dto.price } }) };
  }

  @Delete('services/:code')
  async deleteService(@Req() req: { user: { id: string } }, @Param('code') code: string) {
    const shop = await this.shopForOwner(req.user.id);
    await this.prisma.shopService.delete({ where: { shopId_code: { shopId: shop.id, code } } });
    return { data: { deleted: true } };
  }

  @Get('hours')
  async hours(@Req() req: { user: { id: string } }) {
    const shop = await this.shopForOwner(req.user.id);
    return { data: await this.prisma.shopOpeningHour.findMany({ where: { shopId: shop.id }, orderBy: { dayOfWeek: 'asc' } }) };
  }

  @Post('hours')
  async saveHours(@Req() req: { user: { id: string } }, @Body() dto: OpeningHourDto) {
    const shop = await this.shopForOwner(req.user.id);
    if (dto.dayOfWeek < 0 || dto.dayOfWeek > 6) throw new BadRequestException('dayOfWeek must be between 0 and 6');
    return {     data: await this.prisma.shopOpeningHour.upsert({ where: { shopId_dayOfWeek: { shopId: shop.id, dayOfWeek: dto.dayOfWeek } }, create: { shopId: shop.id, dayOfWeek: dto.dayOfWeek, opensAt: dto.opensAt, closesAt: dto.closesAt, isClosed: dto.isClosed }, update: { opensAt: dto.opensAt, closesAt: dto.closesAt, isClosed: dto.isClosed } }) };
  }

  @Get('staff')
  async staff(@Req() req: { user: { id: string } }) {
    const shop = await this.shopForOwner(req.user.id);
    return { data: await this.prisma.shopStaff.findMany({ where: { shopId: shop.id }, include: { User: { select: { id: true, name: true, email: true } } } }) };
  }

  @Post('staff')
  async addStaff(@Req() req: { user: { id: string } }, @Body() dto: StaffDto) {
    const shop = await this.shopForOwner(req.user.id);
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { UserRole: true },
    });
    if (!user || !user.UserRole.some(({ role }) => role === 'SHOP_OWNER')) {
      throw new BadRequestException('Staff members must register through the shop-owner flow first');
    }
    return { data: await this.prisma.shopStaff.create({ data: { shopId: shop.id, userId: user.id } }) };
  }

  @Delete('staff/:userId')
  async removeStaff(@Req() req: { user: { id: string } }, @Param('userId') userId: string) {
    const shop = await this.shopForOwner(req.user.id);
    await this.prisma.shopStaff.delete({ where: { shopId_userId: { shopId: shop.id, userId } } });
    return { data: { deleted: true } };
  }

  @Get('orders')
  async orders(@Req() req: { user: { id: string } }) {
    const shop = await this.shopForOwner(req.user.id);
    return {
      data: await this.prisma.order.findMany({
        where: { shopId: shop.id },
        select: {
          id: true,
          reference: true,
          status: true,
          currency: true,
          total: true,
          createdAt: true,
          updatedAt: true,
          deliveryAddress: true,
          instructions: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              CustomerProfile: { select: { phone: true } },
            },
          },
          OrderItem: {
            include: {
              Document: {
                select: { id: true, name: true, mimeType: true, sizeBytes: true, pageCount: true },
              },
            },
          },
          OrderStatusHistory: { orderBy: { createdAt: 'desc' } },
          DeliveryAssignment: { select: { id: true, riderId: true, earnings: true, updatedAt: true } },
          Payment: { select: { status: true, method: true, amount: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    };
  }
  @Get('orders/:orderId/documents/:documentId/preview-url')
  async orderDocumentPreviewUrl(
    @Req() req: { user: { id: string } },
    @Param('orderId') orderId: string,
    @Param('documentId') documentId: string,
  ) {
    const shop = await this.shopForOwner(req.user.id);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, shopId: shop.id },
      include: { OrderItem: { where: { documentId }, include: { Document: true } } },
    });
    const document = order?.OrderItem[0]?.Document;
    if (!document) throw new BadRequestException('Document was not found for this shop order');
    return { data: { previewUrl: await this.storage.createPreviewUrl(document.objectKey, document.name) } };
  }
  @Post('orders/:id/transition')
  async transition(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: { status: 'ACCEPTED' | 'REJECTED' | 'PRINTING' | 'READY_FOR_PICKUP' | 'CANCELLED'; reason?: string }) {
    const shop = await this.shopForOwner(req.user.id);
    const order = await this.prisma.order.findFirst({ where: { id, shopId: shop.id } });
    if (!order) throw new BadRequestException('Order was not found for this shop');
    const allowed = new Set(['ACCEPTED', 'REJECTED', 'PRINTING', 'READY_FOR_PICKUP', 'CANCELLED']);
    if (!allowed.has(body.status)) throw new BadRequestException('Invalid shop status transition');
    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id }, data: { status: body.status } }),
      this.prisma.orderStatusHistory.create({ data: { id: randomUUID(), orderId: id, status: body.status, actorId: req.user.id, reason: body.reason } }),
    ]);
    return { data: await this.prisma.order.findUnique({ where: { id }, include: { OrderStatusHistory: { orderBy: { createdAt: 'desc' } } } }) };
  }

  @Get('earnings')
  async earnings(@Req() req: { user: { id: string } }) {
    const shop = await this.shopForOwner(req.user.id);
    const settlements = await this.prisma.settlement.findMany({ where: { shopId: shop.id }, orderBy: { createdAt: 'desc' } });
    const earned = settlements.reduce((sum, item) => sum + Number(item.amount), 0);
    return { data: { earned, pending: settlements.filter((item) => item.status === 'PENDING').reduce((sum, item) => sum + Number(item.amount), 0), settlements } };
  }
}
