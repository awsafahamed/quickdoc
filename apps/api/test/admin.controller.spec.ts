import { ForbiddenException } from '@nestjs/common';
import { AdminController } from '../src/admin/admin.controller';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AdminController rider approval', () => {
  it('denies rider approval to non-admin users', async () => {
    const prisma = {
      riderProfile: { update: jest.fn() },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const controller = new AdminController(prisma);

    await expect(controller.riderStatus(
      'rider-id',
      { status: 'APPROVED' },
      { user: { id: 'rider-id', roles: ['RIDER'] } },
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records the administrator and status change atomically', async () => {
    const transaction = {
      riderProfile: { update: jest.fn().mockResolvedValue({ userId: 'rider-id', status: 'APPROVED' }) },
      riderAvailability: { updateMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    } as unknown as PrismaService;
    const controller = new AdminController(prisma);

    await controller.riderStatus(
      'rider-id',
      { status: 'APPROVED' },
      { user: { id: 'admin-id', roles: ['ADMIN'] } },
    );

    expect(transaction.riderProfile.update).toHaveBeenCalledWith({
      where: { userId: 'rider-id' },
      data: { status: 'APPROVED' },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin-id',
        action: 'RIDER_STATUS_APPROVED',
        entityId: 'rider-id',
      }),
    });
  });
});
