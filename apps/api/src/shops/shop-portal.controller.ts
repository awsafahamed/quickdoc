import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Prisma, type Order, type Shop } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { distanceInKm } from '../common/geo';
import { issueHandoverCodes } from '../orders/handover-codes';
import { notifyCustomerOfStatus, serializeOrder, voidPendingPayment } from '../orders/order-lifecycle';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateObjectStorageService } from '../storage/private-object-storage.service';

class ShopProfileDto {
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Length(5, 500) address!: string;
  @IsString() @Length(7, 20) phone!: string;
  @IsNumber({ maxDecimalPlaces: 7 }) @Min(-90) @Max(90) latitude!: number;
  @IsNumber({ maxDecimalPlaces: 7 }) @Min(-180) @Max(180) longitude!: number;
}

class AvailabilityDto {
  @IsBoolean() isOpen!: boolean;
}

class OpeningHourDto {
  @IsInt() @Min(0) @Max(6) dayOfWeek!: number;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) opensAt!: string;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) closesAt!: string;
  @IsOptional() @IsBoolean() isClosed?: boolean;
}

class ShopServiceDto {
  @IsString() @Length(1, 60) code!: string;
  @IsBoolean() enabled!: boolean;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1000000) price!: number;
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

class CustomShopServiceDto {
  @IsString() @Length(3, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1000000) price!: number;
}

class ShopPriceDto {
  @IsIn(['A4', 'A3', 'A5']) paperSize!: string;
  @IsBoolean() colour!: boolean;
  @IsBoolean() duplex!: boolean;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100000) pricePerSide!: number;
}

class ShopPricingDto {
  @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => ShopPriceDto)
  prices!: ShopPriceDto[];
}

const platformShopServices: Record<string, string> = {
  PAPER_A4: 'A4 paper',
  PAPER_A3: 'A3 paper',
  PAPER_A5: 'A5 paper',
  BLACK_WHITE: 'Black & white',
  COLOUR: 'Colour printing',
  DUPLEX: 'Double-sided',
  BINDING: 'Binding',
  STAPLING: 'Stapling',
  LAMINATION: 'Lamination',
};

class StaffDto {
  @IsEmail() email!: string;
}

class OrderTransitionDto {
  @IsIn(['ACCEPTED', 'REJECTED', 'PRINTING', 'READY_FOR_PICKUP'])
  status!: 'ACCEPTED' | 'REJECTED' | 'PRINTING' | 'READY_FOR_PICKUP';

  @IsOptional() @IsString() @Length(1, 500)
  reason?: string;
}

const RIDER_DISPATCH_RADIUS_KM = 8;
const RIDER_LOCATION_MAX_AGE_MS = 5 * 60 * 1000;


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

  /** Order handling is only available to shops the platform has approved. */
  private async operatingShopFor(userId: string) {
    const shop = await this.shopForOwner(userId);
    if (shop.status !== 'APPROVED') {
      throw new ForbiddenException('This shop must be approved by QuickDoc before it can handle orders');
    }
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
  async availability(@Req() req: { user: { id: string } }, @Body() body: AvailabilityDto) {
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
    const existing = await this.prisma.shopService.findUnique({
      where: { shopId_code: { shopId: shop.id, code: dto.code } },
    });
    if (existing?.isCustom) {
      return {
        data: await this.prisma.shopService.update({
          where: { id: existing.id },
          data: {
            name: dto.name?.trim() ?? existing.name,
            description: dto.description?.trim() ?? existing.description,
            enabled: dto.enabled,
            price: dto.price,
            reviewStatus: 'PENDING',
          },
        }),
      };
    }
    const name = platformShopServices[dto.code];
    if (!name) {
      throw new BadRequestException('Add new services using the custom service form');
    }
    return {
      data: await this.prisma.shopService.upsert({
        where: { shopId_code: { shopId: shop.id, code: dto.code } },
        create: {
          shopId: shop.id,
          code: dto.code,
          name,
          enabled: dto.enabled,
          price: dto.price,
          reviewStatus: 'APPROVED',
        },
        update: { enabled: dto.enabled, price: dto.price },
      }),
    };
  }

  @Post('services/custom')
  async createCustomService(
    @Req() req: { user: { id: string } },
    @Body() dto: CustomShopServiceDto,
  ) {
    const shop = await this.shopForOwner(req.user.id);
    const code = dto.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    if (code.length < 2) {
      throw new BadRequestException('Service name must include at least two letters or numbers');
    }
    const existing = await this.prisma.shopService.findUnique({
      where: { shopId_code: { shopId: shop.id, code } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('A service with this name already exists');
    return {
      data: await this.prisma.shopService.create({
        data: {
          shopId: shop.id,
          code,
          name: dto.name.trim(),
          description: dto.description?.trim() ?? '',
          price: dto.price,
          enabled: true,
          isCustom: true,
          reviewStatus: 'PENDING',
        },
      }),
    };
  }

  @Delete('services/:code')
  async deleteService(@Req() req: { user: { id: string } }, @Param('code') code: string) {
    const shop = await this.shopForOwner(req.user.id);
    await this.prisma.shopService.delete({ where: { shopId_code: { shopId: shop.id, code } } });
    return { data: { deleted: true } };
  }

  @Get('pricing')
  async pricing(@Req() req: { user: { id: string } }) {
    const shop = await this.shopForOwner(req.user.id);
    return {
      data: await this.prisma.shopPrice.findMany({
        where: { shopId: shop.id },
        orderBy: [{ paperSize: 'asc' }, { colour: 'asc' }, { duplex: 'asc' }],
      }),
    };
  }

  @Post('pricing')
  async savePricing(
    @Req() req: { user: { id: string } },
    @Body() dto: ShopPricingDto,
  ) {
    const shop = await this.shopForOwner(req.user.id);
    const keys = dto.prices.map((price) => `${price.paperSize}:${price.colour}:${price.duplex}`);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('Each paper, colour and side combination can only be saved once');
    }

    return {
      data: await this.prisma.$transaction(
        dto.prices.map((price) => this.prisma.shopPrice.upsert({
          where: {
            shopId_paperSize_colour_duplex: {
              shopId: shop.id,
              paperSize: price.paperSize,
              colour: price.colour,
              duplex: price.duplex,
            },
          },
          create: {
            id: randomUUID(),
            shopId: shop.id,
            ...price,
            updatedAt: new Date(),
          },
          update: { pricePerSide: price.pricePerSide, updatedAt: new Date() },
        })),
      ),
    };
  }

  @Get('hours')
  async hours(@Req() req: { user: { id: string } }) {
    const shop = await this.shopForOwner(req.user.id);
    return { data: await this.prisma.shopOpeningHour.findMany({ where: { shopId: shop.id }, orderBy: { dayOfWeek: 'asc' } }) };
  }

  @Post('hours')
  async saveHours(@Req() req: { user: { id: string } }, @Body() dto: OpeningHourDto) {
    const shop = await this.shopForOwner(req.user.id);
    if (!dto.isClosed && dto.opensAt >= dto.closesAt) throw new BadRequestException('Opening time must be before closing time');
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
    const orders = await this.prisma.order.findMany({
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
          pickupCodeEncrypted: true,
          pinAttempts: true,
          printSubtotal: true,
          commission: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    return { data: orders.map((order) => serializeOrder(order, 'shop')) };
  }

  @Post('orders/:id/pickup-code')
  async reissuePickupCode(@Req() req: { user: { id: string } }, @Param('id', new ParseUUIDPipe()) id: string) {
    const shop = await this.operatingShopFor(req.user.id);
    const reissuable = ['PRINTING', 'READY_FOR_PICKUP', 'RIDER_ASSIGNED'] as const;
    const { pickupCode, fields } = issueHandoverCodes();
    const updated = await this.prisma.order.updateMany({
      where: { id, shopId: shop.id, status: { in: [...reissuable] } },
      data: { pickupCodeHash: fields.pickupCodeHash, pickupCodeEncrypted: fields.pickupCodeEncrypted, pinAttempts: 0 },
    });
    if (updated.count !== 1) {
      throw new ConflictException('A pickup code can only be issued while the order is waiting for rider collection');
    }
    return { data: { pickupCode } };
  }
  @Get('orders/:orderId/documents/:documentId/preview-url')
  async orderDocumentPreviewUrl(
    @Req() req: { user: { id: string } },
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    const shop = await this.operatingShopFor(req.user.id);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, shopId: shop.id },
      include: { OrderItem: { where: { documentId }, include: { Document: true } } },
    });
    const document = order?.OrderItem[0]?.Document;
    if (!document) throw new BadRequestException('Document was not found for this shop order');
    return { data: { previewUrl: await this.storage.createPreviewUrl(document.objectKey, document.name) } };
  }
  @Post('orders/:id/transition')
  async transition(@Req() req: { user: { id: string } }, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: OrderTransitionDto) {
    const shop = await this.operatingShopFor(req.user.id);
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
      if (body.status === 'REJECTED') await voidPendingPayment(transaction, id);
      await notifyCustomerOfStatus(transaction, order, body.status, body.reason);
      if (body.status === 'READY_FOR_PICKUP') {
        return this.notifyNearbyRiders(transaction, order, shop);
      }
      return 0;
    });
    const updatedOrder = await this.prisma.order.findUniqueOrThrow({ where: { id }, include: { OrderStatusHistory: { orderBy: { createdAt: 'desc' } } } });
    return {
      data: serializeOrder(updatedOrder, 'shop'),
      notifiedRiders,
    };
  }

  @Post('orders/:id/dispatch')
  async redispatch(@Req() req: { user: { id: string } }, @Param('id', new ParseUUIDPipe()) id: string) {
    const shop = await this.operatingShopFor(req.user.id);
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
    const settlements = await this.prisma.settlement.findMany({ where: { shopId: shop.id, kind: 'PAYOUT' }, orderBy: { createdAt: 'desc' }, take: 200 });
    const earned = settlements.reduce((sum, item) => sum + Number(item.amount), 0);
    return { data: { earned, pending: settlements.filter((item) => item.status === 'PENDING').reduce((sum, item) => sum + Number(item.amount), 0), settlements } };
  }
}
