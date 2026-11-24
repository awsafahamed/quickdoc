export type VehicleTier = 'FLASH_BIKE' | 'FLASH_TUK' | 'FLASH_CAR';

export interface DeliveryFareRequest {
  tier: VehicleTier;
  distanceKm: number;
  demand: 'NORMAL' | 'RUSH' | 'WEEKEND' | 'WEATHER' | 'LOW_AVAILABILITY';
}

export interface DeliveryFare {
  tier: VehicleTier;
  distanceKm: number;
  baseFare: number;
  distanceCharge: number;
  demandMultiplier: number;
  surgeCharge: number;
  total: number;
  currency: 'LKR';
}

const TIERS = {
  FLASH_BIKE: { base: 180, perKm: 55 },
  FLASH_TUK: { base: 250, perKm: 100 },
  FLASH_CAR: { base: 380, perKm: 145 },
} as const;

const DEMAND = {
  NORMAL: 1,
  RUSH: 1.15,
  WEEKEND: 1.10,
  WEATHER: 1.20,
  LOW_AVAILABILITY: 1.25,
} as const;

export function calculateDeliveryFare(request: DeliveryFareRequest): DeliveryFare {
  const tier = TIERS[request.tier];
  const multiplier = DEMAND[request.demand];
  const distanceCharge = request.distanceKm * tier.perKm;
  const subtotal = tier.base + distanceCharge;
  const surgeCharge = Math.round(subtotal * (multiplier - 1) * 100) / 100;
  return {
    tier: request.tier,
    distanceKm: request.distanceKm,
    baseFare: tier.base,
    distanceCharge: Math.round(distanceCharge * 100) / 100,
    demandMultiplier: multiplier,
    surgeCharge,
    total: Math.round((subtotal + surgeCharge) * 100) / 100,
    currency: 'LKR',
  };
}
