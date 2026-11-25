'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminApiError, adminRequest } from './admin-api';
import styles from './support-page.module.css';

type TicketListItem = {
  id: string;
  reference: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; email: string };
  order: { id: string; reference: string } | null;
  assignedAdmin: { id: string; name: string; email: string } | null;
  messages: { body: string; createdAt: string }[];
};

type Ticket = Omit<TicketListItem, 'messages'> & {
  messages: {
    id: string;
    body: string;
    internalNote: boolean;
    createdAt: string;
    sender: { id: string; name: string; email: string };
  }[];
};

type PageResult<T> = {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
};

const STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

function label(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function date(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function SupportAdminPage({
  adminId,
  onSessionExpired,
}: {
  adminId: string;
  onSessionExpired: () => void;
}) {
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [pagination, setPagination] = useState<PageResult<TicketListItem>['pagination'] | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [reply, setReply] = useState('');
  const [internalNote, setInternalNote] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoadingList(true);
      setError('');
      const query = new URLSearchParams({ page: String(page), pageSize: '50' });
      if (search.trim()) query.set('search', search.trim());
      if (statusFilter) query.set('status', statusFilter);
      adminRequest<PageResult<TicketListItem>>(`/admin/support?${query.toString()}`)
        .then((result) => {
          if (!active) return;
          setTickets(result.data);
          setPagination(result.pagination);
          if (page > result.pagination.pageCount && page > 1) {
            setPage(Math.max(1, result.pagination.pageCount));
          }
          if (selectedId && !result.data.some((item) => item.id === selectedId)) {
            setSelectedId('');
            setTicket(null);
          } else if (!selectedId && result.data[0]) {
            setSelectedId(result.data[0].id);
          }
        })
        .catch((reason: unknown) => {
          if (!active) return;
          setError(reason instanceof Error ? reason.message : 'Support requests could not be loaded.');
          if (reason instanceof AdminApiError && reason.status === 401) onSessionExpired();
        })
        .finally(() => { if (active) setLoadingList(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search, statusFilter, page, refreshKey, selectedId, onSessionExpired]);

  useEffect(() => {
    if (!selectedId) {
      setTicket(null);
      return;
    }
    let active = true;
    setLoadingTicket(true);
    adminRequest<{ data: Ticket }>(`/admin/support/${selectedId}`)
      .then((result) => { if (active) setTicket(result.data); })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'This request could not be opened.');
        if (reason instanceof AdminApiError && reason.status === 401) onSessionExpired();
      })
      .finally(() => { if (active) setLoadingTicket(false); });
    return () => { active = false; };
  }, [selectedId, refreshKey, onSessionExpired]);

  const updateTicket = async (updates: { status?: string; priority?: string; assignedAdminId?: string | null }) => {
    if (!ticket) return;
    setError('');
    setNotice('');
    setMutating(true);
    try {
      await adminRequest(`/admin/support/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      setNotice('Support request updated.');
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The request could not be updated.');
      if (reason instanceof AdminApiError && reason.status === 401) onSessionExpired();
    } finally {
      setMutating(false);
    }
  };

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!ticket || !reply.trim()) return;
    setError('');
    setNotice('');
    setMutating(true);
    try {
      await adminRequest(`/admin/support/${ticket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply.trim(), internalNote }),
      });
      setReply('');
      setInternalNote(false);
      setNotice(internalNote ? 'Internal note added.' : 'Reply sent to the customer.');
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The message could not be sent.');
      if (reason instanceof AdminApiError && reason.status === 401) onSessionExpired();
    } finally {
      setMutating(false);
    }
  };

  return (
    <section className="admin-content">
      <header className="admin-heading">
        <div>
          <h1>Support inbox</h1>
          <p className="admin-heading__description">Review customer requests, coordinate internally, and send replies from one place.</p>
        </div>
        <button className="secondary-action" type="button" disabled={loadingList} onClick={() => setRefreshKey((key) => key + 1)}>
          {loadingList ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error && <div className="error-notice" role="alert">{error}</div>}
      {notice && <div className="success-notice" role="status">{notice}</div>}

      <div className={styles.toolbar}>
        <label className="search-field">
          <span className="sr-only">Search support requests</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg>
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search reference, customer or order" />
        </label>
        <label className={styles.filter}>
          <span className="sr-only">Filter by status</span>
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
        </label>
        <span className={styles.count}>{pagination?.total ?? tickets.length} requests</span>
      </div>

      <div className={styles.workspace}>
        <aside className={styles.list} aria-label="Support requests">
          {loadingList && tickets.length === 0 ? <p className={styles.listState} aria-live="polite">Loading requests…</p>
            : tickets.length === 0 ? <p className={styles.listState}>No requests match these filters.</p>
              : tickets.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`${styles.listItem} ${selectedId === item.id ? styles.listItemActive : ''}`}
                  onClick={() => { setSelectedId(item.id); setError(''); setNotice(''); }}
                >
                  <span className={styles.listTop}><strong>{item.reference}</strong><span className={styles.priority} data-priority={item.priority}>{label(item.priority)}</span></span>
                  <span className={styles.listSubject}>{item.subject}</span>
                  <span className={styles.listCustomer}>{item.customer.name} · {label(item.status)}</span>
                  <span className={styles.listPreview}>{item.messages[0]?.body ?? 'No message yet'}</span>
                </button>
              ))}
          {pagination && pagination.pageCount > 1 && (
            <nav className={styles.pagination} aria-label="Support request pages">
              <button type="button" disabled={loadingList || pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
              <span>Page {pagination.page} of {pagination.pageCount}</span>
              <button type="button" disabled={loadingList || pagination.page >= pagination.pageCount} onClick={() => setPage((current) => Math.min(pagination.pageCount, current + 1))}>Next</button>
            </nav>
          )}
        </aside>

        <div className={styles.detail}>
          {loadingTicket ? <p className={styles.detailState} aria-live="polite">Loading request…</p>
            : ticket ? (
              <>
                <header className={styles.ticketHeader}>
                  <div>
                    <span className={styles.reference}>{ticket.reference}</span>
                    <h2>{ticket.subject}</h2>
                    <p>{ticket.customer.name} · <a href={`mailto:${ticket.customer.email}`}>{ticket.customer.email}</a></p>
                    {ticket.order && <p>Order <strong>{ticket.order.reference}</strong></p>}
                  </div>
                  <button
                    className={styles.assignButton}
                    type="button"
                    disabled={mutating}
                    onClick={() => void updateTicket({ assignedAdminId: ticket.assignedAdmin?.id === adminId ? null : adminId })}
                  >
                    {ticket.assignedAdmin?.id === adminId ? 'Unassign me' : ticket.assignedAdmin ? `Assigned: ${ticket.assignedAdmin.name}` : 'Assign to me'}
                  </button>
                </header>

                <div className={styles.controls}>
                  <label>Status
                    <select disabled={mutating} value={ticket.status} onChange={(event) => void updateTicket({ status: event.target.value })}>
                      {STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                    </select>
                  </label>
                  <label>Priority
                    <select disabled={mutating} value={ticket.priority} onChange={(event) => void updateTicket({ priority: event.target.value })}>
                      {PRIORITIES.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}
                    </select>
                  </label>
                  <span className={styles.updated}>Updated {date(ticket.updatedAt)}</span>
                </div>

                <div className={styles.messages} aria-label="Ticket conversation">
                  {ticket.messages.map((item) => (
                    <article className={styles.message} data-internal={item.internalNote} key={item.id}>
                      <div className={styles.messageHeader}>
                        <div><strong>{item.sender.name}</strong>{item.internalNote && <span className={styles.internalBadge}>Internal note</span>}</div>
                        <time dateTime={item.createdAt}>{date(item.createdAt)}</time>
                      </div>
                      <p>{item.body}</p>
                    </article>
                  ))}
                </div>

                <form className={styles.replyForm} onSubmit={sendReply}>
                  <label htmlFor="admin-support-reply">{internalNote ? 'Add an internal note' : 'Reply to customer'}</label>
                  <textarea id="admin-support-reply" required maxLength={5000} rows={4} value={reply} onChange={(event) => setReply(event.target.value)} />
                  <div className={styles.replyActions}>
                    <label className={styles.noteToggle}>
                      <input type="checkbox" checked={internalNote} onChange={(event) => setInternalNote(event.target.checked)} />
                      Internal note (not visible to customer)
                    </label>
                    <button className="primary-action" type="submit" disabled={mutating || !reply.trim()}>{mutating ? 'Sending…' : internalNote ? 'Add note' : 'Send reply'}</button>
                  </div>
                </form>
              </>
            ) : <div className={styles.detailState}>
              <strong>Select a support request</strong>
              <span>Customer messages and actions will appear here.</span>
            </div>}
        </div>
      </div>
    </section>
  );
}
