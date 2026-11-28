export enum PrintPaperSize {
  A4 = 'A4',
  A3 = 'A3',
  A5 = 'A5',
}

export enum PrintColour {
  BLACK_WHITE = 'BLACK_WHITE',
  COLOUR = 'COLOUR',
}

export enum PrintSides {
  SINGLE = 'SINGLE',
  DUPLEX = 'DUPLEX',
}

export enum DeliverySpeed {
  STANDARD = 'STANDARD',
  EXPRESS = 'EXPRESS',
}

export interface PrintQuoteRequest {
  pageCount: number;
  copies: number;
  paperSize: PrintPaperSize;
  colour: PrintColour;
  sides: PrintSides;
  binding: boolean;
  stapling: boolean;
  lamination: boolean;
  deliverySpeed: DeliverySpeed;
  deliveryDistanceKm: number;
  /** When set together with shopId, the delivery distance is computed from the shop location. */
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  shopId?: string;
  shopServiceCodes?: string[];
}

export interface PrintShopServiceQuoteLine {
  code: string;
  name: string;
  price: number;
}

export interface PrintQuoteBreakdown {
  printing: number;
  finishing: number;
  shopService: number;
  shopServiceTotal: number;
  shopServices: PrintShopServiceQuoteLine[];
  delivery: number;
  express: number;
  discount: number;
  tax: number;
  total: number;
  currency: 'LKR';
  quoteId: string;
  expiresAt: string;
  sheets: number;
  deliveryDistanceKm: number;
}
