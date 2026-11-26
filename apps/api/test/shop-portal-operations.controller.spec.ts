import { NotFoundException } from '@nestjs/common';
import { ShopPortalOperationsController } from '../src/shops/shop-portal-operations.controller';
import { PrismaService } from '../src/prisma/prisma.service';

describe('shop portal operations', () => {
  it('creates inventory under the authenticated owner\'s shop', async () => {
    const prisma = {
      shop: { findFirst: jest.fn().mockResolvedValue({ id: 'shop-id', ownerId: 'owner-id' }) },
      shopInventoryItem: { create: jest.fn().mockResolvedValue({ id: 'item-id' }) },
    } as unknown as PrismaService;
    const controller = new ShopPortalOperationsController(prisma);

    await controller.createInventoryItem(
      { user: { id: 'owner-id' } },
      { name: 'A4 paper', category: 'Paper', unit: 'sheets', quantity: 500, reorderLevel: 100 },
    );

    expect(prisma.shop.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ ownerId: 'owner-id' }, { staff: { some: { userId: 'owner-id' } } }] },
    });
    expect(prisma.shopInventoryItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ shopId: 'shop-id', name: 'A4 paper', quantity: 500 }),
    }));
  });

  it('does not delete an inventory item outside the authenticated shop', async () => {
    const prisma = {
      shop: { findFirst: jest.fn().mockResolvedValue({ id: 'shop-id', ownerId: 'owner-id' }) },
      shopInventoryItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as PrismaService;
    const controller = new ShopPortalOperationsController(prisma);

    await expect(controller.deleteInventoryItem(
      { user: { id: 'owner-id' } },
      'other-shop-item',
    )).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.shopInventoryItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 'other-shop-item', shopId: 'shop-id' },
    });
  });

  it('returns real order aggregates with bounded customer records', async () => {
    const lastOrder = new Date('2026-11-25T10:00:00Z');
    const prisma = {
      shop: { findFirst: jest.fn().mockResolvedValue({ id: 'shop-id', ownerId: 'owner-id' }) },
      order: {
        groupBy: jest.fn().mockResolvedValue([
          { customerId: 'customer-1', _count: { _all: 4 }, _sum: { total: 240 }, _max: { createdAt: lastOrder } },
          { customerId: 'customer-2', _count: { _all: 2 }, _sum: { total: 80 }, _max: { createdAt: lastOrder } },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'customer-2', name: 'Jamie Example', email: 'jamie@example.com', CustomerProfile: { phone: null } },
        ]),
      },
    } as unknown as PrismaService;
    const controller = new ShopPortalOperationsController(prisma);

    const result = await controller.customers(
      { user: { id: 'owner-id' } },
      { page: 2, pageSize: 1 },
    );

    expect(result).toEqual({
      data: [{
        id: 'customer-2',
        name: 'Jamie Example',
        email: 'jamie@example.com',
        phone: null,
        orderCount: 2,
        lifetimeValue: 80,
        lastOrderAt: lastOrder,
      }],
      pagination: { page: 2, pageSize: 1, total: 2, totalPages: 2 },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['customer-2'] } },
      select: expect.not.objectContaining({ passwordHash: true }),
    }));
  });
});
