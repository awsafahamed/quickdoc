import { BadRequestException } from '@nestjs/common';
import { ShopPortalController } from '../src/shops/shop-portal.controller';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrivateObjectStorageService } from '../src/storage/private-object-storage.service';

describe('shop staff role assignment', () => {
  it('does not grant shop-owner access to an existing customer', async () => {
    const prisma = {
      shop: { findFirst: jest.fn().mockResolvedValue({ id: 'shop-id' }) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'customer-id',
          UserRole: [{ role: 'CUSTOMER' }],
        }),
      },
      shopStaff: { create: jest.fn() },
    } as unknown as PrismaService;
    const storage = { createPreviewUrl: jest.fn() } as unknown as PrivateObjectStorageService;
    const controller = new ShopPortalController(prisma, storage);

    await expect(controller.addStaff(
      { user: { id: 'owner-id' } },
      { email: 'customer@example.com' },
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.shopStaff.create).not.toHaveBeenCalled();
  });
});

describe('shop order document previews', () => {
  it('signs a preview URL only for a document attached to this shop order', async () => {
    const document = { objectKey: 'private/customers/customer-id/file.pdf', name: 'file.pdf' };
    const prisma = {
      shop: { findFirst: jest.fn().mockResolvedValue({ id: 'shop-id' }) },
      order: { findFirst: jest.fn().mockResolvedValue({ OrderItem: [{ Document: document }] }) },
    } as unknown as PrismaService;
    const storage = { createPreviewUrl: jest.fn().mockResolvedValue('https://private-storage.test/preview') } as unknown as PrivateObjectStorageService;
    const controller = new ShopPortalController(prisma, storage);

    const result = await controller.orderDocumentPreviewUrl(
      { user: { id: 'owner-id' } },
      'order-id',
      'document-id',
    );

    expect(prisma.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'order-id', shopId: 'shop-id' },
    }));
    expect(storage.createPreviewUrl).toHaveBeenCalledWith(document.objectKey, document.name);
    expect(result.data.previewUrl).toBe('https://private-storage.test/preview');
  });

  it('does not create a preview URL when the document is not on the shop order', async () => {
    const prisma = {
      shop: { findFirst: jest.fn().mockResolvedValue({ id: 'shop-id' }) },
      order: { findFirst: jest.fn().mockResolvedValue({ OrderItem: [] }) },
    } as unknown as PrismaService;
    const storage = { createPreviewUrl: jest.fn() } as unknown as PrivateObjectStorageService;
    const controller = new ShopPortalController(prisma, storage);

    await expect(controller.orderDocumentPreviewUrl(
      { user: { id: 'owner-id' } },
      'order-id',
      'other-document-id',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.createPreviewUrl).not.toHaveBeenCalled();
  });
});
