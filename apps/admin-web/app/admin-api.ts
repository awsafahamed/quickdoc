export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

async function readError(response: Response) {
  let message = `Request failed (${response.status})`;
  try {
    const body = await response.json() as { message?: string | string[]; error?: string };
    const detail = body.message ?? body.error;
    if (Array.isArray(detail)) message = detail.join('. ');
    else if (detail) message = detail;
  } catch {
    // Keep the HTTP status message when the server does not return JSON.
  }
  return message;
}

function routeFor(path: string) {
  if (path === '/auth/session') return '/api/admin-auth/session';
  if (path === '/auth/logout') return '/api/admin-auth/logout';
  return `/api${path}`;
}

async function request<T>(url: string, init: RequestInit) {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    if (typeof init.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    response = await fetch(url, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new AdminApiError('Could not reach the admin API. Check your connection and try again.');
  }
  if (!response.ok) throw new AdminApiError(await readError(response), response.status);
  return response.json() as Promise<T>;
}

export function adminRequest<T>(path: string, init: RequestInit = {}) {
  return request<T>(routeFor(path), init);
}

export async function adminLogin(email: string, password: string) {
  const result = await request<{
    data: { id: string; email: string; roles: string[] };
  }>('/api/admin-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!result.data.roles.includes('ADMIN')) {
    throw new AdminApiError('This account does not have administrator access.', 403);
  }
  return result.data;
}

export async function adminLogout() {
  await request('/api/admin-auth/logout', { method: 'POST' });
}
