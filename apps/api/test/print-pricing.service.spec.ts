import { PrintPricingService } from '../src/print/print-pricing.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { DeliverySpeed, PrintColour, PrintPaperSize, PrintSides } from '../src/print/print.types';

describe('PrintPricingService', () => {
  const prisma = (rules: { key: string; amount: number }[] = []) => ({
    platformPricingRule: { findMany: jest.fn().mockResolvedValue(rules) },
  }) as unknown as PrismaService;

  it('calculates duplex sheets and a server-owned total', async () => {
    const quote = await new PrintPricingService(prisma()).calculate({
      pageCount: 10,
      copies: 2,
      paperSize: PrintPaperSize.A4,
      colour: PrintColour.COLOUR,
      sides: PrintSides.DUPLEX,
      binding: true,
      stapling: false,
      lamination: false,
      deliverySpeed: DeliverySpeed.STANDARD,
      deliveryDistanceKm: 5,
    });

    expect(quote.sheets).toBe(10);
    expect(quote.total).toBe(57.75);
    expect(quote.quoteId).toEqual(expect.any(String));
    expect(new Date(quote.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('applies the volume discount only after calculating printed pages', async () => {
    const quote = await new PrintPricingService(prisma()).calculate({
      pageCount: 100,
      copies: 1,
      paperSize: PrintPaperSize.A4,
      colour: PrintColour.BLACK_WHITE,
      sides: PrintSides.SINGLE,
      binding: false,
      stapling: false,
      lamination: false,
      deliverySpeed: DeliverySpeed.STANDARD,
      deliveryDistanceKm: 0,
    });

    expect(quote.discount).toBe(2.5);
    expect(quote.total).toBe(62.48);
  });

  it('uses database-managed rates in the public quote calculation', async () => {
    const quote = await new PrintPricingService(prisma([
      { key: 'BLACK_WHITE_RATE', amount: 1 },
    ])).calculate({
      pageCount: 1,
      copies: 1,
      paperSize: PrintPaperSize.A4,
      colour: PrintColour.BLACK_WHITE,
      sides: PrintSides.SINGLE,
      binding: false,
      stapling: false,
      lamination: false,
      deliverySpeed: DeliverySpeed.STANDARD,
      deliveryDistanceKm: 0,
    });

    expect(quote.printing).toBe(1);
    expect(quote.total).toBe(13.65);
  });
});
