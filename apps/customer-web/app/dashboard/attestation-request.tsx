'use client';

import { useEffect, useState } from 'react';

type Service = {
  id: string;
  name: string;
  estimatedDays: number;
  serviceFee: number;
  requiredOriginals: string[];
};

type Agent = {
  id: string;
  businessName: string;
  address: string;
  estimatedDays: number;
};

type Quote = {
  serviceFee: number;
  pickupDelivery: number;
  returnDelivery: number;
  expressFee: number;
  tax: number;
  total: number;
  currency: string;
  expiresAt: string;
};

export type AttestationBookingResult = {
  id: string;
  reference: string;
  status: string;
  serviceCode: string;
  quotedTotal: number;
  currency: string;
  estimatedReadyAt: string;
  agent: { businessName: string };
};

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
}

async function getApiError(response: Response, fallback: string): Promise<Error> {
  const result = await response.json().catch(() => null) as { message?: string | string[] } | null;
  const message = Array.isArray(result?.message) ? result.message.join(' ') : result?.message;
  return new Error(message || `${fallback} (HTTP ${response.status}).`);
}

function localDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AttestationRequestFlow({
  onBooked,
  onViewOrders,
  onBack,
}: {
  onBooked: (booking: AttestationBookingResult) => void;
  onViewOrders: () => void;
  onBack: () => void;
}) {
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [serviceId, setServiceId] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [returnAddress, setReturnAddress] = useState('');
  const [pickupDistanceKm, setPickupDistanceKm] = useState('5');
  const [returnDistanceKm, setReturnDistanceKm] = useState('5');
  const [pickupDate, setPickupDate] = useState(() => localDateValue(new Date()));
  const [pickupSlot, setPickupSlot] = useState('');
  const [express, setExpress] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<AttestationBookingResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBase()}/attestation/services`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw await getApiError(response, 'Attestation services could not be loaded');
        return response.json() as Promise<{ data: Service[] }>;
      })
      .then(({ data }) => {
        setServices(data);
        setServiceId((current) => current || data[0]?.id || '');
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Attestation services could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setServicesLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setAgentId('');
    setAgents([]);
    setQuote(null);
    if (!serviceId) {
      setAgentsLoading(false);
      return;
    }

    const controller = new AbortController();
    setAgentsLoading(true);
    fetch(`${apiBase()}/attestation/agents?serviceId=${encodeURIComponent(serviceId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw await getApiError(response, 'Available agents could not be loaded');
        return response.json() as Promise<{ data: Agent[] }>;
      })
      .then(({ data }) => setAgents(data))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Available agents could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setAgentsLoading(false);
      });
    return () => controller.abort();
  }, [serviceId]);

  const selectedService = services.find((service) => service.id === serviceId);
  const selectedAgent = agents.find((agent) => agent.id === agentId);
  const pickupDistance = Number(pickupDistanceKm);
  const returnDistance = Number(returnDistanceKm);
  const distancesValid = Number.isFinite(pickupDistance) && pickupDistance >= 0 && pickupDistance <= 200
    && Number.isFinite(returnDistance) && returnDistance >= 0 && returnDistance <= 200;
  const today = localDateValue(new Date());
  const detailsValid = Boolean(selectedAgent && pickupAddress.trim().length >= 5
    && returnAddress.trim().length >= 5 && pickupDate >= today && pickupSlot && distancesValid);
  const quoteExpiresAt = quote ? Date.parse(quote.expiresAt) : Number.NaN;
  const quoteIsCurrent = Boolean(quote && Number.isFinite(quoteExpiresAt) && quoteExpiresAt > Date.now());

  const requestQuote = async () => {
    if (!selectedService || !distancesValid) return;
    setQuoteLoading(true);
    setQuote(null);
    setError('');
    try {
      const response = await fetch(`${apiBase()}/attestation/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          pickupDistanceKm: pickupDistance,
          returnDistanceKm: returnDistance,
          express,
        }),
      });
      if (!response.ok) throw await getApiError(response, 'A booking quote could not be calculated');
      const result = await response.json() as { data: Quote };
      setQuote(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A booking quote could not be calculated.');
    } finally {
      setQuoteLoading(false);
    }
  };

  const submitBooking = async () => {
    if (!quote || !selectedAgent || !selectedService || !detailsValid) return;
    if (!Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= Date.now()) {
      setQuote(null);
      setStep(1);
      setError('Your quote expired. Get a new quote before placing the booking.');
      return;
    }
    const token = window.sessionStorage.getItem('print-attest-access-token');
    if (!token) {
      setError('Your sign-in has expired. Sign in again to place this booking.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${apiBase()}/attestation/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          serviceId,
          agentId,
          pickupAddress: pickupAddress.trim(),
          returnAddress: returnAddress.trim(),
          pickupDate,
          pickupSlot,
          pickupDistanceKm: pickupDistance,
          returnDistanceKm: returnDistance,
          express,
        }),
      });
      if (!response.ok) throw await getApiError(response, 'Your booking could not be placed');
      const result = await response.json() as { data: AttestationBookingResult };
      setBooking(result.data);
      onBooked(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your booking could not be placed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (booking) {
    return (
      <section className="request-page">
        <button className="back-link" type="button" onClick={onBack}><span aria-hidden="true">←</span> Back to dashboard</button>
        <div className="attest-confirmation" role="status">
          <span className="attest-confirmation__mark" aria-hidden="true">✓</span>
          <h1>Your booking is in.</h1>
          <p>We’ve registered the pickup request with {booking.agent.businessName}. Track updates from My orders.</p>
          <dl>
            <div><dt>Booking reference</dt><dd>{booking.reference}</dd></div>
            <div><dt>Pickup</dt><dd>{new Date(`${pickupDate}T00:00:00`).toLocaleDateString()} · {pickupSlot}</dd></div>
            <div><dt>Estimated return</dt><dd>{new Date(booking.estimatedReadyAt).toLocaleDateString()}</dd></div>
            <div><dt>Quoted total</dt><dd>{booking.currency} {Number(booking.quotedTotal).toFixed(2)}</dd></div>
          </dl>
          <button className="button button--primary" type="button" onClick={onViewOrders}>View my orders</button>
        </div>
      </section>
    );
  }

  return (
    <section className="request-page">
      <button className="back-link" type="button" onClick={onBack}><span aria-hidden="true">←</span> Back to dashboard</button>
      <div className="request-heading">
        <h1>Arrange a careful return.</h1>
        <p>Choose an attestation service and an available agent. Your original documents will be collected and returned to the addresses you provide.</p>
      </div>
      <div className="stepper" aria-label={`Step ${step} of 2`}>
        <span className="stepper__active">1</span><span className="stepper__line" />
        <span className={step === 2 ? 'stepper__active' : ''}>2</span>
        <div className="stepper__labels"><strong>Details</strong><span>Review & book</span></div>
      </div>

      {step === 1 ? (
        <div className="request-layout">
          <div className="panel request-form">
            <h2>Service and collection details</h2>
            <p className="form-copy">Select an available agent, then confirm where and when your originals can be collected and returned.</p>
            <div className="attestation-options">
              <label className="field-label">Attestation service
                <select value={serviceId} disabled={servicesLoading || !services.length} onChange={(event) => {
                  setServiceId(event.target.value);
                  setQuote(null);
                  setError('');
                }}>
                  {servicesLoading && <option value="">Loading services…</option>}
                  {!servicesLoading && !services.length && <option value="">No services available</option>}
                  {services.map((service) => <option key={service.id} value={service.id}>{service.name} · LKR {service.serviceFee.toFixed(2)}</option>)}
                </select>
              </label>

              {selectedService && <div className="requirements">
                <strong>Originals to prepare</strong>
                <span>{selectedService.requiredOriginals.length ? selectedService.requiredOriginals.join(' · ') : 'Check with your selected agent before pickup.'}</span>
                <small>Keep original documents ready for the scheduled collection.</small>
              </div>}

              <fieldset className="attest-agent-list">
                <legend>Available agents</legend>
                {agentsLoading ? <p className="form-copy">Loading agents for this service…</p> : agents.length ? agents.map((agent) => (
                  <button
                    className={`attest-agent ${agentId === agent.id ? 'attest-agent--selected' : ''}`}
                    key={agent.id}
                    type="button"
                    aria-pressed={agentId === agent.id}
                    onClick={() => { setAgentId(agent.id); setError(''); }}
                  >
                    <span><strong>{agent.businessName}</strong><small>{agent.address}</small></span>
                    <span className="attest-agent__time">About {agent.estimatedDays} days</span>
                  </button>
                )) : <p className="form-copy">{serviceId ? 'No approved agents are currently available for this service.' : 'Choose a service to find available agents.'}</p>}
              </fieldset>

              <label className="field-label">Pickup address
                <input autoComplete="street-address" value={pickupAddress} onChange={(event) => setPickupAddress(event.target.value)} placeholder="Building, street and area" />
              </label>
              <label className="field-label">Return address
                <input autoComplete="street-address" value={returnAddress} onChange={(event) => setReturnAddress(event.target.value)} placeholder="Where should we return your originals?" />
              </label>
              {pickupAddress.trim().length >= 5 && pickupAddress !== returnAddress && (
                <button className="text-button text-button--muted" type="button" onClick={() => setReturnAddress(pickupAddress)}>Use pickup address for return</button>
              )}
              <div className="booking-fields">
                <label className="field-label">Pickup date
                  <input type="date" min={today} value={pickupDate} onChange={(event) => setPickupDate(event.target.value)} />
                </label>
                <label className="field-label">Pickup time
                  <select value={pickupSlot} onChange={(event) => setPickupSlot(event.target.value)}>
                    <option value="">Choose a time</option>
                    <option value="09:00-12:00">09:00–12:00</option>
                    <option value="12:00-15:00">12:00–15:00</option>
                    <option value="15:00-18:00">15:00–18:00</option>
                  </select>
                </label>
              </div>
              <div className="booking-fields">
                <label className="field-label">Estimated pickup distance (km)
                  <input type="number" min="0" max="200" step="0.1" value={pickupDistanceKm} onChange={(event) => { setPickupDistanceKm(event.target.value); setQuote(null); }} />
                </label>
                <label className="field-label">Estimated return distance (km)
                  <input type="number" min="0" max="200" step="0.1" value={returnDistanceKm} onChange={(event) => { setReturnDistanceKm(event.target.value); setQuote(null); }} />
                </label>
              </div>
              <label className="attest-express">
                <input type="checkbox" checked={express} onChange={(event) => { setExpress(event.target.checked); setQuote(null); }} />
                Request express processing
              </label>
              <p className="attest-distance-note">Distance is an estimate used for the quote and can be confirmed with your agent.</p>
              <button className="button button--secondary quote-button" type="button" disabled={!selectedService || !distancesValid || quoteLoading} onClick={requestQuote}>
                {quoteLoading ? 'Calculating quote…' : 'Get booking quote'}
              </button>
              {quote && <div className="quote-result">
                <span><strong>{quote.currency} {quote.total.toFixed(2)}</strong><small>Pickup and return included · Quote expires {new Date(quote.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span>
                <span className="quote-result__ready">Quote ready</span>
              </div>}
              {error && <p className="quote-error" role="alert">{error}</p>}
            </div>
            <div className="form-actions">
              <button className="button button--primary" type="button" disabled={!detailsValid || !quoteIsCurrent} onClick={() => {
                if (!quoteIsCurrent) {
                  setQuote(null);
                  setError('Your quote expired. Get a new quote before reviewing the booking.');
                  return;
                }
                setError('');
                setStep(2);
              }}>Review booking <span aria-hidden="true">→</span></button>
              <button className="button button--quiet" type="button" onClick={onBack}>Return to dashboard</button>
            </div>
          </div>
          <aside className="request-aside">
            <div className="trust-note"><span className="trust-note__icon" aria-hidden="true">✓</span><strong>Originals stay in your care until pickup</strong><p>Keep your documents with you until the collection time. You can follow each custody update from My orders.</p></div>
            <div className="request-help"><span>Need help?</span><button type="button" onClick={onBack}>Return to your dashboard</button></div>
          </aside>
        </div>
      ) : (
        <div className="request-layout">
          <div className="panel request-form">
            <h2>Review your booking</h2>
            <p className="form-copy">Check the service, addresses, collection time and quote before placing the request.</p>
            <dl className="attest-summary">
              <div><dt>Service</dt><dd>{selectedService?.name}</dd></div>
              <div><dt>Agent</dt><dd>{selectedAgent?.businessName} · {selectedAgent?.address}</dd></div>
              <div><dt>Pickup</dt><dd>{pickupAddress} · {new Date(`${pickupDate}T00:00:00`).toLocaleDateString()} · {pickupSlot}</dd></div>
              <div><dt>Return to</dt><dd>{returnAddress}</dd></div>
              <div><dt>Distance estimate</dt><dd>{pickupDistanceKm} km pickup · {returnDistanceKm} km return</dd></div>
              <div><dt>Processing</dt><dd>{express ? 'Express' : 'Standard'}</dd></div>
            </dl>
            {quote && <div className="attest-price-breakdown">
              <div><span>Attestation service</span><span>{quote.currency} {quote.serviceFee.toFixed(2)}</span></div>
              <div><span>Pickup delivery</span><span>{quote.currency} {quote.pickupDelivery.toFixed(2)}</span></div>
              <div><span>Return delivery</span><span>{quote.currency} {quote.returnDelivery.toFixed(2)}</span></div>
              {quote.expressFee > 0 && <div><span>Express processing</span><span>{quote.currency} {quote.expressFee.toFixed(2)}</span></div>}
              <div><span>Tax</span><span>{quote.currency} {quote.tax.toFixed(2)}</span></div>
              <div className="attest-price-breakdown__total"><strong>Total</strong><strong>{quote.currency} {quote.total.toFixed(2)}</strong></div>
            </div>}
            {error && <p className="quote-error" role="alert">{error}</p>}
            <div className="form-actions">
              <button className="button button--primary" type="button" disabled={submitting} onClick={submitBooking}>{submitting ? 'Placing booking…' : 'Place booking'}</button>
              <button className="button button--quiet" type="button" disabled={submitting} onClick={() => setStep(1)}>Edit details</button>
            </div>
          </div>
          <aside className="request-aside">
            <div className="trust-note"><span className="trust-note__icon" aria-hidden="true">✓</span><strong>Your quote is server-calculated</strong><p>The booking is only created when you place it. We’ll show the reference as soon as the request is confirmed.</p></div>
          </aside>
        </div>
      )}
    </section>
  );
}
