import { CustomerController } from '../src/customer/customer.controller';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrintPricingService } from '../src/print/print-pricing.service';
import { PrivateObjectStorageService } from '../src/storage/private-object-storage.service';
import { DeliverySpeed, PrintColour, PrintPaperSize, PrintSides } from '../src/print/print.types';

describe('CustomerController private documents', () => {
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
      total: 43,
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
    });
    expect(transaction.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        printSubtotal: 16,
        deliveryFee: 24,
        platformFee: 3,
        total: 43,
      }),
    }));
    expect(transaction.orderItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ binding: 'BINDING', stapling: true, lamination: true }),
    }));
  });
});
