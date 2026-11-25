'use client';

import { FormEvent, useEffect, useState } from 'react';
import styles from './support-page.module.css';

type TicketSummary = {
  id: string;
  reference: string;
  subject: string;
  status: string;
  priority: string;
  orderId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: { body: string; createdAt: string }[];
};

type TicketDetail = Omit<TicketSummary, 'messages'> & {
  messages: {
    id: string;
    body: string;
    createdAt: string;
    sender: { name: string };
  }[];
};

type SupportOrder = { id: string; reference: string };

function apiBase() {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
}

async function responseError(response: Response) {
  try {
    const body = await response.json() as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join('. ');
    if (body.message) return body.message;
  } catch {
    // Use the status-based message below when the API did not return JSON.
  }
  return `Request failed (${response.status})`;
}

async function customerRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = apiBase();
  let token = window.sessionStorage.getItem('print-attest-access-token');
  if (!token) throw new Error('Your session has expired. Sign in again.');

  const send = (accessToken: string) => fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  let response = await send(token);
  if (response.status === 401) {
    const refreshToken = window.localStorage.getItem('print-attest-refresh-token');
    if (!refreshToken) throw new Error('Your session has expired. Sign in again.');
    const refreshResponse = await fetch(`${base}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    if (!refreshResponse.ok) {
      window.sessionStorage.removeItem('print-attest-access-token');
      window.localStorage.removeItem('print-attest-refresh-token');
      throw new Error('Your session has expired. Sign in again.');
    }
    const refreshed = await refreshResponse.json() as {
      data: { accessToken: string; refreshToken: string };
    };
    token = refreshed.data.accessToken;
    window.sessionStorage.setItem('print-attest-access-token', token);
    window.localStorage.setItem('print-attest-refresh-token', refreshed.data.refreshToken);
    response = await send(token);
  }

  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<T>;
}

function formatStatus(status: string) {
  return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function CustomerSupportPage({ orders }: { orders: SupportOrder[] }) {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [orderId, setOrderId] = useState('');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadingList(true);
    customerRequest<{ data: TicketSummary[] }>('/customer/support')
      .then((result) => {
        if (!active) return;
        setTickets(result.data);
        if (!selectedId && result.data[0]) setSelectedId(result.data[0].id);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Support tickets could not be loaded.');
      })
      .finally(() => {
        if (active) setLoadingList(false);
      });
    return () => { active = false; };
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedId) {
      setTicket(null);
      return;
    }
    let active = true;
    setLoadingTicket(true);
    customerRequest<{ data: TicketDetail }>(`/customer/support/${selectedId}`)
      .then((result) => {
        if (active) {
          setTicket(result.data);
          setError('');
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'This ticket could not be opened.');
      })
      .finally(() => {
        if (active) setLoadingTicket(false);
      });
    return () => { active = false; };
  }, [selectedId, refreshKey]);

  const createTicket = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await customerRequest<{ data: { id: string } }>('/customer/support', {
        method: 'POST',
        body: JSON.stringify({
          subject: subject.trim(),
          body: message.trim(),
          ...(orderId ? { orderId } : {}),
        }),
      });
      setSubject('');
      setMessage('');
      setOrderId('');
      setCreating(false);
      setSelectedId(result.data.id);
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your support request could not be sent.');
    } finally {
      setSubmitting(false);
    }
  };

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !reply.trim()) return;
    setError('');
    setSubmitting(true);
    try {
      const result = await customerRequest<{ data: TicketDetail }>(`/customer/support/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: reply.trim() }),
      });
      setTicket(result.data);
      setReply('');
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your reply could not be sent.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>Support</h1>
          <p>Send a message about your account or an order. Replies stay private to your account.</p>
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => { setCreating(true); setSelectedId(''); setTicket(null); setError(''); }}>
          New request
        </button>
      </header>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.layout}>
        <aside className={styles.ticketList} aria-label="Your support requests">
          <div className={styles.listHeading}>
            <strong>Your requests</strong>
            <button type="button" onClick={() => setRefreshKey((key) => key + 1)} disabled={loadingList}>
              {loadingList ? 'Loading' : 'Refresh'}
            </button>
          </div>
          {loadingList && tickets.length === 0 ? <p className={styles.listMessage} aria-live="polite">Loading your requests…</p>
            : tickets.length === 0 ? <p className={styles.listMessage}>No support requests yet.</p>
              : tickets.map((item) => (
                <button
                  className={`${styles.ticketItem} ${selectedId === item.id && !creating ? styles.ticketItemSelected : ''}`}
                  type="button"
                  key={item.id}
                  onClick={() => { setCreating(false); setSelectedId(item.id); setError(''); }}
                >
                  <span className={styles.ticketReference}>{item.reference}</span>
                  <strong>{item.subject}</strong>
                  <span className={styles.ticketMeta}>{formatStatus(item.status)} · {formatDate(item.updatedAt)}</span>
                  {item.messages[0] && <span className={styles.preview}>{item.messages[0].body}</span>}
                </button>
              ))}
        </aside>

        <div className={styles.conversation}>
          {creating ? (
            <form className={styles.form} onSubmit={createTicket}>
              <h2>Start a support request</h2>
              <p>Include the details our team needs to understand the issue. Do not send passwords or payment-card details.</p>
              <label>Subject
                <input required minLength={3} maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} />
              </label>
              {orders.length > 0 && <label>Related order <span className={styles.optional}>(optional)</span>
                <select value={orderId} onChange={(event) => setOrderId(event.target.value)}>
                  <option value="">Not related to an order</option>
                  {orders.map((order) => <option value={order.id} key={order.id}>{order.reference}</option>)}
                </select>
              </label>}
              <label>Message
                <textarea required minLength={1} maxLength={5000} rows={7} value={message} onChange={(event) => setMessage(event.target.value)} />
              </label>
              <div className={styles.actions}>
                <button className={styles.primaryButton} type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send request'}</button>
                <button className={styles.secondaryButton} type="button" onClick={() => { setCreating(false); setError(''); }}>Cancel</button>
              </div>
            </form>
          ) : loadingTicket ? <p className={styles.detailMessage} aria-live="polite">Loading conversation…</p>
            : ticket ? (
              <>
                <div className={styles.conversationHeading}>
                  <div><span className={styles.ticketReference}>{ticket.reference}</span><h2>{ticket.subject}</h2></div>
                  <span className={styles.status} data-status={ticket.status}>{formatStatus(ticket.status)}</span>
                </div>
                {ticket.orderId && <p className={styles.relatedOrder}>Related order attached</p>}
                <div className={styles.messages} aria-label="Conversation">
                  {ticket.messages.map((item) => (
                    <article className={styles.message} key={item.id}>
                      <div><strong>{item.sender.name}</strong><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div>
                      <p>{item.body}</p>
                    </article>
                  ))}
                </div>
                <form className={styles.replyForm} onSubmit={sendReply}>
                  <label htmlFor="support-reply">Reply to this request</label>
                  <textarea id="support-reply" required maxLength={5000} rows={4} value={reply} onChange={(event) => setReply(event.target.value)} />
                  <div className={styles.actions}>
                    <button className={styles.primaryButton} type="submit" disabled={submitting || !reply.trim()}>{submitting ? 'Sending…' : 'Send reply'}</button>
                    <span>Replies are added to this private conversation.</span>
                  </div>
                </form>
              </>
            ) : <div className={styles.empty}>
              <h2>Choose or create a request</h2>
              <p>Your support conversations and their current status will appear here.</p>
              <button className={styles.secondaryButton} type="button" onClick={() => setCreating(true)}>Start a request</button>
            </div>}
        </div>
      </div>
    </section>
  );
}
