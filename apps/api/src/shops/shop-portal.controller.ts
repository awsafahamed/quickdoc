import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { Prisma, type Order, type Shop } from '@prisma/client';
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
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) opensAt!: string;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) closesAt!: string;
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

class OrderTransitionDto {
  @IsIn(['ACCEPTED', 'REJECTED', 'PRINTING', 'READY_FOR_PICKUP', 'CANCELLED'])
  status!: 'ACCEPTED' | 'REJECTED' | 'PRINTING' | 'READY_FOR_PICKUP' | 'CANCELLED';

  @IsOptional() @IsString() @Length(1, 500)
  reason?: string;
}

const RIDER_DISPATCH_RADIUS_KM = 8;
const RIDER_LOCATION_MAX_AGE_MS = 5 * 60 * 1000;

function distanceInKm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

@Controller('shop/me')
@UseGuards(AuthGuard('jwt'))
export class ShopPortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PrivateObjectStorageService,
  ) {}

  private async shopForOwner(userId: string) {
    const shop = await this.prisma.shop.findFirst({
      where: { OR: [{ ownerId: userId }, { staff: { some: { userId } } }] },
    });
    if (!shop) throw new BadRequestException('No print shop is linked to this account');
    return shop;
  }

  private async shopOwnedBy(userId: string) {
    const shop = await this.prisma.shop.findFirst({ where: { ownerId: userId } });
    if (!shop) throw new BadRequestException('No print shop is linked to this account');
    return shop;
  }

  private async notifyNearbyRiders(
    transaction: Prisma.TransactionClient,
    order: Pick<Order, 'id' | 'reference' | 'deliveryFee'>,
    shop: Pick<Shop, 'latitude' | 'longitude'>,
  ) {
    const riders = await transaction.riderProfile.findMany({
      where: {
        status: 'APPROVED',
        RiderAvailability: {
          is: {
            online: true,
            latitude: { not: null },
            longitude: { not: null },
            updatedAt: { gte: new Date(Date.now() - RIDER_LOCATION_MAX_AGE_MS) },
          },
        },
        DeliveryAssignment: {
          none: { Order: { status: { in: ['RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] } } },
        },
      },
      select: {
        userId: true,
        RiderAvailability: { select: { latitude: true, longitude: true } },
      },
    });
    const shopLatitude = Number(shop.latitude);
    const shopLongitude = Number(shop.longitude);
    const nearby = riders.flatMap((rider) => {
      const location = rider.RiderAvailability;
      if (location?.latitude == null || location.longitude == null) return [];
      const distance = distanceInKm(
        shopLatitude,
        shopLongitude,
        Number(location.latitude),
        Number(location.longitude),
      );
      return distance <= RIDER_DISPATCH_RADIUS_KM ? [{ riderId: rider.userId, distance }] : [];
    }).sort((left, right) => left.distance - right.distance);

    if (!nearby.length) return 0;
    const now = new Date();
    await transaction.deliveryOffer.createMany({
      data: nearby.map(({ riderId, distance }) => ({
        id: randomUUID(),
        orderId: order.id,
        riderId,
        distanceKm: Number(distance.toFixed(2)),
        earnings: order.deliveryFee,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      })),
    });
    await transaction.notification.createMany({
      data: nearby.map(({ riderId }) => ({
        id: randomUUID(),
        userId: riderId,
        title: 'Nearby delivery available',
        body: `Order ${order.reference} is ready for delivery. Open delivery requests to review it.`,
        createdAt: now,
      })),
    });
    return nearby.length;
  }

  @Get()
  async profile(@Req() req: { user: { id: string } }) {
    const shop = await this.shopForOwner(req.user.id);
    return {
      data: await this.prisma.shop.findUnique({
        where: { id: shop.id },
        include: { services: true, openingHours: true, staff: true },
      }),
    };
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
    return {
      data: await this.prisma.shopOpeningHour.upsert({
        where: { shopId_dayOfWeek: { shopId: shop.id, dayOfWeek: dto.dayOfWeek } },
        create: { shopId: shop.id, dayOfWeek: dto.dayOfWeek, opensAt: dto.opensAt, closesAt: dto.closesAt, isClosed: dto.isClosed },
        update: { opensAt: dto.opensAt, closesAt: dto.closesAt, isClosed: dto.isClosed },
      }),
    };
  }

  @Get('staff')
  async staff(@Req() req: { user: { id: string } }) {
    const shop = await this.shopOwnedBy(req.user.id);
    return { data: await this.prisma.shopStaff.findMany({ where: { shopId: shop.id }, include: { User: { select: { id: true, name: true, email: true } } } }) };
  }

  @Post('staff')
  async addStaff(@Req() req: { user: { id: string } }, @Body() dto: StaffDto) {
    const shop = await this.shopOwnedBy(req.user.id);
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { UserRole: true },
    });
    if (!user || !user.UserRole.some(({ role }) => role === 'SHOP_OWNER')) {
      throw new BadRequestException('Staff members must register through the shop-owner flow first');
    }
    return {
      data: await this.prisma.shopStaff.upsert({
        where: { shopId_userId: { shopId: shop.id, userId: user.id } },
        create: { shopId: shop.id, userId: user.id },
        update: {},
      }),
    };
  }

  @Delete('staff/:userId')
  async removeStaff(@Req() req: { user: { id: string } }, @Param('userId') userId: string) {
    const shop = await this.shopOwnedBy(req.user.id);
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
          DeliveryOffer: { where: { status: 'PENDING' }, select: { id: true } },
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
  async transition(@Req() req: { user: { id: string } }, @Param('id') id: string, @Body() body: OrderTransitionDto) {
    const shop = await this.shopForOwner(req.user.id);
    const order = await this.prisma.order.findFirst({ where: { id, shopId: shop.id } });
    if (!order) throw new BadRequestException('Order was not found for this shop');
    if (body.status === 'REJECTED' && !body.reason?.trim()) {
      throw new BadRequestException('A reason is required when declining an order');
    }
    const transitions: Record<string, string[]> = {
      PENDING_ACCEPTANCE: ['ACCEPTED', 'REJECTED'],
      ACCEPTED: ['PRINTING'],
      PRINTING: ['READY_FOR_PICKUP'],
    };
    if (!transitions[order.status]?.includes(body.status)) {
      throw new BadRequestException(`An order in ${order.status} cannot transition to ${body.status}`);
    }
    const notifiedRiders = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.order.updateMany({
        where: { id, shopId: shop.id, status: order.status },
        data: { status: body.status },
      });
      if (!updated.count) throw new BadRequestException('The order changed before this update; reload and try again');
      await transaction.orderStatusHistory.create({
        data: { id: randomUUID(), orderId: id, status: body.status, actorId: req.user.id, reason: body.reason?.trim() },
      });
      if (body.status === 'READY_FOR_PICKUP') {
        return this.notifyNearbyRiders(transaction, order, shop);
      }
      return 0;
    });
    return {
      data: await this.prisma.order.findUnique({ where: { id }, include: { OrderStatusHistory: { orderBy: { createdAt: 'desc' } } } }),
      notifiedRiders,
    };
  }

  @Post('orders/:id/dispatch')
  async redispatch(@Req() req: { user: { id: string } }, @Param('id') id: string) {
    const shop = await this.shopForOwner(req.user.id);
    const order = await this.prisma.order.findFirst({
      where: { id, shopId: shop.id, status: 'READY_FOR_PICKUP' },
      select: { id: true, reference: true, deliveryFee: true },
    });
    if (!order) throw new BadRequestException('Only a ready order without an assigned rider can be dispatched');
    const pendingOffers = await this.prisma.deliveryOffer.count({
      where: { orderId: order.id, status: 'PENDING' },
    });
    if (pendingOffers) throw new ConflictException('Riders have already been notified for this order');
    const notifiedRiders = await this.prisma.$transaction((transaction) =>
      this.notifyNearbyRiders(transaction, order, shop),
    );
    return { data: { notifiedRiders } };
  }

  @Get('earnings')
  async earnings(@Req() req: { user: { id: string } }) {
    const shop = await this.shopForOwner(req.user.id);
    const settlements = await this.prisma.settlement.findMany({ where: { shopId: shop.id }, orderBy: { createdAt: 'desc' } });
    const earned = settlements.reduce((sum, item) => sum + Number(item.amount), 0);
    return { data: { earned, pending: settlements.filter((item) => item.status === 'PENDING').reduce((sum, item) => sum + Number(item.amount), 0), settlements } };
  }
}
