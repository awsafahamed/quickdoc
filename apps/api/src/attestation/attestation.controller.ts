import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
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

  @Get('marketplace-services')
  async listMarketplaceServices() {
    const [catalogue, offers] = await Promise.all([
      this.catalogue.list(),
      this.prisma.agentService.findMany({
        where: {
          isCustom: true,
          enabled: true,
          reviewStatus: 'APPROVED',
          agent: { status: 'APPROVED', isOpen: true },
        },
        include: { agent: { select: { id: true, businessName: true } } },
        orderBy: [{ name: 'asc' }, { agentId: 'asc' }],
      }),
    ]);
    return {
      data: [
        ...catalogue,
        ...offers.map((offer) => ({
          id: offer.id,
          name: offer.name,
          description: offer.description,
          estimatedDays: offer.estimatedDays,
          serviceFee: Number(offer.price),
          requiresOriginals: false,
          requiredOriginals: [],
          supportingDocuments: [],
          providerAgentId: offer.agent.id,
          providerName: offer.agent.businessName,
        })),
      ],
    };
  }

  @Post('quote')
  async createQuote(@Body() request: AttestationQuoteDto) {
    const service = await this.prisma.platformCatalogService.findFirst({
      where: { code: request.serviceId, enabled: true },
      select: { code: true },
    });
    if (!service && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.serviceId)) {
      throw new NotFoundException('Attestation service was not found');
    }
    const serviceFilter = service
      ? { code: service.code }
      : { id: request.serviceId, isCustom: true };
    const agent = await this.prisma.agentProfile.findFirst({
      where: {
        id: request.agentId,
        status: 'APPROVED',
        isOpen: true,
        services: {
          some: { ...serviceFilter, enabled: true, reviewStatus: 'APPROVED' },
        },
      },
      select: {
        services: {
          where: { ...serviceFilter, enabled: true, reviewStatus: 'APPROVED' },
          select: { price: true },
        },
      },
    });
    const offer = agent?.services[0];
    if (!offer) {
      throw new BadRequestException('This agent is not available for the selected service');
    }

    return {
      data: await this.catalogue.quote(
        request.serviceId,
        request.pickupDistanceKm,
        request.returnDistanceKm,
        request.express,
        Number(offer.price),
      ),
    };
  }

  @Get('agents')
  async listAvailableAgents(@Query() query: AttestationAgentsQueryDto) {
    const service = await this.prisma.platformCatalogService.findFirst({
      where: { code: query.serviceId, enabled: true },
      select: { code: true },
    });
    if (!service && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.serviceId)) {
      throw new NotFoundException('Attestation service was not found');
    }
    const serviceFilter = service
      ? { code: service.code }
      : { id: query.serviceId, isCustom: true };

    const agents = await this.prisma.agentProfile.findMany({
      where: {
        status: 'APPROVED',
        isOpen: true,
        services: {
          some: { ...serviceFilter, enabled: true, reviewStatus: 'APPROVED' },
        },
      },
      include: {
        services: {
          where: { ...serviceFilter, enabled: true, reviewStatus: 'APPROVED' },
          select: { estimatedDays: true, price: true },
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
        serviceFee: Number(agent.services[0]?.price ?? 0),
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
      select: { code: true },
    });
    if (!service && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(dto.serviceId)) {
      throw new NotFoundException('Attestation service was not found');
    }
    const serviceFilter = service
      ? { code: service.code }
      : { id: dto.serviceId, isCustom: true };

    const agent = await this.prisma.agentProfile.findFirst({
      where: {
        id: dto.agentId,
        status: 'APPROVED',
        isOpen: true,
        services: {
          some: { ...serviceFilter, enabled: true, reviewStatus: 'APPROVED' },
        },
      },
      select: {
        id: true,
        userId: true,
        businessName: true,
        services: {
          where: { ...serviceFilter, enabled: true, reviewStatus: 'APPROVED' },
          select: { code: true, name: true, price: true, estimatedDays: true },
        },
      },
    });
    const offer = agent?.services[0];
    if (!agent || !offer) {
      throw new BadRequestException('This agent is not available for the selected service');
    }

    const pickupScheduledAt = new Date(`${dto.pickupDate}T00:00:00.000Z`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (pickupScheduledAt < today) {
      throw new BadRequestException('Pickup date must be today or later');
    }

    const quote = await this.catalogue.quote(
      offer.code,
      dto.pickupDistanceKm,
      dto.returnDistanceKm,
      dto.express,
      Number(offer.price),
    );
    const estimatedReadyAt = new Date(pickupScheduledAt);
    estimatedReadyAt.setUTCDate(estimatedReadyAt.getUTCDate() + offer.estimatedDays);
    const id = randomUUID();
    const reference = `AT-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    const booking = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.attestationJob.create({
        data: {
          id,
          reference,
          agentId: agent.id,
          customerId: request.user.id,
          serviceCode: offer.code,
          serviceName: offer.name,
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
            serviceName: offer.name,
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
      await transaction.notification.create({
        data: {
          id: randomUUID(),
          userId: agent.userId,
          title: 'New attestation booking',
          body: `Booking ${reference} (${offer.name}) has pickup scheduled for ${dto.pickupDate}, ${dto.pickupSlot}.`,
          createdAt: new Date(),
        },
      });
      return created;
    });

    return { data: booking };
  }

  @Post('me/jobs/:id/cancel')
  @UseGuards(AuthGuard('jwt'))
  async cancelBooking(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: { user: { id: string } },
  ) {
    const job = await this.prisma.attestationJob.findFirst({
      where: { id, customerId: request.user.id },
      include: { agent: { select: { userId: true } } },
    });
    if (!job) throw new NotFoundException('Booking was not found');
    const cancelled = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.attestationJob.updateMany({
        where: { id, customerId: request.user.id, status: 'PICKUP_SCHEDULED' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      if (updated.count !== 1) return false;
      await transaction.custodyEvent.create({
        data: { id: randomUUID(), jobId: id, eventType: 'CANCELLED', actorId: request.user.id, note: 'Cancelled by customer before collection' },
      });
      await transaction.notification.create({
        data: {
          id: randomUUID(),
          userId: job.agent.userId,
          title: 'Booking cancelled',
          body: `The customer cancelled attestation booking ${job.reference} before collection.`,
          createdAt: new Date(),
        },
      });
      return true;
    });
    if (!cancelled) {
      throw new ConflictException('This booking can no longer be cancelled because the documents have been collected. Contact support for help.');
    }
    return { data: { id, reference: job.reference, status: 'CANCELLED' } };
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
