import { ForbiddenException } from '@nestjs/common';
import { AdminGuard } from '../src/auth/admin.guard';
import { ShopsAdminController } from '../src/shops/shops-admin.controller';
import { PrismaService } from '../src/prisma/prisma.service';

describe('shop administration authorization', () => {
  it('allows shop registration only for the authenticated shop owner and ignores body owner IDs', async () => {
    const prisma = {
      shop: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'shop-id' }),
      },
    } as unknown as PrismaService;
    const controller = new ShopsAdminController(prisma);
    const body = {
      ownerId: 'other-user',
      name: 'Print House',
      phone: '+94123456789',
      email: 'shop@example.com',
      address: 'Main Street',
      latitude: 6.9,
      longitude: 79.8,
    };

    await controller.register(
      { user: { id: 'authenticated-owner', roles: ['SHOP_OWNER'] } },
      body,
    );

    expect(prisma.shop.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ownerId: 'authenticated-owner' }),
    });
    expect(prisma.shop.findFirst).toHaveBeenCalledWith({ where: { ownerId: 'authenticated-owner' } });
  });

  it('rejects shop registration for accounts without the shop-owner role', async () => {
    const controller = new ShopsAdminController({} as PrismaService);
    await expect(controller.register(
      { user: { id: 'customer-id', roles: ['CUSTOMER'] } },
      {
        name: 'Print House',
        phone: '+94123456789',
        email: 'shop@example.com',
        address: 'Main Street',
        latitude: 6.9,
        longitude: 79.8,
      },
    )).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires an administrator for management endpoints', () => {
    const guard = new AdminGuard();
    const context = (roles: string[]) => ({
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as never;

    expect(guard.canActivate(context(['ADMIN']))).toBe(true);
    expect(() => guard.canActivate(context(['SHOP_OWNER']))).toThrow(ForbiddenException);
  });
});
