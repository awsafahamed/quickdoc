import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { calculateDeliveryFare } from './delivery-pricing';

class DeliveryFareDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(200)
  distanceKm!: number;

  @IsIn(['FLASH_BIKE', 'FLASH_TUK', 'FLASH_CAR'])
  tier!: 'FLASH_BIKE' | 'FLASH_TUK' | 'FLASH_CAR';

  @IsIn(['NORMAL', 'RUSH', 'WEEKEND', 'WEATHER', 'LOW_AVAILABILITY'])
  demand!: 'NORMAL' | 'RUSH' | 'WEEKEND' | 'WEATHER' | 'LOW_AVAILABILITY';
}

class RiderProfileDto {
  @IsString()
  @Matches(/^\+94[0-9]{9}$/)
  phone!: string;

  @IsIn(['BIKE', 'TUK', 'CAR'])
  vehicleType!: 'BIKE' | 'TUK' | 'CAR';

  @IsOptional()
  @IsString()
  @Length(1, 40)
  registration?: string;
}

class AvailabilityDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsBoolean()
  online!: boolean;
}

class RejectAssignmentDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}

class AssignmentStatusDto {
  @IsIn(['ARRIVED_PICKUP', 'PICKED_UP', 'ARRIVED_DROPOFF', 'DELIVERED', 'FAILED'])
  status!: 'ARRIVED_PICKUP' | 'PICKED_UP' | 'ARRIVED_DROPOFF' | 'DELIVERED' | 'FAILED';

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;

  @IsOptional()
  @Matches(/^[A-Fa-f0-9]{6}$/)
  handoverCode?: string;
}

class LocationDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}

type AuthenticatedRequest = { user: { id: string; roles: string[] } };

const statusTransitions = {
  ARRIVED_PICKUP: { from: ['RIDER_ASSIGNED'], to: 'RIDER_ASSIGNED' },
  PICKED_UP: { from: ['RIDER_ASSIGNED'], to: 'PICKED_UP' },
  ARRIVED_DROPOFF: { from: ['PICKED_UP'], to: 'OUT_FOR_DELIVERY' },
  DELIVERED: { from: ['OUT_FOR_DELIVERY'], to: 'DELIVERED' },
  FAILED: {
    from: ['RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'],
    to: 'DELIVERY_FAILED',
  },
} as const;

@Controller('riders')
export class RidersController {
  constructor(private readonly prisma: PrismaService) {}

  private assertRider(request: AuthenticatedRequest) {
    if (!request.user.roles.includes('RIDER')) {
      throw new ForbiddenException('A rider account is required');
    }
  }

  private async profileFor(request: AuthenticatedRequest) {
    this.assertRider(request);
    const profile = await this.prisma.riderProfile.findUnique({
      where: { userId: request.user.id },
    });
    if (!profile) throw new NotFoundException('Complete your rider profile first');
    return profile;
  }

  private async approvedProfileFor(request: AuthenticatedRequest) {
    const profile = await this.profileFor(request);
    if (profile.status !== 'APPROVED') {
      throw new ForbiddenException('Rider approval is required for this action');
    }
    return profile;
  }

  private matchesHandoverCode(code: string, storedHash: string): boolean {
    const suppliedHash = createHash('sha256').update(code.toUpperCase()).digest();
    const expectedHash = Buffer.from(storedHash, 'hex');
    return expectedHash.length === suppliedHash.length
      && timingSafeEqual(expectedHash, suppliedHash);
  }

  @Post('delivery-fare')
  async deliveryFare(@Body() request: DeliveryFareDto) {
    return { data: calculateDeliveryFare(request) };
  }

  @Post('register')
  @UseGuards(AuthGuard('jwt'))
  async register(@Req() request: AuthenticatedRequest, @Body() dto: RiderProfileDto) {
    this.assertRider(request);
    return {
      data: await this.prisma.riderProfile.upsert({
        where: { userId: request.user.id },
        create: {
          userId: request.user.id,
          phone: dto.phone,
          vehicleType: dto.vehicleType,
          registration: dto.registration,
          status: 'PENDING',
          updatedAt: new Date(),
        },
        update: {
          phone: dto.phone,
          vehicleType: dto.vehicleType,
          registration: dto.registration,
          updatedAt: new Date(),
        },
      }),
    };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async me(@Req() request: AuthenticatedRequest) {
    const profile = await this.profileFor(request);
    return {
      data: await this.prisma.riderProfile.findUnique({
        where: { userId: profile.userId },
        include: { RiderAvailability: true },
      }),
    };
  }

  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  async updateMe(@Req() request: AuthenticatedRequest, @Body() dto: RiderProfileDto) {
    this.assertRider(request);
    return {
      data: await this.prisma.riderProfile.upsert({
        where: { userId: request.user.id },
        create: {
          userId: request.user.id,
          phone: dto.phone,
          vehicleType: dto.vehicleType,
          registration: dto.registration,
          status: 'PENDING',
          updatedAt: new Date(),
        },
        update: {
          phone: dto.phone,
          vehicleType: dto.vehicleType,
          registration: dto.registration,
          updatedAt: new Date(),
        },
      }),
    };
  }

  @Post('availability')
  @UseGuards(AuthGuard('jwt'))
  async availability(
    @Req() request: AuthenticatedRequest,
    @Body() dto: AvailabilityDto,
  ) {
    const profile = await this.profileFor(request);
    if (dto.online && profile.status !== 'APPROVED') {
      throw new ForbiddenException('Only approved riders can go online');
    }
    return {
      data: await this.prisma.riderAvailability.upsert({
        where: { riderId: profile.userId },
        create: {
          riderId: profile.userId,
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
      }),
    };
  }

  @Get('me/assignments')
  @UseGuards(AuthGuard('jwt'))
  async assignments(@Req() request: AuthenticatedRequest) {
    const profile = await this.approvedProfileFor(request);
    return {
      data: await this.prisma.deliveryAssignment.findMany({
        where: { riderId: profile.userId },
        select: {
          id: true,
          earnings: true,
          assignedAt: true,
          Order: {
            select: {
              id: true,
              reference: true,
              status: true,
              deliveryAddress: true,
            },
          },
          DeliveryStatusHistory: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { assignedAt: 'desc' },
      }),
    };
  }

  @Get('me/offers')
  @UseGuards(AuthGuard('jwt'))
  async offers(@Req() request: AuthenticatedRequest) {
    const profile = await this.approvedProfileFor(request);
    return {
      data: await this.prisma.deliveryOffer.findMany({
        where: {
          riderId: profile.userId,
          status: 'PENDING',
          Order: { is: { status: 'READY_FOR_PICKUP' } },
        },
        select: {
          id: true,
          distanceKm: true,
          earnings: true,
          createdAt: true,
          Order: {
            select: {
              reference: true,
              Shop: { select: { name: true, address: true } },
            },
          },
        },
        orderBy: [{ distanceKm: 'asc' }, { createdAt: 'asc' }],
      }),
    };
  }

  @Post('me/offers/:offerId/accept')
  @UseGuards(AuthGuard('jwt'))
  async acceptOffer(
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const profile = await this.approvedProfileFor(request);
    const offer = await this.prisma.deliveryOffer.findFirst({
      where: {
        id: offerId,
        riderId: profile.userId,
        status: 'PENDING',
        Order: { is: { status: 'READY_FOR_PICKUP' } },
      },
      include: { Order: { include: { Shop: true } } },
    });
    if (!offer) throw new NotFoundException('This delivery offer is no longer available');

    return {
      data: await this.prisma.$transaction(async (transaction) => {
        const claimed = await transaction.order.updateMany({
          where: { id: offer.orderId, status: 'READY_FOR_PICKUP' },
          data: { status: 'RIDER_ASSIGNED' },
        });
        if (claimed.count !== 1) {
          throw new ConflictException('Another rider has already accepted this delivery');
        }
        const accepted = await transaction.deliveryOffer.updateMany({
          where: { id: offer.id, riderId: profile.userId, status: 'PENDING' },
          data: { status: 'ACCEPTED', updatedAt: new Date() },
        });
        if (accepted.count !== 1) {
          throw new ConflictException('This delivery offer is no longer available');
        }

        const now = new Date();
        const assignment = await transaction.deliveryAssignment.create({
          data: {
            id: randomUUID(),
            orderId: offer.orderId,
            riderId: profile.userId,
            earnings: offer.earnings,
            assignedAt: now,
            updatedAt: now,
          },
        });
        await transaction.deliveryStatusHistory.create({
          data: {
            id: randomUUID(),
            assignmentId: assignment.id,
            status: 'ACCEPTED',
          },
        });
        await transaction.orderStatusHistory.create({
          data: {
            id: randomUUID(),
            orderId: offer.orderId,
            status: 'RIDER_ASSIGNED',
            actorId: request.user.id,
            reason: 'Accepted nearby rider offer',
          },
        });
        await transaction.deliveryOffer.updateMany({
          where: { orderId: offer.orderId, status: 'PENDING' },
          data: { status: 'EXPIRED', updatedAt: now },
        });
        await transaction.notification.createMany({
          data: [
            {
              id: randomUUID(),
              userId: offer.Order.customerId,
              title: 'Rider assigned',
              body: `A rider accepted delivery for order ${offer.Order.reference}.`,
              createdAt: now,
            },
            {
              id: randomUUID(),
              userId: offer.Order.Shop.ownerId,
              title: 'Rider accepted delivery',
              body: `A rider accepted delivery for order ${offer.Order.reference}.`,
              createdAt: now,
            },
          ],
        });
        return assignment;
      }),
    };
  }

  @Post('me/offers/:offerId/reject')
  @UseGuards(AuthGuard('jwt'))
  async rejectOffer(
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const profile = await this.approvedProfileFor(request);
    const rejected = await this.prisma.deliveryOffer.updateMany({
      where: {
        id: offerId,
        riderId: profile.userId,
        status: 'PENDING',
        Order: { is: { status: 'READY_FOR_PICKUP' } },
      },
      data: { status: 'REJECTED', updatedAt: new Date() },
    });
    if (!rejected.count) {
      throw new NotFoundException('This delivery offer is no longer available');
    }
    return { data: { rejected: true } };
  }

  @Get('me/notifications')
  @UseGuards(AuthGuard('jwt'))
  async notifications(@Req() request: AuthenticatedRequest) {
    await this.profileFor(request);
    return {
      data: await this.prisma.notification.findMany({
        where: { userId: request.user.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    };
  }

  @Patch('me/notifications/:notificationId/read')
  @UseGuards(AuthGuard('jwt'))
  async markNotificationRead(
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.profileFor(request);
    const updated = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId: request.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (!updated.count) {
      const notification = await this.prisma.notification.findFirst({
        where: { id: notificationId, userId: request.user.id },
        select: { id: true },
      });
      if (!notification) throw new NotFoundException('Notification was not found');
    }
    return { data: { read: true } };
  }

  @Post('assignments/:id/accept')
  @UseGuards(AuthGuard('jwt'))
  async accept(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const profile = await this.approvedProfileFor(request);
    const assignment = await this.prisma.deliveryAssignment.findFirst({
      where: { id, riderId: profile.userId },
      include: { Order: { include: { Shop: true } } },
    });
    if (!assignment) throw new NotFoundException('Delivery assignment was not found');
    if (assignment.Order.status !== 'RIDER_ASSIGNED') {
      throw new ConflictException('This delivery is no longer available');
    }
    return {
      data: await this.prisma.deliveryStatusHistory.create({
        data: {
          id: randomUUID(),
          assignmentId: id,
          status: 'ACCEPTED',
        },
      }),
    };
  }

  @Post('assignments/:id/reject')
  @UseGuards(AuthGuard('jwt'))
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectAssignmentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const profile = await this.approvedProfileFor(request);
    const assignment = await this.prisma.deliveryAssignment.findFirst({
      where: { id, riderId: profile.userId },
      include: { Order: { include: { Shop: true } } },
    });
    if (!assignment) throw new NotFoundException('Delivery assignment was not found');
    if (assignment.Order.status !== 'RIDER_ASSIGNED') {
      throw new ConflictException('This delivery is no longer available');
    }
    return {
      data: await this.prisma.deliveryStatusHistory.create({
        data: {
          id: randomUUID(),
          assignmentId: id,
          status: 'REJECTED',
          reason: dto.reason,
        },
      }),
    };
  }

  @Post('assignments/:id/status')
  @UseGuards(AuthGuard('jwt'))
  async assignmentStatus(
    @Param('id') id: string,
    @Body() dto: AssignmentStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const profile = await this.approvedProfileFor(request);
    const assignment = await this.prisma.deliveryAssignment.findFirst({
      where: { id, riderId: profile.userId },
      include: { Order: { include: { Shop: true } } },
    });
    if (!assignment) throw new NotFoundException('Delivery assignment was not found');
    const transition = statusTransitions[dto.status];
    if (!transition.from.some((status) => status === assignment.Order.status)) {
      throw new ConflictException('This delivery cannot make that status transition');
    }
    if (dto.status === 'FAILED' && !dto.reason?.trim()) {
      throw new BadRequestException('A reason is required when a delivery fails');
    }
    const codeField = dto.status === 'PICKED_UP'
      ? 'pickupCodeHash'
      : dto.status === 'DELIVERED'
        ? 'deliveryPinHash'
        : undefined;
    if (codeField) {
      if (!dto.handoverCode
        || !this.matchesHandoverCode(dto.handoverCode, assignment.Order[codeField])) {
        throw new BadRequestException('A valid handover code is required');
      }
    }

    return {
      data: await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.order.updateMany({
          where: {
            id: assignment.orderId,
            status: { in: [...transition.from] },
          },
          data: { status: transition.to },
        });
        if (updated.count !== 1) {
          throw new ConflictException('This delivery changed; refresh and try again');
        }
        const history = await transaction.deliveryStatusHistory.create({
          data: {
            id: randomUUID(),
            assignmentId: id,
            status: dto.status,
            reason: dto.reason,
          },
        });
        if (assignment.Order.status !== transition.to) {
          await transaction.orderStatusHistory.create({
            data: {
              id: randomUUID(),
              orderId: assignment.orderId,
              status: transition.to,
              actorId: request.user.id,
              reason: dto.reason,
            },
          });
        }
        const progressMessages: Partial<Record<typeof dto.status, string>> = {
          ARRIVED_PICKUP: `A rider arrived at the shop for order ${assignment.Order.reference}.`,
          PICKED_UP: `Order ${assignment.Order.reference} has been picked up.`,
          ARRIVED_DROPOFF: `Order ${assignment.Order.reference} is out for delivery.`,
          DELIVERED: `Order ${assignment.Order.reference} was delivered. Confirm receipt in your QuickDoc account.`,
          FAILED: `Delivery for order ${assignment.Order.reference} could not be completed${dto.reason?.trim() ? `: ${dto.reason.trim()}` : '.'}`,
        };
        const message = progressMessages[dto.status];
        const recipients = [...new Set([
          assignment.Order.customerId,
          assignment.Order.Shop?.ownerId,
        ].filter((userId): userId is string => Boolean(userId)))];
        if (message && recipients.length) {
          await transaction.notification.createMany({
            data: recipients.map((userId) => ({
              id: randomUUID(),
              userId,
              title: 'Delivery status update',
              body: message,
              createdAt: new Date(),
            })),
          });
        }
        return history;
      }),
    };
  }

  @Post('assignments/:id/location')
  @UseGuards(AuthGuard('jwt'))
  async location(
    @Param('id') id: string,
    @Body() dto: LocationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const profile = await this.approvedProfileFor(request);
    const assignment = await this.prisma.deliveryAssignment.findFirst({
      where: { id, riderId: profile.userId },
      select: { id: true },
    });
    if (!assignment) throw new NotFoundException('Delivery assignment was not found');
    return {
      data: await this.prisma.riderAvailability.upsert({
        where: { riderId: profile.userId },
        create: {
          riderId: profile.userId,
          online: true,
          latitude: dto.latitude,
          longitude: dto.longitude,
          updatedAt: new Date(),
        },
        update: {
          latitude: dto.latitude,
          longitude: dto.longitude,
          updatedAt: new Date(),
        },
      }),
    };
  }

  @Get('me/earnings')
  @UseGuards(AuthGuard('jwt'))
  async earnings(@Req() request: AuthenticatedRequest) {
    const profile = await this.profileFor(request);
    const settlements = await this.prisma.settlement.findMany({
      where: { riderId: profile.userId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      data: {
        earned: settlements.reduce((sum, item) => sum + Number(item.amount), 0),
        pending: settlements
          .filter((item) => item.status === 'PENDING')
          .reduce((sum, item) => sum + Number(item.amount), 0),
        settlements,
      },
    };
  }
}
