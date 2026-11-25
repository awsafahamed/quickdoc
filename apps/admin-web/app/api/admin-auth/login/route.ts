import { NextRequest, NextResponse } from 'next/server';
import { hasSameOrigin, requestApi, setSessionCookies } from '../../admin-proxy';

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ message: 'Invalid request origin.' }, { status: 403 });
  }

  let credentials: { email?: string; password?: string };
  try {
    credentials = await request.json();
  } catch {
    return NextResponse.json({ message: 'Enter a valid email and password.' }, { status: 400 });
  }
  if (typeof credentials.email !== 'string' || typeof credentials.password !== 'string') {
    return NextResponse.json({ message: 'Enter a valid email and password.' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await requestApi('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: credentials.email, password: credentials.password }),
    });
  } catch {
    return NextResponse.json({ message: 'Could not reach the API. Check your connection and try again.' }, { status: 502 });
  }
  if (!upstream.ok) {
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  }

  const result = await upstream.json() as {
    data: { accessToken: string; refreshToken: string; expiresIn?: number; user: { id: string; email: string; roles: string[] } };
  };
  if (!result.data?.user?.roles?.includes('ADMIN')) {
    try {
      const revoke = await requestApi('/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: result.data.refreshToken }),
      });
      if (!revoke.ok) {
        return NextResponse.json({ message: 'Administrator access is required, and the session could not be revoked.' }, { status: 502 });
      }
    } catch {
      return NextResponse.json({ message: 'Administrator access is required, and the session could not be revoked.' }, { status: 502 });
    }
    return NextResponse.json({ message: 'This account does not have administrator access.' }, { status: 403 });
  }

  const response = NextResponse.json({ data: result.data.user });
  setSessionCookies(response, result.data);
  return response;
}
