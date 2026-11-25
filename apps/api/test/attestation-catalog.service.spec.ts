import { AttestationCatalogService } from '../src/attestation/attestation-catalog.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AttestationCatalogService', () => {
  const configuredService = {
    code: 'degree',
    name: 'Degree certificate attestation',
    description: 'Configured service',
    estimatedDays: 7,
    serviceFee: 180,
    requiresOriginals: true,
    requiredOriginals: ['Original degree certificate'],
    supportingDocuments: ['Passport copy'],
    enabled: true,
  };

  it('returns database-configured services and calculates pickup plus return delivery', async () => {
    const prisma = {
      platformCatalogService: {
        findMany: jest.fn().mockResolvedValue([configuredService]),
        findFirst: jest.fn().mockResolvedValue({ serviceFee: 180 }),
      },
      platformPricingRule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const catalogue = new AttestationCatalogService(prisma as unknown as PrismaService);
    const services = await catalogue.list();
    const quote = await catalogue.quote(services[0].id, 5, 5, false);

    expect(services.length).toBeGreaterThan(0);
    expect(services[0].requiresOriginals).toBe(true);
    expect(quote.serviceFee).toBe(services[0].serviceFee);
    expect(quote.pickupDelivery).toBe(15);
    expect(quote.returnDelivery).toBe(15);
    expect(quote.total).toBe(quote.serviceFee + quote.pickupDelivery + quote.returnDelivery + quote.tax);
    expect(prisma.platformCatalogService.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { enabled: true },
    }));
  });

  it('uses platform-managed delivery and tax rates for attestation quotes', async () => {
    const prisma = {
      platformCatalogService: {
        findFirst: jest.fn().mockResolvedValue({ serviceFee: 100 }),
      },
      platformPricingRule: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'ATTESTATION_PICKUP_BASE', amount: 5 },
          { key: 'ATTESTATION_RETURN_BASE', amount: 7 },
          { key: 'ATTESTATION_DELIVERY_PER_KM', amount: 2 },
          { key: 'ATTESTATION_EXPRESS_FEE', amount: 10 },
          { key: 'ATTESTATION_TAX_RATE', amount: 0.1 },
        ]),
      },
    };
    const catalogue = new AttestationCatalogService(prisma as unknown as PrismaService);

    const quote = await catalogue.quote('degree', 3, 4, true);

    expect(quote.pickupDelivery).toBe(11);
    expect(quote.returnDelivery).toBe(15);
    expect(quote.expressFee).toBe(10);
    expect(quote.tax).toBe(13.6);
    expect(quote.total).toBe(149.6);
  });
});
