import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrintQuoteBreakdown, PrintQuoteRequest } from './print.types';

const PAPER_MULTIPLIER = { A4: 1, A3: 1.6, A5: 0.8 } as const;
const COLOUR_RATE = { BLACK_WHITE: 0.5, COLOUR: 1.5 } as const;
const FINISHING = { binding: 8, stapling: 2, lamination: 3 } as const;

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class PrintPricingService {
  calculate(request: PrintQuoteRequest): PrintQuoteBreakdown {
    const printedPages = request.pageCount * request.copies;
    const sheets = request.sides === 'DUPLEX' ? Math.ceil(printedPages / 2) : printedPages;
    const printing = printedPages * COLOUR_RATE[request.colour] * PAPER_MULTIPLIER[request.paperSize];
    const finishing = (request.binding ? FINISHING.binding : 0)
      + (request.stapling ? FINISHING.stapling : 0)
      + (request.lamination ? FINISHING.lamination * printedPages : 0);
    const delivery = 10 + request.deliveryDistanceKm;
    const express = request.deliverySpeed === 'EXPRESS' ? 12 + request.deliveryDistanceKm * 0.5 : 0;
    const shopService = 2;
    const discount = printedPages >= 100 ? money((printing + finishing) * 0.05) : 0;
    const subtotal = printing + finishing + shopService + delivery + express - discount;
    const tax = money(subtotal * 0.05);

    return {
      printing: money(printing),
      finishing: money(finishing),
      shopService: money(shopService),
      delivery: money(delivery),
      express: money(express),
      discount: money(discount),
      tax,
      total: money(subtotal + tax),
      currency: 'LKR',
      quoteId: randomUUID(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      sheets,
    };
  }
}
