import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookies, forwardAdminRequest } from '../../admin-proxy';

export async function GET(request: NextRequest) {
  let upstream: NextResponse;
  try {
    upstream = await forwardAdminRequest(request, '/auth/session', 'GET');
  } catch {
    return NextResponse.json({ message: 'Could not verify the administrator session.' }, { status: 502 });
  }
  if (!upstream.ok) return upstream;

  const result = await upstream.clone().json() as { data?: { id?: string; email?: string; roles?: string[] } };
  if (!result.data?.roles?.includes('ADMIN')) {
    const response = NextResponse.json({ message: 'Administrator access is required.' }, { status: 403 });
    clearSessionCookies(response);
    return response;
  }
  return upstream;
}
