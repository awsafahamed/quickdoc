import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RidersController } from '../src/riders/riders.controller';
import { PrismaService } from '../src/prisma/prisma.service';

describe('RidersController', () => {
  const prisma = {
    order: { updateMany: jest.fn() },
    riderProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    deliveryAssignment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    deliveryStatusHistory: {
      create: jest.fn(),
    },
    riderAvailability: {
      upsert: jest.fn(),
    },
    settlement: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const controller = new RidersController(prisma as unknown as PrismaService);
  const riderRequest = { user: { id: 'rider-id', roles: ['RIDER'] } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects customer access to rider endpoints', async () => {
    await expect(
      controller.register(
        { user: { id: 'customer-id', roles: ['CUSTOMER'] } },
        { phone: '+94701234567', vehicleType: 'BIKE' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.riderProfile.upsert).not.toHaveBeenCalled();
  });

  it('creates rider applications as pending and does not change approval on profile updates', async () => {
    prisma.riderProfile.upsert.mockResolvedValue({ userId: 'rider-id', status: 'PENDING' });

    await controller.register(riderRequest, {
      phone: '+94701234567',
      vehicleType: 'BIKE',
    });

    expect(prisma.riderProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: 'PENDING' }),
      update: expect.not.objectContaining({ status: expect.anything() }),
    }));
  });

  it('does not expose assignments until the rider is approved', async () => {
    prisma.riderProfile.findUnique.mockResolvedValue({
      userId: 'rider-id',
      status: 'PENDING',
    });

    await expect(controller.assignments(riderRequest))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.deliveryAssignment.findMany).not.toHaveBeenCalled();
  });

  it('scopes assignments to the authenticated rider and selects only delivery data', async () => {
    prisma.riderProfile.findUnique.mockResolvedValue({
      userId: 'rider-id',
      status: 'APPROVED',
    });
    prisma.deliveryAssignment.findMany.mockResolvedValue([]);

    await controller.assignments(riderRequest);

    expect(prisma.deliveryAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { riderId: 'rider-id' },
    }));
    const orderSelect = prisma.deliveryAssignment.findMany.mock.calls[0][0].select.Order.select;
    expect(orderSelect).toEqual(expect.objectContaining({ id: true, reference: true, status: true, deliveryAddress: true }));
    // Riders must never receive the handover codes they are asked to collect in person.
    for (const secret of ['deliveryPinHash', 'pickupCodeHash', 'deliveryPinEncrypted', 'pickupCodeEncrypted']) {
      expect(orderSelect).not.toHaveProperty(secret);
    }
  });

  it('locks the handover code after repeated wrong guesses', async () => {
    prisma.riderProfile.findUnique.mockResolvedValue({ userId: 'rider-id', status: 'APPROVED' });
    prisma.deliveryAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
      orderId: 'order-id',
      riderId: 'rider-id',
      Order: { id: 'order-id', status: 'OUT_FOR_DELIVERY', deliveryPinHash: '0'.repeat(64), pinAttempts: 5 },
    });

    await expect(controller.assignmentStatus('assignment-id', { status: 'DELIVERED', handoverCode: 'ABCDEF' }, riderRequest))
      .rejects.toThrow('Too many incorrect codes');
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('counts a wrong guess against the order and reports remaining attempts', async () => {
    prisma.riderProfile.findUnique.mockResolvedValue({ userId: 'rider-id', status: 'APPROVED' });
    prisma.deliveryAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
      orderId: 'order-id',
      riderId: 'rider-id',
      Order: { id: 'order-id', status: 'OUT_FOR_DELIVERY', deliveryPinHash: '0'.repeat(64), pinAttempts: 1 },
    });
    prisma.order.updateMany.mockResolvedValue({ count: 1 });

    await expect(controller.assignmentStatus('assignment-id', { status: 'DELIVERED', handoverCode: 'ABCDEF' }, riderRequest))
      .rejects.toThrow('3 attempts remaining');
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-id', pinAttempts: { lt: 5 } },
      data: { pinAttempts: { increment: 1 } },
    });
  });

  it('does not accept a client-asserted handover verification', async () => {
    prisma.riderProfile.findUnique.mockResolvedValue({
      userId: 'rider-id',
      status: 'APPROVED',
    });
    prisma.deliveryAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
      orderId: 'order-id',
      riderId: 'rider-id',
      Order: {
        id: 'order-id',
        status: 'OUT_FOR_DELIVERY',
        deliveryPinHash: '0'.repeat(64),
        pinAttempts: 0,
      },
    });

    await expect(controller.assignmentStatus(
      'assignment-id',
      { status: 'DELIVERED' },
      riderRequest,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records delivery only when the stored handover code matches', async () => {
    const code = 'A1B2C3';
    const transaction = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      deliveryStatusHistory: { create: jest.fn().mockResolvedValue({ status: 'DELIVERED' }) },
      orderStatusHistory: { create: jest.fn() },
      payment: { updateMany: jest.fn() },
      notification: { createMany: jest.fn() },
    };
    prisma.riderProfile.findUnique.mockResolvedValue({
      userId: 'rider-id',
      status: 'APPROVED',
    });
    prisma.deliveryAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
      orderId: 'order-id',
      riderId: 'rider-id',
      Order: {
        id: 'order-id',
        status: 'OUT_FOR_DELIVERY',
        deliveryPinHash: createHash('sha256').update(code).digest('hex'),
        pinAttempts: 0,
      },
    });
    prisma.$transaction.mockImplementation((callback) => callback(transaction));

    await controller.assignmentStatus(
      'assignment-id',
      { status: 'DELIVERED', handoverCode: code },
      riderRequest,
    );

    expect(transaction.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-id', status: { in: ['OUT_FOR_DELIVERY'] } },
      data: { status: 'DELIVERED', pinAttempts: 0 },
    });
    expect(transaction.payment.updateMany).toHaveBeenCalledWith({
      where: { orderId: 'order-id', method: 'CASH_ON_DELIVERY', status: 'PENDING' },
      data: expect.objectContaining({ status: 'PAID' }),
    });
    expect(transaction.orderStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-id',
        status: 'DELIVERED',
        actorId: 'rider-id',
      }),
    });
  });
});
