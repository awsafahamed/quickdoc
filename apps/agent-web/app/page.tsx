'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AgentCatalogService,
  AgentEarnings,
  AgentNotification,
  AgentProfile,
  AgentService,
  AgentSession,
  AgentSettlement,
  AttestationJob,
  CustodyEvent,
  apiRequest,
  clearSession,
  saveSession,
} from './agent-api';

type AgentView = 'dashboard' | 'jobs' | 'processing' | 'completed' | 'services' | 'earnings' | 'profile';
type AuthValues = { name?: string; email: string; password: string };

const navigation: { id: AgentView; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Overview', icon: 'grid' },
  { id: 'jobs', label: 'Assigned jobs', icon: 'orders' },
  { id: 'processing', label: 'Processing', icon: 'process' },
  { id: 'completed', label: 'Completed', icon: 'check' },
  { id: 'services', label: 'Services & pricing', icon: 'tag' },
  { id: 'earnings', label: 'Settlements', icon: 'wallet' },
];

const statusLabels: Record<string, string> = {
  PICKUP_SCHEDULED: 'Pickup scheduled',
  COLLECTED: 'Collected',
  AGENT_RECEIVED: 'Received by agent',
  PROCESSING: 'Processing',
  ATTESTED: 'Attested',
  RETURN_READY: 'Ready for return',
  RETURN_SCHEDULED: 'Return scheduled',
  RETURN_PICKED_UP: 'Return collected',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  RETURNED: 'Returned to customer',
  CANCELLED: 'Cancelled',
  BOOKED: 'Booked',
};

const custodyActions: Record<string, { eventType: string; label: string }> = {
  COLLECTED: { eventType: 'RECEIVED', label: 'Confirm document receipt' },
  AGENT_RECEIVED: { eventType: 'PROCESSING', label: 'Start processing' },
  PROCESSING: { eventType: 'ATTESTED', label: 'Mark attestation complete' },
  ATTESTED: { eventType: 'RETURN_READY', label: 'Mark ready for return' },
  RETURN_READY: { eventType: 'RETURNED', label: 'Confirm returned to customer' },
};

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    orders: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h4',
    process: 'M4 12a8 8 0 1 0 3-6.2M4 3v5h5',
    check: 'M3 12l6 6L21 6',
    tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
    wallet: 'M3 6h18v13H3zM3 10h18M16 14h2',
    bell: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    refresh: 'M20 7v5h-5M4 17v-5h5M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2',
    arrow: 'M5 12h14M13 6l6 6-6 6',
  };
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? paths.grid} />
    </svg>
  );
}

function formatMoney(value: number | string) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-LK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getAddress(value: Record<string, unknown> | string) {
  if (typeof value === 'string') return value;
  const parts = Object.values(value).filter(
    (part): part is string | number => typeof part === 'string' || typeof part === 'number',
  );
  return parts.join(', ') || 'Address details unavailable';
}

export default function AgentPortal() {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [view, setView] = useState<AgentView>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [jobs, setJobs] = useState<AttestationJob[]>([]);
  const [services, setServices] = useState<AgentService[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<AgentCatalogService[]>([]);
  const [earnings, setEarnings] = useState<AgentEarnings>({ total: 0, paid: 0, pending: 0, settlements: [] });
  const [notifications, setNotifications] = useState<AgentNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const stored = window.localStorage.getItem('quickdoc-agent-session');
    if (!stored) {
      setBooting(false);
      return;
    }

    let active = true;
    void (async () => {
      try {
        const current = JSON.parse(stored) as AgentSession;
        const identity = await apiRequest<{ id: string; roles: string[] }>('/auth/session');
        if (!identity.roles.includes('AGENT')) {
          clearSession();
          throw new Error('This account does not have agent access.');
        }
        if (!active) return;
        setSession(current);
        const currentProfile = await apiRequest<AgentProfile | null>('/agents/me');
        if (active) setProfile(currentProfile);
      } catch (requestError) {
        if (active) {
          clearSession();
          setError(requestError instanceof Error ? requestError.message : 'Unable to restore your session.');
        }
      } finally {
        if (active) setBooting(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    setDataLoading(true);
    setError('');
    void Promise.all([
      apiRequest<AttestationJob[]>('/agents/me/jobs'),
      apiRequest<AgentService[]>('/agents/me/services'),
      apiRequest<AgentCatalogService[]>('/attestation/services'),
      apiRequest<AgentEarnings>('/agents/me/earnings'),
      apiRequest<AgentNotification[]>('/agents/me/notifications'),
    ])
      .then(([nextJobs, nextServices, nextCatalog, nextEarnings, nextNotifications]) => {
        if (!active) return;
        setJobs(nextJobs);
        setServices(nextServices);
        setServiceCatalog(nextCatalog);
        setEarnings(nextEarnings);
        setNotifications(nextNotifications);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load your workspace.');
      })
      .finally(() => {
        if (active) setDataLoading(false);
      });
    return () => {
      active = false;
    };
  }, [profile, reloadKey]);

  async function signIn(values: AuthValues) {
    setBusy(true);
    setError('');
    try {
      const signedIn = await apiRequest<AgentSession>('/auth/login', {
        method: 'POST',
        body: { email: values.email, password: values.password },
      });
      if (!signedIn.user.roles.includes('AGENT')) {
        throw new Error('This account does not have agent access. Sign in with an agent account.');
      }
      saveSession(signedIn);
      setSession(signedIn);
      setProfile(await apiRequest<AgentProfile | null>('/agents/me'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }

  async function register(values: AuthValues) {
    setBusy(true);
    setError('');
    try {
      const created = await apiRequest<AgentSession>('/auth/register/agent', {
        method: 'POST',
        body: values,
      });
      saveSession(created);
      setSession(created);
      setProfile(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create your account.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAgentProfile(values: Pick<AgentProfile, 'businessName' | 'address' | 'phone'>) {
    setBusy(true);
    setError('');
    try {
      const saved = await apiRequest<AgentProfile>('/agents/register', {
        method: 'POST',
        body: values,
      });
      setProfile(saved);
      setNotice('Your profile was submitted. It will remain unavailable for new work until approved.');
      setView('dashboard');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save your profile.');
    } finally {
      setBusy(false);
    }
  }

  async function updateAvailability(isOpen: boolean) {
    setError('');
    try {
      setProfile(await apiRequest<AgentProfile>('/agents/me/availability', {
        method: 'PATCH',
        body: { isOpen },
      }));
      setNotice(isOpen ? 'Your account is now accepting new work.' : 'Your account is no longer accepting new work.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update availability.');
    }
  }

  async function markNotificationRead(notificationId: string) {
    setError('');
    try {
      await apiRequest(`/agents/me/notifications/${encodeURIComponent(notificationId)}/read`, {
        method: 'PATCH',
      });
      setNotifications((current) => current.map((item) =>
        item.id === notificationId ? { ...item, readAt: new Date().toISOString() } : item,
      ));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update this notification.');
    }
  }

  async function signOut() {
    const stored = window.localStorage.getItem('quickdoc-agent-session');
    let logoutWarning = '';
    try {
      if (stored) {
        const current = JSON.parse(stored) as AgentSession;
        await apiRequest<{ loggedOut: boolean }>('/auth/logout', {
          method: 'POST',
          body: { refreshToken: current.refreshToken },
        });
      }
    } catch (requestError) {
      logoutWarning = requestError instanceof Error
        ? `Signed out on this device, but the server session could not be revoked: ${requestError.message}`
        : 'Signed out on this device, but the server session could not be revoked.';
    } finally {
      clearSession();
      setSession(null);
      setProfile(null);
      setJobs([]);
      setServices([]);
      setView('dashboard');
      setError(logoutWarning);
      setNotice('');
    }
  }

  if (booting) return <LoadingScreen />;
  if (!session) {
    return <AuthScreen busy={busy} error={error} onSignIn={signIn} onRegister={register} onClearError={() => setError('')} />;
  }
  if (!profile) {
    return <AgentProfileSetup busy={busy} error={error} onSave={saveAgentProfile} onSignOut={signOut} />;
  }

  const currentLabel = navigation.find((item) => item.id === view)?.label ?? 'Agent profile';
  return (
    <div className="agent-shell">
      {mobileOpen && <button className="mobile-backdrop" aria-label="Close navigation" type="button" onClick={() => setMobileOpen(false)} />}
      <aside className={`agent-sidebar ${mobileOpen ? 'agent-sidebar--open' : ''}`}>
        <div className="brand"><img src="/logo/quickdoc-logo.svg" alt="QuickDoc" /></div>
        <div className="sidebar__label">Agent workspace</div>
        <nav aria-label="Agent workspace">
          {navigation.map((item) => (
            <button className={view === item.id ? 'active' : ''} key={item.id} type="button" aria-current={view === item.id ? 'page' : undefined} onClick={() => { setView(item.id); setMobileOpen(false); }}>
              <Icon name={item.icon} /><span>{item.label}</span>
              {item.id === 'jobs' && jobs.length > 0 && <span className="nav-count">{jobs.filter((job) => !['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(job.status)).length}</span>}
            </button>
          ))}
        </nav>
        <button className={`agent-profile ${view === 'profile' ? 'active' : ''}`} type="button" onClick={() => { setView('profile'); setMobileOpen(false); }}>
          <span className="agent-avatar">{profile.businessName.slice(0, 2).toUpperCase()}</span>
          <span><strong>{profile.businessName}</strong><small>{profile.status === 'APPROVED' ? 'Verified agent' : 'Verification pending'}</small></span>
        </button>
      </aside>
      <main className="agent-main">
        <header className="topbar">
          <button className="agent-menu" type="button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><span /><span /><span /></button>
          <div className="breadcrumb"><span>Agent workspace</span><b>›</b><strong>{currentLabel}</strong></div>
          <div className="topbar__actions">
            <div className="notifications-menu">
              <button className="notification-button" type="button" aria-label={`Notifications${notifications.some((item) => !item.readAt) ? ', unread items' : ''}`} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}><Icon name="bell" />{notifications.some((item) => !item.readAt) && <span className="notification-dot" />}</button>
              {notificationsOpen && <div className="notification-panel" role="region" aria-label="Notifications"><div className="notification-panel-heading"><strong>Notifications</strong><span>{notifications.filter((item) => !item.readAt).length} unread</span></div>{notifications.length ? notifications.map((item) => <button className={`notification-item ${item.readAt ? 'notification-item--read' : ''}`} key={item.id} type="button" onClick={() => { if (!item.readAt) void markNotificationRead(item.id); }}><span><strong>{item.title}</strong><time>{formatDate(item.createdAt)}</time></span><p>{item.body}</p></button>) : <p className="notification-empty">You’re all caught up.</p>}</div>}
            </div>
            <span className={`account-status ${profile.status === 'APPROVED' ? 'account-status--approved' : ''}`}><i />{profile.status === 'APPROVED' ? (profile.isOpen ? 'Accepting work' : 'Not accepting work') : 'Verification pending'}</span>
            <button className="sign-out" type="button" onClick={signOut}>Sign out</button>
            <span className="topbar__avatar" aria-label={profile.businessName}>{profile.businessName.slice(0, 2).toUpperCase()}</span>
          </div>
        </header>
        <div className="agent-content">
          {error && <div className="notice notice--error" role="alert"><span>{error}</span><button type="button" onClick={() => setReloadKey((key) => key + 1)}>Try again</button></div>}
          {notice && <div className="notice notice--success" role="status"><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}>Dismiss</button></div>}
          {view === 'dashboard' && <Dashboard profile={profile} jobs={jobs} earnings={earnings} loading={dataLoading} setView={setView} onAvailability={updateAvailability} />}
          {view === 'jobs' && <JobsPage jobs={jobs} services={services} loading={dataLoading} onUpdated={() => setReloadKey((key) => key + 1)} />}
          {view === 'processing' && <JobsPage jobs={jobs} services={services} loading={dataLoading} processing onUpdated={() => setReloadKey((key) => key + 1)} />}
          {view === 'completed' && <JobsPage jobs={jobs} services={services} loading={dataLoading} completed onUpdated={() => setReloadKey((key) => key + 1)} />}
          {view === 'services' && <ServicesPage services={services} catalog={serviceCatalog} loading={dataLoading} onSaved={() => setReloadKey((key) => key + 1)} />}
          {view === 'earnings' && <EarningsPage earnings={earnings} loading={dataLoading} />}
          {view === 'profile' && <ProfilePage profile={profile} busy={busy} onSave={async (values) => {
            setBusy(true);
            setError('');
            try {
              const updated = await apiRequest<AgentProfile>('/agents/me', { method: 'PATCH', body: values });
              setProfile(updated);
              setNotice('Your profile details were updated.');
            } catch (requestError) {
              setError(requestError instanceof Error ? requestError.message : 'Unable to update your profile.');
            } finally {
              setBusy(false);
            }
          }} onAvailability={updateAvailability} />}
        </div>
      </main>
    </div>
  );
}

function LoadingScreen() {
  return <main className="loading-screen" aria-live="polite"><img src="/logo/quickdoc-logo.svg" alt="QuickDoc" /><span className="loading-indicator" />Loading your workspace</main>;
}

function AuthScreen({ busy, error, onSignIn, onRegister, onClearError }: {
  busy: boolean;
  error: string;
  onSignIn: (values: AuthValues) => Promise<void>;
  onRegister: (values: AuthValues) => Promise<void>;
  onClearError: () => void;
}) {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = { name: name.trim(), email: email.trim(), password };
    void (mode === 'signin' ? onSignIn(values) : onRegister(values));
  }
  return (
    <main className="agent-auth">
      <section className="agent-auth__intro">
        <img src="/logo/quickdoc-logo.svg" alt="QuickDoc" />
        <div><p className="auth-kicker">For attestation partners</p><h1>Keep every document moving with care.</h1><p>Manage your assigned work, record custody milestones and keep your service details up to date.</p></div>
        <span className="auth-footnote">Private workspace for registered agents</span>
      </section>
      <section className="agent-auth__panel">
        <div className="auth-form">
          <div className="auth-heading"><span className="auth-overline">Agent workspace</span><h2>{mode === 'signin' ? 'Welcome back' : 'Create your agent account'}</h2><p>{mode === 'signin' ? 'Sign in to manage your attestation work.' : 'Start with your account details. Your business profile is submitted next.'}</p></div>
          <form onSubmit={submit}>
            {mode === 'register' && <label>Your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required /></label>}
            <label>Email address<input type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'register' ? 8 : undefined} maxLength={128} required /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-action auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}<Icon name="arrow" /></button>
          </form>
          <p className="auth-switch">{mode === 'signin' ? 'New to QuickDoc?' : 'Already have an account?'} <button type="button" onClick={() => { setMode(mode === 'signin' ? 'register' : 'signin'); onClearError(); }}>{mode === 'signin' ? 'Create an agent account' : 'Sign in'}</button></p>
        </div>
      </section>
    </main>
  );
}

function AgentProfileSetup({ busy, error, onSave, onSignOut }: {
  busy: boolean;
  error: string;
  onSave: (values: Pick<AgentProfile, 'businessName' | 'address' | 'phone'>) => Promise<void>;
  onSignOut: () => void;
}) {
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  return (
    <main className="setup-shell">
      <header className="setup-header"><img src="/logo/quickdoc-logo.svg" alt="QuickDoc" /><button className="sign-out" type="button" onClick={onSignOut}>Sign out</button></header>
      <section className="setup-panel">
        <span className="auth-overline">Agent application</span><h1>Tell us about your agency</h1>
        <p>These details are reviewed before your account can accept attestation work.</p>
        <form onSubmit={(event) => { event.preventDefault(); void onSave({ businessName: businessName.trim(), phone: phone.trim(), address: address.trim() }); }}>
          <label>Business or agency name<input value={businessName} onChange={(event) => setBusinessName(event.target.value)} minLength={2} maxLength={120} required /></label>
          <label>Business phone<input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} minLength={7} maxLength={20} required /></label>
          <label>Business address<textarea value={address} onChange={(event) => setAddress(event.target.value)} minLength={5} maxLength={500} rows={3} required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-action" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit for verification'}</button>
        </form>
        <p className="setup-note">Your account stays unavailable for new work until it is approved.</p>
      </section>
    </main>
  );
}

function Dashboard({ profile, jobs, earnings, loading, setView, onAvailability }: {
  profile: AgentProfile;
  jobs: AttestationJob[];
  earnings: AgentEarnings;
  loading: boolean;
  setView: (view: AgentView) => void;
  onAvailability: (isOpen: boolean) => Promise<void>;
}) {
  const activeJobs = jobs.filter((job) => !['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(job.status));
  const processingJobs = jobs.filter((job) => ['AGENT_RECEIVED', 'PROCESSING', 'ATTESTED', 'RETURN_READY'].includes(job.status));
  const completeJobs = jobs.filter((job) => ['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(job.status));
  const latestJobs = [...activeJobs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 4);
  return (
    <section>
      <div className="agent-heading dashboard-heading">
        <div><p className="page-context">{new Intl.DateTimeFormat('en-LK', { dateStyle: 'full' }).format(new Date())}</p><h1>Welcome, {profile.user.name.split(' ')[0]}</h1><p className="heading-subtitle">{profile.businessName}</p></div>
        {profile.status === 'APPROVED' && <label className="availability-switch"><span>{profile.isOpen ? 'Accepting new work' : 'Not accepting work'}</span><input type="checkbox" checked={profile.isOpen} onChange={(event) => void onAvailability(event.target.checked)} /><span className="switch-track" /></label>}
      </div>
      {profile.status !== 'APPROVED' && <div className={`verification-banner verification-banner--${profile.status.toLowerCase()}`}><span className="verification-dot" /><div><strong>{profile.status === 'REJECTED' ? 'Application needs attention' : profile.status === 'SUSPENDED' ? 'Account suspended' : 'Verification in progress'}</strong><p>{profile.status === 'PENDING' ? 'Your business profile has been submitted. New work will be available after it is approved.' : profile.status === 'REJECTED' ? 'Your account is not approved to accept jobs. Contact support for next steps.' : 'This account cannot accept new jobs at this time.'}</p></div></div>}
      <div className="summary-grid">
        <SummaryMetric label="Assigned jobs" value={loading ? '—' : activeJobs.length.toString()} note="Work not yet completed" icon="orders" />
        <SummaryMetric label="In progress" value={loading ? '—' : processingJobs.length.toString()} note="Custody confirmed" icon="process" />
        <SummaryMetric label="Completed" value={loading ? '—' : completeJobs.length.toString()} note="Returned to customer" icon="check" />
        <SummaryMetric label="Pending settlement" value={loading ? '—' : formatMoney(earnings.pending)} note="Recorded by operations" icon="wallet" />
      </div>
      <div className="dashboard-section-heading"><div><h2>Recent jobs</h2><p>Your latest assigned attestation work</p></div><button className="text-action" type="button" onClick={() => setView('jobs')}>View all jobs <Icon name="arrow" /></button></div>
      {latestJobs.length ? <div className="recent-jobs">{latestJobs.map((job) => <button className="recent-job-row" key={job.id} type="button" onClick={() => setView('jobs')}><span className="job-reference">{job.reference}</span><span className="recent-job-service">{job.serviceCode.replaceAll('_', ' ')}</span><span className={`status-pill status-pill--${job.status.toLowerCase()}`}>{statusLabels[job.status] ?? job.status.replaceAll('_', ' ')}</span><span className="row-arrow"><Icon name="arrow" /></span></button>)}</div> : <div className="empty-workspace"><span className="empty-mark"><Icon name="orders" /></span><h2>No jobs assigned yet</h2><p>{profile.status === 'APPROVED' ? 'New jobs will appear here when they are assigned to your agency.' : 'Your assigned work will appear here after your account is approved.'}</p></div>}
      <div className="dashboard-lower">
        <div className="dashboard-lower__copy"><span className="section-rule" /><h2>Keep your service information current</h2><p>Customers see the services, prices and estimated turnaround times you maintain in your catalogue.</p><button className="secondary-action" type="button" onClick={() => setView('services')}>Manage services</button></div>
        <button className="earnings-preview" type="button" onClick={() => setView('earnings')}><span><Icon name="wallet" />Settlement overview</span><strong>{loading ? '—' : formatMoney(earnings.total)}</strong><small>Recorded earnings to date</small><span className="preview-link">View settlements <Icon name="arrow" /></span></button>
      </div>
    </section>
  );
}

function SummaryMetric({ label, value, note, icon }: { label: string; value: string; note: string; icon: string }) {
  return <article className="summary-metric"><span className="metric-icon"><Icon name={icon} /></span><span className="metric-label">{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function JobsPage({ jobs, services, loading, processing = false, completed = false, onUpdated }: {
  jobs: AttestationJob[];
  services: AgentService[];
  loading: boolean;
  processing?: boolean;
  completed?: boolean;
  onUpdated: () => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const filteredJobs = useMemo(() => jobs.filter((job) => {
    if (completed) return ['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(job.status);
    if (processing) return ['AGENT_RECEIVED', 'PROCESSING', 'ATTESTED', 'RETURN_READY'].includes(job.status);
    return !['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(job.status);
  }), [jobs, processing, completed]);
  const selectedJob = filteredJobs.find((job) => job.id === selectedId) ?? filteredJobs[0];
  const action = selectedJob ? custodyActions[selectedJob.status] : undefined;
  const serviceName = (code: string) => services.find((service) => service.code === code)?.name ?? code.replaceAll('_', ' ');

  async function updateCustody() {
    if (!selectedJob || !action) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/agents/me/jobs/${encodeURIComponent(selectedJob.id)}/custody`, {
        method: 'POST',
        body: { eventType: action.eventType, note: note.trim() || undefined },
      });
      setNote('');
      onUpdated();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update this job.');
    } finally {
      setBusy(false);
    }
  }

  const title = completed ? 'Completed jobs' : processing ? 'Processing' : 'Assigned jobs';
  return (
    <section>
      <div className="agent-heading"><div><p className="page-context">Attestation work</p><h1>{title}</h1><p className="heading-subtitle">{filteredJobs.length} {filteredJobs.length === 1 ? 'job' : 'jobs'}</p></div><button className="secondary-action refresh-action" type="button" onClick={onUpdated} disabled={loading}><Icon name="refresh" />Refresh</button></div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      {loading ? <div className="empty-workspace"><span className="loading-indicator" />Loading jobs…</div> : filteredJobs.length === 0 ? <div className="empty-workspace"><span className="empty-mark"><Icon name={completed ? 'check' : 'orders'} /></span><h2>{completed ? 'No completed jobs yet' : processing ? 'Nothing in progress' : 'No assigned jobs'}</h2><p>{completed ? 'Jobs returned to customers will be listed here.' : 'New work assigned to your agency will appear here.'}</p></div> : (
        <div className="job-workspace">
          <div className="job-list" aria-label={title}>
            {filteredJobs.map((job) => <button className={`job-card ${selectedJob?.id === job.id ? 'selected' : ''}`} type="button" key={job.id} onClick={() => { setSelectedId(job.id); setNote(''); }}>
              <span className="job-icon"><Icon name="orders" /></span><span className="job-card-copy"><strong>{serviceName(job.serviceCode)}</strong><small>{job.reference} · {formatDate(job.createdAt)}</small></span><span className={`status-pill status-pill--${job.status.toLowerCase()}`}>{statusLabels[job.status] ?? job.status.replaceAll('_', ' ')}</span>
            </button>)}
          </div>
          {selectedJob && <article className="job-detail">
            <div className="job-detail-heading"><div><span className="job-reference">{selectedJob.reference}</span><h2>{serviceName(selectedJob.serviceCode)}</h2></div><span className={`status-pill status-pill--${selectedJob.status.toLowerCase()}`}>{statusLabels[selectedJob.status] ?? selectedJob.status.replaceAll('_', ' ')}</span></div>
            <div className="job-addresses"><div><span>Pickup address</span><p>{getAddress(selectedJob.pickupAddress)}</p></div><div><span>Return address</span><p>{getAddress(selectedJob.returnAddress)}</p></div></div>
            {selectedJob.estimatedReadyAt && <p className="ready-date">Estimated ready {formatDate(selectedJob.estimatedReadyAt)}</p>}
            <div className="custody-timeline"><h3>Custody history</h3>{selectedJob.custodyEvents.length ? [...selectedJob.custodyEvents].reverse().map((event) => <TimelineEvent event={event} key={event.id} />) : <p className="timeline-empty">No custody updates recorded.</p>}</div>
            {action && <div className="custody-update"><label htmlFor="custody-note">Progress note <span>Optional</span></label><textarea id="custody-note" maxLength={1000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note about this custody update" /><button className="primary-action" type="button" onClick={updateCustody} disabled={busy}>{busy ? 'Saving update…' : action.label}</button><p>Each update is added to the job’s custody history.</p></div>}
          </article>}
        </div>
      )}
    </section>
  );
}

function TimelineEvent({ event }: { event: CustodyEvent }) {
  return <div className="timeline-event"><span className="timeline-dot" /><div><strong>{statusLabels[event.eventType] ?? event.eventType.replaceAll('_', ' ')}</strong><time>{formatDate(event.createdAt)}</time>{event.note && <p>{event.note}</p>}</div></div>;
}

function ServicesPage({ services, catalog, loading, onSaved }: {
  services: AgentService[];
  catalog: AgentCatalogService[];
  loading: boolean;
  onSaved: () => void;
}) {
  const [edited, setEdited] = useState<AgentService[]>([]);
  const [code, setCode] = useState('');
  const [price, setPrice] = useState('');
  const [days, setDays] = useState('');
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customDays, setCustomDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const availableToAdd = useMemo(
    () => catalog.filter((service) => !edited.some((current) => current.code.toLowerCase() === service.id.toLowerCase())),
    [catalog, edited],
  );

  useEffect(() => {
    const catalogByCode = new Map(catalog.map((service) => [service.id.toLowerCase(), service]));
    setEdited(services.map((service) => {
      const catalogService = catalogByCode.get(service.code.toLowerCase());
      return {
        ...service,
        code: catalogService?.id ?? service.code,
        name: catalogService?.name ?? service.name,
      };
    }));
  }, [services, catalog]);

  useEffect(() => {
    if (availableToAdd.some((service) => service.id === code)) return;
    const nextService = availableToAdd[0];
    setCode(nextService?.id ?? '');
    setPrice(nextService ? String(nextService.serviceFee) : '');
    setDays(nextService ? String(nextService.estimatedDays) : '');
  }, [availableToAdd, code]);

  function updateService(id: string, changes: Partial<AgentService>) {
    setEdited((current) => current.map((service) => service.id === id ? { ...service, ...changes } : service));
  }

  async function saveServices(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiRequest('/agents/me/services/batch', {
        method: 'POST',
        body: { services: edited.map((service) => ({
          code: service.code,
          name: service.name.trim(),
          description: service.description,
          price: Number(service.price),
          estimatedDays: Number(service.estimatedDays),
          enabled: service.enabled,
          isCustom: service.isCustom,
        })) },
      });
      onSaved();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save service changes.');
    } finally {
      setBusy(false);
    }
  }

  async function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedService = catalog.find((service) => service.id === code);
    if (!selectedService) {
      setError('Choose a service from the platform catalogue.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiRequest('/agents/me/services', {
        method: 'POST',
        body: { code: selectedService.id, name: selectedService.name, price: Number(price), estimatedDays: Number(days), enabled: true },
      });
      setCode('');
      setPrice('');
      setDays('');
      onSaved();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to add this service.');
    } finally {
      setBusy(false);
    }
  }

  async function addCustomService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slug = customName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
    if (slug.length < 2) {
      setError('Use a service name with at least two letters or numbers.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiRequest('/agents/me/services', {
        method: 'POST',
        body: {
          code: `custom-${slug}`,
          name: customName.trim(),
          description: '',
          price: Number(customPrice),
          estimatedDays: Number(customDays),
          enabled: true,
          isCustom: true,
        },
      });
      setCustomName('');
      setCustomPrice('');
      setCustomDays('');
      onSaved();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to add this custom service.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="agent-heading"><div><p className="page-context">Your public catalogue</p><h1>Services & pricing</h1><p className="heading-subtitle">Maintain the services and turnaround times customers see.</p></div></div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      <form className="service-editor" onSubmit={saveServices}>
        <div className="table-heading"><span>Service</span><span>Price</span><span>Turnaround</span><span>Availability</span></div>
        {loading ? <p className="table-empty">Loading services…</p> : edited.length ? edited.map((service) => <div className="service-row" key={service.id}>
          <div className="service-name"><strong>{service.name}</strong><small>{service.isCustom ? `Custom · ${service.reviewStatus.toLowerCase()} review` : service.code}</small></div>
          <label className="field-with-prefix"><span>LKR</span><input type="number" min="0" step="0.01" value={service.price} onChange={(event) => updateService(service.id, { price: event.target.value })} aria-label={`${service.name} price`} required /></label>
          <label className="field-with-suffix"><input type="number" min="1" step="1" value={service.estimatedDays} onChange={(event) => updateService(service.id, { estimatedDays: Number(event.target.value) })} aria-label={`${service.name} turnaround`} required /><span>days</span></label>
          <label className="service-availability"><input type="checkbox" checked={service.enabled} onChange={(event) => updateService(service.id, { enabled: event.target.checked })} /><span>{service.enabled ? 'Available' : 'Paused'}</span></label>
        </div>) : <p className="table-empty">No services configured. Add a platform or custom service below.</p>}
        <div className="service-editor-footer"><p>Custom services appear to customers after admin approval.</p><button className="primary-action" type="submit" disabled={busy || edited.length === 0}>{busy ? 'Saving…' : 'Save changes'}</button></div>
      </form>
      <form className="add-service-form" onSubmit={addService}>
        <div><h2>Add a platform service</h2><p>Choose a platform service, then set your price and turnaround.</p></div>
        <div className="add-service-fields">
          <label>Platform service
            <select required value={code} disabled={!availableToAdd.length} onChange={(event) => {
              const nextCode = event.target.value;
              const nextService = catalog.find((service) => service.id === nextCode);
              setCode(nextCode);
              setPrice(nextService ? String(nextService.serviceFee) : '');
              setDays(nextService ? String(nextService.estimatedDays) : '');
            }}>
              {!availableToAdd.length && <option value="">All catalogue services added</option>}
              {availableToAdd.map((service) => <option key={service.id} value={service.id}>{service.name} · default LKR {service.serviceFee.toFixed(2)}</option>)}
            </select>
          </label>
          <label>Price (LKR)<input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required /></label>
          <label>Estimated days<input type="number" min="1" step="1" value={days} onChange={(event) => setDays(event.target.value)} required /></label>
        </div>
        <button className="secondary-action" type="submit" disabled={busy || !availableToAdd.length}>{busy ? 'Adding…' : 'Add service'}</button>
      </form>
      <form className="add-service-form" onSubmit={(event) => void addCustomService(event)}>
        <div><h2>Offer your own service</h2><p>Set the service name, your price and turnaround. Customers can book it after admin approval.</p></div>
        <div className="add-service-fields">
          <label>Service name<input minLength={3} maxLength={120} required value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="e.g. Embassy document processing" /></label>
          <label>Price (LKR)<input type="number" min="0" max="100000" step="0.01" required value={customPrice} onChange={(event) => setCustomPrice(event.target.value)} /></label>
          <label>Estimated days<input type="number" min="1" max="365" step="1" required value={customDays} onChange={(event) => setCustomDays(event.target.value)} /></label>
        </div>
        <button className="secondary-action" type="submit" disabled={busy || !customName.trim()}>{busy ? 'Adding…' : 'Submit custom service'}</button>
      </form>
    </section>
  );
}

function EarningsPage({ earnings, loading }: { earnings: AgentEarnings; loading: boolean }) {
  return (
    <section>
      <div className="agent-heading"><div><p className="page-context">Finance</p><h1>Settlements</h1><p className="heading-subtitle">Payout records prepared by platform operations.</p></div></div>
      <div className="earnings-summary"><SummaryMetric label="Recorded total" value={loading ? '—' : formatMoney(earnings.total)} note="All settlement records" icon="wallet" /><SummaryMetric label="Paid" value={loading ? '—' : formatMoney(earnings.paid)} note="Marked paid" icon="check" /><SummaryMetric label="Pending" value={loading ? '—' : formatMoney(earnings.pending)} note="Awaiting settlement" icon="process" /></div>
      <div className="settlement-table"><div className="settlement-heading"><span>Settlement</span><span>Date</span><span>Amount</span><span>Status</span></div>{loading ? <p className="table-empty">Loading settlement history…</p> : earnings.settlements.length ? earnings.settlements.map((settlement) => <SettlementRow key={settlement.id} settlement={settlement} />) : <div className="empty-workspace"><span className="empty-mark"><Icon name="wallet" /></span><h2>No settlements recorded</h2><p>Settlement records will appear here when they are prepared by platform operations.</p></div>}</div>
      <p className="settlement-note">This page displays settlement records only. It does not initiate or confirm payments.</p>
    </section>
  );
}

function SettlementRow({ settlement }: { settlement: AgentSettlement }) {
  return <div className="settlement-row"><span><strong>{settlement.reference ?? `Settlement ${settlement.id.slice(0, 8)}`}</strong><small>{settlement.id.slice(0, 8).toUpperCase()}</small></span><time>{formatDate(settlement.createdAt)}</time><strong>{formatMoney(settlement.amount)}</strong><span className={`status-pill status-pill--${settlement.status.toLowerCase()}`}>{settlement.status.replaceAll('_', ' ')}</span></div>;
}

function ProfilePage({ profile, busy, onSave, onAvailability }: {
  profile: AgentProfile;
  busy: boolean;
  onSave: (values: Pick<AgentProfile, 'businessName' | 'address' | 'phone'>) => Promise<void>;
  onAvailability: (isOpen: boolean) => Promise<void>;
}) {
  const [businessName, setBusinessName] = useState(profile.businessName);
  const [phone, setPhone] = useState(profile.phone);
  const [address, setAddress] = useState(profile.address);
  return (
    <section>
      <div className="agent-heading"><div><p className="page-context">Account settings</p><h1>Agent profile</h1><p className="heading-subtitle">Your business identity and account status.</p></div></div>
      <div className="profile-layout">
        <form className="profile-form" onSubmit={(event) => { event.preventDefault(); void onSave({ businessName: businessName.trim(), phone: phone.trim(), address: address.trim() }); }}>
          <h2>Business details</h2><p>These details are associated with your agent application.</p>
          <label>Business or agency name<input value={businessName} onChange={(event) => setBusinessName(event.target.value)} minLength={2} maxLength={120} required /></label>
          <label>Business phone<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} minLength={7} maxLength={20} required /></label>
          <label>Business address<textarea value={address} onChange={(event) => setAddress(event.target.value)} minLength={5} maxLength={500} rows={3} required /></label>
          <button className="primary-action" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
        </form>
        <aside className="account-panel">
          <h2>Account status</h2><p>Access to new work depends on platform approval.</p>
          <div className="account-detail"><span>Verification</span><strong className={`status-pill status-pill--${profile.status.toLowerCase()}`}>{profile.status.toLowerCase()}</strong></div>
          <div className="account-detail"><span>Account email</span><strong>{profile.user.email}</strong></div>
          {profile.status === 'APPROVED' && <div className="availability-setting"><div><strong>Accept new work</strong><p>Turn this off when your agency is unavailable.</p></div><label className="availability-switch"><input type="checkbox" checked={profile.isOpen} onChange={(event) => void onAvailability(event.target.checked)} /><span className="switch-track" /></label></div>}
          {profile.status === 'PENDING' && <p className="account-help">Your agency cannot accept new work while verification is pending.</p>}
        </aside>
      </div>
    </section>
  );
}
