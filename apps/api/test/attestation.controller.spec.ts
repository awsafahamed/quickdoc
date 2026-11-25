import { BadRequestException } from '@nestjs/common';
import { AttestationController } from '../src/attestation/attestation.controller';
import { AttestationCatalogService } from '../src/attestation/attestation-catalog.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AttestationController customer bookings', () => {
  const service = {
    code: 'degree',
    estimatedDays: 7,
    serviceFee: 180,
  };
  const quote = {
    serviceFee: 180,
    pickupDelivery: 15,
    returnDelivery: 15,
    expressFee: 0,
    tax: 10.5,
    total: 220.5,
    currency: 'LKR' as const,
    quoteId: 'quote-id',
    expiresAt: '2030-01-01T00:00:00.000Z',
  };
  const bookingDto = {
    serviceId: 'degree',
    agentId: '2c934451-c99d-46c9-9384-89baac116c34',
    pickupAddress: '10 Main Street, Colombo',
    returnAddress: '22 Park Road, Colombo',
    pickupDate: '2030-01-01',
    pickupSlot: '09:00-12:00',
    pickupDistanceKm: 5,
    returnDistanceKm: 5,
    express: false,
  };

  it('creates a customer-owned booking with a server-calculated quote and custody event', async () => {
    const createdBooking = {
      reference: 'AT-12345678',
      status: 'PICKUP_SCHEDULED',
      quotedTotal: 220.5,
    };
    const transaction = {
      attestationJob: {
        create: jest.fn().mockImplementation(({ data }: { data: { id: string } }) =>
          Promise.resolve({ ...createdBooking, id: data.id })),
      },
      custodyEvent: { create: jest.fn().mockResolvedValue({ id: 'event-id' }) },
    };
    const prisma = {
      platformCatalogService: {
        findFirst: jest.fn().mockResolvedValue(service),
      },
      agentProfile: {
        findFirst: jest.fn().mockResolvedValue({ id: bookingDto.agentId }),
      },
      platformPricingRule: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    };
    const catalogue = { quote: jest.fn().mockResolvedValue(quote) } as unknown as AttestationCatalogService;
    const controller = new AttestationController(catalogue, prisma as unknown as PrismaService);

    const result = await controller.createBooking(
      { user: { id: 'customer-id' } },
      bookingDto,
    );

    expect(catalogue.quote).toHaveBeenCalledWith('degree', 5, 5, false);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.attestationJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        customerId: 'customer-id',
        agentId: bookingDto.agentId,
        quotedTotal: quote.total,
        status: 'PICKUP_SCHEDULED',
      }),
      include: { agent: { select: { businessName: true } } },
    }));
    expect(transaction.custodyEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        jobId: transaction.attestationJob.create.mock.calls[0][0].data.id,
        eventType: 'BOOKED',
        actorId: 'customer-id',
      }),
    }));
    expect(result.data).toMatchObject({
      ...createdBooking,
      id: transaction.attestationJob.create.mock.calls[0][0].data.id,
    });
  });

  it('rejects booking if the selected agent is no longer eligible', async () => {
    const prisma = {
      platformCatalogService: {
        findFirst: jest.fn().mockResolvedValue(service),
      },
      agentProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const catalogue = { quote: jest.fn() } as unknown as AttestationCatalogService;
    const controller = new AttestationController(catalogue, prisma as unknown as PrismaService);

    await expect(controller.createBooking(
      { user: { id: 'customer-id' } },
      bookingDto,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(catalogue.quote).not.toHaveBeenCalled();
  });
});
