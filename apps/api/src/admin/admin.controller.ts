import {
  Body,
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  Length,
} from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const approvalStatuses = ['APPROVED', 'REJECTED', 'SUSPENDED'] as const;
const orderStatuses = [
  'PENDING_ACCEPTANCE',
  'ACCEPTED',
  'REJECTED',
  'PRINTING',
  'READY_FOR_PICKUP',
  'RIDER_ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'DELIVERY_FAILED',
] as const;
const platformPricingRuleKeys = new Set([
  'PAPER_A4_MULTIPLIER',
  'PAPER_A3_MULTIPLIER',
  'PAPER_A5_MULTIPLIER',
  'BLACK_WHITE_RATE',
  'COLOUR_RATE',
  'BINDING_FEE',
  'STAPLING_FEE',
  'LAMINATION_PER_PAGE',
  'DELIVERY_BASE',
  'DELIVERY_PER_KM',
  'EXPRESS_BASE',
  'EXPRESS_PER_KM',
  'SHOP_SERVICE_FEE',
  'VOLUME_DISCOUNT_MIN_PAGES',
  'VOLUME_DISCOUNT_RATE',
  'TAX_RATE',
  'ATTESTATION_PICKUP_BASE',
  'ATTESTATION_RETURN_BASE',
  'ATTESTATION_DELIVERY_PER_KM',
  'ATTESTATION_EXPRESS_FEE',
  'ATTESTATION_TAX_RATE',
]);

class AdminListQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 50;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

class RiderStatusDto {
  @IsIn(approvalStatuses)
  status!: (typeof approvalStatuses)[number];
}

class ShopStatusDto {
  @IsIn(approvalStatuses)
  status!: (typeof approvalStatuses)[number];
}

class UserSuspensionDto {
  @IsBoolean()
  suspended!: boolean;
}

class OrderStatusDto {
  @IsIn(orderStatuses)
  status!: (typeof orderStatuses)[number];

  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

class AgentStatusDto {
  @IsIn(approvalStatuses)
  status!: (typeof approvalStatuses)[number];
}

class ProviderServiceReviewDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';
}

class PlatformSettingsDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Length(2, 80)
  country?: string;
}

class PlatformCatalogServiceFieldsDto {
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Length(3, 160)
  name!: string;

  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Length(1, 1000)
  description!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  serviceFee!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  estimatedDays!: number;

  @IsBoolean()
  enabled!: boolean;

  @IsBoolean()
  requiresOriginals!: boolean;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  requiredOriginals!: string[];

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  supportingDocuments!: string[];
}

class CreatePlatformCatalogServiceDto extends PlatformCatalogServiceFieldsDto {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(80)
  code!: string;
}

class PrintPricingRuleDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100000)
  amount!: number;
}

type AuthenticatedRequest = { user: { id: string; roles: string[] } };

function pageResult<T>(data: T[], total: number, query: AdminListQueryDto) {
  return {
    data,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      pageCount: Math.ceil(total / query.pageSize),
    },
  };
}

function pageArgs(query: AdminListQueryDto) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

@Controller('admin')
@UseGuards(AuthGuard('jwt'))
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdmin(request: AuthenticatedRequest) {
    if (!request.user.roles.includes('ADMIN')) {
      throw new ForbiddenException('Administrator access is required');
    }
  }

  @Get('overview')
  async overview(@Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    const [users, shops, pendingShops, riders, pendingRiders, agents, pendingAgents, orders] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.shop.count(),
        this.prisma.shop.count({ where: { status: 'PENDING' } }),
        this.prisma.riderProfile.count(),
        this.prisma.riderProfile.count({ where: { status: 'PENDING' } }),
        this.prisma.agentProfile.count(),
        this.prisma.agentProfile.count({ where: { status: 'PENDING' } }),
        this.prisma.order.count(),
      ]);
    return {
      data: {
        users,
        shops,
        pendingShops,
        riders,
        pendingRiders,
        agents,
        pendingAgents,
        orders,
      },
    };
  }

  @Get('users')
  async users(@Query() query: AdminListQueryDto, @Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    const search = query.search?.trim();
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { CustomerProfile: { phone: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {};
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          suspended: true,
          createdAt: true,
          UserRole: { select: { role: true } },
          CustomerProfile: { select: { phone: true } },
          _count: { select: { orders: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.user.count({ where }),
    ]);
    return pageResult(data, total, query);
  }

  @Patch('users/:id/suspended')
  async suspendUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UserSuspensionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    this.assertAdmin(request);
    if (id === request.user.id && body.suspended) {
      throw new ForbiddenException('You cannot suspend your own administrator account');
    }
    return {
      data: await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.update({
          where: { id },
          data: { suspended: body.suspended },
          select: { id: true, name: true, email: true, suspended: true },
        });
        await transaction.auditLog.create({
          data: {
            id: randomUUID(),
            actorId: request.user.id,
            action: body.suspended ? 'USER_SUSPENDED' : 'USER_REINSTATED',
            entityId: id,
          },
        });
        return user;
      }),
    };
  }

  @Get('shops')
  async shops(@Query() query: AdminListQueryDto, @Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    const search = query.search?.trim();
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
            { address: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [data, total] = await Promise.all([
      this.prisma.shop.findMany({
        where,
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          status: true,
          isOpen: true,
          createdAt: true,
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { Order: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.shop.count({ where }),
    ]);
    return pageResult(data, total, query);
  }

  @Patch('shops/:id/status')
  async shopStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ShopStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    this.assertAdmin(request);
    return {
      data: await this.prisma.$transaction(async (transaction) => {
        const shop = await transaction.shop.update({
          where: { id },
          data: { status: body.status, isOpen: body.status === 'APPROVED' },
          select: { id: true, name: true, status: true, isOpen: true },
        });
        await transaction.auditLog.create({
          data: {
            id: randomUUID(),
            actorId: request.user.id,
            action: `SHOP_STATUS_${body.status}`,
            entityId: id,
          },
        });
        return shop;
      }),
    };
  }

  @Get('riders')
  async riders(@Query() query: AdminListQueryDto, @Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    const search = query.search?.trim();
    const where = search
      ? {
          OR: [
            { User: { name: { contains: search, mode: 'insensitive' as const } } },
            { User: { email: { contains: search, mode: 'insensitive' as const } } },
            { phone: { contains: search, mode: 'insensitive' as const } },
            { registration: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [data, total] = await Promise.all([
      this.prisma.riderProfile.findMany({
        where,
        select: {
          userId: true,
          phone: true,
          vehicleType: true,
          registration: true,
          status: true,
          createdAt: true,
          User: { select: { name: true, email: true } },
          RiderAvailability: { select: { online: true, updatedAt: true } },
          _count: { select: { DeliveryAssignment: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.riderProfile.count({ where }),
    ]);
    return pageResult(data, total, query);
  }

  @Patch('riders/:id/status')
  async riderStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RiderStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    this.assertAdmin(request);
    return {
      data: await this.prisma.$transaction(async (transaction) => {
        const rider = await transaction.riderProfile.update({
          where: { userId: id },
          data: { status: body.status },
          select: { userId: true, status: true },
        });
        if (body.status !== 'APPROVED') {
          await transaction.riderAvailability.updateMany({
            where: { riderId: id },
            data: { online: false },
          });
        }
        await transaction.auditLog.create({
          data: {
            id: randomUUID(),
            actorId: request.user.id,
            action: `RIDER_STATUS_${body.status}`,
            entityId: id,
          },
        });
        return rider;
      }),
    };
  }

  @Get('agents')
  async agents(@Query() query: AdminListQueryDto, @Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    const search = query.search?.trim();
    const where = search
      ? {
          OR: [
            { businessName: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
            { user: { name: { contains: search, mode: 'insensitive' as const } } },
            { user: { email: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {};
    const [data, total] = await Promise.all([
      this.prisma.agentProfile.findMany({
        where,
        select: {
          id: true,
          userId: true,
          businessName: true,
          address: true,
          phone: true,
          status: true,
          isOpen: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
          _count: { select: { jobs: true, services: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.agentProfile.count({ where }),
    ]);
    return pageResult(data, total, query);
  }

  @Patch('agents/:id/status')
  async agentStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AgentStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    this.assertAdmin(request);
    return {
      data: await this.prisma.$transaction(async (transaction) => {
        const agent = await transaction.agentProfile.update({
          where: { userId: id },
          data: {
            status: body.status,
            isOpen: body.status === 'APPROVED',
          },
          select: { userId: true, businessName: true, status: true, isOpen: true },
        });
        await transaction.auditLog.create({
          data: {
            id: randomUUID(),
            actorId: request.user.id,
            action: `AGENT_STATUS_${body.status}`,
            entityId: id,
          },
        });
        return agent;
      }),
    };
  }

  @Get('orders')
  async orders(@Query() query: AdminListQueryDto, @Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    const search = query.search?.trim();
    const where = search
      ? {
          OR: [
            { reference: { contains: search, mode: 'insensitive' as const } },
            { customer: { name: { contains: search, mode: 'insensitive' as const } } },
            { customer: { email: { contains: search, mode: 'insensitive' as const } } },
            { Shop: { name: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {};
    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: {
          id: true,
          reference: true,
          status: true,
          currency: true,
          printSubtotal: true,
          deliveryFee: true,
          platformFee: true,
          total: true,
          commission: true,
          createdAt: true,
          customer: { select: { id: true, name: true, email: true } },
          Shop: { select: { id: true, name: true } },
          Payment: { select: { status: true, method: true, amount: true } },
          DeliveryAssignment: {
            select: {
              assignedAt: true,
              RiderProfile: {
                select: { User: { select: { name: true, email: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.order.count({ where }),
    ]);
    return pageResult(data, total, query);
  }

  @Patch('orders/:id/status')
  async orderStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: OrderStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    this.assertAdmin(request);
    const reason = body.reason.trim();
    return {
      data: await this.prisma.$transaction(async (transaction) => {
        const order = await transaction.order.update({
          where: { id },
          data: { status: body.status },
          select: { id: true, reference: true, status: true },
        });
        await transaction.orderStatusHistory.create({
          data: {
            id: randomUUID(),
            orderId: id,
            status: body.status,
            actorId: request.user.id,
            reason,
          },
        });
        await transaction.auditLog.create({
          data: {
            id: randomUUID(),
            actorId: request.user.id,
            action: `ORDER_STATUS_${body.status}`,
            entityId: id,
          },
        });
        return order;
      }),
    };
  }

  @Get('services')
  async services(@Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    const [shopServices, agentServices] = await Promise.all([
      this.prisma.shopService.findMany({
        include: { shop: { select: { id: true, name: true, status: true } } },
        orderBy: [{ code: 'asc' }, { shopId: 'asc' }],
        take: 500,
      }),
      this.prisma.agentService.findMany({
        include: { agent: { select: { id: true, businessName: true, status: true } } },
        orderBy: [{ code: 'asc' }, { agentId: 'asc' }],
        take: 500,
      }),
    ]);
    return { data: { shopServices, agentServices } };
  }

  @Patch('services/:providerType/:id/review')
  async reviewProviderService(
    @Param('providerType') providerType: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ProviderServiceReviewDto,
    @Req() request: AuthenticatedRequest,
  ) {
    this.assertAdmin(request);
    if (providerType !== 'shops' && providerType !== 'agents') {
      throw new BadRequestException('Provider type must be shops or agents');
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const current = providerType === 'shops'
        ? await transaction.shopService.findUnique({ where: { id }, select: { id: true, isCustom: true } })
        : await transaction.agentService.findUnique({ where: { id }, select: { id: true, isCustom: true } });
      if (!current?.isCustom) throw new NotFoundException('Custom provider service was not found');

      const service = providerType === 'shops'
        ? await transaction.shopService.update({ where: { id }, data: { reviewStatus: body.status } })
        : await transaction.agentService.update({ where: { id }, data: { reviewStatus: body.status } });
      await transaction.auditLog.create({
        data: {
          id: randomUUID(),
          actorId: request.user.id,
          action: `PROVIDER_SERVICE_${body.status}`,
          entityId: id,
        },
      });
      return service;
    });

    return { data: updated };
  }

  @Get('catalog')
  async platformCatalog(@Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    const [services, pricingRules] = await Promise.all([
      this.prisma.platformCatalogService.findMany({ orderBy: { code: 'asc' } }),
      this.prisma.platformPricingRule.findMany({ orderBy: { key: 'asc' } }),
    ]);
    return {
      data: {
        services: services.map((service) => ({ ...service, serviceFee: Number(service.serviceFee) })),
        pricingRules: pricingRules.map((rule) => ({ key: rule.key, amount: Number(rule.amount), updatedAt: rule.updatedAt })),
      },
    };
  }

  @Post('catalog/services')
  async createCatalogService(
    @Body() body: CreatePlatformCatalogServiceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    this.assertAdmin(request);
    const requiredOriginals = body.requiredOriginals.map((item) => item.trim()).filter(Boolean);
    if (body.requiresOriginals && requiredOriginals.length === 0) {
      throw new BadRequestException('At least one original document is required for this service');
    }
    const existing = await this.prisma.platformCatalogService.findUnique({ where: { code: body.code }, select: { code: true } });
    if (existing) throw new BadRequestException('A service with this code already exists');
    return {
      data: await this.prisma.$transaction(async (transaction) => {
        const service = await transaction.platformCatalogService.create({
          data: {
            code: body.code,
            name: body.name,
            description: body.description,
            serviceFee: body.serviceFee,
            estimatedDays: body.estimatedDays,
            enabled: body.enabled,
            requiresOriginals: body.requiresOriginals,
            requiredOriginals,
            supportingDocuments: body.supportingDocuments.map((item) => item.trim()).filter(Boolean),
          },
        });
        await transaction.auditLog.create({
          data: {
            id: randomUUID(),
            actorId: request.user.id,
            action: 'PLATFORM_CATALOG_SERVICE_CREATED',
            entityId: body.code,
          },
        });
        return { ...service, serviceFee: Number(service.serviceFee) };
      }),
    };
  }

  @Patch('catalog/services/:code')
  async updateCatalogService(
    @Param('code') code: string,
    @Body() body: PlatformCatalogServiceFieldsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    this.assertAdmin(request);
    const requiredOriginals = body.requiredOriginals.map((item) => item.trim()).filter(Boolean);
    if (body.requiresOriginals && requiredOriginals.length === 0) {
      throw new BadRequestException('At least one original document is required for this service');
    }
    const existing = await this.prisma.platformCatalogService.findUnique({ where: { code }, select: { code: true } });
    if (!existing) throw new BadRequestException('Service was not found');
    return {
      data: await this.prisma.$transaction(async (transaction) => {
        const service = await transaction.platformCatalogService.update({
          where: { code },
          data: {
            name: body.name,
            description: body.description,
            serviceFee: body.serviceFee,
            estimatedDays: body.estimatedDays,
            enabled: body.enabled,
            requiresOriginals: body.requiresOriginals,
            requiredOriginals,
            supportingDocuments: body.supportingDocuments.map((item) => item.trim()).filter(Boolean),
          },
        });
        await transaction.auditLog.create({
          data: {
            id: randomUUID(),
            actorId: request.user.id,
            action: 'PLATFORM_CATALOG_SERVICE_UPDATED',
            entityId: code,
          },
        });
        return { ...service, serviceFee: Number(service.serviceFee) };
      }),
    };
  }

  @Patch('catalog/pricing/:key')
  async updatePlatformPricingRule(
    @Param('key') key: string,
    @Body() body: PrintPricingRuleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    this.assertAdmin(request);
    const rateKeys = new Set(['VOLUME_DISCOUNT_RATE', 'TAX_RATE', 'ATTESTATION_TAX_RATE']);
    if (!platformPricingRuleKeys.has(key)) {
      throw new BadRequestException('Pricing rule was not found');
    }
    if ((rateKeys.has(key) && body.amount > 1)
      || (key === 'VOLUME_DISCOUNT_MIN_PAGES' && (body.amount < 1 || !Number.isInteger(body.amount)))
      || (key.includes('MULTIPLIER') && body.amount > 10)) {
      throw new BadRequestException('Pricing rule value is outside its allowed range');
    }
    return {
      data: await this.prisma.$transaction(async (transaction) => {
        const rule = await transaction.platformPricingRule.update({
          where: { key },
          data: { amount: body.amount, updatedAt: new Date() },
        });
        await transaction.auditLog.create({
          data: {
            id: randomUUID(),
            actorId: request.user.id,
            action: 'PLATFORM_PRICING_RULE_UPDATED',
            entityId: key,
          },
        });
        return { key: rule.key, amount: Number(rule.amount), updatedAt: rule.updatedAt };
      }),
    };
  }

  @Get('finance')
  async finance(@Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    const [payments, settlements, paidTotal, pendingSettlementTotal] = await Promise.all([
      this.prisma.payment.findMany({
        select: {
          id: true,
          amount: true,
          method: true,
          status: true,
          gatewayReference: true,
          createdAt: true,
          Order: {
            select: {
              reference: true,
              currency: true,
              customer: { select: { name: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.settlement.findMany({
        include: {
          Shop: { select: { name: true } },
          RiderProfile: { select: { User: { select: { name: true, email: true } } } },
          AgentProfile: { select: { businessName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
      this.prisma.settlement.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true } }),
    ]);
    return {
      data: {
        payments,
        settlements,
        paidTotal: Number(paidTotal._sum.amount ?? 0),
        pendingSettlementTotal: Number(pendingSettlementTotal._sum.amount ?? 0),
      },
    };
  }

  @Get('settings')
  async settings(@Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    const settings = await this.prisma.adminSetting.findMany({
      where: { key: { in: ['platform.currency', 'platform.country'] } },
    });
    return {
      data: Object.fromEntries(settings.map(({ key, value }) => [key, value])),
    };
  }

  @Patch('settings')
  async updateSettings(
    @Body() body: PlatformSettingsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    this.assertAdmin(request);
    const updates = Object.entries({
      'platform.currency': body.currency,
      'platform.country': body.country,
    }).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    if (updates.length === 0) return this.settings(request);

    const data = await this.prisma.$transaction(async (transaction) => {
      for (const [key, value] of updates) {
        await transaction.adminSetting.upsert({
          where: { key },
          create: { key, value, updatedAt: new Date() },
          update: { value, updatedAt: new Date() },
        });
      }
      await transaction.auditLog.create({
        data: {
          id: randomUUID(),
          actorId: request.user.id,
          action: 'PLATFORM_SETTINGS_UPDATED',
        },
      });
      return transaction.adminSetting.findMany({
        where: { key: { in: ['platform.currency', 'platform.country'] } },
      });
    });
    return {
      data: Object.fromEntries(data.map(({ key, value }) => [key, value])),
    };
  }

  @Get('audit')
  async audit(@Query() query: AdminListQueryDto, @Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        select: {
          id: true,
          action: true,
          entityId: true,
          createdAt: true,
          User: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.auditLog.count(),
    ]);
    return pageResult(data, total, query);
  }
}
