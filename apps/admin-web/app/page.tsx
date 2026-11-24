'use client';

import { FormEvent, useEffect, useState } from 'react';

type AdminView = 'overview' | 'users' | 'shops' | 'riders' | 'orders' | 'services' | 'finance' | 'support' | 'settings';

const nav: { id: AdminView; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'users', label: 'Customers', icon: 'users' },
  { id: 'shops', label: 'Print shops', icon: 'shop' },
  { id: 'riders', label: 'Riders', icon: 'route' },
  { id: 'orders', label: 'All orders', icon: 'orders' },
  { id: 'services', label: 'Service catalogue', icon: 'tag' },
  { id: 'finance', label: 'Finance', icon: 'wallet' },
  { id: 'support', label: 'Support', icon: 'help' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    users: 'M16 21a5 5 0 0 0-10 0M11 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM18 8a3 3 0 0 1 0 6M20 20a4 4 0 0 0-3-3.7',
    shop: 'M4 10h16l-1-6H5zM5 10v10h14V10M9 20v-6h6v6',
    route: 'M6 20V9l6-5 6 5v11M9 20v-6h6v6',
    orders: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h4',
    tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
    wallet: 'M3 6h18v13H3zM3 10h18M16 14h2',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.1.8-1.7 1.3-1.7 2.7M12 17h.01',
    settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.6V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L7.6 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 6.4 14h-.2v-2.6h.2A1.7 1.7 0 0 0 8 10.4a1.7 1.7 0 0 0-.3-1.9l-.1-.1L9.4 6.6l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 12.4 5.4v-.2H15v.2A1.7 1.7 0 0 0 16 7a1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 8.4l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2V14H21a1.7 1.7 0 0 0-1.6 1z',
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function AdminPortal() {
  const [authenticated, setAuthenticated] = useState(false);
  const [view, setView] = useState<AdminView>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setAuthenticated(window.localStorage.getItem('admin-authenticated') === 'true'), []);

  if (!authenticated) {
    return <AdminLogin onLogin={() => { window.localStorage.setItem('admin-authenticated', 'true'); setAuthenticated(true); }} />;
  }

  return (
    <div className="admin-shell">
      {mobileOpen && <button className="mobile-backdrop" aria-label="Close navigation" type="button" onClick={() => setMobileOpen(false)} />}
      <aside className={`admin-sidebar ${mobileOpen ? 'admin-sidebar--open' : ''}`}>
        <div className="brand"><img src="/logo/quickdoc-logo.svg" alt="QuickDoc" /></div>
        <div className="sidebar__label">Administration</div>
        <nav>{nav.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} type="button" onClick={() => { setView(item.id); setMobileOpen(false); }}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
        <div className="admin-account"><span className="admin-avatar">SA</span><span><strong>Super admin</strong><small>Full access</small></span><button type="button" aria-label="Log out" onClick={() => { window.localStorage.removeItem('admin-authenticated'); setAuthenticated(false); }}>↗</button></div>
      </aside>
      <main className="admin-main">
        <header className="topbar"><button className="admin-menu" type="button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><span /><span /><span /></button><div className="breadcrumb"><span>Administration</span><b>›</b><strong>{nav.find((item) => item.id === view)?.label}</strong></div><div className="topbar__actions"><button className="notification-button" type="button" aria-label="Notifications"><svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg><span /></button><div className="topbar__avatar">SA</div></div></header>
        {view === 'overview' && <Overview />}
        {view === 'users' && <SimpleTable title="Customers" headers={['Customer', 'Phone', 'Status']} rows={[['No customers loaded', '—', '—']]} />}
        {view === 'shops' && <ShopsPage />}
        {view === 'riders' && <RidersPage />}
        {view === 'orders' && <SimpleTable title="All orders" headers={['Order', 'Customer', 'Status', 'Total']} rows={[['No orders loaded', '—', '—', '—']]} />}
        {view === 'services' && <ServicesPage />}
        {view === 'finance' && <SimpleTable title="Finance" headers={['Transaction', 'Type', 'Status', 'Amount']} rows={[['No transactions', '—', '—', '—']]} />}
        {view === 'support' && <SimpleTable title="Support" headers={['Ticket', 'Customer', 'Status']} rows={[['No support tickets', '—', '—']]} />}
        {view === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email || password.length < 8) { setError('Enter a valid admin email and password.'); return; }
    onLogin();
  };
  return <main className="admin-login"><section className="admin-login-copy"><span className="registration-mark">P</span><p>SUPER ADMIN</p><h1>Marketplace operations, in one place.</h1><p>Manage users, verification, orders, partners and platform settings.</p></section><section className="admin-login-panel"><p className="step-label">Secure administration</p><h1>Welcome back.</h1><p className="admin-login-copytext">Sign in with your administrator account.</p><form onSubmit={submit}><label>Email address<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(''); }} placeholder="admin@printattest.lk" /></label><label>Password<input type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} placeholder="At least 8 characters" /></label>{error && <p className="registration-error" role="alert">{error}</p>}<button type="submit">Sign in</button></form></section></main>;
}

function Overview() {
  const [overview, setOverview] = useState({ users: 0, shops: 0, pendingShops: 0, riders: 0, pendingRiders: 0, orders: 0 });
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    fetch(`${apiUrl}/admin/overview`).then((response) => response.ok ? response.json() as Promise<{ data: typeof overview }> : Promise.reject()).then((result) => setOverview(result.data)).catch(() => undefined);
  }, []);
  return <section className="admin-content"><div className="admin-heading"><div><p>Platform</p><h1>Operations overview</h1></div><span className="health-badge"><i />Systems ready</span></div><div className="metric-grid"><Metric label="Customers" value={overview.users} detail="Registered accounts" /><Metric label="Print shops" value={overview.shops} detail={`${overview.pendingShops} awaiting review`} /><Metric label="Riders" value={overview.riders} detail={`${overview.pendingRiders} awaiting review`} /><Metric label="Orders" value={overview.orders} detail="All marketplace orders" /></div><div className="admin-overview-grid"><article className="panel-card"><div className="panel-heading"><strong>Needs attention</strong><button type="button">View all</button></div><EmptyLine label="Shop applications" count={overview.pendingShops} /><EmptyLine label="Rider applications" count={overview.pendingRiders} /></article><article className="panel-card"><div className="panel-heading"><strong>Operational status</strong></div><div className="status-list"><span><i className="green" />API</span><strong>Connected when available</strong></div><div className="status-list"><span><i />Payments</span><strong>Integration required</strong></div></article></div></section>;
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>;
}

function EmptyLine({ label, count }: { label: string; count: number }) {
  return <div className="empty-line"><span>{label}</span><strong>{count}</strong></div>;
}

function ShopsPage() {
  return <SimpleTable title="Print shops" headers={['Shop', 'Status', 'Orders', 'Action']} rows={[['No shop applications loaded', '—', '—', '—']]} />;
}

function RidersPage() {
  return <SimpleTable title="Riders" headers={['Rider', 'Vehicle', 'Status', 'Action']} rows={[['No rider accounts loaded', '—', '—', '—']]} />;
}

function SimpleTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return <section className="admin-content"><div className="admin-heading"><div><p>Management</p><h1>{title}</h1></div></div><div className="admin-table"><div className="admin-table-row admin-table-head">{headers.map((header) => <strong key={header}>{header}</strong>)}</div>{rows.map((row, index) => <div className="admin-table-row" key={index}>{row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}</div>)}</div></section>;
}

function ServicesPage() {
  const [services, setServices] = useState(['A4 printing', 'A3 printing', 'Black & white', 'Colour printing', 'Double-sided', 'Stapling', 'Binding', 'Lamination']);
  return <section className="admin-content"><div className="admin-heading"><div><p>Platform catalogue</p><h1>Service catalogue</h1></div><button className="primary-action" type="button" onClick={() => setServices((items) => [...items, 'New service'])}>Add service</button></div><div className="catalogue-list">{services.map((service) => <div className="catalogue-row" key={service}><span className="catalogue-icon"><Icon name="tag" /></span><strong>{service}</strong><button type="button">Edit</button></div>)}</div></section>;
}

function SettingsPage() {
  return <section className="admin-content"><div className="admin-heading"><div><p>Platform</p><h1>Settings</h1></div></div><div className="settings-card"><label>Currency<select defaultValue="LKR"><option>LKR</option></select></label><label>Default country<select defaultValue="Sri Lanka"><option>Sri Lanka</option></select></label></div></section>;
}
