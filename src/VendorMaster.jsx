import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MagnifyingGlass,
  Plus,
  ArrowClockwise,
  Eye,
  NotePencil,
  Trash,
  Gear,
  CheckCircle,
  WarningCircle,
  X,
  CaretLeft,
  CaretRight,
  Truck,
  Info,
  ShieldCheck,
  FileText,
  Buildings,
  Phone,
  EnvelopeSimple,
  Globe,
  MapPin,
  Copy,
  Check,
  DownloadSimple,
} from '@phosphor-icons/react';
import {
  getVendors,
  getVendor,
  createVendor,
  updateVendor,
  updateVendorStatus,
  deleteVendor,
  getVendorCompliance,
  getVendorAuditLog,
  downloadComplianceDocument,
} from './api';
import './styles/vendorMaster.css';

/* ─── Constants ──────────────────────────────────────────────── */
const ALLOWED_STATUSES = ['active', 'suspended', 'terminated', 'pending'];
const STATUS_FILTER_OPTIONS = ['all', 'active', 'suspended', 'terminated', 'pending'];
const DEBOUNCE_MS = 350;

/* ─── Helpers ─────────────────────────────────────────────────── */
function statusBadgeClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'active':     return 'vm-badge vm-badge-active';
    case 'suspended':  return 'vm-badge vm-badge-suspended';
    case 'terminated': return 'vm-badge vm-badge-terminated';
    default:           return 'vm-badge vm-badge-pending';
  }
}

function safetyBadgeClass(rating) {
  switch ((rating || '').toLowerCase()) {
    case 'satisfactory':   return 'vm-safety-badge vm-safety-satisfactory';
    case 'conditional':    return 'vm-safety-badge vm-safety-conditional';
    case 'unsatisfactory': return 'vm-safety-badge vm-safety-unsatisfactory';
    default:               return 'vm-safety-badge vm-safety-none';
  }
}

function formatDate(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return val;
  }
}

function formatDateTime(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return val;
  }
}

function calcExpiryStatus(dateStr) {
  if (!dateStr) return { status: 'none', label: 'No expiration date' };
  const exp = new Date(dateStr).getTime();
  if (isNaN(exp)) return { status: 'none', label: '—' };
  const now = Date.now();
  const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return { status: 'expired', label: `Expired (${Math.abs(diffDays)}d ago)` };
  } else if (diffDays <= 30) {
    return { status: 'expiring', label: `Expires in ${diffDays}d` };
  } else {
    return { status: 'valid', label: `Valid (${diffDays}d left)` };
  }
}

/* ─── Modal Shell Component ───────────────────────────────────── */
function ModalShell({ title, onClose, children, wide = false }) {
  const boxRef = useRef(null);

  useEffect(() => {
    const before = document.activeElement;
    boxRef.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const focusable = [...boxRef.current.querySelectorAll(
          'button,input,select,textarea,a[href]'
        )].filter(x => !x.disabled);
        if (!focusable.length) return;
        if (e.shiftKey && document.activeElement === focusable[0]) {
          e.preventDefault();
          focusable[focusable.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
          e.preventDefault();
          focusable[0].focus();
        }
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={boxRef}
        tabIndex={-1}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

/* ─── Add / Edit Vendor Modal ─────────────────────────────────── */
function VendorFormModal({ vendor, onClose, onSuccess, notify }) {
  const isEdit = Boolean(vendor);

  const [form, setForm] = useState({
    legal_name:       vendor?.legal_name       ?? '',
    tax_id:           vendor?.tax_id           ?? '',
    mc_number:        vendor?.mc_number        ?? '',
    dot_number:       vendor?.dot_number       ?? '',
    operating_status: vendor?.operating_status ?? 'authorized',
    safety_rating:    vendor?.safety_rating    ?? 'satisfactory',
    status:           vendor?.status           ?? 'active',
    is_enterprise:    vendor?.is_enterprise    ?? false,
    address_line1:    vendor?.address_line1    ?? '',
    address_line2:    vendor?.address_line2    ?? '',
    city:             vendor?.city             ?? '',
    state:            vendor?.state            ?? '',
    country:          vendor?.country          ?? 'USA',
    postal_code:      vendor?.postal_code      ?? '',
    company_phone:    vendor?.company_phone    ?? '',
    company_email:    vendor?.company_email    ?? '',
    website:          vendor?.website          ?? '',
  });

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function validate() {
    const name = (form.legal_name || '').trim();
    if (!name) return 'Legal Name is required.';
    if (name.length < 2) return 'Legal Name must be at least 2 characters.';

    if (form.company_email && form.company_email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.company_email.trim())) {
        return 'Please enter a valid company email address.';
      }
    }

    if (form.company_phone && form.company_phone.trim().length > 30) {
      return 'Company phone must not exceed 30 characters.';
    }

    if (form.website && form.website.trim().length > 255) {
      return 'Website URL must not exceed 255 characters.';
    }

    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }

    setError('');
    setSaving(true);

    try {
      const payload = {
        legal_name:       form.legal_name.trim(),
        tax_id:           form.tax_id.trim() || undefined,
        mc_number:        form.mc_number.trim() || undefined,
        dot_number:       form.dot_number.trim() || undefined,
        operating_status: form.operating_status || undefined,
        safety_rating:    form.safety_rating || undefined,
        status:           form.status || undefined,
        is_enterprise:    Boolean(form.is_enterprise),
        address_line1:    form.address_line1.trim() || undefined,
        address_line2:    form.address_line2.trim() || undefined,
        city:             form.city.trim() || undefined,
        state:            form.state.trim() || undefined,
        country:          form.country.trim() || undefined,
        postal_code:      form.postal_code.trim() || undefined,
        company_phone:    form.company_phone.trim() || undefined,
        company_email:    form.company_email.trim() || undefined,
        website:          form.website.trim() || undefined,
      };

      if (isEdit) {
        await updateVendor(vendor.id, payload);
        notify('Vendor updated successfully.');
      } else {
        await createVendor(payload);
        notify('Vendor created successfully.');
      }
      onSuccess();
    } catch (ex) {
      setError(ex?.data?.message || ex.message || 'Failed to save vendor.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={isEdit ? `Edit Vendor — ${vendor.legal_name}` : 'Add New Vendor'}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} noValidate>
        <p className="vm-modal-description">
          {isEdit
            ? 'Update carrier credentials, FMCSA regulatory status, address, and dispatch contacts.'
            : 'Register a new motor carrier or service vendor. Type is fixed as carrier.'}
        </p>

        {error && (
          <div className="vm-form-error" role="alert">
            <WarningCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="vm-section-title">Identity & Regulatory</div>
        <div className="vm-form-grid">
          <label className="vm-form-full-width">
            Legal Name <span className="vm-required">*</span>
            <input
              type="text"
              value={form.legal_name}
              onChange={(e) => setForm(p => ({ ...p, legal_name: e.target.value }))}
              placeholder="e.g. Apex Freight Logistics LLC"
              required
              maxLength={200}
              autoFocus
            />
          </label>

          <label>
            Tax ID / EIN
            <input
              type="text"
              value={form.tax_id}
              onChange={(e) => setForm(p => ({ ...p, tax_id: e.target.value }))}
              placeholder="XX-XXXXXXX"
              maxLength={50}
            />
          </label>

          <label>
            USDOT Number
            <input
              type="text"
              value={form.dot_number}
              onChange={(e) => setForm(p => ({ ...p, dot_number: e.target.value }))}
              placeholder="e.g. 1234567"
              maxLength={50}
            />
          </label>

          <label>
            MC Number / FF Number
            <input
              type="text"
              value={form.mc_number}
              onChange={(e) => setForm(p => ({ ...p, mc_number: e.target.value }))}
              placeholder="e.g. MC-987654"
              maxLength={50}
            />
          </label>

          <label>
            FMCSA Operating Status
            <select
              value={form.operating_status}
              onChange={(e) => setForm(p => ({ ...p, operating_status: e.target.value }))}
            >
              <option value="authorized">Authorized</option>
              <option value="not_authorized">Not Authorized</option>
              <option value="pending">Pending</option>
            </select>
          </label>

          <label>
            SAFER Safety Rating
            <select
              value={form.safety_rating}
              onChange={(e) => setForm(p => ({ ...p, safety_rating: e.target.value }))}
            >
              <option value="satisfactory">Satisfactory</option>
              <option value="conditional">Conditional</option>
              <option value="unsatisfactory">Unsatisfactory</option>
              <option value="none">None / Not Rated</option>
            </select>
          </label>

          <label>
            Status
            <select
              value={form.status}
              onChange={(e) => setForm(p => ({ ...p, status: e.target.value }))}
            >
              <option value="active">Active</option>
              <option value="pending">Pending Review</option>
              <option value="suspended">Suspended</option>
              <option value="terminated">Terminated</option>
            </select>
          </label>

          <div className="vm-form-full-width">
            <label className="vm-checkbox-label">
              <input
                type="checkbox"
                checked={form.is_enterprise}
                onChange={(e) => setForm(p => ({ ...p, is_enterprise: e.target.checked }))}
              />
              Enterprise Carrier Account (Dedicated capacity & high priority)
            </label>
          </div>
        </div>

        <div className="vm-section-title">Physical Address</div>
        <div className="vm-form-grid">
          <label className="vm-form-full-width">
            Address Line 1
            <input
              type="text"
              value={form.address_line1}
              onChange={(e) => setForm(p => ({ ...p, address_line1: e.target.value }))}
              placeholder="Street address, P.O. box"
            />
          </label>

          <label className="vm-form-full-width">
            Address Line 2
            <input
              type="text"
              value={form.address_line2}
              onChange={(e) => setForm(p => ({ ...p, address_line2: e.target.value }))}
              placeholder="Suite, unit, building, floor"
            />
          </label>

          <label>
            City
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm(p => ({ ...p, city: e.target.value }))}
              placeholder="City"
            />
          </label>

          <label>
            State / Province
            <input
              type="text"
              value={form.state}
              onChange={(e) => setForm(p => ({ ...p, state: e.target.value }))}
              placeholder="State code (e.g. TX)"
            />
          </label>

          <label>
            Postal Code
            <input
              type="text"
              value={form.postal_code}
              onChange={(e) => setForm(p => ({ ...p, postal_code: e.target.value }))}
              placeholder="ZIP / Postal code"
            />
          </label>

          <label>
            Country
            <input
              type="text"
              value={form.country}
              onChange={(e) => setForm(p => ({ ...p, country: e.target.value }))}
              placeholder="Country"
            />
          </label>
        </div>

        <div className="vm-section-title">Operations & Contact Info</div>
        <div className="vm-form-grid">
          <label>
            Company Phone
            <input
              type="tel"
              value={form.company_phone}
              onChange={(e) => setForm(p => ({ ...p, company_phone: e.target.value }))}
              placeholder="+1 (555) 000-0000"
            />
          </label>

          <label>
            Dispatch / Operations Email
            <input
              type="email"
              value={form.company_email}
              onChange={(e) => setForm(p => ({ ...p, company_email: e.target.value }))}
              placeholder="dispatch@vendor.com"
            />
          </label>

          <label className="vm-form-full-width">
            Website
            <input
              type="url"
              value={form.website}
              onChange={(e) => setForm(p => ({ ...p, website: e.target.value }))}
              placeholder="https://www.vendor.com"
            />
          </label>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={saving}
          >
            {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Vendor')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Vendor Detail Modal (Overview, Compliance, Audit) ──────── */
function VendorDetailModal({
  vendorId,
  onClose,
  onEdit,
  onChangeStatus,
  canUpdate,
}) {
  const [tab, setTab] = useState('overview');
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Compliance state
  const [compliance, setCompliance] = useState(null);
  const [compLoading, setCompLoading] = useState(false);
  const [compError, setCompError] = useState('');

  // Audit state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditPagination, setAuditPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });

  // Copy helper
  const [copiedId, setCopiedId] = useState('');
  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator?.clipboard?.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(''), 2000);
  };

  // Load Vendor Base Data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    getVendor(vendorId)
      .then(res => {
        if (!cancelled) setVendor(res?.data || res);
      })
      .catch(ex => {
        if (!cancelled) setError(ex.message || 'Failed to load vendor details.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [vendorId]);

  // Load Compliance when tab opened
  useEffect(() => {
    if (tab === 'compliance' && !compliance && !compLoading) {
      setCompLoading(true);
      setCompError('');
      getVendorCompliance(vendorId)
        .then(res => setCompliance(res?.data || null))
        .catch(ex => setCompError(ex.message || 'Failed to load compliance details.'))
        .finally(() => setCompLoading(false));
    }
  }, [tab, vendorId, compliance, compLoading]);

  // Load Audit Log when tab opened or auditPage changed
  useEffect(() => {
    if (tab === 'audit') {
      setAuditLoading(true);
      setAuditError('');
      getVendorAuditLog(vendorId, { page: auditPage, limit: 10 })
        .then(res => {
          setAuditLogs(res?.data || []);
          setAuditPagination(res?.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 });
        })
        .catch(ex => setAuditError(ex.message || 'Failed to load audit history.'))
        .finally(() => setAuditLoading(false));
    }
  }, [tab, vendorId, auditPage]);

  return (
    <ModalShell
      title={vendor ? `${vendor.legal_name}` : 'Vendor Details'}
      onClose={onClose}
      wide
    >
      {loading && (
        <div className="vm-state-panel">
          <div className="vm-loading-spinner">
            <ArrowClockwise className="vm-spinning" size={20} />
            Loading vendor details…
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="vm-notice-banner error" role="alert">
          <WarningCircle size={20} />
          <div className="vm-notice-content">
            <strong>Error Loading Record</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {!loading && vendor && (
        <>
          {/* Tab Navigation */}
          <div className="vm-detail-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'overview'}
              className={`vm-tab-btn ${tab === 'overview' ? 'active' : ''}`}
              onClick={() => setTab('overview')}
            >
              <Buildings size={16} /> Overview & Profile
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'compliance'}
              className={`vm-tab-btn ${tab === 'compliance' ? 'active' : ''}`}
              onClick={() => setTab('compliance')}
            >
              <ShieldCheck size={16} /> Regulatory & Compliance
              {compliance?.documents?.length ? (
                <span className="vm-tab-badge">{compliance.documents.length}</span>
              ) : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'audit'}
              className={`vm-tab-btn ${tab === 'audit' ? 'active' : ''}`}
              onClick={() => setTab('audit')}
            >
              <FileText size={16} /> Audit Trail
            </button>
          </div>

          {/* TAB 1: OVERVIEW */}
          {tab === 'overview' && (
            <div>
              <div className="vm-section-title">Carrier Identity & Credentials</div>
              <div className="vm-detail-grid">
                <div className="vm-detail-field">
                  <span className="vm-detail-label">Legal Name</span>
                  <span className="vm-detail-value">{vendor.legal_name || '—'}</span>
                </div>
                <div className="vm-detail-field">
                  <span className="vm-detail-label">Status</span>
                  <span>
                    <span className={statusBadgeClass(vendor.status)}>
                      {vendor.status || '—'}
                    </span>
                  </span>
                </div>
                <div className="vm-detail-field">
                  <span className="vm-detail-label">Tax ID / EIN</span>
                  <span className="vm-detail-value mono">
                    {vendor.tax_id || '—'}
                    {vendor.tax_id && (
                      <button
                        type="button"
                        className="vm-action-btn"
                        title="Copy Tax ID"
                        onClick={() => copyToClipboard(vendor.tax_id, 'tax')}
                      >
                        {copiedId === 'tax' ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                      </button>
                    )}
                  </span>
                </div>
                <div className="vm-detail-field">
                  <span className="vm-detail-label">USDOT Number</span>
                  <span className="vm-detail-value mono">
                    {vendor.dot_number || '—'}
                    {vendor.dot_number && (
                      <button
                        type="button"
                        className="vm-action-btn"
                        title="Copy USDOT"
                        onClick={() => copyToClipboard(vendor.dot_number, 'dot')}
                      >
                        {copiedId === 'dot' ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                      </button>
                    )}
                  </span>
                </div>
                <div className="vm-detail-field">
                  <span className="vm-detail-label">MC / FF Number</span>
                  <span className="vm-detail-value mono">
                    {vendor.mc_number || '—'}
                    {vendor.mc_number && (
                      <button
                        type="button"
                        className="vm-action-btn"
                        title="Copy MC Number"
                        onClick={() => copyToClipboard(vendor.mc_number, 'mc')}
                      >
                        {copiedId === 'mc' ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                      </button>
                    )}
                  </span>
                </div>
                <div className="vm-detail-field">
                  <span className="vm-detail-label">Enterprise Carrier</span>
                  <span className="vm-detail-value">
                    {vendor.is_enterprise ? 'Yes (Dedicated capacity)' : 'No (Standard carrier)'}
                  </span>
                </div>
              </div>

              <div className="vm-section-title">Operating Location & Dispatch</div>
              <div className="vm-detail-grid">
                <div className="vm-detail-field vm-detail-full">
                  <span className="vm-detail-label">Operating Address</span>
                  <span className="vm-detail-value">
                    {[
                      vendor.address_line1,
                      vendor.address_line2,
                      vendor.city,
                      vendor.state,
                      vendor.postal_code,
                      vendor.country,
                    ].filter(Boolean).join(', ') || 'No address registered'}
                  </span>
                </div>
                <div className="vm-detail-field">
                  <span className="vm-detail-label">Dispatch Phone</span>
                  <span className="vm-detail-value">
                    {vendor.company_phone ? (
                      <a href={`tel:${vendor.company_phone}`} style={{ color: 'var(--blue)' }}>
                        {vendor.company_phone}
                      </a>
                    ) : '—'}
                  </span>
                </div>
                <div className="vm-detail-field">
                  <span className="vm-detail-label">Dispatch Email</span>
                  <span className="vm-detail-value">
                    {vendor.company_email ? (
                      <a href={`mailto:${vendor.company_email}`} style={{ color: 'var(--blue)' }}>
                        {vendor.company_email}
                      </a>
                    ) : '—'}
                  </span>
                </div>
                <div className="vm-detail-field">
                  <span className="vm-detail-label">Website</span>
                  <span className="vm-detail-value">
                    {vendor.website ? (
                      <a href={vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)' }}>
                        {vendor.website}
                      </a>
                    ) : '—'}
                  </span>
                </div>
                <div className="vm-detail-field">
                  <span className="vm-detail-label">Created Date</span>
                  <span className="vm-detail-value">{formatDate(vendor.created_at)}</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COMPLIANCE */}
          {tab === 'compliance' && (
            <div>
              {compLoading && (
                <div className="vm-state-panel">
                  <div className="vm-loading-spinner">
                    <ArrowClockwise className="vm-spinning" size={18} />
                    Loading regulatory verification…
                  </div>
                </div>
              )}

              {!compLoading && compError && (
                <div className="vm-notice-banner error">
                  <WarningCircle size={18} />
                  <span>{compError}</span>
                </div>
              )}

              {!compLoading && compliance && (
                <>
                  <div className="vm-compliance-cards">
                    <div className="vm-compliance-card">
                      <span className="vm-summary-card-label">FMCSA Operating Authority</span>
                      <span className={`vm-auth-badge ${compliance.operating_status === 'authorized' ? 'authorized' : 'not-authorized'}`}>
                        {compliance.operating_status === 'authorized' ? '✔ Authorized' : '✖ Not Authorized / Inactive'}
                      </span>
                      <span className="vm-summary-card-sub">Common/Contract carrier filing</span>
                    </div>

                    <div className="vm-compliance-card">
                      <span className="vm-summary-card-label">SAFER Safety Rating</span>
                      <div>
                        <span className={safetyBadgeClass(compliance.safety_rating)}>
                          {compliance.safety_rating || 'None'}
                        </span>
                      </div>
                      <span className="vm-summary-card-sub">FMCSA safety measurement</span>
                    </div>

                    <div className="vm-compliance-card">
                      <span className="vm-summary-card-label">Authority Re-Verification</span>
                      <span className="vm-detail-value font-medium">
                        {calcExpiryStatus(compliance.verification_expires_at).label}
                      </span>
                      <span className="vm-summary-card-sub">
                        Last verified: {formatDate(compliance.last_verified_at)}
                      </span>
                    </div>
                  </div>

                  <div className="vm-section-title">Verified Compliance Documents</div>
                  {compliance.documents && compliance.documents.length > 0 ? (
                    <div className="vm-doc-table-wrap">
                      <table className="vm-table">
                        <thead>
                          <tr>
                            <th>Document Title</th>
                            <th>Type</th>
                            <th>Expiration</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compliance.documents.map(doc => {
                            const exp = calcExpiryStatus(doc.expires_at);
                            return (
                              <tr key={doc.id}>
                                <td>
                                  <strong>{doc.title || doc.name || 'Compliance Document'}</strong>
                                  {doc.file_name && <span className="vm-carrier-sub">{doc.file_name}</span>}
                                </td>
                                <td>{doc.type ? doc.type.replace(/_/g, ' ') : 'General'}</td>
                                <td>
                                  <span>{formatDate(doc.expires_at)}</span>
                                  {doc.expires_at && (
                                    <span className="vm-carrier-sub" style={{ color: exp.status === 'expired' ? '#dc2626' : exp.status === 'expiring' ? '#d97706' : '#16a34a' }}>
                                      {exp.label}
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <span className={statusBadgeClass(doc.status || 'active')}>
                                    {doc.status || 'Active'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="vm-state-panel" style={{ padding: '30px 10px' }}>
                      <FileText size={30} />
                      <h3>No Compliance Documents on File</h3>
                      <p>Insurance certificates, W-9, and operating letters will appear here once verified.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 3: AUDIT TRAIL */}
          {tab === 'audit' && (
            <div>
              {auditLoading && (
                <div className="vm-state-panel">
                  <div className="vm-loading-spinner">
                    <ArrowClockwise className="vm-spinning" size={18} />
                    Loading audit trail…
                  </div>
                </div>
              )}

              {!auditLoading && auditError && (
                <div className="vm-notice-banner error">
                  <WarningCircle size={18} />
                  <span>{auditError}</span>
                </div>
              )}

              {!auditLoading && auditLogs && auditLogs.length > 0 ? (
                <>
                  <div className="vm-table-wrap" style={{ marginTop: '8px' }}>
                    <table className="vm-audit-table">
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Action</th>
                          <th>Actor</th>
                          <th>Reason / Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map(log => {
                          const oldVal = log.old_value;
                          const newVal = log.new_value;
                          const isStatus = log.action === 'VENDOR_STATUS_CHANGED' || log.action === 'VENDOR_DEACTIVATED';

                          return (
                            <tr key={log.id}>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {formatDateTime(log.created_at)}
                              </td>
                              <td>
                                <span className={statusBadgeClass(
                                  log.action === 'VENDOR_DEACTIVATED' ? 'terminated' :
                                  log.action === 'VENDOR_CREATED' ? 'active' : 'pending'
                                )}>
                                  {log.action ? log.action.replace('VENDOR_', '').replace(/_/g, ' ') : 'Event'}
                                </span>
                              </td>
                              <td>
                                <strong>{log.actor_name || 'System User'}</strong>
                                {log.actor_email && <span className="vm-carrier-sub">{log.actor_email}</span>}
                              </td>
                              <td>
                                {log.reason && (
                                  <div style={{ marginBottom: '4px', fontStyle: 'italic', color: 'var(--ink)' }}>
                                    "{log.reason}"
                                  </div>
                                )}
                                {isStatus && oldVal?.status && newVal?.status && (
                                  <span className="vm-diff-chip">
                                    status: <span className="vm-diff-old">{oldVal.status}</span>
                                    <span className="vm-diff-arrow">→</span>
                                    <span className="vm-diff-new">{newVal.status}</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Audit Pagination */}
                  {auditPagination.totalPages > 1 && (
                    <div className="vm-pagination-bar" style={{ marginTop: '10px' }}>
                      <span>Page {auditPagination.page} of {auditPagination.totalPages}</span>
                      <div className="vm-pagination-controls">
                        <button
                          type="button"
                          className="vm-pagination-btn"
                          disabled={auditPage <= 1}
                          onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                        >
                          <CaretLeft size={14} />
                        </button>
                        <button
                          type="button"
                          className="vm-pagination-btn"
                          disabled={auditPage >= auditPagination.totalPages}
                          onClick={() => setAuditPage(p => p + 1)}
                        >
                          <CaretRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                !auditLoading && (
                  <div className="vm-state-panel" style={{ padding: '30px 10px' }}>
                    <Info size={30} />
                    <h3>No Audit Entries</h3>
                    <p>All lifecycle and credential changes for this carrier will be recorded here.</p>
                  </div>
                )
              )}
            </div>
          )}

          {/* Modal Bottom Actions */}
          <div className="modal-actions" style={{ marginTop: '24px' }}>
            {canUpdate && (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    onClose();
                    onChangeStatus(vendor);
                  }}
                >
                  <Gear size={15} /> Change Status
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    onClose();
                    onEdit(vendor);
                  }}
                >
                  <NotePencil size={15} /> Edit Carrier
                </button>
              </>
            )}
            <button type="button" className="btn primary" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

/* ─── Status Change Modal (Mandatory Reason) ─────────────────── */
function StatusChangeModal({ vendor, onClose, onSuccess, notify, currentUser }) {
  const [status, setStatus] = useState(vendor?.status || 'active');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isPlatformAdmin = currentUser?.role?.name === 'Platform Admin';
  const isCurrentlyTerminated = vendor?.status === 'terminated';

  async function handleSave(e) {
    e.preventDefault();
    if (status === vendor.status) {
      setError(`Vendor is already in '${status}' status.`);
      return;
    }

    if (!reason.trim()) {
      setError('Please provide a mandatory reason for changing carrier status.');
      return;
    }

    if (isCurrentlyTerminated && !isPlatformAdmin) {
      setError("Cannot transition vendor from 'terminated' status. Only Platform Admins have this privilege.");
      return;
    }

    setSaving(true);
    setError('');

    try {
      await updateVendorStatus(vendor.id, status, reason.trim());
      notify(`Vendor status changed to "${status}".`);
      onSuccess();
    } catch (ex) {
      setError(ex?.data?.message || ex.message || 'Failed to update vendor status.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Update Status — ${vendor.legal_name}`} onClose={onClose}>
      <form onSubmit={handleSave}>
        <p className="vm-modal-description">
          Modify the operational lifecycle status of this carrier. An audit reason is mandatory for compliance.
        </p>

        {error && (
          <div className="vm-form-error" role="alert">
            <WarningCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="vm-status-options">
          <label
            className={`vm-status-option-btn ${status === 'active' ? 'selected' : ''}`}
            onClick={() => setStatus('active')}
          >
            <input
              type="radio"
              name="vendor_status"
              value="active"
              checked={status === 'active'}
              onChange={() => setStatus('active')}
            />
            <div>
              <span className="vm-status-option-label">Active</span>
              <span className="vm-status-option-desc">Carrier is fully qualified to haul freight and receive load awards.</span>
            </div>
          </label>

          <label
            className={`vm-status-option-btn ${status === 'suspended' ? 'selected' : ''}`}
            onClick={() => setStatus('suspended')}
          >
            <input
              type="radio"
              name="vendor_status"
              value="suspended"
              checked={status === 'suspended'}
              onChange={() => setStatus('suspended')}
            />
            <div>
              <span className="vm-status-option-label">Suspended</span>
              <span className="vm-status-option-desc">Temporarily holds load tendering due to insurance lapse or compliance audit.</span>
            </div>
          </label>

          <label
            className={`vm-status-option-btn ${status === 'pending' ? 'selected' : ''}`}
            onClick={() => setStatus('pending')}
          >
            <input
              type="radio"
              name="vendor_status"
              value="pending"
              checked={status === 'pending'}
              onChange={() => setStatus('pending')}
            />
            <div>
              <span className="vm-status-option-label">Pending Review</span>
              <span className="vm-status-option-desc">Onboarding documents and safety qualifications are under review.</span>
            </div>
          </label>

          <label
            className={`vm-status-option-btn danger-option ${status === 'terminated' ? 'selected' : ''}`}
            onClick={() => setStatus('terminated')}
          >
            <input
              type="radio"
              name="vendor_status"
              value="terminated"
              checked={status === 'terminated'}
              onChange={() => setStatus('terminated')}
            />
            <div>
              <span className="vm-status-option-label" style={{ color: '#dc2626' }}>Terminated</span>
              <span className="vm-status-option-desc">Permanently deactivates carrier relationship and disbars tendering.</span>
            </div>
          </label>
        </div>

        <div style={{ marginTop: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
            Audit Reason <span className="vm-required">*</span>
          </label>
          <textarea
            required
            rows={3}
            className="large-textarea"
            placeholder="Explain reason for status change (e.g. Annual safety renewal, COI expired, or management decision)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {status === 'terminated' && (
          <div className="vm-strong-warning">
            <WarningCircle size={18} />
            <span>
              Terminating a carrier blocks all future load bookings. Reverting out of terminated status requires Platform Admin authorization.
            </span>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            className={`btn ${status === 'terminated' ? 'danger' : 'primary'}`}
            disabled={saving || status === vendor.status || !reason.trim()}
          >
            {saving ? 'Applying…' : 'Apply Status Change'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Soft Delete / Terminate Modal ──────────────────────────── */
function DeleteConfirmModal({ vendor, onClose, onSuccess, notify }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setSaving(true);
    setError('');

    try {
      await deleteVendor(vendor.id);
      notify(`Vendor "${vendor.legal_name}" has been deactivated.`);
      onSuccess();
    } catch (ex) {
      setError(ex?.data?.message || ex.message || 'Failed to deactivate vendor.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Deactivate Carrier Vendor" onClose={onClose}>
      <div className="vm-notice-banner error">
        <WarningCircle size={20} />
        <div className="vm-notice-content">
          <strong>This action will soft-delete the carrier.</strong>
          <p>
            The record for <strong>{vendor?.legal_name}</strong> will be set to{' '}
            <em>terminated</em>. Historic shipments and invoices remain intact, but
            this vendor will no longer be available for dispatch operations.
          </p>
        </div>
      </div>

      {error && (
        <div className="vm-form-error" role="alert">
          <WarningCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="btn danger"
          onClick={handleConfirm}
          disabled={saving}
        >
          {saving ? 'Deactivating…' : 'Confirm Deactivation'}
        </button>
      </div>
    </ModalShell>
  );
}

/* ─── Main VendorMaster Component ─────────────────────────────── */
export default function VendorMaster({
  hasPermission,
  notify,
  profileLoading,
  currentUser,
}) {
  // RBAC checks - supports both ('vendors', 'read') and ('vendors.read')
  const canRead   = hasPermission ? (hasPermission('vendors', 'read') || hasPermission('vendors.read')) : true;
  const canCreate = hasPermission ? (hasPermission('vendors', 'create') || hasPermission('vendors.create')) : true;
  const canUpdate = hasPermission ? (hasPermission('vendors', 'update') || hasPermission('vendors.update')) : true;
  const canDelete = hasPermission ? (hasPermission('vendors', 'delete') || hasPermission('vendors.delete')) : true;

  // Tenant Guard: Shipper users must not access Vendor Master
  const isShipper =
    currentUser?.organization?.type === 'shipper' ||
    currentUser?.role?.name === 'Shipper User';

  // Data State
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });

  // Filter & Search State
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // Summary Metrics
  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    suspended: 0,
    pending: 0,
  });

  // Modal State
  const [modal, setModal] = useState(null); // { kind: 'add' | 'edit' | 'detail' | 'status' | 'delete', vendor: obj }

  // Debounced Search Handler
  const debounceTimer = useRef(null);
  const handleSearchChange = (val) => {
    setSearchInput(val);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setSearchQuery(val.trim());
      setPage(1);
    }, DEBOUNCE_MS);
  };

  // Fetch Vendors from real /v1/vendors API
  const fetchVendors = useCallback(async (opts = {}) => {
    if (profileLoading || !canRead || isShipper) return;
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('page', String(opts.page ?? page));
      params.set('limit', String(opts.limit ?? limit));

      const q = opts.search !== undefined ? opts.search : searchQuery;
      if (q) params.set('search', q);

      const sf = opts.status !== undefined ? opts.status : statusFilter;
      if (sf && sf !== 'all') params.set('status', sf);

      const res = await getVendors(params.toString());
      const data = res?.data || [];
      const pag = res?.pagination || { total: data.length, page: 1, limit: 10, totalPages: 1 };

      setVendors(data);
      setPagination(pag);

      // Compute summary from unfiltered first page load
      if (!q && (!sf || sf === 'all') && pag.page === 1) {
        setSummary({
          total: pag.total,
          active: data.filter(v => v.status === 'active').length,
          suspended: data.filter(v => v.status === 'suspended').length,
          pending: data.filter(v => v.status === 'pending').length,
        });
      }
    } catch (ex) {
      if (ex.status === 401 || ex.status === 403) {
        setError(ex.status === 401
          ? 'Your session has expired. Please sign in again.'
          : (ex?.data?.message || 'You do not have permission to access Vendor Master.'));
      } else {
        setError(ex.message || 'Unable to load vendor records.');
      }
    } finally {
      setLoading(false);
    }
  }, [profileLoading, canRead, isShipper, page, limit, searchQuery, statusFilter]);

  // Initial and reactive load
  useEffect(() => {
    if (!profileLoading && canRead && !isShipper) {
      fetchVendors();
    }
  }, [profileLoading, canRead, isShipper, fetchVendors]);

  function handleReset() {
    setSearchInput('');
    setSearchQuery('');
    setStatusFilter('all');
    setPage(1);
  }

  function closeModal() {
    setModal(null);
  }

  function afterMutation() {
    closeModal();
    fetchVendors();
  }

  /* ─── Profile Loading Guard ─────────────────────────────────── */
  if (profileLoading) {
    return (
      <div className="vendor-master">
        <div className="vm-table-wrap">
          <div className="vm-state-panel">
            <div className="vm-loading-spinner">
              <ArrowClockwise className="vm-spinning" size={22} />
              Loading permissions and vendor configurations…
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Shipper User Blocked Guard ────────────────────────────── */
  if (isShipper) {
    return (
      <div className="vendor-master">
        <div className="vm-state-panel">
          <WarningCircle size={40} color="#dc2626" />
          <h3>Carrier Operations Restricted</h3>
          <p>
            Vendor Master is restricted to internal carrier management and dispatch operations.
            Shipper customer accounts are not permitted to access vendor records.
          </p>
        </div>
      </div>
    );
  }

  /* ─── Permission Guard ──────────────────────────────────────── */
  if (!canRead) {
    return (
      <div className="vendor-master">
        <div className="vm-state-panel">
          <ShieldCheck size={40} color="#d97706" />
          <h3>Access Restricted</h3>
          <p>You do not have the required <strong>vendors.read</strong> permission to access Vendor Master.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="vendor-master">
      {/* ── Page Header ── */}
      <div className="vm-page-header">
        <div className="vm-page-header-left">
          <h1>Vendor Master</h1>
          <p>Manage motor carriers, draymen, and freight service vendors registered in this platform.</p>
        </div>

        <div className="vm-header-actions">
          <button
            type="button"
            className="btn"
            onClick={() => fetchVendors()}
            title="Refresh vendor records"
          >
            <ArrowClockwise size={17} />
            Refresh
          </button>
          {canCreate && (
            <button
              type="button"
              className="btn primary"
              onClick={() => setModal({ kind: 'add' })}
            >
              <Plus size={18} />
              Add Vendor
            </button>
          )}
        </div>
      </div>

      {/* ── Summary KPI Cards ── */}
      <div className="vm-summary-cards">
        <div className="vm-summary-card">
          <span className="vm-summary-card-label">Total Carriers</span>
          <span className="vm-summary-card-value">
            {loading ? '—' : pagination.total}
          </span>
          <span className="vm-summary-card-sub">Registered vendor organizations</span>
        </div>

        <div className="vm-summary-card">
          <span className="vm-summary-card-label">Active Carriers</span>
          <span className="vm-summary-card-value active">
            {loading ? '—' : summary.active}
          </span>
          <span className="vm-summary-card-sub">Authorized for dispatch & awards</span>
        </div>

        <div className="vm-summary-card">
          <span className="vm-summary-card-label">Suspended</span>
          <span className="vm-summary-card-value suspended">
            {loading ? '—' : summary.suspended}
          </span>
          <span className="vm-summary-card-sub">Insurance or compliance hold</span>
        </div>

        <div className="vm-summary-card">
          <span className="vm-summary-card-label">Pending Review</span>
          <span className="vm-summary-card-value pending">
            {loading ? '—' : summary.pending}
          </span>
          <span className="vm-summary-card-sub">Onboarding & SAFER review</span>
        </div>
      </div>

      {/* ── Search & Filter Toolbar ── */}
      <div className="vm-toolbar">
        <div className="search-input">
          <MagnifyingGlass size={18} />
          <input
            aria-label="Search vendors by name, MC, DOT, or Tax ID"
            placeholder="Search by legal name, MC#, DOT#, or Tax ID…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        <select
          className="vm-status-select"
          aria-label="Filter by lifecycle status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="terminated">Terminated</option>
        </select>

        <select
          className="vm-limit-select"
          aria-label="Records per page"
          value={limit}
          onChange={(e) => {
            setLimit(Number(e.target.value));
            setPage(1);
          }}
        >
          <option value={10}>10 per page</option>
          <option value={20}>20 per page</option>
          <option value={50}>50 per page</option>
        </select>

        {(searchQuery || statusFilter !== 'all') && (
          <button
            type="button"
            className="vm-reset-btn"
            onClick={handleReset}
            title="Reset filters"
          >
            <X size={15} /> Reset
          </button>
        )}
      </div>

      {/* ── Notice / Error Banner ── */}
      {error && (
        <div className="vm-notice-banner error" role="alert">
          <WarningCircle size={20} />
          <div className="vm-notice-content">
            <strong>Error</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* ── Main Records Table ── */}
      <div className="vm-table-wrap">
        {loading ? (
          <div className="vm-state-panel">
            <div className="vm-loading-spinner">
              <ArrowClockwise className="vm-spinning" size={22} />
              Loading vendor records…
            </div>
          </div>
        ) : vendors.length === 0 ? (
          <div className="vm-state-panel">
            <Truck size={38} />
            <h3>No Vendor Records Found</h3>
            <p>
              {searchQuery || statusFilter !== 'all'
                ? 'No carriers match your active search or status criteria. Try clearing filters.'
                : 'No carrier vendor organizations are registered in this workspace.'}
            </p>
            {canCreate && !searchQuery && statusFilter === 'all' && (
              <button
                type="button"
                className="btn primary"
                style={{ marginTop: '12px' }}
                onClick={() => setModal({ kind: 'add' })}
              >
                <Plus size={16} /> Add First Vendor
              </button>
            )}
          </div>
        ) : (
          <table className="vm-table" aria-label="Carrier vendors list">
            <thead>
              <tr>
                <th>Carrier / Vendor</th>
                <th>FMCSA Identifiers</th>
                <th>Operating Authority</th>
                <th>Location & Dispatch</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id}>
                  {/* Carrier Name */}
                  <td>
                    <button
                      type="button"
                      className="vm-table-link"
                      onClick={() => setModal({ kind: 'detail', vendor: v })}
                    >
                      <Truck size={17} style={{ color: 'var(--muted)' }} />
                      <strong>{v.legal_name}</strong>
                    </button>
                    <span className="vm-carrier-sub">
                      {v.is_enterprise ? '★ Enterprise Partner · ' : ''}ID: #{v.id}
                    </span>
                  </td>

                  {/* FMCSA Identifiers */}
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {v.dot_number ? (
                        <span className="vm-mono-cell">DOT: <strong>{v.dot_number}</strong></span>
                      ) : (
                        <span className="vm-carrier-sub">DOT: —</span>
                      )}
                      {v.mc_number ? (
                        <span className="vm-mono-cell">MC: <strong>{v.mc_number}</strong></span>
                      ) : (
                        <span className="vm-carrier-sub">MC: —</span>
                      )}
                    </div>
                  </td>

                  {/* Operating Authority & Safety */}
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className={`vm-auth-badge ${v.operating_status === 'authorized' ? 'authorized' : 'not-authorized'}`}>
                        {v.operating_status === 'authorized' ? '✔ Authorized' : '✖ Not Authorized'}
                      </span>
                      {v.safety_rating && (
                        <span>
                          <span className={safetyBadgeClass(v.safety_rating)}>
                            {v.safety_rating}
                          </span>
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Location & Contact */}
                  <td>
                    <div>
                      <span>
                        {[v.city, v.state].filter(Boolean).join(', ') || v.country || '—'}
                      </span>
                      {v.company_phone && (
                        <span className="vm-carrier-sub">{v.company_phone}</span>
                      )}
                    </div>
                  </td>

                  {/* Status Badge */}
                  <td>
                    <span className={statusBadgeClass(v.status)}>
                      {v.status || 'Active'}
                    </span>
                  </td>

                  {/* Row Actions */}
                  <td>
                    <div className="vm-actions-cell">
                      <button
                        type="button"
                        className="vm-action-btn"
                        title="View Carrier Details"
                        aria-label={`View ${v.legal_name}`}
                        onClick={() => setModal({ kind: 'detail', vendor: v })}
                      >
                        <Eye size={17} />
                      </button>

                      {canUpdate && (
                        <>
                          <button
                            type="button"
                            className="vm-action-btn"
                            title="Edit Carrier"
                            aria-label={`Edit ${v.legal_name}`}
                            onClick={() => setModal({ kind: 'edit', vendor: v })}
                          >
                            <NotePencil size={17} />
                          </button>
                          <button
                            type="button"
                            className="vm-action-btn"
                            title="Change Lifecycle Status"
                            aria-label={`Change status for ${v.legal_name}`}
                            onClick={() => setModal({ kind: 'status', vendor: v })}
                          >
                            <Gear size={17} />
                          </button>
                        </>
                      )}

                      {canDelete && v.status !== 'terminated' && (
                        <button
                          type="button"
                          className="vm-action-btn danger"
                          title="Deactivate Carrier"
                          aria-label={`Deactivate ${v.legal_name}`}
                          onClick={() => setModal({ kind: 'delete', vendor: v })}
                        >
                          <Trash size={17} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination Footer ── */}
      {!loading && vendors.length > 0 && (
        <div className="vm-pagination-bar">
          <span className="vm-pagination-info">
            Showing {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            <strong>{pagination.total}</strong> vendors
          </span>

          <div className="vm-pagination-controls">
            <button
              type="button"
              className="vm-pagination-btn"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <CaretLeft size={16} />
            </button>

            <span>
              Page {pagination.page} of {pagination.totalPages || 1}
            </span>

            <button
              type="button"
              className="vm-pagination-btn"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(p => p + 1)}
              aria-label="Next page"
            >
              <CaretRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Modal Dispatcher ── */}
      {modal?.kind === 'add' && (
        <VendorFormModal
          onClose={closeModal}
          onSuccess={afterMutation}
          notify={notify}
        />
      )}

      {modal?.kind === 'edit' && (
        <VendorFormModal
          vendor={modal.vendor}
          onClose={closeModal}
          onSuccess={afterMutation}
          notify={notify}
        />
      )}

      {modal?.kind === 'detail' && (
        <VendorDetailModal
          vendorId={modal.vendor.id}
          onClose={closeModal}
          onEdit={(v) => setModal({ kind: 'edit', vendor: v })}
          onChangeStatus={(v) => setModal({ kind: 'status', vendor: v })}
          canUpdate={canUpdate}
        />
      )}

      {modal?.kind === 'status' && (
        <StatusChangeModal
          vendor={modal.vendor}
          onClose={closeModal}
          onSuccess={afterMutation}
          notify={notify}
          currentUser={currentUser}
        />
      )}

      {modal?.kind === 'delete' && (
        <DeleteConfirmModal
          vendor={modal.vendor}
          onClose={closeModal}
          onSuccess={afterMutation}
          notify={notify}
        />
      )}
    </div>
  );
}
