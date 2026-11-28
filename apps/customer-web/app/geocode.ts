export type GeocodedAddress = { formattedAddress: string; latitude: number; longitude: number };

/** Looks up coordinates for a typed address through this portal's server-side geocoding route. */
export async function geocodeAddress(address: string): Promise<GeocodedAddress> {
  const response = await fetch(`/api/geocode?address=${encodeURIComponent(address.trim())}`, { cache: 'no-store' });
  const result = await response.json().catch(() => null) as { data?: GeocodedAddress; message?: string } | null;
  if (!response.ok || !result?.data) throw new Error(result?.message ?? 'Address lookup is unavailable right now.');
  return result.data;
}
