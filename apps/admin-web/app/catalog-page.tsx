'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminApiError, adminRequest } from './admin-api';
import styles from './catalog-page.module.css';

type CatalogService = {
  code: string;
  name: string;
  description: string;
  serviceFee: number;
  estimatedDays: number;
  enabled: boolean;
  requiresOriginals: boolean;
  requiredOriginals: string[];
  supportingDocuments: string[];
};

type PricingRule = { key: string; amount: number; updatedAt: string };
type PartnerServices = {
  shopServices: { id: string; code: string; enabled: boolean; price: number | string; shop: { id: string; name: string; status: string } }[];
  agentServices: { id: string; code: string; name: string; enabled: boolean; price: number | string; estimatedDays: number; agent: { id: string; businessName: string; status: string } }[];
};
type CatalogData = { services: CatalogService[]; pricingRules: PricingRule[] };

const ruleDescriptions: Record<string, string> = {
  PAPER_A4_MULTIPLIER: 'A4 paper multiplier',
  PAPER_A3_MULTIPLIER: 'A3 paper multiplier',
  PAPER_A5_MULTIPLIER: 'A5 paper multiplier',
  BLACK_WHITE_RATE: 'Black-and-white per page',
  COLOUR_RATE: 'Colour per page',
  BINDING_FEE: 'Binding',
  STAPLING_FEE: 'Stapling',
  LAMINATION_PER_PAGE: 'Lamination per printed page',
  DELIVERY_BASE: 'Standard delivery base',
  DELIVERY_PER_KM: 'Standard delivery per kilometre',
  EXPRESS_BASE: 'Express delivery base',
  EXPRESS_PER_KM: 'Express delivery per kilometre',
  SHOP_SERVICE_FEE: 'Shop service fee',
  VOLUME_DISCOUNT_MIN_PAGES: 'Pages before volume discount',
  VOLUME_DISCOUNT_RATE: 'Volume discount rate',
  TAX_RATE: 'Tax rate',
  ATTESTATION_PICKUP_BASE: 'Attestation pickup base',
  ATTESTATION_RETURN_BASE: 'Attestation return base',
  ATTESTATION_DELIVERY_PER_KM: 'Attestation delivery per kilometre',
  ATTESTATION_EXPRESS_FEE: 'Attestation express fee',
  ATTESTATION_TAX_RATE: 'Attestation tax rate',
};

function money(value: number | string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'LKR' }).format(Number(value));
}

function initialForm(): CatalogService {
  return {
    code: '',
    name: '',
    description: '',
    serviceFee: 0,
    estimatedDays: 5,
    enabled: true,
    requiresOriginals: false,
    requiredOriginals: [],
    supportingDocuments: [],
  };
}

export default function PlatformCatalogPage({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [partners, setPartners] = useState<PartnerServices | null>(null);
  const [selectedCode, setSelectedCode] = useState('');
  const [form, setForm] = useState<CatalogService>(initialForm());
  const [adding, setAdding] = useState(false);
  const [ruleValues, setRuleValues] = useState<Record<string, string>>({});
  const [savingRule, setSavingRule] = useState('');
  const [savingService, setSavingService] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      adminRequest<{ data: CatalogData }>('/admin/catalog'),
      adminRequest<{ data: PartnerServices }>('/admin/services'),
    ])
      .then(([catalogResult, partnerResult]) => {
        if (!active) return;
        setCatalog(catalogResult.data);
        setPartners(partnerResult.data);
        setRuleValues(Object.fromEntries(catalogResult.data.pricingRules.map((rule) => [rule.key, String(rule.amount)])));
        setSelectedCode((current) => current && catalogResult.data.services.some((service) => service.code === current)
          ? current
          : catalogResult.data.services[0]?.code ?? '');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'The platform catalogue could not be loaded.');
        if (reason instanceof AdminApiError && reason.status === 401) onSessionExpired();
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey, onSessionExpired]);

  useEffect(() => {
    if (adding || !catalog) return;
    const selected = catalog.services.find((service) => service.code === selectedCode);
    if (selected) setForm({ ...selected });
  }, [catalog, selectedCode, adding]);

  const saveService = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setSavingService(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      serviceFee: Number(form.serviceFee),
      estimatedDays: Number(form.estimatedDays),
      enabled: form.enabled,
      requiresOriginals: form.requiresOriginals,
      requiredOriginals: form.requiredOriginals.map((item) => item.trim()).filter(Boolean),
      supportingDocuments: form.supportingDocuments.map((item) => item.trim()).filter(Boolean),
    };
    try {
      if (adding) {
        await adminRequest('/admin/catalog/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, code: form.code.trim() }),
        });
        setNotice('Global service created.');
        setSelectedCode(form.code.trim());
        setAdding(false);
      } else {
        await adminRequest(`/admin/catalog/services/${encodeURIComponent(form.code)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setNotice('Global service saved.');
      }
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The global service could not be saved.');
      if (reason instanceof AdminApiError && reason.status === 401) onSessionExpired();
    } finally {
      setSavingService(false);
    }
  };

  const savePricingRule = async (rule: PricingRule) => {
    setError('');
    setNotice('');
    setSavingRule(rule.key);
    try {
      await adminRequest(`/admin/catalog/pricing/${encodeURIComponent(rule.key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(ruleValues[rule.key]) }),
      });
      setNotice(`${ruleDescriptions[rule.key] ?? rule.key} saved.`);
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The pricing rule could not be saved.');
      if (reason instanceof AdminApiError && reason.status === 401) onSessionExpired();
    } finally {
      setSavingRule('');
    }
  };

  const cancelAdd = () => {
    setAdding(false);
    setForm(catalog?.services.find((service) => service.code === selectedCode) ?? initialForm());
  };

  return (
    <section className="admin-content">
      <header className="admin-heading">
        <div>
          <h1>Service catalogue</h1>
          <p className="admin-heading__description">Manage platform attestation listings and the rates used by print quotes and orders.</p>
        </div>
        <button className="secondary-action" type="button" disabled={loading} onClick={() => setRefreshKey((key) => key + 1)}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </header>
      {error && <div className="error-notice" role="alert">{error}</div>}
      {notice && <div className="success-notice" role="status">{notice}</div>}

      {loading && !catalog ? <div className="loading-block" aria-live="polite">Loading catalogue settings…</div> : catalog && <>
        <div className={styles.sectionHeading}>
          <div><h2>Global attestation services</h2><p>Enabled services appear in the customer service list and quote flow.</p></div>
          <button className="primary-action" type="button" onClick={() => { setAdding(true); setSelectedCode(''); setForm(initialForm()); setError(''); setNotice(''); }}>Add service</button>
        </div>

        <div className={styles.serviceEditor}>
          <nav className={styles.serviceList} aria-label="Global attestation services">
            {catalog.services.length === 0 && !adding && <p className={styles.emptyList}>No services have been configured.</p>}
            {catalog.services.map((service) => (
              <button
                type="button"
                key={service.code}
                className={`${styles.serviceChoice} ${selectedCode === service.code && !adding ? styles.serviceChoiceActive : ''}`}
                onClick={() => { setAdding(false); setSelectedCode(service.code); }}
              >
                <span><strong>{service.name}</strong><small>{service.code}</small></span>
                <span className={service.enabled ? styles.enabled : styles.disabled}>{service.enabled ? 'Enabled' : 'Disabled'}</span>
              </button>
            ))}
          </nav>

          {adding || selectedCode ? (
            <form className={styles.serviceForm} onSubmit={saveService}>
              <div className={styles.formHeading}>
                <div><h3>{adding ? 'Add a global service' : 'Edit service'}</h3><span>{adding ? 'New services are disabled only if you choose.' : form.code}</span></div>
                <label className={styles.toggle}><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> Enabled</label>
              </div>
              {adding && <label>Service code<input required minLength={3} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="personal-document" /></label>}
              <label>Service name<input required minLength={3} maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>Description<textarea required minLength={1} maxLength={1000} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
              <div className={styles.inlineFields}>
                <label>Service fee (LKR)<input type="number" min="0" max="100000" step="0.01" required value={form.serviceFee} onChange={(event) => setForm({ ...form, serviceFee: Number(event.target.value) })} /></label>
                <label>Estimated days<input type="number" min="1" max="365" step="1" required value={form.estimatedDays} onChange={(event) => setForm({ ...form, estimatedDays: Number(event.target.value) })} /></label>
              </div>
              <label className={styles.toggle}><input type="checkbox" checked={form.requiresOriginals} onChange={(event) => setForm({ ...form, requiresOriginals: event.target.checked })} /> Original documents are required</label>
              <label>Required originals <span>One item per line</span><textarea rows={3} value={form.requiredOriginals.join('\n')} onChange={(event) => setForm({ ...form, requiredOriginals: event.target.value.split('\n') })} /></label>
              <label>Supporting documents <span>One item per line</span><textarea rows={3} value={form.supportingDocuments.join('\n')} onChange={(event) => setForm({ ...form, supportingDocuments: event.target.value.split('\n') })} /></label>
              <div className={styles.actions}>
                <button className="primary-action" type="submit" disabled={savingService}>{savingService ? 'Saving…' : adding ? 'Create service' : 'Save changes'}</button>
                {adding && <button className="secondary-action" type="button" disabled={savingService} onClick={cancelAdd}>Cancel</button>}
              </div>
            </form>
          ) : <div className={styles.emptyEditor}>Select a service to review its customer-facing details.</div>}
        </div>

        <div className={styles.sectionHeading}>
          <div><h2>Print pricing rules</h2><p>These server-side rates are shared by public quotes and customer print-order totals.</p></div>
        </div>
        <div className={styles.pricingTable}>
          {catalog.pricingRules.map((rule) => (
            <form className={styles.pricingRow} key={rule.key} onSubmit={(event) => { event.preventDefault(); void savePricingRule(rule); }}>
              <div><strong>{ruleDescriptions[rule.key] ?? rule.key}</strong><span>{rule.key}</span></div>
              <label><span className="sr-only">{ruleDescriptions[rule.key] ?? rule.key} value</span><input type="number" min="0" max="100000" step={rule.key === 'VOLUME_DISCOUNT_MIN_PAGES' ? '1' : '0.0001'} value={ruleValues[rule.key] ?? ''} onChange={(event) => setRuleValues({ ...ruleValues, [rule.key]: event.target.value })} /></label>
              <button className="table-action" type="submit" disabled={savingRule === rule.key || ruleValues[rule.key] === undefined || Number(ruleValues[rule.key]) === rule.amount}>{savingRule === rule.key ? 'Saving…' : 'Save'}</button>
            </form>
          ))}
        </div>

        {partners && <>
          <h2 className="subsection-title">Provider offerings</h2>
          <p className="operational-note">These are partner-specific records. Global settings above do not overwrite a provider’s own offerings.</p>
          <div className="data-table"><table><thead><tr><th>Service code</th><th>Print shop</th><th>Price</th><th>Availability</th></tr></thead><tbody>
            {partners.shopServices.map((service) => <tr key={service.id}><td><strong>{service.code}</strong></td><td>{service.shop.name}<span className="table-secondary">Shop {service.shop.status.toLowerCase()}</span></td><td>{money(service.price)}</td><td>{service.enabled && service.shop.status === 'APPROVED' ? 'Enabled' : 'Disabled'}</td></tr>)}
            {partners.shopServices.length === 0 && <tr><td colSpan={4}><div className="table-empty"><strong>No print shop offerings configured</strong></div></td></tr>}
          </tbody></table></div>
          <div className="data-table"><table><thead><tr><th>Service</th><th>Attestation agent</th><th>Price</th><th>Estimated days</th><th>Availability</th></tr></thead><tbody>
            {partners.agentServices.map((service) => <tr key={service.id}><td><strong>{service.name}</strong><span className="table-secondary">{service.code}</span></td><td>{service.agent.businessName}</td><td>{money(service.price)}</td><td>{service.estimatedDays}</td><td>{service.enabled && service.agent.status === 'APPROVED' ? 'Enabled' : 'Disabled'}</td></tr>)}
            {partners.agentServices.length === 0 && <tr><td colSpan={5}><div className="table-empty"><strong>No agent offerings configured</strong></div></td></tr>}
          </tbody></table></div>
        </>}
      </>}
    </section>
  );
}
