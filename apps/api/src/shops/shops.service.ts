import { Injectable, NotFoundException } from '@nestjs/common';
import { PrintShop } from './shop.types';
import { PrismaService } from '../prisma/prisma.service';

const SHOPS: PrintShop[] = [
  {
    id: 'shop-al-barsha',
    name: 'Paper & Press, Al Barsha',
    description: 'Full-service digital printing with careful finishing and same-day preparation.',
    address: 'Al Barsha 1, Dubai',
    distanceKm: 2.4,
    rating: 4.8,
    reviewCount: 126,
    estimatedMinutes: 45,
    operatingStatus: 'OPEN',
    capabilities: ['A4', 'A3', 'A5', 'COLOUR', 'BINDING', 'STAPLING', 'LAMINATION'],
    supportedPaperSizes: ['A4', 'A3', 'A5'],
    colourPrinting: true,
    services: [],
    printPrices: [],
  },
  {
    id: 'shop-jlt',
    name: 'The Copy Room, JLT',
    description: 'Reliable everyday printing for documents, presentations and business packs.',
    address: 'Cluster X, Jumeirah Lakes Towers',
    distanceKm: 5.8,
    rating: 4.6,
    reviewCount: 84,
    estimatedMinutes: 60,
    operatingStatus: 'OPEN',
    capabilities: ['A4', 'A3', 'COLOUR', 'BINDING', 'STAPLING'],
    supportedPaperSizes: ['A4', 'A3'],
    colourPrinting: true,
    services: [],
    printPrices: [],
  },
];

@Injectable()
export class ShopsService {
  constructor(private readonly prisma: PrismaService) {}

  async findEligible(search?: string, paperSize?: string, colour?: string): Promise<PrintShop[]> {
    const normalizedSearch = search?.trim().toLowerCase();
    const shops = await this.prisma.shop.findMany({
      where: {
        status: 'APPROVED',
        isOpen: true,
        ...(normalizedSearch ? { OR: [{ name: { contains: normalizedSearch, mode: 'insensitive' } }, { address: { contains: normalizedSearch, mode: 'insensitive' } }] } : {}),
      },
      include: { services: true, ShopPrice: true },
    });
    return shops.map((shop): PrintShop => {
      const availableServices = shop.services.filter(
        (service) => service.enabled && service.reviewStatus === 'APPROVED',
      );
      return {
        id: shop.id,
        name: shop.name,
        description: 'Verified printing partner.',
        address: shop.address,
        distanceKm: 0,
        rating: 0,
        reviewCount: 0,
        estimatedMinutes: 45,
        operatingStatus: 'OPEN',
        capabilities: availableServices.map((service) => service.code),
        supportedPaperSizes: availableServices.flatMap((service) => service.code.startsWith('PAPER_') ? [service.code.replace('PAPER_', '')] : []),
        colourPrinting: availableServices.some((service) => service.code === 'COLOUR'),
        services: availableServices
          .filter((service) => service.isCustom)
          .map((service) => ({
            code: service.code,
            name: service.name,
            description: service.description,
            price: Number(service.price),
          })),
        printPrices: shop.ShopPrice.map((price) => ({
          paperSize: price.paperSize,
          colour: price.colour,
          duplex: price.duplex,
          pricePerSide: Number(price.pricePerSide),
        })),
      };
    }).filter((shop) => {
      const matchesSearch = !normalizedSearch
        || shop.name.toLowerCase().includes(normalizedSearch)
        || shop.address.toLowerCase().includes(normalizedSearch);
      const matchesPaper = !paperSize || shop.supportedPaperSizes.includes(paperSize) || shop.capabilities.length === 0;
      const matchesColour = colour !== 'COLOUR' || shop.colourPrinting;
      return matchesSearch && matchesPaper && matchesColour;
    }).sort((left, right) => left.distanceKm - right.distanceKm);
  }

  findById(id: string): PrintShop {
    const shop = SHOPS.find((item) => item.id === id);
    if (!shop) throw new NotFoundException('Print shop was not found');
    return shop;
  }
}
