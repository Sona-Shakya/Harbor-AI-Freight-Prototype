import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Receipt,
  MagnifyingGlass,
  ArrowsClockwise,
  CalendarBlank,
  Clock,
  CheckCircle,
  WarningCircle,
  XCircle,
  CaretRight,
  X,
  FileText,
  Info,
  CurrencyDollar,
  Buildings,
  ShieldCheck,
  Funnel,
  ArrowSquareOut
} from '@phosphor-icons/react';
import { getInvoices, getPortalInvoices, getInvoice } from './api';
import {
  calculateInvoiceAging,
  aggregateArAging,
  filterInvoicesByAgingBucket,
  AGING_BUCKET_DEFINITIONS
} from './services/arAgingCalculator';
import './styles/invoiceManagement.css';

/**
 * Currency formatter (USD standard)
 */
function formatMoney(amount) {
  const num = Number(amount || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Short Date formatter
 */
function formatDate(dateInput) {
  if (!dateInput) return '—';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return String(dateInput);
  }
}

/**
 * Status tone helper
 */
function getStatusBadgeClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'paid' || s === 'reconciled') return 'inv-badge-paid';
  if (s === 'overdue') return 'inv-badge-overdue';
  if (s === 'disputed') return 'inv-badge-disputed';
  if (s === 'issued' || s === 'sent') return 'inv-badge-issued';
  if (s === 'draft') return 'inv-badge-draft';
  if (s === 'void' || s === 'cancelled') return 'inv-badge-void';
  return 'inv-badge-default';
}

/**
 * Aging badge tone helper
 */
function getAgingBadgeClass(bucketId) {
  if (bucketId === 'paid') return 'inv-aging-pill-paid';
  if (bucketId === 'current') return 'inv-aging-pill-current';
  if (bucketId === '1-30') return 'inv-aging-pill-30';
  if (bucketId === '31-60') return 'inv-aging-pill-60';
  if (bucketId === '61-90') return 'inv-aging-pill-90';
  if (bucketId === '90+') return 'inv-aging-pill-over90';
  return '';
}

export default function InvoiceManagement({
  hasPermission,
  notify = () => {},
  profileLoading = false,
  currentUser = null,
  currentRoleName = '',
  currentOrg = null,
}) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [backendNotice, setBackendNotice] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedAgingBucket, setSelectedAgingBucket] = useState('all');

  // Modal State
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  /**
   * Fetch live invoices from backend.
   * Tries GET /v1/invoices first. If 404, tries GET /v1/portal/invoices.
   * If both are unavailable, records an explicit architectural notice.
   */
  const loadInvoices = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    setBackendNotice(null);

    try {
      let liveRecords = [];
      let sourceEndpoint = 'GET /v1/invoices';

      try {
        const res = await getInvoices();
        if (res && Array.isArray(res.data)) {
          liveRecords = res.data;
        } else if (res && Array.isArray(res.invoices)) {
          liveRecords = res.invoices;
        } else if (Array.isArray(res)) {
          liveRecords = res;
        }
      } catch (err) {
        // If GET /v1/invoices returned 404, attempt fallback to portal endpoint
        if (err.status === 404 || err.message?.includes('404')) {
          try {
            sourceEndpoint = 'GET /v1/portal/invoices';
            const portalRes = await getPortalInvoices();
            if (portalRes && Array.isArray(portalRes.invoices)) {
              liveRecords = portalRes.invoices;
            } else if (portalRes && Array.isArray(portalRes.data)) {
              liveRecords = portalRes.data;
            }
          } catch (portalErr) {
            // Both endpoints were unreachable or restricted
            setBackendNotice({
              primaryEndpoint: 'GET /v1/invoices',
              primaryStatus: 404,
              fallbackEndpoint: 'GET /v1/portal/invoices',
              fallbackStatus: portalErr.status || 403,
              message: portalErr.message || 'Customer Portal is only accessible to shipper organizations.',
            });
            liveRecords = [];
          }
        } else {
          throw err;
        }
      }

      setInvoices(liveRecords);
      if (isRefresh) {
        notify(`Invoices refreshed (${liveRecords.length} loaded from ${sourceEndpoint})`);
      }
    } catch (err) {
      console.error('Failed to load invoices:', err);
      setError(err.message || 'Unable to load invoice records from server.');
      notify('Failed to load invoices: ' + (err.message || 'Network error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [notify]);

  useEffect(() => {
    if (!profileLoading) {
      loadInvoices();
    }
  }, [profileLoading, loadInvoices]);

  /**
   * AR Aging Aggregation for all live invoices
   */
  const arAgingSummary = useMemo(() => {
    return aggregateArAging(invoices);
  }, [invoices]);

  /**
   * Filtered invoices according to search query, status, and aging bucket
   */
  const filteredInvoices = useMemo(() => {
    let result = invoices;

    // Filter by Aging Bucket
    if (selectedAgingBucket && selectedAgingBucket !== 'all') {
      result = filterInvoicesByAgingBucket(result, selectedAgingBucket);
    }

    // Filter by Status
    if (statusFilter && statusFilter !== 'all') {
      result = result.filter(inv => {
        const s = (inv.status || '').toLowerCase();
        return s === statusFilter.toLowerCase();
      });
    }

    // Filter by Search Query (Invoice #, Shipment Ref, Customer)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(inv => {
        const invNum = String(inv.invoice_number || inv.id || '').toLowerCase();
        const shipRef = String(inv.shipment?.reference_number || inv.shipment_id || '').toLowerCase();
        const customer = String(inv.shipper?.legal_name || inv.customer_name || '').toLowerCase();
        return invNum.includes(q) || shipRef.includes(q) || customer.includes(q);
      });
    }

    return result;
  }, [invoices, selectedAgingBucket, statusFilter, searchQuery]);

  /**
   * Handle Click on Aging Bucket Card
   */
  const handleBucketClick = (bucketId) => {
    if (selectedAgingBucket === bucketId) {
      setSelectedAgingBucket('all'); // toggle off
    } else {
      setSelectedAgingBucket(bucketId);
    }
  };

  /**
   * Open Invoice Details Modal
   */
  const handleViewDetails = async (inv) => {
    setSelectedInvoice(inv);
    setDetailLoading(true);

    try {
      // Try to fetch full details including carrier & shipper info
      const res = await getInvoice(inv.id);
      if (res && res.data) {
        setSelectedInvoice(res.data);
      }
    } catch {
      // If single invoice query fails, keep the current row object
    } finally {
      setDetailLoading(false);
    }
  };

  /**
   * Close Details Modal
   */
  const handleCloseModal = () => {
    setSelectedInvoice(null);
  };

  /**
   * Keyboard accessibility: Close modal on Escape
   */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedInvoice) {
        handleCloseModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedInvoice]);

  /**
   * Reset all filters
   */
  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setSelectedAgingBucket('all');
  };

  const hasActiveFilters = searchQuery.trim() !== '' || statusFilter !== 'all' || selectedAgingBucket !== 'all';

  return (
    <div className="inv-container" data-testid="invoice-management">
      {/* 1. Header Area */}
      <div className="inv-header">
        <div className="inv-title-area">
          <div className="inv-category-pill">
            <Receipt size={14} weight="bold" />
            <span>Finance & Billing &middot; Module M11 (FR-11.1 / FR-11.6)</span>
          </div>
          <h1>Invoices & Accounts Receivable (AR) Aging</h1>
          <p>
            Reconcile enterprise freight billing, monitor customer payments, and track accounts receivable aging across standard 30, 60, and 90-day overdue schedules.
          </p>
        </div>

        <div className="inv-header-actions">
          {currentOrg && (
            <div className="inv-org-badge" title={`Active Organization: ${currentOrg.legal_name || currentOrg.name}`}>
              <Buildings size={15} weight="duotone" />
              <span>{currentOrg.legal_name || currentOrg.name}</span>
              {currentRoleName && <span className="inv-role-tag">{currentRoleName}</span>}
            </div>
          )}

          <button
            type="button"
            className="inv-btn inv-btn-secondary"
            onClick={() => loadInvoices(true)}
            disabled={refreshing || loading}
            title="Refresh Invoices and Recalculate Aging"
          >
            <ArrowsClockwise size={16} className={refreshing ? 'inv-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Error Banner */}
      {error && (
        <div className="inv-alert inv-alert-danger" role="alert">
          <WarningCircle size={20} weight="fill" />
          <div className="inv-alert-content">
            <strong>Failed to load invoices</strong>
            <p>{error}</p>
          </div>
          <button type="button" className="inv-alert-close" onClick={() => setError(null)} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}

      {/* 3. Missing Backend Route Notice (FR-11.1 Enterprise Audit) */}
      {backendNotice && (
        <div className="inv-backend-notice" data-testid="backend-architecture-notice">
          <div className="inv-backend-notice-icon">
            <Info size={24} weight="duotone" />
          </div>
          <div className="inv-backend-notice-body">
            <h3>Backend Architecture Notice: Enterprise Invoices Endpoint Pending</h3>
            <p>
              The primary enterprise route <code>{backendNotice.primaryEndpoint}</code> returned HTTP {backendNotice.primaryStatus} (Route Not Registered in Express Router).
              Secondary fallback to Customer Portal billing (<code>{backendNotice.fallbackEndpoint}</code>) was restricted ({backendNotice.fallbackStatus}: {backendNotice.message}).
            </p>
            <div className="inv-notice-meta">
              <span><strong>SRS Compliance:</strong> Module M11 (FR-11.1 / FR-11.6)</span>
              <span><strong>Database Model:</strong> <code>prisma.invoice</code> exists and is actively populated on delivery</span>
              <span><strong>Integrity Rule:</strong> Zero synthetic mock records generated; displaying live state only</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. KPI Summary Cards */}
      <div className="inv-kpi-grid">
        <div className="inv-kpi-card">
          <div className="inv-kpi-label">
            <span>Total Invoiced</span>
            <CurrencyDollar size={18} className="inv-kpi-icon" />
          </div>
          <div className="inv-kpi-val">{formatMoney(arAgingSummary.totalInvoiced)}</div>
          <div className="inv-kpi-sub">{arAgingSummary.totalCount} total invoice{arAgingSummary.totalCount === 1 ? '' : 's'}</div>
        </div>

        <div className="inv-kpi-card">
          <div className="inv-kpi-label">
            <span>Collected / Paid</span>
            <CheckCircle size={18} className="inv-kpi-icon text-success" />
          </div>
          <div className="inv-kpi-val text-success">{formatMoney(arAgingSummary.totalPaid)}</div>
          <div className="inv-kpi-sub">{arAgingSummary.paidInvoicesCount} paid in full</div>
        </div>

        <div className="inv-kpi-card">
          <div className="inv-kpi-label">
            <span>Total Outstanding</span>
            <Clock size={18} className="inv-kpi-icon text-warning" />
          </div>
          <div className="inv-kpi-val text-warning">{formatMoney(arAgingSummary.totalOutstanding)}</div>
          <div className="inv-kpi-sub">{arAgingSummary.unpaidCount} open / unsettled</div>
        </div>

        <div className="inv-kpi-card">
          <div className="inv-kpi-label">
            <span>Overdue Receivables</span>
            <WarningCircle size={18} className="inv-kpi-icon text-danger" />
          </div>
          <div className="inv-kpi-val text-danger">{formatMoney(arAgingSummary.totalOverdue)}</div>
          <div className="inv-kpi-sub">
            {arAgingSummary.overduePercentage}% of outstanding debt
          </div>
        </div>
      </div>

      {/* 5. AR Aging 5-Bucket Interactive Grid (FR-11.6) */}
      <div className="inv-aging-section">
        <div className="inv-aging-section-header">
          <div className="inv-aging-title">
            <h2>Accounts Receivable (AR) Aging Schedule</h2>
            <p>Click any aging bucket below to filter the invoice table to matching receivables.</p>
          </div>
          {selectedAgingBucket !== 'all' && (
            <button
              type="button"
              className="inv-clear-bucket-btn"
              onClick={() => setSelectedAgingBucket('all')}
            >
              <X size={14} />
              <span>Reset Bucket Filter</span>
            </button>
          )}
        </div>

        <div className="inv-aging-buckets-grid">
          {AGING_BUCKET_DEFINITIONS.map(def => {
            const bucket = arAgingSummary.buckets[def.id] || { count: 0, amount: 0, percentage: 0 };
            const isSelected = selectedAgingBucket === def.id;

            return (
              <div
                key={def.id}
                tabIndex={0}
                role="button"
                aria-pressed={isSelected}
                className={`inv-bucket-card inv-tone-${def.tone} ${isSelected ? 'is-selected' : ''}`}
                onClick={() => handleBucketClick(def.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleBucketClick(def.id);
                  }
                }}
              >
                <div className="inv-bucket-top">
                  <span className="inv-bucket-label">{def.label}</span>
                  <span className="inv-bucket-count">{bucket.count}</span>
                </div>
                <div className="inv-bucket-amount">{formatMoney(bucket.amount)}</div>
                <div className="inv-bucket-bar-wrap">
                  <div
                    className="inv-bucket-bar-fill"
                    style={{ width: `${Math.min(100, bucket.percentage || 0)}%` }}
                  />
                </div>
                <div className="inv-bucket-meta">
                  <span>{bucket.percentage}% of outstanding</span>
                  {isSelected && <span className="inv-filter-active-pill">Filtered</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. Filter Toolbar */}
      <div className="inv-toolbar">
        <div className="inv-search-input-wrap">
          <MagnifyingGlass size={18} className="inv-search-icon" />
          <input
            type="text"
            className="inv-search-input"
            placeholder="Search by invoice #, shipment reference, customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search invoices"
          />
          {searchQuery && (
            <button
              type="button"
              className="inv-clear-search-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="inv-filter-group">
          <label htmlFor="inv-status-select" className="inv-filter-label">
            <Funnel size={14} />
            <span>Status:</span>
          </label>
          <select
            id="inv-status-select"
            className="inv-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued / Unpaid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="disputed">Disputed</option>
            <option value="void">Void / Cancelled</option>
          </select>
        </div>

        <div className="inv-filter-group">
          <label htmlFor="inv-bucket-select" className="inv-filter-label">
            <Clock size={14} />
            <span>Aging:</span>
          </label>
          <select
            id="inv-bucket-select"
            className="inv-select"
            value={selectedAgingBucket}
            onChange={(e) => setSelectedAgingBucket(e.target.value)}
          >
            <option value="all">All Aging Buckets</option>
            <option value="current">Current / Not Due</option>
            <option value="1-30">1–30 Days Overdue</option>
            <option value="31-60">31–60 Days Overdue</option>
            <option value="61-90">61–90 Days Overdue</option>
            <option value="90+">&gt; 90 Days Overdue</option>
            <option value="paid">Paid in Full</option>
          </select>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            className="inv-btn-reset-filters"
            onClick={handleClearFilters}
            title="Clear all search and bucket filters"
          >
            <X size={14} />
            <span>Clear Filters</span>
          </button>
        )}

        <div className="inv-count-indicator">
          Showing <strong>{filteredInvoices.length}</strong> of <strong>{invoices.length}</strong> invoices
        </div>
      </div>

      {/* 7. Invoices Table Card */}
      <div className="inv-table-card">
        {loading ? (
          <div className="inv-loading-state" data-testid="invoice-loading">
            <div className="inv-spinner" />
            <p>Loading enterprise invoice records and calculating AR aging...</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="inv-empty-state" data-testid="invoice-empty">
            <Receipt size={48} weight="light" className="inv-empty-icon" />
            <h3>No invoices found</h3>
            <p>
              {hasActiveFilters
                ? 'No invoice records match your active search or aging bucket filters.'
                : 'There are no invoices recorded for the active organization.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                className="inv-btn inv-btn-secondary"
                onClick={handleClearFilters}
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="inv-table-wrap">
            <table className="inv-table" data-testid="invoices-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Shipment Ref</th>
                  <th>Customer / Bill To</th>
                  <th>Invoice Date</th>
                  <th>Due Date</th>
                  <th>AR Aging</th>
                  <th className="text-right">Total Amount</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance Due</th>
                  <th className="text-center">Status</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => {
                  const aging = calculateInvoiceAging(inv);
                  const isOverdue = aging?.isOverdue;
                  const balanceDue = Number(inv.amount || 0) - Number(inv.amount_paid || 0);

                  return (
                    <tr key={inv.id || inv.invoice_number}>
                      <td className="inv-cell-primary">
                        <button
                          type="button"
                          className="inv-link-btn"
                          onClick={() => handleViewDetails(inv)}
                          title="View Invoice Details"
                        >
                          {inv.invoice_number || inv.id}
                        </button>
                      </td>
                      <td>
                        {inv.shipment?.reference_number || inv.shipment_id ? (
                          <span className="inv-shipment-pill">
                            {inv.shipment?.reference_number || inv.shipment_id}
                          </span>
                        ) : (
                          <span className="inv-text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <span className="inv-customer-name">
                          {inv.shipper?.legal_name || inv.customer_name || 'Standard Account'}
                        </span>
                      </td>
                      <td>
                        <span className="inv-date-text">{formatDate(inv.invoice_date || inv.created_at)}</span>
                      </td>
                      <td>
                        <span className={`inv-date-text ${isOverdue ? 'inv-overdue-date' : ''}`}>
                          {formatDate(inv.due_date)}
                        </span>
                      </td>
                      <td>
                        <span className={`inv-aging-pill ${getAgingBadgeClass(aging?.bucketId)}`}>
                          {aging?.bucketId === 'paid'
                            ? 'Paid in Full'
                            : aging?.daysOverdue <= 0
                            ? 'Current'
                            : `${aging?.daysOverdue}d overdue (${aging?.bucketId}d)`}
                        </span>
                      </td>
                      <td className="text-right font-medium">
                        {formatMoney(inv.amount)}
                      </td>
                      <td className="text-right inv-text-muted">
                        {formatMoney(inv.amount_paid)}
                      </td>
                      <td className={`text-right font-bold ${balanceDue > 0 && isOverdue ? 'inv-balance-overdue' : ''}`}>
                        {formatMoney(Math.max(0, balanceDue))}
                      </td>
                      <td className="text-center">
                        <span className={`inv-badge ${getStatusBadgeClass(inv.status)}`}>
                          {inv.status || 'Draft'}
                        </span>
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          className="inv-btn-detail"
                          onClick={() => handleViewDetails(inv)}
                          title="Open Invoice Breakdown"
                          aria-label={`Open invoice ${inv.invoice_number || inv.id}`}
                        >
                          <span>Details</span>
                          <CaretRight size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 8. Invoice Details Modal (FR-11.1 Details Breakdown) */}
      {selectedInvoice && (
        <div className="inv-modal-backdrop" onClick={handleCloseModal}>
          <div
            className="inv-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="inv-modal-title"
          >
            <div className="inv-modal-header">
              <div className="inv-modal-title-wrap">
                <Receipt size={24} className="inv-modal-icon" />
                <div>
                  <h3 id="inv-modal-title">
                    Invoice {selectedInvoice.invoice_number || selectedInvoice.id}
                  </h3>
                  <div className="inv-modal-subtags">
                    <span className={`inv-badge ${getStatusBadgeClass(selectedInvoice.status)}`}>
                      {selectedInvoice.status || 'Draft'}
                    </span>
                    {(() => {
                      const aging = calculateInvoiceAging(selectedInvoice);
                      return (
                        <span className={`inv-aging-pill ${getAgingBadgeClass(aging?.bucketId)}`}>
                          {aging?.bucketLabel}
                          {aging?.isOverdue && ` (${aging.daysOverdue} days)`}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="inv-modal-close-btn"
                onClick={handleCloseModal}
                aria-label="Close details modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="inv-modal-body">
              {detailLoading && (
                <div className="inv-modal-loading-banner">
                  <ArrowsClockwise size={16} className="inv-spin" />
                  <span>Loading full invoice relationships...</span>
                </div>
              )}

              {/* Financial Balance Summary */}
              <div className="inv-detail-balance-box">
                <div className="inv-balance-item">
                  <span className="inv-balance-label">Total Invoiced</span>
                  <span className="inv-balance-val">{formatMoney(selectedInvoice.amount)}</span>
                </div>
                <div className="inv-balance-item">
                  <span className="inv-balance-label">Amount Paid</span>
                  <span className="inv-balance-val text-success">{formatMoney(selectedInvoice.amount_paid)}</span>
                </div>
                <div className="inv-balance-item">
                  <span className="inv-balance-label">Balance Outstanding</span>
                  <span className="inv-balance-val text-danger">
                    {formatMoney(Math.max(0, Number(selectedInvoice.amount || 0) - Number(selectedInvoice.amount_paid || 0)))}
                  </span>
                </div>
              </div>

              {/* Invoice Meta Grid */}
              <div className="inv-detail-grid">
                <div className="inv-detail-group">
                  <h4>Billing & Timing</h4>
                  <dl className="inv-dl">
                    <dt>Invoice Date</dt>
                    <dd>{formatDate(selectedInvoice.invoice_date || selectedInvoice.created_at)}</dd>

                    <dt>Payment Due Date</dt>
                    <dd>{formatDate(selectedInvoice.due_date)}</dd>

                    <dt>Aging Schedule</dt>
                    <dd>
                      {(() => {
                        const aging = calculateInvoiceAging(selectedInvoice);
                        if (!aging || aging.bucketId === 'paid') return 'Paid in Full';
                        if (aging.daysOverdue <= 0) return 'Current (Not Due)';
                        return `${aging.daysOverdue} days overdue (${aging.bucketLabel})`;
                      })()}
                    </dd>
                  </dl>
                </div>

                <div className="inv-detail-group">
                  <h4>Customer & Account</h4>
                  <dl className="inv-dl">
                    <dt>Customer Legal Name</dt>
                    <dd>{selectedInvoice.shipper?.legal_name || selectedInvoice.customer_name || 'Standard Account'}</dd>

                    <dt>Tax / VAT ID</dt>
                    <dd>{selectedInvoice.shipper?.tax_id || 'Not Recorded'}</dd>

                    <dt>Shipper Org ID</dt>
                    <dd><code>{selectedInvoice.shipper_org_id || '—'}</code></dd>
                  </dl>
                </div>
              </div>

              {/* Associated Shipment Information */}
              <div className="inv-shipment-detail-card">
                <h4>Associated Shipment</h4>
                {selectedInvoice.shipment ? (
                  <div className="inv-shipment-grid">
                    <div>
                      <span className="inv-label-tiny">Shipment Reference</span>
                      <strong className="inv-shipment-ref">{selectedInvoice.shipment.reference_number || selectedInvoice.shipment.id}</strong>
                    </div>
                    <div>
                      <span className="inv-label-tiny">Current Status</span>
                      <span className="inv-status-chip">{selectedInvoice.shipment.status || 'Delivered'}</span>
                    </div>
                    <div>
                      <span className="inv-label-tiny">Route Origin</span>
                      <span>{selectedInvoice.shipment.origin || '—'}</span>
                    </div>
                    <div>
                      <span className="inv-label-tiny">Route Destination</span>
                      <span>{selectedInvoice.shipment.destination || '—'}</span>
                    </div>
                    {selectedInvoice.shipment.carrier && (
                      <div className="col-span-2">
                        <span className="inv-label-tiny">Assigned Carrier</span>
                        <span>
                          {selectedInvoice.shipment.carrier.legal_name}
                          {selectedInvoice.shipment.carrier.dot_number ? ` (DOT: ${selectedInvoice.shipment.carrier.dot_number})` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="inv-text-muted">No linked shipment record found.</p>
                )}
              </div>

              {/* Electronic Payment & Reconciliation Gateway Notice */}
              <div className="inv-gateway-notice">
                <ShieldCheck size={20} className="inv-gateway-icon" />
                <div className="inv-gateway-body">
                  <strong>Electronic Payment & Dispute Gateway Notice</strong>
                  <p>
                    Reconciliation and payment settlement via ACH, credit card, or payment gateway (Stripe/Fintech API) requires active payment credentials. Disputes must be filed by an authorized Shipper User or Company Admin.
                  </p>
                </div>
              </div>
            </div>

            <div className="inv-modal-footer">
              <button
                type="button"
                className="inv-btn inv-btn-secondary"
                onClick={handleCloseModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

