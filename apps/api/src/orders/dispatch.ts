import type { Order, Prisma, Shop } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { distanceInKm } from '../common/geo';

type Tx = Prisma.TransactionClient;

export const RIDER_DISPATCH_RADIUS_KM = 8;
export const RIDER_LOCATION_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Offers a ready order to approved, online, idle riders within range of the shop.
 * Riders who already declined or released this order are not asked again.
 * Returns the number of riders notified.
 */
export async function offerToNearbyRiders(
  transaction: Tx,
  order: Pick<Order, 'id' | 'reference' | 'deliveryFee'>,
  shop: Pick<Shop, 'latitude' | 'longitude'>,
): Promise<number> {
  const riders = await transaction.riderProfile.findMany({
    where: {
      status: 'APPROVED',
      RiderAvailability: {
        is: {
          online: true,
          latitude: { not: null },
          longitude: { not: null },
          updatedAt: { gte: new Date(Date.now() - RIDER_LOCATION_MAX_AGE_MS) },
        },
      },
      DeliveryAssignment: {
        none: { Order: { status: { in: ['RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] } } },
      },
      DeliveryOffer: {
        none: { orderId: order.id, status: { in: ['REJECTED', 'RELEASED'] } },
      },
    },
    select: {
      userId: true,
      RiderAvailability: { select: { latitude: true, longitude: true } },
    },
  });
  const shopLatitude = Number(shop.latitude);
  const shopLongitude = Number(shop.longitude);
  const nearby = riders.flatMap((rider) => {
    const location = rider.RiderAvailability;
    if (location?.latitude == null || location.longitude == null) return [];
    const distance = distanceInKm(shopLatitude, shopLongitude, Number(location.latitude), Number(location.longitude));
    return distance <= RIDER_DISPATCH_RADIUS_KM ? [{ riderId: rider.userId, distance }] : [];
  }).sort((left, right) => left.distance - right.distance);

  if (!nearby.length) return 0;
  const now = new Date();
  await transaction.deliveryOffer.createMany({
    data: nearby.map(({ riderId, distance }) => ({
      id: randomUUID(),
      orderId: order.id,
      riderId,
      distanceKm: Number(distance.toFixed(2)),
      earnings: order.deliveryFee,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    })),
  });
  await transaction.notification.createMany({
    data: nearby.map(({ riderId }) => ({
      id: randomUUID(),
      userId: riderId,
      title: 'Nearby delivery available',
      body: `Order ${order.reference} is ready for delivery. Open delivery requests to review it.`,
      createdAt: now,
    })),
  });
  return nearby.length;
}
