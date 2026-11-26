import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsIn,
  Matches,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

class AgentProfileDto {
  @IsString()
  @Length(2, 120)
  businessName!: string;

  @IsString()
  @Length(5, 500)
  address!: string;

  @IsString()
  @Length(7, 20)
  phone!: string;
}

class AgentServiceDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,40}$/)
  code!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedDays!: number;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsBoolean()
  isCustom?: boolean;
}

class CustodyDto {
  @IsIn(['RECEIVED', 'PROCESSING', 'ATTESTED', 'RETURN_READY'])
  eventType!: 'RECEIVED' | 'PROCESSING' | 'ATTESTED' | 'RETURN_READY';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

class AvailabilityDto {
  @IsBoolean()
  isOpen!: boolean;
}

class AgentServicesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AgentServiceDto)
  services!: AgentServiceDto[];
}

type AuthenticatedRequest = { user: { id: string; roles: string[] } };

const nextStatus = {
  RECEIVED: { from: ['PICKUP_SCHEDULED', 'COLLECTED'], to: 'AGENT_RECEIVED' },
  PROCESSING: { from: ['AGENT_RECEIVED'], to: 'PROCESSING' },
  ATTESTED: { from: ['PROCESSING'], to: 'ATTESTED' },
  RETURN_READY: { from: ['ATTESTED'], to: 'RETURN_READY' },
} as const;

@Controller('agents')
@UseGuards(AuthGuard('jwt'))
export class AgentsController {
  constructor(private readonly prisma: PrismaService) {}

  private assertAgent(req: AuthenticatedRequest) {
    if (!req.user.roles.includes('AGENT')) {
      throw new ForbiddenException('An agent account is required');
    }
  }

  private async profileFor(req: AuthenticatedRequest) {
    this.assertAgent(req);
    const profile = await this.prisma.agentProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!profile) throw new NotFoundException('Complete your agent profile first');
    return profile;
  }

  @Get('me')
  async profile(@Req() req: AuthenticatedRequest) {
    this.assertAgent(req);
    return {
      data: await this.prisma.agentProfile.findUnique({
        where: { userId: req.user.id },
        include: {
          user: { select: { name: true, email: true } },
        },
      }),
    };
  }

  @Post('register')
  async register(@Req() req: AuthenticatedRequest, @Body() dto: AgentProfileDto) {
    this.assertAgent(req);
    const profile = await this.prisma.agentProfile.upsert({
      where: { userId: req.user.id },
      create: {
        userId: req.user.id,
        businessName: dto.businessName,
        address: dto.address,
        phone: dto.phone,
      },
      update: {
        businessName: dto.businessName,
        address: dto.address,
        phone: dto.phone,
      },
      include: { user: { select: { name: true, email: true } } },
    });
    return { data: profile };
  }

  @Patch('me')
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AgentProfileDto,
  ) {
    const profile = await this.profileFor(req);
    return {
      data: await this.prisma.agentProfile.update({
        where: { id: profile.id },
        data: {
          businessName: dto.businessName,
          address: dto.address,
          phone: dto.phone,
        },
        include: { user: { select: { name: true, email: true } } },
      }),
    };
  }

  @Patch('me/availability')
  async availability(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AvailabilityDto,
  ) {
    const profile = await this.profileFor(req);
    if (dto.isOpen && profile.status !== 'APPROVED') {
      throw new BadRequestException(
        'Only approved agents can accept new work',
      );
    }
    return {
      data: await this.prisma.agentProfile.update({
        where: { id: profile.id },
        data: { isOpen: dto.isOpen },
        include: { user: { select: { name: true, email: true } } },
      }),
    };
  }

  @Get('me/jobs')
  async jobs(@Req() req: AuthenticatedRequest) {
    const profile = await this.profileFor(req);
    return {
      data: await this.prisma.attestationJob.findMany({
        where: { agentId: profile.id },
        include: {
          custodyEvents: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    };
  }

  @Post('me/jobs/:jobId/custody')
  async custody(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() dto: CustodyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const profile = await this.profileFor(request);
    if (profile.status !== 'APPROVED') {
      throw new ForbiddenException('Only approved agents can update job custody');
    }
    const job = await this.prisma.attestationJob.findFirst({
      where: { id: jobId, agentId: profile.id },
    });
    if (!job) throw new NotFoundException('This job was not found');

    const transition = nextStatus[dto.eventType];
    if (!transition.from.some((status) => status === job.status)) {
      throw new BadRequestException(
        `This job must be ${transition.from[0].toLowerCase().replaceAll('_', ' ')} before this update`,
      );
    }

    const event = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.attestationJob.updateMany({
        where: { id: job.id, agentId: profile.id, status: job.status },
        data: { status: transition.to },
      });
      if (updated.count !== 1) {
        throw new ConflictException('This job changed; refresh and try again');
      }
      return transaction.custodyEvent.create({
        data: {
          id: randomUUID(),
          jobId: job.id,
          eventType: dto.eventType,
          actorId: request.user.id,
          note: dto.note,
        },
      });
    });
    return { data: event };
  }

  @Get('me/services')
  async services(@Req() req: AuthenticatedRequest) {
    const profile = await this.profileFor(req);
    return {
      data: await this.prisma.agentService.findMany({
        where: { agentId: profile.id },
        orderBy: { name: 'asc' },
      }),
    };
  }

  @Post('me/services')
  async service(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AgentServiceDto,
  ) {
    const profile = await this.profileFor(req);
    const code = dto.code.trim().toLowerCase();
    const catalogService = await this.prisma.platformCatalogService.findFirst({
      where: { code },
      select: { code: true, name: true, description: true, enabled: true },
    });
    if (dto.isCustom && catalogService) {
      throw new BadRequestException('Custom services must use a code outside the platform catalogue');
    }
    if (catalogService && !catalogService.enabled) {
      throw new BadRequestException('This platform service is disabled');
    }
    const isCustom = dto.isCustom ?? !catalogService;
    return {
      data: await this.prisma.agentService.upsert({
        where: { agentId_code: { agentId: profile.id, code } },
        create: {
          agentId: profile.id,
          code,
          name: catalogService?.name ?? dto.name.trim(),
          description: catalogService?.description ?? dto.description?.trim() ?? '',
          price: dto.price,
          estimatedDays: dto.estimatedDays,
          enabled: dto.enabled,
          isCustom,
          reviewStatus: isCustom ? 'PENDING' : 'APPROVED',
        },
        update: {
          name: catalogService?.name ?? dto.name.trim(),
          description: catalogService?.description ?? dto.description?.trim() ?? '',
          price: dto.price,
          estimatedDays: dto.estimatedDays,
          enabled: dto.enabled,
          isCustom,
          ...(isCustom ? { reviewStatus: 'PENDING' as const } : {}),
        },
      }),
    };
  }

  @Post('me/services/batch')
  async saveServices(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AgentServicesDto,
  ) {
    const profile = await this.profileFor(req);
    const codes = dto.services.map((service) => service.code.trim().toLowerCase());
    if (new Set(codes).size !== codes.length) {
      throw new BadRequestException('Each service must have a unique code');
    }
    const catalogServices = await this.prisma.platformCatalogService.findMany({
      where: { code: { in: codes } },
      select: { code: true, name: true, description: true, enabled: true },
    });
    if (dto.services.some((service, index) => service.isCustom && catalogServices.some((catalog) => catalog.code === codes[index]))) {
      throw new BadRequestException('Custom services must use codes outside the platform catalogue');
    }
    if (catalogServices.some((service) => !service.enabled)) {
      throw new BadRequestException('A selected platform service is disabled');
    }
    const catalogByCode = new Map(catalogServices.map((service) => [service.code, service]));
    const operations = dto.services.map((service, index) => {
      const code = codes[index];
      const catalogService = catalogByCode.get(code);
      const isCustom = service.isCustom ?? !catalogService;
      return this.prisma.agentService.upsert({
        where: { agentId_code: { agentId: profile.id, code } },
        create: {
          agentId: profile.id,
          code,
          name: catalogService?.name ?? service.name.trim(),
          description: catalogService?.description ?? service.description?.trim() ?? '',
          price: service.price,
          estimatedDays: service.estimatedDays,
          enabled: service.enabled,
          isCustom,
          reviewStatus: isCustom ? 'PENDING' : 'APPROVED',
        },
        update: {
          name: catalogService?.name ?? service.name.trim(),
          description: catalogService?.description ?? service.description?.trim() ?? '',
          price: service.price,
          estimatedDays: service.estimatedDays,
          enabled: service.enabled,
          isCustom,
          ...(isCustom ? { reviewStatus: 'PENDING' as const } : {}),
        },
      });
    });
    return { data: await this.prisma.$transaction(operations) };
  }

  @Get('me/earnings')
  async earnings(@Req() req: AuthenticatedRequest) {
    const profile = await this.profileFor(req);
    const settlements = await this.prisma.settlement.findMany({
      where: { agentId: profile.id },
      orderBy: { createdAt: 'desc' },
    });
    const total = settlements.reduce(
      (sum, settlement) => sum + Number(settlement.amount),
      0,
    );
    const paid = settlements
      .filter((settlement) => settlement.status === 'PAID')
      .reduce((sum, settlement) => sum + Number(settlement.amount), 0);
    const pending = settlements
      .filter((settlement) => settlement.status === 'PENDING')
      .reduce((sum, settlement) => sum + Number(settlement.amount), 0);
    return { data: { total, paid, pending, settlements } };
  }

  @Get('me/notifications')
  async notifications(@Req() req: AuthenticatedRequest) {
    await this.profileFor(req);
    return {
      data: await this.prisma.notification.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    };
  }

  @Patch('me/notifications/:notificationId/read')
  async markNotificationRead(
    @Req() req: AuthenticatedRequest,
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ) {
    await this.profileFor(req);
    const updated = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId: req.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (updated.count === 0) {
      const notification = await this.prisma.notification.findFirst({
        where: { id: notificationId, userId: req.user.id },
        select: { id: true },
      });
      if (!notification) throw new NotFoundException('Notification was not found');
    }
    return { data: { read: true } };
  }
}
