import React, { useState, useEffect, useCallback } from 'react';
import {
  Tag,
  CurrencyDollar,
  Calculator,
  FileText,
  CheckCircle,
  WarningCircle,
  X,
  Truck,
  Info,
  ShieldCheck,
  ArrowsLeftRight,
  Clock,
  Check,
  CaretRight,
  CaretLeft,
  ArrowClockwise,
  Plus,
  DownloadSimple,
  Pen,
  ChartBar,
  Scales,
  Buildings,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import {
  getQuotes,
  getQuote,
  createQuote,
  bookQuote,
  getQuoteComparison,
  getRateAgreements,
  getRateAgreement,
  createRateAgreement,
  updateRateAgreement,
  deleteRateAgreement,
  getLaneRateHistory,
  generateRateConfirmation,
  getShipmentRateConfirmation,
  getRateConfirmation,
  signRateConfirmation,
  downloadRateConfirmationDocument,
  getShipments,
  getVendors,
} from './api';
import './styles/quotingRate.css';

const FREIGHT_CLASSES = [
  50, 55, 60, 65, 70, 77.5, 85, 92.5, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500,
];

const STANDARD_ACCESSORIALS = [
  { id: 'liftgate', name: 'Liftgate Service', defaultAmount: '$50.00 flat', rateUnit: 'flat' },
  { id: 'residential_delivery', name: 'Residential Delivery', defaultAmount: '$65.00 flat', rateUnit: 'flat' },
  { id: 'inside_delivery', name: 'Inside Delivery', defaultAmount: '$75.00 flat', rateUnit: 'flat' },
  { id: 'hazmat_surcharge', name: 'Hazmat Surcharge', defaultAmount: '$150.00 flat', rateUnit: 'flat' },
  { id: 'detention', name: 'Detention (2 hrs free)', defaultAmount: '$75.00 / hr', rateUnit: 'hourly', requiresInput: 'hours' },
  { id: 'layover', name: 'Layover', defaultAmount: '$350.00 / day', rateUnit: 'daily', requiresInput: 'days' },
  { id: 'storage', name: 'Storage', defaultAmount: '$45.00 / day', rateUnit: 'daily', requiresInput: 'days' },
];

export default function QuoteRateManagement({
  hasPermission,
  notify,
  currentUser,
  currentRoleName,
  currentOrg,
}) {
  const [activeTab, setActiveTab] = useState('quotes');

  // Quotes Tab State
  const [quotes, setQuotes] = useState([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [quotesPage, setQuotesPage] = useState(1);
  const [quotesTotalPages, setQuotesTotalPages] = useState(1);
  const [quotesTotal, setQuotesTotal] = useState(0);
  const [quoteSearch, setQuoteSearch] = useState('');
  const [quoteStatusFilter, setQuoteStatusFilter] = useState('');
  const [quoteServiceTypeFilter, setQuoteServiceTypeFilter] = useState('');

  // Modals & Selections
  const [showNewQuoteModal, setShowNewQuoteModal] = useState(false);
  const [selectedQuoteDetail, setSelectedQuoteDetail] = useState(null);
  const [bookingQuote, setBookingQuote] = useState(null);

  // Rate Agreements Tab State
  const [agreements, setAgreements] = useState([]);
  const [loadingAgreements, setLoadingAgreements] = useState(false);
  const [agreementsPage, setAgreementsPage] = useState(1);
  const [agreementsTotalPages, setAgreementsTotalPages] = useState(1);
  const [agreementsTotal, setAgreementsTotal] = useState(0);
  const [agreementSearch, setAgreementSearch] = useState('');
  const [agreementStatusFilter, setAgreementStatusFilter] = useState('');
  const [showNewAgreementModal, setShowNewAgreementModal] = useState(false);
  const [editingAgreement, setEditingAgreement] = useState(null);

  // Multi-Carrier Quote Comparison Tab State
  const [shipmentsList, setShipmentsList] = useState([]);
  const [selectedComparisonShipmentId, setSelectedComparisonShipmentId] = useState('');
  const [comparisonData, setComparisonData] = useState(null);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [comparisonError, setComparisonError] = useState('');

  // Rate Confirmations Tab State
  const [selectedRcShipmentId, setSelectedRcShipmentId] = useState('');
  const [currentConfirmation, setCurrentConfirmation] = useState(null);
  const [loadingConfirmation, setLoadingConfirmation] = useState(false);
  const [confirmationError, setConfirmationError] = useState('');
  const [showGenerateRcModal, setShowGenerateRcModal] = useState(false);
  const [showSignRcModal, setShowSignRcModal] = useState(false);

  // Lane Rate History Tab State
  const [historyOrigin, setHistoryOrigin] = useState('');
  const [historyDest, setHistoryDest] = useState('');
  const [historyServiceType, setHistoryServiceType] = useState('ftl');
  const [historyEquipmentType, setHistoryEquipmentType] = useState('Dry Van');
  const [laneHistoryData, setLaneHistoryData] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');

  // Carriers/Vendors list for selectors
  const [carriers, setCarriers] = useState([]);

  // Check RBAC Permissions
  const isPlatformAdmin = currentRoleName === 'Platform Admin';
  const isCompanyAdmin = currentRoleName === 'Company Admin';
  const isShipper = currentRoleName === 'Shipper User' || currentOrg?.type === 'shipper';
  const isCarrier = currentRoleName === 'Dispatcher' || currentOrg?.type === 'carrier';
  const isDriver = currentRoleName === 'Driver';

  const canCreateQuote = !isDriver && (isPlatformAdmin || isCompanyAdmin || isShipper || hasPermission?.('quotes', 'create'));
  const canBookQuote = !isDriver && (isPlatformAdmin || isCompanyAdmin || isShipper || hasPermission?.('quotes', 'create'));
  const canManageAgreements = !isDriver && (isPlatformAdmin || isCompanyAdmin || isShipper || hasPermission?.('rate_agreements', 'create'));
  const canSignConfirmation = !isDriver && (isPlatformAdmin || isCompanyAdmin || isCarrier || hasPermission?.('rate_confirmations', 'sign'));
  const canCreateConfirmation = !isDriver && (isPlatformAdmin || isCompanyAdmin || isShipper || hasPermission?.('rate_confirmations', 'create'));

  // Load Shipments & Carriers
  useEffect(() => {
    getShipments({ limit: 100 })
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setShipmentsList(list);
      })
      .catch((err) => {
        console.warn('Could not preload shipments:', err);
      });

    getVendors()
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res?.items) ? res.items : [];
        setCarriers(list);
      })
      .catch((err) => {
        console.warn('Could not preload vendors/carriers:', err);
      });
  }, []);

  // Fetch Quotes
  const fetchQuotes = useCallback(async () => {
    setLoadingQuotes(true);
    try {
      const params = {
        page: quotesPage,
        limit: 20,
        search: quoteSearch.trim() || undefined,
        status: quoteStatusFilter || undefined,
        service_type: quoteServiceTypeFilter || undefined,
      };
      const res = await getQuotes(params);
      const list = res?.data || [];
      setQuotes(list);
      if (res?.pagination) {
        setQuotesTotal(res.pagination.total || list.length);
        setQuotesTotalPages(res.pagination.totalPages || 1);
      } else {
        setQuotesTotal(list.length);
        setQuotesTotalPages(1);
      }
    } catch (err) {
      console.error('Failed to load quotes:', err);
      notify?.(err.message || 'Failed to load quotes from server');
    } finally {
      setLoadingQuotes(false);
    }
  }, [quotesPage, quoteSearch, quoteStatusFilter, quoteServiceTypeFilter, notify]);

  // Fetch Rate Agreements
  const fetchAgreements = useCallback(async () => {
    setLoadingAgreements(true);
    try {
      const params = {
        page: agreementsPage,
        limit: 20,
        search: agreementSearch.trim() || undefined,
        status: agreementStatusFilter || undefined,
      };
      const res = await getRateAgreements(params);
      const list = res?.data || [];
      setAgreements(list);
      if (res?.pagination) {
        setAgreementsTotal(res.pagination.total || list.length);
        setAgreementsTotalPages(res.pagination.totalPages || 1);
      } else {
        setAgreementsTotal(list.length);
        setAgreementsTotalPages(1);
      }
    } catch (err) {
      console.error('Failed to load rate agreements:', err);
      notify?.(err.message || 'Failed to load rate agreements from server');
    } finally {
      setLoadingAgreements(false);
    }
  }, [agreementsPage, agreementSearch, agreementStatusFilter, notify]);

  useEffect(() => {
    if (activeTab === 'quotes') {
      fetchQuotes();
    } else if (activeTab === 'agreements') {
      fetchAgreements();
    }
  }, [activeTab, fetchQuotes, fetchAgreements]);

  // Handle Multi-Carrier Comparison
  const handleRunComparison = async (shipmentId) => {
    if (!shipmentId) return;
    setLoadingComparison(true);
    setComparisonError('');
    setComparisonData(null);
    try {
      const res = await getQuoteComparison(shipmentId);
      setComparisonData(res?.data || null);
    } catch (err) {
      console.error('Comparison error:', err);
      setComparisonError(err.message || 'Failed to compare carrier quotes');
    } finally {
      setLoadingComparison(false);
    }
  };

  // Handle Fetch Rate Confirmation for Shipment
  const handleFetchConfirmation = async (shipmentId) => {
    if (!shipmentId) return;
    setLoadingConfirmation(true);
    setConfirmationError('');
    setCurrentConfirmation(null);
    try {
      const res = await getShipmentRateConfirmation(shipmentId);
      setCurrentConfirmation(res?.data || null);
    } catch (err) {
      console.error('Fetch RC error:', err);
      setConfirmationError(err.message || 'Rate confirmation not found for this shipment');
    } finally {
      setLoadingConfirmation(false);
    }
  };

  // Handle Lane History Query
  const handleRunLaneHistory = async (e) => {
    e?.preventDefault();
    if (!historyOrigin.trim() || !historyDest.trim()) {
      notify?.('Please enter both origin and destination');
      return;
    }
    setLoadingHistory(true);
    setHistoryError('');
    setLaneHistoryData(null);
    try {
      const res = await getLaneRateHistory({
        origin: historyOrigin.trim(),
        dest: historyDest.trim(),
        service_type: historyServiceType || undefined,
        equipment_type: historyEquipmentType || undefined,
      });
      setLaneHistoryData(res?.data || null);
    } catch (err) {
      console.error('Lane history error:', err);
      setHistoryError(err.message || 'Failed to retrieve lane rate history');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Handle Book Quote Action
  const handleConfirmBookQuote = async () => {
    if (!bookingQuote) return;
    try {
      await bookQuote(bookingQuote.id);
      notify?.(`Quote ${bookingQuote.quote_number || '#' + bookingQuote.id} successfully booked!`);
      setBookingQuote(null);
      fetchQuotes();
    } catch (err) {
      console.error('Book quote error:', err);
      notify?.(err.message || 'Failed to book quote');
    }
  };

  // Format Currency
  const formatMoney = (val) => {
    if (val === null || val === undefined || val === '') return '$0.00';
    const num = Number(val);
    return isNaN(num) ? String(val) : `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="qr-container">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="qr-header">
        <div className="qr-header-titles">
          <h1>
            <Tag size={28} weight="duotone" style={{ color: '#0284c7' }} />
            Quoting & Rate Management
          </h1>
          <p>
            Generate instant spot quotes, manage contract rate agreements, calculate LTL tariffs, compare multi-carrier quotes, and execute electronic rate confirmations.
          </p>
        </div>
        <div className="qr-header-actions">
          {activeTab === 'quotes' && canCreateQuote && (
            <button
              type="button"
              className="qr-btn qr-btn-primary"
              onClick={() => setShowNewQuoteModal(true)}
            >
              <Calculator size={18} />
              Calculate & Generate Quote
            </button>
          )}
          {activeTab === 'agreements' && canManageAgreements && (
            <button
              type="button"
              className="qr-btn qr-btn-primary"
              onClick={() => setShowNewAgreementModal(true)}
            >
              <Plus size={18} />
              New Rate Agreement
            </button>
          )}
        </div>
      </header>

      {/* ─── Workspace Tabs ─────────────────────────────────── */}
      <nav className="qr-tabs" aria-label="Quoting & Rate Management Navigation">
        <button
          type="button"
          className={`qr-tab ${activeTab === 'quotes' ? 'active' : ''}`}
          onClick={() => setActiveTab('quotes')}
        >
          <Calculator size={18} />
          Spot & LTL Quotes
          {quotesTotal > 0 && <span className="qr-tab-count">{quotesTotal}</span>}
        </button>

        <button
          type="button"
          className={`qr-tab ${activeTab === 'agreements' ? 'active' : ''}`}
          onClick={() => setActiveTab('agreements')}
        >
          <Buildings size={18} />
          Contract Rate Agreements
          {agreementsTotal > 0 && <span className="qr-tab-count">{agreementsTotal}</span>}
        </button>

        <button
          type="button"
          className={`qr-tab ${activeTab === 'comparison' ? 'active' : ''}`}
          onClick={() => setActiveTab('comparison')}
        >
          <Scales size={18} />
          Multi-Carrier Comparison (FR-4.8)
        </button>

        <button
          type="button"
          className={`qr-tab ${activeTab === 'confirmations' ? 'active' : ''}`}
          onClick={() => setActiveTab('confirmations')}
        >
          <Pen size={18} />
          Rate Confirmations & E-Sign (FR-4.5)
        </button>

        <button
          type="button"
          className={`qr-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <ChartBar size={18} />
          Lane Rate History (FR-4.7)
        </button>
      </nav>

      {/* ═══════════════════════════════════════════════════════
          TAB 1: SPOT & LTL QUOTES (FR-4.1, FR-4.3, FR-4.4, FR-4.6)
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'quotes' && (
        <section>
          {/* Toolbar */}
          <div className="qr-toolbar">
            <div className="qr-filters">
              <div className="qr-search-input">
                <MagnifyingGlass size={16} color="#64748b" />
                <input
                  type="text"
                  placeholder="Search by quote #, city, state..."
                  value={quoteSearch}
                  onChange={(e) => setQuoteSearch(e.target.value)}
                />
              </div>

              <select
                className="qr-select"
                value={quoteStatusFilter}
                onChange={(e) => setQuoteStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="booked">Booked</option>
                <option value="expired">Expired</option>
              </select>

              <select
                className="qr-select"
                value={quoteServiceTypeFilter}
                onChange={(e) => setQuoteServiceTypeFilter(e.target.value)}
              >
                <option value="">All Modes</option>
                <option value="ftl">FTL (Full Truckload)</option>
                <option value="ltl">LTL (Less-Than-Truckload)</option>
              </select>

              <button
                type="button"
                className="qr-btn qr-btn-secondary"
                onClick={fetchQuotes}
                title="Refresh Quotes"
              >
                <ArrowClockwise size={16} />
                Refresh
              </button>
            </div>
          </div>

          {/* Quotes Table */}
          {loadingQuotes ? (
            <div className="qr-loading-box">
              <ArrowClockwise size={24} className="qr-spin" />
              <span>Fetching quote catalog from backend...</span>
            </div>
          ) : quotes.length === 0 ? (
            <div className="qr-empty-box">
              <Tag size={40} weight="light" />
              <h3>No Quotes Generated Yet</h3>
              <p>Calculate your first instant spot or LTL rate quote using live backend rating engines.</p>
              {canCreateQuote && (
                <button
                  type="button"
                  className="qr-btn qr-btn-primary"
                  onClick={() => setShowNewQuoteModal(true)}
                  style={{ marginTop: '8px' }}
                >
                  <Plus size={16} />
                  Calculate New Quote
                </button>
              )}
            </div>
          ) : (
            <div className="qr-table-wrap">
              <table className="qr-table">
                <thead>
                  <tr>
                    <th>Quote Ref</th>
                    <th>Lane (Origin → Dest)</th>
                    <th>Mode & Model</th>
                    <th>Base Linehaul</th>
                    <th>Fuel Surcharge</th>
                    <th>Accessorials</th>
                    <th>Total Quote</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => {
                    const isBooked = q.status === 'booked';
                    const isExpired = q.status === 'expired';
                    const isLtl = q.service_type === 'ltl';
                    return (
                      <tr key={q.id}>
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>
                            {q.quote_number || `#${q.id}`}
                          </div>
                          {q.shipment_id && (
                            <small style={{ color: '#64748b' }}>Shipment #{q.shipment_id}</small>
                          )}
                        </td>

                        <td>
                          <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{q.origin_city || 'Origin'}, {q.origin_state || ''}</span>
                            <ArrowsLeftRight size={14} color="#94a3b8" />
                            <span>{q.dest_city || 'Dest'}, {q.dest_state || ''}</span>
                          </div>
                          <small style={{ color: '#64748b' }}>
                            {q.distance_miles ? `${Number(q.distance_miles).toFixed(0)} mi` : 'Miles uncalculated'}
                            {q.rate_per_mile ? ` @ $${Number(q.rate_per_mile).toFixed(2)}/mi` : ''}
                          </small>
                        </td>

                        <td>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            <span className={`qr-badge ${isLtl ? 'qr-badge-ltl' : 'qr-badge-contract'}`}>
                              {q.service_type?.toUpperCase() || 'FTL'}
                            </span>
                            <span className={`qr-badge ${q.pricing_model === 'contract' ? 'qr-badge-contract' : 'qr-badge-spot'}`}>
                              {q.pricing_model?.toUpperCase() || 'SPOT'}
                            </span>
                          </div>
                          {isLtl && q.freight_class && (
                            <small style={{ color: '#b45309', display: 'block', marginTop: '2px' }}>
                              Class {q.freight_class} {q.weight_lbs ? `· ${Number(q.weight_lbs).toLocaleString()} lbs` : ''}
                            </small>
                          )}
                        </td>

                        <td>
                          <span style={{ fontWeight: 600 }}>{formatMoney(q.base_rate)}</span>
                        </td>

                        <td>
                          <span style={{ color: '#0284c7' }}>{formatMoney(q.fuel_surcharge)}</span>
                        </td>

                        <td>
                          <span>{formatMoney(q.accessorials_total)}</span>
                          {q.accessorial_charges?.length > 0 && (
                            <small style={{ color: '#64748b', display: 'block' }}>
                              ({q.accessorial_charges.length} item{q.accessorial_charges.length === 1 ? '' : 's'})
                            </small>
                          )}
                        </td>

                        <td>
                          <div style={{ fontWeight: 700, fontSize: '14.5px', color: '#0f172a' }}>
                            {formatMoney(q.total_amount)}
                          </div>
                        </td>

                        <td>
                          <span className={`qr-badge qr-badge-${q.status || 'active'}`}>
                            {q.status?.toUpperCase() || 'ACTIVE'}
                          </span>
                        </td>

                        <td>
                          <small style={{ color: isExpired ? '#ef4444' : '#64748b' }}>
                            {q.expires_at ? new Date(q.expires_at).toLocaleDateString() : '—'}
                          </small>
                        </td>

                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="qr-btn qr-btn-secondary"
                              onClick={() => setSelectedQuoteDetail(q)}
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                            >
                              Details
                            </button>

                            {canBookQuote && q.status === 'active' && (
                              <button
                                type="button"
                                className="qr-btn qr-btn-primary"
                                onClick={() => setBookingQuote(q)}
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                              >
                                Book
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Server-Side Pagination */}
              {quotesTotalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', padding: '12px' }}>
                  <button
                    type="button"
                    className="qr-btn qr-btn-secondary"
                    disabled={quotesPage <= 1}
                    onClick={() => setQuotesPage((p) => Math.max(1, p - 1))}
                  >
                    <CaretLeft size={14} /> Previous
                  </button>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>
                    Page {quotesPage} of {quotesTotalPages} ({quotesTotal} quotes)
                  </span>
                  <button
                    type="button"
                    className="qr-btn qr-btn-secondary"
                    disabled={quotesPage >= quotesTotalPages}
                    onClick={() => setQuotesPage((p) => Math.min(quotesTotalPages, p + 1))}
                  >
                    Next <CaretRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB 2: CONTRACT RATE AGREEMENTS (FR-4.2)
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'agreements' && (
        <section>
          {/* Toolbar */}
          <div className="qr-toolbar">
            <div className="qr-filters">
              <div className="qr-search-input">
                <MagnifyingGlass size={16} color="#64748b" />
                <input
                  type="text"
                  placeholder="Search agreements by lane, carrier, city..."
                  value={agreementSearch}
                  onChange={(e) => setAgreementSearch(e.target.value)}
                />
              </div>

              <select
                className="qr-select"
                value={agreementStatusFilter}
                onChange={(e) => setAgreementStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <button
                type="button"
                className="qr-btn qr-btn-secondary"
                onClick={fetchAgreements}
                title="Refresh Rate Agreements"
              >
                <ArrowClockwise size={16} />
                Refresh
              </button>
            </div>
          </div>

          {/* Table */}
          {loadingAgreements ? (
            <div className="qr-loading-box">
              <ArrowClockwise size={24} className="qr-spin" />
              <span>Fetching contract rate agreements...</span>
            </div>
          ) : agreements.length === 0 ? (
            <div className="qr-empty-box">
              <Buildings size={40} weight="light" />
              <h3>No Contract Rate Agreements Found</h3>
              <p>Lock in committed freight contracts between shippers and approved motor carriers.</p>
              {canManageAgreements && (
                <button
                  type="button"
                  className="qr-btn qr-btn-primary"
                  onClick={() => setShowNewAgreementModal(true)}
                  style={{ marginTop: '8px' }}
                >
                  <Plus size={16} />
                  Create Rate Agreement
                </button>
              )}
            </div>
          ) : (
            <div className="qr-table-wrap">
              <table className="qr-table">
                <thead>
                  <tr>
                    <th>Agreement #</th>
                    <th>Carrier Partner</th>
                    <th>Lane (Origin → Dest)</th>
                    <th>Equipment</th>
                    <th>Contract Rate</th>
                    <th>Fuel Surcharge</th>
                    <th>Commitment</th>
                    <th>Effective Period</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agreements.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong style={{ color: '#0f172a' }}>{a.agreement_number || `#${a.id}`}</strong>
                        {a.lane_code && (
                          <small style={{ color: '#64748b', display: 'block' }}>Code: {a.lane_code}</small>
                        )}
                      </td>

                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {a.carrier_org?.legal_name || `Carrier #${a.carrier_org_id}`}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{a.origin_city || 'Origin'}, {a.origin_state || ''}</span>
                          <ArrowsLeftRight size={14} color="#94a3b8" />
                          <span>{a.dest_city || 'Dest'}, {a.dest_state || ''}</span>
                        </div>
                        {(a.origin_zip || a.dest_zip) && (
                          <small style={{ color: '#64748b' }}>
                            {a.origin_zip || ''} → {a.dest_zip || ''}
                          </small>
                        )}
                      </td>

                      <td>
                        <span className="qr-badge qr-badge-contract">
                          {a.equipment_type || 'Dry Van'}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>
                          {formatMoney(a.rate)}
                          <small style={{ fontWeight: 400, color: '#64748b', marginLeft: '4px' }}>
                            ({a.rate_type === 'per_mile' ? '/mi' : 'flat'})
                          </small>
                        </div>
                      </td>

                      <td>
                        {a.fuel_surcharge_included ? (
                          <span className="qr-badge qr-badge-active" title="Fuel surcharge is included in agreed base rate">
                            Embedded
                          </span>
                        ) : (
                          <span className="qr-badge qr-badge-pending" title="Separate DOE weekly index surcharge applied">
                            DOE Index
                          </span>
                        )}
                      </td>

                      <td>
                        {a.min_commitment_loads ? `${a.min_commitment_loads} loads/mo` : 'None'}
                      </td>

                      <td>
                        <small style={{ color: '#475569', display: 'block' }}>
                          {a.effective_from ? new Date(a.effective_from).toLocaleDateString() : '—'}
                          {' → '}
                          {a.effective_to ? new Date(a.effective_to).toLocaleDateString() : '—'}
                        </small>
                      </td>

                      <td>
                        <span className={`qr-badge qr-badge-${a.status || 'active'}`}>
                          {a.status?.toUpperCase() || 'ACTIVE'}
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {canManageAgreements && (
                            <>
                              <button
                                type="button"
                                className="qr-btn qr-btn-secondary"
                                onClick={() => setEditingAgreement(a)}
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="qr-btn qr-btn-danger"
                                onClick={async () => {
                                  if (window.confirm(`Delete or cancel rate agreement ${a.agreement_number}?`)) {
                                    try {
                                      await deleteRateAgreement(a.id);
                                      notify?.('Rate agreement cancelled successfully');
                                      fetchAgreements();
                                    } catch (err) {
                                      notify?.(err.message || 'Failed to delete agreement');
                                    }
                                  }
                                }}
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {agreementsTotalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', padding: '12px' }}>
                  <button
                    type="button"
                    className="qr-btn qr-btn-secondary"
                    disabled={agreementsPage <= 1}
                    onClick={() => setAgreementsPage((p) => Math.max(1, p - 1))}
                  >
                    <CaretLeft size={14} /> Previous
                  </button>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>
                    Page {agreementsPage} of {agreementsTotalPages} ({agreementsTotal} agreements)
                  </span>
                  <button
                    type="button"
                    className="qr-btn qr-btn-secondary"
                    disabled={agreementsPage >= agreementsTotalPages}
                    onClick={() => setAgreementsPage((p) => Math.min(agreementsTotalPages, p + 1))}
                  >
                    Next <CaretRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB 3: MULTI-CARRIER QUOTE COMPARISON (FR-4.8)
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'comparison' && (
        <section>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 10px', color: '#0f172a' }}>
              Select Shipment for Multi-Carrier Rate Comparison
            </h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="qr-select"
                value={selectedComparisonShipmentId}
                onChange={(e) => {
                  setSelectedComparisonShipmentId(e.target.value);
                  handleRunComparison(e.target.value);
                }}
                style={{ minWidth: '320px' }}
              >
                <option value="">-- Choose a Shipment --</option>
                {shipmentsList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.reference_number || `Shipment #${s.id}`} — {s.origin?.city || 'Origin'} to {s.destination?.city || 'Dest'}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="qr-btn qr-btn-primary"
                disabled={!selectedComparisonShipmentId || loadingComparison}
                onClick={() => handleRunComparison(selectedComparisonShipmentId)}
              >
                {loadingComparison ? <ArrowClockwise size={16} className="qr-spin" /> : <Scales size={16} />}
                Run Multi-Carrier Comparison
              </button>
            </div>
          </div>

          {comparisonError && (
            <div className="qr-error-banner" style={{ marginBottom: '16px' }}>
              <WarningCircle size={18} />
              <span>{comparisonError}</span>
            </div>
          )}

          {loadingComparison ? (
            <div className="qr-loading-box">
              <ArrowClockwise size={24} className="qr-spin" />
              <span>Aggregating contract, spot, and tariff rate quotes across carriers...</span>
            </div>
          ) : comparisonData ? (
            <div>
              {/* Lane Meta */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                    {comparisonData.lane?.origin_city}, {comparisonData.lane?.origin_state} → {comparisonData.lane?.dest_city}, {comparisonData.lane?.dest_state}
                  </h2>
                  <small style={{ color: '#64748b' }}>
                    Shipment Ref: {comparisonData.reference_number || `#${comparisonData.shipment_id}`} · {comparisonData.lane?.distance_miles || '—'} miles
                  </small>
                </div>
                <span className="qr-badge qr-badge-active">
                  {comparisonData.carrier_options_count || comparisonData.options?.length || 0} Carriers Scored
                </span>
              </div>

              {/* Comparison Cards Grid */}
              <div className="qr-comparison-grid">
                {comparisonData.options?.map((opt, idx) => (
                  <div key={idx} className={`qr-comparison-card ${opt.recommended ? 'recommended' : ''}`}>
                    {opt.recommended && (
                      <div className="qr-recommended-banner">
                        <CheckCircle size={14} weight="bold" />
                        RECOMMENDED BEST VALUE
                      </div>
                    )}

                    <div className="qr-card-header">
                      <div>
                        <h3>{opt.carrier_name || `Carrier #${opt.carrier_id}`}</h3>
                        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                          <span className={`qr-badge ${opt.pricing_model === 'contract' ? 'qr-badge-contract' : 'qr-badge-spot'}`}>
                            {opt.pricing_model?.toUpperCase()}
                          </span>
                          <span className="qr-badge qr-badge-ltl">
                            {opt.service_type?.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="qr-rate-big">
                        {formatMoney(opt.total_amount)}
                      </div>
                    </div>

                    {opt.recommendation_reason && (
                      <p style={{ fontSize: '12px', color: '#0369a1', background: '#f0f9ff', padding: '6px 10px', borderRadius: '4px', margin: 0 }}>
                        {opt.recommendation_reason}
                      </p>
                    )}

                    {/* Breakdown */}
                    <div className="qr-breakdown-table">
                      <div className="qr-breakdown-row">
                        <span>Base Linehaul Rate:</span>
                        <strong>{formatMoney(opt.base_rate)}</strong>
                      </div>
                      <div className="qr-breakdown-row">
                        <span>Fuel Surcharge:</span>
                        <span>{formatMoney(opt.fuel_surcharge)}</span>
                      </div>
                      <div className="qr-breakdown-row">
                        <span>Accessorials:</span>
                        <span>{formatMoney(opt.accessorials_total)}</span>
                      </div>
                      <div className="qr-breakdown-row total">
                        <span>Total All-In Rate:</span>
                        <span>{formatMoney(opt.total_amount)}</span>
                      </div>
                      {opt.rate_per_mile && (
                        <div className="qr-breakdown-row">
                          <span>Effective Rate / Mile:</span>
                          <span>${Number(opt.rate_per_mile).toFixed(2)}/mi</span>
                        </div>
                      )}
                      {opt.transit_days && (
                        <div className="qr-breakdown-row">
                          <span>Est. Transit:</span>
                          <span>{opt.transit_days} day{opt.transit_days === 1 ? '' : 's'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="qr-empty-box">
              <Scales size={40} weight="light" />
              <h3>No Shipment Selected</h3>
              <p>Pick a shipment from the dropdown above to evaluate live side-by-side rates across your contract agreements and current spot market.</p>
            </div>
          )}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB 4: RATE CONFIRMATIONS & E-SIGNATURE (FR-4.5)
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'confirmations' && (
        <section>
          {/* Header Controls */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 10px', color: '#0f172a' }}>
              Inspect or Execute Rate Confirmation by Shipment
            </h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="qr-select"
                value={selectedRcShipmentId}
                onChange={(e) => {
                  setSelectedRcShipmentId(e.target.value);
                  handleFetchConfirmation(e.target.value);
                }}
                style={{ minWidth: '320px' }}
              >
                <option value="">-- Choose a Shipment --</option>
                {shipmentsList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.reference_number || `Shipment #${s.id}`} — {s.status?.toUpperCase()}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="qr-btn qr-btn-primary"
                disabled={!selectedRcShipmentId || loadingConfirmation}
                onClick={() => handleFetchConfirmation(selectedRcShipmentId)}
              >
                <FileText size={16} />
                Lookup Rate Confirmation
              </button>

              {canCreateConfirmation && (
                <button
                  type="button"
                  className="qr-btn qr-btn-secondary"
                  onClick={() => setShowGenerateRcModal(true)}
                >
                  <Plus size={16} />
                  Generate New Confirmation
                </button>
              )}
            </div>
          </div>

          {confirmationError && (
            <div className="qr-error-banner" style={{ marginBottom: '16px' }}>
              <WarningCircle size={18} />
              <span>{confirmationError}</span>
            </div>
          )}

          {loadingConfirmation ? (
            <div className="qr-loading-box">
              <ArrowClockwise size={24} className="qr-spin" />
              <span>Loading Rate Confirmation legal record...</span>
            </div>
          ) : currentConfirmation ? (
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '24px', maxWidth: '780px' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '16px' }}>
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase' }}>
                    OFFICIAL FREIGHT RATE CONFIRMATION
                  </span>
                  <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0', color: '#0f172a' }}>
                    {currentConfirmation.confirmation_number || `#${currentConfirmation.id}`}
                  </h2>
                  <small style={{ color: '#64748b' }}>
                    Shipment #{currentConfirmation.shipment_id} · Carrier: {currentConfirmation.carrier_org?.legal_name || `#${currentConfirmation.carrier_org_id}`}
                  </small>
                </div>
                <div>
                  <span className={`qr-badge qr-badge-${currentConfirmation.status === 'signed' ? 'signed' : 'pending'}`} style={{ fontSize: '13px', padding: '4px 10px' }}>
                    {currentConfirmation.status === 'signed' ? 'EXECUTED & SIGNED' : 'PENDING CARRIER SIGNATURE'}
                  </span>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                  <small style={{ color: '#64748b', display: 'block' }}>Linehaul Rate</small>
                  <strong style={{ fontSize: '18px', color: '#0f172a' }}>{formatMoney(currentConfirmation.linehaul_rate)}</strong>
                </div>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                  <small style={{ color: '#64748b', display: 'block' }}>Fuel Surcharge</small>
                  <strong style={{ fontSize: '18px', color: '#0284c7' }}>{formatMoney(currentConfirmation.fuel_surcharge)}</strong>
                </div>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                  <small style={{ color: '#64748b', display: 'block' }}>Accessorials Total</small>
                  <strong style={{ fontSize: '18px', color: '#0f172a' }}>{formatMoney(currentConfirmation.accessorials_total)}</strong>
                </div>
                <div style={{ background: '#f0f9ff', padding: '12px', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                  <small style={{ color: '#0369a1', display: 'block' }}>Total Agreed Amount</small>
                  <strong style={{ fontSize: '20px', color: '#0369a1' }}>{formatMoney(currentConfirmation.total_amount)}</strong>
                </div>
              </div>

              {/* Special Instructions */}
              {currentConfirmation.special_instructions && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#334155', margin: '0 0 6px' }}>Special Instructions</h4>
                  <p style={{ fontSize: '13.5px', color: '#475569', background: '#f8fafc', padding: '10px 14px', borderRadius: '6px', margin: 0 }}>
                    {currentConfirmation.special_instructions}
                  </p>
                </div>
              )}

              {/* E-Signature Audit Record */}
              <div className="qr-sig-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                    Carrier E-Signature Status
                  </h4>
                  {currentConfirmation.status === 'signed' ? (
                    <span className="qr-sig-badge">
                      <ShieldCheck size={16} weight="fill" />
                      Legally Binding Signature Verified
                    </span>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#c2410c', fontWeight: 600 }}>
                      Awaiting Carrier E-Signature (Dispatch Gated)
                    </span>
                  )}
                </div>

                {currentConfirmation.status === 'signed' ? (
                  <div style={{ fontSize: '12.5px', color: '#475569', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                    <div><strong>Signer:</strong> {currentConfirmation.signer_name}</div>
                    <div><strong>Email:</strong> {currentConfirmation.signer_email}</div>
                    <div><strong>Signed At:</strong> {new Date(currentConfirmation.signed_at).toLocaleString()}</div>
                    <div><strong>IP Stamp:</strong> {currentConfirmation.signer_ip || '127.0.0.1'}</div>
                  </div>
                ) : (
                  <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>
                    Per compliance standards, load dispatch is strictly gated until authorized carrier e-signature is stamped.
                  </p>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="qr-btn qr-btn-secondary"
                  onClick={async () => {
                    try {
                      const blob = await downloadRateConfirmationDocument(currentConfirmation.id);
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${currentConfirmation.confirmation_number || 'RateConfirmation'}.pdf`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    } catch (err) {
                      notify?.(err.message || 'Failed to download PDF document');
                    }
                  }}
                >
                  <DownloadSimple size={16} />
                  Download Official PDF
                </button>

                {currentConfirmation.status !== 'signed' && canSignConfirmation && (
                  <button
                    type="button"
                    className="qr-btn qr-btn-primary"
                    onClick={() => setShowSignRcModal(true)}
                  >
                    <Pen size={16} />
                    Sign Rate Confirmation
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="qr-empty-box">
              <FileText size={40} weight="light" />
              <h3>Select a Shipment to View Rate Confirmation</h3>
              <p>Rate Confirmations lock in carrier linehaul rates, fuel formulas, accessorial terms, and enforce compliance gating prior to dispatch.</p>
            </div>
          )}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB 5: LANE RATE HISTORY & BENCHMARKS (FR-4.7)
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <section>
          {/* Query Form */}
          <form
            onSubmit={handleRunLaneHistory}
            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}
          >
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="qr-form-col" style={{ minWidth: '220px' }}>
                <label>Origin (City, State)</label>
                <input
                  type="text"
                  placeholder="e.g. Chicago, IL"
                  value={historyOrigin}
                  onChange={(e) => setHistoryOrigin(e.target.value)}
                  required
                />
              </div>

              <div className="qr-form-col" style={{ minWidth: '220px' }}>
                <label>Destination (City, State)</label>
                <input
                  type="text"
                  placeholder="e.g. Atlanta, GA"
                  value={historyDest}
                  onChange={(e) => setHistoryDest(e.target.value)}
                  required
                />
              </div>

              <div className="qr-form-col" style={{ maxWidth: '160px' }}>
                <label>Service Type</label>
                <select
                  className="qr-select"
                  value={historyServiceType}
                  onChange={(e) => setHistoryServiceType(e.target.value)}
                >
                  <option value="ftl">FTL (Full Truckload)</option>
                  <option value="ltl">LTL</option>
                </select>
              </div>

              <button
                type="submit"
                className="qr-btn qr-btn-primary"
                disabled={loadingHistory}
                style={{ height: '38px' }}
              >
                {loadingHistory ? <ArrowClockwise size={16} className="qr-spin" /> : <ChartBar size={16} />}
                Retrieve Lane History
              </button>
            </div>
          </form>

          {historyError && (
            <div className="qr-error-banner" style={{ marginBottom: '16px' }}>
              <WarningCircle size={18} />
              <span>{historyError}</span>
            </div>
          )}

          {loadingHistory ? (
            <div className="qr-loading-box">
              <ArrowClockwise size={24} className="qr-spin" />
              <span>Aggregating historical rate data points and volumetric metrics...</span>
            </div>
          ) : laneHistoryData ? (
            <div>
              {/* Lane Info */}
              <div style={{ marginBottom: '16px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                  {laneHistoryData.lane || `${historyOrigin} → ${historyDest}`}
                </h2>
                <small style={{ color: '#64748b' }}>
                  Total Completed Transactions: {laneHistoryData.volume ?? 0}
                </small>
              </div>

              {/* Metrics Grid */}
              <div className="qr-metrics-grid">
                <div className="qr-metric-card">
                  <span className="qr-metric-label">30-Day Average Rate</span>
                  <span className="qr-metric-value">{formatMoney(laneHistoryData.thirty_day_avg_rate)}</span>
                  <span className="qr-metric-sub">{laneHistoryData.volume_30d ?? 0} loads (last 30d)</span>
                </div>

                <div className="qr-metric-card">
                  <span className="qr-metric-label">90-Day Average Rate</span>
                  <span className="qr-metric-value">{formatMoney(laneHistoryData.ninety_day_avg_rate)}</span>
                  <span className="qr-metric-sub">{laneHistoryData.volume_90d ?? 0} loads (last 90d)</span>
                </div>

                <div className="qr-metric-card">
                  <span className="qr-metric-label">All-Time Average Rate</span>
                  <span className="qr-metric-value">{formatMoney(laneHistoryData.all_time_avg_rate)}</span>
                  <span className="qr-metric-sub">Across {laneHistoryData.volume ?? 0} total loads</span>
                </div>

                <div className="qr-metric-card">
                  <span className="qr-metric-label">Average Rate Per Mile</span>
                  <span className="qr-metric-value">
                    {laneHistoryData.avg_rate_per_mile ? `$${Number(laneHistoryData.avg_rate_per_mile).toFixed(2)}` : '—'}
                  </span>
                  <span className="qr-metric-sub">Calculated RPM benchmark</span>
                </div>

                <div className="qr-metric-card">
                  <span className="qr-metric-label">Rate Range (Min - Max)</span>
                  <span className="qr-metric-value" style={{ fontSize: '20px' }}>
                    {formatMoney(laneHistoryData.min_rate)} - {formatMoney(laneHistoryData.max_rate)}
                  </span>
                  <span className="qr-metric-sub">Historic pricing boundaries</span>
                </div>
              </div>

              {/* Recent Transactions Table */}
              {laneHistoryData.recent_transactions?.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 10px', color: '#0f172a' }}>
                    Recent Transactions on Lane
                  </h3>
                  <div className="qr-table-wrap">
                    <table className="qr-table">
                      <thead>
                        <tr>
                          <th>Record #</th>
                          <th>Date</th>
                          <th>Mode</th>
                          <th>Total Paid</th>
                          <th>Rate Per Mile</th>
                        </tr>
                      </thead>
                      <tbody>
                        {laneHistoryData.recent_transactions.map((tx) => (
                          <tr key={tx.id}>
                            <td><strong>#{tx.id}</strong></td>
                            <td>{tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '—'}</td>
                            <td>
                              <span className="qr-badge qr-badge-contract">
                                {tx.service_type?.toUpperCase() || 'FTL'}
                              </span>
                            </td>
                            <td><strong>{formatMoney(tx.total_amount || tx.rate)}</strong></td>
                            <td>{tx.rate_per_mile ? `$${Number(tx.rate_per_mile).toFixed(2)}/mi` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="qr-empty-box">
              <ChartBar size={40} weight="light" />
              <h3>Enter a Freight Lane</h3>
              <p>Query historical pricing intelligence and volume statistics across actual company shipment records.</p>
            </div>
          )}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 1: NEW QUOTE (FR-4.1, FR-4.3, FR-4.4, FR-4.6)
          ═══════════════════════════════════════════════════════ */}
      {showNewQuoteModal && (
        <NewQuoteModal
          onClose={() => setShowNewQuoteModal(false)}
          onSuccess={() => {
            setShowNewQuoteModal(false);
            fetchQuotes();
          }}
          notify={notify}
          currentOrg={currentOrg}
          shipments={shipmentsList}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 2: QUOTE DETAIL (Financial & LTL Breakdown)
          ═══════════════════════════════════════════════════════ */}
      {selectedQuoteDetail && (
        <QuoteDetailModal
          quote={selectedQuoteDetail}
          onClose={() => setSelectedQuoteDetail(null)}
          onBook={() => {
            const q = selectedQuoteDetail;
            setSelectedQuoteDetail(null);
            setBookingQuote(q);
          }}
          canBook={canBookQuote}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 3: BOOK QUOTE CONFIRMATION
          ═══════════════════════════════════════════════════════ */}
      {bookingQuote && (
        <div className="qr-modal-backdrop">
          <div className="qr-modal">
            <header className="qr-modal-header">
              <h2>Confirm Quote Booking</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setBookingQuote(null)}
              >
                <X size={20} />
              </button>
            </header>
            <div className="qr-modal-body">
              <p style={{ margin: 0, fontSize: '14px', color: '#334155' }}>
                You are about to book quote <strong>{bookingQuote.quote_number || `#${bookingQuote.id}`}</strong> for{' '}
                <strong style={{ color: '#0284c7' }}>{formatMoney(bookingQuote.total_amount)}</strong>.
              </p>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', fontSize: '13px' }}>
                <div><strong>Origin:</strong> {bookingQuote.origin_city}, {bookingQuote.origin_state}</div>
                <div><strong>Destination:</strong> {bookingQuote.dest_city}, {bookingQuote.dest_state}</div>
                <div><strong>Pricing Model:</strong> {bookingQuote.pricing_model?.toUpperCase()}</div>
              </div>
            </div>
            <footer className="qr-modal-footer">
              <button
                type="button"
                className="qr-btn qr-btn-secondary"
                onClick={() => setBookingQuote(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="qr-btn qr-btn-primary"
                onClick={handleConfirmBookQuote}
              >
                Confirm & Lock Booking
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 4: NEW RATE AGREEMENT (FR-4.2)
          ═══════════════════════════════════════════════════════ */}
      {showNewAgreementModal && (
        <NewRateAgreementModal
          onClose={() => setShowNewAgreementModal(false)}
          onSuccess={() => {
            setShowNewAgreementModal(false);
            fetchAgreements();
          }}
          notify={notify}
          carriers={carriers}
          currentOrg={currentOrg}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 5: EDIT RATE AGREEMENT
          ═══════════════════════════════════════════════════════ */}
      {editingAgreement && (
        <EditRateAgreementModal
          agreement={editingAgreement}
          onClose={() => setEditingAgreement(null)}
          onSuccess={() => {
            setEditingAgreement(null);
            fetchAgreements();
          }}
          notify={notify}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 6: GENERATE RATE CONFIRMATION (FR-4.5)
          ═══════════════════════════════════════════════════════ */}
      {showGenerateRcModal && (
        <GenerateRateConfirmationModal
          onClose={() => setShowGenerateRcModal(false)}
          onSuccess={(conf) => {
            setShowGenerateRcModal(false);
            setCurrentConfirmation(conf);
          }}
          notify={notify}
          shipments={shipmentsList}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 7: SIGN RATE CONFIRMATION (FR-4.5)
          ═══════════════════════════════════════════════════════ */}
      {showSignRcModal && currentConfirmation && (
        <SignConfirmationModal
          confirmation={currentConfirmation}
          onClose={() => setShowSignRcModal(false)}
          onSuccess={(signed) => {
            setShowSignRcModal(false);
            setCurrentConfirmation(signed);
            notify?.('Rate confirmation signed successfully!');
          }}
          currentUser={currentUser}
          notify={notify}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: NEW QUOTE MODAL (FR-4.1, FR-4.3, FR-4.4, FR-4.6)
// ─────────────────────────────────────────────────────────────
function NewQuoteModal({ onClose, onSuccess, notify, currentOrg, shipments }) {
  const [mode, setMode] = useState('ftl'); // 'ftl' or 'ltl'
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [originCity, setOriginCity] = useState('');
  const [originState, setOriginState] = useState('');
  const [originZip, setOriginZip] = useState('');
  const [destCity, setDestCity] = useState('');
  const [destState, setDestState] = useState('');
  const [destZip, setDestZip] = useState('');
  const [distanceMiles, setDistanceMiles] = useState('500');
  const [equipmentType, setEquipmentType] = useState('Dry Van');
  const [ratePerMile, setRatePerMile] = useState('2.50');

  // LTL specifics
  const [freightClass, setFreightClass] = useState('100');
  const [weightLbs, setWeightLbs] = useState('1500');
  const [nmfcCode, setNmfcCode] = useState('84180');

  // Accessorials
  const [selectedAccessorials, setSelectedAccessorials] = useState([]);
  const [detentionHours, setDetentionHours] = useState(4);
  const [layoverDays, setLayoverDays] = useState(1);
  const [storageDays, setStorageDays] = useState(1);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Auto-fill from shipment
  const handleSelectShipment = (id) => {
    setSelectedShipmentId(id);
    if (!id) return;
    const s = shipments.find((item) => String(item.id) === String(id));
    if (s) {
      if (s.origin?.city) setOriginCity(s.origin.city);
      if (s.origin?.state) setOriginState(s.origin.state);
      if (s.destination?.city) setDestCity(s.destination.city);
      if (s.destination?.state) setDestState(s.destination.state);
      if (s.freight_details?.distance_miles) setDistanceMiles(String(s.freight_details.distance_miles));
      if (s.freight_details?.service_type === 'ltl') setMode('ltl');
    }
  };

  const toggleAccessorial = (id) => {
    setSelectedAccessorials((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!originCity || !originState || !destCity || !destState) {
      setError('Please provide origin and destination cities and states.');
      return;
    }

    setSubmitting(true);
    try {
      // Build accessorials array matching backend spec
      const accessorialPayload = [];
      for (const acc of selectedAccessorials) {
        if (acc === 'detention') {
          accessorialPayload.push({ type: 'detention', hours: Number(detentionHours) });
        } else if (acc === 'layover') {
          accessorialPayload.push({ type: 'layover', days: Number(layoverDays) });
        } else if (acc === 'storage') {
          accessorialPayload.push({ type: 'storage', days: Number(storageDays) });
        } else {
          accessorialPayload.push(acc);
        }
      }

      const payload = {
        service_type: mode,
        origin_city: originCity.trim(),
        origin_state: originState.trim().toUpperCase(),
        origin_zip: originZip.trim() || undefined,
        dest_city: destCity.trim(),
        dest_state: destState.trim().toUpperCase(),
        dest_zip: destZip.trim() || undefined,
        distance_miles: Number(distanceMiles) || 100,
        accessorials: accessorialPayload.length > 0 ? accessorialPayload : undefined,
        shipment_id: selectedShipmentId ? Number(selectedShipmentId) : undefined,
      };

      if (mode === 'ftl') {
        payload.equipment_type = equipmentType;
        if (ratePerMile) payload.rate_per_mile = Number(ratePerMile);
      } else {
        payload.weight_lbs = Number(weightLbs) || 1000;
        payload.freight_class = String(freightClass);
        if (nmfcCode.trim()) payload.nmfc_code = nmfcCode.trim();
      }

      const res = await createQuote(payload);
      notify?.(`Quote ${res?.data?.quote_number || 'created'} generated successfully!`);
      onSuccess?.();
    } catch (err) {
      console.error('Create quote error:', err);
      setError(err.message || 'Failed to calculate quote');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="qr-modal-backdrop">
      <div className="qr-modal wide">
        <header className="qr-modal-header">
          <h2>Generate Instant Freight Quote</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="qr-modal-body">
            {error && (
              <div className="qr-error-banner">
                <WarningCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {/* Mode Selector */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className={`qr-btn ${mode === 'ftl' ? 'qr-btn-primary' : 'qr-btn-secondary'}`}
                onClick={() => setMode('ftl')}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <Truck size={18} /> Full Truckload (FTL Spot)
              </button>
              <button
                type="button"
                className={`qr-btn ${mode === 'ltl' ? 'qr-btn-primary' : 'qr-btn-secondary'}`}
                onClick={() => setMode('ltl')}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <Calculator size={18} /> Less-Than-Truckload (LTL Tariff)
              </button>
            </div>

            {/* Optional Shipment Link */}
            <div className="qr-form-row">
              <div className="qr-form-col">
                <label>Reference Existing Shipment (Optional)</label>
                <select
                  value={selectedShipmentId}
                  onChange={(e) => handleSelectShipment(e.target.value)}
                >
                  <option value="">-- Standalone Quote Request --</option>
                  {shipments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.reference_number || `Shipment #${s.id}`} — {s.origin?.city} → {s.destination?.city}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Origin & Destination */}
            <div className="qr-form-row">
              <div className="qr-form-col">
                <label>Origin City *</label>
                <input
                  type="text"
                  placeholder="e.g. Chicago"
                  value={originCity}
                  onChange={(e) => setOriginCity(e.target.value)}
                  required
                />
              </div>
              <div className="qr-form-col" style={{ maxWidth: '90px' }}>
                <label>State *</label>
                <input
                  type="text"
                  placeholder="IL"
                  maxLength={2}
                  value={originState}
                  onChange={(e) => setOriginState(e.target.value)}
                  required
                />
              </div>
              <div className="qr-form-col" style={{ maxWidth: '120px' }}>
                <label>Zip Code</label>
                <input
                  type="text"
                  placeholder="60601"
                  value={originZip}
                  onChange={(e) => setOriginZip(e.target.value)}
                />
              </div>
            </div>

            <div className="qr-form-row">
              <div className="qr-form-col">
                <label>Destination City *</label>
                <input
                  type="text"
                  placeholder="e.g. Atlanta"
                  value={destCity}
                  onChange={(e) => setDestCity(e.target.value)}
                  required
                />
              </div>
              <div className="qr-form-col" style={{ maxWidth: '90px' }}>
                <label>State *</label>
                <input
                  type="text"
                  placeholder="GA"
                  maxLength={2}
                  value={destState}
                  onChange={(e) => setDestState(e.target.value)}
                  required
                />
              </div>
              <div className="qr-form-col" style={{ maxWidth: '120px' }}>
                <label>Zip Code</label>
                <input
                  type="text"
                  placeholder="30301"
                  value={destZip}
                  onChange={(e) => setDestZip(e.target.value)}
                />
              </div>
            </div>

            {/* Mode-Specific Fields */}
            {mode === 'ftl' ? (
              <div className="qr-form-row">
                <div className="qr-form-col">
                  <label>Equipment Type</label>
                  <select
                    value={equipmentType}
                    onChange={(e) => setEquipmentType(e.target.value)}
                  >
                    <option value="Dry Van">Dry Van</option>
                    <option value="Reefer">Refrigerated (Reefer)</option>
                    <option value="Flatbed">Flatbed</option>
                    <option value="Step Deck">Step Deck</option>
                    <option value="Power Only">Power Only</option>
                  </select>
                </div>
                <div className="qr-form-col">
                  <label>Distance (Miles)</label>
                  <input
                    type="number"
                    min="1"
                    value={distanceMiles}
                    onChange={(e) => setDistanceMiles(e.target.value)}
                    required
                  />
                </div>
                <div className="qr-form-col">
                  <label>Rate Per Mile ($/mi)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.5"
                    value={ratePerMile}
                    onChange={(e) => setRatePerMile(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="qr-form-row">
                <div className="qr-form-col">
                  <label>Freight Class (NMFC Standard) *</label>
                  <select
                    value={freightClass}
                    onChange={(e) => setFreightClass(e.target.value)}
                    required
                  >
                    {FREIGHT_CLASSES.map((fc) => (
                      <option key={fc} value={fc}>
                        Class {fc}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="qr-form-col">
                  <label>Total Billed Weight (lbs) *</label>
                  <input
                    type="number"
                    min="1"
                    value={weightLbs}
                    onChange={(e) => setWeightLbs(e.target.value)}
                    required
                  />
                </div>
                <div className="qr-form-col">
                  <label>NMFC Code</label>
                  <input
                    type="text"
                    placeholder="e.g. 84180 or 150110"
                    value={nmfcCode}
                    onChange={(e) => setNmfcCode(e.target.value)}
                  />
                </div>
                <div className="qr-form-col">
                  <label>Distance (Miles)</label>
                  <input
                    type="number"
                    min="1"
                    value={distanceMiles}
                    onChange={(e) => setDistanceMiles(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            {/* Accessorial Charges (FR-4.4) */}
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                Accessorial Services (FR-4.4)
              </label>
              <div className="qr-accessorial-picker">
                {STANDARD_ACCESSORIALS.map((acc) => {
                  const selected = selectedAccessorials.includes(acc.id);
                  return (
                    <div
                      key={acc.id}
                      className={`qr-acc-item ${selected ? 'selected' : ''}`}
                      onClick={() => toggleAccessorial(acc.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {}} // handled by div onClick
                      />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{acc.name}</div>
                        <small style={{ color: '#64748b' }}>{acc.defaultAmount}</small>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Dynamic inputs for hourly/daily accessorials */}
              {selectedAccessorials.includes('detention') && (
                <div style={{ marginTop: '10px', background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Detention Hours at Dock (first 2 hrs free):</label>
                  <input
                    type="number"
                    min="1"
                    max="48"
                    value={detentionHours}
                    onChange={(e) => setDetentionHours(e.target.value)}
                    style={{ width: '80px', marginLeft: '10px', padding: '4px 8px' }}
                  />
                </div>
              )}
            </div>
          </div>

          <footer className="qr-modal-footer">
            <button type="button" className="qr-btn qr-btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="qr-btn qr-btn-primary" disabled={submitting}>
              {submitting ? (
                <>
                  <ArrowClockwise size={16} className="qr-spin" /> Calculating...
                </>
              ) : (
                <>
                  <Check size={16} /> Calculate & Generate Quote
                </>
              )}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: QUOTE DETAIL MODAL
// ─────────────────────────────────────────────────────────────
function QuoteDetailModal({ quote, onClose, onBook, canBook }) {
  const isBooked = quote.status === 'booked';
  const isExpired = quote.status === 'expired';

  const formatMoney = (val) => {
    if (val === null || val === undefined) return '$0.00';
    return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="qr-modal-backdrop">
      <div className="qr-modal">
        <header className="qr-modal-header">
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase' }}>
              OFFICIAL FREIGHT QUOTE DETAILS
            </span>
            <h2 style={{ margin: '2px 0 0' }}>{quote.quote_number || `#${quote.id}`}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="qr-modal-body">
          {/* Status & Lane Banner */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
            <div>
              <strong style={{ fontSize: '15px', color: '#0f172a' }}>
                {quote.origin_city}, {quote.origin_state} → {quote.dest_city}, {quote.dest_state}
              </strong>
              <small style={{ color: '#64748b', display: 'block' }}>
                Mode: {quote.service_type?.toUpperCase()} · Model: {quote.pricing_model?.toUpperCase()}
              </small>
            </div>
            <span className={`qr-badge qr-badge-${quote.status || 'active'}`} style={{ padding: '4px 10px', fontSize: '12px' }}>
              {quote.status?.toUpperCase() || 'ACTIVE'}
            </span>
          </div>

          {/* Pricing Summary */}
          <div className="qr-breakdown-table" style={{ border: 'none', padding: 0 }}>
            <div className="qr-breakdown-row">
              <span>Base Linehaul Rate:</span>
              <strong>{formatMoney(quote.base_rate)}</strong>
            </div>
            <div className="qr-breakdown-row">
              <span>Fuel Surcharge (DOE Auto-Indexed):</span>
              <strong style={{ color: '#0284c7' }}>{formatMoney(quote.fuel_surcharge)}</strong>
            </div>
            <div className="qr-breakdown-row">
              <span>Accessorial Charges Total:</span>
              <strong>{formatMoney(quote.accessorials_total)}</strong>
            </div>
            <div className="qr-breakdown-row total" style={{ fontSize: '16px' }}>
              <span>Total Guaranteed Quote:</span>
              <strong style={{ color: '#0284c7' }}>{formatMoney(quote.total_amount)}</strong>
            </div>
          </div>

          {/* Accessorial Breakdown */}
          {quote.accessorial_charges?.length > 0 && (
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 6px', color: '#334155' }}>
                Itemized Accessorial Breakdown
              </h4>
              <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '8px 12px' }}>
                {quote.accessorial_charges.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', padding: '3px 0' }}>
                    <span style={{ color: '#475569' }}>
                      {c.description || c.charge_type?.replace(/_/g, ' ').toUpperCase()}
                      {c.quantity && Number(c.quantity) > 1 ? ` (${Number(c.quantity)} units)` : ''}
                    </span>
                    <strong>{formatMoney(c.amount)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expiration Stamp */}
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Quote Valid Until: {quote.expires_at ? new Date(quote.expires_at).toLocaleString() : '—'}
          </div>
        </div>

        <footer className="qr-modal-footer">
          <button type="button" className="qr-btn qr-btn-secondary" onClick={onClose}>
            Close
          </button>
          {canBook && quote.status === 'active' && (
            <button type="button" className="qr-btn qr-btn-primary" onClick={onBook}>
              Book Quote Now
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: NEW RATE AGREEMENT MODAL (FR-4.2)
// ─────────────────────────────────────────────────────────────
function NewRateAgreementModal({ onClose, onSuccess, notify, carriers, currentOrg }) {
  const [carrierOrgId, setCarrierOrgId] = useState('');
  const [laneCode, setLaneCode] = useState('');
  const [originCity, setOriginCity] = useState('');
  const [originState, setOriginState] = useState('');
  const [destCity, setDestCity] = useState('');
  const [destState, setDestState] = useState('');
  const [rate, setRate] = useState('2000.00');
  const [rateType, setRateType] = useState('flat');
  const [equipmentType, setEquipmentType] = useState('Dry Van');
  const [fuelIncluded, setFuelIncluded] = useState(false);
  const [minCommitmentLoads, setMinCommitmentLoads] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [effectiveTo, setEffectiveTo] = useState(
    new Date(Date.now() + 365 * 86400 * 1000).toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!carrierOrgId) {
      setError('Please select a carrier organization.');
      return;
    }

    if (!originCity || !originState || !destCity || !destState) {
      setError('Please provide origin and destination.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        carrier_org_id: Number(carrierOrgId),
        lane_code: laneCode.trim() || `${originCity.slice(0, 3).toUpperCase()}-${destCity.slice(0, 3).toUpperCase()}`,
        origin_city: originCity.trim(),
        origin_state: originState.trim().toUpperCase(),
        dest_city: destCity.trim(),
        dest_state: destState.trim().toUpperCase(),
        equipment_type: equipmentType,
        service_type: 'ftl',
        rate: Number(rate),
        rate_type: rateType,
        fuel_surcharge_included: Boolean(fuelIncluded),
        min_commitment_loads: minCommitmentLoads ? Number(minCommitmentLoads) : undefined,
        effective_from: new Date(effectiveFrom).toISOString(),
        effective_to: new Date(effectiveTo).toISOString(),
        notes: notes.trim() || undefined,
      };

      await createRateAgreement(payload);
      notify?.('Rate agreement committed successfully!');
      onSuccess?.();
    } catch (err) {
      console.error('Create agreement error:', err);
      setError(err.message || 'Failed to create rate agreement');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="qr-modal-backdrop">
      <div className="qr-modal wide">
        <header className="qr-modal-header">
          <h2>Create Contract Rate Agreement</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="qr-modal-body">
            {error && (
              <div className="qr-error-banner">
                <WarningCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <div className="qr-form-row">
              <div className="qr-form-col">
                <label>Carrier Organization *</label>
                <select
                  value={carrierOrgId}
                  onChange={(e) => setCarrierOrgId(e.target.value)}
                  required
                >
                  <option value="">-- Select Approved Carrier --</option>
                  {carriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.legal_name || `Carrier #${c.id}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="qr-form-col">
                <label>Lane Identifier / Code</label>
                <input
                  type="text"
                  placeholder="e.g. CHI-DAL"
                  value={laneCode}
                  onChange={(e) => setLaneCode(e.target.value)}
                />
              </div>
            </div>

            <div className="qr-form-row">
              <div className="qr-form-col">
                <label>Origin City *</label>
                <input
                  type="text"
                  placeholder="e.g. Chicago"
                  value={originCity}
                  onChange={(e) => setOriginCity(e.target.value)}
                  required
                />
              </div>
              <div className="qr-form-col" style={{ maxWidth: '90px' }}>
                <label>State *</label>
                <input
                  type="text"
                  placeholder="IL"
                  maxLength={2}
                  value={originState}
                  onChange={(e) => setOriginState(e.target.value)}
                  required
                />
              </div>
              <div className="qr-form-col">
                <label>Destination City *</label>
                <input
                  type="text"
                  placeholder="e.g. Dallas"
                  value={destCity}
                  onChange={(e) => setDestCity(e.target.value)}
                  required
                />
              </div>
              <div className="qr-form-col" style={{ maxWidth: '90px' }}>
                <label>State *</label>
                <input
                  type="text"
                  placeholder="TX"
                  maxLength={2}
                  value={destState}
                  onChange={(e) => setDestState(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="qr-form-row">
              <div className="qr-form-col">
                <label>Agreed Contract Rate ($) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  required
                />
              </div>

              <div className="qr-form-col">
                <label>Rate Type</label>
                <select value={rateType} onChange={(e) => setRateType(e.target.value)}>
                  <option value="flat">Flat Linehaul Rate ($)</option>
                  <option value="per_mile">Per-Mile Rate ($/mi)</option>
                </select>
              </div>

              <div className="qr-form-col">
                <label>Equipment Type</label>
                <select value={equipmentType} onChange={(e) => setEquipmentType(e.target.value)}>
                  <option value="Dry Van">Dry Van</option>
                  <option value="Reefer">Reefer</option>
                  <option value="Flatbed">Flatbed</option>
                </select>
              </div>
            </div>

            <div className="qr-form-row">
              <div className="qr-form-col">
                <label>Effective From *</label>
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  required
                />
              </div>
              <div className="qr-form-col">
                <label>Effective To *</label>
                <input
                  type="date"
                  value={effectiveTo}
                  onChange={(e) => setEffectiveTo(e.target.value)}
                  required
                />
              </div>
              <div className="qr-form-col">
                <label>Min Commitment (Loads/mo)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 10"
                  value={minCommitmentLoads}
                  onChange={(e) => setMinCommitmentLoads(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="fuelInc"
                checked={fuelIncluded}
                onChange={(e) => setFuelIncluded(e.target.checked)}
              />
              <label htmlFor="fuelInc" style={{ fontSize: '13px', cursor: 'pointer' }}>
                Fuel surcharge is fully embedded in this agreed linehaul rate (exempt from DOE weekly index add-on)
              </label>
            </div>
          </div>

          <footer className="qr-modal-footer">
            <button type="button" className="qr-btn qr-btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="qr-btn qr-btn-primary" disabled={submitting}>
              {submitting ? 'Saving Agreement...' : 'Commit Rate Agreement'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: EDIT RATE AGREEMENT MODAL
// ─────────────────────────────────────────────────────────────
function EditRateAgreementModal({ agreement, onClose, onSuccess, notify }) {
  const [rate, setRate] = useState(String(agreement.rate || ''));
  const [rateType, setRateType] = useState(agreement.rate_type || 'flat');
  const [notes, setNotes] = useState(agreement.notes || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await updateRateAgreement(agreement.id, {
        rate: Number(rate),
        rate_type: rateType,
        notes: notes.trim() || undefined,
      });
      notify?.('Rate agreement updated successfully!');
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to update agreement');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="qr-modal-backdrop">
      <div className="qr-modal">
        <header className="qr-modal-header">
          <h2>Edit Rate Agreement #{agreement.agreement_number || agreement.id}</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={handleUpdate}>
          <div className="qr-modal-body">
            {error && (
              <div className="qr-error-banner">
                <WarningCircle size={18} />
                <span>{error}</span>
              </div>
            )}
            <div className="qr-form-row">
              <div className="qr-form-col">
                <label>Contract Rate ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  required
                />
              </div>
              <div className="qr-form-col">
                <label>Rate Type</label>
                <select value={rateType} onChange={(e) => setRateType(e.target.value)}>
                  <option value="flat">Flat Linehaul Rate</option>
                  <option value="per_mile">Per Mile</option>
                </select>
              </div>
            </div>
            <div className="qr-form-col">
              <label>Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <footer className="qr-modal-footer">
            <button type="button" className="qr-btn qr-btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="qr-btn qr-btn-primary" disabled={submitting}>
              {submitting ? 'Updating...' : 'Update Agreement'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: GENERATE RATE CONFIRMATION MODAL (FR-4.5)
// ─────────────────────────────────────────────────────────────
function GenerateRateConfirmationModal({ onClose, onSuccess, notify, shipments }) {
  const [shipmentId, setShipmentId] = useState('');
  const [linehaulRate, setLinehaulRate] = useState('1600.00');
  const [fuelSurcharge, setFuelSurcharge] = useState('250.00');
  const [accessorialsTotal, setAccessorialsTotal] = useState('150.00');
  const [specialInstructions, setSpecialInstructions] = useState(
    'Driver must call 2 hours prior to arrival. Liftgate required at delivery.'
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!shipmentId) {
      setError('Please select a shipment.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await generateRateConfirmation(shipmentId, {
        linehaul_rate: Number(linehaulRate),
        fuel_surcharge: Number(fuelSurcharge),
        accessorials_total: Number(accessorialsTotal),
        special_instructions: specialInstructions.trim() || undefined,
      });
      notify?.('Rate confirmation generated successfully!');
      onSuccess?.(res?.data);
    } catch (err) {
      setError(err.message || 'Failed to generate rate confirmation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="qr-modal-backdrop">
      <div className="qr-modal">
        <header className="qr-modal-header">
          <h2>Generate Rate Confirmation Document</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="qr-modal-body">
            {error && (
              <div className="qr-error-banner">
                <WarningCircle size={18} />
                <span>{error}</span>
              </div>
            )}
            <div className="qr-form-col">
              <label>Select Shipment *</label>
              <select
                value={shipmentId}
                onChange={(e) => setShipmentId(e.target.value)}
                required
              >
                <option value="">-- Choose Shipment --</option>
                {shipments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.reference_number || `Shipment #${s.id}`} — {s.status?.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="qr-form-row">
              <div className="qr-form-col">
                <label>Linehaul Rate ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={linehaulRate}
                  onChange={(e) => setLinehaulRate(e.target.value)}
                  required
                />
              </div>
              <div className="qr-form-col">
                <label>Fuel Surcharge ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={fuelSurcharge}
                  onChange={(e) => setFuelSurcharge(e.target.value)}
                  required
                />
              </div>
              <div className="qr-form-col">
                <label>Accessorials Total ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={accessorialsTotal}
                  onChange={(e) => setAccessorialsTotal(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="qr-form-col">
              <label>Special Instructions & Delivery Requirements</label>
              <textarea
                rows={3}
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
              />
            </div>
          </div>
          <footer className="qr-modal-footer">
            <button type="button" className="qr-btn qr-btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="qr-btn qr-btn-primary" disabled={submitting}>
              {submitting ? 'Generating...' : 'Generate & Issue'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: SIGN RATE CONFIRMATION MODAL (FR-4.5)
// ─────────────────────────────────────────────────────────────
function SignConfirmationModal({ confirmation, onClose, onSuccess, currentUser, notify }) {
  const [signerName, setSignerName] = useState(currentUser?.name || '');
  const [signerTitle, setSignerTitle] = useState('Lead Dispatcher');
  const [notes, setNotes] = useState('Rate confirmation accepted without modifications.');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSign = async (e) => {
    e.preventDefault();
    if (!signerName.trim()) {
      setError('Please provide the full legal name of the signer.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await signRateConfirmation(confirmation.id, {
        signer_name: signerName.trim(),
        signer_title: signerTitle.trim() || undefined,
        signature_data: `DIGITAL_ESIGNATURE_RECORD_${Date.now()}_${signerName.toUpperCase()}`,
        notes: notes.trim() || undefined,
      });
      onSuccess?.(res?.data);
    } catch (err) {
      setError(err.message || 'Failed to sign rate confirmation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="qr-modal-backdrop">
      <div className="qr-modal">
        <header className="qr-modal-header">
          <h2>Execute Carrier Electronic Signature</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={handleSign}>
          <div className="qr-modal-body">
            {error && (
              <div className="qr-error-banner">
                <WarningCircle size={18} />
                <span>{error}</span>
              </div>
            )}
            <p style={{ margin: 0, fontSize: '13.5px', color: '#475569' }}>
              By submitting this form, you certify on behalf of the carrier that you accept all terms, rates, and special instructions on Rate Confirmation{' '}
              <strong>{confirmation.confirmation_number || `#${confirmation.id}`}</strong>.
            </p>

            <div className="qr-form-row">
              <div className="qr-form-col">
                <label>Signer Full Legal Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Jane Dispatcher"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  required
                />
              </div>
              <div className="qr-form-col">
                <label>Signer Professional Title</label>
                <input
                  type="text"
                  placeholder="e.g. Lead Dispatcher / Operations"
                  value={signerTitle}
                  onChange={(e) => setSignerTitle(e.target.value)}
                />
              </div>
            </div>

            <div className="qr-form-col">
              <label>Acceptance Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <footer className="qr-modal-footer">
            <button type="button" className="qr-btn qr-btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="qr-btn qr-btn-primary" disabled={submitting}>
              {submitting ? 'Executing E-Sign...' : 'Sign & Execute Document'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

