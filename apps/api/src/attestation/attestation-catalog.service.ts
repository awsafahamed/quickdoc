import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AttestationQuote, AttestationService } from './attestation.types';

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class AttestationCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AttestationService[]> {
    const services = await this.prisma.platformCatalogService.findMany({
      where: { enabled: true },
      orderBy: { code: 'asc' },
    });
    return services.map((service) => ({
      id: service.code,
      name: service.name,
      description: service.description,
      estimatedDays: service.estimatedDays,
      serviceFee: Number(service.serviceFee),
      requiresOriginals: service.requiresOriginals,
      requiredOriginals: service.requiredOriginals,
      supportingDocuments: service.supportingDocuments,
    }));
  }

  async quote(
    serviceId: string,
    pickupDistanceKm: number,
    returnDistanceKm: number,
    express: boolean,
    serviceFeeOverride?: number,
  ): Promise<AttestationQuote> {
    const [service, storedRules] = await Promise.all([
      this.prisma.platformCatalogService.findFirst({
        where: { code: serviceId, enabled: true },
        select: { serviceFee: true },
      }),
      this.prisma.platformPricingRule.findMany({
        where: {
          key: {
            in: [
              'ATTESTATION_PICKUP_BASE',
              'ATTESTATION_RETURN_BASE',
              'ATTESTATION_DELIVERY_PER_KM',
              'ATTESTATION_EXPRESS_FEE',
              'ATTESTATION_TAX_RATE',
            ],
          },
        },
      }),
    ]);
    const pricing: Record<string, number> = {
      ATTESTATION_PICKUP_BASE: 10,
      ATTESTATION_RETURN_BASE: 10,
      ATTESTATION_DELIVERY_PER_KM: 1,
      ATTESTATION_EXPRESS_FEE: 20,
      ATTESTATION_TAX_RATE: 0.05,
    };
    for (const rule of storedRules) {
      if (rule.key in pricing) pricing[rule.key] = Number(rule.amount);
    }
    if (!service && serviceFeeOverride === undefined) {
      throw new NotFoundException('Attestation service was not found');
    }
    const serviceFee = serviceFeeOverride !== undefined
      ? serviceFeeOverride
      : Number(service?.serviceFee);
    const pickupDelivery = pricing.ATTESTATION_PICKUP_BASE + pickupDistanceKm * pricing.ATTESTATION_DELIVERY_PER_KM;
    const returnDelivery = pricing.ATTESTATION_RETURN_BASE + returnDistanceKm * pricing.ATTESTATION_DELIVERY_PER_KM;
    const expressFee = express ? pricing.ATTESTATION_EXPRESS_FEE : 0;
    const subtotal = serviceFee + pickupDelivery + returnDelivery + expressFee;
    const tax = money(subtotal * pricing.ATTESTATION_TAX_RATE);

    return {
      serviceFee,
      pickupDelivery: money(pickupDelivery),
      returnDelivery: money(returnDelivery),
      expressFee,
      tax,
      total: money(subtotal + tax),
      currency: 'LKR',
      quoteId: randomUUID(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }
}
