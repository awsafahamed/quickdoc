export interface AttestationService {
  id: string;
  name: string;
  description: string;
  estimatedDays: number;
  serviceFee: number;
  requiresOriginals: boolean;
  requiredOriginals: string[];
  supportingDocuments: string[];
  providerAgentId?: string;
  providerName?: string;
}

export interface AttestationQuoteRequest {
  serviceId: string;
  agentId: string;
  pickupDistanceKm: number;
  returnDistanceKm: number;
  express: boolean;
}

export interface AttestationQuote {
  serviceFee: number;
  pickupDelivery: number;
  returnDelivery: number;
  expressFee: number;
  tax: number;
  total: number;
  currency: 'LKR';
  quoteId: string;
  expiresAt: string;
}
