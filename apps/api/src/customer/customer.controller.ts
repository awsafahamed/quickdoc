import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsEmail, IsEnum, IsOptional, IsString, Length, IsNumber, Min, IsUUID, IsBoolean, Max } from 'class-validator';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PrintPricingService } from '../print/print-pricing.service';
import { DeliverySpeed, PrintColour, PrintPaperSize, PrintSides } from '../print/print.types';

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
  @IsNumber()
  pageCount?: number;

  @IsOptional()
  @IsString()
  objectKey?: string;
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

  @IsString()
  deliveryAddress!: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsString()
  clientKey!: string;
}

@Controller('customer')
@UseGuards(AuthGuard('jwt'))
export class CustomerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly printPricing: PrintPricingService,
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

  @Post('documents')
  async createDocument(@Req() request: { user: { id: string } }, @Body() dto: DocumentDto) {
    if (dto.mimeType !== 'application/pdf') throw new BadRequestException('Only PDF documents are supported');
    if (dto.sizeBytes > 25 * 1024 * 1024) throw new BadRequestException('Document exceeds the 25 MB limit');
    const objectKey = dto.objectKey ?? `private/customers/${request.user.id}/${randomUUID()}.pdf`;
    return { data: await this.prisma.document.create({ data: { id: randomUUID(), userId: request.user.id, objectKey, name: dto.name, mimeType: dto.mimeType, sizeBytes: dto.sizeBytes, pageCount: dto.pageCount, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), updatedAt: new Date() } }) };
  }

  @Get('documents/:id')
  async document(@Param('id') id: string, @Req() request: { user: { id: string } }) {
    const document = await this.prisma.document.findFirst({ where: { id, userId: request.user.id } });
    if (!document) throw new BadRequestException('Document was not found');
    return { data: document };
  }

  @Delete('documents/:id')
  async deleteDocument(@Param('id') id: string, @Req() request: { user: { id: string } }) {
    const document = await this.prisma.document.findFirst({ where: { id, userId: request.user.id } });
    if (!document) throw new BadRequestException('Document was not found');
    if (await this.prisma.orderItem.count({ where: { documentId: id } })) throw new BadRequestException('Document cannot be deleted while attached to an order');
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
      binding: false,
      stapling: false,
      lamination: false,
      deliverySpeed: DeliverySpeed.STANDARD,
      deliveryDistanceKm: 0,
    });
    const printSubtotal = quote.printing;
    const deliveryFee = quote.delivery;
    const platformFee = Number((quote.total - printSubtotal - deliveryFee).toFixed(2));
    const commission = Number((printSubtotal * 0.1).toFixed(2));
    const total = quote.total;
    const reference = `PR-${Date.now().toString().slice(-8)}`;
    const pin = randomBytes(3).toString('hex').toUpperCase();
    const pickupCode = randomBytes(3).toString('hex').toUpperCase();
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({ data: { id: randomUUID(), reference, customerId: request.user.id, shopId: dto.shopId, status: 'PENDING_ACCEPTANCE', currency: 'LKR', printSubtotal, deliveryFee, platformFee, total, commission, deliveryAddress: { line: dto.deliveryAddress }, instructions: dto.instructions, deliveryPinHash: createHash('sha256').update(pin).digest('hex'), pickupCodeHash: createHash('sha256').update(pickupCode).digest('hex'), clientKey: dto.clientKey } });
      await tx.orderItem.create({ data: { id: randomUUID(), orderId: created.id, documentId: dto.documentId, paperSize: dto.paperSize, colour: dto.colour, duplex: dto.duplex, copies: dto.copies, pageRange: 'ALL', printedSides: dto.printedSides, orientation: 'PORTRAIT', unitPrice: printSubtotal / dto.copies, total: printSubtotal } });
      await tx.orderStatusHistory.create({ data: { id: randomUUID(), orderId: created.id, status: 'PENDING_ACCEPTANCE', actorId: request.user.id } });
      return created;
    });
    return { data: order };
  }
}
