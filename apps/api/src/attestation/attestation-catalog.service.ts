import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AttestationQuote, AttestationService } from './attestation.types';

const CATALOGUE: AttestationService[] = [
  {
    id: 'uae-embassy-degree',
    name: 'Degree certificate attestation',
    description: 'Document attestation support for education certificates and transcripts.',
    estimatedDays: 7,
    serviceFee: 180,
    requiresOriginals: true,
    requiredOriginals: ['Original degree certificate', 'Original transcript'],
    supportingDocuments: ['Passport copy', 'Emirates ID copy'],
  },
  {
    id: 'personal-document',
    name: 'Personal document attestation',
    description: 'A guided process for eligible personal and civil documents.',
    estimatedDays: 5,
    serviceFee: 140,
    requiresOriginals: true,
    requiredOriginals: ['Original document to be attested'],
    supportingDocuments: ['Passport copy', 'Document purpose or cover note'],
  },
];

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class AttestationCatalogService {
  list(): AttestationService[] {
    return CATALOGUE;
  }

  quote(serviceId: string, pickupDistanceKm: number, returnDistanceKm: number, express: boolean): AttestationQuote {
    const service = CATALOGUE.find((item) => item.id === serviceId);
    if (!service) {
      throw new NotFoundException('Attestation service was not found');
    }

    const pickupDelivery = 10 + pickupDistanceKm;
    const returnDelivery = 10 + returnDistanceKm;
    const expressFee = express ? 20 : 0;
    const subtotal = service.serviceFee + pickupDelivery + returnDelivery + expressFee;
    const tax = money(subtotal * 0.05);

    return {
      serviceFee: service.serviceFee,
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
