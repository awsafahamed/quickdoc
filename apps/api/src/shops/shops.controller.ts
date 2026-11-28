import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { ShopsService } from './shops.service';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateObjectStorageService } from '../storage/private-object-storage.service';

function parseLocation(latitude?: string, longitude?: string): { latitude?: number; longitude?: number } {
  if (latitude === undefined && longitude === undefined) return {};
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (
    latitude === undefined || longitude === undefined
    || !latitude.trim() || !longitude.trim()
    || !Number.isFinite(lat) || lat < -90 || lat > 90
    || !Number.isFinite(lng) || lng < -180 || lng > 180
  ) {
    throw new BadRequestException('Both latitude and longitude must be valid coordinates');
  }
  return { latitude: lat, longitude: lng };
}

@Controller('shops')
export class ShopsController {
  constructor(private readonly shops: ShopsService) {}

  @Get()
  async list(
    @Query('search') search?: string,
    @Query('paperSize') paperSize?: string,
    @Query('colour') colour?: string,
    @Query('lat') latitude?: string,
    @Query('lng') longitude?: string,
  ) {
    const location = parseLocation(latitude, longitude);
    return { data: await this.shops.findEligible(search, paperSize, colour, location.latitude, location.longitude) };
  }

  @Get(':id')
  async get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('lat') latitude?: string,
    @Query('lng') longitude?: string,
  ) {
    const location = parseLocation(latitude, longitude);
    return { data: await this.shops.findById(id, location.latitude, location.longitude) };
  }
}

@Controller('catalog')
export class PublicCatalogController {
  constructor(
    private readonly shops: ShopsService,
    private readonly prisma: PrismaService,
    private readonly storage: PrivateObjectStorageService,
  ) {}

  @Get('documents')
  async documents(
    @Query('search') search?: string,
    @Query('shopId') shopId?: string,
    @Query('lat') latitude?: string,
    @Query('lng') longitude?: string,
  ) {
    const location = parseLocation(latitude, longitude);
    if (shopId && !isUUID(shopId)) throw new BadRequestException('Shop ID is invalid');
    return {
      data: await this.shops.findCatalogDocuments(search, location.latitude, location.longitude, shopId),
    };
  }

  @Get('documents/:id/preview-url')
  async previewUrl(@Param('id', new ParseUUIDPipe()) id: string) {
    const document = await this.prisma.shopCatalogDocument.findFirst({
      where: { id, isPublished: true, shop: { status: 'APPROVED' } },
      select: { objectKey: true, name: true },
    });
    if (!document) throw new BadRequestException('Catalogue document was not found');
    return {
      data: { previewUrl: await this.storage.createPreviewUrl(document.objectKey, document.name) },
    };
  }
}
