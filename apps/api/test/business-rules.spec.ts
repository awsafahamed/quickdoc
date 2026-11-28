import { BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../src/auth/auth.service';
import { OrderMaintenanceService } from '../src/orders/order-maintenance.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RidersController } from '../src/riders/riders.controller';
import { ShopPortalController } from '../src/shops/shop-portal.controller';
import { PrivateObjectStorageService } from '../src/storage/private-object-storage.service';

const riderRequest = { user: { id: 'rider-id', roles: ['RIDER'] } };

function txMock() {
  return {
    order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    deliveryStatusHistory: { deleteMany: jest.fn() },
    deliveryAssignment: { delete: jest.fn() },
    deliveryOffer: { updateMany: jest.fn(), createMany: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
    riderProfile: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { createMany: jest.fn() },
    payment: { updateMany: jest.fn() },
  };
}

describe('rider release before pickup', () => {
  function setup(status: string) {
    const tx = txMock();
    const prisma = {
      riderProfile: { findUnique: jest.fn().mockResolvedValue({ userId: 'rider-id', status: 'APPROVED' }) },
      deliveryAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'assignment-id',
          orderId: 'order-id',
          Order: { id: 'order-id', reference: 'PR-1', status, customerId: 'customer-id', deliveryFee: 20, Shop: { ownerId: 'owner-id', latitude: 0, longitude: 0 } },
        }),
      },
      $transaction: jest.fn((callback: (t: typeof tx) => unknown) => callback(tx)),
    };
    return { tx, prisma, controller: new RidersController(prisma as unknown as PrismaService) };
  }

  it('returns the order to the ready queue and re-offers it without the releasing rider', async () => {
    const { tx, controller } = setup('RIDER_ASSIGNED');
    const result = await controller.release('assignment-id', { reason: 'Puncture' }, riderRequest);
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-id', status: 'RIDER_ASSIGNED' },
      data: { status: 'READY_FOR_PICKUP', pinAttempts: 0 },
    });
    expect(tx.deliveryAssignment.delete).toHaveBeenCalledWith({ where: { id: 'assignment-id' } });
    expect(tx.deliveryOffer.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { orderId: 'order-id', riderId: 'rider-id' },
      data: expect.objectContaining({ status: 'RELEASED' }),
    }));
    // Re-dispatch excludes riders who released or declined this order.
    expect(tx.riderProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ DeliveryOffer: { none: { orderId: 'order-id', status: { in: ['REJECTED', 'RELEASED'] } } } }),
    }));
    expect(tx.notification.createMany).toHaveBeenCalledTimes(2);
    expect(result.data.released).toBe(true);
  });

  it('cannot release once the documents have been picked up', async () => {
    const { prisma, controller } = setup('PICKED_UP');
    await expect(controller.release('assignment-id', {}, riderRequest)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not let a rider fail a delivery they never collected', async () => {
    const { prisma, controller } = setup('RIDER_ASSIGNED');
    await expect(controller.assignmentStatus('assignment-id', { status: 'FAILED', reason: 'No show' }, riderRequest))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('shop cancellation after acceptance', () => {
  function setup(status: string) {
    const tx = txMock();
    const prisma = {
      shop: { findFirst: jest.fn().mockResolvedValue({ id: 'shop-id', status: 'APPROVED' }) },
      order: {
        findFirst: jest.fn().mockResolvedValue({ id: 'order-id', reference: 'PR-1', status, customerId: 'customer-id' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'order-id', status: 'CANCELLED', OrderStatusHistory: [] }),
      },
      $transaction: jest.fn((callback: (t: typeof tx) => unknown) => callback(tx)),
    };
    return { tx, prisma, controller: new ShopPortalController(prisma as unknown as PrismaService, {} as PrivateObjectStorageService) };
  }

  it('cancels printing work with a reason, voids payment and tells the customer', async () => {
    const { tx, controller } = setup('PRINTING');
    await controller.transition({ user: { id: 'owner-id' } }, 'order-id', { status: 'CANCELLED', reason: 'Printer fault' });
    expect(tx.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: 'customer-id', title: 'Order cancelled' })],
    });
  });

  it('requires a reason', async () => {
    const { controller } = setup('ACCEPTED');
    await expect(controller.transition({ user: { id: 'owner-id' } }, 'order-id', { status: 'CANCELLED' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('cannot cancel once a rider is assigned', async () => {
    const { controller } = setup('RIDER_ASSIGNED');
    await expect(controller.transition({ user: { id: 'owner-id' } }, 'order-id', { status: 'CANCELLED', reason: 'x' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('orders a shop never accepts', () => {
  it('are cancelled after the acceptance window and the customer is told they were not charged', async () => {
    const tx = txMock();
    const prisma = {
      order: { findMany: jest.fn().mockResolvedValue([{ id: 'order-id', reference: 'PR-1', customerId: 'customer-id', Shop: { ownerId: 'owner-id' } }]) },
      $transaction: jest.fn((callback: (t: typeof tx) => unknown) => callback(tx)),
    };
    const service = new OrderMaintenanceService(prisma as unknown as PrismaService, {} as PrivateObjectStorageService);
    const now = new Date('2026-11-28T12:00:00Z');
    await expect(service.cancelUnacceptedOrders(now)).resolves.toBe(1);
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'PENDING_ACCEPTANCE', createdAt: { lte: new Date('2026-11-27T12:00:00Z') } },
    }));
    expect(tx.order.updateMany).toHaveBeenCalledWith({ where: { id: 'order-id', status: 'PENDING_ACCEPTANCE' }, data: { status: 'CANCELLED' } });
    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: 'customer-id', body: expect.stringContaining('not been charged') })],
    });
  });
});

describe('changing a password', () => {
  async function setup(currentPassword: string) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-id', email: 'a@example.com', suspended: false, passwordHash: await bcrypt.hash(currentPassword, 4), UserRole: [{ role: 'CUSTOMER' }] }),
        update: jest.fn(),
      },
      refreshSession: { updateMany: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('token') } as unknown as JwtService;
    return { prisma, auth: new AuthService(prisma as unknown as PrismaService, jwt) };
  }

  it('requires the current password', async () => {
    const { auth, prisma } = await setup('Correct-Horse-9');
    await expect(auth.changePassword('user-id', { currentPassword: 'wrong', newPassword: 'New-Password-1' })).rejects.toThrow('not correct');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('updates the hash, signs out other sessions and returns a new session', async () => {
    const { auth, prisma } = await setup('Correct-Horse-9');
    const session = await auth.changePassword('user-id', { currentPassword: 'Correct-Horse-9', newPassword: 'New-Password-1' });
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({ where: { userId: 'user-id', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(session.accessToken).toBe('token');
  });
});
