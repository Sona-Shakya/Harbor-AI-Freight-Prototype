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
  Anchor,
  Info,
  MapPin,
  Clock,
  ClockCounterClockwise,
  Globe,
  LockKey,
} from '@phosphor-icons/react';
import {
  getPorts,
  getPort,
  createPort,
  updatePort,
  updatePortStatus,
  deletePort,
  getPortAuditLog,
} from './api';
import './styles/portMaster.css';

/* ─── Constants ──────────────────────────────────────────────── */
const ALLOWED_STATUSES = ['active', 'inactive'];
const STATUS_FILTER_OPTIONS = ['all', 'active', 'inactive'];
const PORT_TYPE_OPTIONS = [
  { value: 'all', label: 'All Port Types' },
  { value: 'seaport', label: 'Seaport / Ocean Terminal' },
  { value: 'inland_port', label: 'Inland Port / Dry Port' },
  { value: 'rail_ramp', label: 'Rail Ramp / Intermodal' },
  { value: 'airport', label: 'Air Cargo Hub' },
];
const DEBOUNCE_MS = 350;

/* ─── Helpers ─────────────────────────────────────────────────── */
function statusBadgeClass(status) {
  return (status || '').toLowerCase() === 'active'
    ? 'pm-badge pm-badge-active'
    : 'pm-badge pm-badge-inactive';
}

function portTypeBadgeClass(type) {
  switch ((type || '').toLowerCase()) {
    case 'seaport':     return 'pm-port-type-badge pm-port-type-seaport';
    case 'inland_port': return 'pm-port-type-badge pm-port-type-inland';
    case 'rail_ramp':   return 'pm-port-type-badge pm-port-type-rail';
    case 'airport':     return 'pm-port-type-badge pm-port-type-airport';
    default:            return 'pm-port-type-badge pm-port-type-seaport';
  }
}

function portTypeDisplay(type) {
  switch ((type || '').toLowerCase()) {
    case 'seaport':     return 'Seaport';
    case 'inland_port': return 'Inland Port';
    case 'rail_ramp':   return 'Rail Ramp';
    case 'airport':     return 'Airport Hub';
    default:            return type || 'Seaport';
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
      second: '2-digit',
    });
  } catch {
    return val;
  }
}

function actionBadgeClass(action) {
  switch (action) {
    case 'PORT_CREATED':        return 'pm-audit-action-chip created';
    case 'PORT_UPDATED':        return 'pm-audit-action-chip updated';
    case 'PORT_STATUS_CHANGED': return 'pm-audit-action-chip status';
    case 'PORT_DELETED':        return 'pm-audit-action-chip deleted';
    default:                    return 'pm-audit-action-chip';
  }
}

function actionDisplayLabel(action) {
  switch (action) {
    case 'PORT_CREATED':        return 'Port Created';
    case 'PORT_UPDATED':        return 'Port Updated';
    case 'PORT_STATUS_CHANGED': return 'Status Changed';
    case 'PORT_DELETED':        return 'Port Deactivated';
    default:                    return action || 'Audit Event';
  }
}

function mapApiError(err) {
  if (!err) return 'An unexpected error occurred.';
  const msg = err.message || '';
  if (err.status === 409 || msg.includes('already exists')) {
    return msg || 'A port with this port code already exists.';
  }
  if (err.status === 403 || msg.includes('Permission denied') || msg.includes('not permitted')) {
    return 'Permission denied: Only Platform Administrators can create, update, or deactivate ports.';
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

/* ─── Add / Edit Port Modal ───────────────────────────────────── */
function PortFormModal({ port, onClose, onSuccess, notify }) {
  const isEdit = Boolean(port);

  const [form, setForm] = useState({
    port_code: port?.port_code ?? '',
    name:      port?.name      ?? '',
    port_type: port?.port_type ?? 'seaport',
    country:   port?.country   ?? '',
    state:     port?.state     ?? '',
    city:      port?.city      ?? '',
    lat:       port?.lat       ?? '',
    lng:       port?.lng       ?? '',
    timezone:  port?.timezone  ?? '',
    status:    port?.status    ?? 'active',
    reason:    '',
  });

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function validate() {
    const code = (form.port_code || '').trim();
    if (!code) return 'Port Code is required.';
    if (code.length > 20) return 'Port Code must not exceed 20 characters.';

    const name = (form.name || '').trim();
    if (!name) return 'Port Name is required.';
    if (name.length > 150) return 'Port Name must not exceed 150 characters.';

    const country = (form.country || '').trim();
    if (!country) return 'Country is required.';
    if (country.length > 100) return 'Country must not exceed 100 characters.';

    if (form.lat !== '' && form.lat !== null && form.lat !== undefined) {
      const latNum = Number(form.lat);
      if (isNaN(latNum) || latNum < -90 || latNum > 90) {
        return 'Latitude must be a valid number between -90 and 90.';
      }
    }

    if (form.lng !== '' && form.lng !== null && form.lng !== undefined) {
      const lngNum = Number(form.lng);
      if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
        return 'Longitude must be a valid number between -180 and 180.';
      }
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
        port_code: form.port_code.trim().toUpperCase(),
        name:      form.name.trim(),
        port_type: form.port_type || 'seaport',
        country:   form.country.trim(),
        state:     form.state.trim() || undefined,
        city:      form.city.trim() || undefined,
        lat:       form.lat !== '' && form.lat !== null ? Number(form.lat) : undefined,
        lng:       form.lng !== '' && form.lng !== null ? Number(form.lng) : undefined,
        timezone:  form.timezone.trim() || undefined,
        status:    form.status || 'active',
        reason:    form.reason.trim() || (isEdit ? 'Port updated via Port Master' : 'Initial port creation'),
      };

      if (isEdit) {
        await updatePort(port.id, payload);
        notify('Port updated successfully.');
      } else {
        await createPort(payload);
        notify('Port created successfully.');
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
      title={isEdit ? `Edit Port — ${port.port_code}` : 'Add New Port'}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} noValidate>
        <p className="pm-modal-description">
          {isEdit
            ? 'Update commercial port metadata, coordinates, timezone, and operational authority status.'
            : 'Register a new commercial seaport, inland terminal, or intermodal ramp in the global port reference directory.'}
        </p>

        {error && (
          <div className="pm-form-error" role="alert">
            <WarningCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="pm-modal-sections">
          {/* Section 1: Port Identification & Classification */}
          <div className="pm-modal-section">
            <div className="pm-section-header">
              <h4>Port Identification & Classification</h4>
              <p>UN/LOCODE or commercial code, legal port title, terminal category, and lifecycle status</p>
            </div>
            <div className="pm-form-grid">
              <label>
                Port Code <span className="pm-required">*</span>
                <input
                  type="text"
                  className="pm-code-input"
                  value={form.port_code}
                  onChange={(e) => setForm((p) => ({ ...p, port_code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. USLAX, SGSIN, DEHAM"
                  required
                  maxLength={20}
                  autoFocus={!isEdit}
                />
              </label>

              <label>
                Port Name <span className="pm-required">*</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Port of Los Angeles"
                  required
                  maxLength={150}
                />
              </label>

              <label>
                Port Type <span className="pm-required">*</span>
                <select
                  value={form.port_type}
                  onChange={(e) => setForm((p) => ({ ...p, port_type: e.target.value }))}
                >
                  <option value="seaport">Seaport / Ocean Terminal</option>
                  <option value="inland_port">Inland Port / Dry Port</option>
                  <option value="rail_ramp">Rail Ramp / Intermodal</option>
                  <option value="airport">Air Cargo Hub</option>
                </select>
              </label>

              <label>
                Operational Status <span className="pm-required">*</span>
                <select
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="active">Active — Open for cargo booking</option>
                  <option value="inactive">Inactive — Closed / Suspended</option>
                </select>
              </label>
            </div>
          </div>

          {/* Section 2: Geographic Location */}
          <div className="pm-modal-section">
            <div className="pm-section-header">
              <h4>Geographic Location</h4>
              <p>Jurisdiction, state or province, city municipality, and local operating timezone</p>
            </div>
            <div className="pm-form-grid">
              <label>
                Country <span className="pm-required">*</span>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                  placeholder="e.g. United States, Germany, China"
                  required
                  maxLength={100}
                />
              </label>

              <label>
                State / Province
                <input
                  type="text"
                  value={form.state}
                  onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                  placeholder="e.g. California, Hamburg"
                  maxLength={100}
                />
              </label>

              <label>
                City
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  placeholder="e.g. Los Angeles"
                  maxLength={100}
                />
              </label>

              <label>
                Timezone
                <input
                  type="text"
                  value={form.timezone}
                  onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
                  placeholder="e.g. America/Los_Angeles, UTC"
                  maxLength={50}
                />
              </label>
            </div>
          </div>

          {/* Section 3: Geographic Coordinates */}
          <div className="pm-modal-section">
            <div className="pm-section-header">
              <h4>Geographic Coordinates</h4>
              <p>GPS navigation coordinates for automated dispatch routing and map plotting</p>
            </div>
            <div className="pm-form-grid">
              <label>
                Latitude (-90 to 90)
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={form.lat}
                  onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))}
                  placeholder="e.g. 33.743"
                />
              </label>

              <label>
                Longitude (-180 to 180)
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={form.lng}
                  onChange={(e) => setForm((p) => ({ ...p, lng: e.target.value }))}
                  placeholder="e.g. -118.267"
                />
              </label>
            </div>
          </div>

          {/* Section 4: Audit & Compliance */}
          <div className="pm-modal-section">
            <div className="pm-section-header">
              <h4>Audit & Compliance</h4>
              <p>Optional compliance note for the change audit log</p>
            </div>
            <div className="pm-form-grid">
              <label className="pm-form-full-width">
                Audit Reason (Optional)
                <input
                  type="text"
                  value={form.reason}
                  onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="e.g. Reference database sync, UN/LOCODE correction"
                  maxLength={250}
                />
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
            {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Port')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Port Detail Modal (Overview & Audit Trail) ──────────────── */
function PortDetailModal({
  portId,
  initialTab = 'overview',
  onClose,
  onEdit,
  onChangeStatus,
  canUpdate,
}) {
  const [tab, setTab] = useState(initialTab);
  const [port, setPort] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Audit state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditPagination, setAuditPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });

  // Load single port
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    getPort(portId)
      .then((res) => {
        if (!cancelled) setPort(res?.data || res);
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
  }, [portId]);

  // Load Audit Log when audit tab active
  useEffect(() => {
    if (tab === 'audit') {
      setAuditLoading(true);
      setAuditError('');
      getPortAuditLog(portId, { page: auditPage, limit: 10 })
        .then((res) => {
          setAuditLogs(res?.data || []);
          setAuditPagination(res?.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 });
        })
        .catch((ex) => setAuditError(mapApiError(ex)))
        .finally(() => setAuditLoading(false));
    }
  }, [tab, portId, auditPage]);

  return (
    <ModalShell
      title={port ? `${port.port_code} — ${port.name}` : 'Port Details'}
      onClose={onClose}
      wide
    >
      {loading && (
        <div className="pm-empty-state" style={{ padding: '40px 10px' }}>
          <ArrowClockwise className="toggle-collapsed-icon" size={28} />
          <h3>Loading Port Data…</h3>
        </div>
      )}

      {error && !loading && (
        <div className="pm-error-state" style={{ margin: '16px 0' }}>
          <div className="pm-error-icon">
            <WarningCircle size={28} />
          </div>
          <h3>Failed to Load Port</h3>
          <p>{error}</p>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      )}

      {port && !loading && (
        <div>
          {/* Header Meta */}
          <div className="pm-detail-header-meta">
            <span className="pm-port-code-badge">{port.port_code}</span>
            <span className={portTypeBadgeClass(port.port_type)}>
              {portTypeDisplay(port.port_type)}
            </span>
            <span className={statusBadgeClass(port.status)}>
              {port.status ? port.status.charAt(0).toUpperCase() + port.status.slice(1) : 'Active'}
            </span>

            <span className="pm-detail-id">Port ID: #{port.id}</span>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              {canUpdate && (
                <>
                  <button
                    className="btn"
                    style={{ fontSize: '12.5px', padding: '6px 12px' }}
                    onClick={() => onEdit(port)}
                  >
                    <NotePencil size={15} /> Edit
                  </button>
                  <button
                    className="btn"
                    style={{ fontSize: '12.5px', padding: '6px 12px' }}
                    onClick={() => onChangeStatus(port)}
                  >
                    <ShieldCheck size={15} /> Status
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="pm-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'overview'}
              className={`pm-tab-btn ${tab === 'overview' ? 'active' : ''}`}
              onClick={() => setTab('overview')}
            >
              <Anchor size={16} /> Overview & Coordinates
            </button>
            <button
              role="tab"
              aria-selected={tab === 'audit'}
              className={`pm-tab-btn ${tab === 'audit' ? 'active' : ''}`}
              onClick={() => setTab('audit')}
            >
              <ClockCounterClockwise size={16} /> Audit History
              {auditPagination.total > 0 && (
                <span className="pm-tab-count">{auditPagination.total}</span>
              )}
            </button>
          </div>

          {/* Overview Tab Content */}
          {tab === 'overview' && (
            <div>
              <div className="pm-section-title">Port Information</div>
              <div className="pm-detail-grid">
                <div className="pm-detail-card">
                  <span className="pm-detail-card-label">Port Code (UN/LOCODE)</span>
                  <span className="pm-detail-card-value mono">{port.port_code}</span>
                </div>
                <div className="pm-detail-card">
                  <span className="pm-detail-card-label">Official Name</span>
                  <span className="pm-detail-card-value font-medium">{port.name}</span>
                </div>
                <div className="pm-detail-card">
                  <span className="pm-detail-card-label">Port Type</span>
                  <span className="pm-detail-card-value">{portTypeDisplay(port.port_type)}</span>
                </div>
                <div className="pm-detail-card">
                  <span className="pm-detail-card-label">Operational Status</span>
                  <span className="pm-detail-card-value" style={{ textTransform: 'capitalize' }}>
                    {port.status || 'Active'}
                  </span>
                </div>
              </div>

              <div className="pm-section-title">Location & Geography</div>
              <div className="pm-detail-grid">
                <div className="pm-detail-card">
                  <span className="pm-detail-card-label">Country</span>
                  <span className="pm-detail-card-value">{port.country || '—'}</span>
                </div>
                <div className="pm-detail-card">
                  <span className="pm-detail-card-label">State / Province</span>
                  <span className="pm-detail-card-value">{port.state || '—'}</span>
                </div>
                <div className="pm-detail-card">
                  <span className="pm-detail-card-label">City</span>
                  <span className="pm-detail-card-value">{port.city || '—'}</span>
                </div>
                <div className="pm-detail-card">
                  <span className="pm-detail-card-label">Timezone</span>
                  <span className="pm-detail-card-value mono">{port.timezone || '—'}</span>
                </div>
                <div className="pm-detail-card">
                  <span className="pm-detail-card-label">Latitude</span>
                  <span className="pm-detail-card-value mono">
                    {port.lat !== null && port.lat !== undefined ? Number(port.lat).toFixed(6) : '—'}
                  </span>
                </div>
                <div className="pm-detail-card">
                  <span className="pm-detail-card-label">Longitude</span>
                  <span className="pm-detail-card-value mono">
                    {port.lng !== null && port.lng !== undefined ? Number(port.lng).toFixed(6) : '—'}
                  </span>
                </div>
              </div>

              <div className="pm-section-title">Record Timestamps</div>
              <div className="pm-detail-grid">
                <div className="pm-detail-card">
                  <span className="pm-detail-card-label">Created Date</span>
                  <span className="pm-detail-card-value">{formatDate(port.created_at)}</span>
                </div>
                <div className="pm-detail-card">
                  <span className="pm-detail-card-label">Last Updated</span>
                  <span className="pm-detail-card-value">{formatDateTime(port.updated_at)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Audit History Tab Content */}
          {tab === 'audit' && (
            <div>
              <div className="pm-section-title">Port Lifecycle & Modification Audit Log</div>
              {auditLoading && (
                <div className="pm-empty-state" style={{ padding: '30px 10px' }}>
                  <ArrowClockwise size={24} />
                  <p>Loading audit trail…</p>
                </div>
              )}

              {auditError && (
                <div className="pm-form-error" role="alert">
                  <WarningCircle size={18} />
                  <span>{auditError}</span>
                </div>
              )}

              {!auditLoading && !auditError && auditLogs.length === 0 && (
                <div className="pm-empty-state" style={{ padding: '30px 10px' }}>
                  <Info size={28} />
                  <h3>No Audit Records Found</h3>
                  <p>Changes and status transitions will appear here.</p>
                </div>
              )}

              {!auditLoading && auditLogs.length > 0 && (
                <>
                  <div className="pm-audit-table-wrap">
                    <table className="pm-audit-table">
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Action</th>
                          <th>Actor</th>
                          <th>Changes / Details</th>
                          <th>Network & Client</th>
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
                                      <span key={k} className="pm-diff-chip">
                                        <strong>{k}:</strong>{' '}
                                        <span className="pm-diff-old">{String(oldObj[k] ?? 'empty')}</span>
                                        <span className="pm-diff-arrow">→</span>
                                        <span className="pm-diff-new">{String(newObj[k] ?? 'empty')}</span>
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
                                <div className="pm-audit-actor">{log.actor_name || 'System / Platform Admin'}</div>
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
                              <td>
                                <div className="pm-audit-meta-text">
                                  <span><strong>IP:</strong> {log.ip_address || '—'}</span>
                                  <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.user_agent}>
                                    <strong>UA:</strong> {log.user_agent || '—'}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Audit Pagination */}
                  {auditPagination.totalPages > 1 && (
                    <div className="pm-pagination" style={{ marginTop: '10px' }}>
                      <span>
                        Page {auditPagination.page} of {auditPagination.totalPages} ({auditPagination.total} audit events)
                      </span>
                      <div className="pm-pagination-pages">
                        <button
                          className="pm-page-btn"
                          disabled={auditPagination.page <= 1}
                          onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                        >
                          <CaretLeft size={14} />
                        </button>
                        <button
                          className="pm-page-btn"
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
function PortStatusModal({ port, onClose, onSuccess, notify }) {
  const [status, setStatus] = useState(port?.status || 'active');
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
      await updatePortStatus(port.id, status, reason.trim());
      notify(`Port status updated to '${status}'.`);
      onSuccess();
    } catch (ex) {
      setError(mapApiError(ex));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Update Status — ${port.port_code}`} onClose={onClose}>
      <form onSubmit={handleSave}>
        <p className="pm-modal-description">
          Modify the operational status of <strong>{port.name}</strong> ({port.port_code}).
          An audit reason is mandatory for compliance.
        </p>

        {error && (
          <div className="pm-form-error" role="alert">
            <WarningCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="pm-status-options">
          <label
            className={`pm-status-option-btn ${status === 'active' ? 'selected' : ''}`}
            onClick={() => setStatus('active')}
          >
            <input
              type="radio"
              name="port_status"
              value="active"
              checked={status === 'active'}
              onChange={() => setStatus('active')}
            />
            <div>
              <span className="pm-status-option-label">Active</span>
              <span className="pm-status-option-desc">Port is open for commercial booking, cargo handling, and routing.</span>
            </div>
          </label>

          <label
            className={`pm-status-option-btn danger-option ${status === 'inactive' ? 'selected' : ''}`}
            onClick={() => setStatus('inactive')}
          >
            <input
              type="radio"
              name="port_status"
              value="inactive"
              checked={status === 'inactive'}
              onChange={() => setStatus('inactive')}
            />
            <div>
              <span className="pm-status-option-label" style={{ color: '#dc2626' }}>Inactive</span>
              <span className="pm-status-option-desc">Port is deactivated or closed. New shipments will not accept this port.</span>
            </div>
          </label>
        </div>

        <div style={{ marginTop: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
            Audit Reason <span className="pm-required">*</span>
          </label>
          <textarea
            required
            rows={3}
            className="large-textarea"
            placeholder="Explain reason for status change (e.g. Seasonal closure, dredged channel maintenance, or operational reopening)..."
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

/* ─── Deactivate / Delete Confirmation Modal ─────────────────── */
function PortDeactivateModal({ port, onClose, onSuccess, notify }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setSaving(true);
    setError('');

    try {
      await deletePort(port.id, reason.trim() || undefined);
      notify(`Port '${port.port_code}' deactivated successfully.`);
      onSuccess();
    } catch (ex) {
      setError(mapApiError(ex));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Deactivate Port — ${port.port_code}`} onClose={onClose}>
      <p className="pm-modal-description">
        Are you sure you want to deactivate <strong>{port.name}</strong> ({port.port_code})?
        This soft-deactivates the port by setting status to <strong>Inactive</strong> and logs an audit event.
      </p>

      {error && (
        <div className="pm-form-error" role="alert">
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
          placeholder="State reason for deactivation (e.g. Port decommissioning, code obsolescence)..."
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

/* ─── Main PortMaster Component ───────────────────────────────── */
export default function PortMaster({
  hasPermission,
  notify,
  profileLoading,
  currentUser,
  currentRoleName,
}) {
  // Access Control:
  // - Platform Admin: full CRUD
  // - Company Admin, Dispatcher, Finance, Shipper User: read-only
  // - Driver: no access
  const resolvedRole = currentRoleName || currentUser?.role || currentUser?.roleName || '';
  const isPlatformAdmin = resolvedRole === 'Platform Admin';
  const isDriver = resolvedRole === 'Driver';

  const canRead   = !isDriver && (isPlatformAdmin || hasPermission ? (hasPermission('ports', 'read') || hasPermission('ports.read')) : true);
  const canCreate = isPlatformAdmin || (resolvedRole !== 'Company Admin' && resolvedRole !== 'Shipper User' && hasPermission ? (hasPermission('ports', 'create') || hasPermission('ports.create')) : false);
  const canUpdate = isPlatformAdmin || (resolvedRole !== 'Company Admin' && resolvedRole !== 'Shipper User' && hasPermission ? (hasPermission('ports', 'update') || hasPermission('ports.update')) : false);
  const canDelete = isPlatformAdmin || (resolvedRole !== 'Company Admin' && resolvedRole !== 'Shipper User' && hasPermission ? (hasPermission('ports', 'delete') || hasPermission('ports.delete')) : false);

  const isBlocked = !canRead || isDriver;

  // Data State
  const [ports, setPorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });

  // Filters & Search
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // Summary Metrics
  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    seaports: 0,
  });

  // Modal State
  const [modal, setModal] = useState(null); // { kind: 'add' | 'edit' | 'detail' | 'status' | 'delete' | 'audit', port, tab? }

  // Debounced Search
  const debounceTimer = useRef(null);
  const handleSearchChange = (val) => {
    setSearchInput(val);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setSearchQuery(val.trim());
      setPage(1);
    }, DEBOUNCE_MS);
  };

  // Fetch KPI Metrics
  const fetchSummaryMetrics = useCallback(async () => {
    if (profileLoading || isBlocked) return;
    try {
      const [allRes, activeRes, inactiveRes, seaportRes] = await Promise.all([
        getPorts('limit=1'),
        getPorts('limit=1&status=active'),
        getPorts('limit=1&status=inactive'),
        getPorts('limit=1&port_type=seaport'),
      ]);

      setSummary({
        total:    allRes?.pagination?.total    ?? 0,
        active:   activeRes?.pagination?.total   ?? 0,
        inactive: inactiveRes?.pagination?.total ?? 0,
        seaports: seaportRes?.pagination?.total ?? 0,
      });
    } catch {
      // Fallback silently if individual metric queries fail
    }
  }, [profileLoading, isBlocked]);

  // Fetch Ports from API
  const fetchPorts = useCallback(async (opts = {}) => {
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

      const tf = opts.port_type !== undefined ? opts.port_type : typeFilter;
      if (tf && tf !== 'all') params.set('port_type', tf);

      const cf = opts.country !== undefined ? opts.country : countryFilter;
      if (cf && cf.trim()) params.set('country', cf.trim());

      const res = await getPorts(params.toString());
      const data = res?.data || [];
      const pag = res?.pagination || { total: data.length, page: 1, limit: 10, totalPages: 1 };

      setPorts(data);
      setPagination(pag);
    } catch (ex) {
      if (ex.status === 401 || ex.status === 403) {
        setError(
          ex.status === 401
            ? 'Your session has expired. Please sign in again.'
            : (ex?.data?.message || 'You do not have permission to view Port Master.')
        );
      } else {
        setError(ex.message || 'Unable to load port records.');
      }
    } finally {
      setLoading(false);
    }
  }, [profileLoading, isBlocked, page, limit, searchQuery, statusFilter, typeFilter, countryFilter]);

  // Initial & reactive load
  useEffect(() => {
    if (!profileLoading && !isBlocked) {
      fetchPorts();
      fetchSummaryMetrics();
    }
  }, [profileLoading, isBlocked, fetchPorts, fetchSummaryMetrics]);

  function handleReset() {
    setSearchInput('');
    setSearchQuery('');
    setStatusFilter('all');
    setTypeFilter('all');
    setCountryFilter('');
    setPage(1);
    setLimit(10);
    fetchPorts({ page: 1, limit: 10, search: '', status: 'all', port_type: 'all', country: '' });
    fetchSummaryMetrics();
  }

  function handlePageChange(newPage) {
    if (newPage < 1 || newPage > pagination.totalPages || newPage === page) return;
    setPage(newPage);
  }

  function handleSuccess() {
    setModal(null);
    fetchPorts();
    fetchSummaryMetrics();
  }

  // Access Denied Screen (for Driver or unauthorized roles)
  if (!profileLoading && isBlocked) {
    return (
      <div className="port-master">
        <div className="pm-access-denied">
          <div className="pm-access-denied-icon">
            <LockKey size={28} />
          </div>
          <h2>Access Restricted</h2>
          <p>
            {isDriver
              ? 'Driver accounts do not have permission to view or manage global port records.'
              : 'You do not have the required permissions to view Port Master. Please contact your system administrator.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="port-master">
      {/* ── Page Header ── */}
      <header className="pm-page-header">
        <div className="pm-page-header-left">
          <h1>Ports</h1>
          <p>Global directory of commercial seaports, inland container terminals, rail ramps, and air cargo hubs.</p>
        </div>

        <div className="pm-header-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              fetchPorts();
              fetchSummaryMetrics();
            }}
            disabled={loading}
            title="Refresh ports"
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
              <span>Add Port</span>
            </button>
          )}
        </div>
      </header>

      {/* ── KPI Summary Cards ── */}
      <div className="pm-summary-cards">
        <div className="pm-summary-card">
          <span className="pm-summary-card-label">Total Ports</span>
          <span className="pm-summary-card-value">{summary.total}</span>
          <span className="pm-summary-card-sub">Global transport hubs</span>
        </div>

        <div className="pm-summary-card">
          <span className="pm-summary-card-label">Active Ports</span>
          <span className="pm-summary-card-value active">{summary.active}</span>
          <span className="pm-summary-card-sub">Open for cargo booking</span>
        </div>

        <div className="pm-summary-card">
          <span className="pm-summary-card-label">Inactive Ports</span>
          <span className="pm-summary-card-value inactive">{summary.inactive}</span>
          <span className="pm-summary-card-sub">Deactivated / closed</span>
        </div>

        <div className="pm-summary-card">
          <span className="pm-summary-card-label">Ocean Seaports</span>
          <span className="pm-summary-card-value seaport">{summary.seaports}</span>
          <span className="pm-summary-card-sub">Maritime terminals</span>
        </div>
      </div>

      {/* ── Toolbar: Search & Filters ── */}
      <div className="pm-toolbar">
        <div className="search-input">
          <MagnifyingGlass size={17} />
          <input
            type="text"
            aria-label="Search ports"
            placeholder="Search ports..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {searchInput && (
            <button
              type="button"
              className="pm-search-clear-btn"
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
          className="pm-select"
          aria-label="Filter by port type"
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
        >
          {PORT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          className="pm-select"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <input
          type="text"
          className="pm-filter-input"
          placeholder="Filter country…"
          aria-label="Filter by country"
          value={countryFilter}
          onChange={(e) => {
            setCountryFilter(e.target.value);
            setPage(1);
          }}
        />

        <select
          className="pm-select"
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

        {(searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || countryFilter) && (
          <button
            type="button"
            className="pm-reset-btn"
            onClick={handleReset}
            title="Reset filters"
          >
            <X size={14} /> Clear filters
          </button>
        )}
      </div>

      {/* ── Main Data View ── */}
      {error && (
        <div className="pm-error-state" role="alert">
          <div className="pm-error-icon">
            <WarningCircle size={28} />
          </div>
          <h3>Unable to Load Ports</h3>
          <p>{error}</p>
          <button className="btn" onClick={() => fetchPorts()}>
            Try Again
          </button>
        </div>
      )}

      {!error && (
        <>
          <div className="pm-table-wrap">
            <table className="pm-table">
              <thead>
                <tr>
                  <th>Port Code</th>
                  <th>Port Name</th>
                  <th>Port Type</th>
                  <th>Country</th>
                  <th>City</th>
                  <th>State</th>
                  <th>Timezone</th>
                  <th>Status</th>
                  <th className="pm-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '40px 16px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--muted, #506484)' }}>
                        <ArrowClockwise className="toggle-collapsed-icon" size={18} />
                        <span>Loading port records…</span>
                      </div>
                    </td>
                  </tr>
                )}

                {!loading && ports.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: '0' }}>
                      <div className="pm-empty-state" style={{ border: 'none' }}>
                        <div className="pm-empty-icon">
                          <Anchor size={28} />
                        </div>
                        <h3>No Ports Found</h3>
                        <p>
                          {searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || countryFilter
                            ? 'No ports match your search or filter criteria. Try clearing filters or adjusting your query.'
                            : 'No ports registered in the directory yet. Click "Add Port" to register the first transport hub.'}
                        </p>
                        {(searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || countryFilter) && (
                          <button className="btn" onClick={handleReset}>
                            Reset Filters
                          </button>
                        )}
                        {!searchQuery && statusFilter === 'all' && canCreate && (
                          <button
                            className="btn primary"
                            onClick={() => setModal({ kind: 'add' })}
                          >
                            <Plus size={16} /> Add Port
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}

                {!loading &&
                  ports.map((port) => (
                    <tr key={port.id}>
                      <td>
                        <button
                          type="button"
                          className="pm-link-btn"
                          onClick={() => setModal({ kind: 'detail', portId: port.id, tab: 'overview' })}
                          title={`View details for ${port.port_code}`}
                        >
                          <span className="pm-port-code-badge">{port.port_code}</span>
                        </button>
                      </td>

                      <td>
                        <strong>{port.name}</strong>
                      </td>

                      <td>
                        <span className={portTypeBadgeClass(port.port_type)}>
                          {portTypeDisplay(port.port_type)}
                        </span>
                      </td>

                      <td>{port.country || '—'}</td>
                      <td>{port.city || '—'}</td>
                      <td>{port.state || '—'}</td>

                      <td>
                        <span style={{ fontFamily: 'Consolas, monospace', fontSize: '12px', color: 'var(--muted, #506484)' }}>
                          {port.timezone || '—'}
                        </span>
                      </td>

                      <td>
                        <span className={statusBadgeClass(port.status)}>
                          {port.status ? port.status.charAt(0).toUpperCase() + port.status.slice(1) : 'Active'}
                        </span>
                      </td>

                      <td>
                        <div className="pm-row-actions">
                          <button
                            type="button"
                            className="pm-action-btn"
                            title="View Port Details"
                            aria-label={`View details for ${port.port_code}`}
                            onClick={() => setModal({ kind: 'detail', portId: port.id, tab: 'overview' })}
                          >
                            <Eye size={14} /> View
                          </button>

                          <button
                            type="button"
                            className="pm-action-btn"
                            title="Audit History"
                            aria-label={`Audit history for ${port.port_code}`}
                            onClick={() => setModal({ kind: 'detail', portId: port.id, tab: 'audit' })}
                          >
                            <ClockCounterClockwise size={14} /> Audit
                          </button>

                          {canUpdate && (
                            <>
                              <button
                                type="button"
                                className="pm-action-btn"
                                title="Edit Port"
                                aria-label={`Edit ${port.port_code}`}
                                onClick={() => setModal({ kind: 'edit', port })}
                              >
                                <NotePencil size={14} /> Edit
                              </button>

                              <button
                                type="button"
                                className="pm-action-btn"
                                title="Change Status"
                                aria-label={`Change status for ${port.port_code}`}
                                onClick={() => setModal({ kind: 'status', port })}
                              >
                                <ShieldCheck size={14} /> Status
                              </button>
                            </>
                          )}

                          {canDelete && (
                            <button
                              type="button"
                              className="pm-action-btn danger"
                              title={port.status === 'inactive' ? 'Port already inactive' : 'Deactivate Port'}
                              aria-label={`Deactivate ${port.port_code}`}
                              disabled={port.status === 'inactive'}
                              onClick={() => setModal({ kind: 'delete', port })}
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
            <div className="pm-pagination">
              <div className="pm-pagination-info">
                Showing{' '}
                <strong>
                  {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}
                </strong>{' '}
                to{' '}
                <strong>
                  {Math.min(pagination.page * pagination.limit, pagination.total)}
                </strong>{' '}
                of <strong>{pagination.total}</strong> ports
              </div>

              <div className="pm-pagination-pages">
                <button
                  type="button"
                  className="pm-page-btn"
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
                          className={`pm-page-btn ${p === pagination.page ? 'active' : ''}`}
                          onClick={() => handlePageChange(p)}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    );
                  })}

                <button
                  type="button"
                  className="pm-page-btn"
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
        <PortFormModal
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
          notify={notify}
        />
      )}

      {modal?.kind === 'edit' && (
        <PortFormModal
          port={modal.port}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
          notify={notify}
        />
      )}

      {modal?.kind === 'detail' && (
        <PortDetailModal
          portId={modal.portId}
          initialTab={modal.tab || 'overview'}
          onClose={() => setModal(null)}
          onEdit={(pt) => setModal({ kind: 'edit', port: pt })}
          onChangeStatus={(pt) => setModal({ kind: 'status', port: pt })}
          canUpdate={canUpdate}
        />
      )}

      {modal?.kind === 'status' && (
        <PortStatusModal
          port={modal.port}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
          notify={notify}
        />
      )}

      {modal?.kind === 'delete' && (
        <PortDeactivateModal
          port={modal.port}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
          notify={notify}
        />
      )}
    </div>
  );
}
