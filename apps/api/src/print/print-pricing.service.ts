import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { deliveryDistanceKm } from '../common/geo';
import { PrintQuoteBreakdown, PrintQuoteRequest } from './print.types';

const DEFAULT_PRICING = {
  PAPER_A4_MULTIPLIER: 1,
  PAPER_A3_MULTIPLIER: 1.6,
  PAPER_A5_MULTIPLIER: 0.8,
  BLACK_WHITE_RATE: 0.5,
  COLOUR_RATE: 1.5,
  BINDING_FEE: 8,
  STAPLING_FEE: 2,
  LAMINATION_PER_PAGE: 3,
  DELIVERY_BASE: 10,
  DELIVERY_PER_KM: 1,
  EXPRESS_BASE: 12,
  EXPRESS_PER_KM: 0.5,
  SHOP_SERVICE_FEE: 2,
  VOLUME_DISCOUNT_MIN_PAGES: 100,
  VOLUME_DISCOUNT_RATE: 0.05,
  TAX_RATE: 0.05,
} as const;

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class PrintPricingService {
  constructor(private readonly prisma: PrismaService) {}

  async calculate(request: PrintQuoteRequest): Promise<PrintQuoteBreakdown> {
    const shopServiceCodes = request.shopServiceCodes ?? [];
    if (shopServiceCodes.length && !request.shopId) {
      throw new BadRequestException('Select a shop before adding its custom services');
    }

    let shopServices: { code: string; name: string; price: number }[] = [];
    let shopPricePerSide: number | undefined;
    let distanceKm = request.deliveryDistanceKm;
    if (request.shopId) {
      const shop = await this.prisma.shop.findFirst({
        where: { id: request.shopId, status: 'APPROVED', isOpen: true },
        select: { id: true, latitude: true, longitude: true },
      });
      if (!shop) throw new BadRequestException('Shop is not eligible');
      if (request.deliveryLatitude !== undefined && request.deliveryLongitude !== undefined) {
        distanceKm = deliveryDistanceKm(shop, {
          latitude: request.deliveryLatitude,
          longitude: request.deliveryLongitude,
        });
      }

      const shopPrice = await this.prisma.shopPrice.findFirst({
        where: {
          shopId: request.shopId,
          paperSize: request.paperSize,
          colour: request.colour === 'COLOUR',
          duplex: request.sides === 'DUPLEX',
        },
        select: { pricePerSide: true },
      });
      if (shopPrice) shopPricePerSide = Number(shopPrice.pricePerSide);

      if (shopServiceCodes.length) {
        const offers = await this.prisma.shopService.findMany({
          where: {
            shopId: request.shopId,
            code: { in: shopServiceCodes },
            isCustom: true,
            enabled: true,
            reviewStatus: 'APPROVED',
          },
          select: { code: true, name: true, price: true },
          orderBy: { name: 'asc' },
        });
        if (offers.length !== shopServiceCodes.length) {
          throw new BadRequestException('One or more selected shop services are unavailable');
        }
        shopServices = offers.map((offer) => ({
          code: offer.code,
          name: offer.name,
          price: Number(offer.price),
        }));
      }
    }

    const storedRules = await this.prisma.platformPricingRule.findMany();
    const pricing: Record<string, number> = { ...DEFAULT_PRICING };
    for (const rule of storedRules) {
      if (rule.key in DEFAULT_PRICING) pricing[rule.key] = Number(rule.amount);
    }

    const printedPages = request.pageCount * request.copies;
    const sheets = request.sides === 'DUPLEX' ? Math.ceil(printedPages / 2) : printedPages;
    const printing = shopPricePerSide !== undefined
      ? printedPages * shopPricePerSide
      : printedPages
        * pricing[request.colour === 'COLOUR' ? 'COLOUR_RATE' : 'BLACK_WHITE_RATE']
        * pricing[`PAPER_${request.paperSize}_MULTIPLIER`];
    const finishing = (request.binding ? pricing.BINDING_FEE : 0)
      + (request.stapling ? pricing.STAPLING_FEE : 0)
      + (request.lamination ? pricing.LAMINATION_PER_PAGE * printedPages : 0);
    const delivery = pricing.DELIVERY_BASE + distanceKm * pricing.DELIVERY_PER_KM;
    const express = request.deliverySpeed === 'EXPRESS'
      ? pricing.EXPRESS_BASE + distanceKm * pricing.EXPRESS_PER_KM
      : 0;
    const shopService = pricing.SHOP_SERVICE_FEE;
    const shopServiceTotal = shopServices.reduce((total, service) => total + service.price, 0);
    const discount = printedPages >= pricing.VOLUME_DISCOUNT_MIN_PAGES
      ? money((printing + finishing) * pricing.VOLUME_DISCOUNT_RATE)
      : 0;
    const subtotal = printing + finishing + shopService + shopServiceTotal + delivery + express - discount;
    const tax = money(subtotal * pricing.TAX_RATE);

    return {
      printing: money(printing),
      finishing: money(finishing),
      shopService: money(shopService),
      shopServiceTotal: money(shopServiceTotal),
      shopServices,
      delivery: money(delivery),
      express: money(express),
      discount: money(discount),
      tax,
      total: money(subtotal + tax),
      currency: 'LKR',
      quoteId: randomUUID(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      sheets,
      deliveryDistanceKm: distanceKm,
    };
  }
}
