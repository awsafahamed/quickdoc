import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookies, hasSameOrigin, requestApi } from '../../admin-proxy';

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ message: 'Invalid request origin.' }, { status: 403 });
  }

  const refreshToken = request.cookies.get('quickdoc_admin_refresh')?.value;
  let response: NextResponse;
  if (refreshToken) {
    try {
      const upstream = await requestApi('/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (upstream.ok) {
        response = NextResponse.json({ data: { loggedOut: true } });
      } else {
        response = NextResponse.json({ message: 'The server could not revoke the session.' }, { status: 502 });
      }
    } catch {
      response = NextResponse.json({ message: 'The server could not confirm sign-out.' }, { status: 502 });
    }
  } else {
    response = NextResponse.json({ data: { loggedOut: true } });
  }
  clearSessionCookies(response);
  return response;
}
