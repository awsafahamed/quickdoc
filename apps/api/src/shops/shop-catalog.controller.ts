import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateObjectStorageService } from '../storage/private-object-storage.service';

class CreateFolderDto {
  @IsString() @Length(1, 120)
  name!: string;

  @IsOptional() @IsUUID()
  parentId?: string;
}

class RenameFolderDto {
  @IsString() @Length(1, 120)
  name!: string;
}

class UploadUrlDto {
  @IsString() @Length(1, 255)
  name!: string;

  @IsString()
  mimeType!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(25 * 1024 * 1024)
  sizeBytes!: number;
}

class CreateCatalogDocumentDto {
  @IsString() @Length(1, 255)
  name!: string;

  @IsString()
  mimeType!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(25 * 1024 * 1024)
  sizeBytes!: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000)
  pageCount?: number;

  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  @IsOptional() @IsUUID()
  folderId?: string;

  @IsString() @Length(1, 512)
  objectKey!: string;
}

class UpdateCatalogDocumentDto {
  @IsOptional() @IsString() @Length(1, 255)
  name?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  @IsOptional() @IsUUID()
  folderId?: string | null;

  @IsOptional() @IsBoolean()
  isPublished?: boolean;
}

@Controller('shop/me/catalog')
@UseGuards(AuthGuard('jwt'))
export class ShopCatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PrivateObjectStorageService,
  ) {}

  private async shopForUser(userId: string) {
    const shop = await this.prisma.shop.findFirst({
      where: { OR: [{ ownerId: userId }, { staff: { some: { userId } } }] },
      select: { id: true },
    });
    if (!shop) throw new BadRequestException('No print shop is linked to this account');
    return shop;
  }

  private async ensureFolder(shopId: string, folderId: string | null | undefined) {
    if (!folderId) return null;
    const folder = await this.prisma.shopCatalogFolder.findFirst({ where: { id: folderId, shopId } });
    if (!folder) throw new BadRequestException('Catalogue folder was not found for this shop');
    return folder;
  }

  @Get()
  async list(@Req() request: { user: { id: string } }) {
    const shop = await this.shopForUser(request.user.id);
    const [folders, documents] = await Promise.all([
      this.prisma.shopCatalogFolder.findMany({
        where: { shopId: shop.id },
        orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, parentId: true, createdAt: true },
      }),
      this.prisma.shopCatalogDocument.findMany({
        where: { shopId: shop.id },
        orderBy: { createdAt: 'desc' },
        include: { folder: { select: { id: true, name: true } } },
      }),
    ]);
    return { data: { folders, documents } };
  }

  @Post('folders')
  async createFolder(@Req() request: { user: { id: string } }, @Body() dto: CreateFolderDto) {
    const shop = await this.shopForUser(request.user.id);
    await this.ensureFolder(shop.id, dto.parentId);
    const name = dto.name.trim();
    const duplicate = await this.prisma.shopCatalogFolder.findFirst({
      where: { shopId: shop.id, parentId: dto.parentId ?? null, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('A folder with this name already exists here');
    return {
      data: await this.prisma.shopCatalogFolder.create({
        data: { id: randomUUID(), shopId: shop.id, parentId: dto.parentId, name, updatedAt: new Date() },
      }),
    };
  }

  @Patch('folders/:id')
  async renameFolder(
    @Req() request: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: RenameFolderDto,
  ) {
    const shop = await this.shopForUser(request.user.id);
    const folder = await this.prisma.shopCatalogFolder.findFirst({ where: { id, shopId: shop.id } });
    if (!folder) throw new NotFoundException('Catalogue folder was not found');
    const name = dto.name.trim();
    const duplicate = await this.prisma.shopCatalogFolder.findFirst({
      where: { shopId: shop.id, parentId: folder.parentId, name: { equals: name, mode: 'insensitive' }, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('A folder with this name already exists here');
    return { data: await this.prisma.shopCatalogFolder.update({ where: { id }, data: { name } }) };
  }

  @Delete('folders/:id')
  async deleteFolder(@Req() request: { user: { id: string } }, @Param('id') id: string) {
    const shop = await this.shopForUser(request.user.id);
    const folder = await this.prisma.shopCatalogFolder.findFirst({
      where: { id, shopId: shop.id },
      include: { _count: { select: { children: true, documents: true } } },
    });
    if (!folder) throw new NotFoundException('Catalogue folder was not found');
    if (folder._count.children || folder._count.documents) {
      throw new ConflictException('Move or remove the folder contents before deleting it');
    }
    await this.prisma.shopCatalogFolder.delete({ where: { id } });
    return { data: { deleted: true } };
  }

  @Post('upload-url')
  async createUploadUrl(@Req() request: { user: { id: string } }, @Body() dto: UploadUrlDto) {
    const shop = await this.shopForUser(request.user.id);
    if (dto.mimeType !== 'application/pdf' || !dto.name.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException('Only PDF catalogue documents are supported');
    }
    const objectKey = `private/shops/${shop.id}/${randomUUID()}.pdf`;
    return {
      data: { objectKey, uploadUrl: await this.storage.createUploadUrl(objectKey), expiresIn: 300 },
    };
  }

  @Post('documents')
  async createDocument(
    @Req() request: { user: { id: string } },
    @Body() dto: CreateCatalogDocumentDto,
  ) {
    const shop = await this.shopForUser(request.user.id);
    if (dto.mimeType !== 'application/pdf' || !dto.name.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException('Only PDF catalogue documents are supported');
    }
    if (!dto.objectKey.startsWith(`private/shops/${shop.id}/`)) {
      throw new BadRequestException('Catalogue upload key is invalid');
    }
    await this.ensureFolder(shop.id, dto.folderId);
    const pageCount = await this.storage.verifyPdfUpload(dto.objectKey, dto.sizeBytes);
    return {
      data: await this.prisma.shopCatalogDocument.create({
        data: {
          id: randomUUID(),
          shopId: shop.id,
          folderId: dto.folderId,
          objectKey: dto.objectKey,
          name: dto.name.trim(),
          description: dto.description?.trim() ?? '',
          mimeType: dto.mimeType,
          sizeBytes: dto.sizeBytes,
          pageCount,
          updatedAt: new Date(),
        },
      }),
    };
  }

  @Patch('documents/:id')
  async updateDocument(
    @Req() request: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateCatalogDocumentDto,
  ) {
    const shop = await this.shopForUser(request.user.id);
    const existing = await this.prisma.shopCatalogDocument.findFirst({ where: { id, shopId: shop.id } });
    if (!existing) throw new NotFoundException('Catalogue document was not found');
    await this.ensureFolder(shop.id, dto.folderId);
    return {
      data: await this.prisma.shopCatalogDocument.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          description: dto.description?.trim(),
          folderId: dto.folderId,
          isPublished: dto.isPublished,
        },
      }),
    };
  }

  @Delete('documents/:id')
  async deleteDocument(@Req() request: { user: { id: string } }, @Param('id') id: string) {
    const shop = await this.shopForUser(request.user.id);
    const document = await this.prisma.shopCatalogDocument.findFirst({ where: { id, shopId: shop.id } });
    if (!document) throw new NotFoundException('Catalogue document was not found');
    await this.prisma.shopCatalogDocument.delete({ where: { id } });
    await this.storage.deleteObject(document.objectKey);
    return { data: { deleted: true } };
  }
}
