import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { randomUUID } from 'node:crypto';
import { calculateDeliveryFare, DeliveryFareRequest, VehicleTier } from './delivery-pricing';

class AvailabilityDto {
  @IsUUID()
  riderId!: string;

  @IsBoolean()
  online!: boolean;

  @Type(() => Number)
  @IsOptional()
  latitude?: number;

  @Type(() => Number)
  @IsOptional()
  longitude?: number;
}

class RiderProfileDto {
  @IsString()
  phone!: string;

  @IsString()
  vehicleType!: 'BIKE' | 'TUK' | 'CAR';

  @IsOptional()
  @IsString()
  registration?: string;
}

class LocationDto {
  @Type(() => Number)
  latitude!: number;

  @Type(() => Number)
  longitude!: number;
}

@Controller('riders')
export class RidersController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('delivery-fare')
  async deliveryFare(@Body() body: DeliveryFareRequest) {
    if (!body.distanceKm || body.distanceKm < 0 || body.distanceKm > 200) throw new BadRequestException('Distance must be between 0.1 and 200 km');
    if (!['FLASH_BIKE', 'FLASH_TUK', 'FLASH_CAR'].includes(body.tier)) throw new BadRequestException('Invalid vehicle tier');
    if (!['NORMAL', 'RUSH', 'WEEKEND', 'WEATHER', 'LOW_AVAILABILITY'].includes(body.demand)) throw new BadRequestException('Invalid demand level');
    return { data: calculateDeliveryFare(body) };
  }

  @Post('register')
  @UseGuards(AuthGuard('jwt'))
  async register(@Req() req: { user: { id: string } }, @Body() dto: RiderProfileDto) {
    const existing = await this.prisma.riderProfile.findUnique({ where: { userId: req.user.id } });
    if (existing) return { data: existing };
    return { data: await this.prisma.riderProfile.create({ data: { userId: req.user.id, phone: dto.phone, vehicleType: dto.vehicleType, registration: dto.registration, status: 'APPROVED', updatedAt: new Date() } }) };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async me(@Req() req: { user: { id: string } }) {
    return { data: await this.prisma.riderProfile.findUnique({ where: { userId: req.user.id }, include: { RiderAvailability: true, Settlement: true } }) };
  }

  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  async updateMe(@Req() req: { user: { id: string } }, @Body() dto: RiderProfileDto) {
    return { data: await this.prisma.riderProfile.upsert({ where: { userId: req.user.id }, create: { userId: req.user.id, phone: dto.phone, vehicleType: dto.vehicleType, registration: dto.registration, status: 'APPROVED', updatedAt: new Date() }, update: { phone: dto.phone, vehicleType: dto.vehicleType, registration: dto.registration, updatedAt: new Date() } }) };
  }

  @Post('availability')
  @UseGuards(AuthGuard('jwt'))
  async availability(@Body() dto: AvailabilityDto) {
    const profile = await this.prisma.riderProfile.findUnique({ where: { userId: dto.riderId } });
    if (!profile || profile.status !== 'APPROVED') {
      return { error: 'Rider must be approved before changing availability' };
    }
    const availability = await this.prisma.riderAvailability.upsert({
      where: { riderId: dto.riderId },
      create: {
        riderId: dto.riderId,
        online: dto.online,
        latitude: dto.latitude,
        longitude: dto.longitude,
        updatedAt: new Date(),
      },
      update: {
        online: dto.online,
        latitude: dto.latitude,
        longitude: dto.longitude,
        updatedAt: new Date(),
      },
    });
    return { data: availability };
  }

  @Get(':riderId/assignments')
  async assignments(@Param('riderId') riderId: string) {
    return {
      data: await this.prisma.deliveryAssignment.findMany({
        where: { riderId },
        include: { Order: true, DeliveryStatusHistory: { orderBy: { createdAt: 'desc' }, take: 1 } },
        orderBy: { assignedAt: 'desc' },
      }),
    };
  }

  @Post('assignments/:id/accept')
  async accept(@Param('id') id: string, @Body() body: { riderId: string }) {
    if (!body.riderId) return { error: 'riderId is required' };
    const assignment = await this.prisma.deliveryAssignment.findUnique({ where: { id } });
    if (!assignment || assignment.riderId !== body.riderId) {
      return { error: 'Delivery assignment was not found for this rider' };
    }
    await this.prisma.deliveryStatusHistory.create({
      data: {
        id: randomUUID(),
        assignmentId: id,
        status: 'ACCEPTED',
        createdAt: new Date(),
      },
    });
    return { data: await this.prisma.deliveryAssignment.findUnique({ where: { id }, include: { DeliveryStatusHistory: { orderBy: { createdAt: 'desc' } } } }) };
  }

  @Post('assignments/:id/reject')
  async reject(@Param('id') id: string, @Body() body: { riderId: string; reason?: string }) {
    const assignment = await this.prisma.deliveryAssignment.findUnique({ where: { id } });
    if (!assignment || assignment.riderId !== body.riderId) throw new BadRequestException('Delivery assignment was not found for this rider');
    await this.prisma.deliveryStatusHistory.create({ data: { id: randomUUID(), assignmentId: id, status: 'REJECTED', reason: body.reason, createdAt: new Date() } });
    return { data: { rejected: true } };
  }

  @Post('assignments/:id/status')
  async assignmentStatus(@Param('id') id: string, @Body() body: { riderId: string; status: 'ARRIVED_PICKUP' | 'PICKED_UP' | 'ARRIVED_DROPOFF' | 'DELIVERED' | 'FAILED'; reason?: string; otpVerified?: boolean }) {
    const assignment = await this.prisma.deliveryAssignment.findUnique({ where: { id }, include: { Order: true } });
    if (!assignment || assignment.riderId !== body.riderId) throw new BadRequestException('Delivery assignment was not found for this rider');
    if ((body.status === 'PICKED_UP' || body.status === 'DELIVERED') && !body.otpVerified) throw new BadRequestException('Handover OTP verification is required');
    await this.prisma.$transaction([
      this.prisma.deliveryStatusHistory.create({ data: { id: randomUUID(), assignmentId: id, status: body.status, reason: body.reason, createdAt: new Date() } }),
      this.prisma.order.update({ where: { id: assignment.orderId }, data: { status: body.status === 'PICKED_UP' ? 'PICKED_UP' : body.status === 'DELIVERED' ? 'DELIVERED' : body.status === 'ARRIVED_PICKUP' ? 'RIDER_ASSIGNED' : assignment.Order.status } }),
    ]);
    return { data: await this.prisma.deliveryAssignment.findUnique({ where: { id }, include: { DeliveryStatusHistory: { orderBy: { createdAt: 'desc' } } } }) };
  }

  @Post('assignments/:id/location')
  async location(@Param('id') id: string, @Body() body: LocationDto & { riderId: string }) {
    const assignment = await this.prisma.deliveryAssignment.findUnique({ where: { id } });
    if (!assignment || assignment.riderId !== body.riderId) throw new BadRequestException('Delivery assignment was not found for this rider');
    await this.prisma.riderAvailability.upsert({ where: { riderId: body.riderId }, create: { riderId: body.riderId, online: true, latitude: body.latitude, longitude: body.longitude, updatedAt: new Date() }, update: { latitude: body.latitude, longitude: body.longitude, updatedAt: new Date() } });
    return { data: { recorded: true } };
  }

  @Get(':riderId/earnings')
  async earnings(@Param('riderId') riderId: string) {
    const settlements = await this.prisma.settlement.findMany({ where: { riderId }, orderBy: { createdAt: 'desc' } });
    return { data: { earned: settlements.reduce((sum, item) => sum + Number(item.amount), 0), pending: settlements.filter((item) => item.status === 'PENDING').reduce((sum, item) => sum + Number(item.amount), 0), settlements } };
  }
}
