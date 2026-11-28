import { Injectable, NotFoundException } from '@nestjs/common';
import { PrintShop } from './shop.types';
import { PrismaService } from '../prisma/prisma.service';
import { distanceInKm } from '../common/geo';
import type { Prisma } from '@prisma/client';


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
    const ratings = await this.ratingsFor(shops.map((shop) => shop.id));
    return shops.map((shop) => this.toPrintShop(shop, ratings, latitude, longitude)).filter((shop) => {
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

  private async ratingsFor(shopIds: string[]) {
    if (!shopIds.length) return new Map<string, { rating: number; reviewCount: number }>();
    const rows = await this.prisma.review.groupBy({
      by: ['shopId'],
      where: { shopId: { in: shopIds } },
      _avg: { shopRating: true },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.shopId, {
      rating: Math.round((row._avg.shopRating ?? 0) * 10) / 10,
      reviewCount: row._count._all,
    }]));
  }

  private toPrintShop(
    shop: Prisma.ShopGetPayload<{ include: { services: true; ShopPrice: true } }>,
    ratings: Map<string, { rating: number; reviewCount: number }>,
    latitude?: number,
    longitude?: number,
  ): PrintShop {
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
      rating: ratings.get(shop.id)?.rating ?? 0,
      reviewCount: ratings.get(shop.id)?.reviewCount ?? 0,
      estimatedMinutes: 45,
      operatingStatus: shop.isOpen ? 'OPEN' : 'CLOSED',
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

  async findById(id: string, latitude?: number, longitude?: number): Promise<PrintShop> {
    const shop = await this.prisma.shop.findFirst({
      where: { id, status: 'APPROVED' },
      include: { services: true, ShopPrice: true },
    });
    if (!shop) throw new NotFoundException('Print shop was not found');
    return this.toPrintShop(shop, await this.ratingsFor([shop.id]), latitude, longitude);
  }
}
