import { CustomerController } from '../src/customer/customer.controller';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrintPricingService } from '../src/print/print-pricing.service';
import { PrivateObjectStorageService } from '../src/storage/private-object-storage.service';
import { DeliverySpeed, PrintColour, PrintPaperSize, PrintSides } from '../src/print/print.types';

describe('CustomerController private documents', () => {
  it('copies a currently published catalogue document into the signed-in customer’s document library', async () => {
    const catalogDocument = {
      id: 'catalog-document-id',
      name: 'Grade 10 mathematics.pdf',
      objectKey: 'private/shops/shop-id/catalog-document.pdf',
      sizeBytes: 1200,
      pageCount: 8,
    };
    const createdDocument = {
      id: 'customer-document-id',
      userId: 'customer-id',
      name: catalogDocument.name,
      objectKey: 'private/customers/customer-id/selected-document.pdf',
    };
    const prisma = {
      shopCatalogDocument: { findFirst: jest.fn().mockResolvedValue(catalogDocument) },
      document: { create: jest.fn().mockResolvedValue(createdDocument) },
    } as unknown as PrismaService;
    const storage = {
      copyCatalogPdfToCustomer: jest.fn().mockResolvedValue(undefined),
    } as unknown as PrivateObjectStorageService;
    const controller = new CustomerController(prisma, {} as PrintPricingService, storage);

    const result = await controller.selectCatalogDocument('catalog-document-id', { user: { id: 'customer-id' } });

    expect(prisma.shopCatalogDocument.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'catalog-document-id',
        isPublished: true,
        shop: { status: 'APPROVED', isOpen: true },
      },
    });
    expect(storage.copyCatalogPdfToCustomer).toHaveBeenCalledWith(
      catalogDocument.objectKey,
      expect.stringMatching(/^private\/customers\/customer-id\/[0-9a-f-]+\.pdf$/),
    );
    expect(prisma.document.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'customer-id',
        name: catalogDocument.name,
        mimeType: 'application/pdf',
      }),
    }));
    expect(result.data).toBe(createdDocument);
  });

  it('removes the customer copy when persisting a selected catalogue document fails', async () => {
    const prisma = {
      shopCatalogDocument: {
        findFirst: jest.fn().mockResolvedValue({
          name: 'Grade 10 mathematics.pdf',
          objectKey: 'private/shops/shop-id/catalog-document.pdf',
          sizeBytes: 1200,
          pageCount: 8,
        }),
      },
      document: { create: jest.fn().mockRejectedValue(new Error('database unavailable')) },
    } as unknown as PrismaService;
    const storage = {
      copyCatalogPdfToCustomer: jest.fn().mockResolvedValue(undefined),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    } as unknown as PrivateObjectStorageService;
    const controller = new CustomerController(prisma, {} as PrintPricingService, storage);

    await expect(controller.selectCatalogDocument('catalog-document-id', { user: { id: 'customer-id' } }))
      .rejects.toThrow('database unavailable');

    expect(storage.deleteObject).toHaveBeenCalledWith(
      expect.stringMatching(/^private\/customers\/customer-id\/[0-9a-f-]+\.pdf$/),
    );
  });

  it('creates an upload URL inside the authenticated customer prefix', async () => {
    const storage = { createUploadUrl: jest.fn().mockResolvedValue('https://private-storage.test/upload') } as unknown as PrivateObjectStorageService;
    const controller = new CustomerController({} as PrismaService, {} as PrintPricingService, storage);

    const result = await controller.createDocumentUploadUrl(
      { user: { id: 'customer-id' } },
      { name: 'document.pdf', mimeType: 'application/pdf', sizeBytes: 1200 },
    );

    expect(result.data.objectKey).toMatch(/^private\/customers\/customer-id\/[0-9a-f-]+\.pdf$/);
    expect(storage.createUploadUrl).toHaveBeenCalledWith(result.data.objectKey);
    expect(result.data.expiresIn).toBe(300);
  });

  it('rejects document metadata for another customer object key', async () => {
    const storage = { verifyPdfUpload: jest.fn() } as unknown as PrivateObjectStorageService;
    const controller = new CustomerController({} as PrismaService, {} as PrintPricingService, storage);

    await expect(controller.createDocument(
      { user: { id: 'customer-id' } },
      {
        name: 'document.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1200,
        objectKey: 'private/customers/other-customer/document.pdf',
      },
    )).rejects.toThrow('Document upload key is invalid');
    expect(storage.verifyPdfUpload).not.toHaveBeenCalled();
  });
});

describe('CustomerController print orders', () => {
  it('uses the shared server pricing service for the persisted order total', async () => {
    const createdOrder = { id: 'order-id', total: 25 };
    const transaction = {
      order: { create: jest.fn().mockResolvedValue(createdOrder) },
      orderItem: { create: jest.fn() },
      orderStatusHistory: { create: jest.fn() },
    };
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(null) },
      shop: { findFirst: jest.fn().mockResolvedValue({ id: 'shop-id' }) },
      document: { findFirst: jest.fn().mockResolvedValue({ id: 'document-id', pageCount: 20 }) },
      $transaction: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    } as unknown as PrismaService;
    const quote = {
      printing: 12,
      finishing: 4,
      delivery: 10,
      express: 14,
      shopService: 2,
      shopServiceTotal: 8,
      shopServices: [{ code: 'premium-binding', name: 'Premium binding', price: 8 }],
      total: 52.5,
    };
    const pricing = { calculate: jest.fn().mockResolvedValue(quote) } as unknown as PrintPricingService;
    const storage = {} as PrivateObjectStorageService;
    const controller = new CustomerController(prisma, pricing, storage);

    await controller.createPrintOrder(
      { user: { id: 'customer-id' } },
      {
        shopId: 'shop-id',
        documentId: 'document-id',
        paperSize: PrintPaperSize.A4,
        colour: false,
        duplex: true,
        copies: 1,
        printedSides: 20,
        binding: true,
        stapling: true,
        lamination: true,
        deliverySpeed: DeliverySpeed.EXPRESS,
        deliveryDistanceKm: 5,
        shopServiceCodes: ['premium-binding'],
        deliveryAddress: '123 Test Street',
        clientKey: 'client-key',
      },
    );

    expect(pricing.calculate).toHaveBeenCalledWith({
      pageCount: 20,
      copies: 1,
      paperSize: PrintPaperSize.A4,
      colour: PrintColour.BLACK_WHITE,
      sides: PrintSides.DUPLEX,
      binding: true,
      stapling: true,
      lamination: true,
      deliverySpeed: DeliverySpeed.EXPRESS,
      deliveryDistanceKm: 5,
      shopId: 'shop-id',
      shopServiceCodes: ['premium-binding'],
    });
    expect(transaction.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        printSubtotal: 24,
        deliveryFee: 24,
        platformFee: 4.5,
        total: 52.5,
        shopServiceSnapshot: [{ code: 'premium-binding', name: 'Premium binding', price: 8 }],
      }),
    }));
    expect(transaction.orderItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ binding: 'BINDING', stapling: true, lamination: true }),
    }));
  });
});

describe('CustomerController delivery confirmation', () => {
  it('completes only the signed-in customer’s delivered order and notifies the shop and rider', async () => {
    const transaction = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      orderStatusHistory: { create: jest.fn() },
      notification: { createMany: jest.fn() },
    };
    const prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'order-id',
          reference: 'PR-123',
          status: 'DELIVERED',
          customerId: 'customer-id',
          Shop: { ownerId: 'shop-owner-id' },
          DeliveryAssignment: { riderId: 'rider-id' },
        }),
      },
      $transaction: jest.fn((callback: (tx: typeof transaction) => Promise<void>) => callback(transaction)),
    } as unknown as PrismaService;
    const controller = new CustomerController(prisma, {} as PrintPricingService, {} as PrivateObjectStorageService);

    const result = await controller.confirmDelivery('order-id', { user: { id: 'customer-id' } });

    expect(prisma.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'order-id', customerId: 'customer-id' },
    }));
    expect(transaction.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-id', customerId: 'customer-id', status: 'DELIVERED' },
      data: { status: 'COMPLETED' },
    });
    expect(transaction.notification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: 'shop-owner-id', title: 'Delivery confirmed' }),
        expect.objectContaining({ userId: 'rider-id', title: 'Delivery confirmed' }),
      ]),
    });
    expect(result.data.status).toBe('COMPLETED');
  });

  it('rejects confirmation before the order reaches delivered status', async () => {
    const prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue({ id: 'order-id', status: 'OUT_FOR_DELIVERY' }),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const controller = new CustomerController(prisma, {} as PrintPricingService, {} as PrivateObjectStorageService);

    await expect(controller.confirmDelivery('order-id', { user: { id: 'customer-id' } }))
      .rejects.toThrow('Only a delivered order can be confirmed');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
