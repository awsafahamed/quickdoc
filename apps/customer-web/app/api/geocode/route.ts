import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side address lookup. GOOGLE_MAPS_API_KEY is read only here, so the key is never
 * sent to browsers (it must NOT be prefixed with NEXT_PUBLIC_).
 *
 * Abuse controls: same-origin requests only, bounded input, and a small per-IP budget per
 * server instance. Also restrict the key in Google Cloud to the Geocoding API.
 */
export const dynamic = 'force-dynamic';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    if (hits.size > 5000) for (const [key, value] of hits) if (value.resetAt <= now) hits.delete(key);
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

type GeocodeResponse = {
  status: string;
  results: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[];
};

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if ((origin && origin !== request.nextUrl.origin) || (fetchSite && !['same-origin', 'none'].includes(fetchSite))) {
    return NextResponse.json({ message: 'Address lookup is only available from QuickDoc.' }, { status: 403 });
  }
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json({ message: 'Address lookup is not configured. Use your current location instead.' }, { status: 503 });
  }
  const address = request.nextUrl.searchParams.get('address')?.trim() ?? '';
  if (address.length < 5 || address.length > 300) {
    return NextResponse.json({ message: 'Enter a complete address to look it up.' }, { status: 400 });
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ message: 'Too many address lookups. Wait a minute and try again.' }, { status: 429 });
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('region', process.env.GOOGLE_MAPS_REGION ?? 'lk');
  url.searchParams.set('key', key);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const result = await response.json() as GeocodeResponse;
    if (result.status === 'ZERO_RESULTS') {
      return NextResponse.json({ message: 'That address could not be found. Add the street, area and city.' }, { status: 404 });
    }
    if (result.status !== 'OK' || !result.results.length) {
      // REQUEST_DENIED / OVER_QUERY_LIMIT usually mean the key or its restrictions need attention.
      console.error(`Google geocoding failed with status ${result.status}`);
      return NextResponse.json({ message: 'Address lookup is temporarily unavailable. Use your current location instead.' }, { status: 502 });
    }
    const best = result.results[0];
    return NextResponse.json({
      data: {
        formattedAddress: best.formatted_address,
        latitude: Number(best.geometry.location.lat.toFixed(7)),
        longitude: Number(best.geometry.location.lng.toFixed(7)),
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ message: 'Address lookup is temporarily unavailable. Use your current location instead.' }, { status: 502 });
  }
}
