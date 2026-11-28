import { NextRequest, NextResponse } from 'next/server';
import { forwardAdminRequest, hasSameOrigin } from '../../admin-proxy';

const allowedSections = new Set([
  'overview',
  'users',
  'shops',
  'riders',
  'agents',
  'orders',
  'services',
  'catalog',
  'finance',
  'settlements',
  'support',
  'settings',
  'audit',
]);

async function proxy(request: NextRequest, method: 'GET' | 'PATCH' | 'POST') {
  const apiPath = `/admin${request.nextUrl.pathname.slice('/api/admin'.length)}`;
  const section = request.nextUrl.pathname.slice('/api/admin/'.length).split('/')[0];
  if (!section || !allowedSections.has(section)) {
    return NextResponse.json({ message: 'Admin endpoint was not found.' }, { status: 404 });
  }
  if (method !== 'GET' && !hasSameOrigin(request)) {
    return NextResponse.json({ message: 'Invalid request origin.' }, { status: 403 });
  }
  try {
    return await forwardAdminRequest(request, apiPath, method);
  } catch {
    return NextResponse.json({ message: 'The admin API could not be reached. Try again.' }, { status: 502 });
  }
}

export function GET(request: NextRequest) {
  return proxy(request, 'GET');
}

export function PATCH(request: NextRequest) {
  return proxy(request, 'PATCH');
}

export function POST(request: NextRequest) {
  return proxy(request, 'POST');
}
