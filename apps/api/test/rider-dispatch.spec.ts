import { ConflictException } from '@nestjs/common';
import { ShopPortalController } from '../src/shops/shop-portal.controller';
import { RidersController } from '../src/riders/riders.controller';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrivateObjectStorageService } from '../src/storage/private-object-storage.service';

describe('nearby rider dispatch', () => {
  it('creates offers and in-app notifications for eligible riders within eight kilometres', async () => {
    const transaction = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      orderStatusHistory: { create: jest.fn() },
      riderProfile: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'near-rider', RiderAvailability: { latitude: 0.02, longitude: 0 } },
          { userId: 'far-rider', RiderAvailability: { latitude: 0.09, longitude: 0 } },
        ]),
      },
      deliveryOffer: { createMany: jest.fn() },
      notification: { createMany: jest.fn() },
    };
    const prisma = {
      shop: { findFirst: jest.fn().mockResolvedValue({ id: 'shop-id', latitude: 0, longitude: 0 }) },
      order: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'order-id',
          reference: 'PR-123',
          status: 'PRINTING',
          deliveryFee: 250,
        }),
        findUnique: jest.fn().mockResolvedValue({ id: 'order-id', status: 'READY_FOR_PICKUP' }),
      },
      $transaction: jest.fn((callback: (tx: typeof transaction) => Promise<number>) => callback(transaction)),
    } as unknown as PrismaService;
    const controller = new ShopPortalController(
      prisma,
      {} as PrivateObjectStorageService,
    );

    const result = await controller.transition(
      { user: { id: 'shop-owner' } },
      'order-id',
      { status: 'READY_FOR_PICKUP' },
    );

    expect(result.notifiedRiders).toBe(1);
    expect(transaction.deliveryOffer.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ riderId: 'near-rider', orderId: 'order-id', earnings: 250 })],
    });
    expect(transaction.notification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: 'near-rider', title: 'Nearby delivery available' })],
    });
  });
});

describe('rider offer acceptance', () => {
  const riderRequest = { user: { id: 'rider-id', roles: ['RIDER'] } };

  it('atomically assigns the order to the first rider who accepts', async () => {
    const assignment = { id: 'assignment-id', orderId: 'order-id', riderId: 'rider-id' };
    const transaction = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      deliveryOffer: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      deliveryAssignment: { create: jest.fn().mockResolvedValue(assignment) },
      deliveryStatusHistory: { create: jest.fn() },
      orderStatusHistory: { create: jest.fn() },
      notification: { createMany: jest.fn() },
    };
    const prisma = {
      riderProfile: { findUnique: jest.fn().mockResolvedValue({ userId: 'rider-id', status: 'APPROVED' }) },
      deliveryOffer: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'offer-id',
          orderId: 'order-id',
          riderId: 'rider-id',
          earnings: 250,
          Order: {
            customerId: 'customer-id',
            reference: 'PR-123',
            Shop: { ownerId: 'shop-owner-id' },
          },
        }),
      },
      $transaction: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    } as unknown as PrismaService;
    const controller = new RidersController(prisma);

    const result = await controller.acceptOffer('offer-id', riderRequest);

    expect(result.data).toEqual(assignment);
    expect(transaction.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-id', status: 'READY_FOR_PICKUP' },
      data: { status: 'RIDER_ASSIGNED' },
    });
    expect(transaction.deliveryAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: 'order-id', riderId: 'rider-id', earnings: 250 }),
    });
    expect(transaction.deliveryOffer.updateMany).toHaveBeenCalledTimes(2);
  });

  it('does not assign an order when another rider has already claimed it', async () => {
    const transaction = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      deliveryOffer: { updateMany: jest.fn() },
      deliveryAssignment: { create: jest.fn() },
      deliveryStatusHistory: { create: jest.fn() },
      orderStatusHistory: { create: jest.fn() },
      notification: { createMany: jest.fn() },
    };
    const prisma = {
      riderProfile: { findUnique: jest.fn().mockResolvedValue({ userId: 'rider-id', status: 'APPROVED' }) },
      deliveryOffer: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'offer-id',
          orderId: 'order-id',
          riderId: 'rider-id',
          Order: { customerId: 'customer-id', reference: 'PR-123', Shop: { ownerId: 'shop-owner-id' } },
        }),
      },
      $transaction: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    } as unknown as PrismaService;
    const controller = new RidersController(prisma);

    await expect(controller.acceptOffer('offer-id', riderRequest))
      .rejects.toBeInstanceOf(ConflictException);
    expect(transaction.deliveryAssignment.create).not.toHaveBeenCalled();
  });
});
