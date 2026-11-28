/** Great-circle distance between two coordinates in kilometres. */
export function distanceInKm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

/** Roads are longer than straight lines; this factor approximates urban routing. */
const ROAD_DISTANCE_FACTOR = 1.3;

export function maxDeliveryDistanceKm(): number {
  const configured = Number(process.env.MAX_DELIVERY_DISTANCE_KM);
  return Number.isFinite(configured) && configured > 0 ? configured : 50;
}

/** Billable delivery distance from the shop to the customer, rounded to 0.1 km. */
export function deliveryDistanceKm(
  shop: { latitude: unknown; longitude: unknown },
  destination: { latitude: number; longitude: number },
): number {
  const straightLine = distanceInKm(
    Number(shop.latitude),
    Number(shop.longitude),
    destination.latitude,
    destination.longitude,
  );
  return Math.round(straightLine * ROAD_DISTANCE_FACTOR * 10) / 10;
}
