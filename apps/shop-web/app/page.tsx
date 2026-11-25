'use client';

import { useEffect, useState } from 'react';

type ShopView = 'dashboard' | 'orders' | 'services' | 'profile' | 'staff' | 'earnings';

const nav: { id: ShopView; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'orders', label: 'Incoming orders', icon: 'orders' },
  { id: 'services', label: 'Services & pricing', icon: 'tag' },
  { id: 'profile', label: 'Shop profile', icon: 'shop' },
  { id: 'staff', label: 'Staff', icon: 'users' },
  { id: 'earnings', label: 'Earnings', icon: 'wallet' },
];

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    orders: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h4',
    tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
    shop: 'M4 10h16l-1-6H5zM5 10v10h14V10M9 20v-6h6v6',
    users: 'M16 21a5 5 0 0 0-10 0M11 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM18 8a3 3 0 0 1 0 6M20 20a4 4 0 0 0-3-3.7',
    wallet: 'M3 6h18v13H3zM3 10h18M16 14h2',
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function ShopPortal() {
  const [view, setView] = useState<ShopView>('dashboard');
  const [registered, setRegistered] = useState(false);
  const [shopName, setShopName] = useState('');
  const [orders, setOrders] = useState<{ id: string; reference: string; status: string }[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setRegistered(window.localStorage.getItem('print-shop-registered') === 'true' && !!window.sessionStorage.getItem('shop-access-token'));
  }, []);

  if (!registered) {
    return <RegistrationPage onRegistered={(name) => {
      setShopName(name);
      window.localStorage.setItem('print-shop-registered', 'true');
      window.localStorage.setItem('print-shop-name', name);
      setRegistered(true);
    }} />;
  }

  return (
    <div className="shop-shell">
      {mobileOpen && <button className="mobile-backdrop" aria-label="Close navigation" type="button" onClick={() => setMobileOpen(false)} />}
      <aside className={`shop-sidebar ${mobileOpen ? 'shop-sidebar--open' : ''}`}>
        <div className="brand"><img src="/logo/quickdoc-logo.svg" alt="QuickDoc" /></div>
        <div className="sidebar__label">Shop workspace</div>
        <nav>{nav.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} type="button" onClick={() => { setView(item.id); setMobileOpen(false); }}><NavIcon name={item.icon} /><span>{item.label}</span></button>)}</nav>
        <div className="shop-sidebar-footer"><span className="shop-account-mark">CP</span><div><strong>{shopName || window.localStorage.getItem('print-shop-name') || 'Print shop'}</strong><small>Shop owner</small></div><button className="shop-signout" type="button" aria-label="Log out" onClick={() => { window.localStorage.removeItem('print-shop-registered'); setRegistered(false); }}>↗</button></div>
      </aside>
      <main className="shop-main">
        <header className="topbar"><button className="shop-menu" type="button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><span /><span /><span /></button><div className="breadcrumb"><span>Shop workspace</span><b>›</b><strong>{nav.find((item) => item.id === view)?.label}</strong></div><div className="topbar__actions"><button className="notification-button" type="button" aria-label="Notifications"><svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg><span /></button><div className="topbar__avatar">CP</div></div></header>
        {view === 'dashboard' && <Dashboard />}
        {view === 'orders' && <OrdersPage orders={orders} />}
        {view === 'services' && <ServicesPage />}
        {view === 'profile' && <ProfilePage />}
        {view === 'staff' && <SimplePage title="Staff" empty="No staff members have been added." />}
        {view === 'earnings' && <SimplePage title="Earnings" empty="Approved and paid settlements will appear here." />}
      </main>
    </div>
  );
}

function RegistrationPage({ onRegistered }: { onRegistered: (name: string) => void }) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+94');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [address, setAddress] = useState('');
  const [documents, setDocuments] = useState<File[]>([]);
  const [error, setError] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void (async () => {
      if (mode === 'login') {
        if (!email || password.length < 8) { setError('Enter your email and password.'); return; }
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
        const response = await fetch(`${apiUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password }) });
        if (!response.ok) { setError('Email or password is incorrect.'); return; }
        const result = await response.json() as { data: { accessToken: string; refreshToken: string; user: { email: string } } };
        window.sessionStorage.setItem('shop-access-token', result.data.accessToken);
        window.localStorage.setItem('shop-refresh-token', result.data.refreshToken);
        window.localStorage.setItem('print-shop-registered', 'true');
        onRegistered('Print shop');
        return;
      }
      if (!name || !address || !email) { setError('Complete the business name, email and address.'); return; }
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
      const response = await fetch(`${apiUrl}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim(), password, role: 'SHOP_OWNER' }) });
      if (!response.ok) { setError('Registration failed. This email may already be in use.'); return; }
      const result = await response.json() as { data: { accessToken: string; refreshToken: string; user: { id: string } } };
      window.sessionStorage.setItem('shop-access-token', result.data.accessToken);
      window.localStorage.setItem('shop-refresh-token', result.data.refreshToken);
      await fetch(`${apiUrl}/shops/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${result.data.accessToken}` }, body: JSON.stringify({ ownerId: result.data.user.id, name: name.trim(), phone: phone.trim(), email: email.trim(), address: address.trim(), latitude: 6.9271, longitude: 79.8612 }) });
      window.localStorage.setItem('print-shop-registered', 'true');
      window.localStorage.setItem('print-shop-name', name.trim());
      onRegistered(name.trim());
    })();
  };

  return (
    <main className="registration-page">
      <section className="registration-copy"><span className="registration-mark">P</span><p>PRINT SHOP PORTAL</p><h1>Manage every print job with confidence.</h1><p>Register your business, submit verification documents and prepare to receive customer orders.</p></section>
      <section className="registration-panel"><div className="registration-tabs"><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Register</button><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Log in</button></div><p className="step-label">{mode === 'register' ? 'Shop registration · verification required' : 'Shop owner access'}</p><h2>{mode === 'register' ? 'Business details' : 'Welcome back'}</h2><form onSubmit={submit}>
        {mode === 'register' && <label>Shop or business name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Colombo Print House" /></label>}
        <label>Business email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="hello@shop.lk" /></label>
        {mode === 'register' && <label>Business phone<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>}
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
        {mode === 'register' && <label>Shop address<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street, building and city" /></label>}
        {mode === 'register' && <div className="verification-upload"><strong>Verification documents</strong><p>Business registration, owner ID or business licence.</p><label className="upload-document"><input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={(event) => setDocuments(Array.from(event.target.files ?? []))} />Choose documents</label>{documents.length > 0 && <small>{documents.length} document(s) selected</small>}</div>}
        {error && <p className="registration-error" role="alert">{error}</p>}
        <button type="submit">{mode === 'register' ? 'Submit for verification' : 'Log in'}</button>
        <p className="registration-note">{mode === 'register' ? 'The shop will be publicly listed only after approval.' : 'New shops appear after registration and verification approval.'}</p>
      </form></section>
    </main>
  );
}

function Dashboard() {
  const [status, setStatus] = useState<{ status: string; isOpen: boolean } | null>(null);
  const [orders, setOrders] = useState<{ id: string }[]>([]);
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const token = window.sessionStorage.getItem('shop-access-token');
    fetch(`${apiUrl}/shop/me`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.json() as Promise<{ data: { status: string; isOpen: boolean } }> : Promise.reject()).then((result) => setStatus(result.data)).catch(() => undefined);
    fetch(`${apiUrl}/shop/me/orders`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.json() as Promise<{ data: { id: string }[] }> : Promise.reject()).then((result) => setOrders(result.data)).catch(() => undefined);
  }, []);
  const toggleAvailability = async () => {
    if (!status) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const token = window.sessionStorage.getItem('shop-access-token');
    const response = await fetch(`${apiUrl}/shop/me/availability`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ isOpen: !status.isOpen }) });
    if (response.ok) setStatus({ ...status, isOpen: !status.isOpen });
  };
  return <section className="shop-content"><div className="shop-heading"><div><p>Today</p><h1>Business overview</h1></div><button className="open-toggle" type="button" onClick={toggleAvailability}><i className={status?.isOpen ? 'open' : ''} />{status?.isOpen ? 'Accepting orders' : 'Closed to orders'}</button></div><div className="dashboard-grid"><article className="status-card"><span className="status-card-label">Verification</span><strong>{status?.status === 'APPROVED' ? 'Approved' : 'Under review'}</strong><p>{status?.status === 'APPROVED' ? 'Your shop is eligible for customer discovery.' : 'Your application is waiting for admin approval.'}</p></article><article className="production-card"><div><span className="production-icon">◫</span><div><strong>{orders.length ? `${orders.length} incoming orders` : 'No incoming orders'}</strong><p>Production activity appears here.</p></div></div></article></div></section>;
}

type ShopOrder = {
  id: string;
  reference: string;
  status: string;
  OrderItem?: { documentId: string; Document: { name: string } }[];
};

function OrdersPage({ orders }: { orders: { id: string; reference: string; status: string }[] }) {
  const [liveOrders, setLiveOrders] = useState<ShopOrder[]>(orders);
  const [documentError, setDocumentError] = useState('');
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const token = window.sessionStorage.getItem('shop-access-token');
    fetch(`${apiUrl}/shop/me/orders`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.json() as Promise<{ data: ShopOrder[] }> : Promise.reject()).then((result) => setLiveOrders(result.data)).catch(() => setLiveOrders([]));
  }, []);
  const previewDocument = async (order: ShopOrder, documentId: string) => {
    const previewWindow = window.open('about:blank', '_blank');
    if (!previewWindow) {
      setDocumentError('Allow pop-ups for QuickDoc to preview an order document.');
      return;
    }
    setDocumentError('');
    try {
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
      const token = window.sessionStorage.getItem('shop-access-token');
      const response = await fetch(`${apiUrl}/shop/me/orders/${order.id}/documents/${documentId}/preview-url`, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (!response.ok) throw new Error('This order document could not be opened.');
      const result = await response.json() as { data: { previewUrl: string } };
      previewWindow.opener = null;
      previewWindow.location.href = result.data.previewUrl;
    } catch (error) {
      previewWindow.close();
      setDocumentError(error instanceof Error ? error.message : 'This order document could not be opened.');
    }
  };

  const transition = async (id: string, status: 'ACCEPTED' | 'REJECTED' | 'PRINTING' | 'READY_FOR_PICKUP') => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const token = window.sessionStorage.getItem('shop-access-token');
    const response = await fetch(`${apiUrl}/shop/me/orders/${id}/transition`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) });
    if (response.ok) setLiveOrders((items) => items.map((item) => item.id === id ? { ...item, status } : item));
  };
  return <section className="shop-content"><div className="shop-heading"><div><p>Production</p><h1>Incoming orders</h1></div></div>{documentError && <p className="document-error" role="alert">{documentError}</p>}{liveOrders.length ? liveOrders.map((order) => <div className="shop-list-row" key={order.id}><div><strong>{order.reference}</strong><small>{order.status}</small>{order.OrderItem?.map((item) => <button className="order-document-button" key={item.documentId} type="button" onClick={() => void previewDocument(order, item.documentId)}>Preview {item.Document.name}</button>)}</div><div className="order-actions">{order.status === 'PENDING_ACCEPTANCE' && <><button type="button" onClick={() => transition(order.id, 'ACCEPTED')}>Accept</button><button type="button" onClick={() => transition(order.id, 'REJECTED')}>Reject</button></>}{order.status === 'ACCEPTED' && <button type="button" onClick={() => transition(order.id, 'PRINTING')}>Start printing</button>}{order.status === 'PRINTING' && <button type="button" onClick={() => transition(order.id, 'READY_FOR_PICKUP')}>Mark ready</button>}</div></div>) : <div className="empty-workspace"><h2>No orders to process</h2><p>Accepted and in-progress orders will appear here.</p></div>}</section>;
}

function ServicesPage() {
  const defaultServices = [
    { code: 'PAPER_A4', name: 'A4 printing', price: 0.5 },
    { code: 'PAPER_A3', name: 'A3 printing', price: 1.5 },
    { code: 'BLACK_WHITE', name: 'Black & white', price: 0.5 },
    { code: 'COLOUR', name: 'Colour printing', price: 1.5 },
    { code: 'DUPLEX', name: 'Double-sided', price: 0.25 },
    { code: 'STAPLING', name: 'Stapling', price: 2 },
    { code: 'BINDING', name: 'Binding', price: 8 },
    { code: 'LAMINATION', name: 'Lamination', price: 3 },
  ];
  const [services, setServices] = useState(defaultServices.map((service) => ({ ...service, enabled: true })));
  const updatePrice = (code: string, price: number) => setServices((items) => items.map((item) => item.code === code ? { ...item, price } : item));
  const toggle = (code: string) => setServices((items) => items.map((item) => item.code === code ? { ...item, enabled: !item.enabled } : item));
  const save = async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const token = window.sessionStorage.getItem('shop-access-token');
    await Promise.all(services.map((service) => fetch(`${apiUrl}/shop/me/services`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ code: service.code, enabled: service.enabled, price: service.price }) })));
  };
  return <section className="shop-content"><div className="shop-heading"><div><p>Catalogue</p><h1>Services & pricing</h1></div><button className="button button--primary" type="button" onClick={save}>Save changes</button></div><div className="service-table">{services.map((service) => <div className="service-row" key={service.code}><label className="service-toggle"><input type="checkbox" checked={service.enabled} onChange={() => toggle(service.code)} /><span /></label><strong>{service.name}</strong><label className="service-price"><span>LKR</span><input type="number" min="0" step="0.01" value={service.price} onChange={(event) => updatePrice(service.code, Number(event.target.value))} /></label></div>)}</div></section>;
}

function ProfilePage() {
  const [profile, setProfile] = useState({ name: '', address: '', phone: '+94', latitude: 6.9271, longitude: 79.8612 });
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const token = window.sessionStorage.getItem('shop-access-token');
    fetch(`${apiUrl}/shop/me`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.json() as Promise<{ data: typeof profile }> : Promise.reject()).then((result) => setProfile(result.data)).catch(() => undefined);
  }, []);
  const save = async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const token = window.sessionStorage.getItem('shop-access-token');
    const response = await fetch(`${apiUrl}/shop/me`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(profile) });
    setSaved(response.ok);
  };
  return <section className="shop-content"><div className="shop-heading"><div><p>Business</p><h1>Shop profile</h1></div></div><div className="profile-panel"><label>Shop name<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label><label>Business address<input value={profile.address} onChange={(event) => setProfile({ ...profile, address: event.target.value })} /></label><label>Phone<input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label><div className="coordinates"><label>Latitude<input type="number" value={profile.latitude} onChange={(event) => setProfile({ ...profile, latitude: Number(event.target.value) })} /></label><label>Longitude<input type="number" value={profile.longitude} onChange={(event) => setProfile({ ...profile, longitude: Number(event.target.value) })} /></label></div><button className="button button--primary" type="button" onClick={save}>Save profile</button>{saved && <p className="saved-state">Profile saved.</p>}</div></section>;
}

function SimplePage({ title, empty }: { title: string; empty: string }) {
  return <section className="shop-content"><div className="shop-heading"><div><p>Shop workspace</p><h1>{title}</h1></div></div><div className="empty-workspace"><h2>{empty}</h2></div></section>;
}
