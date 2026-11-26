'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import CustomerSupportPage from './support-page';
import PrintRequestFlow, { type PrintOrderSummary, type SavedDocument } from './print-request';
import AttestationRequestFlow, { type AttestationBookingResult } from './attestation-request';

type View = 'dashboard' | 'print' | 'attest' | 'orders' | 'documents' | 'addresses' | 'payments' | 'support' | 'profile';

type IconName = 'home' | 'print' | 'shield' | 'orders' | 'file' | 'pin' | 'card' | 'help' | 'user' | 'bell' | 'arrow' | 'upload' | 'plus' | 'chevron';

const navigation: { id: View; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'print', label: 'Print & Deliver', icon: 'print' },
  { id: 'attest', label: 'Attest & Return', icon: 'shield' },
  { id: 'orders', label: 'My orders', icon: 'orders' },
  { id: 'documents', label: 'My documents', icon: 'file' },
  { id: 'addresses', label: 'Addresses', icon: 'pin' },
  { id: 'payments', label: 'Payments', icon: 'card' },
  { id: 'support', label: 'Support', icon: 'help' },
];

type Order = {
  id: string;
  backendId?: string;
  type: string;
  detail: string;
  status: string;
  tone: 'blue' | 'green';
  date: string;
  payment?: { status: string; method: string; amount: number | string; currency: string } | null;
};
type CustomerNotification = { id: string; title: string; text: string; time: string; unread: boolean };

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    home: 'M3 10.5 12 3l9 7.5M5.5 9v10h13V9M9 19v-5h6v5',
    print: 'M6 8V3h12v5M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z',
    shield: 'M12 3 20 6v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3zM9 12l2 2 4-4',
    orders: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h4',
    file: 'M6 2h8l4 4v16H6zM14 2v5h5M9 12h6M9 16h6',
    pin: 'M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    card: 'M3 6h18v13H3zM3 10h18M7 15h4',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.1.8-1.7 1.3-1.7 2.7M12 17h.01',
    user: 'M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    bell: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    plus: 'M12 5v14M5 12h14',
    chevron: 'm9 6 6 6-6 6',
  };
  return <svg aria-hidden="true" className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

function ServiceCard({ type, title, description, action }: { type: 'print' | 'attest'; title: string; description: string; action: () => void }) {
  return (
    <article className={`service-card service-card--${type}`}>
      <div className="service-card__top"><span className="service-icon"><Icon name={type === 'print' ? 'print' : 'shield'} /></span><span className="service-kicker">{type === 'print' ? 'Most popular' : 'Secure process'}</span></div>
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="text-button" type="button" onClick={action}>Start a request <Icon name="arrow" /></button>
    </article>
  );
}

function OrderRow({ order, onConfirmDelivery }: { order: Order; onConfirmDelivery?: (order: Order) => void }) {
  return (
    <div className="order-row">
      <div className="order-row__mark"><Icon name={order.type === 'Print & Deliver' ? 'print' : 'shield'} /></div>
      <div className="order-row__details"><strong>{order.type}</strong><span>{order.id} · {order.detail}</span></div>
      <div className="order-row__status"><span className={`status-dot status-dot--${order.tone}`} />{order.status}<small>{order.date}</small></div>
      {order.status === 'DELIVERED' && order.backendId && onConfirmDelivery && <button className="button button--secondary button--small" type="button" onClick={() => onConfirmDelivery(order)}>Confirm delivery</button>}
    </div>
  );
}

function UploadBox({ label, onChange }: { label: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="upload-box">
      <span className="upload-box__icon"><Icon name="upload" /></span>
      <strong>{label}</strong>
      <span>PDF · Max 25 MB</span>
      <input type="file" accept=".pdf,application/pdf" onChange={onChange} />
    </label>
  );
}

export default function CustomerDashboardPage() {
  const [view, setView] = useState<View>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [apiState, setApiState] = useState<'loading' | 'connected' | 'unavailable'>('loading');
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [session, setSession] = useState<{ name: string; email: string; phone: string } | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [orderNotice, setOrderNotice] = useState('');
  const [orderError, setOrderError] = useState('');
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [documents, setDocuments] = useState<{ id: string; name: string; sizeBytes: number; pageCount: number | null; createdAt: string }[]>([]);
  const [addresses, setAddresses] = useState<{ id: string; label: string; line: string }[]>([]);
  const [supportOrders, setSupportOrders] = useState<{ id: string; reference: string }[]>([]);

  useEffect(() => {
    const storedSession = window.localStorage.getItem('print-attest-session');
    if (!storedSession) {
      window.location.href = '/login';
      return;
    }
    setSession(JSON.parse(storedSession) as { name: string; email: string; phone: string });
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    fetch(`${apiUrl}/health`)
      .then((response) => {
        if (!response.ok) throw new Error('API unavailable');
        setApiState('connected');
      })
      .catch(() => setApiState('unavailable'));
    const accessToken = window.sessionStorage.getItem('print-attest-access-token');
    if (accessToken) {
      const authHeaders = { Authorization: `Bearer ${accessToken}` };
      fetch(`${apiUrl}/customer/me`, { headers: authHeaders })
        .then((response) => response.ok ? response.json() as Promise<{ data: { name: string; email: string; CustomerProfile?: { phone?: string } | null } }> : Promise.reject())
        .then((result) => {
          const currentSession = JSON.parse(window.localStorage.getItem('print-attest-session') ?? '{}') as { name?: string; email?: string; phone?: string };
          const nextSession = {
            name: result.data.name || currentSession.name || '',
            email: result.data.email || currentSession.email || '',
            phone: result.data.CustomerProfile?.phone || currentSession.phone || '',
          };
          setSession(nextSession);
          window.localStorage.setItem('print-attest-session', JSON.stringify(nextSession));
        })
        .catch(() => undefined);
      fetch(`${apiUrl}/customer/orders`, { headers: authHeaders })
        .then((response) => response.ok ? response.json() as Promise<{ data: { id: string; reference: string; status: string; createdAt: string; currency: string; Payment: { status: string; method: string; amount: number | string } | null; Shop: { name: string } }[] }> : Promise.reject())
        .then((result) => {
          setCustomerOrders((items) => [
            ...result.data.map((order) => ({ id: order.reference, backendId: order.id, type: 'Print & Deliver', detail: order.Shop?.name ?? 'Printing shop', status: order.status, tone: 'blue' as const, date: new Date(order.createdAt).toLocaleDateString(), payment: order.Payment ? { ...order.Payment, currency: order.currency } : null })),
            ...items.filter((order) => order.type === 'Attest & Return'),
          ]);
          setSupportOrders(result.data.map(({ id, reference }) => ({ id, reference })));
        })
        .catch(() => setCustomerOrders((items) => items.filter((order) => order.type === 'Attest & Return')));
      fetch(`${apiUrl}/attestation/me/jobs`, { headers: authHeaders })
        .then((response) => response.ok ? response.json() as Promise<{ data: { id: string; reference: string; status: string; serviceCode: string; createdAt: string; agent?: { businessName?: string } }[] }> : Promise.reject())
        .then((result) => {
          setCustomerOrders((items) => [
            ...items.filter((order) => order.type === 'Print & Deliver'),
            ...result.data.map((job) => ({
              id: job.reference,
              type: 'Attest & Return',
              detail: [job.serviceCode, job.agent?.businessName].filter(Boolean).join(' · '),
              status: job.status,
              tone: 'green' as const,
              date: new Date(job.createdAt).toLocaleDateString(),
            })),
          ]);
        })
        .catch(() => undefined);
      fetch(`${apiUrl}/customer/documents`, { headers: authHeaders })
        .then((response) => response.ok ? response.json() as Promise<{ data: typeof documents }> : Promise.reject())
        .then((result) => setDocuments(result.data))
        .catch(() => setDocuments([]));
      fetch(`${apiUrl}/customer/addresses`, { headers: authHeaders })
        .then((response) => response.ok ? response.json() as Promise<{ data: typeof addresses }> : Promise.reject())
        .then((result) => setAddresses(result.data))
        .catch(() => setAddresses([]));
      fetch(`${apiUrl}/customer/notifications`, { headers: authHeaders })
        .then((response) => response.ok ? response.json() as Promise<{ data: { id: string; title: string; body: string; readAt: string | null; createdAt: string }[] }> : Promise.reject())
        .then((result) => setNotifications(result.data.map((item) => ({
          id: item.id,
          title: item.title,
          text: item.body,
          time: new Date(item.createdAt).toLocaleString(),
          unread: !item.readAt,
        }))))
        .catch(() => setNotifications([]));
    }
  }, []);

  const goTo = (nextView: View) => {
    setView(nextView);
    setMobileNavOpen(false);
  };

  const currentLabel = view === 'profile' ? 'My profile' : navigation.find((item) => item.id === view)?.label ?? 'Dashboard';
  const customerName = session?.name.trim() || session?.email.split('@')[0] || 'Customer';
  const initials = customerName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'C';

  const saveProfile = async (nextSession: { name: string; email: string; phone: string }) => {
    const accessToken = window.sessionStorage.getItem('print-attest-access-token');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const response = await fetch(`${apiUrl}/customer/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken ?? ''}` },
      body: JSON.stringify(nextSession),
    });
    if (!response.ok) throw new Error('Your profile could not be saved. Please try again.');
    const result = await response.json() as { data: { name: string; email: string } };
    const savedSession = { ...nextSession, name: result.data.name, email: result.data.email };
    setSession(savedSession);
    window.localStorage.setItem('print-attest-session', JSON.stringify(savedSession));
  };

  const confirmDelivery = async (order: Order) => {
    if (!order.backendId) return;
    setOrderError('');
    setOrderNotice('');
    try {
      const accessToken = window.sessionStorage.getItem('print-attest-access-token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
      const response = await fetch(`${apiUrl}/customer/orders/${encodeURIComponent(order.backendId)}/confirm-delivery`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(result?.message ?? 'Delivery could not be confirmed. Refresh and try again.');
      }
      setCustomerOrders((items) => items.map((item) => item.backendId === order.backendId ? { ...item, status: 'COMPLETED' } : item));
      setOrderNotice(`Delivery for ${order.id} confirmed.`);
    } catch (caught) {
      setOrderError(caught instanceof Error ? caught.message : 'Delivery could not be confirmed.');
    }
  };

  const markAllNotificationsRead = async () => {
    const accessToken = window.sessionStorage.getItem('print-attest-access-token');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const response = await fetch(`${apiUrl}/customer/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken ?? ''}` },
    });
    if (!response.ok) throw new Error('Notifications could not be marked as read.');
    setNotifications((items) => items.map((item) => ({ ...item, unread: false })));
  };

  const markNotificationRead = async (notificationId: string) => {
    const accessToken = window.sessionStorage.getItem('print-attest-access-token');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const response = await fetch(`${apiUrl}/customer/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken ?? ''}` },
    });
    if (!response.ok) throw new Error('Notification could not be marked as read.');
    setNotifications((items) => items.map((item) => item.id === notificationId ? { ...item, unread: false } : item));
  };

  return (
    <div className="portal">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar--open' : ''}`}>
        <div className="brand"><img src="/logo/quickdoc-logo.svg" alt="QuickDoc" /></div>
        <div className="sidebar__label">Workspace</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navigation.map((item) => <button className={`nav-item ${view === item.id ? 'nav-item--active' : ''}`} key={item.id} type="button" onClick={() => goTo(item.id)}><Icon name={item.icon} /><span>{item.label}</span>{item.id === 'orders' && customerOrders.length > 0 && <span className="nav-count">{customerOrders.length}</span>}</button>)}
        </nav>
        <div className="sidebar__bottom">
          <button className="nav-item" type="button" onClick={() => goTo('profile')}><Icon name="user" /><span>My profile</span></button>
          <div className="help-card"><span className="help-card__icon"><Icon name="help" /></span><strong>Need a hand?</strong><span>Our team is here 24/7.</span><button type="button" onClick={() => goTo('support')}>Contact support <Icon name="arrow" /></button></div>
          <div className="user-chip"><span className="avatar">{initials}</span><span><strong>{customerName}</strong><small>Customer account</small></span><Icon name="chevron" /></div>
        </div>
      </aside>

      <div className="portal-main">
        <header className="topbar">
          <button className="mobile-menu" type="button" aria-label="Open navigation" onClick={() => setMobileNavOpen((open) => !open)}><span /><span /><span /></button>
          <div className="breadcrumb"><span>Workspace</span><Icon name="chevron" /><strong>{currentLabel}</strong></div>
          <div className="topbar__actions"><div className="notification-wrap"><button className="notification-button" type="button" aria-label={`${notifications.filter((item) => item.unread).length} unread notifications`} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}><Icon name="bell" />{notifications.some((item) => item.unread) && <span />}</button>{notificationsOpen && <div className="notification-panel" role="dialog" aria-label="Notifications"><div className="notification-heading"><strong>Notifications</strong><button type="button" disabled={!notifications.some((item) => item.unread)} onClick={() => void markAllNotificationsRead().catch((caught: unknown) => setOrderError(caught instanceof Error ? caught.message : 'Notifications could not be marked as read.'))}>Mark all read</button></div>{notifications.length ? notifications.map((item) => <button className={`notification-item ${item.unread ? 'notification-item--unread' : ''}`} key={item.id} type="button" onClick={() => { if (item.unread) void markNotificationRead(item.id).catch((caught: unknown) => setOrderError(caught instanceof Error ? caught.message : 'Notification could not be marked as read.')); }}><span className="notification-item__mark" /><span><strong>{item.title}</strong><p>{item.text}</p><small>{item.time}</small></span></button>) : <p className="notification-empty">No notifications yet.</p>}</div>}</div><div className="topbar__avatar">{initials}</div></div>
        </header>

        <main className="content">
          {orderError && <p className="flow-error" role="alert">{orderError}</p>}
          {orderNotice && <p className="profile-saved" role="status">{orderNotice}</p>}
          {view === 'dashboard' && <Dashboard goTo={goTo} apiState={apiState} customerOrders={customerOrders} customerName={customerName.split(/\s+/)[0]} onConfirmDelivery={confirmDelivery} />}
          {view === 'print' && <PrintRequestFlow
            addresses={addresses}
            onDocumentSaved={(document: SavedDocument) => setDocuments((items) => [document, ...items.filter((item) => item.id !== document.id)])}
            onOrderPlaced={(order: PrintOrderSummary) => {
              const nextOrder: Order = { id: order.reference, backendId: order.id, type: 'Print & Deliver', detail: order.shopName, status: order.status, tone: 'blue', date: new Date().toLocaleDateString() };
              setCustomerOrders((items) => [nextOrder, ...items.filter((item) => item.id !== nextOrder.id)]);
              setSupportOrders((items) => [{ id: order.id, reference: order.reference }, ...items.filter((item) => item.id !== order.id)]);
              goTo('orders');
            }}
            onBack={() => goTo('dashboard')}
          />}
          {view === 'attest' && <AttestationRequestFlow
            onBooked={(booking: AttestationBookingResult) => {
              const nextOrder: Order = { id: booking.reference, backendId: booking.id, type: 'Attest & Return', detail: booking.agent.businessName, status: booking.status, tone: 'green', date: new Date().toLocaleDateString() };
              setCustomerOrders((items) => [nextOrder, ...items.filter((item) => item.id !== nextOrder.id)]);
            }}
            onViewOrders={() => goTo('orders')}
            onBack={() => goTo('dashboard')}
          />}
          {view === 'orders' && <SimplePage title="My orders" description="Every request, handover and delivery in one place.">{customerOrders.length ? <div className="panel">{customerOrders.map((order) => <OrderRow key={order.id} order={order} onConfirmDelivery={confirmDelivery} />)}</div> : <EmptyState title="No orders yet" text="Your active and completed requests will appear here." action="Start a request" onAction={() => goTo('print')} />}</SimplePage>}
          {view === 'documents' && <DocumentLibrary documents={documents} onChanged={setDocuments} onStartPrint={() => goTo('print')} />}
          {view === 'addresses' && <AddressPage addresses={addresses} onChanged={setAddresses} />}
          {view === 'payments' && <PaymentsPage orders={customerOrders.filter((order) => order.type === 'Print & Deliver')} />}
          {view === 'support' && <CustomerSupportPage orders={supportOrders} />}
          {view === 'profile' && <ProfilePage session={session} onSave={saveProfile} onLogout={() => { window.localStorage.removeItem('print-attest-session'); window.location.href = '/login'; }} />}
          {view !== 'dashboard' && view !== 'print' && view !== 'attest' && view !== 'orders' && view !== 'documents' && view !== 'addresses' && view !== 'payments' && view !== 'support' && view !== 'profile' && <SimplePage title={currentLabel} description="This workspace is ready for your account details."><div className="empty-panel"><span className="empty-panel__icon"><Icon name={navigation.find((item) => item.id === view)?.icon ?? 'user'} /></span><h3>Nothing to show yet</h3><p>Connect your customer account to manage this area securely.</p><button className="button button--secondary" type="button" onClick={() => goTo('support')}>Contact support <Icon name="arrow" /></button></div></SimplePage>}
        </main>
      </div>
    </div>
  );
}

function Dashboard({ goTo, apiState, customerOrders, customerName, onConfirmDelivery }: { goTo: (view: View) => void; apiState: 'loading' | 'connected' | 'unavailable'; customerOrders: Order[]; customerName: string; onConfirmDelivery: (order: Order) => void }) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  useEffect(() => setCurrentTime(new Date()), []);
  const currentHour = currentTime?.getHours();
  const greeting = currentHour === undefined ? 'Welcome' : currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening';
  const today = currentTime?.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) ?? '';
  return (
    <>
      <section className="welcome-row"><div><p className="date-label">{today}</p><h1>{greeting}, {customerName}.</h1><p className="welcome-copy">What do you need to get done today?</p></div></section>
      {apiState === 'unavailable' && <div className="system-notice"><span className="system-notice__dot" /><div><strong>Workspace connection is unavailable</strong><p>Live orders and account data will appear when the API is running. Your document files are not sent anywhere from this screen.</p></div></div>}
      {apiState === 'connected' && <div className="system-notice system-notice--success"><span className="system-notice__dot" /><div><strong>Workspace connected</strong><p>Live account data is ready to load from the customer API.</p></div></div>}
      <section className="services"><div className="section-heading"><div><p className="section-label">Services</p><h2>Make progress in a few steps.</h2></div><span className="section-note">Secure by design</span></div><div className="service-grid"><ServiceCard type="print" title="Print & Deliver" description="Upload your files, choose your finish and get them delivered from a nearby print shop." action={() => goTo('print')} /><ServiceCard type="attest" title="Attest & Return" description="Send originals through a verified process and track them safely back to your door." action={() => goTo('attest')} /></div></section>
      <section className="orders-section"><div className="section-heading"><div><p className="section-label">In progress</p><h2>Keep an eye on your orders.</h2></div><button className="text-button text-button--muted" type="button" onClick={() => goTo('orders')}>View all <Icon name="arrow" /></button></div>{customerOrders.length ? <div className="panel">{customerOrders.map((order) => <OrderRow key={order.id} order={order} onConfirmDelivery={onConfirmDelivery} />)}</div> : <div className="panel empty-orders"><span className="empty-orders__icon"><Icon name="orders" /></span><span><strong>No active orders</strong><small>Start a request when you are ready.</small></span><button className="text-button" type="button" onClick={() => goTo('print')}>Get started <Icon name="arrow" /></button></div>}</section>
    </>
  );
}

function PaymentsPage({ orders }: { orders: Order[] }) {
  const payments = orders.filter((order) => order.payment);
  return <section className="simple-page"><h1>Payments</h1><p className="simple-page__description">Payment records attached to your print orders.</p>
    {payments.length ? <div className="customer-payment-list">{payments.map((order) => <article className="customer-payment-row" key={order.backendId ?? order.id}><div><strong>{order.id}</strong><span>{order.type} · {order.payment?.method.replaceAll('_', ' ')}</span></div><div><strong>{order.payment?.currency} {Number(order.payment?.amount).toFixed(2)}</strong><span className={`customer-payment-status customer-payment-status--${order.payment?.status.toLowerCase()}`}>{order.payment?.status.replaceAll('_', ' ')}</span></div></article>)}</div> : <div className="panel empty-panel"><span className="empty-panel__icon"><Icon name="card" /></span><h3>No payment records yet</h3><p>Payment details will appear here when the platform records a payment for one of your orders. This page does not initiate or confirm external payments.</p></div>}
  </section>;
}

function RequestPage({ type, uploadedFile, onFileChange, onClear, goTo }: { type: 'print' | 'attest'; uploadedFile: string | null; onFileChange: (event: ChangeEvent<HTMLInputElement>) => void; onClear: () => void; goTo: (view: View) => void }) {
  const isPrint = type === 'print';
  const [config, setConfig] = useState({ pages: 1, copies: 1, paperSize: 'A4', colour: 'BLACK_WHITE', sides: 'SINGLE', binding: false, stapling: false, lamination: false, deliverySpeed: 'STANDARD', distance: 5 });
  const [quote, setQuote] = useState<{ total: number; currency: string; sheets: number; expiresAt: string } | null>(null);
  const [quoteState, setQuoteState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [flowStep, setFlowStep] = useState<1 | 2>(1);
  const [attestationServices, setAttestationServices] = useState<{ id: string; name: string; description: string; estimatedDays: number; serviceFee: number; requiredOriginals: string[]; supportingDocuments: string[] }[]>([]);
  const [attestationServiceId, setAttestationServiceId] = useState('');
  const [attestationBooking, setAttestationBooking] = useState({ pickupAddress: '', pickupDate: '', pickupSlot: '' });

  useEffect(() => {
    if (isPrint) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    fetch(`${apiUrl}/attestation/services`)
      .then((response) => {
        if (!response.ok) throw new Error('Services unavailable');
        return response.json() as Promise<{ data: typeof attestationServices }>;
      })
      .then((result) => setAttestationServices(result.data))
      .catch(() => setAttestationServices([]));
  }, [isPrint]);

  const updateConfig = (key: keyof typeof config, value: string | boolean) => {
    setConfig((current) => {
      if (key === 'pages' || key === 'copies') {
        return { ...current, [key]: Number(value) };
      }
      if (key === 'binding' || key === 'stapling' || key === 'lamination') {
        return { ...current, [key]: value === true };
      }
      return { ...current, [key]: value as string };
    });
    setQuote(null);
  };

  const requestQuote = async () => {
    setQuoteState('loading');
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
      const response = await fetch(`${apiUrl}/${isPrint ? 'print' : 'attestation'}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isPrint ? {
          pageCount: config.pages,
          copies: config.copies,
          paperSize: config.paperSize,
          colour: config.colour,
          sides: config.sides,
          binding: config.binding,
          stapling: config.stapling,
          lamination: config.lamination,
          deliverySpeed: config.deliverySpeed,
          deliveryDistanceKm: config.distance,
        } : {
          serviceId: attestationServiceId,
          pickupDistanceKm: config.distance,
          returnDistanceKm: config.distance,
          express: config.deliverySpeed === 'EXPRESS',
        }),
      });
      if (!response.ok) throw new Error('Quote unavailable');
      const result = await response.json() as { data: { total: number; currency: string; sheets: number; expiresAt: string } };
      setQuote(result.data);
      setQuoteState('idle');
    } catch {
      setQuoteState('error');
    }
  };

  if (flowStep === 2 && isPrint && quote) {
    return <ShopSelection quote={quote} paperSize={config.paperSize} colour={config.colour} goBack={() => setFlowStep(1)} />;
  }

  return <section className="request-page"><button className="back-link" type="button" onClick={() => goTo('dashboard')}><span>←</span> Back to dashboard</button><div className="request-heading"><p className="section-label">{isPrint ? 'Print & Deliver' : 'Attest & Return'}</p><h1>{isPrint ? 'Let’s get your documents ready.' : 'A careful journey for important documents.'}</h1><p>{isPrint ? 'Start by uploading the PDF you would like printed. You can review every option before placing your order.' : 'Book collection for your original documents without uploading them. We will guide you through service, pickup and return details.'}</p></div><div className="stepper"><span className="stepper__active">1</span><span className="stepper__line" /><span>2</span><span className="stepper__line" /><span>3</span><div className="stepper__labels"><strong>{isPrint ? 'Documents' : 'Service & pickup'}</strong><span>{isPrint ? 'Print options' : 'Agent & return'}</span><span>Review & pay</span></div></div><div className="request-layout"><div className="panel request-form"><h2>{isPrint ? 'Upload your PDF' : 'Book original document collection'}</h2><p className="form-copy">{isPrint ? 'Your file stays private and is only shared with the shop you select.' : 'Supporting copies are optional. The original documents will be collected after your booking is confirmed.'}</p>{isPrint && (uploadedFile ? <div className="uploaded-file"><span className="uploaded-file__icon"><Icon name="file" /></span><span><strong>{uploadedFile}</strong><small>Ready to configure</small></span><button type="button" aria-label="Remove uploaded file" onClick={onClear}>×</button></div> : <UploadBox label="Drop your PDF here" onChange={onFileChange} />)}<div className="form-divider" />{isPrint ? <div className="print-options"><label className="field-label">Pages<input type="number" min="1" max="10000" value={config.pages} onChange={(event) => updateConfig('pages', event.target.value)} /></label><label className="field-label">Copies<input type="number" min="1" max="100" value={config.copies} onChange={(event) => updateConfig('copies', event.target.value)} /></label><label className="field-label">Paper size<select value={config.paperSize} onChange={(event) => updateConfig('paperSize', event.target.value)}><option value="A4">A4</option><option value="A3">A3</option><option value="A5">A5</option></select></label><label className="field-label">Colour<select value={config.colour} onChange={(event) => updateConfig('colour', event.target.value)}><option value="BLACK_WHITE">Black & white</option><option value="COLOUR">Colour</option></select></label><label className="field-label">Sides<select value={config.sides} onChange={(event) => updateConfig('sides', event.target.value)}><option value="SINGLE">Single-sided</option><option value="DUPLEX">Double-sided</option></select></label><label className="field-label">Delivery<select value={config.deliverySpeed} onChange={(event) => updateConfig('deliverySpeed', event.target.value)}><option value="STANDARD">Standard</option><option value="EXPRESS">Express</option></select></label><div className="option-toggles"><label><input type="checkbox" checked={config.binding} onChange={(event) => updateConfig('binding', event.target.checked)} /> Binding</label><label><input type="checkbox" checked={config.stapling} onChange={(event) => updateConfig('stapling', event.target.checked)} /> Stapling</label><label><input type="checkbox" checked={config.lamination} onChange={(event) => updateConfig('lamination', event.target.checked)} /> Lamination</label></div><button className="button button--secondary quote-button" type="button" disabled={!uploadedFile || quoteState === 'loading'} onClick={requestQuote}>{quoteState === 'loading' ? 'Calculating…' : 'Get live quote'} <Icon name="arrow" /></button>{quoteState === 'error' && <p className="quote-error">The pricing service is unavailable. Nothing has been submitted; try again when the API is connected.</p>}{quote && <div className="quote-result"><span><strong>{quote.currency} {quote.total.toFixed(2)}</strong><small>{quote.sheets} physical sheets · Quote expires {new Date(quote.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span><span className="quote-result__ready">Ready to review</span></div>}</div> : <div className="attestation-options"><label className="field-label">Choose an attestation service<select value={attestationServiceId} onChange={(event) => { setAttestationServiceId(event.target.value); setQuote(null); }}><option value="" disabled>{attestationServices.length ? 'Select a service' : 'Services unavailable'}</option>  {attestationServices.map((service) => <option key={service.id} value={service.id}>{service.name} · LKR {service.serviceFee}</option>)}</select></label>{attestationServices.find((service) => service.id === attestationServiceId) && <div className="requirements"><strong>Prepare these documents</strong><span>{attestationServices.find((service) => service.id === attestationServiceId)?.requiredOriginals.join(' · ')}</span><small>Originals are collected separately by a verified rider.</small></div>}<label className="field-label">Pickup address<input value={attestationBooking.pickupAddress} onChange={(event) => setAttestationBooking((current) => ({ ...current, pickupAddress: event.target.value }))} placeholder="Building, street and area" /></label><div className="booking-fields"><label className="field-label">Pickup date<input type="date" value={attestationBooking.pickupDate} onChange={(event) => setAttestationBooking((current) => ({ ...current, pickupDate: event.target.value }))} /></label><label className="field-label">Time slot<select value={attestationBooking.pickupSlot} onChange={(event) => setAttestationBooking((current) => ({ ...current, pickupSlot: event.target.value }))}><option value="">Choose a slot</option><option value="09:00-12:00">09:00–12:00</option><option value="12:00-15:00">12:00–15:00</option><option value="15:00-18:00">15:00–18:00</option></select></label></div><label className="field-label">Delivery speed<select value={config.deliverySpeed} onChange={(event) => updateConfig('deliverySpeed', event.target.value)}><option value="STANDARD">Standard</option><option value="EXPRESS">Express</option></select></label><button className="button button--secondary quote-button" type="button" disabled={!attestationServiceId || quoteState === 'loading'} onClick={requestQuote}>{quoteState === 'loading' ? 'Calculating…' : 'Get booking quote'} <Icon name="arrow" /></button>{quoteState === 'error' && <p className="quote-error">The attestation pricing service is unavailable. Nothing has been submitted; try again when the API is connected.</p>}{quote && <div className="quote-result"><span><strong>{quote.currency} {quote.total.toFixed(2)}</strong><small>Pickup + return delivery · Quote expires {new Date(quote.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span><span className="quote-result__ready">Ready to review</span></div>}</div>}<div className="form-actions"><button className="button button--primary" type="button" disabled={isPrint ? !uploadedFile || !quote : !attestationServiceId || !attestationBooking.pickupAddress || !attestationBooking.pickupDate || !attestationBooking.pickupSlot || !quote} onClick={() => isPrint ? setFlowStep(2) : undefined}>Continue <Icon name="arrow" /></button><button className="button button--quiet" type="button" onClick={() => goTo('dashboard')}>Save & exit</button></div></div><aside className="request-aside"><div className="trust-note"><span className="trust-note__icon"><Icon name="shield" /></span><strong>Your documents are private</strong><p>We use secure, short-lived access for every approved handover. Nothing is publicly accessible.</p><button className="text-button text-button--muted" type="button" onClick={() => goTo('support')}>Learn about security <Icon name="arrow" /></button></div><div className="request-help"><span>Need help?</span><button type="button" onClick={() => goTo('support')}>Talk to support</button></div></aside></div></section>;
}

function ShopSelection({ quote, paperSize, colour, goBack }: { quote: { total: number; currency: string; expiresAt: string }; paperSize: string; colour: string; goBack: () => void }) {
  const [shops, setShops] = useState<{ id: string; name: string; description: string; address: string; distanceKm: number; rating: number; reviewCount: number; estimatedMinutes: number; capabilities: string[] }[]>([]);
  const [selectedShop, setSelectedShop] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    fetch(`${apiUrl}/shops?paperSize=${paperSize}&colour=${colour}`)
      .then((response) => response.ok ? response.json() as Promise<{ data: typeof shops }> : Promise.reject(new Error('Shops unavailable')))
      .then((result) => setShops(result.data))
      .catch(() => setShops([]))
      .finally(() => setLoading(false));
  }, [paperSize, colour]);

  return <section className="request-page"><button className="back-link" type="button" onClick={goBack}><span>←</span> Back to print options</button><div className="request-heading"><p className="section-label">Choose a shop</p><h1>Find the right fit for your order.</h1><p>These shops are eligible for your selected paper and colour options. Distance and turnaround are estimates until your address is confirmed.</p></div><div className="shop-layout"><div><div className="shop-toolbar"><strong>{loading ? 'Finding eligible shops…' : `${shops.length} eligible shops`}</strong><span>Sorted by distance</span></div>{shops.map((shop) => <button className={`shop-card ${selectedShop === shop.id ? 'shop-card--selected' : ''}`} key={shop.id} type="button" onClick={() => setSelectedShop(shop.id)}><span className="shop-card__mark"><Icon name="print" /></span><span className="shop-card__body"><strong>{shop.name}</strong><span>{shop.address} · {shop.distanceKm.toFixed(1)} km</span><span className="shop-card__meta">★ {shop.rating} ({shop.reviewCount}) · Ready in about {shop.estimatedMinutes} min</span></span><span className="shop-card__check">{selectedShop === shop.id ? 'Selected' : 'Choose'}</span></button>)}{!loading && !shops.length && <div className="empty-panel"><span className="empty-panel__icon"><Icon name="print" /></span><h3>No eligible shops found</h3><p>Try a different address or print configuration. Nothing has been submitted.</p></div>}</div><aside className="shop-summary panel"><p className="section-label">Order summary</p><h2>{quote.currency} {quote.total.toFixed(2)}</h2><span>Quote expires {new Date(quote.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><div className="summary-rule" /><small>{paperSize} · {colour === 'COLOUR' ? 'Colour' : 'Black & white'}</small><button className="button button--primary" type="button" disabled={!selectedShop}>Continue to address <Icon name="arrow" /></button></aside></div></section>;
}

function SimplePage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="simple-page"><p className="section-label">Workspace</p><h1>{title}</h1><p className="simple-page__description">{description}</p>{children}</section>;
}

function EmptyState({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) {
  return <div className="empty-panel"><span className="empty-panel__icon"><Icon name="orders" /></span><h3>{title}</h3><p>{text}</p><button className="button button--primary" type="button" onClick={onAction}>{action} <Icon name="arrow" /></button></div>;
}

function AddressPage({ addresses, onChanged }: { addresses: { id: string; label: string; line: string }[]; onChanged: (addresses: { id: string; label: string; line: string }[]) => void }) {
  const [label, setLabel] = useState('');
  const [line, setLine] = useState('');
  const [error, setError] = useState('');
  const addAddress = async () => {
    if (!label.trim() || line.trim().length < 5) { setError('Enter a label and complete address.'); return; }
    const accessToken = window.sessionStorage.getItem('print-attest-access-token');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    try {
      const response = await fetch(`${apiUrl}/customer/addresses`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken ?? ''}` }, body: JSON.stringify({ label: label.trim(), line: line.trim() }) });
      if (!response.ok) throw new Error('Address could not be saved');
      const result = await response.json() as { data: { id: string; label: string; line: string } };
      onChanged([result.data, ...addresses]);
      setLabel('');
      setLine('');
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Address could not be saved');
    }
  };
  const deleteAddress = async (id: string) => {
    const accessToken = window.sessionStorage.getItem('print-attest-access-token');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const response = await fetch(`${apiUrl}/customer/addresses/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken ?? ''}` } });
    if (response.ok) onChanged(addresses.filter((address) => address.id !== id));
  };
  return <section className="simple-page"><p className="section-label">Workspace</p><h1>Addresses</h1><p className="simple-page__description">Manage pickup and delivery locations.</p><div className="address-layout"><div className="panel address-form"><h2>Add a new address</h2><label className="field-label">Label<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Home or office" /></label><label className="field-label">Address<input value={line} onChange={(event) => setLine(event.target.value)} placeholder="Street, building and city" /></label>{error && <p className="quote-error">{error}</p>}<button className="button button--primary" type="button" onClick={addAddress}>Save address</button></div><div className="address-list">{addresses.length ? addresses.map((address) => <div className="address-row" key={address.id}><span className="address-icon"><Icon name="pin" /></span><span><strong>{address.label}</strong><small>{address.line}</small></span><button type="button" aria-label={`Delete ${address.label}`} onClick={() => deleteAddress(address.id)}>×</button></div>) : <div className="empty-panel"><h3>No saved addresses</h3><p>Add an address for faster checkout.</p></div>}</div></div></section>;
}

function DocumentLibrary({ documents, onChanged, onStartPrint }: { documents: SavedDocument[]; onChanged: (documents: SavedDocument[]) => void; onStartPrint: () => void }) {
  const [actionError, setActionError] = useState('');
  const [busyDocument, setBusyDocument] = useState('');

  const preview = async (document: SavedDocument) => {
    const previewWindow = window.open('about:blank', '_blank');
    if (!previewWindow) {
      setActionError('Allow pop-ups for QuickDoc to preview this PDF.');
      return;
    }
    setBusyDocument(document.id);
    setActionError('');
    try {
      const token = window.sessionStorage.getItem('print-attest-access-token');
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
      const response = await fetch(`${apiUrl}/customer/documents/${document.id}/preview-url`, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (!response.ok) throw new Error('This PDF could not be opened. Try again.');
      const result = await response.json() as { data: { previewUrl: string } };
      previewWindow.opener = null;
      previewWindow.location.href = result.data.previewUrl;
    } catch (error) {
      previewWindow.close();
      setActionError(error instanceof Error ? error.message : 'This PDF could not be opened.');
    } finally {
      setBusyDocument('');
    }
  };

  const remove = async (document: SavedDocument) => {
    setBusyDocument(document.id);
    setActionError('');
    try {
      const token = window.sessionStorage.getItem('print-attest-access-token');
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
      const response = await fetch(`${apiUrl}/customer/documents/${document.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (!response.ok) throw new Error('This PDF could not be removed. Documents attached to orders must be retained.');
      onChanged(documents.filter((item) => item.id !== document.id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'This PDF could not be removed.');
    } finally {
      setBusyDocument('');
    }
  };

  return <SimplePage title="My documents" description="Private PDFs you have uploaded to QuickDoc.">{actionError && <p className="flow-error" role="alert">{actionError}</p>}{documents.length ? <div className="panel">{documents.map((document) => <div className="order-row" key={document.id}><div className="order-row__mark"><Icon name="file" /></div><div className="order-row__details"><strong>{document.name}</strong><span>{document.pageCount ? `${document.pageCount} pages · ` : ''}{Math.ceil(document.sizeBytes / 1024)} KB</span></div><div className="document-actions"><button className="text-button" type="button" disabled={busyDocument === document.id} onClick={() => void preview(document)}>{busyDocument === document.id ? 'Opening…' : 'Preview'}</button><button className="text-button text-button--muted" type="button" disabled={busyDocument === document.id} onClick={() => void remove(document)}>Remove</button></div></div>)}</div> : <div className="empty-panel"><span className="empty-panel__icon"><Icon name="file" /></span><h3>No saved documents yet</h3><p>Upload a PDF in a print request to preview and securely store it here.</p><button className="button button--primary" type="button" onClick={onStartPrint}><Icon name="plus" /> Start with a print request</button></div>}</SimplePage>;
}

function ProfilePage({ session, onSave, onLogout }: { session: { name: string; email: string; phone: string } | null; onSave: (session: { name: string; email: string; phone: string }) => Promise<void>; onLogout: () => void }) {
  const [form, setForm] = useState(session ?? { name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (session) setForm(session);
  }, [session]);
  const save = async () => {
    setSaving(true);
    setSaveError('');
    setSaved(false);
    try {
      await onSave(form);
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Your profile could not be saved.');
    } finally {
      setSaving(false);
    }
  };
  return <section className="simple-page"><p className="section-label">Account</p><h1>My profile</h1><p className="simple-page__description">Keep your contact details current so riders and support can reach you.</p><div className="profile-layout"><div className="panel profile-form"><div className="profile-heading"><span className="profile-large-avatar">{form.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'C'}</span><div><h2>{form.name || 'Your profile'}</h2><p>Customer account</p></div></div><label className="field-label">Full name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="field-label">Phone number<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label className="field-label">Email address<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@example.com" /></label>{saveError && <p className="flow-error" role="alert">{saveError}</p>}{saved && <p className="profile-saved" role="status">Profile saved.</p>}<div className="form-actions"><button className="button button--primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</button><button className="button button--quiet" type="button" onClick={onLogout}>Log out</button></div></div><aside className="profile-security panel"><span className="trust-note__icon"><Icon name="shield" /></span><h3>Account security</h3><p>Phone verification is unavailable until an SMS provider is configured.</p></aside></div></section>;
}
