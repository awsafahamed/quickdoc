import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsEmail, IsEnum, IsOptional, IsString, Length, IsNumber, Min, IsUUID, IsBoolean, Max, IsInt } from 'class-validator';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
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
  email?: string;

  @IsOptional()
  @IsString()
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
  latitude?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  longitude?: number;
}

class DocumentDto {
  @IsString()
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

  @IsNumber()
  @Min(1)
  @Max(100)
  copies!: number;

  @IsNumber()
  @Min(1)
  @Max(10000)
  printedSides!: number;

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

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(200)
  deliveryDistanceKm?: number;

  @IsString()
  deliveryAddress!: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsString()
  clientKey!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsString({ each: true })
  shopServiceCodes?: string[];
}

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
    return { data: await this.prisma.user.findUnique({ where: { id: request.user.id }, include: { CustomerProfile: true, UserRole: true } }) };
  }

  @Patch('me')
  async updateMe(@Req() request: { user: { id: string } }, @Body() dto: ProfileDto) {
    const user = await this.prisma.user.update({ where: { id: request.user.id }, data: { name: dto.name, email: dto.email?.toLowerCase() } });
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
    await this.storage.verifyPdfUpload(dto.objectKey, dto.sizeBytes);
    const objectKey = dto.objectKey;
    return { data: await this.prisma.document.create({ data: { id: randomUUID(), userId: request.user.id, objectKey, name: dto.name, mimeType: dto.mimeType, sizeBytes: dto.sizeBytes, pageCount: dto.pageCount, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), updatedAt: new Date() } }) };
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

  @Get('orders')
  async orders(@Req() request: { user: { id: string } }) {
    return { data: await this.prisma.order.findMany({ where: { customerId: request.user.id }, include: { Shop: true, OrderItem: true, OrderStatusHistory: { orderBy: { createdAt: 'desc' } }, DeliveryAssignment: { include: { DeliveryStatusHistory: { orderBy: { createdAt: 'desc' } } } }, Payment: true }, orderBy: { createdAt: 'desc' } }) };
  }

  @Get('orders/:id')
  async order(@Param('id') id: string, @Req() request: { user: { id: string } }) {
    const order = await this.prisma.order.findFirst({ where: { id, customerId: request.user.id }, include: { Shop: true, OrderItem: true, OrderStatusHistory: { orderBy: { createdAt: 'desc' } }, DeliveryAssignment: { include: { DeliveryStatusHistory: { orderBy: { createdAt: 'desc' } } } }, Payment: true } });
    if (!order) throw new BadRequestException('Order was not found');
    return { data: order };
  }

  @Post('orders/:id/confirm-delivery')
  async confirmDelivery(@Param('id') id: string, @Req() request: { user: { id: string } }) {
    const order = await this.prisma.order.findFirst({
      where: { id, customerId: request.user.id },
      include: { Shop: true, DeliveryAssignment: true },
    });
    if (!order) throw new NotFoundException('Order was not found');
    if (order.status !== 'DELIVERED') {
      throw new ConflictException('Only a delivered order can be confirmed');
    }

    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.order.updateMany({
        where: { id, customerId: request.user.id, status: 'DELIVERED' },
        data: { status: 'COMPLETED' },
      });
      if (updated.count !== 1) {
        throw new ConflictException('This order changed; refresh and try again');
      }
      await transaction.orderStatusHistory.create({
        data: {
          id: randomUUID(),
          orderId: id,
          status: 'COMPLETED',
          actorId: request.user.id,
          reason: 'Customer confirmed delivery',
        },
      });
      const recipients = [...new Set(
        [order.Shop.ownerId, order.DeliveryAssignment?.riderId]
          .filter((userId): userId is string => Boolean(userId)),
      )];
      await transaction.notification.createMany({
        data: recipients.map((userId) => ({
          id: randomUUID(),
          userId,
          title: 'Delivery confirmed',
          body: `The customer confirmed delivery for order ${order.reference}.`,
          createdAt: new Date(),
        })),
      });
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
    const existing = await this.prisma.order.findUnique({ where: { customerId_clientKey: { customerId: request.user.id, clientKey: dto.clientKey } } });
    if (existing) return { data: existing, idempotent: true };
    const [shop, document] = await Promise.all([
      this.prisma.shop.findFirst({ where: { id: dto.shopId, status: 'APPROVED', isOpen: true } }),
      this.prisma.document.findFirst({ where: { id: dto.documentId, userId: request.user.id } }),
    ]);
    if (!shop) throw new BadRequestException('Shop is not eligible');
    if (!document) throw new BadRequestException('Document was not found');
    const pages = document.pageCount ?? dto.printedSides;
    if (pages < 1 || pages > 10000) throw new BadRequestException('Document page count is outside the printable range');
    const quote = await this.printPricing.calculate({
      pageCount: pages,
      copies: dto.copies,
      paperSize: dto.paperSize,
      colour: dto.colour ? PrintColour.COLOUR : PrintColour.BLACK_WHITE,
      sides: dto.duplex ? PrintSides.DUPLEX : PrintSides.SINGLE,
      binding: dto.binding ?? false,
      stapling: dto.stapling ?? false,
      lamination: dto.lamination ?? false,
      deliverySpeed: dto.deliverySpeed ?? DeliverySpeed.STANDARD,
      deliveryDistanceKm: dto.deliveryDistanceKm ?? 0,
      shopId: dto.shopId,
      shopServiceCodes: dto.shopServiceCodes ?? [],
    });
    const printSubtotal = Number((quote.printing + quote.finishing + quote.shopServiceTotal).toFixed(2));
    const deliveryFee = Number((quote.delivery + quote.express).toFixed(2));
    const platformFee = Number((quote.total - printSubtotal - deliveryFee).toFixed(2));
    const commission = Number((printSubtotal * 0.1).toFixed(2));
    const total = quote.total;
    const reference = `PR-${Date.now().toString().slice(-8)}`;
    const pin = randomBytes(3).toString('hex').toUpperCase();
    const pickupCode = randomBytes(3).toString('hex').toUpperCase();
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({ data: { id: randomUUID(), reference, customerId: request.user.id, shopId: dto.shopId, status: 'PENDING_ACCEPTANCE', currency: 'LKR', printSubtotal, deliveryFee, platformFee, total, commission, deliverySpeed: dto.deliverySpeed ?? DeliverySpeed.STANDARD, deliveryDistanceKm: dto.deliveryDistanceKm ?? 0, deliveryAddress: { line: dto.deliveryAddress }, instructions: dto.instructions, deliveryPinHash: createHash('sha256').update(pin).digest('hex'), pickupCodeHash: createHash('sha256').update(pickupCode).digest('hex'), clientKey: dto.clientKey, shopServiceSnapshot: quote.shopServices.map((service) => ({ code: service.code, name: service.name, price: service.price })) } });
      const documentPrintTotal = Number((quote.printing + quote.finishing).toFixed(2));
      await tx.orderItem.create({ data: { id: randomUUID(), orderId: created.id, documentId: dto.documentId, paperSize: dto.paperSize, colour: dto.colour, duplex: dto.duplex, copies: dto.copies, pageRange: 'ALL', printedSides: dto.printedSides, orientation: 'PORTRAIT', binding: dto.binding ? 'BINDING' : null, stapling: dto.stapling ?? false, lamination: dto.lamination ?? false, unitPrice: documentPrintTotal / dto.copies, total: documentPrintTotal } });
      await tx.orderStatusHistory.create({ data: { id: randomUUID(), orderId: created.id, status: 'PENDING_ACCEPTANCE', actorId: request.user.id } });
      return created;
    });
    return { data: order };
  }
}
