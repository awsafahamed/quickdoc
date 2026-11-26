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

  describe('AdminController provider service moderation', () => {
    it('approves only custom provider offers and audits the decision transactionally', async () => {
      const transaction = {
        shopService: {
          findUnique: jest.fn().mockResolvedValue({ id: 'offer-id', isCustom: true }),
          update: jest.fn().mockResolvedValue({ id: 'offer-id', reviewStatus: 'APPROVED' }),
        },
        auditLog: { create: jest.fn() },
      };
      const prisma = {
        $transaction: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
      } as unknown as PrismaService;
      const controller = new AdminController(prisma);

      await controller.reviewProviderService(
        'shops',
        'offer-id',
        { status: 'APPROVED' },
        { user: { id: 'admin-id', roles: ['ADMIN'] } },
      );

      expect(transaction.shopService.update).toHaveBeenCalledWith({
        where: { id: 'offer-id' },
        data: { reviewStatus: 'APPROVED' },
      });
      expect(transaction.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'admin-id',
          action: 'PROVIDER_SERVICE_APPROVED',
          entityId: 'offer-id',
        }),
      });
    });
  });

  describe('AdminController platform pricing', () => {
    it('rejects catalogue reads from non-admin users before querying data', async () => {
      const prisma = {
        platformCatalogService: { findMany: jest.fn() },
        platformPricingRule: { findMany: jest.fn() },
      } as unknown as PrismaService;
      const controller = new AdminController(prisma);

      await expect(controller.platformCatalog({
        user: { id: 'customer-id', roles: ['CUSTOMER'] },
      })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.platformCatalogService.findMany).not.toHaveBeenCalled();
    });

    it('records managed pricing changes in the same transaction', async () => {
      const updatedAt = new Date('2026-11-25T00:00:00Z');
      const transaction = {
        platformPricingRule: {
          update: jest.fn().mockResolvedValue({ key: 'BLACK_WHITE_RATE', amount: 0.75, updatedAt }),
        },
        auditLog: { create: jest.fn() },
      };
      const prisma = {
        $transaction: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
      } as unknown as PrismaService;
      const controller = new AdminController(prisma);

      await expect(controller.updatePlatformPricingRule(
        'BLACK_WHITE_RATE',
        { amount: 0.75 },
        { user: { id: 'admin-id', roles: ['ADMIN'] } },
      )).resolves.toEqual({
        data: { key: 'BLACK_WHITE_RATE', amount: 0.75, updatedAt },
      });

      expect(transaction.platformPricingRule.update).toHaveBeenCalledWith({
        where: { key: 'BLACK_WHITE_RATE' },
        data: { amount: 0.75, updatedAt: expect.any(Date) },
      });
      expect(transaction.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'admin-id',
          action: 'PLATFORM_PRICING_RULE_UPDATED',
          entityId: 'BLACK_WHITE_RATE',
        }),
      });
    });
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
      select: { userId: true, status: true },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin-id',
        action: 'RIDER_STATUS_APPROVED',
        entityId: 'rider-id',
      }),
    });
  });

  it('returns paginated customer data without credential fields', async () => {
    const records = [{
      id: 'customer-id',
      name: 'Customer',
      email: 'customer@example.com',
      suspended: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      UserRole: [{ role: 'CUSTOMER' }],
      CustomerProfile: { phone: '+94770000000' },
      _count: { orders: 2 },
    }];
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue(records),
        count: jest.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaService;
    const controller = new AdminController(prisma);

    const result = await controller.users(
      { page: 1, pageSize: 50 },
      { user: { id: 'admin-id', roles: ['ADMIN'] } },
    );

    expect(result).toEqual({
      data: records,
      pagination: { page: 1, pageSize: 50, total: 1, pageCount: 1 },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.not.objectContaining({ passwordHash: true }),
      skip: 0,
      take: 50,
    }));
  });
});
