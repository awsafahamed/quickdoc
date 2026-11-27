'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

type View =
  | 'overview'
  | 'orders'
  | 'delivery'
  | 'services'
  | 'inventory'
  | 'catalog'
  | 'customers'
  | 'earnings'
  | 'reports'
  | 'team'
  | 'profile'
  | 'settings'
  | 'notifications'
  | 'support';

type ShopProfile = {
  id: string;
  name: string;
  address: string;
  phone: string;
  latitude: number | string;
  longitude: number | string;
  status: string;
  isOpen: boolean;
};

type Order = {
  id: string;
  reference: string;
  status: string;
  total: number | string;
  currency: string;
  createdAt: string;
  updatedAt: string;
  deliveryAddress: unknown;
  instructions?: string | null;
  customer: { id: string; name: string; email: string; CustomerProfile?: { phone?: string | null } | null };
  OrderItem: {
    id: string;
    documentId: string;
    paperSize: string;
    colour: boolean;
    duplex: boolean;
    copies: number;
    pageRange: string;
    printedSides: number;
    binding?: string | null;
    stapling: boolean;
    lamination: boolean;
    total: number | string;
    Document: { name: string; mimeType: string; sizeBytes: number; pageCount?: number | null };
  }[];
  OrderStatusHistory: { id: string; status: string; reason?: string | null; createdAt: string }[];
  DeliveryAssignment?: { id: string; riderId: string; earnings: number | string; updatedAt: string } | null;
  DeliveryOffer?: { id: string }[];
  Payment?: { status: string; method: string; amount: number | string } | null;
};

type Settlement = {
  id: string;
  amount: number | string;
  status: string;
  reference?: string | null;
  createdAt: string;
  updatedAt: string;
};

type Service = {
  code: string;
  name: string;
  description: string;
  enabled: boolean;
  price: number | string;
  isCustom: boolean;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
};
type ShopPrice = { paperSize: string; colour: boolean; duplex: boolean; pricePerSide: number | string };
type InventoryItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number | string;
  reorderLevel: number | string;
  updatedAt: string;
};
type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  orderCount: number;
  lifetimeValue: number;
  lastOrderAt: string;
};
type Notice = { id: string; title: string; body: string; readAt: string | null; createdAt: string };
type OpeningHour = { dayOfWeek: number; opensAt: string; closesAt: string; isClosed: boolean };
type StaffMember = { shopId: string; userId: string; User?: { id: string; name: string; email: string } };
type CatalogFolder = { id: string; name: string; parentId: string | null };
type CatalogDocument = {
  id: string;
  name: string;
  description: string;
  sizeBytes: number;
  pageCount: number | null;
  folderId: string | null;
  folder?: { id: string; name: string } | null;
  isPublished: boolean;
};

type Envelope<T> = { data: T; pagination?: { page: number; pageSize: number; total: number; totalPages: number } };

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
const navGroups: { label: string; items: { id: View; label: string; icon: string }[] }[] = [
  { label: 'Workspace', items: [{ id: 'overview', label: 'Overview', icon: 'grid' }, { id: 'orders', label: 'Orders', icon: 'orders' }, { id: 'delivery', label: 'Delivery handover', icon: 'delivery' }] },
  { label: 'Manage', items: [{ id: 'services', label: 'Services & pricing', icon: 'tag' }, { id: 'inventory', label: 'Inventory', icon: 'box' }, { id: 'catalog', label: 'Document catalogue', icon: 'catalog' }, { id: 'customers', label: 'Customers', icon: 'users' }] },
  { label: 'Business', items: [{ id: 'earnings', label: 'Earnings & payouts', icon: 'wallet' }, { id: 'reports', label: 'Reports', icon: 'chart' }, { id: 'team', label: 'Team access', icon: 'team' }, { id: 'profile', label: 'Shop profile', icon: 'shop' }, { id: 'settings', label: 'Settings', icon: 'settings' }, { id: 'support', label: 'Help & support', icon: 'bell' }] },
];

const serviceOptions = [
  ['PAPER_A4', 'A4 paper'],
  ['PAPER_A3', 'A3 paper'],
  ['PAPER_A5', 'A5 paper'],
  ['BLACK_WHITE', 'Black & white'],
  ['COLOUR', 'Colour printing'],
  ['DUPLEX', 'Double-sided'],
  ['STAPLING', 'Stapling'],
  ['BINDING', 'Binding'],
  ['LAMINATION', 'Lamination'],
] as const;
const printPriceOptions = (['A4', 'A3', 'A5'] as const).flatMap((paperSize) =>
  ([false, true] as const).flatMap((colour) =>
    ([false, true] as const).map((duplex) => ({
      paperSize,
      colour,
      duplex,
      key: `${paperSize}:${colour}:${duplex}`,
      label: `${paperSize} · ${colour ? 'Colour' : 'Black & white'} · ${duplex ? 'Double-sided' : 'Single-sided'}`,
    })),
  ),
);
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function api<T>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = window.sessionStorage.getItem('shop-access-token');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.json !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    body: options.json === undefined ? options.body : JSON.stringify(options.json),
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json() as { message?: string | string[]; error?: string };
      message = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? body.error ?? message;
    } catch { /* The server returned a non-JSON error. */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function useRemote<T>(path: string, initial: T) {
  const [data, setData] = useState(initial);
  const [pagination, setPagination] = useState<{ page: number; pageSize: number; total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api<Envelope<T>>(path)
      .then((result) => {
        if (active) {
          setData(result.data);
          setPagination(result.pagination ?? null);
        }
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load this information.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, version]);
  return { data, setData, pagination, loading, error, reload };
}

function money(value: number | string, currency = 'LKR') {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function dateLabel(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en', options ?? { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
}

function Icon({ name, size = 19 }: { name: string; size?: number }) {
  const shapes: Record<string, string> = {
    grid: 'M3.5 3.5h7v7h-7zM13.5 3.5h7v7h-7zM3.5 13.5h7v7h-7zM13.5 13.5h7v7h-7z',
    orders: 'M6 3.5h12v17H6zM9 8h6M9 12h6M9 16h4',
    delivery: 'M3 6h11v11H3zM14 10h4l3 3v4h-7zM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    tag: 'M3.5 12V4h8l9 8-8.5 8.5zM7.5 8h.01',
    box: 'm12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5 12 12l8-4.5M12 12v9',
    catalog: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21zM4 5.5V21M8 7h8M8 11h8',
    users: 'M16 20a5 5 0 0 0-10 0M11 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM18 9a3 3 0 0 1 0 6M20 20a4 4 0 0 0-3-3.8',
    wallet: 'M3.5 6.5h17v14h-17zM3.5 9.5h17M16 14h2',
    chart: 'M4 19.5h16M6.5 16V9M12 16V4.5M17.5 16v-5',
    team: 'M16 20a5 5 0 0 0-10 0M11 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM18 8v6M21 11h-6',
    shop: 'M4 10h16l-1.5-6h-13zM5 10v10h14V10M9 20v-6h6v6',
    settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7 7 0 0 0-2.1-1.2L14 3h-4l-.4 2.7a7 7 0 0 0-2.1 1.2l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 2.1 1.2L10 21h4l.4-2.7a7 7 0 0 0 2.1-1.2l2.4 1 2-3.4-2-1.5A7 7 0 0 0 19 12z',
    bell: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    search: 'm20 20-4.5-4.5M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z',
    menu: 'M4 6h16M4 12h16M4 18h16',
    close: 'M6 6l12 12M18 6 6 18',
    download: 'M12 3v12m-5-5 5 5 5-5M4 20h16',
    plus: 'M12 5v14M5 12h14',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    external: 'M14 4h6v6M20 4l-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6',
    moon: 'M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5z',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42',
    logout: 'M10 17l5-5-5-5m5 5H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7',
    check: 'm5 12 4 4L19 6',
    clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
    trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={shapes[name] ?? shapes.grid} /></svg>;
}

export default function ShopPortal() {
  const [auth, setAuth] = useState<'checking' | 'anonymous' | 'setup' | 'ready'>('checking');
  const [shop, setShop] = useState<ShopProfile | null>(null);
  useEffect(() => {
    const token = window.sessionStorage.getItem('shop-access-token');
    if (!token) { setAuth('anonymous'); return; }
    let active = true;
    const restore = async () => {
      try {
        const session = await api<Envelope<{ roles: string[] }>>('/auth/session');
        if (!session.data.roles.includes('SHOP_OWNER')) {
          window.sessionStorage.removeItem('shop-access-token');
          if (active) setAuth('anonymous');
          return;
        }
        try {
          const result = await api<Envelope<ShopProfile>>('/shop/me');
          if (active) { setShop(result.data); setAuth('ready'); }
        } catch (reason) {
          if (reason instanceof Error && reason.message.includes('No print shop is linked')) {
            if (active) setAuth('setup');
            return;
          }
          throw reason;
        }
      } catch {
        window.sessionStorage.removeItem('shop-access-token');
        if (active) setAuth('anonymous');
      }
    };
    void restore();
    return () => { active = false; };
  }, []);
  if (auth === 'checking') return <main className="auth-loading"><div className="skeleton skeleton--title" /><div className="skeleton skeleton--line" /><div className="skeleton skeleton--line short" /></main>;
  if (auth === 'anonymous' || auth === 'setup') return <RegistrationPage initialMode={auth === 'setup' ? 'setup' : 'login'} onReady={(profile) => { setShop(profile); setAuth('ready'); }} />;
  if (!shop) return <main className="error-screen"><h1>Shop profile unavailable</h1><p>We could not load your shop details. Sign in again to continue.</p><button className="button button--primary" onClick={() => setAuth('anonymous')}>Return to sign in</button></main>;
  return <PortalWorkspace initialShop={shop} onSignOut={() => { window.sessionStorage.removeItem('shop-access-token'); window.localStorage.removeItem('shop-refresh-token'); window.localStorage.removeItem('print-shop-registered'); setAuth('anonymous'); }} />;
}

function RegistrationPage({ onReady, initialMode = 'login' }: { onReady: (profile: ShopProfile) => void; initialMode?: 'login' | 'setup' }) {
  const [mode, setMode] = useState<'register' | 'login' | 'setup' | 'forgot'>(initialMode);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+94');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [locationError, setLocationError] = useState('');
  const [busy, setBusy] = useState(false);

  const useCurrentLocation = () => {
    setLocationError('');
    if (!navigator.geolocation) { setLocationError('Location is unavailable in this browser. Enter the coordinates for your shop.'); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setLatitude(coords.latitude.toFixed(6)); setLongitude(coords.longitude.toFixed(6)); },
      () => setLocationError('We could not read your location. Allow location access or enter coordinates manually.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (mode === 'forgot') {
      if (!email.trim()) { setError('Enter your account email address.'); return; }
      setBusy(true);
      try {
        await api('/auth/password/reset-request', { method: 'POST', json: { email: email.trim() } });
        setMessage('If an account uses this email, password reset instructions are on the way.');
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Password reset could not be requested.');
      } finally { setBusy(false); }
      return;
    }
    if (mode === 'login' && (!email.trim() || !password)) { setError('Enter your account email and password.'); return; }
    if (mode === 'register' && password.length < 8) { setError('Choose a password with at least 8 characters.'); return; }
    const lat = Number(latitude);
    const lng = Number(longitude);
    if ((mode === 'register' || mode === 'setup') && (
      !name.trim() || !address.trim() || phone.trim().length < 7
      || !Number.isFinite(lat) || lat < -90 || lat > 90
      || !Number.isFinite(lng) || lng < -180 || lng > 180
    )) {
      setError('Complete the shop details and set a valid location to help nearby customers find you.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register') {
        const registered = await api<Envelope<{ accessToken: string; refreshToken: string }>>('/auth/register/shop-owner', { method: 'POST', json: { name: name.trim(), email: email.trim(), phone: phone.trim(), password, address: address.trim(), latitude: lat, longitude: lng } });
        window.sessionStorage.setItem('shop-access-token', registered.data.accessToken);
        window.localStorage.setItem('shop-refresh-token', registered.data.refreshToken);
        const created = await api<Envelope<ShopProfile>>('/shop/me');
        window.localStorage.setItem('print-shop-registered', 'true');
        window.localStorage.setItem('print-shop-name', created.data.name);
        onReady(created.data);
      } else if (mode === 'setup') {
        const created = await api<Envelope<ShopProfile>>('/shops/register', { method: 'POST', json: { name: name.trim(), phone: phone.trim(), email: email.trim(), address: address.trim(), latitude: lat, longitude: lng } });
        window.localStorage.setItem('print-shop-registered', 'true');
        window.localStorage.setItem('print-shop-name', created.data.name);
        onReady(created.data);
      } else {
        const loggedIn = await api<Envelope<{ accessToken: string; refreshToken: string; user: { roles: string[] } }>>('/auth/login', { method: 'POST', json: { email: email.trim(), password } });
        if (!loggedIn.data.user.roles.includes('SHOP_OWNER')) {
          setError('This account does not have shop-owner access. Use a shop-owner account or create one.');
          return;
        }
        window.sessionStorage.setItem('shop-access-token', loggedIn.data.accessToken);
        window.localStorage.setItem('shop-refresh-token', loggedIn.data.refreshToken);
        try {
          const profile = await api<Envelope<ShopProfile>>('/shop/me');
          window.localStorage.setItem('print-shop-registered', 'true');
          window.localStorage.setItem('print-shop-name', profile.data.name);
          onReady(profile.data);
        } catch (reason) {
          if (reason instanceof Error && reason.message.includes('No print shop is linked')) {
            setMode('setup');
            setMessage('You are signed in. Complete your shop details to finish setting up this account.');
            return;
          }
          throw reason;
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not complete sign in. Please try again.');
    } finally { setBusy(false); }
  };

  return <main className="auth-page">
    <section className="auth-brand"><a className="brand brand--auth" href="/" aria-label="QuickDoc home"><span className="brand-mark">q</span><span>quickdoc</span></a><div className="auth-brand-copy"><span className="brand-kicker">SHOP OWNER WORKSPACE</span><h1>Your print business,<br />in good order.</h1><p>One calm place to manage jobs, production, customers and payouts.</p></div><div className="auth-brand-foot"><span className="brand-mark brand-mark--small">q</span><span>QuickDoc partner network</span></div></section>
    <section className="auth-panel"><div className="auth-panel-inner">
      {(mode === 'login' || mode === 'register') && <div className="auth-switch" role="tablist" aria-label="Account action"><button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setError(''); setMessage(''); }}>Sign in</button><button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'selected' : ''} onClick={() => { setMode('register'); setError(''); setMessage(''); }}>Create shop account</button></div>}
      <h2>{mode === 'login' ? 'Welcome back' : mode === 'forgot' ? 'Reset your password' : mode === 'setup' ? 'Finish shop setup' : 'Set up your shop'}</h2><p className="auth-subtitle">{mode === 'login' ? 'Sign in to pick up where you left off.' : mode === 'forgot' ? 'We will email a secure reset link if this account exists.' : mode === 'setup' ? 'Your account is signed in. Add the shop details needed to use the workspace.' : 'Start with your business details. New shops are reviewed before they can accept orders.'}</p>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        {(mode === 'register' || mode === 'setup') && <><label>Business name<input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your print shop" autoComplete="organization" /></label><label>Business phone<input required minLength={7} maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" /></label><label>Shop address<input required minLength={5} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street, building and city" autoComplete="street-address" /></label><div className="location-fields"><button className="button button--secondary" type="button" onClick={useCurrentLocation}>Use current location</button><label>Latitude<input required type="number" step="any" min="-90" max="90" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="6.9271" /></label><label>Longitude<input required type="number" step="any" min="-180" max="180" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="79.8612" /></label></div>{locationError && <p className="form-error" role="alert">{locationError}</p>}</>}
        {(mode === 'login' || mode === 'register' || mode === 'forgot') && <label>Business email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@business.com" /></label>}
        {(mode === 'login' || mode === 'register') && <label>Password<input required type="password" minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="success-message" role="status">{message}</p>}
        <button className="button button--primary button--wide" disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'forgot' ? 'Send reset link' : mode === 'setup' ? 'Save shop details' : 'Create account'}</button>
      </form>
      {mode === 'login' && <button className="auth-link" type="button" onClick={() => { setMode('forgot'); setError(''); setMessage(''); }}>Forgot password?</button>}
      {mode === 'forgot' && <button className="auth-link" type="button" onClick={() => { setMode('login'); setError(''); setMessage(''); }}>Back to sign in</button>}
      {mode === 'register' && <p className="auth-note">Your shop must be approved before it appears in customer search.</p>}
    </div></section>
  </main>;
}

function PortalWorkspace({ initialShop, onSignOut }: { initialShop: ShopProfile; onSignOut: () => void }) {
  const [view, setView] = useState<View>('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shop, setShop] = useState(initialShop);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [noticeCount, setNoticeCount] = useState(0);
  const pageName = useMemo(() => navGroups.flatMap((group) => group.items).find((item) => item.id === view)?.label ?? (view === 'notifications' ? 'Notifications' : 'Overview'), [view]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('shop-theme');
    if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('shop-theme', theme);
  }, [theme]);
  useEffect(() => {
    api<Envelope<Notice[]>>('/shop/me/notifications')
      .then((result) => setNoticeCount(result.data.filter((notice) => !notice.readAt).length))
      .catch(() => setNoticeCount(0));
  }, [view]);
  const openView = (next: View) => { setView(next); setMobileOpen(false); };
  return <div className={`portal ${collapsed ? 'portal--collapsed' : ''}`} data-theme={theme}>
    {mobileOpen && <button className="mobile-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar-top"><a className="brand" href="#" onClick={(event) => { event.preventDefault(); openView('overview'); }} aria-label="QuickDoc overview"><span className="brand-mark">q</span><span className="brand-name">quickdoc</span></a><button className="collapse-button" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><span /></button></div>
      <div className="sidebar-shop"><span className="shop-avatar">{initials(shop.name)}</span><span className="sidebar-shop-text"><strong>{shop.name}</strong><small>{shop.status === 'APPROVED' ? 'Verified shop' : 'Pending review'}</small></span><span className={`online-dot ${shop.isOpen ? 'online-dot--on' : ''}`} title={shop.isOpen ? 'Accepting orders' : 'Closed to orders'} /></div>
      <nav className="primary-nav" aria-label="Main navigation">
        {navGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-group-label">{group.label}</span>{group.items.map((item) => <button key={item.id} type="button" className={`nav-item ${view === item.id ? 'nav-item--active' : ''}`} onClick={() => openView(item.id)} title={collapsed ? item.label : undefined} aria-current={view === item.id ? 'page' : undefined}><Icon name={item.icon} /><span>{item.label}</span>{item.id === 'orders' && <span className="nav-indicator" />}</button>)}</div>)}
      </nav>
      <div className="sidebar-bottom"><button className="nav-item" type="button" onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} title={collapsed ? `Switch to ${theme === 'light' ? 'dark' : 'light'} mode` : undefined}><Icon name={theme === 'light' ? 'moon' : 'sun'} /><span>{theme === 'light' ? 'Dark appearance' : 'Light appearance'}</span></button><button className="profile-link" type="button" onClick={() => openView('profile')}><span className="profile-avatar">{initials(shop.name)}</span><span className="profile-label"><strong>{shop.name}</strong><small>Shop owner</small></span><span className="profile-more">···</span></button></div>
    </aside>
    <main className="portal-main">
      <header className="topbar"><button className="mobile-menu" type="button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Icon name="menu" /></button><div className="page-context"><span>Shop workspace</span><i>/</i><strong>{pageName}</strong></div><div className="topbar-actions"><button className="icon-button notification-trigger" type="button" aria-label={`Notifications${noticeCount ? `, ${noticeCount} unread` : ''}`} onClick={() => openView('notifications')}><Icon name="bell" />{noticeCount > 0 && <span className="notification-count">{noticeCount > 9 ? '9+' : noticeCount}</span>}</button><span className="topbar-separator" /><button className="topbar-shop" type="button" onClick={() => openView('profile')}><span className="profile-avatar">{initials(shop.name)}</span><span>{shop.name}</span></button><button className="icon-button signout-button" type="button" aria-label="Sign out" onClick={onSignOut}><Icon name="logout" /></button></div></header>
      {view === 'overview' && <DashboardPage shop={shop} onShopUpdate={setShop} onNavigate={openView} />}
      {view === 'orders' && <OrdersPage />}
      {view === 'delivery' && <DeliveryPage />}
      {view === 'services' && <ServicesPage />}
      {view === 'inventory' && <InventoryPage />}
      {view === 'catalog' && <CatalogPage />}
      {view === 'customers' && <CustomersPage />}
      {view === 'earnings' && <EarningsPage />}
      {view === 'reports' && <ReportsPage />}
      {view === 'team' && <TeamPage />}
      {view === 'profile' && <ProfilePage shop={shop} onSave={setShop} />}
      {view === 'settings' && <SettingsPage theme={theme} onThemeChange={setTheme} onSignOut={onSignOut} />}
      {view === 'notifications' && <NotificationsPage onUnreadChange={setNoticeCount} />}
      {view === 'support' && <SupportPage />}
    </main>
  </div>;
}

function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="page-header-actions">{action}</div>}</div>;
}

function LoadError({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="inline-error" role="alert"><span>{message}</span>{retry && <button type="button" onClick={retry}>Try again</button>}</div>;
}

function LoadingRows({ count = 4 }: { count?: number }) {
  return <div className="loading-rows" aria-label="Loading"><span /><span /><span />{count > 3 && <span />}</div>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-mark"><Icon name="grid" size={22} /></span><h3>{title}</h3><p>{body}</p>{action}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = ['delivered', 'completed', 'paid', 'approved', 'ready_for_pickup'].includes(normalized) ? 'positive' : ['rejected', 'cancelled', 'failed'].includes(normalized) ? 'negative' : ['pending_acceptance', 'pending', 'under_review'].includes(normalized) ? 'warning' : 'neutral';
  return <span className={`status-badge status-badge--${tone}`}><i />{status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}</span>;
}

function DashboardPage({ shop, onShopUpdate, onNavigate }: { shop: ShopProfile; onShopUpdate: (shop: ShopProfile) => void; onNavigate: (view: View) => void }) {
  const { data: orders, loading: ordersLoading, error: ordersError, reload: reloadOrders } = useRemote<Order[]>('/shop/me/orders', []);
  const { data: earnings, loading: earningsLoading, error: earningsError, reload: reloadEarnings } = useRemote<{ earned: number; pending: number; settlements: Settlement[] }>('/shop/me/earnings', { earned: 0, pending: 0, settlements: [] });
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const todayCount = orders.filter((order) => new Date(order.createdAt).toDateString() === new Date().toDateString()).length;
  const awaiting = orders.filter((order) => ['PENDING_ACCEPTANCE', 'ACCEPTED', 'PRINTING'].includes(order.status)).length;
  const series = useMemo(() => lastSevenDays(orders), [orders]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        reloadOrders();
        reloadEarnings();
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [reloadEarnings, reloadOrders]);
  const toggleAvailability = async () => {
    setAvailabilityBusy(true);
    setAvailabilityError('');
    try {
      const result = await api<Envelope<ShopProfile>>('/shop/me/availability', { method: 'PATCH', json: { isOpen: !shop.isOpen } });
      onShopUpdate({ ...shop, isOpen: result.data.isOpen });
    } catch (reason) { setAvailabilityError(reason instanceof Error ? reason.message : 'Availability could not be updated.'); }
    finally { setAvailabilityBusy(false); }
  };
  const maxOrders = Math.max(...series.map((item) => item.count), 1);
  return <section className="content">
    <PageHeader title="Business overview" description={`${new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())} · Your shop at a glance`} action={<button className={`availability-button ${shop.isOpen ? 'availability-button--open' : ''}`} type="button" onClick={() => void toggleAvailability()} disabled={availabilityBusy || shop.status !== 'APPROVED'}><i />{availabilityBusy ? 'Updating…' : shop.isOpen ? 'Accepting orders' : 'Closed to orders'}<span className="switch-track"><span /></span></button>} />
    {availabilityError && <LoadError message={availabilityError} />}
    {shop.status !== 'APPROVED' && <div className="review-notice"><span className="review-notice-icon"><Icon name="clock" size={18} /></span><div><strong>Shop review in progress</strong><p>Your shop will be able to accept orders once an administrator approves the application.</p></div><StatusBadge status={shop.status} /></div>}
    <div className="metric-grid">
      <Metric title="Orders today" value={ordersLoading ? '—' : String(todayCount)} detail={`${orders.length} total orders`} icon="orders" />
      <Metric title="In production" value={ordersLoading ? '—' : String(awaiting)} detail="Needs attention or in progress" icon="clock" />
      <Metric title="Paid out" value={earningsLoading ? '—' : money(earnings.earned)} detail={`${earnings.settlements.length} settlements`} icon="wallet" />
      <Metric title="Pending payout" value={earningsLoading ? '—' : money(earnings.pending)} detail="Settlement status from platform" icon="chart" />
    </div>
    <div className="dashboard-columns">
      <section className="panel orders-chart-panel"><div className="panel-heading"><div><h2>Order activity</h2><p>Orders placed over the last 7 days</p></div><button className="text-button" type="button" onClick={() => onNavigate('reports')}>View reports <Icon name="arrow" size={15} /></button></div>{ordersError ? <LoadError message={ordersError} retry={reloadOrders} /> : ordersLoading ? <LoadingRows /> : <div className="bar-chart" role="img" aria-label="Order counts for the last seven days">{series.map((item) => <div className="bar-column" key={item.label}><span className="bar-value">{item.count || ''}</span><div className="bar-track"><span className="bar" style={{ height: `${Math.max(4, item.count / maxOrders * 100)}%` }} /></div><small>{item.label}</small></div>)}</div>}</section>
      <section className="panel production-panel"><div className="panel-heading"><div><h2>Production queue</h2><p>Jobs that need your attention</p></div><button className="icon-button" aria-label="Open incoming orders" type="button" onClick={() => onNavigate('orders')}><Icon name="arrow" size={17} /></button></div>{ordersLoading ? <LoadingRows count={3} /> : ordersError ? <LoadError message={ordersError} retry={reloadOrders} /> : orders.filter((order) => ['PENDING_ACCEPTANCE', 'ACCEPTED', 'PRINTING'].includes(order.status)).slice(0, 4).map((order) => <button className="queue-row" key={order.id} type="button" onClick={() => onNavigate('orders')}><span className="queue-avatar">{initials(order.customer.name)}</span><span className="queue-copy"><strong>{order.reference}</strong><small>{order.customer.name} · {order.OrderItem.length} print item{order.OrderItem.length === 1 ? '' : 's'}</small></span><StatusBadge status={order.status} /></button>)}{!ordersLoading && !ordersError && orders.filter((order) => ['PENDING_ACCEPTANCE', 'ACCEPTED', 'PRINTING'].includes(order.status)).length === 0 && <EmptyState title="All caught up" body="New and in-progress orders will show here." action={<button className="text-button" type="button" onClick={() => onNavigate('orders')}>Go to orders <Icon name="arrow" size={15} /></button>} />}</section>
    </div>
    <div className="dashboard-bottom">
      <section className="panel"><div className="panel-heading"><div><h2>Recent orders</h2><p>Latest activity from customers</p></div><button className="text-button" type="button" onClick={() => onNavigate('orders')}>All orders <Icon name="arrow" size={15} /></button></div>{ordersLoading ? <LoadingRows /> : ordersError ? <LoadError message={ordersError} retry={reloadOrders} /> : <OrderTable orders={orders.slice(0, 5)} compact />}</section>
      <section className="panel quick-panel"><div className="panel-heading"><div><h2>Shop status</h2><p>Partner account overview</p></div></div><div className="shop-status-line"><span className="shop-avatar shop-avatar--large">{initials(shop.name)}</span><div><strong>{shop.name}</strong><small>{shop.address}</small></div></div><div className="status-detail"><span>Verification</span><StatusBadge status={shop.status} /></div><div className="status-detail"><span>Availability</span><span className={`availability-label ${shop.isOpen ? 'availability-label--open' : ''}`}><i />{shop.isOpen ? 'Open' : 'Closed'}</span></div><button className="button button--secondary button--wide" type="button" onClick={() => onNavigate('profile')}>Manage shop profile</button>{earningsError && <LoadError message={earningsError} />}</section>
    </div>
  </section>;
}

function Metric({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: string }) {
  return <article className="metric"><span className="metric-icon"><Icon name={icon} size={19} /></span><div className="metric-copy"><span>{title}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function lastSevenDays(orders: Order[]) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const count = orders.filter((order) => {
      const created = new Date(order.createdAt);
      return created.getFullYear() === date.getFullYear() && created.getMonth() === date.getMonth() && created.getDate() === date.getDate();
    }).length;
    return { label: date.toLocaleDateString('en', { weekday: 'short' }), count };
  });
}

function OrderTable({ orders, compact = false }: { orders: Order[]; compact?: boolean }) {
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Status</th><th className="align-right">Total</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong className="order-reference">{order.reference}</strong></td><td><span className="customer-cell"><span className="tiny-avatar">{initials(order.customer.name)}</span>{order.customer.name}</span></td><td>{dateLabel(order.createdAt, { day: 'numeric', month: 'short', ...(compact ? {} : { year: 'numeric' }) })}</td><td><StatusBadge status={order.status} /></td><td className="align-right amount-cell">{money(order.total, order.currency)}</td></tr>)}</tbody></table></div>;
}

function OrdersPage() {
  const { data: orders, loading, error, reload } = useRemote<Order[]>('/shop/me/orders', []);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'amount'>('newest');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [busyId, setBusyId] = useState('');
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');
  const pageSize = 8;
  const filtered = useMemo(() => {
    const result = orders.filter((order) => {
      const text = `${order.reference} ${order.customer.name} ${order.customer.email}`.toLowerCase();
      return (!query || text.includes(query.toLowerCase())) && (status === 'ALL' || order.status === status);
    });
    return result.sort((a, b) => sort === 'oldest' ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : sort === 'amount' ? Number(b.total) - Number(a.total) : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, query, status, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const activeOrder = orders.find((order) => order.id === selected);
  const transition = async (order: Order, nextStatus: string) => {
    setBusyId(order.id); setActionError('');
    try {
      await api(`/shop/me/orders/${order.id}/transition`, { method: 'POST', json: { status: nextStatus, ...(nextStatus === 'REJECTED' ? { reason: reason.trim() } : {}) } });
      setReason('');
      reload();
    } catch (failure) { setActionError(failure instanceof Error ? failure.message : 'The order status could not be updated.'); }
    finally { setBusyId(''); }
  };
  return <section className="content"><PageHeader title="Orders" description="Review requests, manage production and keep every job moving." /><div className="toolbar"><label className="search-field"><Icon name="search" size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search reference or customer" aria-label="Search orders" /></label><label className="select-field"><span>Status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="ALL">All statuses</option>{[...new Set(orders.map((order) => order.status))].sort().map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label><label className="select-field"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount">Order value</option></select></label></div>
    {error && <LoadError message={error} retry={reload} />}{actionError && <LoadError message={actionError} />}
    {loading ? <div className="panel"><LoadingRows count={5} /></div> : <><div className="panel table-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th>Items</th><th>Status</th><th className="align-right">Total</th><th aria-label="Actions" /></tr></thead><tbody>{visible.map((order) => <tr key={order.id} className={selected === order.id ? 'row-selected' : ''}><td><button className="table-link" type="button" onClick={() => setSelected(selected === order.id ? null : order.id)}>{order.reference}</button></td><td><span className="customer-cell"><span className="tiny-avatar">{initials(order.customer.name)}</span><span>{order.customer.name}</span></span></td><td>{dateLabel(order.createdAt)}</td><td>{order.OrderItem.length} item{order.OrderItem.length === 1 ? '' : 's'}</td><td><StatusBadge status={order.status} /></td><td className="align-right amount-cell">{money(order.total, order.currency)}</td><td><button className="row-action" type="button" onClick={() => setSelected(selected === order.id ? null : order.id)} aria-label={`View ${order.reference}`}><Icon name="arrow" size={16} /></button></td></tr>)}</tbody></table>{visible.length === 0 && <EmptyState title={query || status !== 'ALL' ? 'No matching orders' : 'No orders yet'} body={query || status !== 'ALL' ? 'Try another search or status filter.' : 'New customer orders will appear here once they are assigned to your shop.'} />}</div><Pagination page={page} pages={pages} total={filtered.length} onChange={setPage} /></div>
      {activeOrder && <section className="panel order-detail"><div className="panel-heading"><div><h2>{activeOrder.reference}</h2><p>Placed {dateLabel(activeOrder.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</p></div><button className="icon-button" type="button" aria-label="Close order details" onClick={() => setSelected(null)}><Icon name="close" /></button></div><div className="detail-grid"><div><span className="detail-label">Customer</span><strong>{activeOrder.customer.name}</strong><small>{activeOrder.customer.email}</small>{activeOrder.customer.CustomerProfile?.phone && <small>{activeOrder.customer.CustomerProfile.phone}</small>}</div><div><span className="detail-label">Payment</span><StatusBadge status={activeOrder.Payment?.status ?? 'Payment pending'} /><small>{activeOrder.Payment ? money(activeOrder.Payment.amount, activeOrder.currency) : 'No payment record'}</small></div><div><span className="detail-label">Delivery address</span><strong>{addressText(activeOrder)}</strong></div><div><span className="detail-label">Order total</span><strong>{money(activeOrder.total, activeOrder.currency)}</strong></div></div>{activeOrder.instructions && <div className="order-instructions"><strong>Customer instructions</strong><p>{activeOrder.instructions}</p></div>}<div className="detail-subhead"><h3>Print items</h3></div>{activeOrder.OrderItem.map((item) => <div className="document-row" key={item.id}><span className="document-mark">PDF</span><div><strong>{item.Document.name}</strong><small>{item.paperSize} · {item.colour ? 'Colour' : 'Black & white'} · {item.copies} cop{item.copies === 1 ? 'y' : 'ies'} · {item.printedSides} sides</small>{item.binding && <small>Binding: {item.binding}</small>}</div><span className="document-total">{money(item.total, activeOrder.currency)}</span><button className="button button--secondary button--small" type="button" onClick={() => void previewDocument(activeOrder.id, item.documentId, setActionError)}>Preview file</button></div>)}<div className="detail-subhead"><h3>Status history</h3></div><div className="timeline">{[...activeOrder.OrderStatusHistory].reverse().map((event) => <div className="timeline-item" key={event.id}><i /><div><strong>{event.status.replaceAll('_', ' ')}</strong><small>{dateLabel(event.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}{event.reason ? ` · ${event.reason}` : ''}</small></div></div>)}</div><div className="detail-actions">{activeOrder.status === 'PENDING_ACCEPTANCE' && <><button className="button button--primary" disabled={busyId === activeOrder.id} type="button" onClick={() => void transition(activeOrder, 'ACCEPTED')}>Accept order</button><input className="reason-input" aria-label="Rejection reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason required to decline" /><button className="button button--danger" disabled={busyId === activeOrder.id || !reason.trim()} type="button" onClick={() => void transition(activeOrder, 'REJECTED')}>Decline</button></>}{activeOrder.status === 'ACCEPTED' && <button className="button button--primary" disabled={busyId === activeOrder.id} type="button" onClick={() => void transition(activeOrder, 'PRINTING')}>Start printing</button>}{activeOrder.status === 'PRINTING' && <button className="button button--primary" disabled={busyId === activeOrder.id} type="button" onClick={() => void transition(activeOrder, 'READY_FOR_PICKUP')}>Mark ready for pickup</button>}</div></section>}
    </>}
  </section>;
}

function addressText(order: Order) {
  const address = order as Order & { deliveryAddress?: unknown };
  if (!address.deliveryAddress || typeof address.deliveryAddress !== 'object') return 'Address is not available';
  return Object.values(address.deliveryAddress as Record<string, unknown>).filter((value) => typeof value === 'string').join(', ') || 'Address is not available';
}

async function previewDocument(orderId: string, documentId: string, setError: (message: string) => void) {
  setError('');
  const previewWindow = window.open('about:blank', '_blank');
  if (!previewWindow) { setError('Allow pop-ups to preview this customer document.'); return; }
  try {
    const result = await api<Envelope<{ previewUrl: string }>>(`/shop/me/orders/${orderId}/documents/${documentId}/preview-url`);
    previewWindow.opener = null;
    previewWindow.location.href = result.data.previewUrl;
  } catch (reason) {
    previewWindow.close();
    setError(reason instanceof Error ? reason.message : 'The file could not be opened.');
  }
}

function Pagination({ page, pages, total, onChange }: { page: number; pages: number; total: number; onChange: (page: number) => void }) {
  return <div className="pagination"><span>{total ? `Page ${page} of ${pages} · ${total} results` : 'No results'}</span><div><button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button><button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button></div></div>;
}

function DeliveryPage() {
  const { data: orders, loading, error, reload } = useRemote<Order[]>('/shop/me/orders', []);
  const [dispatching, setDispatching] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const deliveries = orders.filter((order) => ['READY_FOR_PICKUP', 'RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(order.status));
  const dispatch = async (order: Order) => {
    setDispatching(order.id);
    setActionError('');
    setMessage('');
    try {
      const result = await api<Envelope<{ notifiedRiders: number }>>(`/shop/me/orders/${encodeURIComponent(order.id)}/dispatch`, { method: 'POST' });
      setMessage(result.data.notifiedRiders
        ? `Delivery request sent to ${result.data.notifiedRiders} nearby rider${result.data.notifiedRiders === 1 ? '' : 's'}.`
        : 'No approved online riders with a recent location were found within 8 km.');
      reload();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Nearby riders could not be notified.');
    } finally {
      setDispatching('');
    }
  };
  return <section className="content"><PageHeader title="Delivery handover" description="Nearby approved riders are notified when an order is ready. Pickup codes and delivery PINs remain private to the assigned rider." />{error && <LoadError message={error} retry={reload} />}{actionError && <LoadError message={actionError} />}{message && <p className="success-message" role="status">{message}</p>}{loading ? <div className="panel"><LoadingRows count={5} /></div> : deliveries.length ? <div className="panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Ready since</th><th>Rider assignment</th><th>Status</th><th className="align-right">Total</th></tr></thead><tbody>{deliveries.map((order) => <tr key={order.id}><td><strong className="order-reference">{order.reference}</strong></td><td>{order.customer.name}</td><td>{dateLabel(order.updatedAt)}</td><td>{order.DeliveryAssignment ? `Assigned · ${order.DeliveryAssignment.riderId.slice(0, 8)}` : order.status === 'READY_FOR_PICKUP' ? `${order.DeliveryOffer?.length ?? 0} rider offers pending` : 'Assignment unavailable'}</td><td><StatusBadge status={order.status} /></td><td className="align-right amount-cell">{money(order.total, order.currency)}{order.status === 'READY_FOR_PICKUP' && !order.DeliveryAssignment && !order.DeliveryOffer?.length && <button className="text-button dispatch-action" type="button" disabled={dispatching === order.id} onClick={() => void dispatch(order)}>{dispatching === order.id ? 'Notifying…' : 'Notify nearby riders'}</button>}</td></tr>)}</tbody></table></div><div className="delivery-note"><Icon name="delivery" size={18} /><p>Riders within 8 km with a recent location update are notified. The first rider to accept receives the delivery assignment.</p></div></div> : <EmptyState title="No deliveries in progress" body="Orders marked ready for pickup and their rider assignments will appear here." />}</section>;
}

function ServicesPage() {
  const { data: services, loading, error, reload } = useRemote<Service[]>('/shop/me/services', []);
  const { data: printPrices, loading: pricingLoading, error: pricingError, reload: reloadPricing } = useRemote<ShopPrice[]>('/shop/me/pricing', []);
  const [drafts, setDrafts] = useState<Record<string, Service>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [newCode, setNewCode] = useState<string>(serviceOptions[0][0]);
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const savedCodes = new Set(services.map((service) => service.code));
  useEffect(() => {
    setPriceDrafts(Object.fromEntries(printPrices.map((price) => [
      `${price.paperSize}:${price.colour}:${price.duplex}`,
      String(price.pricePerSide),
    ])));
  }, [printPrices]);
  const addService = async (event: FormEvent) => {
    event.preventDefault(); setBusy('new'); setActionError(''); setMessage('');
    try {
      await api('/shop/me/services', { method: 'POST', json: { code: newCode, enabled: true, price: 0 } });
      reload(); setMessage('Service added to your catalogue.');
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Service could not be added.'); }
    finally { setBusy(''); }
  };
  const saveService = async (service: Service) => {
    const draft = drafts[service.code] ?? service;
    if (!Number.isFinite(Number(draft.price)) || Number(draft.price) < 0) { setActionError('Enter a valid non-negative service price.'); return; }
    setBusy(service.code); setActionError(''); setMessage('');
    try {
      await api('/shop/me/services', { method: 'POST', json: { code: draft.code, name: draft.name, description: draft.description, enabled: draft.enabled, price: Number(draft.price) } });
      reload(); setDrafts((value) => { const next = { ...value }; delete next[service.code]; return next; }); setMessage('Service settings saved.');
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Service settings could not be saved.'); }
    finally { setBusy(''); }
  };
  const removeService = async (code: string) => {
    setBusy(code); setActionError(''); setMessage('');
    try { await api(`/shop/me/services/${encodeURIComponent(code)}`, { method: 'DELETE' }); reload(); setMessage('Service removed.'); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Service could not be removed.'); }
    finally { setBusy(''); }
  };
  const addCustomService = async (event: FormEvent) => {
    event.preventDefault(); setBusy('custom'); setActionError(''); setMessage('');
    try {
      await api('/shop/me/services/custom', { method: 'POST', json: { name: customName.trim(), description: customDescription.trim(), price: Number(customPrice) } });
      setCustomName(''); setCustomDescription(''); setCustomPrice('');
      reload(); setMessage('Custom service submitted for admin review.');
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Custom service could not be added.'); }
    finally { setBusy(''); }
  };
  const savePrintPrices = async (event: FormEvent) => {
    event.preventDefault(); setBusy('pricing'); setActionError(''); setMessage('');
    const prices = printPriceOptions.flatMap((option) => {
      const raw = priceDrafts[option.key]?.trim();
      return raw ? [{
        paperSize: option.paperSize,
        colour: option.colour,
        duplex: option.duplex,
        pricePerSide: Number(raw),
      }] : [];
    });
    if (!prices.length || prices.some((price) => !Number.isFinite(price.pricePerSide) || price.pricePerSide < 0)) {
      setActionError('Enter at least one valid non-negative print rate.');
      setBusy('');
      return;
    }
    try {
      await api('/shop/me/pricing', { method: 'POST', json: { prices } });
      reloadPricing(); setMessage('Print rates saved.');
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Print rates could not be saved.'); }
    finally { setBusy(''); }
  };
  const editableServices = services.map((service) => drafts[service.code] ?? service);
  const availableToAdd = serviceOptions.filter(([code]) => !savedCodes.has(code));
  return <section className="content"><PageHeader title="Services & pricing" description="Control which print services customers can order and set your shop's prices." />{error && <LoadError message={error} retry={reload} />}{actionError && <LoadError message={actionError} />}{message && <p className="success-message" role="status">{message}</p>}
    {loading ? <div className="panel"><LoadingRows /></div> : <div className="panel service-panel"><div className="panel-heading"><div><h2>Your services</h2><p>Choose your print capabilities and offer priced add-ons.</p></div><span className="count-pill">{services.length} configured</span></div>{editableServices.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Service</th><th>Review</th><th>Availability</th><th>Price</th><th /></tr></thead><tbody>{editableServices.map((service) => <tr key={service.code}><td><strong>{service.name || serviceOptions.find(([code]) => code === service.code)?.[1] || service.code.replaceAll('_', ' ')}</strong><small className="sub-cell">{service.code}</small></td><td>{service.isCustom ? service.reviewStatus : 'Platform service'}</td><td><label className="toggle-control"><input type="checkbox" checked={service.enabled} onChange={(event) => setDrafts((value) => ({ ...value, [service.code]: { ...service, enabled: event.target.checked } }))} /><span /><b>{service.enabled ? 'Available' : 'Unavailable'}</b></label></td><td>{service.isCustom ? <label className="price-input"><span>LKR</span><input type="number" min="0" step="0.01" value={service.price} onChange={(event) => setDrafts((value) => ({ ...value, [service.code]: { ...service, price: event.target.value } }))} aria-label={`${service.name} order fee`} /></label> : 'Set print rates below'}</td><td className="row-actions"><button className="button button--secondary button--small" type="button" disabled={busy === service.code} onClick={() => void saveService(service)}>{busy === service.code ? 'Saving…' : 'Save'}</button><button className="icon-button danger-icon" type="button" disabled={busy === service.code} aria-label={`Remove ${service.name || service.code}`} onClick={() => void removeService(service.code)}><Icon name="trash" size={16} /></button></td></tr>)}</tbody></table></div> : <EmptyState title="No services configured" body="Add the print services your shop can fulfill." />}
      <form className="inline-create" onSubmit={(event) => void addService(event)}><div><strong>Add a platform capability</strong><small>Choose a print format or finishing option.</small></div><select aria-label="Service to add" value={newCode} onChange={(event) => setNewCode(event.target.value)} disabled={!availableToAdd.length}>{availableToAdd.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select><button className="button button--primary" disabled={busy === 'new' || !availableToAdd.length} type="submit"><Icon name="plus" size={16} />{busy === 'new' ? 'Adding…' : 'Add capability'}</button></form>
      <form className="shop-custom-service-form" onSubmit={(event) => void addCustomService(event)}><div><h3>Offer a custom service</h3><p>Customers can add this to a print order after admin approval.</p></div><label>Service name<input minLength={3} maxLength={120} required value={customName} onChange={(event) => setCustomName(event.target.value)} /></label><label>Description<input maxLength={1000} value={customDescription} onChange={(event) => setCustomDescription(event.target.value)} /></label><label>Order fee (LKR)<input type="number" min="0" step="0.01" required value={customPrice} onChange={(event) => setCustomPrice(event.target.value)} /></label><button className="button button--primary" type="submit" disabled={busy === 'custom' || !customName.trim()}>{busy === 'custom' ? 'Submitting…' : 'Submit for review'}</button></form>
      <div className="panel-heading"><div><h2>Print rates</h2><p>Set the per-side price for each print combination. Unset rates use the platform default.</p></div></div>
      {pricingError && <LoadError message={pricingError} retry={reloadPricing} />}
      {pricingLoading ? <LoadingRows /> : <form className="shop-pricing-editor" onSubmit={(event) => void savePrintPrices(event)}>{printPriceOptions.map((option) => <label key={option.key}>{option.label}<span className="price-input"><span>LKR</span><input type="number" min="0" step="0.01" value={priceDrafts[option.key] ?? ''} onChange={(event) => setPriceDrafts((value) => ({ ...value, [option.key]: event.target.value }))} aria-label={`${option.label} price per side`} /></span></label>)}<button className="button button--primary" type="submit" disabled={busy === 'pricing'}>{busy === 'pricing' ? 'Saving rates…' : 'Save print rates'}</button></form>}
    </div>}</section>;
}

function InventoryPage() {
  const { data: items, loading, error, reload } = useRemote<InventoryItem[]>('/shop/me/inventory', []);
  const [form, setForm] = useState({ name: '', category: '', unit: 'sheets', quantity: '', reorderLevel: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const lowStock = items.filter((item) => Number(item.quantity) <= Number(item.reorderLevel)).length;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setActionError(''); setMessage('');
    const payload = { ...form, quantity: Number(form.quantity), reorderLevel: Number(form.reorderLevel) };
    try {
      await api(`/shop/me/inventory${editing ? `/${editing}` : ''}`, { method: editing ? 'PATCH' : 'POST', json: payload });
      setForm({ name: '', category: '', unit: 'sheets', quantity: '', reorderLevel: '' }); setEditing(null); reload(); setMessage(editing ? 'Inventory item updated.' : 'Inventory item added.');
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Inventory could not be saved.'); }
    finally { setBusy(false); }
  };
  const edit = (item: InventoryItem) => { setEditing(item.id); setForm({ name: item.name, category: item.category, unit: item.unit, quantity: String(item.quantity), reorderLevel: String(item.reorderLevel) }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const remove = async (id: string) => {
    setActionError(''); setMessage('');
    try { await api(`/shop/me/inventory/${id}`, { method: 'DELETE' }); reload(); setMessage('Inventory item removed.'); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Inventory item could not be removed.'); }
  };
  return <section className="content"><PageHeader title="Inventory" description="Keep an eye on paper, finishing materials and supplies at your shop." />{error && <LoadError message={error} retry={reload} />}{actionError && <LoadError message={actionError} />}{message && <p className="success-message" role="status">{message}</p>}
    <div className="inventory-summary"><div><span>Tracked items</span><strong>{loading ? '—' : items.length}</strong></div><div className={lowStock ? 'inventory-warning' : ''}><span>At or below reorder level</span><strong>{loading ? '—' : lowStock}</strong></div></div>
    <form className="panel inventory-form" onSubmit={(event) => void submit(event)}><div className="panel-heading"><div><h2>{editing ? 'Edit inventory item' : 'Add stock item'}</h2><p>Quantities and reorder levels are saved to your shop account.</p></div>{editing && <button className="text-button" type="button" onClick={() => { setEditing(null); setForm({ name: '', category: '', unit: 'sheets', quantity: '', reorderLevel: '' }); }}>Cancel edit</button>}</div><div className="form-grid form-grid--inventory"><label>Item name<input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="A4 paper, 80 gsm" /></label><label>Category<input required maxLength={60} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Paper" /></label><label>Unit<input required maxLength={24} value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="sheets" /></label><label>Current quantity<input required min="0" step="0.01" type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label><label>Reorder at<input required min="0" step="0.01" type="number" value={form.reorderLevel} onChange={(event) => setForm({ ...form, reorderLevel: event.target.value })} /></label><button className="button button--primary form-submit" type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add item'}</button></div></form>
    {loading ? <div className="panel"><LoadingRows /></div> : items.length ? <div className="panel table-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Item</th><th>Category</th><th>On hand</th><th>Reorder level</th><th>Stock</th><th /></tr></thead><tbody>{items.map((item) => { const low = Number(item.quantity) <= Number(item.reorderLevel); return <tr key={item.id}><td><strong>{item.name}</strong><small className="sub-cell">Updated {dateLabel(item.updatedAt)}</small></td><td>{item.category}</td><td className="amount-cell">{item.quantity} {item.unit}</td><td>{item.reorderLevel} {item.unit}</td><td><StatusBadge status={low ? 'Low stock' : 'In stock'} /></td><td className="row-actions"><button className="text-button" type="button" onClick={() => edit(item)}>Edit</button><button className="icon-button danger-icon" type="button" aria-label={`Remove ${item.name}`} onClick={() => void remove(item.id)}><Icon name="trash" size={16} /></button></td></tr>; })}</tbody></table></div></div> : <EmptyState title="No stock items tracked" body="Add your first paper or finishing supply above. Stock alerts will appear when quantities reach their reorder levels." />}
  </section>;
}

function CatalogPage() {
  const [folders, setFolders] = useState<CatalogFolder[]>([]);
  const [documents, setDocuments] = useState<CatalogDocument[]>([]);
  const [folderName, setFolderName] = useState('');
  const [parentFolderId, setParentFolderId] = useState('');
  const [folderFilter, setFolderFilter] = useState('all');
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [pageCount, setPageCount] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    setError('');
    api<Envelope<{ folders: CatalogFolder[]; documents: CatalogDocument[] }>>('/shop/me/catalog')
      .then(({ data }) => { setFolders(data.folders); setDocuments(data.documents); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Catalogue could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const createFolder = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      await api('/shop/me/catalog/folders', {
        method: 'POST',
        json: { name: folderName.trim(), parentId: parentFolderId || undefined },
      });
      setFolderName('');
      setMessage('Folder created.');
      reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Folder could not be created.');
    } finally { setBusy(false); }
  };

  const uploadDocument = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) { setError('Choose a PDF to add to your catalogue.'); return; }
    if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF catalogue documents are supported.');
      return;
    }
    if (file.size < 1 || file.size > 25 * 1024 * 1024) {
      setError('Choose a PDF smaller than 25 MB.');
      return;
    }
    const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (signature !== '%PDF-') { setError('This file does not have a valid PDF signature.'); return; }

    setBusy(true); setError(''); setMessage('');
    try {
      const upload = await api<Envelope<{ objectKey: string; uploadUrl: string }>>('/shop/me/catalog/upload-url', {
        method: 'POST',
        json: { name: file.name, mimeType: 'application/pdf', sizeBytes: file.size },
      });
      const putResponse = await fetch(upload.data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      });
      if (!putResponse.ok) throw new Error('The PDF could not be uploaded to private storage. Check bucket CORS settings and try again.');
      await api('/shop/me/catalog/documents', {
        method: 'POST',
        json: {
          name: file.name,
          mimeType: 'application/pdf',
          sizeBytes: file.size,
          pageCount: pageCount ? Number(pageCount) : undefined,
          description: description.trim(),
          folderId: folderFilter === 'all' || folderFilter === 'root' ? undefined : folderFilter,
          objectKey: upload.data.objectKey,
        },
      });
      setFile(null);
      setDescription('');
      setPageCount('');
      setMessage('PDF added to your published catalogue.');
      reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'PDF could not be added.');
    } finally { setBusy(false); }
  };

  const removeFolder = async (folder: CatalogFolder) => {
    setError(''); setMessage('');
    try {
      await api(`/shop/me/catalog/folders/${folder.id}`, { method: 'DELETE' });
      setMessage(`Folder "${folder.name}" removed.`);
      if (folderFilter === folder.id) setFolderFilter('all');
      reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Folder could not be removed.');
    }
  };

  const renameFolder = async (folder: CatalogFolder) => {
    const name = window.prompt('New folder name', folder.name)?.trim();
    if (!name || name === folder.name) return;
    setError(''); setMessage('');
    try {
      await api(`/shop/me/catalog/folders/${folder.id}`, { method: 'PATCH', json: { name } });
      setMessage('Folder renamed.');
      reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Folder could not be renamed.');
    }
  };

  const updateDocument = async (document: CatalogDocument, update: { folderId?: string | null; isPublished?: boolean }) => {
    setError(''); setMessage('');
    try {
      await api(`/shop/me/catalog/documents/${document.id}`, { method: 'PATCH', json: update });
      setMessage(document.name + (update.isPublished === undefined ? ' moved.' : update.isPublished ? ' published.' : ' hidden from customers.'));
      reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Catalogue document could not be updated.');
    }
  };

  const removeDocument = async (document: CatalogDocument) => {
    if (!window.confirm(`Remove "${document.name}" from your catalogue?`)) return;
    setError(''); setMessage('');
    try {
      await api(`/shop/me/catalog/documents/${document.id}`, { method: 'DELETE' });
      setMessage('Catalogue document removed.');
      reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Catalogue document could not be removed.');
    }
  };

  const visibleDocuments = documents.filter((document) => {
    if (folderFilter === 'all') return true;
    return folderFilter === 'root' ? !document.folderId : document.folderId === folderFilter;
  });
  const folderNameFor = (id: string | null) => folders.find((folder) => folder.id === id)?.name ?? 'Unsorted';

  return <section className="content">
    <PageHeader title="Document catalogue" description="Organize the PDFs customers can discover and choose for printing." />
    {error && <LoadError message={error} retry={reload} />}
    {message && <p className="success-message" role="status">{message}</p>}
    <div className="catalog-management">
      <form className="panel catalog-folder-form" onSubmit={(event) => void createFolder(event)}>
        <div className="panel-heading"><div><h2>Create a folder</h2><p>Use folders for grades, past papers, forms, or any categories your shop needs.</p></div></div>
        <label>Folder name<input required maxLength={120} value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Grade 10 past papers" /></label>
        <label>Inside folder<select value={parentFolderId} onChange={(event) => setParentFolderId(event.target.value)}><option value="">Top level</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
        <button className="button button--primary" type="submit" disabled={busy || !folderName.trim()}><Icon name="plus" size={16} />Create folder</button>
      </form>
      <form className="panel catalog-upload-form" onSubmit={(event) => void uploadDocument(event)}>
        <div className="panel-heading"><div><h2>Add a catalogue PDF</h2><p>Published documents appear in customer search after your shop is approved.</p></div></div>
        <label>PDF file<input required type="file" accept=".pdf,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        <label>Description <span className="field-label__optional">Optional</span><input maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Past paper bundle, 2025 edition" /></label>
        <label>Pages <span className="field-label__optional">Optional</span><input type="number" min="1" max="10000" value={pageCount} onChange={(event) => setPageCount(event.target.value)} placeholder="Enter if known" /></label>
        <label>Save to folder<select value={folderFilter === 'all' || folderFilter === 'root' ? '' : folderFilter} onChange={(event) => setFolderFilter(event.target.value || 'root')}><option value="">Top level</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
        <button className="button button--primary" type="submit" disabled={busy || !file}>{busy ? 'Uploading securely…' : 'Add PDF to catalogue'}</button>
      </form>
    </div>
    <section className="panel catalog-folders">
      <div className="panel-heading"><div><h2>Your folders</h2><p>{folders.length} folder{folders.length === 1 ? '' : 's'} · {documents.length} PDF{documents.length === 1 ? '' : 's'}</p></div></div>
      {folders.length ? <div className="catalog-folder-list">{folders.map((folder) => <div className="catalog-folder-row" key={folder.id}><button className="text-button" type="button" onClick={() => setFolderFilter(folder.id)}>{folder.parentId ? `${folderNameFor(folder.parentId)} / ` : ''}{folder.name}</button><div className="row-actions"><button className="text-button" type="button" onClick={() => void renameFolder(folder)}>Rename</button><button className="text-button text-button--danger" type="button" onClick={() => void removeFolder(folder)}>Remove</button></div></div>)}</div> : <p className="catalog-empty-copy">Create folders to organize your catalogue. PDFs can also stay at the top level.</p>}
    </section>
    <section className="panel catalog-document-panel">
      <div className="panel-heading"><div><h2>Catalogue PDFs</h2><p>Only published PDFs from approved shops are shown in customer search.</p></div><label className="select-field"><span>Show</span><select value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)}><option value="all">All folders</option><option value="root">Top level</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label></div>
      {loading ? <LoadingRows /> : visibleDocuments.length ? <div className="catalog-document-list">{visibleDocuments.map((document) => <article className="catalog-document-row" key={document.id}><span className="catalog-document-mark">PDF</span><div className="catalog-document-copy"><strong>{document.name}</strong><small>{folderNameFor(document.folderId)} · {Math.ceil(document.sizeBytes / 1024)} KB{document.pageCount ? ` · ${document.pageCount} pages` : ''}</small>{document.description && <small>{document.description}</small>}</div><label className="toggle-control"><input type="checkbox" checked={document.isPublished} onChange={(event) => void updateDocument(document, { isPublished: event.target.checked })} /><span /><b>{document.isPublished ? 'Published' : 'Hidden'}</b></label><select aria-label={`Move ${document.name} to a folder`} value={document.folderId ?? ''} onChange={(event) => void updateDocument(document, { folderId: event.target.value || null })}><option value="">Top level</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><button className="icon-button danger-icon" type="button" aria-label={`Remove ${document.name}`} onClick={() => void removeDocument(document)}><Icon name="trash" size={16} /></button></article>)}</div> : <EmptyState title={folderFilter === 'all' ? 'No catalogue PDFs yet' : 'No PDFs in this folder'} body="Add study papers, past papers, or everyday forms so customers can find and select them." />}
    </section>
  </section>;
}

function CustomersPage() {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);
  const endpoint = `/shop/me/customers?page=${page}&pageSize=8&search=${encodeURIComponent(submitted)}`;
  const { data, loading, error, reload, pagination: resultPagination } = useRemote<Customer[]>(endpoint, []);
  const pagination = resultPagination ?? { page: 1, pageSize: 8, total: 0, totalPages: 0 };
  const searchSubmit = (event: FormEvent) => { event.preventDefault(); setSubmitted(search); setPage(1); };
  return <section className="content"><PageHeader title="Customers" description="Customers and order history from orders placed with your shop." /><form className="toolbar" onSubmit={searchSubmit}><label className="search-field"><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customers" aria-label="Search customers" /></label><button className="button button--secondary" type="submit">Search</button></form>{error && <LoadError message={error} retry={reload} />}
    {loading ? <div className="panel"><LoadingRows /></div> : data.length ? <div className="panel table-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Customer</th><th>Contact</th><th>Orders</th><th>Last order</th><th className="align-right">Lifetime order value</th></tr></thead><tbody>{data.map((customer) => <tr key={customer.id}><td><span className="customer-cell"><span className="tiny-avatar">{initials(customer.name)}</span><strong>{customer.name}</strong></span></td><td><span className="contact-lines">{customer.email}{customer.phone && <small>{customer.phone}</small>}</span></td><td>{customer.orderCount}</td><td>{dateLabel(customer.lastOrderAt)}</td><td className="align-right amount-cell">{money(customer.lifetimeValue)}</td></tr>)}</tbody></table></div><Pagination page={pagination.page} pages={Math.max(1, pagination.totalPages)} total={pagination.total} onChange={setPage} /></div> : <EmptyState title={submitted ? 'No customers found' : 'No customers yet'} body={submitted ? 'Try another name or email address.' : 'Customer records are created from real orders placed with your shop.'} />}
  </section>;
}

function EarningsPage() {
  const { data, loading, error, reload } = useRemote<{ earned: number; pending: number; settlements: Settlement[] }>('/shop/me/earnings', { earned: 0, pending: 0, settlements: [] });
  const totalPaid = data.settlements.filter((item) => item.status === 'PAID' || item.status === 'COMPLETED').reduce((sum, item) => sum + Number(item.amount), 0);
  return <section className="content"><PageHeader title="Earnings & payouts" description="Review settlement records and payout status. Settlement changes are managed by platform operations." />{error && <LoadError message={error} retry={reload} />}
    <div className="metric-grid metric-grid--three"><Metric title="Total settled" value={loading ? '—' : money(data.earned)} detail="All recorded settlements" icon="wallet" /><Metric title="Paid" value={loading ? '—' : money(totalPaid)} detail="Completed payout records" icon="check" /><Metric title="Pending" value={loading ? '—' : money(data.pending)} detail="Awaiting platform settlement" icon="clock" /></div>
    <section className="panel"><div className="panel-heading"><div><h2>Settlement history</h2><p>Read-only records from the payout system.</p></div></div>{loading ? <LoadingRows /> : data.settlements.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Settlement</th><th>Created</th><th>Updated</th><th>Status</th><th className="align-right">Amount</th></tr></thead><tbody>{data.settlements.map((item) => <tr key={item.id}><td><strong>{item.reference || item.id.slice(0, 12).toUpperCase()}</strong></td><td>{dateLabel(item.createdAt)}</td><td>{dateLabel(item.updatedAt)}</td><td><StatusBadge status={item.status} /></td><td className="align-right amount-cell">{money(item.amount)}</td></tr>)}</tbody></table></div> : <EmptyState title="No settlements recorded" body="Settlement records will appear here after the platform processes a payout." />}</section>
  </section>;
}

function ReportsPage() {
  const { data: orders, loading: ordersLoading, error: ordersError, reload: reloadOrders } = useRemote<Order[]>('/shop/me/orders', []);
  const { data: earnings, loading: earningsLoading, error: earningsError } = useRemote<{ earned: number; pending: number; settlements: Settlement[] }>('/shop/me/earnings', { earned: 0, pending: 0, settlements: [] });
  const [range, setRange] = useState<'7' | '30' | 'all'>('30');
  const filtered = orders.filter((order) => range === 'all' || new Date(order.createdAt).getTime() >= Date.now() - Number(range) * 86400000);
  const completed = filtered.filter((order) => ['DELIVERED', 'COMPLETED'].includes(order.status));
  const exportCsv = () => {
    const rows = [['Reference', 'Placed at', 'Customer', 'Status', 'Order total', 'Currency'], ...filtered.map((order) => [order.reference, order.createdAt, order.customer.name, order.status, String(order.total), order.currency])];
    const csv = rows.map((row) => row.map((field) => `"${field.replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `quickdoc-shop-orders-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const byStatus = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.forEach((order) => counts.set(order.status, (counts.get(order.status) ?? 0) + 1));
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [filtered]);
  return <section className="content"><PageHeader title="Reports" description="Operational summaries based on your shop's actual orders and settlements." action={<button className="button button--secondary" type="button" onClick={exportCsv} disabled={ordersLoading}><Icon name="download" size={16} />Export orders CSV</button>} /><div className="toolbar"><label className="select-field"><span>Date range</span><select value={range} onChange={(event) => setRange(event.target.value as typeof range)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="all">All time</option></select></label></div>{ordersError && <LoadError message={ordersError} retry={reloadOrders} />}{earningsError && <LoadError message={earningsError} />}
    <div className="metric-grid metric-grid--three"><Metric title="Orders in period" value={ordersLoading ? '—' : String(filtered.length)} detail="Placed with your shop" icon="orders" /><Metric title="Completed orders" value={ordersLoading ? '—' : String(completed.length)} detail="Delivered or completed" icon="check" /><Metric title="Order value" value={ordersLoading ? '—' : money(filtered.reduce((sum, order) => sum + Number(order.total), 0))} detail="Gross order total, not payout" icon="chart" /></div>
    <section className="panel"><div className="panel-heading"><div><h2>Orders by status</h2><p>Live totals for the selected period</p></div></div>{ordersLoading ? <LoadingRows /> : byStatus.length ? <div className="status-report">{byStatus.map(([status, count]) => <div className="status-report-row" key={status}><span>{status.replaceAll('_', ' ')}</span><div className="status-report-track"><i style={{ width: `${count / filtered.length * 100}%` }} /></div><strong>{count}</strong></div>)}</div> : <EmptyState title="No report data yet" body="Order activity will appear here as customers place jobs with your shop." />}</section>
    <section className="report-footnote"><Icon name="wallet" size={17} /><p>{earningsLoading ? 'Loading settlement summary…' : `Recorded settlements: ${money(earnings.earned)} earned, ${money(earnings.pending)} pending. Order value is not the same as shop payout.`}</p></section>
  </section>;
}

function TeamPage() {
  const { data: staff, loading, error, reload } = useRemote<StaffMember[]>('/shop/me/staff', []);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const add = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setActionError(''); setMessage('');
    try { await api('/shop/me/staff', { method: 'POST', json: { email: email.trim() } }); setEmail(''); reload(); setMessage('Team member added.'); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Team member could not be added.'); }
    finally { setBusy(false); }
  };
  const remove = async (userId: string) => {
    setActionError(''); setMessage('');
    try { await api(`/shop/me/staff/${userId}`, { method: 'DELETE' }); reload(); setMessage('Team member removed.'); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Team member could not be removed.'); }
  };
  return <section className="content"><PageHeader title="Team access" description="Manage shop-owner accounts that can help run this location. Team members must register through the shop-owner flow." />{error && <LoadError message={error} retry={reload} />}{actionError && <LoadError message={actionError} />}{message && <p className="success-message" role="status">{message}</p>}
    <form className="panel add-member-form" onSubmit={(event) => void add(event)}><div><h2>Add a team member</h2><p>Enter the email address of an existing shop-owner account.</p></div><label className="search-field"><Icon name="users" size={17} /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@business.com" /></label><button className="button button--primary" disabled={busy}>{busy ? 'Adding…' : 'Add member'}</button></form>
    <section className="panel"><div className="panel-heading"><div><h2>People with shop access</h2><p>{staff.length} team member{staff.length === 1 ? '' : 's'}</p></div></div>{loading ? <LoadingRows /> : staff.length ? <div className="member-list">{staff.map((member) => <div className="member-row" key={member.userId}><span className="profile-avatar">{initials(member.User?.name ?? member.User?.email ?? 'Team')}</span><div><strong>{member.User?.name ?? 'Shop team member'}</strong><small>{member.User?.email ?? member.userId}</small></div><StatusBadge status="Shop access" /><button className="icon-button danger-icon" type="button" aria-label="Remove team member" onClick={() => void remove(member.userId)}><Icon name="trash" size={16} /></button></div>)}</div> : <EmptyState title="Only you have access" body="Add an existing shop-owner account to share daily shop operations." />}</section>
  </section>;
}

function ProfilePage({ shop, onSave }: { shop: ShopProfile; onSave: (shop: ShopProfile) => void }) {
  const [form, setForm] = useState({ name: shop.name, address: shop.address, phone: shop.phone, latitude: Number(shop.latitude), longitude: Number(shop.longitude) });
  const { data: hours, loading: hoursLoading, error: hoursError, reload: reloadHours } = useRemote<OpeningHour[]>('/shop/me/hours', []);
  const [hourDrafts, setHourDrafts] = useState<Record<number, OpeningHour>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setSaved('');
    try { const result = await api<Envelope<ShopProfile>>('/shop/me', { method: 'PATCH', json: form }); onSave(result.data); setSaved('Shop profile updated.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Shop profile could not be saved.'); }
    finally { setBusy(false); }
  };
  const saveHour = async (day: number) => {
    const hour = hourDrafts[day] ?? hours.find((item) => item.dayOfWeek === day) ?? { dayOfWeek: day, opensAt: '09:00', closesAt: '18:00', isClosed: false };
    setError(''); setSaved('');
    try { await api('/shop/me/hours', { method: 'POST', json: hour }); reloadHours(); setSaved(`${weekdays[day]} hours saved.`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Opening hours could not be saved.'); }
  };
  return <section className="content"><PageHeader title="Shop profile" description="Keep your public business details and opening hours accurate." />
    <div className="profile-layout"><form className="panel profile-form" onSubmit={(event) => void saveProfile(event)}><div className="panel-heading"><div><h2>Business details</h2><p>Shown to customers when they choose a print shop.</p></div><StatusBadge status={shop.status} /></div><label>Shop name<input required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Business address<input required minLength={5} maxLength={500} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label><label>Phone<input required minLength={7} maxLength={20} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><div className="form-grid"><label>Latitude<input required type="number" min="-90" max="90" step="0.0000001" value={form.latitude} onChange={(event) => setForm({ ...form, latitude: Number(event.target.value) })} /></label><label>Longitude<input required type="number" min="-180" max="180" step="0.0000001" value={form.longitude} onChange={(event) => setForm({ ...form, longitude: Number(event.target.value) })} /></label></div><div className="form-end"><button className="button button--primary" disabled={busy}>{busy ? 'Saving…' : 'Save business details'}</button>{saved && <span className="success-message" role="status">{saved}</span>}</div>{error && <LoadError message={error} />}</form>
      <section className="panel hours-panel"><div className="panel-heading"><div><h2>Opening hours</h2><p>Set a regular schedule for each day.</p></div></div>{hoursError && <LoadError message={hoursError} retry={reloadHours} />}{hoursLoading ? <LoadingRows count={3} /> : weekdays.map((day, index) => { const hour = hourDrafts[index] ?? hours.find((item) => item.dayOfWeek === index) ?? { dayOfWeek: index, opensAt: '09:00', closesAt: '18:00', isClosed: true }; return <div className="hour-row" key={day}><strong>{day}</strong><label className="toggle-control"><input type="checkbox" checked={!hour.isClosed} onChange={(event) => setHourDrafts((drafts) => ({ ...drafts, [index]: { ...hour, isClosed: !event.target.checked } }))} /><span /><b>{hour.isClosed ? 'Closed' : 'Open'}</b></label><input type="time" aria-label={`${day} opening time`} disabled={hour.isClosed} value={hour.opensAt} onChange={(event) => setHourDrafts((drafts) => ({ ...drafts, [index]: { ...hour, opensAt: event.target.value } }))} /><span className="hour-to">to</span><input type="time" aria-label={`${day} closing time`} disabled={hour.isClosed} value={hour.closesAt} onChange={(event) => setHourDrafts((drafts) => ({ ...drafts, [index]: { ...hour, closesAt: event.target.value } }))} /><button className="text-button" type="button" onClick={() => void saveHour(index)}>Save</button></div>; })}</section></div>
  </section>;
}

function SettingsPage({ theme, onThemeChange, onSignOut }: { theme: 'light' | 'dark'; onThemeChange: (theme: 'light' | 'dark') => void; onSignOut: () => void }) {
  return <section className="content"><PageHeader title="Settings" description="Personalize how the shop workspace looks on this device." /><section className="panel settings-panel"><div className="settings-row"><div className="settings-icon"><Icon name={theme === 'light' ? 'moon' : 'sun'} /></div><div><strong>Appearance</strong><small>Choose a comfortable theme for your workspace.</small></div><select value={theme} onChange={(event) => onThemeChange(event.target.value as 'light' | 'dark')} aria-label="Appearance"><option value="light">Light</option><option value="dark">Dark</option></select></div><div className="settings-row"><div className="settings-icon"><Icon name="logout" /></div><div><strong>Sign out</strong><small>End this session on the current device.</small></div><button className="button button--secondary" type="button" onClick={onSignOut}>Sign out</button></div></section><p className="settings-note">Access control and settlement permissions are enforced by the QuickDoc API. Shop owners can view settlement records but cannot edit payout status.</p></section>;
}

function NotificationsPage({ onUnreadChange }: { onUnreadChange: (count: number) => void }) {
  const { data: notices, loading, error, reload } = useRemote<Notice[]>('/shop/me/notifications', []);
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const markRead = async (notice: Notice) => {
    setBusy(notice.id);
    setActionError('');
    try { await api(`/shop/me/notifications/${notice.id}/read`, { method: 'PATCH' }); reload(); onUnreadChange(Math.max(0, notices.filter((item) => !item.readAt && item.id !== notice.id).length)); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Notification could not be marked as read.'); }
    finally { setBusy(''); }
  };
  return <section className="content"><PageHeader title="Notifications" description="Updates attached to your shop-owner account." />{error && <LoadError message={error} retry={reload} />}{actionError && <LoadError message={actionError} />}{loading ? <div className="panel"><LoadingRows /></div> : notices.length ? <div className="panel notification-list">{notices.map((notice) => <article className={`notification-row ${notice.readAt ? '' : 'notification-row--unread'}`} key={notice.id}><span className="notification-mark"><Icon name="bell" size={17} /></span><div className="notification-copy"><strong>{notice.title}</strong><p>{notice.body}</p><small>{dateLabel(notice.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</small></div>{!notice.readAt && <button className="text-button" type="button" disabled={busy === notice.id} onClick={() => void markRead(notice)}>{busy === notice.id ? 'Saving…' : 'Mark read'}</button>}</article>)}</div> : <EmptyState title="You're all caught up" body="Shop-owner updates will appear here when the platform sends them." />}</section>;
}

type SupportTicket = {
  id: string;
  reference: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  messages?: { id: string; body: string; createdAt: string; senderId: string; sender?: { name: string } }[];
};

function SupportPage() {
  const { data: tickets, loading, error, reload } = useRemote<SupportTicket[]>('/shop/me/support', []);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const createTicket = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setActionError(''); setMessage('');
    try {
      const result = await api<Envelope<SupportTicket>>('/shop/me/support', { method: 'POST', json: { subject: subject.trim(), body: body.trim() } });
      setSubject(''); setBody(''); setSelected(result.data); reload(); setMessage('Support request submitted.');
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Support request could not be submitted.'); }
    finally { setBusy(false); }
  };
  const openTicket = async (ticket: SupportTicket) => {
    setActionError('');
    try {
      const result = await api<Envelope<SupportTicket>>(`/shop/me/support/${ticket.id}`);
      setSelected(result.data);
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Support conversation could not be loaded.'); }
  };
  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true); setActionError(''); setMessage('');
    try {
      const result = await api<Envelope<SupportTicket>>(`/shop/me/support/${selected.id}/messages`, { method: 'POST', json: { body: reply.trim() } });
      setSelected(result.data); setReply(''); reload();
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Reply could not be sent.'); }
    finally { setBusy(false); }
  };
  return <section className="content"><PageHeader title="Help & support" description="Create a request or continue a conversation with the QuickDoc support team." />{error && <LoadError message={error} retry={reload} />}{actionError && <LoadError message={actionError} />}{message && <p className="success-message" role="status">{message}</p>}
    <div className="support-layout"><form className="panel support-form" onSubmit={(event) => void createTicket(event)}><div className="panel-heading"><div><h2>Contact support</h2><p>Tell us what you need help with.</p></div></div><label>Subject<input required minLength={3} maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="How can we help?" /></label><label>Details<textarea required minLength={1} maxLength={5000} rows={6} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Describe the issue or question…" /></label><button className="button button--primary" disabled={busy}>{busy ? 'Sending…' : 'Send support request'}</button></form>
      <section className="panel support-tickets"><div className="panel-heading"><div><h2>Your requests</h2><p>Replies and status are kept in your account.</p></div></div>{loading ? <LoadingRows /> : tickets.length ? <div className="ticket-list">{tickets.map((ticket) => <button className={`ticket-row ${selected?.id === ticket.id ? 'ticket-row--selected' : ''}`} key={ticket.id} type="button" onClick={() => void openTicket(ticket)}><span className="ticket-row-copy"><strong>{ticket.subject}</strong><small>{ticket.reference} · Updated {dateLabel(ticket.updatedAt)}</small></span><StatusBadge status={ticket.status} /></button>)}</div> : <EmptyState title="No support requests" body="Your conversations will appear here after you contact the team." />}</section></div>
    {selected && <section className="panel support-conversation"><div className="panel-heading"><div><h2>{selected.subject}</h2><p>{selected.reference} · <StatusBadge status={selected.status} /></p></div><button className="icon-button" type="button" aria-label="Close conversation" onClick={() => setSelected(null)}><Icon name="close" /></button></div><div className="conversation-messages">{selected.messages?.map((item) => <article className={`conversation-message ${item.senderId === selected.messages?.[0]?.senderId ? 'conversation-message--owner' : ''}`} key={item.id}><p>{item.body}</p><small>{item.sender?.name ?? 'Support'} · {dateLabel(item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</small></article>)}</div><form className="reply-form" onSubmit={(event) => void sendReply(event)}><label className="sr-only" htmlFor="support-reply">Reply to support</label><textarea id="support-reply" required minLength={1} maxLength={5000} rows={3} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a reply…" /><button className="button button--primary" disabled={busy || !reply.trim()}>{busy ? 'Sending…' : 'Send reply'}</button></form></section>}
  </section>;
}
