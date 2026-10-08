import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MagnifyingGlass,
  Plus,
  ArrowClockwise,
  Eye,
  NotePencil,
  Trash,
  ShieldCheck,
  CheckCircle,
  WarningCircle,
  X,
  CaretLeft,
  CaretRight,
  IdentificationBadge,
  Info,
  Buildings,
  Phone,
  EnvelopeSimple,
  Globe,
  MapPin,
  Copy,
  Check,
  LockKey,
} from '@phosphor-icons/react';
import {
  getAgents,
  getAgent,
  createAgent,
  updateAgent,
  updateAgentStatus,
  deleteAgent,
  getAgentAuditLog,
} from './api';
import './styles/agentMaster.css';

/* ─── Constants ──────────────────────────────────────────────── */
const ALLOWED_STATUSES = ['active', 'suspended', 'terminated', 'pending'];
const STATUS_FILTER_OPTIONS = ['all', 'active', 'suspended', 'terminated', 'pending'];
const DEBOUNCE_MS = 350;

/* ─── Helpers ─────────────────────────────────────────────────── */
function statusBadgeClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'active':     return 'am-badge am-badge-active';
    case 'suspended':  return 'am-badge am-badge-suspended';
    case 'terminated': return 'am-badge am-badge-terminated';
    default:           return 'am-badge am-badge-pending';
  }
}

function formatDate(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return val;
  }
}

function formatDateTime(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return val;
  }
}

function maskTaxId(taxId) {
  if (!taxId) return '—';
  const clean = String(taxId).trim();
  if (clean.length <= 4) return clean;
  const last4 = clean.slice(-4);
  return `XX-XXX${last4}`;
}

function actionBadgeClass(action) {
  switch (action) {
    case 'AGENT_CREATED':        return 'am-audit-action-chip created';
    case 'AGENT_UPDATED':        return 'am-audit-action-chip updated';
    case 'AGENT_STATUS_CHANGED': return 'am-audit-action-chip status';
    case 'AGENT_DEACTIVATED':    return 'am-audit-action-chip deactivated';
    default:                     return 'am-audit-action-chip';
  }
}

function actionDisplayLabel(action) {
  switch (action) {
    case 'AGENT_CREATED':        return 'Agent Created';
    case 'AGENT_UPDATED':        return 'Agent Updated';
    case 'AGENT_STATUS_CHANGED': return 'Status Changed';
    case 'AGENT_DEACTIVATED':    return 'Agent Deactivated';
    default:                     return action || 'Audit Event';
  }
}

function mapApiError(err) {
  if (!err) return 'An unexpected error occurred.';
  const msg = err.message || '';
  if (err.status === 409 || msg.includes('already exists')) {
    if (msg.includes('MC number')) return 'An agent with this MC number already exists.';
    if (msg.includes('DOT number')) return 'An agent with this DOT number already exists.';
    if (msg.includes('tax_id') || msg.includes('tax ID')) return 'An agent with this Tax ID already exists.';
    if (msg.includes('legal name') || msg.includes('legal_name')) return 'An agent with this legal name already exists.';
    return msg || 'A duplicate record already exists.';
  }
  if (err.status === 403 || msg.includes('Permission denied') || msg.includes('not permitted')) {
    return 'Permission denied: You do not have sufficient privileges for this operation.';
  }
  return msg || 'An error occurred while processing the request.';
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
        const focusable = [
          ...boxRef.current.querySelectorAll(
            'button,input,select,textarea,a[href]'
          ),
        ].filter((x) => !x.disabled);
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

/* ─── Add / Edit Agent Modal ──────────────────────────────────── */
function AgentFormModal({ agent, onClose, onSuccess, notify }) {
  const isEdit = Boolean(agent);

  const [form, setForm] = useState({
    legal_name:       agent?.legal_name       ?? '',
    tax_id:           agent?.tax_id           ?? '',
    mc_number:        agent?.mc_number        ?? '',
    dot_number:       agent?.dot_number       ?? '',
    operating_status: agent?.operating_status ?? 'authorized',
    safety_rating:    agent?.safety_rating    ?? 'satisfactory',
    status:           agent?.status           ?? 'active',
    is_enterprise:    agent?.is_enterprise    ?? false,
    address_line1:    agent?.address_line1    ?? '',
    address_line2:    agent?.address_line2    ?? '',
    city:             agent?.city             ?? '',
    state:            agent?.state            ?? '',
    country:          agent?.country          ?? 'USA',
    postal_code:      agent?.postal_code      ?? '',
    company_phone:    agent?.company_phone    ?? '',
    company_email:    agent?.company_email    ?? '',
    website:          agent?.website          ?? '',
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
    if (err) {
      setError(err);
      return;
    }

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
        country:          form.country.trim() || 'USA',
        postal_code:      form.postal_code.trim() || undefined,
        company_phone:    form.company_phone.trim() || undefined,
        company_email:    form.company_email.trim() || undefined,
        website:          form.website.trim() || undefined,
      };

      if (isEdit) {
        await updateAgent(agent.id, payload);
        notify('Agent updated successfully.');
      } else {
        await createAgent(payload);
        notify('Agent created successfully.');
      }
      onSuccess();
    } catch (ex) {
      setError(mapApiError(ex));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={isEdit ? `Edit Agent — ${agent.legal_name}` : 'Add New Agent'}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} noValidate>
        <p className="am-modal-description">
          {isEdit
            ? 'Update freight broker credentials, FMCSA authority, physical address, and operations contacts.'
            : 'Register a new freight broker or intermediary agent. Type is fixed as broker.'}
        </p>

        {error && (
          <div className="am-form-error" role="alert">
            <WarningCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="am-modal-sections">
          {/* Section 1: Agent Information & Authority */}
          <div className="am-modal-section">
            <div className="am-section-header">
              <h4>Agent Information & Authority</h4>
              <p>Legal entity name, tax credentials, and FMCSA regulatory authority</p>
            </div>
            <div className="am-form-grid">
              <label className="am-form-full-width">
                Legal Name <span className="am-required">*</span>
                <input
                  type="text"
                  value={form.legal_name}
                  onChange={(e) => setForm((p) => ({ ...p, legal_name: e.target.value }))}
                  placeholder="e.g. Apex Brokerage Logistics LLC"
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
                  onChange={(e) => setForm((p) => ({ ...p, tax_id: e.target.value }))}
                  placeholder="XX-XXXXXXX"
                  maxLength={50}
                />
              </label>

              <label>
                MC Number / FF Number
                <input
                  type="text"
                  value={form.mc_number}
                  onChange={(e) => setForm((p) => ({ ...p, mc_number: e.target.value }))}
                  placeholder="e.g. MC-123456"
                  maxLength={50}
                />
              </label>

              <label>
                USDOT Number
                <input
                  type="text"
                  value={form.dot_number}
                  onChange={(e) => setForm((p) => ({ ...p, dot_number: e.target.value }))}
                  placeholder="e.g. 7654321"
                  maxLength={50}
                />
              </label>

              <label>
                Operating Authority Status
                <select
                  value={form.operating_status}
                  onChange={(e) => setForm((p) => ({ ...p, operating_status: e.target.value }))}
                >
                  <option value="authorized">Authorized</option>
                  <option value="not_authorized">Not Authorized</option>
                  <option value="pending">Pending</option>
                </select>
              </label>

              <label className="am-form-full-width">
                Safety Rating
                <select
                  value={form.safety_rating}
                  onChange={(e) => setForm((p) => ({ ...p, safety_rating: e.target.value }))}
                >
                  <option value="satisfactory">Satisfactory</option>
                  <option value="conditional">Conditional</option>
                  <option value="unsatisfactory">Unsatisfactory</option>
                  <option value="none">None / Not Rated</option>
                </select>
              </label>

              <div className="am-form-full-width">
                <label className="am-checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.is_enterprise}
                    onChange={(e) => setForm((p) => ({ ...p, is_enterprise: e.target.checked }))}
                  />
                  Enterprise Broker / Agent Account (Dedicated volume partner)
                </label>
              </div>
            </div>
          </div>

          {/* Section 2: Physical Address */}
          <div className="am-modal-section">
            <div className="am-section-header">
              <h4>Physical Address</h4>
              <p>Official corporate location and postal details</p>
            </div>
            <div className="am-form-grid">
              <label className="am-form-full-width">
                Address Line 1
                <input
                  type="text"
                  value={form.address_line1}
                  onChange={(e) => setForm((p) => ({ ...p, address_line1: e.target.value }))}
                  placeholder="Street address, P.O. box"
                />
              </label>

              <label className="am-form-full-width">
                Address Line 2
                <input
                  type="text"
                  value={form.address_line2}
                  onChange={(e) => setForm((p) => ({ ...p, address_line2: e.target.value }))}
                  placeholder="Suite, unit, building, floor"
                />
              </label>

              <label>
                City
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  placeholder="City"
                />
              </label>

              <label>
                State / Province
                <input
                  type="text"
                  value={form.state}
                  onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                  placeholder="State code (e.g. IL, TX)"
                />
              </label>

              <label>
                Postal Code
                <input
                  type="text"
                  value={form.postal_code}
                  onChange={(e) => setForm((p) => ({ ...p, postal_code: e.target.value }))}
                  placeholder="ZIP / Postal code"
                />
              </label>

              <label>
                Country
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                  placeholder="Country"
                />
              </label>
            </div>
          </div>

          {/* Section 3: Contact & Operations */}
          <div className="am-modal-section">
            <div className="am-section-header">
              <h4>Contact & Operations Channels</h4>
              <p>Direct communication channels and dispatch contact info</p>
            </div>
            <div className="am-form-grid">
              <label>
                Company Phone
                <input
                  type="tel"
                  value={form.company_phone}
                  onChange={(e) => setForm((p) => ({ ...p, company_phone: e.target.value }))}
                  placeholder="+1 (555) 000-0000"
                />
              </label>

              <label>
                Operations / Brokerage Email
                <input
                  type="email"
                  value={form.company_email}
                  onChange={(e) => setForm((p) => ({ ...p, company_email: e.target.value }))}
                  placeholder="dispatch@broker.com"
                />
              </label>

              <label className="am-form-full-width">
                Website
                <input
                  type="url"
                  value={form.website}
                  onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                  placeholder="https://www.agentlogistics.com"
                />
              </label>
            </div>
          </div>

          {/* Section 4: Lifecycle Status */}
          <div className="am-modal-section">
            <div className="am-section-header">
              <h4>Lifecycle Status</h4>
              <p>Operational partner standing within the freight network</p>
            </div>
            <div className="am-form-grid">
              <label className="am-form-full-width">
                Lifecycle Status
                <select
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="active">Active — Authorized for broker assignments</option>
                  <option value="pending">Pending Review — Verification in progress</option>
                  <option value="suspended">Suspended — Temporarily on hold</option>
                  <option value="terminated">Terminated — Inactive partner</option>
                </select>
              </label>
            </div>
          </div>
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
            {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Agent')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Agent Detail Modal (Overview, Contact, Audit Trail) ─────── */
function AgentDetailModal({
  agentId,
  onClose,
  onEdit,
  onChangeStatus,
  canUpdate,
}) {
  const [tab, setTab] = useState('overview');
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedField, setCopiedField] = useState(null);

  // Audit state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditPagination, setAuditPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });

  // Load single agent
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    getAgent(agentId)
      .then((res) => {
        if (!cancelled) setAgent(res?.data || res);
      })
      .catch((ex) => {
        if (!cancelled) setError(mapApiError(ex));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  // Load Audit Log when audit tab active
  useEffect(() => {
    if (tab === 'audit') {
      setAuditLoading(true);
      setAuditError('');
      getAgentAuditLog(agentId, { page: auditPage, limit: 10 })
        .then((res) => {
          setAuditLogs(res?.data || []);
          setAuditPagination(res?.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 });
        })
        .catch((ex) => setAuditError(mapApiError(ex)))
        .finally(() => setAuditLoading(false));
    }
  }, [tab, agentId, auditPage]);

  function copyToClipboard(val, fieldKey) {
    if (!val) return;
    navigator.clipboard?.writeText(val);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 1800);
  }

  return (
    <ModalShell
      title={agent ? agent.legal_name : 'Agent Details'}
      onClose={onClose}
      wide
    >
      {loading && (
        <div className="am-empty-state" style={{ padding: '40px 10px' }}>
          <ArrowClockwise className="toggle-collapsed-icon" size={28} />
          <h3>Loading Agent Profile…</h3>
        </div>
      )}

      {error && !loading && (
        <div className="am-error-state" style={{ margin: '16px 0' }}>
          <div className="am-error-icon">
            <WarningCircle size={28} />
          </div>
          <h3>Failed to Load Agent</h3>
          <p>{error}</p>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      )}

      {agent && !loading && (
        <div>
          {/* Header Meta */}
          <div className="am-detail-header-meta">
            <span className={statusBadgeClass(agent.status)}>
              {agent.status ? agent.status.charAt(0).toUpperCase() + agent.status.slice(1) : 'Active'}
            </span>

            {agent.is_enterprise && (
              <span className="am-enterprise-tag">ENTERPRISE AGENT</span>
            )}

            <span className="am-detail-id">Org ID: #{agent.id}</span>
            <span className="am-detail-id">Type: {agent.type || 'broker'}</span>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              {canUpdate && (
                <>
                  <button
                    className="btn"
                    style={{ fontSize: '12.5px', padding: '6px 12px' }}
                    onClick={() => onEdit(agent)}
                  >
                    <NotePencil size={15} /> Edit
                  </button>
                  <button
                    className="btn"
                    style={{ fontSize: '12.5px', padding: '6px 12px' }}
                    onClick={() => onChangeStatus(agent)}
                  >
                    <ShieldCheck size={15} /> Status
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="am-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'overview'}
              className={`am-tab-btn ${tab === 'overview' ? 'active' : ''}`}
              onClick={() => setTab('overview')}
            >
              <Buildings size={16} /> Overview
            </button>
            <button
              role="tab"
              aria-selected={tab === 'contact'}
              className={`am-tab-btn ${tab === 'contact' ? 'active' : ''}`}
              onClick={() => setTab('contact')}
            >
              <Phone size={16} /> Contact & Operations
            </button>
            <button
              role="tab"
              aria-selected={tab === 'audit'}
              className={`am-tab-btn ${tab === 'audit' ? 'active' : ''}`}
              onClick={() => setTab('audit')}
            >
              <Info size={16} /> Audit Trail
              {auditPagination.total > 0 && (
                <span className="am-tab-count">{auditPagination.total}</span>
              )}
            </button>
          </div>

          {/* Overview Tab Content */}
          {tab === 'overview' && (
            <div>
              <div className="am-section-title">Identity & Authority</div>
              <div className="am-detail-grid">
                <div className="am-detail-card">
                  <span className="am-detail-card-label">Legal Name</span>
                  <span className="am-detail-card-value font-medium">{agent.legal_name || '—'}</span>
                </div>
                <div className="am-detail-card">
                  <span className="am-detail-card-label">Tax ID / EIN</span>
                  <span className="am-detail-card-value mono">{agent.tax_id ? maskTaxId(agent.tax_id) : '—'}</span>
                </div>
                <div className="am-detail-card">
                  <span className="am-detail-card-label">MC Number / Freight Forwarder</span>
                  <span className="am-detail-card-value mono">{agent.mc_number || '—'}</span>
                </div>
                <div className="am-detail-card">
                  <span className="am-detail-card-label">USDOT Number</span>
                  <span className="am-detail-card-value mono">{agent.dot_number || '—'}</span>
                </div>
                <div className="am-detail-card">
                  <span className="am-detail-card-label">Operating Authority</span>
                  <span className="am-detail-card-value">
                    {agent.operating_status ? agent.operating_status.replace(/_/g, ' ') : 'Authorized'}
                  </span>
                </div>
                <div className="am-detail-card">
                  <span className="am-detail-card-label">Safety Rating</span>
                  <span className="am-detail-card-value">
                    {agent.safety_rating ? agent.safety_rating.charAt(0).toUpperCase() + agent.safety_rating.slice(1) : 'Satisfactory'}
                  </span>
                </div>
                <div className="am-detail-card">
                  <span className="am-detail-card-label">Created Date</span>
                  <span className="am-detail-card-value">{formatDate(agent.created_at)}</span>
                </div>
                <div className="am-detail-card">
                  <span className="am-detail-card-label">Last Updated</span>
                  <span className="am-detail-card-value">{formatDateTime(agent.updated_at)}</span>
                </div>
              </div>

              <div className="am-section-title">Physical Address</div>
              <div className="am-detail-card" style={{ marginBottom: '16px' }}>
                <span className="am-detail-card-label">Registered Office</span>
                <span className="am-detail-card-value">
                  {agent.address_line1 ? (
                    <>
                      {agent.address_line1}
                      {agent.address_line2 && <>, {agent.address_line2}</>}
                      <br />
                      {[agent.city, agent.state, agent.postal_code].filter(Boolean).join(', ')}
                      {agent.country && <> · {agent.country}</>}
                    </>
                  ) : (
                    'No physical address registered'
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Contact Tab Content */}
          {tab === 'contact' && (
            <div>
              <div className="am-section-title">Direct Operations Contact</div>
              <div className="am-detail-grid">
                <div className="am-detail-card">
                  <span className="am-detail-card-label">Company Phone</span>
                  <span className="am-detail-card-value">
                    {agent.company_phone ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <a href={`tel:${agent.company_phone}`} style={{ color: 'var(--blue, #005fdc)', textDecoration: 'none' }}>
                          {agent.company_phone}
                        </a>
                        <button
                          className="am-search-clear-btn"
                          title="Copy phone"
                          onClick={() => copyToClipboard(agent.company_phone, 'phone')}
                        >
                          {copiedField === 'phone' ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                        </button>
                      </div>
                    ) : '—'}
                  </span>
                </div>

                <div className="am-detail-card">
                  <span className="am-detail-card-label">Operations / Brokerage Email</span>
                  <span className="am-detail-card-value">
                    {agent.company_email ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <a href={`mailto:${agent.company_email}`} style={{ color: 'var(--blue, #005fdc)', textDecoration: 'none' }}>
                          {agent.company_email}
                        </a>
                        <button
                          className="am-search-clear-btn"
                          title="Copy email"
                          onClick={() => copyToClipboard(agent.company_email, 'email')}
                        >
                          {copiedField === 'email' ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                        </button>
                      </div>
                    ) : '—'}
                  </span>
                </div>

                <div className="am-detail-card" style={{ gridColumn: '1 / -1' }}>
                  <span className="am-detail-card-label">Website</span>
                  <span className="am-detail-card-value">
                    {agent.website ? (
                      <a
                        href={agent.website.startsWith('http') ? agent.website : `https://${agent.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--blue, #005fdc)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Globe size={15} /> {agent.website}
                      </a>
                    ) : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Audit Trail Tab Content */}
          {tab === 'audit' && (
            <div>
              <div className="am-section-title">Lifecycle & Modification History</div>
              {auditLoading && (
                <div className="am-empty-state" style={{ padding: '30px 10px' }}>
                  <ArrowClockwise size={24} />
                  <p>Loading audit trail…</p>
                </div>
              )}

              {auditError && (
                <div className="am-form-error" role="alert">
                  <WarningCircle size={18} />
                  <span>{auditError}</span>
                </div>
              )}

              {!auditLoading && !auditError && auditLogs.length === 0 && (
                <div className="am-empty-state" style={{ padding: '30px 10px' }}>
                  <Info size={28} />
                  <h3>No Audit Events Found</h3>
                  <p>Changes and status transitions will appear here.</p>
                </div>
              )}

              {!auditLoading && auditLogs.length > 0 && (
                <>
                  <div className="am-audit-table-wrap">
                    <table className="am-audit-table">
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Action</th>
                          <th>Actor</th>
                          <th>Change / Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((log) => {
                          let diffNode = null;
                          if (log.old_value && log.new_value) {
                            try {
                              const oldObj = typeof log.old_value === 'string' ? JSON.parse(log.old_value) : log.old_value;
                              const newObj = typeof log.new_value === 'string' ? JSON.parse(log.new_value) : log.new_value;
                              const keys = Object.keys(newObj).filter(
                                (k) => oldObj[k] !== newObj[k] && !['updated_at', 'created_at'].includes(k)
                              );
                              if (keys.length > 0) {
                                diffNode = (
                                  <div>
                                    {keys.map((k) => (
                                      <span key={k} className="am-diff-chip">
                                        <strong>{k}:</strong>{' '}
                                        <span className="am-diff-old">{String(oldObj[k] ?? 'empty')}</span>
                                        <span className="am-diff-arrow">→</span>
                                        <span className="am-diff-new">{String(newObj[k] ?? 'empty')}</span>
                                      </span>
                                    ))}
                                  </div>
                                );
                              }
                            } catch {
                              // non JSON
                            }
                          }

                          return (
                            <tr key={log.id}>
                              <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                                {formatDateTime(log.created_at)}
                              </td>
                              <td>
                                <span className={actionBadgeClass(log.action)}>
                                  {actionDisplayLabel(log.action)}
                                </span>
                              </td>
                              <td style={{ fontSize: '12.5px' }}>
                                <strong>{log.actor_name || 'System / Admin'}</strong>
                                {log.actor_email && (
                                  <div style={{ color: 'var(--muted, #506484)', fontSize: '11.5px' }}>
                                    {log.actor_email}
                                  </div>
                                )}
                              </td>
                              <td>
                                {log.reason && (
                                  <div style={{ fontStyle: 'italic', marginBottom: '4px', fontSize: '12px' }}>
                                    "{log.reason}"
                                  </div>
                                )}
                                {diffNode}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Audit Pagination */}
                  {auditPagination.totalPages > 1 && (
                    <div className="am-pagination" style={{ marginTop: '10px' }}>
                      <span>
                        Page {auditPagination.page} of {auditPagination.totalPages} ({auditPagination.total} events)
                      </span>
                      <div className="am-pagination-pages">
                        <button
                          className="am-page-btn"
                          disabled={auditPagination.page <= 1}
                          onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                        >
                          <CaretLeft size={14} />
                        </button>
                        <button
                          className="am-page-btn"
                          disabled={auditPagination.page >= auditPagination.totalPages}
                          onClick={() => setAuditPage((p) => p + 1)}
                        >
                          <CaretRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: '24px' }}>
            <button className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

/* ─── Status Change Modal ─────────────────────────────────────── */
function AgentStatusModal({ agent, onClose, onSuccess, notify }) {
  const [status, setStatus] = useState(agent?.status || 'active');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('An audit reason is required for status changes.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await updateAgentStatus(agent.id, status, reason.trim());
      notify(`Agent status updated to '${status}'.`);
      onSuccess();
    } catch (ex) {
      setError(mapApiError(ex));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Update Status — ${agent.legal_name}`} onClose={onClose}>
      <form onSubmit={handleSave}>
        <p className="am-modal-description">
          Modify the operational lifecycle status of this broker agent. An audit reason is mandatory for compliance.
        </p>

        {error && (
          <div className="am-form-error" role="alert">
            <WarningCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="am-status-options">
          <label
            className={`am-status-option-btn ${status === 'active' ? 'selected' : ''}`}
            onClick={() => setStatus('active')}
          >
            <input
              type="radio"
              name="agent_status"
              value="active"
              checked={status === 'active'}
              onChange={() => setStatus('active')}
            />
            <div>
              <span className="am-status-option-label">Active</span>
              <span className="am-status-option-desc">Agent is fully authorized to broker shipments and coordinate loads.</span>
            </div>
          </label>

          <label
            className={`am-status-option-btn ${status === 'suspended' ? 'selected' : ''}`}
            onClick={() => setStatus('suspended')}
          >
            <input
              type="radio"
              name="agent_status"
              value="suspended"
              checked={status === 'suspended'}
              onChange={() => setStatus('suspended')}
            />
            <div>
              <span className="am-status-option-label">Suspended</span>
              <span className="am-status-option-desc">Temporarily halts load brokering due to licensing review or financial audit.</span>
            </div>
          </label>

          <label
            className={`am-status-option-btn ${status === 'pending' ? 'selected' : ''}`}
            onClick={() => setStatus('pending')}
          >
            <input
              type="radio"
              name="agent_status"
              value="pending"
              checked={status === 'pending'}
              onChange={() => setStatus('pending')}
            />
            <div>
              <span className="am-status-option-label">Pending Review</span>
              <span className="am-status-option-desc">Broker onboarding credentials and authority bond are under review.</span>
            </div>
          </label>

          <label
            className={`am-status-option-btn danger-option ${status === 'terminated' ? 'selected' : ''}`}
            onClick={() => setStatus('terminated')}
          >
            <input
              type="radio"
              name="agent_status"
              value="terminated"
              checked={status === 'terminated'}
              onChange={() => setStatus('terminated')}
            />
            <div>
              <span className="am-status-option-label" style={{ color: '#dc2626' }}>Terminated</span>
              <span className="am-status-option-desc">Permanently deactivates broker agency relationship and disbars tendering.</span>
            </div>
          </label>
        </div>

        <div style={{ marginTop: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
            Audit Reason <span className="am-required">*</span>
          </label>
          <textarea
            required
            rows={3}
            className="large-textarea"
            placeholder="Explain reason for status change (e.g. Authority bond renewal, quarterly audit, or contract termination)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {status === 'terminated' && (
          <div className="am-strong-warning" role="alert">
            <WarningCircle size={18} />
            <span>
              <strong>Warning:</strong> Marking this agent as Terminated will soft-delete their active status. The broker will not be available for new freight bookings.
            </span>
          </div>
        )}

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
            {saving ? 'Updating…' : 'Update Status'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Deactivate / Terminate Confirmation Modal ───────────────── */
function AgentDeactivateModal({ agent, onClose, onSuccess, notify }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setSaving(true);
    setError('');

    try {
      await deleteAgent(agent.id, reason.trim() || undefined);
      notify(`Agent '${agent.legal_name}' deactivated successfully.`);
      onSuccess();
    } catch (ex) {
      setError(mapApiError(ex));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Deactivate Agent — ${agent.legal_name}`} onClose={onClose}>
      <p className="am-modal-description">
        Are you sure you want to deactivate <strong>{agent.legal_name}</strong>?
        This will set the broker organization status to <strong>Terminated</strong> and record an audit log entry.
      </p>

      {error && (
        <div className="am-form-error" role="alert">
          <WarningCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div style={{ marginTop: '12px', marginBottom: '18px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
          Deactivation Reason (Optional)
        </label>
        <textarea
          rows={3}
          className="large-textarea"
          placeholder="State reason for deactivation (e.g. Brokerage contract expired, partner request)..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
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

/* ─── Main AgentMaster Component ──────────────────────────────── */
export default function AgentMaster({
  hasPermission,
  notify,
  profileLoading,
  currentUser,
}) {
  // RBAC checks - supports both ('agents', 'read') and ('agents.read')
  const canRead   = hasPermission ? (hasPermission('agents', 'read') || hasPermission('agents.read')) : true;
  const canCreate = hasPermission ? (hasPermission('agents', 'create') || hasPermission('agents.create')) : true;
  const canUpdate = hasPermission ? (hasPermission('agents', 'update') || hasPermission('agents.update')) : true;
  const canDelete = hasPermission ? (hasPermission('agents', 'delete') || hasPermission('agents.delete')) : true;

  // Tenant / Role Guard: Shipper users and Driver users are strictly blocked from Agent Master
  const isShipper =
    currentUser?.organization?.type === 'shipper' ||
    currentUser?.role?.name === 'Shipper User';
  const isDriver =
    currentUser?.role?.name === 'Driver';

  const isBlocked = !canRead || isShipper || isDriver;

  // Data State
  const [agents, setAgents] = useState([]);
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
  const [modal, setModal] = useState(null); // { kind: 'add' | 'edit' | 'detail' | 'status' | 'delete', agent: obj }

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

  // Fetch KPI Summary Metrics
  const fetchSummaryMetrics = useCallback(async () => {
    if (profileLoading || isBlocked) return;
    try {
      const [allRes, activeRes, suspendedRes, pendingRes] = await Promise.all([
        getAgents('limit=1'),
        getAgents('limit=1&status=active'),
        getAgents('limit=1&status=suspended'),
        getAgents('limit=1&status=pending'),
      ]);

      setSummary({
        total: allRes?.pagination?.total ?? 0,
        active: activeRes?.pagination?.total ?? 0,
        suspended: suspendedRes?.pagination?.total ?? 0,
        pending: pendingRes?.pagination?.total ?? 0,
      });
    } catch {
      // Fallback silently if individual count requests fail
    }
  }, [profileLoading, isBlocked]);

  // Fetch Agents from real /v1/agents API
  const fetchAgents = useCallback(async (opts = {}) => {
    if (profileLoading || isBlocked) return;
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

      const res = await getAgents(params.toString());
      const data = res?.data || [];
      const pag = res?.pagination || { total: data.length, page: 1, limit: 10, totalPages: 1 };

      setAgents(data);
      setPagination(pag);
    } catch (ex) {
      if (ex.status === 401 || ex.status === 403) {
        setError(
          ex.status === 401
            ? 'Your session has expired. Please sign in again.'
            : (ex?.data?.message || 'You do not have permission to access Agent Master.')
        );
      } else {
        setError(ex.message || 'Unable to load agent records.');
      }
    } finally {
      setLoading(false);
    }
  }, [profileLoading, isBlocked, page, limit, searchQuery, statusFilter]);

  // Initial and reactive load
  useEffect(() => {
    if (!profileLoading && !isBlocked) {
      fetchAgents();
      fetchSummaryMetrics();
    }
  }, [profileLoading, isBlocked, fetchAgents, fetchSummaryMetrics]);

  function handleReset() {
    setSearchInput('');
    setSearchQuery('');
    setStatusFilter('all');
    setPage(1);
    setLimit(10);
    fetchAgents({ page: 1, limit: 10, search: '', status: 'all' });
    fetchSummaryMetrics();
  }

  function handlePageChange(newPage) {
    if (newPage < 1 || newPage > pagination.totalPages || newPage === page) return;
    setPage(newPage);
  }

  function handleSuccess() {
    setModal(null);
    fetchAgents();
    fetchSummaryMetrics();
  }

  // If user is blocked (Shipper, Driver, or no permissions)
  if (!profileLoading && isBlocked) {
    return (
      <div className="agent-master">
        <div className="am-access-denied">
          <div className="am-access-denied-icon">
            <LockKey size={28} />
          </div>
          <h2>Access Restricted</h2>
          <p>
            {isShipper
              ? 'Shipper organization accounts are not permitted to access internal broker agent records.'
              : isDriver
              ? 'Driver accounts do not have permission to view or manage broker agent records.'
              : 'You do not have the required permissions to view Agent Master. Please contact your organization administrator.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-master">
      {/* ── Page Header ── */}
      <header className="am-page-header">
        <div className="am-page-header-left">
          <h1>Agents</h1>
          <p>Manage freight brokers, booking agents, and intermediary logistics partners.</p>
        </div>

        <div className="am-header-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              fetchAgents();
              fetchSummaryMetrics();
            }}
            disabled={loading}
            title="Refresh agents"
          >
            <ArrowClockwise className={loading ? 'toggle-collapsed-icon' : ''} size={16} />
            <span>Refresh</span>
          </button>

          {canCreate && (
            <button
              type="button"
              className="btn primary"
              onClick={() => setModal({ kind: 'add' })}
            >
              <Plus size={18} />
              <span>Add Agent</span>
            </button>
          )}
        </div>
      </header>

      {/* ── KPI Summary Cards ── */}
      <div className="am-summary-cards">
        <div className="am-summary-card">
          <span className="am-summary-card-label">Total Agents</span>
          <span className="am-summary-card-value">{summary.total}</span>
          <span className="am-summary-card-sub">Registered freight brokers</span>
        </div>

        <div className="am-summary-card">
          <span className="am-summary-card-label">Active Agents</span>
          <span className="am-summary-card-value active">{summary.active}</span>
          <span className="am-summary-card-sub">Authorized to broker loads</span>
        </div>

        <div className="am-summary-card">
          <span className="am-summary-card-label">Suspended</span>
          <span className="am-summary-card-value suspended">{summary.suspended}</span>
          <span className="am-summary-card-sub">Under compliance review</span>
        </div>

        <div className="am-summary-card">
          <span className="am-summary-card-label">Pending Review</span>
          <span className="am-summary-card-value pending">{summary.pending}</span>
          <span className="am-summary-card-sub">Awaiting onboarding approval</span>
        </div>
      </div>

      {/* ── Toolbar: Search & Filters ── */}
      <div className="am-toolbar">
        <div className="search-input">
          <MagnifyingGlass size={17} />
          <input
            type="text"
            aria-label="Search agents"
            placeholder="Search agents..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {searchInput && (
            <button
              type="button"
              className="am-search-clear-btn"
              aria-label="Clear search"
              onClick={() => {
                setSearchInput('');
                setSearchQuery('');
                setPage(1);
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        <select
          className="am-status-select"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending Review</option>
          <option value="suspended">Suspended</option>
          <option value="terminated">Terminated</option>
        </select>

        <select
          className="am-limit-select"
          aria-label="Records per page"
          value={limit}
          onChange={(e) => {
            setLimit(Number(e.target.value));
            setPage(1);
          }}
        >
          <option value={10}>10 / page</option>
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>

        {(searchQuery || statusFilter !== 'all') && (
          <button
            type="button"
            className="am-reset-btn"
            onClick={handleReset}
            title="Reset filters"
          >
            <X size={14} /> Clear filters
          </button>
        )}
      </div>

      {/* ── Main Data View ── */}
      {error && (
        <div className="am-error-state" role="alert">
          <div className="am-error-icon">
            <WarningCircle size={28} />
          </div>
          <h3>Unable to Load Agents</h3>
          <p>{error}</p>
          <button className="btn" onClick={() => fetchAgents()}>
            Try Again
          </button>
        </div>
      )}

      {!error && (
        <>
          <div className="am-table-wrap">
            <table className="am-table">
              <thead>
                <tr>
                  <th>Agent / Broker</th>
                  <th>MC Number</th>
                  <th>USDOT</th>
                  <th>Tax ID</th>
                  <th>Contact Info</th>
                  <th>Status</th>
                  <th className="am-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px 16px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--muted, #506484)' }}>
                        <ArrowClockwise className="toggle-collapsed-icon" size={18} />
                        <span>Loading broker records…</span>
                      </div>
                    </td>
                  </tr>
                )}

                {!loading && agents.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '0' }}>
                      <div className="am-empty-state" style={{ border: 'none' }}>
                        <div className="am-empty-icon">
                          <IdentificationBadge size={28} />
                        </div>
                        <h3>No Agents Found</h3>
                        <p>
                          {searchQuery || statusFilter !== 'all'
                            ? 'No agents match your search or filter criteria. Try clearing filters or adjusting your query.'
                            : 'No agents registered yet. Click "Add Agent" to register your first partner.'}
                        </p>
                        {(searchQuery || statusFilter !== 'all') && (
                          <button className="btn" onClick={handleReset}>
                            Reset Filters
                          </button>
                        )}
                        {!searchQuery && statusFilter === 'all' && canCreate && (
                          <button
                            className="btn primary"
                            onClick={() => setModal({ kind: 'add' })}
                          >
                            <Plus size={16} /> Add Agent
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}

                {!loading &&
                  agents.map((agent) => (
                    <tr key={agent.id}>
                      <td>
                        <div className="am-agent-name-cell">
                          <div className="am-agent-legal-name">
                            <button
                              type="button"
                              className="am-link-btn"
                              onClick={() => setModal({ kind: 'detail', agentId: agent.id })}
                            >
                              {agent.legal_name}
                            </button>
                            {agent.is_enterprise && (
                              <span className="am-enterprise-tag">ENTERPRISE</span>
                            )}
                          </div>
                          <div className="am-agent-meta">
                            <span>ID #{agent.id}</span>
                            {agent.city && (
                              <span>
                                {agent.city}
                                {agent.state ? `, ${agent.state}` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <span style={{ fontFamily: 'Consolas, monospace', fontSize: '13px' }}>
                          {agent.mc_number || '—'}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontFamily: 'Consolas, monospace', fontSize: '13px' }}>
                          {agent.dot_number || '—'}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontFamily: 'Consolas, monospace', fontSize: '12.5px' }}>
                          {agent.tax_id ? maskTaxId(agent.tax_id) : '—'}
                        </span>
                      </td>

                      <td>
                        <div className="am-contact-cell">
                          <span className="am-contact-phone">
                            {agent.company_phone || '—'}
                          </span>
                          <span className="am-contact-email">
                            {agent.company_email || ''}
                          </span>
                        </div>
                      </td>

                      <td>
                        <span className={statusBadgeClass(agent.status)}>
                          {agent.status ? agent.status.charAt(0).toUpperCase() + agent.status.slice(1) : 'Active'}
                        </span>
                      </td>

                      <td>
                        <div className="am-row-actions">
                          <button
                            type="button"
                            className="am-action-btn"
                            title="View Agent Details"
                            aria-label={`View details for ${agent.legal_name}`}
                            onClick={() => setModal({ kind: 'detail', agentId: agent.id })}
                          >
                            <Eye size={14} /> View
                          </button>

                          {canUpdate && (
                            <>
                              <button
                                type="button"
                                className="am-action-btn"
                                title="Edit Agent"
                                aria-label={`Edit ${agent.legal_name}`}
                                onClick={() => setModal({ kind: 'edit', agent })}
                              >
                                <NotePencil size={14} /> Edit
                              </button>

                              <button
                                type="button"
                                className="am-action-btn"
                                title="Change Status"
                                aria-label={`Change status for ${agent.legal_name}`}
                                onClick={() => setModal({ kind: 'status', agent })}
                              >
                                <ShieldCheck size={14} /> Status
                              </button>
                            </>
                          )}

                          {canDelete && (
                            <button
                              type="button"
                              className="am-action-btn danger"
                              title={agent.status === 'terminated' ? 'Agent already terminated' : 'Deactivate Agent'}
                              aria-label={`Deactivate ${agent.legal_name}`}
                              disabled={agent.status === 'terminated'}
                              onClick={() => setModal({ kind: 'delete', agent })}
                            >
                              <Trash size={14} /> Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {pagination.total > 0 && (
            <div className="am-pagination">
              <div className="am-pagination-info">
                Showing{' '}
                <strong>
                  {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}
                </strong>{' '}
                to{' '}
                <strong>
                  {Math.min(pagination.page * pagination.limit, pagination.total)}
                </strong>{' '}
                of <strong>{pagination.total}</strong> agents
              </div>

              <div className="am-pagination-pages">
                <button
                  type="button"
                  className="am-page-btn"
                  disabled={pagination.page <= 1}
                  onClick={() => handlePageChange(pagination.page - 1)}
                  aria-label="Previous page"
                >
                  <CaretLeft size={15} />
                </button>

                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    const cur = pagination.page;
                    return p === 1 || p === pagination.totalPages || Math.abs(p - cur) <= 2;
                  })
                  .map((p, idx, arr) => {
                    const prev = arr[idx - 1];
                    const hasGap = prev && p - prev > 1;
                    return (
                      <React.Fragment key={p}>
                        {hasGap && <span style={{ padding: '0 4px', color: 'var(--muted, #506484)' }}>…</span>}
                        <button
                          type="button"
                          className={`am-page-btn ${p === pagination.page ? 'active' : ''}`}
                          onClick={() => handlePageChange(p)}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    );
                  })}

                <button
                  type="button"
                  className="am-page-btn"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => handlePageChange(pagination.page + 1)}
                  aria-label="Next page"
                >
                  <CaretRight size={15} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modals ── */}
      {modal?.kind === 'add' && (
        <AgentFormModal
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
          notify={notify}
        />
      )}

      {modal?.kind === 'edit' && (
        <AgentFormModal
          agent={modal.agent}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
          notify={notify}
        />
      )}

      {modal?.kind === 'detail' && (
        <AgentDetailModal
          agentId={modal.agentId}
          onClose={() => setModal(null)}
          onEdit={(ag) => setModal({ kind: 'edit', agent: ag })}
          onChangeStatus={(ag) => setModal({ kind: 'status', agent: ag })}
          canUpdate={canUpdate}
        />
      )}

      {modal?.kind === 'status' && (
        <AgentStatusModal
          agent={modal.agent}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
          notify={notify}
        />
      )}

      {modal?.kind === 'delete' && (
        <AgentDeactivateModal
          agent={modal.agent}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
          notify={notify}
        />
      )}
    </div>
  );
}
