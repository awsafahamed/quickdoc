'use client';

import { FormEvent, ReactNode, useEffect, useState } from 'react';
import {
  AdminApiError,
  adminLogin,
  adminLogout,
  adminRequest,
} from './admin-api';
import PlatformCatalogPage from './catalog-page';
import SupportAdminPage from './support-page';

type AdminView =
  | 'overview'
  | 'users'
  | 'shops'
  | 'riders'
  | 'agents'
  | 'orders'
  | 'services'
  | 'finance'
  | 'support'
  | 'audit'
  | 'settings';

type AdminUser = { id: string; name: string; email: string; suspended: boolean; createdAt: string; UserRole: { role: string }[]; CustomerProfile: { phone: string | null } | null; _count: { orders: number } };
type AdminShop = { id: string; name: string; address: string; phone: string; status: string; isOpen: boolean; createdAt: string; owner: { name: string; email: string }; _count: { Order: number } };
type AdminRider = { userId: string; phone: string | null; vehicleType: string | null; registration: string | null; status: string; createdAt: string; User: { name: string; email: string }; RiderAvailability: { online: boolean; updatedAt: string } | null; _count: { DeliveryAssignment: number } };
type AdminAgent = { id: string; userId: string; businessName: string; address: string; phone: string; status: string; isOpen: boolean; createdAt: string; user: { name: string; email: string }; _count: { jobs: number; services: number } };
type AdminOrder = { id: string; reference: string; status: string; currency: string; total: number | string; createdAt: string; customer: { name: string; email: string }; Shop: { name: string }; Payment: { status: string; method: string; amount: number | string } | null; DeliveryAssignment: { RiderProfile: { User: { name: string; email: string } } } | null };
type AdminAudit = { id: string; action: string; entityId: string | null; createdAt: string; User: { name: string; email: string } | null };
type ListResult<T> = { data: T[]; pagination: { page: number; pageSize: number; total: number; pageCount: number } };
type AdminSession = { id: string; email: string; roles: string[] };

const nav: { id: AdminView; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'users', label: 'Customers', icon: 'users' },
  { id: 'shops', label: 'Print shops', icon: 'shop' },
  { id: 'riders', label: 'Riders', icon: 'route' },
  { id: 'agents', label: 'Attestation agents', icon: 'agents' },
  { id: 'orders', label: 'All orders', icon: 'orders' },
  { id: 'services', label: 'Service catalogue', icon: 'tag' },
  { id: 'finance', label: 'Finance', icon: 'wallet' },
  { id: 'support', label: 'Support', icon: 'help' },
  { id: 'audit', label: 'Audit log', icon: 'audit' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const ORDER_STATUSES = [
  'PENDING_ACCEPTANCE',
  'ACCEPTED',
  'REJECTED',
  'PRINTING',
  'READY_FOR_PICKUP',
  'RIDER_ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'DELIVERY_FAILED',
];

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    users: 'M16 21a5 5 0 0 0-10 0M11 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM18 8a3 3 0 0 1 0 6M20 20a4 4 0 0 0-3-3.7',
    shop: 'M4 10h16l-1-6H5zM5 10v10h14V10M9 20v-6h6v6',
    route: 'M6 20V9l6-5 6 5v11M9 20v-6h6v6',
    agents: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0M18 8h4M20 6v4',
    orders: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h4',
    tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
    wallet: 'M3 6h18v13H3zM3 10h18M16 14h2',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.1.8-1.7 1.3-1.7 2.7M12 17h.01',
    audit: 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h4',
    settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.6V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L7.6 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 6.4 14h-.2v-2.6h.2A1.7 1.7 0 0 0 8 10.4a1.7 1.7 0 0 0-.3-1.9l-.1-.1L9.4 6.6l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 12.4 5.4v-.2H15v.2A1.7 1.7 0 0 0 16 7a1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 8.4l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2V14H21a1.7 1.7 0 0 0-1.6 1z',
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function AdminPortal() {
  const [authState, setAuthState] = useState<'checking' | 'signed-out' | 'ready' | 'error'>('checking');
  const [session, setSession] = useState<AdminSession | null>(null);
  const [authError, setAuthError] = useState('');
  const [view, setView] = useState<AdminView>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    adminRequest<{ data: AdminSession }>('/auth/session')
      .then(({ data }) => {
        if (!active) return;
        if (!data.roles.includes('ADMIN')) {
          setAuthState('signed-out');
          setAuthError('This account does not have administrator access.');
          return;
        }
        setSession(data);
        setAuthState('ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof AdminApiError && (error.status === 401 || error.status === 403)) {
          setAuthState('signed-out');
          if (error.status === 403) setAuthError(error.message);
        } else {
          setAuthError(error instanceof Error ? error.message : 'Could not verify your session.');
          setAuthState('error');
        }
      });
    return () => { active = false; };
  }, []);

  const handleLogin = async (email: string, password: string) => {
    const user = await adminLogin(email, password);
    setSession(user);
    setAuthError('');
    setAuthState('ready');
  };

  const handleLogout = async () => {
    try {
      await adminLogout();
    } catch {
      setAuthError('Could not confirm sign-out with the API. This browser session has been cleared.');
    } finally {
      setSession(null);
      setAuthState('signed-out');
      setView('overview');
    }
  };

  const handleSessionExpired = () => {
    setSession(null);
    setAuthState('signed-out');
    setAuthError('Your session has expired. Sign in again.');
  };

  if (authState === 'checking') {
    return <main className="admin-auth-wait" aria-live="polite">Checking administrator session…</main>;
  }
  if (authState === 'error') {
    return <main className="admin-auth-wait"><div role="alert"><h1>Could not verify your session</h1><p>{authError}</p><button className="primary-action" type="button" onClick={() => window.location.reload()}>Retry</button></div></main>;
  }
  if (authState === 'signed-out' || !session) {
    return <AdminLogin initialError={authError} onLogin={handleLogin} />;
  }

  return (
    <div className="admin-shell">
      {mobileOpen && <button className="mobile-backdrop" aria-label="Close navigation" type="button" onClick={() => setMobileOpen(false)} />}
      <aside className={`admin-sidebar ${mobileOpen ? 'admin-sidebar--open' : ''}`}>
        <div className="brand"><img src="/logo/quickdoc-logo.svg" alt="QuickDoc" /></div>
        <div className="sidebar__label">Administration</div>
        <nav aria-label="Admin sections">{nav.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} type="button" aria-current={view === item.id ? 'page' : undefined} onClick={() => { setView(item.id); setMobileOpen(false); }}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
        <div className="admin-account"><span className="admin-avatar">SA</span><span className="admin-account__details"><strong>Super admin</strong><small>{session.email}</small></span><button type="button" aria-label="Log out" title="Log out" onClick={handleLogout}>↗</button></div>
      </aside>
      <main className="admin-main">
        <header className="topbar"><button className="admin-menu" type="button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><span /><span /><span /></button><div className="breadcrumb"><span>Administration</span><b>›</b><strong>{nav.find((item) => item.id === view)?.label}</strong></div><div className="topbar__actions"><span className="topbar__role">ADMIN</span><div className="topbar__avatar" aria-hidden="true">SA</div></div></header>
        {view === 'overview' && <Overview onNavigate={setView} onSessionExpired={handleSessionExpired} />}
        {view === 'users' && <UsersPage currentUserId={session.id} reloadKey={reloadKey} onMutation={() => setReloadKey((key) => key + 1)} onSessionExpired={handleSessionExpired} />}
        {view === 'shops' && <ShopsPage reloadKey={reloadKey} onMutation={() => setReloadKey((key) => key + 1)} onSessionExpired={handleSessionExpired} />}
        {view === 'riders' && <RidersPage reloadKey={reloadKey} onMutation={() => setReloadKey((key) => key + 1)} onSessionExpired={handleSessionExpired} />}
        {view === 'agents' && <AgentsPage reloadKey={reloadKey} onMutation={() => setReloadKey((key) => key + 1)} onSessionExpired={handleSessionExpired} />}
        {view === 'orders' && <OrdersPage reloadKey={reloadKey} onMutation={() => setReloadKey((key) => key + 1)} onSessionExpired={handleSessionExpired} />}
        {view === 'services' && <PlatformCatalogPage onSessionExpired={handleSessionExpired} />}
        {view === 'finance' && <FinancePage onSessionExpired={handleSessionExpired} />}
        {view === 'support' && <SupportAdminPage adminId={session.id} onSessionExpired={handleSessionExpired} />}
        {view === 'audit' && <AuditPage reloadKey={reloadKey} onSessionExpired={handleSessionExpired} />}
        {view === 'settings' && <SettingsPage onSessionExpired={handleSessionExpired} />}
      </main>
    </div>
  );
}

function AdminLogin({ onLogin, initialError }: { onLogin: (email: string, password: string) => Promise<void>; initialError: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onLogin(email.trim(), password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  };
  return <main className="admin-login"><section className="admin-login-copy"><span className="registration-mark" aria-hidden="true">Q</span><p>SUPER ADMIN</p><h1>Marketplace operations, in one place.</h1><p>Manage customers, partner verification, orders and platform operations.</p></section><section className="admin-login-panel"><p className="step-label">Secure administration</p><h1>Welcome back.</h1><p className="admin-login-copytext">Sign in with your administrator account.</p><form onSubmit={submit}><label>Email address<input type="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); setError(''); }} placeholder="admin@example.com" /></label><label>Password<input type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} placeholder="Your password" /></label>{error && <p className="registration-error" role="alert">{error}</p>}<button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button></form></section></main>;
}

function PageHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="admin-heading"><div><h1>{title}</h1>{description && <p className="admin-heading__description">{description}</p>}</div>{action}</div>;
}

function Overview({ onNavigate, onSessionExpired }: { onNavigate: (view: AdminView) => void; onSessionExpired: () => void }) {
  const [overview, setOverview] = useState<{ users: number; shops: number; pendingShops: number; riders: number; pendingRiders: number; agents: number; pendingAgents: number; orders: number } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    setError('');
    adminRequest<{ data: NonNullable<typeof overview> }>('/admin/overview')
      .then((result) => setOverview(result.data))
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Could not load platform overview.');
        if (reason instanceof AdminApiError && reason.status === 401) onSessionExpired();
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  return <section className="admin-content"><PageHeading title="Operations overview" description="Marketplace activity and outstanding partner reviews." action={<button className="secondary-action" type="button" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>} />
    {error && <ErrorNotice message={error} onRetry={load} />}
    {loading && !overview ? <LoadingBlock label="Loading platform metrics" /> : overview && <>
      <div className="metric-grid"><Metric label="Customers" value={overview.users} detail="Registered accounts" /><Metric label="Print shops" value={overview.shops} detail={`${overview.pendingShops} pending review`} /><Metric label="Riders" value={overview.riders} detail={`${overview.pendingRiders} pending review`} /><Metric label="Orders" value={overview.orders} detail="Marketplace orders" /></div>
      <div className="admin-overview-grid"><article className="panel-card"><div className="panel-heading"><strong>Partner reviews</strong><span>Applications awaiting a decision</span></div><AttentionLine label="Print shops" count={overview.pendingShops} onClick={() => onNavigate('shops')} /><AttentionLine label="Riders" count={overview.pendingRiders} onClick={() => onNavigate('riders')} /><AttentionLine label="Attestation agents" count={overview.pendingAgents} onClick={() => onNavigate('agents')} /></article><article className="panel-card"><div className="panel-heading"><strong>Quick access</strong><span>Operational records</span></div><button className="quick-link" type="button" onClick={() => onNavigate('orders')}>Review marketplace orders <span aria-hidden="true">→</span></button><button className="quick-link" type="button" onClick={() => onNavigate('finance')}>View payment and settlement records <span aria-hidden="true">→</span></button><button className="quick-link" type="button" onClick={() => onNavigate('audit')}>Inspect administrator activity <span aria-hidden="true">→</span></button></article></div>
    </>}</section>;
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{new Intl.NumberFormat().format(value)}</strong><p>{detail}</p></article>;
}

function AttentionLine({ label, count, onClick }: { label: string; count: number; onClick: () => void }) {
  return <button className="empty-line" type="button" onClick={onClick}><span>{label}</span><strong>{count}</strong></button>;
}

function ResourcePage<T extends { id?: string; userId?: string }>({
  title,
  description,
  endpoint,
  columns,
  renderRow,
  reloadKey,
  onMutation,
  onSessionExpired,
}: {
  title: string;
  description: string;
  endpoint: string;
  columns: string[];
  renderRow: (item: T, performAction: (id: string, path: string, body: unknown) => Promise<boolean>, busy: boolean) => ReactNode;
  reloadKey: number;
  onMutation?: () => void;
  onSessionExpired: () => void;
}) {
  const [items, setItems] = useState<T[]>([]);
  const [pagination, setPagination] = useState<ListResult<T>['pagination'] | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ page: String(page), pageSize: '50' });
      if (search.trim()) params.set('search', search.trim());
      adminRequest<ListResult<T>>(`${endpoint}?${params.toString()}`, { signal: controller.signal })
        .then((result) => { setItems(result.data); setPagination(result.pagination); })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setError(reason instanceof Error ? reason.message : `Could not load ${title.toLowerCase()}.`);
          if (reason instanceof AdminApiError && reason.status === 401) onSessionExpired();
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, search ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [endpoint, page, search, reloadKey, retryKey]);

  const performAction = async (id: string, path: string, body: unknown) => {
    if (busyId) return false;
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      await adminRequest(path, { method: 'PATCH', body: JSON.stringify(body) });
      setNotice('Change saved.');
      onMutation?.();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The change could not be saved.');
      if (reason instanceof AdminApiError && reason.status === 401) onSessionExpired();
      return false;
    } finally {
      setBusyId('');
    }
  };

  return <section className="admin-content"><PageHeading title={title} description={description} />
    <div className="resource-toolbar"><label className="search-field"><span className="sr-only">Search {title.toLowerCase()}</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={`Search ${title.toLowerCase()}…`} /></label>{pagination && <span className="result-count">{pagination.total.toLocaleString()} records</span>}</div>
    {error && <ErrorNotice message={error} onRetry={() => setRetryKey((key) => key + 1)} />}
    {notice && <p className="success-notice" role="status">{notice}</p>}
    <div className="data-table"><table><thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>
      {loading && items.length === 0 && <tr><td colSpan={columns.length}><LoadingBlock label={`Loading ${title.toLowerCase()}`} /></td></tr>}
      {!loading && items.length === 0 && <tr><td colSpan={columns.length}><div className="table-empty"><strong>{search ? 'No matching records' : `No ${title.toLowerCase()} yet`}</strong><span>{search ? 'Try another search term.' : 'Records will appear here when the platform has data.'}</span></div></td></tr>}
      {items.map((item) => {
        const id = item.id ?? item.userId ?? '';
        return <tr key={id}>{renderRow(item, (targetId, path, body) => performAction(targetId, path, body), busyId === id)}</tr>;
      })}
    </tbody></table></div>
    {pagination && pagination.pageCount > 1 && <div className="pagination"><span>Page {pagination.page} of {pagination.pageCount}</span><div><button className="secondary-action" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="secondary-action" type="button" disabled={page >= pagination.pageCount || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}
    {busyId && <span className="sr-only" role="status">Saving change…</span>}
  </section>;
}

function UsersPage(props: { currentUserId: string; reloadKey: number; onMutation: () => void; onSessionExpired: () => void }) {
  const { currentUserId, ...resourceProps } = props;
  return <ResourcePage<AdminUser> {...resourceProps} title="Customers" description="Review accounts and control customer access." endpoint="/admin/users" columns={['Customer', 'Contact', 'Orders', 'Access', 'Joined', 'Action']} renderRow={(user, action, busy) => <>
    <td><strong className="table-primary">{user.name}</strong><span className="table-secondary">{user.email}</span></td><td>{user.CustomerProfile?.phone ?? '—'}</td><td>{user._count.orders}</td><td><StatusBadge status={user.suspended ? 'SUSPENDED' : 'ACTIVE'} /></td><td>{formatDate(user.createdAt)}</td><td><button className="table-action" type="button" disabled={busy || (user.id === currentUserId && !user.suspended)} title={user.id === currentUserId ? 'You cannot suspend your own administrator account' : undefined} onClick={() => { if (window.confirm(`${user.suspended ? 'Restore' : 'Suspend'} access for ${user.name}?`)) void action(user.id, `/admin/users/${user.id}/suspended`, { suspended: !user.suspended }); }}>{user.suspended ? 'Restore access' : 'Suspend'}</button></td>
  </>} />;
}

function ShopsPage(props: { reloadKey: number; onMutation: () => void; onSessionExpired: () => void }) {
  return <ResourcePage<AdminShop> {...props} title="Print shops" description="Review partner applications and manage marketplace availability." endpoint="/admin/shops" columns={['Shop', 'Owner', 'Contact', 'Orders', 'Status', 'Actions']} renderRow={(shop, action, busy) => <>
    <td><strong className="table-primary">{shop.name}</strong><span className="table-secondary">{shop.address}</span></td><td>{shop.owner.name}<span className="table-secondary">{shop.owner.email}</span></td><td>{shop.phone}</td><td>{shop._count.Order}</td><td><StatusBadge status={shop.status} /></td><td><ApprovalActions id={shop.id} status={shop.status} path={`/admin/shops/${shop.id}/status`} onAction={action} label={shop.name} busy={busy} /></td>
  </>} />;
}

function RidersPage(props: { reloadKey: number; onMutation: () => void; onSessionExpired: () => void }) {
  return <ResourcePage<AdminRider> {...props} title="Riders" description="Review courier applications and see their current availability." endpoint="/admin/riders" columns={['Rider', 'Phone', 'Vehicle', 'Assignments', 'Availability', 'Status', 'Actions']} renderRow={(rider, action, busy) => <>
    <td><strong className="table-primary">{rider.User.name}</strong><span className="table-secondary">{rider.User.email}</span></td><td>{rider.phone ?? '—'}</td><td>{rider.vehicleType ?? '—'}{rider.registration && <span className="table-secondary">{rider.registration}</span>}</td><td>{rider._count.DeliveryAssignment}</td><td>{rider.RiderAvailability?.online ? <StatusBadge status="ONLINE" /> : 'Offline'}</td><td><StatusBadge status={rider.status} /></td><td><ApprovalActions id={rider.userId} status={rider.status} path={`/admin/riders/${rider.userId}/status`} onAction={action} label={rider.User.name} busy={busy} /></td>
  </>} />;
}

function AgentsPage(props: { reloadKey: number; onMutation: () => void; onSessionExpired: () => void }) {
  return <ResourcePage<AdminAgent> {...props} title="Attestation agents" description="Review service-provider applications and manage acceptance of new jobs." endpoint="/admin/agents" columns={['Business', 'Account owner', 'Contact', 'Jobs', 'Availability', 'Status', 'Actions']} renderRow={(agent, action, busy) => <>
    <td><strong className="table-primary">{agent.businessName}</strong><span className="table-secondary">{agent.address}</span></td><td>{agent.user.name}<span className="table-secondary">{agent.user.email}</span></td><td>{agent.phone}</td><td>{agent._count.jobs}</td><td>{agent.isOpen ? <StatusBadge status="OPEN" /> : 'Closed'}</td><td><StatusBadge status={agent.status} /></td><td><ApprovalActions id={agent.userId} status={agent.status} path={`/admin/agents/${agent.userId}/status`} onAction={action} label={agent.businessName} busy={busy} /></td>
  </>} />;
}

function ApprovalActions({ id, status, path, onAction, label, busy }: { id: string; status: string; path: string; onAction: (id: string, path: string, body: unknown) => Promise<boolean>; label: string; busy: boolean }) {
  if (status === 'PENDING') {
    return <div className="row-actions"><button className="table-action" type="button" disabled={busy} onClick={() => void onAction(id, path, { status: 'APPROVED' })}>Approve</button><button className="table-action table-action--danger" type="button" disabled={busy} onClick={() => { if (window.confirm(`Reject ${label}?`)) void onAction(id, path, { status: 'REJECTED' }); }}>Reject</button></div>;
  }
  if (status === 'APPROVED') {
    return <button className="table-action table-action--danger" type="button" disabled={busy} onClick={() => { if (window.confirm(`Suspend ${label}? They will no longer accept new work.`)) void onAction(id, path, { status: 'SUSPENDED' }); }}>Suspend</button>;
  }
  if (status === 'SUSPENDED' || status === 'REJECTED') {
    return <button className="table-action" type="button" disabled={busy} onClick={() => { if (window.confirm(`Approve ${label} and restore marketplace availability?`)) void onAction(id, path, { status: 'APPROVED' }); }}>Approve</button>;
  }
  return <span>—</span>;
}

function OrdersPage(props: { reloadKey: number; onMutation: () => void; onSessionExpired: () => void }) {
  return <ResourcePage<AdminOrder> {...props} title="All orders" description="Inspect order, payment and fulfilment states. Administrator status overrides require a reason." endpoint="/admin/orders" columns={['Order', 'Customer', 'Shop', 'Payment', 'Total', 'Status', 'Update status']} renderRow={(order, action, busy) => <OrderRow order={order} onAction={action} busy={busy} />} />;
}

function OrderRow({ order, onAction, busy }: { order: AdminOrder; onAction: (id: string, path: string, body: unknown) => Promise<boolean>; busy: boolean }) {
  const [status, setStatus] = useState(order.status);
  const [reason, setReason] = useState('');
  return <>
    <td><strong className="table-primary">{order.reference}</strong><span className="table-secondary">{formatDate(order.createdAt)}</span></td><td>{order.customer.name}<span className="table-secondary">{order.customer.email}</span></td><td>{order.Shop.name}</td><td>{order.Payment ? <><StatusBadge status={order.Payment.status} /><span className="table-secondary">{order.Payment.method}</span></> : 'Not recorded'}</td><td>{formatMoney(order.total, order.currency)}</td><td><StatusBadge status={order.status} /></td><td><div className="order-status-control"><label className="sr-only" htmlFor={`order-status-${order.id}`}>New status for {order.reference}</label><select id={`order-status-${order.id}`} disabled={busy} value={status} onChange={(event) => setStatus(event.target.value)}>{ORDER_STATUSES.map((value) => <option key={value} value={value}>{formatStatus(value)}</option>)}</select><label className="sr-only" htmlFor={`order-reason-${order.id}`}>Reason for changing {order.reference}</label><input id={`order-reason-${order.id}`} disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Reason required" /><button className="table-action" type="button" disabled={busy || status === order.status || reason.trim().length < 3} onClick={() => { if (window.confirm(`Update ${order.reference} to ${formatStatus(status)}?`)) void onAction(order.id, `/admin/orders/${order.id}/status`, { status, reason: reason.trim() }).then((saved) => { if (saved) setReason(''); }); }}>Save</button></div></td>
  </>;
}

type FinanceData = {
  payments: { id: string; amount: number | string; method: string; status: string; gatewayReference: string | null; createdAt: string; Order: { reference: string; currency: string; customer: { name: string; email: string } } }[];
  settlements: { id: string; amount: number | string; status: string; reference: string | null; createdAt: string; Shop: { name: string } | null; RiderProfile: { User: { name: string; email: string } } | null; AgentProfile: { businessName: string } | null }[];
  paidTotal: number;
  pendingSettlementTotal: number;
};

function FinancePage({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    adminRequest<{ data: FinanceData }>('/admin/finance')
      .then((result) => setFinance(result.data))
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Could not load financial records.');
        if (reason instanceof AdminApiError && reason.status === 401) onSessionExpired();
      })
      .finally(() => setLoading(false));
  }, []);
  return <section className="admin-content"><PageHeading title="Finance" description="Read-only payment and settlement records. Payment outcomes must be reconciled with the payment provider." />
    {error && <ErrorNotice message={error} onRetry={() => window.location.reload()} />}
    {loading && <LoadingBlock label="Loading financial records" />}
    {finance && <>
      <div className="metric-grid metric-grid--finance"><Metric label="Payments received" value={finance.payments.length} detail="Recent payment records" /><article className="metric-card"><span>Paid total</span><strong className="metric-card__money">{formatMoney(finance.paidTotal, 'LKR')}</strong><p>All confirmed payment records</p></article><article className="metric-card"><span>Awaiting settlement</span><strong className="metric-card__money">{formatMoney(finance.pendingSettlementTotal, 'LKR')}</strong><p>Pending settlement records</p></article><Metric label="Settlements" value={finance.settlements.length} detail="Recent partner settlements" /></div>
      <h2 className="subsection-title">Payments</h2><div className="data-table"><table><thead><tr><th>Order</th><th>Customer</th><th>Method</th><th>Status</th><th>Amount</th><th>Recorded</th></tr></thead><tbody>{finance.payments.map((payment) => <tr key={payment.id}><td>{payment.Order.reference}</td><td>{payment.Order.customer.name}<span className="table-secondary">{payment.Order.customer.email}</span></td><td>{formatStatus(payment.method)}</td><td><StatusBadge status={payment.status} /></td><td>{formatMoney(payment.amount, payment.Order.currency)}</td><td>{formatDate(payment.createdAt)}</td></tr>)}{finance.payments.length === 0 && <tr><td colSpan={6}><div className="table-empty"><strong>No payments recorded</strong></div></td></tr>}</tbody></table></div>
      <h2 className="subsection-title">Partner settlements</h2><div className="data-table"><table><thead><tr><th>Reference</th><th>Partner</th><th>Status</th><th>Amount</th><th>Created</th></tr></thead><tbody>{finance.settlements.map((settlement) => <tr key={settlement.id}><td>{settlement.reference ?? '—'}</td><td>{settlement.Shop?.name ?? settlement.RiderProfile?.User.name ?? settlement.AgentProfile?.businessName ?? 'Unassigned partner'}</td><td><StatusBadge status={settlement.status} /></td><td>{formatMoney(settlement.amount, 'LKR')}</td><td>{formatDate(settlement.createdAt)}</td></tr>)}{finance.settlements.length === 0 && <tr><td colSpan={5}><div className="table-empty"><strong>No settlements recorded</strong></div></td></tr>}</tbody></table></div>
      <p className="operational-note">Financial records are displayed for reconciliation only. This panel does not create refunds, mark payments as paid, or release settlements.</p>
    </>}</section>;
}

function AuditPage(props: { reloadKey: number; onSessionExpired: () => void }) {
  return <ResourcePage<AdminAudit> {...props} title="Audit log" description="Recent administrator actions recorded by the platform." endpoint="/admin/audit" columns={['Action', 'Administrator', 'Record', 'Time']} renderRow={(entry) => <>
    <td><strong className="table-primary">{formatStatus(entry.action)}</strong></td><td>{entry.User?.name ?? 'System'}{entry.User?.email && <span className="table-secondary">{entry.User.email}</span>}</td><td className="table-id">{entry.entityId ?? '—'}</td><td>{formatDate(entry.createdAt)}</td>
  </>} />;
}

function SettingsPage({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [currency, setCurrency] = useState('LKR');
  const [country, setCountry] = useState('Sri Lanka');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    adminRequest<{ data: Record<string, unknown> }>('/admin/settings')
      .then(({ data }) => {
        if (typeof data['platform.currency'] === 'string') setCurrency(data['platform.currency']);
        if (typeof data['platform.country'] === 'string') setCountry(data['platform.country']);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Could not load platform settings.');
        if (reason instanceof AdminApiError && reason.status === 401) onSessionExpired();
      })
      .finally(() => setLoading(false));
  }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await adminRequest('/admin/settings', { method: 'PATCH', body: JSON.stringify({ currency: currency.trim(), country: country.trim() }) });
      setMessage('Platform settings saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Settings could not be saved.');
      if (reason instanceof AdminApiError && reason.status === 401) onSessionExpired();
    } finally {
      setSaving(false);
    }
  };
  return <section className="admin-content"><PageHeading title="Platform settings" description="Stored platform defaults." />
    {error && <ErrorNotice message={error} onRetry={() => window.location.reload()} />}
    <form className="settings-card" onSubmit={save} aria-busy={loading || saving}><label>Currency code<input autoComplete="off" maxLength={8} required value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} /></label><label>Default country<input autoComplete="country-name" maxLength={80} required value={country} onChange={(event) => setCountry(event.target.value)} /></label><p className="operational-note">These defaults are stored in the platform settings record. Payment routing, tax, and legal configuration are not implemented here.</p>{message && <p className="success-notice" role="status">{message}</p>}<button className="primary-action" type="submit" disabled={loading || saving || !currency.trim() || !country.trim()}>{saving ? 'Saving…' : 'Save settings'}</button></form>
  </section>;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = ['approved', 'active', 'online', 'open', 'enabled', 'paid', 'delivered', 'completed'].includes(normalized)
    ? 'positive'
    : ['pending', 'pending_acceptance', 'accepted', 'printing', 'ready_for_pickup', 'rider_assigned', 'picked_up', 'out_for_delivery', 'processing'].includes(normalized)
      ? 'warning'
      : ['rejected', 'suspended', 'failed', 'cancelled', 'delivery_failed', 'disabled', 'refunded'].includes(normalized)
        ? 'negative'
        : 'neutral';
  return <span className={`status-badge status-badge--${tone}`}><i aria-hidden="true" />{formatStatus(status)}</span>;
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-notice" role="alert"><span>{message}</span><button type="button" onClick={onRetry}>Retry</button></div>;
}

function LoadingBlock({ label }: { label: string }) {
  return <div className="loading-block" role="status"><span className="loading-indicator" />{label}…</div>;
}

function formatStatus(value: string) {
  return value.toLowerCase().split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatMoney(value: number | string, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
