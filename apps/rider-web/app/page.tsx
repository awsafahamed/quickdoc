'use client';

import { useEffect, useState } from 'react';

type RiderView = 'dashboard' | 'requests' | 'active' | 'history' | 'earnings' | 'profile';
type RiderProfile = { status: string; RiderAvailability?: { online: boolean } | null };

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

  const toggleAvailability = async () => {
    const token = window.sessionStorage.getItem('rider-access-token');
    if (!token) {
      setAvailabilityError('Sign in again to update your availability.');
      return;
    }
    setAvailabilityError('');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    try {
      const response = await fetch(`${apiUrl}/riders/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ online: !online }),
      });
      if (!response.ok) throw new Error(response.status === 403 ? 'Rider approval is required before going online.' : 'Availability could not be updated.');
      const result = await response.json() as { data: { online: boolean } };
      setOnline(result.data.online);
    } catch (caught) {
      setAvailabilityError(caught instanceof TypeError ? 'Availability service is unavailable. Please try again.' : caught instanceof Error ? caught.message : 'Availability could not be updated.');
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
        <button className="rider-profile" type="button" onClick={() => setView('profile')}><span className="rider-avatar">RK</span><span><strong>Rider account</strong>        <small>Rider account</small></span></button>
      </aside>
      <main className="rider-main">
        <header className="topbar"><button className="rider-menu" type="button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><span /><span /><span /></button><div className="breadcrumb"><span>Rider workspace</span><b>›</b><strong>{nav.find((item) => item.id === view)?.label ?? 'My profile'}</strong></div><div className="topbar__actions"><button className="notification-button" type="button" aria-label="Notifications"><Icon name="bell" /><span /></button><button className="availability-button" type="button" aria-pressed={online} disabled={profile.status !== 'APPROVED' && !online} onClick={toggleAvailability}><i className={online ? 'online' : ''} />{online ? 'Online' : profile.status === 'APPROVED' ? 'Offline' : 'Pending approval'}</button></div></header>
        {availabilityError && <p className="registration-error" role="alert">{availabilityError}</p>}
        {view === 'dashboard' && <Dashboard online={online} status={profile.status} onToggleOnline={toggleAvailability} />}
        {view === 'requests' && <RequestsPage />}
        {view === 'active' && <ActiveDeliveryPage />}
        {view === 'history' && <SimplePage title="Delivery history" empty="Completed and cancelled deliveries will appear here." />}
        {view === 'earnings' && <EarningsPage />}
        {view === 'profile' && <ProfilePage />}
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

  useEffect(() => setError(initialError), [initialError]);

  return (
    <main className="rider-registration">
      <section className="rider-registration-copy"><span className="registration-mark">P</span><p>RIDER PORTAL</p><h1>Make every delivery count.</h1><p>Complete verification to receive print and attestation delivery requests.</p></section>
      <section className="rider-registration-panel"><div className="rider-auth-tabs"><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Create account</button><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Log in</button></div><p className="step-label">{mode === 'register' ? 'Rider registration' : 'Rider account access'}</p><h2>{mode === 'register' ? 'Create your rider account' : 'Welcome back'}</h2><form onSubmit={(event) => { event.preventDefault(); }}>
        {mode === 'register' && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" /></label>}
        <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="rider@quickdoc.lk" /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
        {mode === 'register' && <><label>Phone number<div className="phone-field"><span>🇱🇰 +94</span><input value={phone.replace('+94', '')} onChange={(event) => setPhone('+94' + event.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="70 123 4567" /></div></label><label>Vehicle tier<select value={vehicle} onChange={(event) => setVehicle(event.target.value)}><option value="BIKE">Flash Bike</option><option value="TUK">Flash Tuk</option><option value="CAR">Flash XL Car</option></select></label></>}
        {error && <p className="registration-error" role="alert">{error}</p>}
        <button type="button" onClick={async () => {
          if (!email || password.length < 8) { setError('Enter your email and an 8-character password.'); return; }
          const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
          try {
            if (mode === 'login') {
              const response = await fetch(`${apiUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password }) });
              if (!response.ok) { setError(response.status === 401 ? 'Email or password is incorrect.' : 'Sign-in service is unavailable. Please try again.'); return; }
              const result = await response.json() as { data: { accessToken: string; refreshToken: string } };
              const profileResponse = await fetch(`${apiUrl}/riders/me`, { headers: { Authorization: `Bearer ${result.data.accessToken}` } });
              if (!profileResponse.ok) { setError('This account does not have a rider profile. Create a rider account to apply.'); return; }
              const profileResult = await profileResponse.json() as { data: RiderProfile };
              window.sessionStorage.setItem('rider-access-token', result.data.accessToken);
              onRegistered(profileResult.data);
              return;
            }
            if (!name) { setError('Enter your full name.'); return; }
            const response = await fetch(`${apiUrl}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), email: email.trim(), password, phone: phone.trim(), role: 'RIDER' }) });
            if (!response.ok) { setError(response.status === 409 ? 'This email is already in use.' : 'Registration service is unavailable. Please try again.'); return; }
            const result = await response.json() as { data: { accessToken: string; refreshToken: string } };
            const profileResponse = await fetch(`${apiUrl}/riders/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${result.data.accessToken}` }, body: JSON.stringify({ phone: phone.trim(), vehicleType: vehicle }) });
            if (!profileResponse.ok) { setError('Your account was created, but the rider application could not be saved. Please sign in and retry.'); return; }
            const profileResult = await profileResponse.json() as { data: RiderProfile };
            window.sessionStorage.setItem('rider-access-token', result.data.accessToken);
            onRegistered(profileResult.data);
          } catch (caught) {
            setError(caught instanceof TypeError ? 'The rider service is unavailable. Please try again.' : 'The rider account could not be verified. Please try again.');
          }
        }}>{mode === 'register' ? 'Create rider account' : 'Sign in'}</button>
        <p className="registration-note">Applications require review before a rider can go online or receive work.</p>
      </form></section>
    </main>
  );
}

function Dashboard({ online, status, onToggleOnline }: { online: boolean; status: string; onToggleOnline: () => void }) {
  const statusLabel = status === 'APPROVED' ? 'Approved' : status === 'REJECTED' ? 'Not approved' : status === 'SUSPENDED' ? 'Suspended' : 'Pending review';
  return <section className="rider-content"><div className="shop-heading"><div><p>Today</p><h1>Rider workspace</h1></div><button className="availability-card" type="button" aria-pressed={online} disabled={status !== 'APPROVED' && !online} onClick={onToggleOnline}><i className={online ? 'online' : ''} /><span><strong>{online ? 'You are online' : status === 'APPROVED' ? 'You are offline' : statusLabel}</strong><small>{online ? 'Availability is active' : status === 'APPROVED' ? 'Turn on to receive work' : 'Review is required before receiving work'}</small></span></button></div><div className="rider-dashboard-grid"><article className="rider-status-card"><span>Application status</span><strong>{statusLabel}</strong><p>{status === 'APPROVED' ? 'Your account is approved. Availability controls whether you can receive work.' : 'Your application must be reviewed before you can receive assignments.'}</p></article><article className="rider-empty-card"><span className="production-icon">◫</span><div><strong>No active delivery</strong><p>Assigned deliveries will appear here after approval.</p></div></article></div></section>;
}

function RequestsPage() {
  const [assignments, setAssignments] = useState<{ id: string; earnings: number; Order: { reference: string; status: string } }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const token = window.sessionStorage.getItem('rider-access-token');
    if (!token) { setError('Sign in to load delivery requests.'); return; }
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    fetch(`${apiUrl}/riders/me/assignments`, { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 403 ? 'Approved rider status is required to view assignments.' : 'Delivery requests could not be loaded.');
      return response.json() as Promise<{ data: typeof assignments }>;
    }).then((result) => setAssignments(result.data)).catch((caught: unknown) => setError(caught instanceof TypeError ? 'Delivery service is unavailable. Please try again.' : caught instanceof Error ? caught.message : 'Delivery requests could not be loaded.'));
  }, []);
  return <section className="rider-content"><div className="shop-heading"><div><p>Available work</p><h1>Delivery requests</h1></div></div>{error && <p className="registration-error" role="alert">{error}</p>}{assignments.length ? <div className="delivery-list">{assignments.map((assignment) => <article className="delivery-request" key={assignment.id}><div><strong>{assignment.Order?.reference ?? assignment.id}</strong><p>Shared print or attestation delivery</p></div><span>LKR {Number(assignment.earnings).toFixed(2)}</span></article>)}</div> : !error && <div className="empty-workspace"><h2>No delivery requests</h2><p>Eligible assignments appear when you are approved and online.</p></div>}</section>;
}

function ActiveDeliveryPage() {
  return <section className="rider-content"><div className="shop-heading"><div><p>Current task</p><h1>Active delivery</h1></div></div><div className="empty-workspace"><h2>Handover updates are not available here yet</h2><p>Delivery status changes require server verification of a shop or customer handover code. The rider portal does not yet provide the code-sharing or status-update flow, so it will not report a handover as verified.</p></div></section>;
}

function ProfilePage() {
  return <section className="rider-content"><div className="shop-heading"><div><p>Account</p><h1>Rider profile</h1></div></div><div className="empty-workspace"><h2>Rider account</h2><p>Manage your contact and vehicle details here.</p></div></section>;
}

function EarningsPage() {
  const [earnings, setEarnings] = useState({ earned: 0, pending: 0 });
  const [error, setError] = useState('');
  useEffect(() => {
    const token = window.sessionStorage.getItem('rider-access-token');
    if (!token) { setError('Sign in to load settlement information.'); return; }
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    fetch(`${apiUrl}/riders/me/earnings`, { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => {
      if (!response.ok) throw new Error('Settlement information could not be loaded.');
      return response.json() as Promise<{ data: typeof earnings }>;
    }).then((result) => setEarnings(result.data)).catch((caught: unknown) => setError(caught instanceof TypeError ? 'Settlement service is unavailable. Please try again.' : caught instanceof Error ? caught.message : 'Settlement information could not be loaded.'));
  }, []);
  return <section className="rider-content"><div className="shop-heading"><div><p>Earnings</p><h1>Today and settlements</h1></div></div>{error ? <p className="registration-error" role="alert">{error}</p> : <div className="earnings-grid"><article><span>Total earned</span><strong>LKR {earnings.earned.toFixed(2)}</strong></article><article><span>Pending settlement</span><strong>LKR {earnings.pending.toFixed(2)}</strong></article></div>}</section>;
}

function SimplePage({ title, empty }: { title: string; empty: string }) {
  return <section className="rider-content"><div className="shop-heading"><div><p>Rider workspace</p><h1>{title}</h1></div></div><div className="empty-workspace"><h2>{empty}</h2></div></section>;
}
