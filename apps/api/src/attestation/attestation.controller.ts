import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttestationAgentsQueryDto,
  AttestationBookingDto,
} from './attestation-booking.dto';
import { AttestationQuoteDto } from './attestation-quote.dto';
import { AttestationCatalogService } from './attestation-catalog.service';

@Controller('attestation')
export class AttestationController {
  constructor(
    private readonly catalogue: AttestationCatalogService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('services')
  async listServices() {
    return { data: await this.catalogue.list() };
  }

  @Post('quote')
  async createQuote(@Body() request: AttestationQuoteDto) {
    return {
      data: await this.catalogue.quote(request.serviceId, request.pickupDistanceKm, request.returnDistanceKm, request.express),
    };
  }

  @Get('agents')
  async listAvailableAgents(@Query() query: AttestationAgentsQueryDto) {
    const service = await this.prisma.platformCatalogService.findFirst({
      where: { code: query.serviceId, enabled: true },
      select: { code: true },
    });
    if (!service) throw new NotFoundException('Attestation service was not found');

    const agents = await this.prisma.agentProfile.findMany({
      where: {
        status: 'APPROVED',
        isOpen: true,
        services: { some: { code: service.code, enabled: true } },
      },
      include: {
        services: {
          where: { code: service.code, enabled: true },
          select: { estimatedDays: true },
        },
      },
      orderBy: { businessName: 'asc' },
    });

    return {
      data: agents.map((agent) => ({
        id: agent.id,
        businessName: agent.businessName,
        address: agent.address,
        estimatedDays: agent.services[0]?.estimatedDays ?? 0,
      })),
    };
  }

  @Post('bookings')
  @UseGuards(AuthGuard('jwt'))
  async createBooking(
    @Req() request: { user: { id: string } },
    @Body() dto: AttestationBookingDto,
  ) {
    const service = await this.prisma.platformCatalogService.findFirst({
      where: { code: dto.serviceId, enabled: true },
      select: { code: true, estimatedDays: true },
    });
    if (!service) throw new NotFoundException('Attestation service was not found');

    const agent = await this.prisma.agentProfile.findFirst({
      where: {
        id: dto.agentId,
        status: 'APPROVED',
        isOpen: true,
        services: { some: { code: service.code, enabled: true } },
      },
      select: { id: true, businessName: true },
    });
    if (!agent) {
      throw new BadRequestException('This agent is not available for the selected service');
    }

    const pickupScheduledAt = new Date(`${dto.pickupDate}T00:00:00.000Z`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (pickupScheduledAt < today) {
      throw new BadRequestException('Pickup date must be today or later');
    }

    const quote = await this.catalogue.quote(
      service.code,
      dto.pickupDistanceKm,
      dto.returnDistanceKm,
      dto.express,
    );
    const estimatedReadyAt = new Date(pickupScheduledAt);
    estimatedReadyAt.setUTCDate(estimatedReadyAt.getUTCDate() + service.estimatedDays);
    const id = randomUUID();
    const reference = `AT-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    const booking = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.attestationJob.create({
        data: {
          id,
          reference,
          agentId: agent.id,
          customerId: request.user.id,
          serviceCode: service.code,
          status: 'PICKUP_SCHEDULED',
          pickupAddress: { line: dto.pickupAddress },
          returnAddress: { line: dto.returnAddress },
          pickupScheduledAt,
          pickupSlot: dto.pickupSlot,
          quotedTotal: quote.total,
          currency: quote.currency,
          express: dto.express,
          pricingSnapshot: {
            serviceFee: quote.serviceFee,
            pickupDelivery: quote.pickupDelivery,
            returnDelivery: quote.returnDelivery,
            expressFee: quote.expressFee,
            tax: quote.tax,
            total: quote.total,
            currency: quote.currency,
            quoteId: quote.quoteId,
            expiresAt: quote.expiresAt,
            pickupDistanceKm: dto.pickupDistanceKm,
            returnDistanceKm: dto.returnDistanceKm,
          },
          estimatedReadyAt,
        },
        include: { agent: { select: { businessName: true } } },
      });

      await transaction.custodyEvent.create({
        data: {
          id: randomUUID(),
          jobId: id,
          eventType: 'BOOKED',
          actorId: request.user.id,
          note: `Pickup scheduled for ${dto.pickupDate} (${dto.pickupSlot})`,
        },
      });
      return created;
    });

    return { data: booking };
  }

  @Get('me/jobs')
  @UseGuards(AuthGuard('jwt'))
  async customerJobs(@Req() request: { user: { id: string } }) {
    return {
      data: await this.prisma.attestationJob.findMany({
        where: { customerId: request.user.id },
        include: {
          agent: { select: { businessName: true } },
          custodyEvents: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    };
  }
}
