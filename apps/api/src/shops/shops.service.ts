import { Injectable, NotFoundException } from '@nestjs/common';
import { PrintShop } from './shop.types';
import { PrismaService } from '../prisma/prisma.service';

function distanceInKm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

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

  async findEligible(
    search?: string,
    paperSize?: string,
    colour?: string,
    latitude?: number,
    longitude?: number,
  ): Promise<PrintShop[]> {
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
        distanceKm: latitude === undefined || longitude === undefined
          ? null
          : distanceInKm(latitude, longitude, Number(shop.latitude), Number(shop.longitude)),
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
    }).sort((left, right) => {
      if (left.distanceKm === null) return right.distanceKm === null ? left.name.localeCompare(right.name) : 1;
      if (right.distanceKm === null) return -1;
      return left.distanceKm - right.distanceKm;
    });
  }

  async findCatalogDocuments(search?: string, latitude?: number, longitude?: number, shopId?: string) {
    const normalizedSearch = search?.trim();
    const documents = await this.prisma.shopCatalogDocument.findMany({
      where: {
        isPublished: true,
        shop: { status: 'APPROVED' },
        ...(shopId ? { shopId } : {}),
        ...(normalizedSearch ? {
          OR: [
            { name: { contains: normalizedSearch, mode: 'insensitive' } },
            { description: { contains: normalizedSearch, mode: 'insensitive' } },
            { folder: { is: { name: { contains: normalizedSearch, mode: 'insensitive' } } } },
            { shop: { is: { name: { contains: normalizedSearch, mode: 'insensitive' } } } },
            { shop: { is: { address: { contains: normalizedSearch, mode: 'insensitive' } } } },
          ],
        } : {}),
      },
      include: {
        folder: { select: { id: true, name: true } },
        shop: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
            isOpen: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const withDistances = documents.map((document) => ({
      id: document.id,
      name: document.name,
      description: document.description,
      sizeBytes: document.sizeBytes,
      pageCount: document.pageCount,
      folder: document.folder,
      shop: {
        id: document.shop.id,
        name: document.shop.name,
        address: document.shop.address,
        isOpen: document.shop.isOpen,
        distanceKm: latitude === undefined || longitude === undefined
          ? null
          : Number(distanceInKm(latitude, longitude, Number(document.shop.latitude), Number(document.shop.longitude)).toFixed(1)),
      },
    }));
    return withDistances.sort((left, right) => (
      left.shop.distanceKm === null || right.shop.distanceKm === null
        ? 0
        : left.shop.distanceKm - right.shop.distanceKm
    ));
  }

  findById(id: string): PrintShop {
    const shop = SHOPS.find((item) => item.id === id);
    if (!shop) throw new NotFoundException('Print shop was not found');
    return shop;
  }
}
