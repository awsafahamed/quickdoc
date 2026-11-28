'use client';

import { geocodeAddress, type GeocodedAddress as FoundAddress } from '../geocode';
import { ChangeEvent, DragEvent, useEffect, useState } from 'react';

type ViewStep = 1 | 2 | 3;

type PrintConfiguration = {
  pages: number;
  copies: number;
  paperSize: string;
  colour: string;
  sides: string;
  binding: boolean;
  stapling: boolean;
  lamination: boolean;
  deliverySpeed: string;
  distance: number;
};

type Quote = {
  total: number;
  currency: string;
  sheets: number;
  deliveryDistanceKm?: number;
  expiresAt: string;
  shopServiceTotal?: number;
  shopServices?: { code: string; name: string; price: number }[];
};

type Shop = {
  id: string;
  name: string;
  address: string;
  distanceKm: number | null;
  rating: number;
  reviewCount: number;
  estimatedMinutes: number;
  services: { code: string; name: string; description: string; price: number }[];
  printPrices: { paperSize: string; colour: boolean; duplex: boolean; pricePerSide: number }[];
};

type CatalogDocument = {
  id: string;
  name: string;
  description: string;
  sizeBytes: number;
  pageCount: number | null;
  folder: { id: string; name: string } | null;
  shop: { id: string; name: string; address: string; isOpen: boolean; distanceKm: number | null };
};

export type SavedDocument = {
  id: string;
  name: string;
  sizeBytes: number;
  pageCount: number | null;
  createdAt: string;
};

export type PrintOrderSummary = {
  id: string;
  reference: string;
  status: string;
  shopName: string;
};

type GeocodedAddress = FoundAddress & { forAddress: string };
type SavedAddress = { id: string; label: string; line: string; latitude?: number | string | null; longitude?: number | string | null };

function Icon({ name }: { name: 'file' | 'upload' | 'print' | 'arrow' | 'chevron' | 'shield' }) {
  const paths = {
    file: 'M6 2h8l4 4v16H6zM14 2v5h5M9 12h6M9 16h6',
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    print: 'M6 8V3h12v5M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    chevron: 'm9 6 6 6-6 6',
    shield: 'M12 3 20 6v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3zM9 12l2 2 4-4',
  };
  return <svg aria-hidden="true" className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
}

/** Sends a PDF to its private upload link and turns failures into messages people can act on. */
async function uploadPdf(uploadUrl: string, file: File): Promise<void> {
  let response: Response;
  try {
    response = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file });
  } catch {
    throw new Error('We couldn’t reach QuickDoc to upload your PDF. Check your internet connection and try again.');
  }
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { message?: string | string[] } | null;
    const message = Array.isArray(result?.message) ? result?.message.join(' ') : result?.message;
    throw new Error(message || `The PDF could not be uploaded (error ${response.status}). Try again.`);
  }
}

function requireAccessToken(): string {
  const token = window.sessionStorage.getItem('print-attest-access-token');
  // Without an access token the session interceptor renews it from the stored refresh token.
  if (!token && !window.localStorage.getItem('print-attest-refresh-token')) {
    throw new Error('Your sign-in has expired. Sign in again to continue.');
  }
  return token ?? '';
}

async function getApiError(response: Response, fallback: string): Promise<Error> {
  const result = await response.json().catch(() => null) as { message?: string | string[] } | null;
  const message = Array.isArray(result?.message) ? result.message.join(' ') : result?.message;
  return new Error(message || `${fallback} (HTTP ${response.status}).`);
}

function Stepper({ step }: { step: ViewStep }) {
  return (
    <div className="stepper" aria-label={`Step ${step} of 3`}>
      <span className={step >= 1 ? 'stepper__active' : ''}>1</span><span className="stepper__line" />
      <span className={step >= 2 ? 'stepper__active' : ''}>2</span><span className="stepper__line" />
      <span className={step >= 3 ? 'stepper__active' : ''}>3</span>
      <div className="stepper__labels">{['PDF & options', 'Choose a shop', 'Delivery & payment'].map((label, index) => index + 1 === step ? <strong key={label} aria-current="step">{label}</strong> : <span key={label}>{label}</span>)}</div>
    </div>
  );
}

function UploadBox({ onSelect }: { onSelect: (file: File) => void }) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onSelect(file);
  };
  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) onSelect(file);
  };

  return (
    <label className="upload-box" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <span className="upload-box__icon"><Icon name="upload" /></span>
      <strong>Drop your PDF here or browse</strong>
      <span>PDF · Max 25 MB</span>
      <input type="file" accept=".pdf,application/pdf" aria-label="Choose a PDF document" onChange={handleChange} />
    </label>
  );
}

export default function PrintRequestFlow({
  addresses,
  onDocumentSaved,
  onOrderPlaced,
  onBack,
}: {
  addresses: SavedAddress[];
  onDocumentSaved: (document: SavedDocument) => void;
  onOrderPlaced: (order: PrintOrderSummary) => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState<ViewStep>(1);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [savedDocument, setSavedDocument] = useState<SavedDocument | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogDocuments, setCatalogDocuments] = useState<CatalogDocument[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogSelectionId, setCatalogSelectionId] = useState('');
  const [catalogPreviewId, setCatalogPreviewId] = useState('');
  const [customerLocation, setCustomerLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState('');
  const [config, setConfig] = useState<PrintConfiguration>({
    pages: 1,
    copies: 1,
    paperSize: 'A4',
    colour: 'BLACK_WHITE',
    sides: 'SINGLE',
    binding: false,
    stapling: false,
    lamination: false,
    deliverySpeed: 'STANDARD',
    distance: 5,
  });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteState, setQuoteState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopsLoading, setShopsLoading] = useState(false);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [selectedShopServiceCodes, setSelectedShopServiceCodes] = useState<string[]>([]);
  const [addressMode, setAddressMode] = useState<'saved' | 'custom'>(addresses.length ? 'saved' : 'custom');
  const [selectedAddressId, setSelectedAddressId] = useState(addresses[0]?.id ?? '');
  const [customAddress, setCustomAddress] = useState('');
  const [instructions, setInstructions] = useState('');
  const [clientKey, setClientKey] = useState('');
  const selectedSavedAddress = addressMode === 'saved' ? addresses.find((item) => item.id === selectedAddressId) : undefined;
  const savedAddressLocation = selectedSavedAddress?.latitude != null && selectedSavedAddress.longitude != null
    ? { latitude: Number(selectedSavedAddress.latitude), longitude: Number(selectedSavedAddress.longitude) }
    : null;
  const [addressLocation, setAddressLocation] = useState<GeocodedAddress | null>(null);
  const [locatingAddress, setLocatingAddress] = useState(false);
  // Delivery is priced from the shop to this point, so an order needs real coordinates.
  const deliveryLocation = savedAddressLocation
    ?? (addressMode === 'custom' && addressLocation && addressLocation.forAddress === customAddress.trim() ? addressLocation : null)
    ?? customerLocation;
  const locateCustomAddress = async () => {
    setLocationMessage('');
    setLocatingAddress(true);
    try {
      const found = await geocodeAddress(customAddress);
      setAddressLocation({ ...found, forAddress: customAddress.trim() });
      setLocationMessage(`Found: ${found.formattedAddress}. Check this is right before placing your request.`);
    } catch (cause) {
      setLocationMessage(cause instanceof Error ? cause.message : 'Address lookup is unavailable. Use your current location instead.');
    } finally {
      setLocatingAddress(false);
    }
  };

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!catalogOpen) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setCatalogLoading(true);
      setCatalogError('');
      const query = new URLSearchParams({ search: catalogSearch.trim() });
      if (customerLocation) {
        query.set('lat', String(customerLocation.latitude));
        query.set('lng', String(customerLocation.longitude));
      }
      fetch(`${apiBase()}/catalog/documents?${query}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw await getApiError(response, 'Catalogue search failed');
          return response.json() as Promise<{ data: CatalogDocument[] }>;
        })
        .then((result) => setCatalogDocuments(result.data))
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return;
          setCatalogError(cause instanceof Error ? cause.message : 'Catalogue search failed.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setCatalogLoading(false);
        });
    }, 180);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [catalogOpen, catalogSearch, customerLocation]);

  useEffect(() => {
    if (step < 2) return;
    const controller = new AbortController();
    setShopsLoading(true);
    setError('');
    const query = new URLSearchParams({ paperSize: config.paperSize, colour: config.colour });
    if (customerLocation) {
      query.set('lat', String(customerLocation.latitude));
      query.set('lng', String(customerLocation.longitude));
    }
    fetch(`${apiBase()}/shops?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw await getApiError(response, 'Eligible shops could not be loaded');
        return response.json() as Promise<{ data: Shop[] }>;
      })
      .then((result) => setShops(result.data))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Eligible shops could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setShopsLoading(false);
      });
    return () => controller.abort();
  }, [step, config.paperSize, config.colour, customerLocation]);

  useEffect(() => {
    if (step < 2 || !selectedShopId) return;
    const controller = new AbortController();
    setQuote(null);
    setQuoteState('loading');
    setError('');
    fetch(`${apiBase()}/print/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
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
        ...(deliveryLocation ? { deliveryLatitude: deliveryLocation.latitude, deliveryLongitude: deliveryLocation.longitude } : {}),
        shopId: selectedShopId,
        shopServiceCodes: selectedShopServiceCodes,
      }),
    })
      .then(async (response) => {
        if (!response.ok) throw await getApiError(response, 'The selected shop quote could not be calculated');
        return response.json() as Promise<{ data: Quote }>;
      })
      .then((result) => setQuote(result.data))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'The selected shop quote could not be calculated.');
        setQuoteState('error');
      })
      .finally(() => {
        if (!controller.signal.aborted) setQuoteState('idle');
      });
    return () => controller.abort();
  }, [
    step,
    selectedShopId,
    selectedShopServiceCodes,
    config.pages,
    config.copies,
    config.paperSize,
    config.colour,
    config.sides,
    config.binding,
    config.stapling,
    config.lamination,
    config.deliverySpeed,
    config.distance,
    deliveryLocation?.latitude,
    deliveryLocation?.longitude,
  ]);

  const configIsValid = Number.isInteger(config.pages) && config.pages >= 1 && config.pages <= 10000
    && Number.isInteger(config.copies) && config.copies >= 1 && config.copies <= 100;

  const selectFile = async (selectedFile: File) => {
    setError('');
    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Choose a PDF file. Other formats are not supported.');
      return;
    }
    if (selectedFile.size < 1 || selectedFile.size > 25 * 1024 * 1024) {
      setError('The PDF must be smaller than 25 MB.');
      return;
    }
    const signature = new TextDecoder().decode(await selectedFile.slice(0, 5).arrayBuffer());
    if (signature !== '%PDF-') {
      setError('This file does not have a valid PDF signature. Choose a different file.');
      return;
    }
    setFile(selectedFile);
    setSavedDocument(null);
    setQuote(null);
    // Upload straight away so pricing uses the page count QuickDoc reads from the PDF itself.
    setBusy(true);
    try {
      await uploadDocument(selectedFile);
    } catch (cause) {
      setFile(null);
      setError(cause instanceof TypeError
        ? 'We couldn’t reach QuickDoc to upload your PDF. Check your internet connection and try again in a moment.'
        : cause instanceof Error ? cause.message : 'The PDF could not be uploaded. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const requestCustomerLocation = () => {
    setLocationMessage('');
    if (!navigator.geolocation) {
      setLocationMessage('Location is not available here. Search by document, shop, or area instead.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCustomerLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setLocationMessage(step === 3 ? 'Delivery location set. Your total has been updated for this location.' : 'Showing the closest matching documents and shops first.');
      },
      () => setLocationMessage('Location access was not available. Search by document, shop, or area instead.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const previewCatalogDocument = async (catalogDocument: CatalogDocument) => {
    const previewWindow = window.open('about:blank', '_blank');
    if (!previewWindow) {
      setCatalogError('Allow pop-ups to preview this catalogue PDF.');
      return;
    }
    setCatalogPreviewId(catalogDocument.id);
    setCatalogError('');
    try {
      const response = await fetch(`${apiBase()}/catalog/documents/${catalogDocument.id}/preview-url`);
      if (!response.ok) throw await getApiError(response, 'Document preview could not be opened');
      const result = await response.json() as { data: { previewUrl: string } };
      previewWindow.location.replace(result.data.previewUrl);
    } catch (cause) {
      previewWindow.close();
      setCatalogError(cause instanceof Error ? cause.message : 'Document preview could not be opened.');
    } finally {
      setCatalogPreviewId('');
    }
  };

  const selectCatalogDocument = async (catalogDocument: CatalogDocument) => {
    setCatalogSelectionId(catalogDocument.id);
    setCatalogError('');
    try {
      const token = requireAccessToken();
      const response = await fetch(`${apiBase()}/customer/catalog/${catalogDocument.id}/select`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw await getApiError(response, 'This catalogue document could not be selected');
      const result = await response.json() as { data: SavedDocument };
      setSavedDocument(result.data);
      setFile(null);
      setQuote(null);
      if (result.data.pageCount) setConfig((current) => ({ ...current, pages: result.data.pageCount ?? current.pages }));
      onDocumentSaved(result.data);
      setCatalogOpen(false);
    } catch (cause) {
      setCatalogError(cause instanceof Error ? cause.message : 'This catalogue document could not be selected.');
    } finally {
      setCatalogSelectionId('');
    }
  };

  const hasPrintDocument = Boolean(file || savedDocument);

  const updateConfig = <K extends keyof PrintConfiguration>(key: K, value: PrintConfiguration[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
    setQuote(null);
  };

  const requestQuote = async () => {
    if (!configIsValid || !hasPrintDocument) return;
    setQuoteState('loading');
    setQuote(null);
    setError('');
    try {
      const response = await fetch(`${apiBase()}/print/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      });
      if (!response.ok) throw await getApiError(response, 'A live quote is unavailable');
      const result = await response.json() as { data: Quote };
      setQuote(result.data);
      setQuoteState('idle');
    } catch (cause) {
      setQuoteState('error');
      setError(cause instanceof Error ? cause.message : 'A live quote is unavailable. Try again.');
    }
  };

  const uploadDocument = async (selected: File | null = file): Promise<SavedDocument> => {
    if (!selected) {
      if (savedDocument) return savedDocument;
      throw new Error('Choose a PDF before continuing.');
    }
    if (savedDocument && savedDocument.name === selected.name && savedDocument.sizeBytes === selected.size) {
      return savedDocument;
    }
    const file = selected;

    const token = requireAccessToken();
    const api = apiBase();
    const uploadRequest = await fetch(`${api}/customer/documents/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: file.name, mimeType: 'application/pdf', sizeBytes: file.size }),
    });
    if (!uploadRequest.ok) throw await getApiError(uploadRequest, 'Secure upload could not be started');
    const upload = await uploadRequest.json() as { data: { objectKey: string; uploadUrl: string } };
    await uploadPdf(upload.data.uploadUrl, file);

    const saveResponse = await fetch(`${api}/customer/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: file.name,
        mimeType: 'application/pdf',
        sizeBytes: file.size,
        objectKey: upload.data.objectKey,
      }),
    });
    if (!saveResponse.ok) throw await getApiError(saveResponse, 'The uploaded document could not be saved');
    const result = await saveResponse.json() as { data: SavedDocument };
    setSavedDocument(result.data);
    if (result.data.pageCount) setConfig((current) => ({ ...current, pages: result.data.pageCount ?? current.pages }));
    onDocumentSaved(result.data);
    return result.data;
  };

  const continueToShops = async () => {
    if (!quote || !hasPrintDocument || !configIsValid || Date.parse(quote.expiresAt) <= Date.now()) {
      setError('Choose a PDF, check the page and copy counts, and request a current quote.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await uploadDocument();
      setStep(2);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The document could not be uploaded. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const placeOrder = async () => {
    const shop = shops.find((item) => item.id === selectedShopId);
    const savedAddress = addresses.find((item) => item.id === selectedAddressId);
    const deliveryAddress = addressMode === 'saved' ? savedAddress?.line ?? '' : customAddress.trim();
    if (!shop || !savedDocument || !quote || deliveryAddress.length < 5) {
      setError('Choose an eligible shop and enter a complete delivery address.');
      return;
    }
    if (!deliveryLocation) {
      setError('Share your delivery location so the rider can find you and delivery can be priced accurately.');
      return;
    }
    if (Date.parse(quote.expiresAt) <= Date.now()) {
      setError('Your quote expired. Return to print options and request a new quote.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const token = requireAccessToken();
      const key = clientKey || window.crypto.randomUUID();
      setClientKey(key);
      const response = await fetch(`${apiBase()}/customer/orders/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          shopId: shop.id,
          documentId: savedDocument.id,
          paperSize: config.paperSize,
          colour: config.colour === 'COLOUR',
          duplex: config.sides === 'DUPLEX',
          copies: config.copies,
          binding: config.binding,
          stapling: config.stapling,
          lamination: config.lamination,
          deliverySpeed: config.deliverySpeed,
          deliveryDistanceKm: config.distance,
          shopServiceCodes: selectedShopServiceCodes,
          deliveryAddress,
          deliveryLatitude: deliveryLocation.latitude,
          deliveryLongitude: deliveryLocation.longitude,
          expectedTotal: quote.total,
          instructions: instructions.trim() || undefined,
          clientKey: key,
        }),
      });
      if (!response.ok) throw await getApiError(response, 'Your print request could not be placed');
      const result = await response.json() as { data: { id: string; reference: string; status: string } };
      onOrderPlaced({ ...result.data, shopName: shop.name });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your print request could not be placed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const backToDashboard = <button className="back-link" type="button" onClick={onBack}><span>←</span> Back to dashboard</button>;

  if (step === 2) {
    return (
      <section className="request-page">
        <button className="back-link" type="button" onClick={() => setStep(1)}><span>←</span> Back to print options</button>
        <div className="request-heading"><h1>Choose a print shop.</h1><p>Only shops eligible for your selected paper and colour options are shown.</p></div>
        <Stepper step={2} />
        <div className="shop-layout">
          <div>
            <div className="shop-toolbar"><strong>{shopsLoading ? 'Finding eligible shops…' : `${shops.length} eligible shops`}</strong><span>Distance and turnaround are estimates</span></div>
            {shops.map((shop) => {
              const printPrice = shop.printPrices.find((price) =>
                price.paperSize === config.paperSize
                && price.colour === (config.colour === 'COLOUR')
                && price.duplex === (config.sides === 'DUPLEX'));
              return <button className={`shop-card ${selectedShopId === shop.id ? 'shop-card--selected' : ''}`} key={shop.id} type="button" aria-pressed={selectedShopId === shop.id} onClick={() => {
                if (selectedShopId !== shop.id) {
                  setSelectedShopId(shop.id);
                  setSelectedShopServiceCodes([]);
                  setQuote(null);
                }
              }}>
                <span className="shop-card__mark"><Icon name="print" /></span>
                <span className="shop-card__body"><strong>{shop.name}</strong><span>{shop.address}{shop.distanceKm !== null ? ` · ${shop.distanceKm.toFixed(1)} km` : ''}</span><span className="shop-card__meta">Rating {shop.rating} ({shop.reviewCount} reviews) · About {shop.estimatedMinutes} min</span>{printPrice && <span className="shop-card__meta">LKR {printPrice.pricePerSide.toFixed(2)} per printed side</span>}{shop.services.length > 0 && <span className="shop-card__meta">{shop.services.length} customer-selected add-on{shop.services.length === 1 ? '' : 's'}</span>}</span>
                <span className="shop-card__check">{selectedShopId === shop.id ? 'Selected' : 'Choose'}</span>
              </button>;
            })}
            {shops.find((shop) => shop.id === selectedShopId)?.services.length ? <div className="shop-service-selection">
              <h3>Optional shop services</h3>
              <p>These one-time fees are added to your order and shown in the updated quote.</p>
              {shops.find((shop) => shop.id === selectedShopId)!.services.map((service) => (
                <label key={service.code}>
                  <input type="checkbox" checked={selectedShopServiceCodes.includes(service.code)} disabled={quoteState === 'loading'} onChange={(event) => {
                    setSelectedShopServiceCodes((current) => event.target.checked
                      ? [...current, service.code]
                      : current.filter((code) => code !== service.code));
                    setQuote(null);
                  }} />
                  <span><strong>{service.name}</strong>{service.description && <small>{service.description}</small>}</span>
                  <strong>LKR {service.price.toFixed(2)}</strong>
                </label>
              ))}
            </div> : null}
            {!shopsLoading && !shops.length && !error && <div className="empty-panel"><span className="empty-panel__icon"><Icon name="print" /></span><h3>No eligible shops found</h3><p>Try a different print setup. Your document has not been sent to a shop.</p></div>}
            {error && <p className="flow-error" role="alert">{error}</p>}
          </div>
          <aside className="shop-summary panel">
            <p className="section-label">Print summary</p><h2>{quoteState === 'loading' ? 'Updating quote…' : `${quote?.currency ?? 'LKR'} ${quote?.total.toFixed(2) ?? '—'}`}</h2>
            <span>{config.pages} pages · {config.copies} {config.copies === 1 ? 'copy' : 'copies'}</span>
            <div className="summary-rule" />
            <small>{config.paperSize} · {config.colour === 'COLOUR' ? 'Colour' : 'Black & white'} · {config.sides === 'DUPLEX' ? 'Double-sided' : 'Single-sided'}</small>
            {(savedDocument || file) && <div className="checkout-document"><Icon name="file" /><span><strong>{savedDocument?.name ?? file?.name}</strong><small>PDF stored privately</small></span></div>}
            {error && <p className="flow-error" role="alert">{error}</p>}
            <button className="button button--primary" type="button" disabled={!selectedShopId || !quote || quoteState === 'loading'} onClick={() => { setError(''); setStep(3); }}>Continue to delivery <Icon name="arrow" /></button>
          </aside>
        </div>
      </section>
    );
  }

  if (step === 3) {
    const selectedShop = shops.find((shop) => shop.id === selectedShopId);
    return (
      <section className="request-page">
        <button className="back-link" type="button" disabled={busy} onClick={() => setStep(2)}><span>←</span> Back to shop selection</button>
        <div className="request-heading"><h1>Review your print request.</h1><p>Confirm where to deliver it. The shop must accept your request before printing starts.</p></div>
        <Stepper step={3} />
        <div className="request-layout">
          <div className="panel request-form">
            <h2>Delivery details</h2>
            {addresses.length > 0 && <div className="address-choice"><label className="field-label">Delivery address<select value={addressMode === 'custom' ? 'custom' : selectedAddressId} onChange={(event) => {
              if (event.target.value === 'custom') setAddressMode('custom');
              else { setAddressMode('saved'); setSelectedAddressId(event.target.value); }
            }}><option value="custom">Enter a different address</option>{addresses.map((address) => <option value={address.id} key={address.id}>{address.label} · {address.line}</option>)}</select></label></div>}
            {(!addresses.length || addressMode === 'custom') && <label className="field-label">Delivery address<textarea rows={3} value={customAddress} onChange={(event) => setCustomAddress(event.target.value)} placeholder="Building, street and area" /></label>}
            <div className="delivery-location">
              <strong>Delivery location</strong>
              {savedAddressLocation
                ? <span>Using the location saved with this address.</span>
                : deliveryLocation && deliveryLocation !== customerLocation
                  ? <span>Using the map location found for this address.</span>
                  : customerLocation
                  ? <span>Using your current location ({customerLocation.latitude.toFixed(4)}, {customerLocation.longitude.toFixed(4)}).</span>
                  : <span>Required so the rider can find you and delivery is priced by real distance.</span>}
              {!savedAddressLocation && addressMode === 'custom' && <button className="button button--secondary button--small" type="button" disabled={busy || locatingAddress || customAddress.trim().length < 5} onClick={() => void locateCustomAddress()}>{locatingAddress ? 'Finding…' : 'Find this address on the map'}</button>}
              {!savedAddressLocation && <button className="button button--secondary button--small" type="button" disabled={busy} onClick={requestCustomerLocation}>{customerLocation ? 'Update my location' : 'Use my current location'}</button>}
              {locationMessage && <small role="status">{locationMessage}</small>}
            </div>
            {quote && <p className="checkout-note">Delivery distance: {quote.deliveryDistanceKm ?? config.distance} km from the shop.</p>}
            <div className="payment-method" role="radiogroup" aria-label="Payment method">
              <strong>Payment</strong>
              <label className="payment-option payment-option--selected">
                <input type="radio" name="payment-method" value="CASH_ON_DELIVERY" checked readOnly />
                <span><strong>Cash on delivery</strong><small>Pay the rider {quote ? `${quote.currency} ${quote.total.toFixed(2)}` : 'the order total'} when your documents arrive. Nothing is charged before then.</small></span>
              </label>
            </div>
            <label className="field-label">Delivery instructions <span className="field-label__optional">Optional</span><textarea rows={3} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Gate code, landmarks or other helpful details" /></label>
            {error && <p className="flow-error" role="alert">{error}</p>}
            <div className="form-actions"><button className="button button--primary" type="button" disabled={busy || !selectedShop || !deliveryLocation} onClick={placeOrder}>{busy ? 'Placing request…' : quote ? `Place request · ${quote.currency} ${quote.total.toFixed(2)}` : 'Place print request'} <Icon name="arrow" /></button><button className="button button--quiet" type="button" onClick={onBack}>Return to dashboard</button></div>
            <p className="checkout-note">You can cancel until the shop starts printing. After you place the request, your delivery PIN appears in My orders; give it to the rider only when you receive your documents.</p>
          </div>
          <aside className="shop-summary panel">
            <p className="section-label">Order review</p><h2>{quote?.currency} {quote?.total.toFixed(2)}</h2>
            <span>{selectedShop?.name ?? 'Selected shop'}</span>
            {quote?.shopServices?.map((service) => <span className="shop-summary__service" key={service.code}>{service.name} · LKR {service.price.toFixed(2)}</span>)}
            <div className="summary-rule" />
            <small>{config.pages} pages · {config.copies} copies · {config.paperSize} · {config.deliverySpeed === 'EXPRESS' ? 'Express delivery' : 'Standard delivery'}</small>
            {(savedDocument || file) && <div className="checkout-document"><Icon name="file" /><span><strong>{savedDocument?.name ?? file?.name}</strong><small>PDF · {Math.ceil((savedDocument?.sizeBytes ?? file?.size ?? 0) / 1024)} KB</small></span></div>}
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section className="request-page">
      {backToDashboard}
      <div className="request-heading"><h1>Print and deliver a document.</h1><p>Preview your PDF, choose print options and compare nearby eligible shops.</p></div>
      <Stepper step={1} />
      <div className="request-layout">
        <div className="panel request-form">
          <div className="document-source-tabs" role="tablist" aria-label="Choose a document source">
            <button type="button" role="tab" aria-selected={!catalogOpen} className={!catalogOpen ? 'selected' : ''} onClick={() => { setCatalogOpen(false); setError(''); }}>Upload your PDF</button>
            <button type="button" role="tab" aria-selected={catalogOpen} className={catalogOpen ? 'selected' : ''} onClick={() => { setCatalogOpen(true); setError(''); }}>Browse shop catalogue</button>
          </div>
          {catalogOpen ? <div className="catalog-browser">
            <h2>Find a document to print</h2>
            <p className="form-copy">Search published papers and forms across approved shops, then choose a PDF to add to your print request.</p>
            <div className="catalog-search-row"><label className="field-label">Search documents, folders, shops or areas<input type="search" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="e.g. Grade 10 science, past papers, Colombo" /></label><button className="button button--secondary" type="button" onClick={requestCustomerLocation}>Use my location</button></div>
            {locationMessage && <p className="catalog-location-message" role="status">{locationMessage}</p>}
            {catalogError && <p className="flow-error" role="alert">{catalogError}</p>}
            {catalogLoading ? <div className="catalog-results-loading" role="status">Searching shop catalogues…</div> : catalogDocuments.length ? <div className="catalog-results">{catalogDocuments.map((catalogDocument) => <article className="catalog-result" key={catalogDocument.id}>
              <span className="catalog-result-mark">PDF</span>
              <div className="catalog-result-copy"><strong>{catalogDocument.name}</strong><span>{catalogDocument.folder?.name ?? 'Shop catalogue'} · {catalogDocument.shop.name}</span><small>{catalogDocument.shop.address}{catalogDocument.shop.distanceKm !== null ? ` · ${catalogDocument.shop.distanceKm} km away` : ''}</small>{catalogDocument.description && <small>{catalogDocument.description}</small>}<small>{catalogDocument.pageCount ? `${catalogDocument.pageCount} pages · ` : ''}{Math.ceil(catalogDocument.sizeBytes / 1024)} KB · {catalogDocument.shop.isOpen ? 'Accepting orders' : 'Currently closed'}</small></div>
              <div className="catalog-result-actions"><button className="text-button" type="button" disabled={catalogPreviewId === catalogDocument.id} onClick={() => void previewCatalogDocument(catalogDocument)}>{catalogPreviewId === catalogDocument.id ? 'Opening…' : 'Preview'}</button><button className="button button--primary button--small" type="button" disabled={!catalogDocument.shop.isOpen || Boolean(catalogSelectionId)} onClick={() => void selectCatalogDocument(catalogDocument)}>{catalogSelectionId === catalogDocument.id ? 'Adding…' : 'Select to print'}</button></div>
            </article>)}</div> : <div className="empty-panel"><h3>No matching documents</h3><p>Try a different search or ask a nearby shop to add the document you need.</p></div>}
          </div> : <>
          <h2>Upload your PDF</h2><p className="form-copy">Your document stays private. It is shared with the selected shop only after you place a request.</p>
          {savedDocument && !file ? <div className="uploaded-file"><span className="uploaded-file__icon"><Icon name="file" /></span><span><strong>{savedDocument.name}</strong><small>Private copy added from a shop catalogue</small></span><button type="button" aria-label="Remove selected catalogue document" onClick={() => { setSavedDocument(null); setQuote(null); setError(''); }}>×</button></div> : file ? (
            <div className="pdf-uploaded">
              <div className="uploaded-file"><span className="uploaded-file__icon"><Icon name="file" /></span><span><strong>{file.name}</strong><small>{Math.ceil(file.size / 1024)} KB · PDF ready to preview</small></span><button type="button" aria-label="Remove PDF" disabled={busy || quoteState === 'loading'} onClick={() => { setFile(null); setSavedDocument(null); setQuote(null); setError(''); }}>×</button></div>
              {previewUrl && <div className="pdf-preview"><div className="pdf-preview__bar"><strong>Document preview</strong><a href={previewUrl} target="_blank" rel="noreferrer">Open full preview</a></div><iframe title={`Preview of ${file.name}`} src={previewUrl} /></div>}
            </div>
          ) : <UploadBox onSelect={(selectedFile) => { void selectFile(selectedFile); }} />}
          {error && <p className="flow-error" role="alert">{error}</p>}
          <div className="form-divider" />
          <div className="print-options">
            <label className="field-label">Pages in PDF<input type="number" min="1" max="10000" step="1" readOnly={Boolean(savedDocument?.pageCount)} disabled={busy || quoteState === 'loading' || !savedDocument} value={savedDocument?.pageCount ?? config.pages} onChange={(event) => updateConfig('pages', Number(event.target.value))} aria-describedby="page-count-help" /><small id="page-count-help">{savedDocument?.pageCount ? 'Counted from your PDF' : busy ? 'Counting pages…' : 'Counted after upload'}</small></label>
            <label className="field-label">Copies<input type="number" min="1" max="100" step="1" disabled={busy || quoteState === 'loading'} value={config.copies} onChange={(event) => updateConfig('copies', Number(event.target.value))} /></label>
            <label className="field-label">Paper size<select disabled={busy || quoteState === 'loading'} value={config.paperSize} onChange={(event) => updateConfig('paperSize', event.target.value)}><option value="A4">A4</option><option value="A3">A3</option><option value="A5">A5</option></select></label>
            <label className="field-label">Colour<select disabled={busy || quoteState === 'loading'} value={config.colour} onChange={(event) => updateConfig('colour', event.target.value)}><option value="BLACK_WHITE">Black & white</option><option value="COLOUR">Colour</option></select></label>
            <label className="field-label">Sides<select disabled={busy || quoteState === 'loading'} value={config.sides} onChange={(event) => updateConfig('sides', event.target.value)}><option value="SINGLE">Single-sided</option><option value="DUPLEX">Double-sided</option></select></label>
            <label className="field-label">Delivery<select disabled={busy || quoteState === 'loading'} value={config.deliverySpeed} onChange={(event) => updateConfig('deliverySpeed', event.target.value)}><option value="STANDARD">Standard</option><option value="EXPRESS">Express</option></select></label>
            <div className="option-toggles"><label><input type="checkbox" disabled={busy || quoteState === 'loading'} checked={config.binding} onChange={(event) => updateConfig('binding', event.target.checked)} /> Binding</label><label><input type="checkbox" disabled={busy || quoteState === 'loading'} checked={config.stapling} onChange={(event) => updateConfig('stapling', event.target.checked)} /> Stapling</label><label><input type="checkbox" disabled={busy || quoteState === 'loading'} checked={config.lamination} onChange={(event) => updateConfig('lamination', event.target.checked)} /> Lamination</label></div>
            <button className="button button--secondary quote-button" type="button" disabled={!hasPrintDocument || !configIsValid || quoteState === 'loading'} onClick={requestQuote}>{quoteState === 'loading' ? 'Calculating live quote…' : 'Get live quote'} <Icon name="arrow" /></button>
            {quoteState === 'error' && !error && <p className="quote-error">The pricing service is unavailable. Check your connection and try again.</p>}
            {quote && <div className="quote-result"><span><strong>{quote.currency} {quote.total.toFixed(2)}</strong><small>{quote.sheets} physical sheets · Expires {new Date(quote.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span><span className="quote-result__ready">Live quote</span></div>}
          </div>
          <div className="form-actions"><button className="button button--primary" type="button" disabled={!quote || !hasPrintDocument || !configIsValid || busy} onClick={continueToShops}>{busy ? file ? 'Uploading PDF securely…' : 'Preparing document…' : 'Continue to shops'} <Icon name="arrow" /></button><button className="button button--quiet" type="button" disabled={busy} onClick={onBack}>Return to dashboard</button></div>
          </>}
        </div>
        <aside className="request-aside"><div className="trust-note"><span className="trust-note__icon"><Icon name="shield" /></span><strong>Private by design</strong><p>Your PDF is stored in a private bucket. Shops receive short-lived access only for orders you place.</p></div><div className="request-help"><span>Need help?</span><button type="button" disabled={busy} onClick={onBack}>Return to dashboard</button></div></aside>
      </div>
    </section>
  );
}
