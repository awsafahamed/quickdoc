import { NotFoundException } from '@nestjs/common';
import { ShopSupportController } from '../src/shops/shop-support.controller';
import { PrismaService } from '../src/prisma/prisma.service';
import { SupportService } from '../src/support/support.service';

describe('shop support access', () => {
  it('lists tickets only after verifying the caller belongs to a shop', async () => {
    const prisma = {
      shop: {
        findFirst: jest.fn().mockResolvedValue({ id: 'shop-id' }),
      },
    } as unknown as PrismaService;
    const support = {
      listCustomerTickets: jest.fn().mockResolvedValue([]),
    } as unknown as SupportService;
    const controller = new ShopSupportController(prisma, support);

    await controller.list({ user: { id: 'owner-id' } });

    expect(prisma.shop.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ ownerId: 'owner-id' }, { staff: { some: { userId: 'owner-id' } } }] },
      select: { id: true },
    });
    expect(support.listCustomerTickets).toHaveBeenCalledWith('owner-id');
  });

  it('does not expose support tickets to an account without a shop membership', async () => {
    const prisma = {
      shop: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const support = {
      listCustomerTickets: jest.fn(),
    } as unknown as SupportService;
    const controller = new ShopSupportController(prisma, support);

    await expect(controller.list({ user: { id: 'unlinked-id' } })).rejects.toBeInstanceOf(NotFoundException);
    expect(support.listCustomerTickets).not.toHaveBeenCalled();
  });
});
