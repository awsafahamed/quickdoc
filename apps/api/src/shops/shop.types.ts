export interface PrintShop {
  id: string;
  name: string;
  description: string;
  address: string;
  distanceKm: number;
  rating: number;
  reviewCount: number;
  estimatedMinutes: number;
  operatingStatus: 'OPEN' | 'CLOSED';
  capabilities: string[];
  supportedPaperSizes: string[];
  colourPrinting: boolean;
  services: { code: string; name: string; description: string; price: number }[];
  printPrices: { paperSize: string; colour: boolean; duplex: boolean; pricePerSide: number }[];
}
