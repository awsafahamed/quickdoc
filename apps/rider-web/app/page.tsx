'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type RiderView = 'dashboard' | 'requests' | 'active' | 'history' | 'earnings' | 'profile';
type RiderProfile = {
  status: string;
  phone: string | null;
  vehicleType: string | null;
  registration: string | null;
  RiderAvailability?: { online: boolean } | null;
};
type RiderAssignment = {
  id: string;
  earnings: number | string;
  assignedAt: string;
  Order: { id: string; reference: string; status: string; deliveryAddress: unknown };
  DeliveryStatusHistory: { id: string; status: string; reason: string | null; createdAt: string }[];
};
type RiderOffer = {
  id: string;
  distanceKm: number | string;
  earnings: number | string;
  createdAt: string;
  Order: { reference: string; Shop: { name: string; address: string } };
};
type RiderNotification = { id: string; title: string; body: string; readAt: string | null; createdAt: string };

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');

async function riderRequest<T>(path: string, options: RequestInit & { bodyData?: unknown } = {}): Promise<T> {
  const token = window.sessionStorage.getItem('rider-access-token');
  if (!token) throw new Error('Your rider session has expired. Sign in again.');
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (options.bodyData !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    body: options.bodyData === undefined ? options.body : JSON.stringify(options.bodyData),
  });
  const result = await response.json().catch(() => null) as { data?: T; message?: string | string[] } | null;
  if (!response.ok) {
    const message = Array.isArray(result?.message) ? result.message.join(', ') : result?.message;
    throw new Error(message || `Request failed (${response.status}).`);
  }
  return result?.data as T;
}

function getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location services are unavailable in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => reject(new Error('Enable location access to receive nearby delivery requests.')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

function addressText(address: unknown) {
  if (typeof address === 'string') return address;
  if (!address || typeof address !== 'object') return 'Address unavailable';
  const values = Object.values(address as Record<string, unknown>)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return values.join(', ') || 'Address unavailable';
}

const nav: { id: RiderView; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'requests', label: 'Delivery requests', icon: 'orders' },
  { id: 'active', label: 'Active delivery', icon: 'route' },
  { id: 'history', label: 'Delivery history', icon: 'history' },
  { id: 'earnings', label: 'Earnings', icon: 'wallet' },
];

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    orders: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h4',
    route: 'M6 20V9l6-5 6 5v11M9 20v-6h6v6',
    history: 'M12 8v5l3 2M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
    wallet: 'M3 6h18v13H3zM3 10h18M16 14h2',
    pin: 'M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    bell: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function RiderPortal() {
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [view, setView] = useState<RiderView>('dashboard');
  const [online, setOnline] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [updatingAvailability, setUpdatingAvailability] = useState(false);
  const [assignments, setAssignments] = useState<RiderAssignment[]>([]);
  const [offers, setOffers] = useState<RiderOffer[]>([]);
  const [notifications, setNotifications] = useState<RiderNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const lastLocationUpdate = useRef(0);

  useEffect(() => {
    const token = window.sessionStorage.getItem('rider-access-token');
    if (!token) {
      setCheckingSession(false);
      return;
    }
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    fetch(`${apiUrl}/riders/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Rider session could not be verified.');
        return response.json() as Promise<{ data: RiderProfile }>;
      })
      .then((result) => {
        setProfile(result.data);
        setOnline(result.data.RiderAvailability?.online ?? false);
      })
      .catch(() => {
        window.sessionStorage.removeItem('rider-access-token');
        window.localStorage.removeItem('rider-refresh-token');
        setSessionError('Could not verify your rider account. Please sign in again.');
      })
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    const loadWorkspace = async () => {
      setWorkspaceLoading(true);
      setWorkspaceError('');
      try {
        const [nextNotifications, nextAssignments, nextOffers] = await Promise.all([
          riderRequest<RiderNotification[]>('/riders/me/notifications'),
          profile.status === 'APPROVED'
            ? riderRequest<RiderAssignment[]>('/riders/me/assignments')
            : Promise.resolve([]),
          profile.status === 'APPROVED'
            ? riderRequest<RiderOffer[]>('/riders/me/offers')
            : Promise.resolve([]),
        ]);
        if (!active) return;
        setNotifications(nextNotifications);
        setAssignments(nextAssignments);
        setOffers(nextOffers);
      } catch (caught) {
        if (active) setWorkspaceError(caught instanceof Error ? caught.message : 'Rider workspace could not be loaded.');
      } finally {
        if (active) setWorkspaceLoading(false);
      }
    };
    void loadWorkspace();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadWorkspace();
    }, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [profile, reloadKey]);

  useEffect(() => {
    if (!online || !profile) return;
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(({ coords }) => {
      if (Date.now() - lastLocationUpdate.current < 60000) return;
      lastLocationUpdate.current = Date.now();
      void riderRequest('/riders/availability', {
        method: 'POST',
        bodyData: { online: true, latitude: coords.latitude, longitude: coords.longitude },
      }).catch(() => {
        setAvailabilityError('Your location could not be refreshed. New nearby requests may not reach you until location is available.');
      });
    }, () => {
      setAvailabilityError('Location access was stopped. New nearby requests may not reach you until location is available.');
    }, { enableHighAccuracy: true, maximumAge: 30000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [online, profile]);

  const toggleAvailability = async () => {
    if (updatingAvailability) return;
    setAvailabilityError('');
    setUpdatingAvailability(true);
    try {
      const location = online ? undefined : await getCurrentLocation();
      const availability = await riderRequest<{ online: boolean }>('/riders/availability', {
        method: 'POST',
        bodyData: { online: !online, ...location },
      });
      setOnline(availability.online);
      setProfile((current) => current ? {
        ...current,
        RiderAvailability: { online: availability.online },
      } : current);
    } catch (caught) {
      setAvailabilityError(caught instanceof Error ? caught.message : 'Availability could not be updated.');
    } finally {
      setUpdatingAvailability(false);
    }
  };

  const markNotificationRead = async (notificationId: string) => {
    try {
      await riderRequest(`/riders/me/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH' });
      setNotifications((current) => current.map((item) =>
        item.id === notificationId ? { ...item, readAt: new Date().toISOString() } : item,
      ));
    } catch (caught) {
      setWorkspaceError(caught instanceof Error ? caught.message : 'Notification could not be updated.');
    }
  };

  const signOut = async () => {
    const refreshToken = window.localStorage.getItem('rider-refresh-token');
    let signOutError = '';
    try {
      if (refreshToken) {
        await riderRequest('/auth/logout', { method: 'POST', bodyData: { refreshToken } });
      }
    } catch (caught) {
      signOutError = caught instanceof Error ? `Signed out here, but the server session could not be revoked: ${caught.message}` : 'Signed out here, but the server session could not be revoked.';
    } finally {
      window.sessionStorage.removeItem('rider-access-token');
      window.localStorage.removeItem('rider-refresh-token');
      setProfile(null);
      setAssignments([]);
      setOffers([]);
      setSessionError(signOutError);
    }
  };

  if (checkingSession) {
    return <main className="rider-registration"><p>Checking your rider account…</p></main>;
  }

  if (!profile) {
    return <RiderRegistration initialError={sessionError} onRegistered={(nextProfile) => {
      setProfile(nextProfile);
      setOnline(nextProfile.RiderAvailability?.online ?? false);
      setSessionError('');
    }} />;
  }

  return (
    <div className="rider-shell">
      {mobileOpen && <button className="mobile-backdrop" aria-label="Close navigation" type="button" onClick={() => setMobileOpen(false)} />}
      <aside className={`rider-sidebar ${mobileOpen ? 'rider-sidebar--open' : ''}`}>
        <div className="brand"><img src="/logo/quickdoc-logo.svg" alt="QuickDoc" /></div>
        <div className="sidebar__label">Rider workspace</div>
        <nav>{nav.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} type="button" onClick={() => { setView(item.id); setMobileOpen(false); }}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
        <button className="rider-profile" type="button" onClick={() => setView('profile')}><span className="rider-avatar">{profile.phone?.slice(-2) ?? 'RD'}</span><span><strong>Rider account</strong><small>{profile.phone ?? 'Update your contact details'}</small></span></button>
      </aside>
      <main className="rider-main">
        <header className="topbar"><button className="rider-menu" type="button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><span /><span /><span /></button><div className="breadcrumb"><span>Rider workspace</span><b>›</b><strong>{nav.find((item) => item.id === view)?.label ?? 'My profile'}</strong></div><div className="topbar__actions"><div className="rider-notifications"><button className="notification-button" type="button" aria-label={`Notifications${notifications.some((item) => !item.readAt) ? ', unread' : ''}`} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}><Icon name="bell" />{notifications.some((item) => !item.readAt) && <span />}</button>{notificationsOpen && <div className="rider-notification-panel" role="region" aria-label="Notifications"><strong>Notifications</strong>{notifications.length ? notifications.map((item) => <button key={item.id} type="button" className={item.readAt ? 'read' : ''} onClick={() => { if (!item.readAt) void markNotificationRead(item.id); }}><span>{item.title}<time>{new Date(item.createdAt).toLocaleString()}</time></span><small>{item.body}</small></button>) : <p>You’re all caught up.</p>}</div>}</div><button className="availability-button" type="button" aria-pressed={online} disabled={updatingAvailability || (profile.status !== 'APPROVED' && !online)} onClick={toggleAvailability}><i className={online ? 'online' : ''} />{updatingAvailability ? 'Updating…' : online ? 'Online' : profile.status === 'APPROVED' ? 'Offline' : 'Pending approval'}</button><button className="rider-sign-out" type="button" onClick={() => void signOut()}>Sign out</button></div></header>
        {workspaceError && <p className="registration-error rider-workspace-error" role="alert">{workspaceError}<button type="button" onClick={() => setReloadKey((key) => key + 1)}>Retry</button></p>}
        {availabilityError && <p className="registration-error" role="alert">{availabilityError}</p>}
        {view === 'dashboard' && <Dashboard online={online} status={profile.status} assignments={assignments} offers={offers} loading={workspaceLoading} onToggleOnline={toggleAvailability} onNavigate={setView} />}
        {view === 'requests' && <RequestsPage offers={offers} assignments={assignments} loading={workspaceLoading} onUpdated={() => setReloadKey((key) => key + 1)} />}
        {view === 'active' && <ActiveDeliveryPage assignments={assignments} onUpdated={() => setReloadKey((key) => key + 1)} />}
        {view === 'history' && <HistoryPage assignments={assignments} loading={workspaceLoading} />}
        {view === 'earnings' && <EarningsPage />}
        {view === 'profile' && <ProfilePage profile={profile} onSaved={(updated) => setProfile((current) => current ? { ...updated, RiderAvailability: current.RiderAvailability } : updated)} />}
      </main>
    </div>
  );
}

function RiderRegistration({ initialError, onRegistered }: { initialError: string; onRegistered: (profile: RiderProfile) => void }) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [phone, setPhone] = useState('+94');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [vehicle, setVehicle] = useState('BIKE');
  const [error, setError] = useState(initialError);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setError(initialError), [initialError]);

  return (
    <main className="rider-registration">
      <section className="rider-registration-copy"><span className="registration-mark">P</span><p>RIDER PORTAL</p><h1>Make every delivery count.</h1><p>Complete verification to receive print and attestation delivery requests.</p></section>
      <section className="rider-registration-panel"><div className="rider-auth-tabs"><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Create account</button><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Log in</button></div><p className="step-label">{mode === 'register' ? 'Rider registration' : 'Rider account access'}</p><h2>{mode === 'register' ? 'Create your rider account' : 'Welcome back'}</h2><form onSubmit={async (event) => {
        event.preventDefault();
        if (password.length < 8) { setError('Enter an 8-character password.'); return; }
        if (mode === 'register' && !/^\+94[0-9]{9}$/.test(phone)) { setError('Enter a valid Sri Lanka mobile number.'); return; }
        setSubmitting(true);
        setError('');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
        try {
          if (mode === 'login') {
            const response = await fetch(`${apiUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password }) });
            if (!response.ok) { setError(response.status === 401 ? 'Email or password is incorrect.' : 'Sign-in service is unavailable. Please try again.'); return; }
            const result = await response.json() as { data: { accessToken: string; refreshToken: string; user: { roles: string[] } } };
            if (!result.data.user.roles.includes('RIDER')) { setError('This account does not have a rider profile. Create a rider account to apply.'); return; }
            const profileResponse = await fetch(`${apiUrl}/riders/me`, { headers: { Authorization: `Bearer ${result.data.accessToken}` } });
            if (!profileResponse.ok) { setError(profileResponse.status === 404 ? 'Complete your rider application before signing in.' : 'Your rider profile could not be verified. Please try again.'); return; }
            const profileResult = await profileResponse.json() as { data: RiderProfile };
            window.sessionStorage.setItem('rider-access-token', result.data.accessToken);
            window.localStorage.setItem('rider-refresh-token', result.data.refreshToken);
            onRegistered(profileResult.data);
            return;
          }
          if (!name.trim()) { setError('Enter your full name.'); return; }
          const response = await fetch(`${apiUrl}/auth/register/rider`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), email: email.trim(), password, phone: phone.trim() }) });
          if (!response.ok) { setError(response.status === 409 ? 'This email is already in use.' : 'Registration service is unavailable. Please try again.'); return; }
          const result = await response.json() as { data: { accessToken: string; refreshToken: string } };
          const profileResponse = await fetch(`${apiUrl}/riders/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${result.data.accessToken}` }, body: JSON.stringify({ phone: phone.trim(), vehicleType: vehicle }) });
          if (!profileResponse.ok) { setError('Your account was created, but the rider application could not be saved. Please sign in and retry.'); return; }
          const profileResult = await profileResponse.json() as { data: RiderProfile };
          window.sessionStorage.setItem('rider-access-token', result.data.accessToken);
          window.localStorage.setItem('rider-refresh-token', result.data.refreshToken);
          onRegistered(profileResult.data);
        } catch (caught) {
          setError(caught instanceof TypeError ? 'The rider service is unavailable. Please try again.' : 'The rider account could not be verified. Please try again.');
        } finally {
          setSubmitting(false);
        }
      }}>
        {mode === 'register' && <label>Full name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" /></label>}
        <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="rider@quickdoc.lk" /></label>
        <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
        {mode === 'register' && <><label>Phone number<div className="phone-field"><span>🇱🇰 +94</span><input required value={phone.replace('+94', '')} onChange={(event) => setPhone('+94' + event.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="70 123 4567" /></div></label><label>Vehicle tier<select value={vehicle} onChange={(event) => setVehicle(event.target.value)}><option value="BIKE">Flash Bike</option><option value="TUK">Flash Tuk</option><option value="CAR">Flash XL Car</option></select></label></>}
        {error && <p className="registration-error" role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? 'Please wait…' : mode === 'register' ? 'Create rider account' : 'Sign in'}</button>
        <p className="registration-note">Applications require review before a rider can go online or receive work.</p>
      </form></section>
    </main>
  );
}

function Dashboard({ online, status, assignments, offers, loading, onToggleOnline, onNavigate }: {
  online: boolean;
  status: string;
  assignments: RiderAssignment[];
  offers: RiderOffer[];
  loading: boolean;
  onToggleOnline: () => void;
  onNavigate: (view: RiderView) => void;
}) {
  const statusLabel = status === 'APPROVED' ? 'Approved' : status === 'REJECTED' ? 'Not approved' : status === 'SUSPENDED' ? 'Suspended' : 'Pending review';
  const active = assignments.filter((item) => ['RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(item.Order.status));
  const completed = assignments.filter((item) => ['DELIVERED', 'COMPLETED'].includes(item.Order.status));
  return <section className="rider-content">
    <div className="shop-heading"><div><p>Today</p><h1>Rider workspace</h1></div><button className="availability-card" type="button" aria-pressed={online} disabled={status !== 'APPROVED' && !online} onClick={onToggleOnline}><i className={online ? 'online' : ''} /><span><strong>{online ? 'You are online' : status === 'APPROVED' ? 'You are offline' : statusLabel}</strong><small>{online ? 'Available to receive nearby work' : status === 'APPROVED' ? 'Turn on to receive nearby work' : 'Review is required before receiving work'}</small></span></button></div>
    <div className="rider-metrics"><article><span>Open offers</span><strong>{loading ? '—' : offers.length}</strong><button type="button" onClick={() => onNavigate('requests')}>Review offers</button></article><article><span>Active deliveries</span><strong>{loading ? '—' : active.length}</strong><button type="button" onClick={() => onNavigate('active')}>View deliveries</button></article><article><span>Completed deliveries</span><strong>{loading ? '—' : completed.length}</strong><button type="button" onClick={() => onNavigate('history')}>View history</button></article></div>
    <div className="rider-dashboard-grid"><article className="rider-status-card"><span>Application status</span><strong>{statusLabel}</strong><p>{status === 'APPROVED' ? 'Your account is approved. Location access is used to match nearby delivery requests.' : 'Your application must be reviewed before you can receive assignments.'}</p></article><article className="rider-empty-card">{active.length ? <><span className="production-icon"><Icon name="route" /></span><div><strong>{active[0].Order.reference}</strong><p>{active[0].Order.status.replaceAll('_', ' ')}</p><button className="rider-inline-action" type="button" onClick={() => onNavigate('active')}>Continue delivery</button></div></> : <><span className="production-icon"><Icon name="orders" /></span><div><strong>{loading ? 'Loading deliveries…' : 'No active delivery'}</strong><p>{offers.length ? 'A nearby request is waiting for your response.' : 'Accepted deliveries will appear here.'}</p></div></>}</article></div>
  </section>;
}

function RequestsPage({ offers, assignments, loading, onUpdated }: {
  offers: RiderOffer[];
  assignments: RiderAssignment[];
  loading: boolean;
  onUpdated: () => void;
}) {
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const activeAssignments = assignments.filter((item) => ['RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(item.Order.status));
  const respond = async (offer: RiderOffer, accepted: boolean) => {
    setBusyId(offer.id);
    setError('');
    try {
      await riderRequest(`/riders/me/offers/${encodeURIComponent(offer.id)}/${accepted ? 'accept' : 'reject'}`, { method: 'POST' });
      onUpdated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This delivery request could not be updated.');
    } finally {
      setBusyId('');
    }
  };
  return <section className="rider-content"><div className="shop-heading"><div><p>Available work</p><h1>Delivery requests</h1></div><button className="rider-refresh" type="button" onClick={onUpdated} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    {error && <p className="registration-error" role="alert">{error}</p>}
    {loading && offers.length === 0 ? <div className="empty-workspace" role="status">Loading nearby requests…</div> : offers.length ? <div className="delivery-list">{offers.map((offer) => <article className="delivery-request" key={offer.id}><div className="delivery-request-copy"><strong>{offer.Order.reference}</strong><p>Pickup: {offer.Order.Shop.name} · {offer.Order.Shop.address}</p><small>{Number(offer.distanceKm).toFixed(1)} km away</small></div><div className="delivery-request-actions"><strong>LKR {Number(offer.earnings).toFixed(2)}</strong><button type="button" disabled={busyId === offer.id} onClick={() => void respond(offer, true)}>{busyId === offer.id ? 'Saving…' : 'Accept ride'}</button><button type="button" className="decline" disabled={busyId === offer.id} onClick={() => void respond(offer, false)}>Decline</button></div></article>)}</div> : <div className="empty-workspace"><h2>No nearby requests</h2><p>{activeAssignments.length ? 'You already have an active delivery. Complete it before taking another request.' : 'New delivery requests within 8 km will appear here when you are online and your location is current.'}</p></div>}
  </section>;
}

function ActiveDeliveryPage({ assignments, onUpdated }: { assignments: RiderAssignment[]; onUpdated: () => void }) {
  const activeAssignments = assignments.filter((item) => ['RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(item.Order.status));
  const [selectedId, setSelectedId] = useState('');
  const [handoverCode, setHandoverCode] = useState('');
  const [failureReason, setFailureReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = activeAssignments.find((item) => item.id === selectedId) ?? activeAssignments[0];
  const updateStatus = async (status: string, extra: { handoverCode?: string; reason?: string } = {}) => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await riderRequest(`/riders/assignments/${encodeURIComponent(selected.id)}/status`, {
        method: 'POST',
        bodyData: { status, ...extra },
      });
      setHandoverCode('');
      setFailureReason('');
      onUpdated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Delivery status could not be updated.');
    } finally {
      setBusy(false);
    }
  };
  return <section className="rider-content"><div className="shop-heading"><div><p>Current task</p><h1>Active delivery</h1></div></div>
    {error && <p className="registration-error" role="alert">{error}</p>}
    {!selected ? <div className="empty-workspace"><h2>No active delivery</h2><p>Accept a nearby request to start a delivery.</p></div> : <div className="active-layout">
      <section className="delivery-detail-card"><div className="delivery-detail-heading"><div><span>Order reference</span><h2>{selected.Order.reference}</h2></div><strong>{selected.Order.status.replaceAll('_', ' ')}</strong></div><div className="delivery-address"><span>Customer delivery address</span><p>{addressText(selected.Order.deliveryAddress)}</p></div>
        <h3>Delivery progress</h3><div className="delivery-history">{selected.DeliveryStatusHistory.map((event) => <div key={event.id}><i /><span><strong>{event.status.replaceAll('_', ' ')}</strong><small>{new Date(event.createdAt).toLocaleString()}{event.reason ? ` · ${event.reason}` : ''}</small></span></div>)}</div>
      </section>
      <aside className="handover-panel"><h2>Update delivery</h2>{selected.Order.status === 'RIDER_ASSIGNED' && <form onSubmit={(event) => { event.preventDefault(); void updateStatus('PICKED_UP', { handoverCode: handoverCode.trim() }); }}><label>Shop pickup code<input value={handoverCode} onChange={(event) => setHandoverCode(event.target.value.toUpperCase())} inputMode="text" autoComplete="one-time-code" maxLength={6} pattern="[A-Fa-f0-9]{6}" required /></label><small>Ask the shop to provide the pickup code in person.</small><button type="submit" disabled={busy || !/^[A-Fa-f0-9]{6}$/.test(handoverCode)}>{busy ? 'Verifying…' : 'Confirm pickup'}</button></form>}
        {selected.Order.status === 'PICKED_UP' && <><p>Confirm that you are starting the trip to the customer.</p><button type="button" disabled={busy} onClick={() => void updateStatus('ARRIVED_DROPOFF')}>{busy ? 'Updating…' : 'Start delivery'}</button></>}
        {selected.Order.status === 'OUT_FOR_DELIVERY' && <form onSubmit={(event) => { event.preventDefault(); void updateStatus('DELIVERED', { handoverCode: handoverCode.trim() }); }}><label>Customer delivery PIN<input value={handoverCode} onChange={(event) => setHandoverCode(event.target.value.toUpperCase())} inputMode="text" autoComplete="one-time-code" maxLength={6} pattern="[A-Fa-f0-9]{6}" required /></label><small>Ask the customer for their PIN at handover.</small><button type="submit" disabled={busy || !/^[A-Fa-f0-9]{6}$/.test(handoverCode)}>{busy ? 'Verifying…' : 'Confirm delivery'}</button></form>}
        <form className="delivery-failure-form" onSubmit={(event) => { event.preventDefault(); void updateStatus('FAILED', { reason: failureReason.trim() }); }}><label>Report a failed delivery<textarea value={failureReason} onChange={(event) => setFailureReason(event.target.value)} maxLength={500} required placeholder="Explain what prevented delivery" /></label><button type="submit" className="failure-action" disabled={busy || failureReason.trim().length < 3}>{busy ? 'Saving…' : 'Report issue'}</button></form>
      </aside>
    </div>}
  </section>;
}

function HistoryPage({ assignments, loading }: { assignments: RiderAssignment[]; loading: boolean }) {
  const history = assignments.filter((item) => !['RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(item.Order.status));
  return <section className="rider-content"><div className="shop-heading"><div><p>Completed work</p><h1>Delivery history</h1></div></div>{loading && !history.length ? <div className="empty-workspace" role="status">Loading delivery history…</div> : history.length ? <div className="delivery-list">{history.map((item) => <article className="delivery-request" key={item.id}><div><strong>{item.Order.reference}</strong><p>{item.Order.status.replaceAll('_', ' ')} · {new Date(item.assignedAt).toLocaleDateString()}</p></div><span>LKR {Number(item.earnings).toFixed(2)}</span></article>)}</div> : <div className="empty-workspace"><h2>No delivery history yet</h2><p>Completed and failed deliveries will appear here.</p></div>}</section>;
}

function ProfilePage({ profile, onSaved }: { profile: RiderProfile; onSaved: (profile: RiderProfile) => void }) {
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [vehicleType, setVehicleType] = useState(profile.vehicleType ?? 'BIKE');
  const [registration, setRegistration] = useState(profile.registration ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await riderRequest<RiderProfile>('/riders/me', {
        method: 'PATCH',
        bodyData: { phone: phone.trim(), vehicleType, ...(registration.trim() ? { registration: registration.trim() } : {}) },
      });
      onSaved(updated);
      setNotice('Rider profile updated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Rider profile could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  return <section className="rider-content"><div className="shop-heading"><div><p>Account</p><h1>Rider profile</h1></div></div><form className="rider-profile-form" onSubmit={(event) => void submit(event)}><div><span>Application status</span><strong>{profile.status.replaceAll('_', ' ')}</strong></div><label>Phone number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} pattern="\\+94[0-9]{9}" required /></label><label>Vehicle type<select value={vehicleType} onChange={(event) => setVehicleType(event.target.value)}><option value="BIKE">Bike</option><option value="TUK">Tuk</option><option value="CAR">Car</option></select></label><label>Vehicle registration<input value={registration} onChange={(event) => setRegistration(event.target.value)} maxLength={40} /></label>{error && <p className="registration-error" role="alert">{error}</p>}{notice && <p className="rider-success" role="status">{notice}</p>}<button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></form></section>;
}

function EarningsPage() {
  const [earnings, setEarnings] = useState<{ earned: number; pending: number; settlements?: { id: string; amount: number | string; status: string; reference?: string | null; createdAt: string }[] }>({ earned: 0, pending: 0, settlements: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    riderRequest<typeof earnings>('/riders/me/earnings')
      .then((result) => { if (active) setEarnings(result); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Settlement information could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);
  return <section className="rider-content"><div className="shop-heading"><div><p>Earnings</p><h1>Settlements</h1></div><button className="rider-refresh" type="button" onClick={() => setReloadKey((key) => key + 1)} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>{error && <p className="registration-error" role="alert">{error}<button type="button" onClick={() => setReloadKey((key) => key + 1)}>Retry</button></p>}
    <div className="earnings-grid"><article><span>Total earned</span><strong>{loading ? '—' : `LKR ${Number(earnings.earned).toFixed(2)}`}</strong></article><article><span>Pending settlement</span><strong>{loading ? '—' : `LKR ${Number(earnings.pending).toFixed(2)}`}</strong></article></div>
    <h2 className="rider-section-title">Settlement history</h2>{loading && !earnings.settlements?.length ? <div className="empty-workspace" role="status">Loading settlements…</div> : earnings.settlements?.length ? <div className="delivery-list">{earnings.settlements.map((item) => <article className="delivery-request" key={item.id}><div><strong>{item.reference ?? `Settlement ${item.id.slice(0, 8)}`}</strong><p>{item.status.replaceAll('_', ' ')} · {new Date(item.createdAt).toLocaleDateString()}</p></div><span>LKR {Number(item.amount).toFixed(2)}</span></article>)}</div> : !error && <div className="empty-workspace"><h2>No settlements recorded</h2><p>Completed rider settlements will appear here.</p></div>}</section>;
}
