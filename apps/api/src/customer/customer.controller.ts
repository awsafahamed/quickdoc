import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsEmail, IsEnum, IsOptional, IsString, Length, IsNumber, Min, IsUUID, IsBoolean, Max, IsInt, Matches, MaxLength } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { deliveryDistanceKm, maxDeliveryDistanceKm } from '../common/geo';
import { issueHandoverCodes } from '../orders/handover-codes';
import {
  initialPayment,
  notifyUsers,
  orderReference,
  serializeOrder,
  SHOP_COMMISSION_RATE,
  completeDeliveredOrder,
  voidPendingPayment,
} from '../orders/order-lifecycle';
import { PrismaService } from '../prisma/prisma.service';
import { PrintPricingService } from '../print/print-pricing.service';
import { DeliverySpeed, PrintColour, PrintPaperSize, PrintSides } from '../print/print.types';
import { PrivateObjectStorageService } from '../storage/private-object-storage.service';

class ProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsEmail()
  @Length(3, 254)
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,20}$/)
  phone?: string;
}

class AddressDto {
  @IsString()
  @Length(2, 80)
  label!: string;

  @IsString()
  @Length(5, 500)
  line!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude?: number;
}

class DocumentDto {
  @IsString()
  @Length(1, 255)
  name!: string;

  @IsString()
  mimeType!: string;

  @IsNumber()
  @Min(1)
  sizeBytes!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsNumber()
  @Max(10000)
  pageCount?: number;

  @IsString()
  @Length(1, 512)
  objectKey?: string;
}

class DocumentUploadUrlDto {
  @IsString()
  @Length(1, 255)
  name!: string;

  @IsString()
  mimeType!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(25 * 1024 * 1024)
  sizeBytes!: number;
}

class PrintOrderDto {
  @IsUUID()
  shopId!: string;

  @IsUUID()
  documentId!: string;

  @IsEnum(PrintPaperSize)
  paperSize!: PrintPaperSize;

  @IsBoolean()
  colour!: boolean;

  @IsBoolean()
  duplex!: boolean;

  @IsInt()
  @Min(1)
  @Max(100)
  copies!: number;

  /** Ignored: pages are counted from the stored PDF. Kept for older clients. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  printedSides?: number;

  @IsOptional()
  @IsBoolean()
  binding?: boolean;

  @IsOptional()
  @IsBoolean()
  stapling?: boolean;

  @IsOptional()
  @IsBoolean()
  lamination?: boolean;

  @IsOptional()
  @IsEnum(DeliverySpeed)
  deliverySpeed?: DeliverySpeed;

  /** Ignored: delivery distance is calculated from the shop and delivery coordinates. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  deliveryDistanceKm?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  deliveryLatitude!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  deliveryLongitude!: number;

  @IsString()
  @Length(5, 500)
  deliveryAddress!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  instructions?: string;

  @IsUUID()
  clientKey!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsString({ each: true })
  shopServiceCodes?: string[];
}

class CancelOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class ReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  shopRating!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  riderRating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

const CUSTOMER_CANCELLABLE = ['PENDING_ACCEPTANCE', 'ACCEPTED'] as const;
const PIN_REISSUABLE = ['PENDING_ACCEPTANCE', 'ACCEPTED', 'PRINTING', 'READY_FOR_PICKUP', 'RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] as const;

const customerOrderInclude = {
  Shop: { select: { id: true, name: true, address: true, phone: true } },
  OrderItem: { include: { Document: { select: { id: true, name: true, pageCount: true, sizeBytes: true } } } },
  OrderStatusHistory: { orderBy: { createdAt: 'desc' as const } },
  DeliveryAssignment: {
    select: {
      id: true,
      assignedAt: true,
      RiderProfile: { select: { vehicleType: true, User: { select: { name: true } } } },
      DeliveryStatusHistory: { orderBy: { createdAt: 'desc' as const } },
    },
  },
  Payment: { select: { method: true, status: true, amount: true } },
  Review: { select: { shopRating: true, riderRating: true, comment: true, createdAt: true } },
} satisfies Prisma.OrderInclude;

@Controller('customer')
@UseGuards(AuthGuard('jwt'))
export class CustomerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly printPricing: PrintPricingService,
    private readonly storage: PrivateObjectStorageService,
  ) {}

  @Get('me')
  async me(@Req() request: { user: { id: string } }) {
    return {
      data: await this.prisma.user.findUnique({
        where: { id: request.user.id },
        select: {
          id: true, email: true, name: true, emailVerified: true, createdAt: true, updatedAt: true,
          CustomerProfile: true, UserRole: true,
        },
      }),
    };
  }

  @Patch('me')
  async updateMe(@Req() request: { user: { id: string } }, @Body() dto: ProfileDto) {
    const email = dto.email?.trim().toLowerCase();
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: request.user.id }, select: { email: true } });
    const emailChanged = Boolean(email && email !== current.email);
    if (emailChanged) {
      const taken = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (taken) throw new ConflictException('Another account already uses this email');
    }
    const user = await this.prisma.user.update({
      where: { id: request.user.id },
      // A new address has not been proven to belong to this person, so it must not be
      // treated as verified (Google sign-in relies on this flag before linking accounts).
      data: { name: dto.name?.trim(), ...(emailChanged ? { email, emailVerified: false } : {}) },
      select: { id: true, email: true, name: true, emailVerified: true, createdAt: true, updatedAt: true },
    });
    if (dto.phone) {
      await this.prisma.customerProfile.upsert({ where: { userId: request.user.id }, create: { userId: request.user.id, phone: dto.phone }, update: { phone: dto.phone } });
    }
    return { data: user };
  }

  @Get('addresses')
  async addresses(@Req() request: { user: { id: string } }) {
    return { data: await this.prisma.address.findMany({ where: { userId: request.user.id }, orderBy: { createdAt: 'desc' } }) };
  }

  @Post('addresses')
  async createAddress(@Req() request: { user: { id: string } }, @Body() dto: AddressDto) {
    return { data: await this.prisma.address.create({ data: { id: randomUUID(), userId: request.user.id, label: dto.label, line: dto.line, latitude: dto.latitude, longitude: dto.longitude, updatedAt: new Date() } }) };
  }

  @Patch('addresses/:id')
  async updateAddress(@Param('id') id: string, @Req() request: { user: { id: string } }, @Body() dto: AddressDto) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId: request.user.id } });
    if (!existing) throw new BadRequestException('Address was not found');
    return { data: await this.prisma.address.update({ where: { id }, data: { label: dto.label, line: dto.line, latitude: dto.latitude, longitude: dto.longitude, updatedAt: new Date() } }) };
  }

  @Delete('addresses/:id')
  async deleteAddress(@Param('id') id: string, @Req() request: { user: { id: string } }) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId: request.user.id } });
    if (!existing) throw new BadRequestException('Address was not found');
    await this.prisma.address.delete({ where: { id } });
    return { data: { deleted: true } };
  }

  @Get('documents')
  async documents(@Req() request: { user: { id: string } }) {
    return { data: await this.prisma.document.findMany({ where: { userId: request.user.id }, orderBy: { createdAt: 'desc' } }) };
  }

  @Post('documents/upload-url')
  async createDocumentUploadUrl(
    @Req() request: { user: { id: string } },
    @Body() dto: DocumentUploadUrlDto,
  ) {
    if (dto.mimeType !== 'application/pdf' || !dto.name.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException('Only PDF documents are supported');
    }
    const objectKey = `private/customers/${request.user.id}/${randomUUID()}.pdf`;
    return { data: { objectKey, uploadUrl: await this.storage.createUploadUrl(objectKey), expiresIn: 300 } };
  }

  @Post('documents')
  async createDocument(@Req() request: { user: { id: string } }, @Body() dto: DocumentDto) {
    if (dto.mimeType !== 'application/pdf') throw new BadRequestException('Only PDF documents are supported');
    if (dto.sizeBytes > 25 * 1024 * 1024) throw new BadRequestException('Document exceeds the 25 MB limit');
    if (!dto.objectKey?.startsWith(`private/customers/${request.user.id}/`)) {
      throw new BadRequestException('Document upload key is invalid');
    }
    const pageCount = await this.storage.verifyPdfUpload(dto.objectKey, dto.sizeBytes);
    const objectKey = dto.objectKey;
    return { data: await this.prisma.document.create({ data: { id: randomUUID(), userId: request.user.id, objectKey, name: dto.name.trim(), mimeType: dto.mimeType, sizeBytes: dto.sizeBytes, pageCount, scanStatus: 'VERIFIED', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), updatedAt: new Date() } }) };
  }

  @Get('documents/:id')
  async document(@Param('id') id: string, @Req() request: { user: { id: string } }) {
    const document = await this.prisma.document.findFirst({ where: { id, userId: request.user.id } });
    if (!document) throw new BadRequestException('Document was not found');
    return { data: document };
  }

  @Get('documents/:id/preview-url')
  async documentPreviewUrl(@Param('id') id: string, @Req() request: { user: { id: string } }) {
    const document = await this.prisma.document.findFirst({ where: { id, userId: request.user.id } });
    if (!document) throw new BadRequestException('Document was not found');
    return { data: { previewUrl: await this.storage.createPreviewUrl(document.objectKey, document.name) } };
  }

  @Delete('documents/:id')
  async deleteDocument(@Param('id') id: string, @Req() request: { user: { id: string } }) {
    const document = await this.prisma.document.findFirst({ where: { id, userId: request.user.id } });
    if (!document) throw new BadRequestException('Document was not found');
    if (await this.prisma.orderItem.count({ where: { documentId: id } })) throw new BadRequestException('Document cannot be deleted while attached to an order');
    await this.storage.deleteObject(document.objectKey);
    await this.prisma.document.delete({ where: { id } });
    return { data: { deleted: true } };
  }

  @Post('catalog/:documentId/select')
  async selectCatalogDocument(
    @Param('documentId') documentId: string,
    @Req() request: { user: { id: string } },
  ) {
    const catalogDocument = await this.prisma.shopCatalogDocument.findFirst({
      where: {
        id: documentId,
        isPublished: true,
        shop: { status: 'APPROVED', isOpen: true },
      },
    });
    if (!catalogDocument) throw new NotFoundException('This catalogue document is no longer available');

    const objectKey = `private/customers/${request.user.id}/${randomUUID()}.pdf`;
    await this.storage.copyCatalogPdfToCustomer(catalogDocument.objectKey, objectKey);
    try {
      const document = await this.prisma.document.create({
        data: {
          id: randomUUID(),
          userId: request.user.id,
          objectKey,
          name: catalogDocument.name,
          mimeType: 'application/pdf',
          sizeBytes: catalogDocument.sizeBytes,
          pageCount: catalogDocument.pageCount,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        },
      });
      return { data: document };
    } catch (error) {
      await this.storage.deleteObject(objectKey);
      throw error;
    }
  }

  @Get('orders')
  async orders(@Req() request: { user: { id: string } }) {
    const orders = await this.prisma.order.findMany({
      where: { customerId: request.user.id },
      include: customerOrderInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { data: orders.map((order) => serializeOrder(order, 'customer')) };
  }

  @Get('orders/:id')
  async order(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: { user: { id: string } }) {
    const order = await this.prisma.order.findFirst({ where: { id, customerId: request.user.id }, include: customerOrderInclude });
    if (!order) throw new NotFoundException('Order was not found');
    return { data: serializeOrder(order, 'customer') };
  }

  @Post('orders/:id/cancel')
  async cancelOrder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelOrderDto,
    @Req() request: { user: { id: string } },
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id, customerId: request.user.id },
      include: { Shop: { select: { ownerId: true } } },
    });
    if (!order) throw new NotFoundException('Order was not found');
    if (!CUSTOMER_CANCELLABLE.some((status) => status === order.status)) {
      throw new ConflictException('This order can no longer be cancelled because printing has started. Contact support for help.');
    }
    const reason = dto.reason?.trim() || 'Cancelled by customer';
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.order.updateMany({
        where: { id, customerId: request.user.id, status: { in: [...CUSTOMER_CANCELLABLE] } },
        data: { status: 'CANCELLED' },
      });
      if (updated.count !== 1) throw new ConflictException('This order changed; refresh and try again');
      await transaction.orderStatusHistory.create({
        data: { id: randomUUID(), orderId: id, status: 'CANCELLED', actorId: request.user.id, reason },
      });
      await voidPendingPayment(transaction, id);
      await notifyUsers(transaction, [order.Shop.ownerId], 'Order cancelled', `The customer cancelled order ${order.reference}.`);
    });
    return { data: { id, reference: order.reference, status: 'CANCELLED' } };
  }

  @Post('orders/:id/delivery-pin')
  async reissueDeliveryPin(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: { user: { id: string } }) {
    const order = await this.prisma.order.findFirst({ where: { id, customerId: request.user.id } });
    if (!order) throw new NotFoundException('Order was not found');
    if (!PIN_REISSUABLE.some((status) => status === order.status)) {
      throw new ConflictException('A delivery PIN is only needed while delivery is outstanding');
    }
    const { deliveryPin, fields } = issueHandoverCodes();
    const updated = await this.prisma.order.updateMany({
      where: { id, customerId: request.user.id, status: { in: [...PIN_REISSUABLE] } },
      // Only replace the delivery PIN, and give the new PIN a fresh attempt budget.
      data: { deliveryPinHash: fields.deliveryPinHash, deliveryPinEncrypted: fields.deliveryPinEncrypted, pinAttempts: 0 },
    });
    if (updated.count !== 1) throw new ConflictException('This order changed; refresh and try again');
    return { data: { deliveryPin } };
  }

  @Post('orders/:id/review')
  async reviewOrder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewDto,
    @Req() request: { user: { id: string } },
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id, customerId: request.user.id },
      include: { Review: { select: { id: true } }, DeliveryAssignment: { select: { id: true } } },
    });
    if (!order) throw new NotFoundException('Order was not found');
    if (order.status !== 'COMPLETED') throw new ConflictException('You can review an order after it is completed');
    if (order.Review) throw new ConflictException('You have already reviewed this order');
    const review = await this.prisma.review.create({
      data: {
        id: randomUUID(),
        orderId: id,
        userId: request.user.id,
        shopId: order.shopId,
        shopRating: dto.shopRating,
        riderRating: order.DeliveryAssignment ? dto.riderRating : null,
        comment: dto.comment?.trim() || null,
      },
      select: { shopRating: true, riderRating: true, comment: true, createdAt: true },
    });
    return { data: review };
  }

  @Post('orders/:id/confirm-delivery')
  async confirmDelivery(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: { user: { id: string } }) {
    const order = await this.prisma.order.findFirst({
      where: { id, customerId: request.user.id },
      include: { Shop: true, DeliveryAssignment: true },
    });
    if (!order) throw new NotFoundException('Order was not found');
    if (order.status !== 'DELIVERED') {
      throw new ConflictException('Only a delivered order can be confirmed');
    }

    await this.prisma.$transaction(async (transaction) => {
      const completed = await completeDeliveredOrder(transaction, id, request.user.id, 'Customer confirmed delivery');
      if (!completed) throw new ConflictException('This order changed; refresh and try again');
      await notifyUsers(
        transaction,
        [order.Shop.ownerId, order.DeliveryAssignment?.riderId],
        'Delivery confirmed',
        `The customer confirmed delivery for order ${order.reference}.`,
      );
    });
    return { data: { id: order.id, reference: order.reference, status: 'COMPLETED' } };
  }

  @Get('notifications')
  async notifications(@Req() request: { user: { id: string } }) {
    return {
      data: await this.prisma.notification.findMany({
        where: { userId: request.user.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    };
  }

  @Patch('notifications/read-all')
  async markAllNotificationsRead(@Req() request: { user: { id: string } }) {
    const result = await this.prisma.notification.updateMany({
      where: { userId: request.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { data: { updated: result.count } };
  }

  @Patch('notifications/:id/read')
  async markNotificationRead(
    @Param('id') id: string,
    @Req() request: { user: { id: string } },
  ) {
    const updated = await this.prisma.notification.updateMany({
      where: { id, userId: request.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (!updated.count) {
      const notification = await this.prisma.notification.findFirst({
        where: { id, userId: request.user.id },
        select: { id: true },
      });
      if (!notification) throw new NotFoundException('Notification was not found');
    }
    return { data: { read: true } };
  }

  @Post('orders/print')
  async createPrintOrder(@Req() request: { user: { id: string } }, @Body() dto: PrintOrderDto) {
    const existing = await this.findIdempotentOrder(request.user.id, dto.clientKey);
    if (existing) return { data: existing, idempotent: true };
    const [shop, document] = await Promise.all([
      this.prisma.shop.findFirst({ where: { id: dto.shopId, status: 'APPROVED', isOpen: true } }),
      this.prisma.document.findFirst({ where: { id: dto.documentId, userId: request.user.id } }),
    ]);
    if (!shop) throw new BadRequestException('This shop is not accepting orders right now');
    if (!document) throw new BadRequestException('Document was not found');
    if (document.expiresAt <= new Date()) throw new BadRequestException('This document has expired. Upload it again to print it.');
    // Pages always come from the stored PDF. Legacy rows without a count cannot be priced safely.
    const pages = document.pageCount;
    if (!pages || pages < 1 || pages > 10000) {
      throw new BadRequestException('This document has no verified page count. Upload it again to print it.');
    }
    const distanceKm = deliveryDistanceKm(shop, { latitude: dto.deliveryLatitude, longitude: dto.deliveryLongitude });
    if (distanceKm > maxDeliveryDistanceKm()) {
      throw new BadRequestException(`This address is ${distanceKm} km from the shop, beyond the ${maxDeliveryDistanceKm()} km delivery area. Choose a closer shop.`);
    }
    const deliverySpeed = dto.deliverySpeed ?? DeliverySpeed.STANDARD;
    const quote = await this.printPricing.calculate({
      pageCount: pages,
      copies: dto.copies,
      paperSize: dto.paperSize,
      colour: dto.colour ? PrintColour.COLOUR : PrintColour.BLACK_WHITE,
      sides: dto.duplex ? PrintSides.DUPLEX : PrintSides.SINGLE,
      binding: dto.binding ?? false,
      stapling: dto.stapling ?? false,
      lamination: dto.lamination ?? false,
      deliverySpeed,
      deliveryDistanceKm: distanceKm,
      shopId: dto.shopId,
      shopServiceCodes: dto.shopServiceCodes ?? [],
    });
    const printSubtotal = Number((quote.printing + quote.finishing + quote.shopServiceTotal).toFixed(2));
    const deliveryFee = Number((quote.delivery + quote.express).toFixed(2));
    const platformFee = Number((quote.total - printSubtotal - deliveryFee).toFixed(2));
    const commission = Number((printSubtotal * SHOP_COMMISSION_RATE).toFixed(2));
    const total = quote.total;
    const { fields: handoverFields } = issueHandoverCodes();
    const orderId = randomUUID();
    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            id: orderId,
            reference: orderReference('PR'),
            customerId: request.user.id,
            shopId: dto.shopId,
            status: 'PENDING_ACCEPTANCE',
            currency: 'LKR',
            printSubtotal,
            deliveryFee,
            platformFee,
            total,
            commission,
            deliverySpeed,
            deliveryDistanceKm: distanceKm,
            deliveryAddress: { line: dto.deliveryAddress.trim(), latitude: dto.deliveryLatitude, longitude: dto.deliveryLongitude },
            instructions: dto.instructions?.trim() || null,
            ...handoverFields,
            clientKey: dto.clientKey,
            shopServiceSnapshot: quote.shopServices.map((service) => ({ code: service.code, name: service.name, price: service.price })),
          },
        });
        const documentPrintTotal = Number((quote.printing + quote.finishing).toFixed(2));
        await tx.orderItem.create({ data: { id: randomUUID(), orderId: created.id, documentId: dto.documentId, paperSize: dto.paperSize, colour: dto.colour, duplex: dto.duplex, copies: dto.copies, pageRange: 'ALL', printedSides: pages, orientation: 'PORTRAIT', binding: dto.binding ? 'BINDING' : null, stapling: dto.stapling ?? false, lamination: dto.lamination ?? false, unitPrice: Number((documentPrintTotal / dto.copies).toFixed(2)), total: documentPrintTotal } });
        await tx.orderStatusHistory.create({ data: { id: randomUUID(), orderId: created.id, status: 'PENDING_ACCEPTANCE', actorId: request.user.id } });
        await tx.payment.create({ data: initialPayment(created.id, total) });
        // Keep the document for as long as the order may need it.
        await tx.document.update({ where: { id: document.id }, data: { expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), updatedAt: new Date() } });
        await notifyUsers(tx, [shop.ownerId], 'New print order', `Order ${created.reference} is waiting for your acceptance.`);
        return created;
      });
      return { data: serializeOrder(order, 'customer') };
    } catch (error) {
      // A concurrent retry with the same client key won the race; return its order.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.findIdempotentOrder(request.user.id, dto.clientKey);
        if (raced) return { data: raced, idempotent: true };
      }
      throw error;
    }
  }

  private async findIdempotentOrder(customerId: string, clientKey: string) {
    const order = await this.prisma.order.findUnique({ where: { customerId_clientKey: { customerId, clientKey } } });
    return order ? serializeOrder(order, 'customer') : null;
  }
}
