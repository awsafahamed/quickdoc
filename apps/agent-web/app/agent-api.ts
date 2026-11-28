export interface AgentSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string; roles: string[] };
}

export interface AgentProfile {
  id: string;
  businessName: string;
  address: string;
  phone: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  isOpen: boolean;
  user: { name: string; email: string };
}

export interface CustodyEvent {
  id: string;
  eventType: string;
  note: string | null;
  createdAt: string;
}

export interface AttestationJob {
  id: string;
  reference: string;
  serviceCode: string;
  status: string;
  pickupAddress: Record<string, unknown> | string;
  returnAddress: Record<string, unknown> | string;
  estimatedReadyAt: string | null;
  createdAt: string;
  custodyEvents: CustodyEvent[];
}

export interface AgentService {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number | string;
  estimatedDays: number;
  enabled: boolean;
  isCustom: boolean;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface AgentCatalogService {
  id: string;
  name: string;
  serviceFee: number;
  estimatedDays: number;
}

export interface AgentSettlement {
  id: string;
  amount: number | string;
  status: string;
  reference: string | null;
  createdAt: string;
}

export interface AgentEarnings {
  total: number;
  paid: number;
  pending: number;
  settlements: AgentSettlement[];
}

export interface AgentNotification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'
).replace(/\/+$/, '');
const SESSION_KEY = 'quickdoc-agent-session';

function readSession(): AgentSession | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(SESSION_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as AgentSession;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function saveSession(session: AgentSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload !== 'object' || payload === null || !('message' in payload)) {
    return fallback;
  }
  const message = (payload as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
    return message.join('. ');
  }
  return fallback;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw new Error(errorMessage(payload, 'The request could not be completed.'));
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('data' in payload)
  ) {
    throw new Error('The server returned an unexpected response.');
  }
  return (payload as { data: T }).data;
}

async function send(
  path: string,
  init: RequestInit,
  accessToken?: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  try {
    return await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch (reason) {
    if (reason instanceof TypeError) {
      throw new Error('Could not reach QuickDoc. Check your connection and try again.');
    }
    throw reason;
  }
}

let refreshInFlight: Promise<AgentSession | null> | null = null;

/** One refresh at a time: parallel 401s share it, and a token rotated by another tab is reused. */
function refreshSession(usedRefreshToken: string): Promise<AgentSession | null> {
  refreshInFlight ??= (async () => {
    const attempt = (refreshToken: string) => send('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
      headers: { 'Content-Type': 'application/json' },
    });
    let response = await attempt(usedRefreshToken);
    if (!response.ok) {
      const latest = readSession()?.refreshToken;
      if (latest && latest !== usedRefreshToken) response = await attempt(latest);
    }
    if (!response.ok) return null;
    const refreshed = await parseResponse<AgentSession>(response);
    saveSession(refreshed);
    return refreshed;
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const init: RequestInit = {
    method: options.method ?? 'GET',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  };
  const session = readSession();
  let response = await send(path, init, session?.accessToken);

  if (response.status === 401 && session?.refreshToken && path !== '/auth/refresh') {
    const refreshed = await refreshSession(session.refreshToken);
    if (!refreshed) {
      clearSession();
      throw new Error('Your session expired. Sign in again to continue.');
    }
    const retryBody = path === '/auth/logout' && typeof options.body === 'object' && options.body !== null
      ? JSON.stringify({ ...options.body, refreshToken: refreshed.refreshToken })
      : init.body;
    response = await send(path, { ...init, body: retryBody }, refreshed.accessToken);
  }

  return parseResponse<T>(response);
}
