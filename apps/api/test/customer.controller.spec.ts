import { CustomerController } from '../src/customer/customer.controller';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrintPricingService } from '../src/print/print-pricing.service';
import { DeliverySpeed, PrintColour, PrintPaperSize, PrintSides } from '../src/print/print.types';

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
      delivery: 10,
      total: 25,
    };
    const pricing = { calculate: jest.fn().mockResolvedValue(quote) } as unknown as PrintPricingService;
    const controller = new CustomerController(prisma, pricing);

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
      binding: false,
      stapling: false,
      lamination: false,
      deliverySpeed: DeliverySpeed.STANDARD,
      deliveryDistanceKm: 0,
    });
    expect(transaction.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        printSubtotal: 12,
        deliveryFee: 10,
        platformFee: 3,
        total: 25,
      }),
    }));
  });
});
