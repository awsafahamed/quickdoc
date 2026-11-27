import { NextRequest, NextResponse } from 'next/server';

const API_BASE = (
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001/api/v1'
).replace(/\/+$/, '');
const ACCESS_COOKIE = 'quickdoc_admin_access';
const REFRESH_COOKIE = 'quickdoc_admin_refresh';
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

type TokenPair = { accessToken: string; refreshToken: string; expiresIn?: number };

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api',
    maxAge,
  };
}

export function hasSameOrigin(request: NextRequest) {
  return request.headers.get('origin') === new URL(request.url).origin;
}

export function setSessionCookies(response: NextResponse, tokens: TokenPair) {
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, cookieOptions(tokens.expiresIn ?? 900));
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(REFRESH_MAX_AGE));
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, '', { ...cookieOptions(0), expires: new Date(0) });
  response.cookies.set(REFRESH_COOKIE, '', { ...cookieOptions(0), expires: new Date(0) });
}

async function rotateTokens(refreshToken: string): Promise<TokenPair | null> {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const result = await response.json() as { data: TokenPair };
  return result.data;
}

function responseFrom(upstream: Response) {
  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('cache-control', 'no-store');
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

export async function forwardAdminRequest(
  request: NextRequest,
  apiPath: string,
  method: 'GET' | 'PATCH' | 'POST',
) {
  const incomingAccess = request.cookies.get(ACCESS_COOKIE)?.value;
  let refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  let tokens: TokenPair | null = incomingAccess
    ? { accessToken: incomingAccess, refreshToken: refreshToken ?? '' }
    : refreshToken
      ? await rotateTokens(refreshToken)
      : null;
  if (!incomingAccess && tokens) refreshToken = tokens.refreshToken;

  if (!tokens?.accessToken) {
    const response = NextResponse.json({ message: 'Your session has expired. Sign in again.' }, { status: 401 });
    clearSessionCookies(response);
    return response;
  }

  const send = async (accessToken: string) => {
    const headers = new Headers({ Authorization: `Bearer ${accessToken}` });
    let body: ArrayBuffer | undefined;
    if (method !== 'GET') {
      body = await request.arrayBuffer();
      const contentType = request.headers.get('content-type');
      if (contentType) headers.set('Content-Type', contentType);
    }
    return fetch(`${API_BASE}${apiPath}${request.nextUrl.search}`, {
      method,
      headers,
      body,
      cache: 'no-store',
    });
  };

  let upstream = await send(tokens.accessToken);
  if (upstream.status === 401 && refreshToken) {
    const rotated = await rotateTokens(refreshToken);
    if (rotated) {
      tokens = rotated;
      refreshToken = rotated.refreshToken;
      upstream = await send(tokens.accessToken);
    }
  }

  const response = responseFrom(upstream);
  if (upstream.status === 401 || upstream.status === 403) {
    clearSessionCookies(response);
  } else if (tokens.refreshToken) {
    setSessionCookies(response, tokens);
  }
  return response;
}

export async function requestApi(path: string, init: RequestInit) {
  return fetch(`${API_BASE}${path}`, { ...init, cache: 'no-store' });
}
