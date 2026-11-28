'use client';

/**
 * Keeps a signed-in portal session alive across the API's 15-minute access tokens.
 *
 * It wraps window.fetch once: when an authenticated API request returns 401 (or is sent
 * without an access token while a refresh token is stored), it rotates the refresh token
 * and retries the request once with the new access token. Concurrent callers share one
 * refresh, and a refresh won by another tab is picked up from storage instead of failing.
 */
type Keys = { access: string; refresh: string };

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
const SKIP_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/register', '/auth/password', '/auth/oauth'];

function read(storage: Storage, key: string) {
  try { return storage.getItem(key); } catch { return null; }
}
function write(storage: Storage, key: string, value: string | null) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch { /* storage unavailable */ }
}

export function installSessionRefresh(keys: Keys, onSignedOut?: () => void) {
  const target = window as typeof window & { __quickdocFetchPatched?: boolean };
  if (target.__quickdocFetchPatched) return;
  target.__quickdocFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  let inflight: Promise<string | null> | null = null;

  const refresh = (): Promise<string | null> => {
    inflight ??= (async () => {
      const attempt = async (refreshToken: string) => originalFetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const used = read(localStorage, keys.refresh);
      if (!used) return null;
      let response = await attempt(used);
      if (!response.ok) {
        // Another tab may have rotated the token a moment ago; use the one it stored.
        const latest = read(localStorage, keys.refresh);
        if (latest && latest !== used) response = await attempt(latest);
      }
      if (!response.ok) {
        if (response.status === 401) {
          write(sessionStorage, keys.access, null);
          write(localStorage, keys.refresh, null);
          onSignedOut?.();
        }
        return null;
      }
      const result = await response.json() as { data: { accessToken: string; refreshToken: string } };
      write(sessionStorage, keys.access, result.data.accessToken);
      write(localStorage, keys.refresh, result.data.refreshToken);
      return result.data.accessToken;
    })().finally(() => { inflight = null; });
    return inflight;
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(API_BASE) || SKIP_PATHS.some((path) => url.startsWith(`${API_BASE}${path}`))) {
      return originalFetch(input, init);
    }
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const authorization = headers.get('Authorization');
    if (!authorization?.startsWith('Bearer')) return originalFetch(input, init);

    const withToken = (token: string) => {
      headers.set('Authorization', `Bearer ${token}`);
      return originalFetch(input instanceof Request ? input.clone() : input, { ...init, headers });
    };
    const bearer = authorization.slice('Bearer'.length).trim();
    // A new tab has no access token yet but can still use the stored refresh token.
    if (!bearer || bearer === 'null' || bearer === 'undefined') {
      const token = await refresh();
      return token ? withToken(token) : originalFetch(input, init);
    }
    const response = await originalFetch(input instanceof Request ? input.clone() : input, init);
    if (response.status !== 401) return response;
    const token = await refresh();
    return token ? withToken(token) : response;
  };
}

/**
 * Mount once in the root layout. Installation happens during render, which precedes every
 * page effect, so even a page's first request is covered. When the session cannot be renewed
 * the user is sent to signInPath.
 */
export function SessionRefresh({ access, refresh, signInPath }: Keys & { signInPath: string }) {
  if (typeof window !== 'undefined') {
    installSessionRefresh({ access, refresh }, () => {
      if (signInPath === '/' || !window.location.pathname.startsWith(signInPath)) window.location.assign(signInPath);
    });
  }
  return null;
}
