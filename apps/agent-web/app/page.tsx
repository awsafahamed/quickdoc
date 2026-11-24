'use client';

import { useEffect, useState } from 'react';

type AgentView = 'dashboard' | 'jobs' | 'processing' | 'completed' | 'services' | 'earnings' | 'profile';

const nav: { id: AgentView; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'jobs', label: 'Assigned jobs', icon: 'orders' },
  { id: 'processing', label: 'Processing', icon: 'process' },
  { id: 'completed', label: 'Completed', icon: 'check' },
  { id: 'services', label: 'Services & pricing', icon: 'tag' },
  { id: 'earnings', label: 'Earnings', icon: 'wallet' },
];

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    orders: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h4',
    process: 'M4 12a8 8 0 1 0 3-6.2M4 3v5h5',
    check: 'M3 12l6 6L21 6',
    tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
    wallet: 'M3 6h18v13H3zM3 10h18M16 14h2',
    bell: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function AgentPortal() {
  const [registered, setRegistered] = useState(false);
  const [view, setView] = useState<AgentView>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setRegistered(window.localStorage.getItem('agent-registered') === 'true'), []);

  if (!registered) {
    return <AgentRegistration onRegistered={() => { window.localStorage.setItem('agent-registered', 'true'); setRegistered(true); }} />;
  }

  return (
    <div className="agent-shell">
      {mobileOpen && <button className="mobile-backdrop" aria-label="Close navigation" type="button" onClick={() => setMobileOpen(false)} />}
      <aside className={`agent-sidebar ${mobileOpen ? 'agent-sidebar--open' : ''}`}>
        <div className="brand"><img src="/logo/quickdoc-logo.svg" alt="QuickDoc" /></div>
        <div className="sidebar__label">Agent workspace</div>
        <nav>{nav.map((item) => <button className={view === item.id ? 'active' : ''} key={item.id} type="button" onClick={() => { setView(item.id); setMobileOpen(false); }}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
        <button className="agent-profile" type="button" onClick={() => setView('profile')}><span className="agent-avatar">AG</span><span><strong>Agent account</strong><small>Verification pending</small></span></button>
      </aside>
      <main className="agent-main">
        <header className="topbar"><button className="agent-menu" type="button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><span /><span /><span /></button><div className="breadcrumb"><span>Agent workspace</span><b>›</b><strong>{nav.find((item) => item.id === view)?.label ?? 'Profile'}</strong></div><div className="topbar__actions"><button className="notification-button" type="button" aria-label="Notifications"><Icon name="bell" /><span /></button><div className="topbar__avatar">AG</div></div></header>
        {view === 'dashboard' && <Dashboard setView={setView} />}
        {view === 'jobs' && <JobsPage />}
        {view === 'processing' && <JobsPage processing />}
        {view === 'completed' && <SimplePage title="Completed jobs" empty="Attested and returned jobs will appear here." />}
        {view === 'services' && <ServicesPage />}
        {view === 'earnings' && <SimplePage title="Earnings" empty="Approved and paid settlements will appear here." />}
        {view === 'profile' && <SimplePage title="Agent profile" empty="Business and verification details can be managed here." />}
      </main>
    </div>
  );
}

function AgentRegistration({ onRegistered }: { onRegistered: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+94');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  return <main className="agent-registration"><section className="agent-registration-copy"><span className="registration-mark">P</span><p>ATTESTATION AGENT</p><h1>Process documents with care.</h1><p>Receive original documents, confirm custody and update attestation progress securely.</p></section><section className="agent-registration-panel"><p className="step-label">Agent registration · verification required</p><h2>Create your agent account</h2><form onSubmit={(event) => { event.preventDefault(); if (!name || !address) { setError('Complete the business name and address.'); return; } onRegistered(); }}><label>Business or agency name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Colombo Attestation Services" /></label><label>Business phone<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label>Business address<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street, building and city" /></label>{error && <p className="registration-error" role="alert">{error}</p>}<button type="submit">Submit for verification</button><p className="registration-note">Approved agents can receive and process eligible jobs.</p></form></section></main>;
}

function Dashboard({ setView }: { setView: (view: AgentView) => void }) {
  return <section className="agent-content"><div className="agent-heading"><div><p>Today</p><h1>Good morning, Agent.</h1></div><span className="open-toggle"><i />Verification pending</span></div><div className="agent-dashboard-grid"><article className="agent-status-card"><span>Account</span><strong>Awaiting approval</strong><p>Your agency profile will become available after review.</p></article><article className="agent-empty-card"><span className="production-icon">◫</span><div><strong>No assigned jobs</strong><p>Accepted custody and processing jobs will appear here.</p></div></article></div><button className="agent-view-button" type="button" onClick={() => setView('jobs')}>View assigned jobs</button></section>;
}

function JobsPage({ processing = false }: { processing?: boolean }) {
  const [selectedJob, setSelectedJob] = useState('');
  const [evidence, setEvidence] = useState('');
  const jobs = [
    { id: 'AT-1842', service: 'Degree certificate attestation', customer: 'Amar Khan', status: 'Awaiting receipt' },
  ];
  return <section className="agent-content"><div className="agent-heading"><div><p>Custody</p><h1>{processing ? 'Processing jobs' : 'Assigned jobs'}</h1></div></div>{jobs.length ? <div className="job-layout"><div className="job-list">{jobs.map((job) => <button className={`job-card ${selectedJob === job.id ? 'selected' : ''}`} type="button" key={job.id} onClick={() => setSelectedJob(job.id)}><span className="job-icon">AT</span><span><strong>{job.service}</strong><small>{job.id} · {job.customer}</small></span><em>{job.status}</em></button>)}</div><aside className="job-actions"><p className="section-label">Custody action</p>{selectedJob ? <><strong>{selectedJob}</strong><label>Processing note<textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Record package condition or processing progress" /></label><button type="button">Confirm document receipt</button><button type="button">Mark processing</button><button className="ready-button" type="button">Mark ready for return</button></> : <p>Select a job to confirm custody or update progress.</p>}</aside></div> : <div className="empty-workspace"><h2>{processing ? 'No processing jobs' : 'No assigned jobs'}</h2><p>Jobs will appear after pickup and agency assignment.</p></div>}</section>;
}

function ServicesPage() {
  const [services, setServices] = useState([
    { name: 'Degree certificate attestation', price: 180, enabled: true, days: 7 },
    { name: 'Personal document attestation', price: 140, enabled: true, days: 5 },
  ]);
  return <section className="agent-content"><div className="agent-heading"><div><p>Catalogue</p><h1>Services & pricing</h1></div><button className="primary-action" type="button">Save changes</button></div><div className="service-table">{services.map((service, index) => <div className="service-row" key={service.name}><label className="service-toggle"><input type="checkbox" checked={service.enabled} onChange={() => setServices((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: !item.enabled } : item))} /><span /></label><strong>{service.name}</strong><label className="service-price"><span>LKR</span><input type="number" value={service.price} onChange={(event) => setServices((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, price: Number(event.target.value) } : item))} /></label><label className="service-days"><input type="number" value={service.days} onChange={(event) => setServices((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, days: Number(event.target.value) } : item))} /><span>days</span></label></div>)}</div></section>;
}

function SimplePage({ title, empty }: { title: string; empty: string }) {
  return <section className="agent-content"><div className="agent-heading"><div><p>Agent workspace</p><h1>{title}</h1></div></div><div className="empty-workspace"><h2>{empty}</h2></div></section>;
}
