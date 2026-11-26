import { Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, Length } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { SupportService } from '../support/support.service';

class ShopSupportRequestDto {
  @IsString() @Length(3, 160) subject!: string;
  @IsString() @Length(1, 5000) body!: string;
}

class ShopSupportReplyDto {
  @IsString() @Length(1, 5000) body!: string;
}

@Controller('shop/me/support')
@UseGuards(AuthGuard('jwt'))
export class ShopSupportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: SupportService,
  ) {}

  private async assertShopMember(userId: string) {
    const shop = await this.prisma.shop.findFirst({
      where: { OR: [{ ownerId: userId }, { staff: { some: { userId } } }] },
      select: { id: true },
    });
    if (!shop) throw new NotFoundException('No print shop is linked to this account');
  }

  @Get()
  async list(@Req() req: { user: { id: string } }) {
    await this.assertShopMember(req.user.id);
    return { data: await this.support.listCustomerTickets(req.user.id) };
  }

  @Post()
  async create(
    @Req() req: { user: { id: string } },
    @Body() dto: ShopSupportRequestDto,
  ) {
    await this.assertShopMember(req.user.id);
    return {
      data: await this.support.createCustomerTicket(req.user.id, {
        subject: dto.subject,
        body: dto.body,
      }),
    };
  }

  @Get(':id')
  async get(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    await this.assertShopMember(req.user.id);
    return { data: await this.support.getCustomerTicket(id, req.user.id) };
  }

  @Post(':id/messages')
  async reply(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: ShopSupportReplyDto,
  ) {
    await this.assertShopMember(req.user.id);
    return {
      data: await this.support.replyAsCustomer(id, req.user.id, dto.body),
    };
  }
}
