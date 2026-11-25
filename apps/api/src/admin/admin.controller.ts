import { Body, Controller, ForbiddenException, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'node:crypto';

class RiderStatusDto {
  @IsIn(['APPROVED', 'REJECTED', 'SUSPENDED'])
  status!: 'APPROVED' | 'REJECTED' | 'SUSPENDED';
}

type AuthenticatedRequest = { user: { id: string; roles: string[] } };

@Controller('admin')
@UseGuards(AuthGuard('jwt'))
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdmin(request: AuthenticatedRequest) {
    if (!request.user.roles.includes('ADMIN')) {
      throw new ForbiddenException('Administrator access is required');
    }
  }

  @Get('overview')
  async overview(@Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    const [users, shops, pendingShops, riders, pendingRiders, orders] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.shop.count(),
      this.prisma.shop.count({ where: { status: 'PENDING' } }),
      this.prisma.riderProfile.count(),
      this.prisma.riderProfile.count({ where: { status: 'PENDING' } }),
      this.prisma.order.count(),
    ]);
    return { data: { users, shops, pendingShops, riders, pendingRiders, orders } };
  }

  @Get('users')
  async users(@Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    return { data: await this.prisma.user.findMany({ include: { UserRole: true, CustomerProfile: true }, orderBy: { createdAt: 'desc' }, take: 100 }) };
  }

  @Patch('users/:id/suspended')
  async suspendUser(@Param('id') id: string, @Body() body: { suspended: boolean }, @Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    return { data: await this.prisma.user.update({ where: { id }, data: { suspended: body.suspended } }) };
  }

  @Get('shops')
  async shops(@Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    return { data: await this.prisma.shop.findMany({ orderBy: { createdAt: 'desc' } }) };
  }

  @Patch('shops/:id/status')
  async shopStatus(@Param('id') id: string, @Body() body: { status: 'APPROVED' | 'REJECTED' | 'SUSPENDED' }, @Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    return { data: await this.prisma.shop.update({ where: { id }, data: { status: body.status, isOpen: body.status === 'APPROVED' } }) };
  }

  @Get('riders')
  async riders(@Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    return { data: await this.prisma.riderProfile.findMany({ orderBy: { createdAt: 'desc' } }) };
  }

  @Patch('riders/:id/status')
  async riderStatus(@Param('id') id: string, @Body() body: RiderStatusDto, @Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    return {
      data: await this.prisma.$transaction(async (transaction) => {
        const rider = await transaction.riderProfile.update({
          where: { userId: id },
          data: { status: body.status },
        });
        if (body.status !== 'APPROVED') {
          await transaction.riderAvailability.updateMany({
            where: { riderId: id },
            data: { online: false },
          });
        }
        await transaction.auditLog.create({
          data: {
            id: randomUUID(),
            actorId: request.user.id,
            action: `RIDER_STATUS_${body.status}`,
            entityId: id,
          },
        });
        return rider;
      }),
    };
  }

  @Get('orders')
  async orders(@Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    return { data: await this.prisma.order.findMany({ include: { customer: true, Shop: true, DeliveryAssignment: true, Payment: true }, orderBy: { createdAt: 'desc' }, take: 200 }) };
  }

  @Patch('orders/:id/status')
  async orderStatus(@Param('id') id: string, @Body() body: { status: 'PENDING_ACCEPTANCE' | 'ACCEPTED' | 'REJECTED' | 'PRINTING' | 'READY_FOR_PICKUP' | 'RIDER_ASSIGNED' | 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'DELIVERY_FAILED'; reason?: string }, @Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    const order = await this.prisma.order.update({ where: { id }, data: { status: body.status } });
    await this.prisma.orderStatusHistory.create({
      data: {
        id: randomUUID(),
        orderId: id,
        status: body.status,
        actorId: request.user.id,
        reason: body.reason,
      },
    });
    return { data: order };
  }
}
