import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

class InventoryItemDto {
  @IsString() @Length(1, 120) name!: string;
  @IsString() @Length(1, 60) category!: string;
  @IsString() @Length(1, 24) unit!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) quantity!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) reorderLevel!: number;
}

class CustomerQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 10;
}

@Controller('shop/me')
@UseGuards(AuthGuard('jwt'))
export class ShopPortalOperationsController {
  constructor(private readonly prisma: PrismaService) {}

  private async shopForOwner(userId: string) {
    const shop = await this.prisma.shop.findFirst({ where: { ownerId: userId } });
    if (!shop) throw new NotFoundException('No print shop is linked to this account');
    return shop;
  }

  @Get('inventory')
  async inventory(@Req() req: { user: { id: string } }) {
    const shop = await this.shopForOwner(req.user.id);
    return {
      data: await this.prisma.shopInventoryItem.findMany({
        where: { shopId: shop.id },
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      }),
    };
  }

  @Post('inventory')
  async createInventoryItem(
    @Req() req: { user: { id: string } },
    @Body() dto: InventoryItemDto,
  ) {
    const shop = await this.shopForOwner(req.user.id);
    return {
      data: await this.prisma.shopInventoryItem.create({
        data: { id: randomUUID(), shopId: shop.id, ...dto },
      }),
    };
  }

  @Patch('inventory/:id')
  async updateInventoryItem(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: InventoryItemDto,
  ) {
    const shop = await this.shopForOwner(req.user.id);
    const item = await this.prisma.shopInventoryItem.findFirst({
      where: { id, shopId: shop.id },
    });
    if (!item) throw new NotFoundException('Inventory item was not found');
    return {
      data: await this.prisma.shopInventoryItem.update({
        where: { id },
        data: dto,
      }),
    };
  }

  @Delete('inventory/:id')
  async deleteInventoryItem(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const shop = await this.shopForOwner(req.user.id);
    const deleted = await this.prisma.shopInventoryItem.deleteMany({
      where: { id, shopId: shop.id },
    });
    if (!deleted.count) throw new NotFoundException('Inventory item was not found');
    return { data: { deleted: true } };
  }

  @Get('customers')
  async customers(
    @Req() req: { user: { id: string } },
    @Query() query: CustomerQueryDto,
  ) {
    const shop = await this.shopForOwner(req.user.id);
    const search = query.search?.trim();
    const where = {
      shopId: shop.id,
      ...(search
        ? {
            customer: {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };
    const totals = await this.prisma.order.groupBy({
      by: ['customerId'],
      where,
      _count: { _all: true },
      _sum: { total: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
    });
    const offset = (query.page - 1) * query.pageSize;
    const pageTotals = totals.slice(offset, offset + query.pageSize);
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: pageTotals.map((item) => item.customerId) },
      },
      select: {
        id: true,
        name: true,
        email: true,
        CustomerProfile: { select: { phone: true } },
      },
    });
    const usersById = new Map(users.map((user) => [user.id, user]));
    const customers = pageTotals.flatMap((aggregate) => {
      const user = usersById.get(aggregate.customerId);
      return user ? [{
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.CustomerProfile?.phone ?? null,
        orderCount: aggregate._count._all,
        lifetimeValue: Number(aggregate._sum.total ?? 0),
        lastOrderAt: aggregate._max.createdAt,
      }] : [];
    });
    return {
      data: customers,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: totals.length,
        totalPages: Math.ceil(totals.length / query.pageSize),
      },
    };
  }

  @Get('notifications')
  async notifications(@Req() req: { user: { id: string } }) {
    const shop = await this.shopForOwner(req.user.id);
    return {
      data: await this.prisma.notification.findMany({
        where: { userId: shop.ownerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    };
  }

  @Patch('notifications/:id/read')
  async markNotificationRead(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const shop = await this.shopForOwner(req.user.id);
    const updated = await this.prisma.notification.updateMany({
      where: { id, userId: shop.ownerId },
      data: { readAt: new Date() },
    });
    if (!updated.count) throw new NotFoundException('Notification was not found');
    return { data: { read: true } };
  }
}
