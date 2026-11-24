import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'node:crypto';

@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview() {
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
  async users() {
    return { data: await this.prisma.user.findMany({ include: { UserRole: true, CustomerProfile: true }, orderBy: { createdAt: 'desc' }, take: 100 }) };
  }

  @Patch('users/:id/suspended')
  async suspendUser(@Param('id') id: string, @Body() body: { suspended: boolean }) {
    return { data: await this.prisma.user.update({ where: { id }, data: { suspended: body.suspended } }) };
  }

  @Get('shops')
  async shops() {
    return { data: await this.prisma.shop.findMany({ orderBy: { createdAt: 'desc' } }) };
  }

  @Patch('shops/:id/status')
  async shopStatus(@Param('id') id: string, @Body() body: { status: 'APPROVED' | 'REJECTED' | 'SUSPENDED' }) {
    return { data: await this.prisma.shop.update({ where: { id }, data: { status: body.status, isOpen: body.status === 'APPROVED' } }) };
  }

  @Get('riders')
  async riders() {
    return { data: await this.prisma.riderProfile.findMany({ orderBy: { createdAt: 'desc' } }) };
  }

  @Patch('riders/:id/status')
  async riderStatus(@Param('id') id: string, @Body() body: { status: 'APPROVED' | 'REJECTED' | 'SUSPENDED' }) {
    return { data: await this.prisma.riderProfile.update({ where: { userId: id }, data: { status: body.status } }) };
  }

  @Get('orders')
  async orders() {
    return { data: await this.prisma.order.findMany({ include: { customer: true, Shop: true, DeliveryAssignment: true, Payment: true }, orderBy: { createdAt: 'desc' }, take: 200 }) };
  }

  @Patch('orders/:id/status')
  async orderStatus(@Param('id') id: string, @Body() body: { status: 'PENDING_ACCEPTANCE' | 'ACCEPTED' | 'REJECTED' | 'PRINTING' | 'READY_FOR_PICKUP' | 'RIDER_ASSIGNED' | 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'DELIVERY_FAILED'; reason?: string }) {
    const order = await this.prisma.order.update({ where: { id }, data: { status: body.status } });
    await this.prisma.orderStatusHistory.create({
      data: {
        id: randomUUID(),
        orderId: id,
        status: body.status,
        actorId: order.customerId,
        reason: body.reason,
      },
    });
    return { data: order };
  }
}
