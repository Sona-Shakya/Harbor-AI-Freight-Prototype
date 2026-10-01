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
  Package,
  Info,
  MapPin,
  Clock,
  ClockCounterClockwise,
  Globe,
  LockKey,
  Anchor,
  Buildings,
} from '@phosphor-icons/react';
import {
  getCfsStations,
  getCfsStation,
  createCfsStation,
  updateCfsStation,
  updateCfsStatus,
  deleteCfsStation,
  getCfsAuditLog,
  getPorts,
} from './api';
import './styles/cfsMaster.css';

/* ─── Constants ──────────────────────────────────────────────── */
const ALLOWED_STATUSES = ['active', 'inactive'];
const STATUS_FILTER_OPTIONS = ['all', 'active', 'inactive'];

const FACILITY_TYPE_OPTIONS = [
  { value: 'all', label: 'All Facility Types' },
  { value: 'cfs', label: 'Container Freight Station (CFS)' },
  { value: 'bonded_warehouse', label: 'Bonded Warehouse' },
  { value: 'icd', label: 'Inland Container Depot (ICD)' },
  { value: 'deconsolidation', label: 'Deconsolidation Center' },
  { value: 'intermodal_hub', label: 'Rail / Intermodal Hub' },
];

const DEBOUNCE_MS = 350;

/* ─── Helpers ─────────────────────────────────────────────────── */
function statusBadgeClass(status) {
  return (status || '').toLowerCase() === 'active'
    ? 'cfs-badge cfs-badge-active'
    : 'cfs-badge cfs-badge-inactive';
}

function facilityTypeBadgeClass(type) {
  switch ((type || '').toLowerCase()) {
    case 'cfs':               return 'cfs-facility-type-badge cfs-facility-type-cfs';
    case 'bonded_warehouse':  return 'cfs-facility-type-badge cfs-facility-type-bonded';
    case 'icd':               return 'cfs-facility-type-badge cfs-facility-type-icd';
    case 'deconsolidation':   return 'cfs-facility-type-badge cfs-facility-type-decon';
    case 'intermodal_hub':    return 'cfs-facility-type-badge cfs-facility-type-rail';
    default:                  return 'cfs-facility-type-badge cfs-facility-type-cfs';
  }
}

function facilityTypeDisplay(type) {
  switch ((type || '').toLowerCase()) {
    case 'cfs':               return 'CFS Station';
    case 'bonded_warehouse':  return 'Bonded Warehouse';
    case 'icd':               return 'Inland Depot (ICD)';
    case 'deconsolidation':   return 'Deconsolidation';
    case 'intermodal_hub':    return 'Intermodal Hub';
    default:                  return type || 'CFS Station';
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
    case 'CFS_CREATED':        return 'cfs-audit-action-chip created';
    case 'CFS_UPDATED':        return 'cfs-audit-action-chip updated';
    case 'CFS_STATUS_CHANGED': return 'cfs-audit-action-chip status';
    case 'CFS_DEACTIVATED':    return 'cfs-audit-action-chip deleted';
    default:                   return 'cfs-audit-action-chip';
  }
}

function actionDisplayLabel(action) {
  switch (action) {
    case 'CFS_CREATED':        return 'CFS Created';
    case 'CFS_UPDATED':        return 'CFS Updated';
    case 'CFS_STATUS_CHANGED': return 'Status Changed';
    case 'CFS_DEACTIVATED':    return 'CFS Deactivated';
    default:                   return action || 'Audit Event';
  }
}

function mapApiError(err) {
  if (!err) return 'An unexpected error occurred.';
  const msg = err.message || '';
  if (err.status === 409 || msg.includes('already exists')) {
    return msg || 'A CFS station with this code already exists.';
  }
  if (err.status === 403 || msg.includes('Permission denied') || msg.includes('not permitted')) {
    return 'Permission denied: Only Platform Administrators can create, update, or deactivate CFS stations.';
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

/* ─── Add / Edit CFS Modal ────────────────────────────────────── */
function CfsFormModal({ station, onClose, onSuccess, notify }) {
  const isEdit = Boolean(station);

  const [form, setForm] = useState({
    cfs_code:        station?.cfs_code        ?? '',
    name:            station?.name            ?? '',
    firms_code:      station?.firms_code      ?? '',
    facility_type:   station?.facility_type   ?? 'cfs',
    port_id:         station?.port_id         ?? '',
    address_line1:   station?.address_line1   ?? '',
    address_line2:   station?.address_line2   ?? '',
    city:            station?.city            ?? '',
    state:           station?.state           ?? '',
    country:         station?.country         ?? '',
    postal_code:     station?.postal_code     ?? '',
    lat:             station?.lat             ?? '',
    lng:             station?.lng             ?? '',
    phone:           station?.phone           ?? '',
    email:           station?.email           ?? '',
    operating_hours: station?.operating_hours ?? '',
    status:          station?.status          ?? 'active',
    reason:          '',
  });

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [portOptions, setPortOptions] = useState([]);
  const [loadingPorts, setLoadingPorts] = useState(false);

  // Fetch active ports for dropdown reference
  useEffect(() => {
    let cancelled = false;
    setLoadingPorts(true);
    getPorts('limit=100&status=active')
      .then((res) => {
        if (!cancelled && res?.data) {
          setPortOptions(res.data);
        }
      })
      .catch(() => {
        // Fallback silently if port lookup fails
      })
      .finally(() => {
        if (!cancelled) setLoadingPorts(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function validate() {
    const code = (form.cfs_code || '').trim();
    if (!code) return 'CFS Code is required.';
    if (code.length > 30) return 'CFS Code must not exceed 30 characters.';

    const name = (form.name || '').trim();
    if (!name) return 'CFS Name is required.';
    if (name.length > 150) return 'CFS Name must not exceed 150 characters.';

    const country = (form.country || '').trim();
    if (!country) return 'Country is required.';
    if (country.length > 100) return 'Country must not exceed 100 characters.';

    if (form.firms_code && form.firms_code.trim().length > 10) {
      return 'FIRMS Code must not exceed 10 characters.';
    }

    if (form.email && form.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.email.trim())) {
        return 'Invalid email format.';
      }
      if (form.email.trim().length > 254) {
        return 'Email must not exceed 254 characters.';
      }
    }

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
        cfs_code:        form.cfs_code.trim().toUpperCase(),
        name:            form.name.trim(),
        firms_code:      form.firms_code.trim().toUpperCase() || undefined,
        facility_type:   form.facility_type || 'cfs',
        port_id:         form.port_id ? Number(form.port_id) : null,
        address_line1:   form.address_line1.trim() || undefined,
        address_line2:   form.address_line2.trim() || undefined,
        city:            form.city.trim() || undefined,
        state:           form.state.trim() || undefined,
        country:         form.country.trim(),
        postal_code:     form.postal_code.trim() || undefined,
        lat:             form.lat !== '' && form.lat !== null ? Number(form.lat) : undefined,
        lng:             form.lng !== '' && form.lng !== null ? Number(form.lng) : undefined,
        phone:           form.phone.trim() || undefined,
        email:           form.email.trim() || undefined,
        operating_hours: form.operating_hours.trim() || undefined,
        status:          form.status || 'active',
        reason:          form.reason.trim() || undefined,
      };

      if (isEdit) {
        await updateCfsStation(station.id, payload);
        notify(`CFS Station '${payload.cfs_code}' updated successfully.`);
      } else {
        await createCfsStation(payload);
        notify(`CFS Station '${payload.cfs_code}' created successfully.`);
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
      title={isEdit ? `Edit CFS Station — ${station.cfs_code}` : 'Register New CFS Station'}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} style={{ padding: '4px 0' }}>
        {error && (
          <div className="cfs-form-error" role="alert">
            <WarningCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="cfs-section-title">Identity & Facility Classification</div>
        <div className="cfs-form-grid">
          <label>
            CFS Code <span className="cfs-required">*</span>
            <input
              type="text"
              value={form.cfs_code}
              onChange={(e) => setForm((p) => ({ ...p, cfs_code: e.target.value.toUpperCase() }))}
              placeholder="e.g. CFS-LAX-01, ORD-CFS-HUB"
              required
              maxLength={30}
              autoFocus={!isEdit}
            />
          </label>

          <label>
            Station Name <span className="cfs-required">*</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Harbor West Logistics CFS"
              required
              maxLength={150}
            />
          </label>

          <label>
            FIRMS Code (US Customs)
            <input
              type="text"
              value={form.firms_code}
              onChange={(e) => setForm((p) => ({ ...p, firms_code: e.target.value.toUpperCase() }))}
              placeholder="e.g. W123, Y999 (4-10 chars)"
              maxLength={10}
            />
          </label>

          <label>
            Facility Type
            <select
              value={form.facility_type}
              onChange={(e) => setForm((p) => ({ ...p, facility_type: e.target.value }))}
            >
              <option value="cfs">Container Freight Station (CFS)</option>
              <option value="bonded_warehouse">Bonded Warehouse</option>
              <option value="icd">Inland Container Depot (ICD)</option>
              <option value="deconsolidation">Deconsolidation Center</option>
              <option value="intermodal_hub">Rail / Intermodal Hub</option>
            </select>
          </label>

          <label>
            Associated Port (Optional)
            <select
              value={form.port_id}
              onChange={(e) => setForm((p) => ({ ...p, port_id: e.target.value }))}
            >
              <option value="">— No linked port —</option>
              {portOptions.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.port_code} — {pt.name} ({pt.city || pt.country})
                </option>
              ))}
            </select>
          </label>

          <label>
            Operational Status
            <select
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        <div className="cfs-section-title">Physical Address & Location</div>
        <div className="cfs-form-grid">
          <label className="cfs-form-full-width">
            Address Line 1
            <input
              type="text"
              value={form.address_line1}
              onChange={(e) => setForm((p) => ({ ...p, address_line1: e.target.value }))}
              placeholder="e.g. 123 Ocean Blvd, Terminal Island"
              maxLength={255}
            />
          </label>

          <label className="cfs-form-full-width">
            Address Line 2
            <input
              type="text"
              value={form.address_line2}
              onChange={(e) => setForm((p) => ({ ...p, address_line2: e.target.value }))}
              placeholder="e.g. Building 4B, Gate 12"
              maxLength={255}
            />
          </label>

          <label>
            Country <span className="cfs-required">*</span>
            <input
              type="text"
              value={form.country}
              onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
              placeholder="e.g. United States, Germany, India"
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
              placeholder="e.g. California, Hamburg, Maharashtra"
              maxLength={100}
            />
          </label>

          <label>
            City
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
              placeholder="e.g. Long Beach, Hamburg, Mumbai"
              maxLength={100}
            />
          </label>

          <label>
            Postal Code / ZIP
            <input
              type="text"
              value={form.postal_code}
              onChange={(e) => setForm((p) => ({ ...p, postal_code: e.target.value }))}
              placeholder="e.g. 90802"
              maxLength={20}
            />
          </label>

          <label>
            Latitude (-90 to 90)
            <input
              type="number"
              step="any"
              min="-90"
              max="90"
              value={form.lat}
              onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))}
              placeholder="e.g. 33.7701"
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
              placeholder="e.g. -118.1937"
            />
          </label>
        </div>

        <div className="cfs-section-title">Contact & Operating Information</div>
        <div className="cfs-form-grid">
          <label>
            Contact Phone
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="e.g. +1-555-0199"
              maxLength={30}
            />
          </label>

          <label>
            Contact Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="e.g. dispatch@harborcfs.test"
              maxLength={254}
            />
          </label>

          <label className="cfs-form-full-width">
            Operating Hours
            <input
              type="text"
              value={form.operating_hours}
              onChange={(e) => setForm((p) => ({ ...p, operating_hours: e.target.value }))}
              placeholder="e.g. Mon-Fri 08:00-17:00, Sat 08:00-12:00"
              maxLength={255}
            />
          </label>

          <label className="cfs-form-full-width">
            Audit Reason (Optional)
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
              placeholder="e.g. Initial station commissioning, Customs FIRMS code assignment"
              maxLength={250}
            />
          </label>
        </div>

        <div className="modal-actions" style={{ marginTop: '20px' }}>
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
            {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create CFS Station')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── CFS Detail Modal (Overview & Audit Trail) ──────────────── */
function CfsDetailModal({
  cfsId,
  initialTab = 'overview',
  onClose,
  onEdit,
  onChangeStatus,
  canUpdate,
}) {
  const [tab, setTab] = useState(initialTab);
  const [station, setStation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Audit state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditPagination, setAuditPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });

  // Load single CFS station
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    getCfsStation(cfsId)
      .then((res) => {
        if (!cancelled) setStation(res?.data || res);
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
  }, [cfsId]);

  // Load audit trail when tab switches to audit
  const fetchAudit = useCallback(
    (pageToLoad = 1) => {
      setAuditLoading(true);
      setAuditError('');

      getCfsAuditLog(cfsId, { page: pageToLoad, limit: 10 })
        .then((res) => {
          setAuditLogs(res?.data || []);
          if (res?.pagination) setAuditPagination(res.pagination);
        })
        .catch((ex) => {
          setAuditError(mapApiError(ex));
        })
        .finally(() => {
          setAuditLoading(false);
        });
    },
    [cfsId]
  );

  useEffect(() => {
    if (tab === 'audit') {
      fetchAudit(auditPage);
    }
  }, [tab, auditPage, fetchAudit]);

  return (
    <ModalShell
      title={station ? `${station.name} (${station.cfs_code})` : 'CFS Station Details'}
      onClose={onClose}
      wide
    >
      {loading && (
        <div className="cfs-empty-state" style={{ padding: '40px 20px' }}>
          <ArrowClockwise size={28} />
          <p>Loading CFS details…</p>
        </div>
      )}

      {error && (
        <div className="cfs-form-error" role="alert">
          <WarningCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {!loading && station && (
        <div style={{ padding: '4px 0' }}>
          {/* Header Row */}
          <div className="cfs-detail-header">
            <div className="cfs-detail-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2>{station.name}</h2>
                <span className="cfs-code-badge">{station.cfs_code}</span>
                <span className={statusBadgeClass(station.status)}>
                  {station.status ? station.status.charAt(0).toUpperCase() + station.status.slice(1) : 'Active'}
                </span>
              </div>
              <p>
                {facilityTypeDisplay(station.facility_type)} · {station.city || '—'}, {station.country}
              </p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="cfs-modal-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'overview'}
              className={`cfs-modal-tab-btn ${tab === 'overview' ? 'active' : ''}`}
              onClick={() => setTab('overview')}
            >
              <Package size={16} /> Facility Overview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'audit'}
              className={`cfs-modal-tab-btn ${tab === 'audit' ? 'active' : ''}`}
              onClick={() => setTab('audit')}
            >
              <ClockCounterClockwise size={16} /> Audit History
              {auditPagination.total > 0 && (
                <span className="cfs-tab-count">{auditPagination.total}</span>
              )}
            </button>
          </div>

          {/* Overview Tab Content */}
          {tab === 'overview' && (
            <div>
              <div className="cfs-section-title">Facility Information</div>
              <div className="cfs-detail-grid">
                <div className="cfs-detail-card">
                  <span className="cfs-detail-card-label">CFS Code</span>
                  <span className="cfs-detail-card-value mono">{station.cfs_code}</span>
                </div>
                <div className="cfs-detail-card">
                  <span className="cfs-detail-card-label">Facility Name</span>
                  <span className="cfs-detail-card-value font-medium">{station.name}</span>
                </div>
                <div className="cfs-detail-card">
                  <span className="cfs-detail-card-label">Facility Classification</span>
                  <span className="cfs-detail-card-value">
                    <span className={facilityTypeBadgeClass(station.facility_type)}>
                      {facilityTypeDisplay(station.facility_type)}
                    </span>
                  </span>
                </div>
                <div className="cfs-detail-card">
                  <span className="cfs-detail-card-label">FIRMS Code</span>
                  <span className="cfs-detail-card-value mono">
                    {station.firms_code ? <span className="cfs-firms-badge">{station.firms_code}</span> : '—'}
                  </span>
                </div>
                <div className="cfs-detail-card">
                  <span className="cfs-detail-card-label">Linked Port</span>
                  <span className="cfs-detail-card-value font-medium">
                    {station.port ? (
                      <span>
                        <Anchor size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                        {station.port.port_code} — {station.port.name}
                      </span>
                    ) : (
                      '— No port linked —'
                    )}
                  </span>
                </div>
                <div className="cfs-detail-card">
                  <span className="cfs-detail-card-label">Operating Hours</span>
                  <span className="cfs-detail-card-value">{station.operating_hours || 'Standard 08:00 - 17:00'}</span>
                </div>
              </div>

              <div className="cfs-section-title">Address & Geography</div>
              <div className="cfs-detail-grid">
                <div className="cfs-detail-card">
                  <span className="cfs-detail-card-label">Street Address</span>
                  <span className="cfs-detail-card-value">
                    {[station.address_line1, station.address_line2].filter(Boolean).join(', ') || '—'}
                  </span>
                </div>
                <div className="cfs-detail-card">
                  <span className="cfs-detail-card-label">City & State</span>
                  <span className="cfs-detail-card-value">
                    {[station.city, station.state].filter(Boolean).join(', ') || '—'}
                  </span>
                </div>
                <div className="cfs-detail-card">
                  <span className="cfs-detail-card-label">Country & Postal Code</span>
                  <span className="cfs-detail-card-value">
                    {station.country} {station.postal_code ? `(${station.postal_code})` : ''}
                  </span>
                </div>
                <div className="cfs-detail-card">
                  <span className="cfs-detail-card-label">Coordinates</span>
                  <span className="cfs-detail-card-value mono">
                    {station.lat !== null && station.lng !== null && station.lat !== undefined && station.lng !== undefined
                      ? `${Number(station.lat).toFixed(4)}, ${Number(station.lng).toFixed(4)}`
                      : '—'}
                  </span>
                </div>
              </div>

              <div className="cfs-section-title">Contact Information</div>
              <div className="cfs-detail-grid">
                <div className="cfs-detail-card">
                  <span className="cfs-detail-card-label">Phone</span>
                  <span className="cfs-detail-card-value">{station.phone || '—'}</span>
                </div>
                <div className="cfs-detail-card">
                  <span className="cfs-detail-card-label">Email</span>
                  <span className="cfs-detail-card-value mono">{station.email || '—'}</span>
                </div>
              </div>

              <div className="cfs-section-title">System Timestamps</div>
              <div className="cfs-detail-grid">
                <div className="cfs-detail-card">
                  <span className="cfs-detail-card-label">Registered Date</span>
                  <span className="cfs-detail-card-value">{formatDate(station.created_at)}</span>
                </div>
                <div className="cfs-detail-card">
                  <span className="cfs-detail-card-label">Last Modified</span>
                  <span className="cfs-detail-card-value">{formatDateTime(station.updated_at)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Audit History Tab Content */}
          {tab === 'audit' && (
            <div>
              <div className="cfs-section-title">CFS Station Lifecycle & Modification Trail</div>
              {auditLoading && (
                <div className="cfs-empty-state" style={{ padding: '30px 10px' }}>
                  <ArrowClockwise size={24} />
                  <p>Loading audit trail…</p>
                </div>
              )}

              {auditError && (
                <div className="cfs-form-error" role="alert">
                  <WarningCircle size={18} />
                  <span>{auditError}</span>
                </div>
              )}

              {!auditLoading && !auditError && auditLogs.length === 0 && (
                <div className="cfs-empty-state" style={{ padding: '30px 10px' }}>
                  <Info size={28} />
                  <h3>No Audit Records Found</h3>
                  <p>Changes and status transitions will appear here.</p>
                </div>
              )}

              {!auditLoading && auditLogs.length > 0 && (
                <>
                  <div className="cfs-audit-table-wrap">
                    <table className="cfs-audit-table">
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
                                      <span key={k} className="cfs-diff-chip">
                                        <strong>{k}:</strong>{' '}
                                        <span className="cfs-diff-old">{String(oldObj[k] ?? 'empty')}</span>
                                        <span className="cfs-diff-arrow">→</span>
                                        <span className="cfs-diff-new">{String(newObj[k] ?? 'empty')}</span>
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
                                <div className="cfs-audit-actor">{log.actor_name || 'System / Platform Admin'}</div>
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
                                <div className="cfs-audit-meta-text">
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
                    <div className="cfs-pagination" style={{ marginTop: '10px' }}>
                      <span>
                        Page {auditPagination.page} of {auditPagination.totalPages} ({auditPagination.total} audit events)
                      </span>
                      <div className="cfs-pagination-pages">
                        <button
                          type="button"
                          className="cfs-page-btn"
                          disabled={auditPagination.page <= 1}
                          onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                        >
                          <CaretLeft size={14} />
                        </button>
                        <button
                          type="button"
                          className="cfs-page-btn"
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
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

/* ─── Status Change Modal ─────────────────────────────────────── */
function CfsStatusModal({ station, onClose, onSuccess, notify }) {
  const [status, setStatus] = useState(station?.status || 'active');
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
      await updateCfsStatus(station.id, status, reason.trim());
      notify(`CFS status updated to '${status}'.`);
      onSuccess();
    } catch (ex) {
      setError(mapApiError(ex));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Update Status — ${station.cfs_code}`} onClose={onClose}>
      <form onSubmit={handleSave}>
        <p className="cfs-modal-description">
          Modify the operational status of <strong>{station.name}</strong> ({station.cfs_code}).
          An audit reason is mandatory for compliance.
        </p>

        {error && (
          <div className="cfs-form-error" role="alert">
            <WarningCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="cfs-status-options">
          <label
            className={`cfs-status-option-btn ${status === 'active' ? 'selected' : ''}`}
            onClick={() => setStatus('active')}
          >
            <input
              type="radio"
              name="cfs_status"
              value="active"
              checked={status === 'active'}
              onChange={() => setStatus('active')}
            />
            <div>
              <span className="cfs-status-option-label">Active</span>
              <span className="cfs-status-option-desc">Station is open for container stripping, devanning, and deconsolidation.</span>
            </div>
          </label>

          <label
            className={`cfs-status-option-btn danger-option ${status === 'inactive' ? 'selected' : ''}`}
            onClick={() => setStatus('inactive')}
          >
            <input
              type="radio"
              name="cfs_status"
              value="inactive"
              checked={status === 'inactive'}
              onChange={() => setStatus('inactive')}
            />
            <div>
              <span className="cfs-status-option-label" style={{ color: '#dc2626' }}>Inactive</span>
              <span className="cfs-status-option-desc">Station is decommissioned or temporarily closed. New movements cannot route here.</span>
            </div>
          </label>
        </div>

        <div style={{ marginTop: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
            Audit Reason <span className="cfs-required">*</span>
          </label>
          <textarea
            required
            rows={3}
            className="large-textarea"
            placeholder="Explain reason for status change (e.g. Facility maintenance, regulatory license renewal, or operational reopening)..."
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
function CfsDeactivateModal({ station, onClose, onSuccess, notify }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setSaving(true);
    setError('');

    try {
      await deleteCfsStation(station.id, reason.trim() || undefined);
      notify(`CFS Station '${station.cfs_code}' deactivated successfully.`);
      onSuccess();
    } catch (ex) {
      setError(mapApiError(ex));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Deactivate CFS — ${station.cfs_code}`} onClose={onClose}>
      <p className="cfs-modal-description">
        Are you sure you want to deactivate <strong>{station.name}</strong> ({station.cfs_code})?
        This soft-deactivates the station by setting status to <strong>Inactive</strong> and logs an audit event.
      </p>

      {error && (
        <div className="cfs-form-error" role="alert">
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
          placeholder="State reason for deactivation (e.g. Facility lease expiration, carrier network realignment)..."
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

/* ─── Main CfsMaster Component ────────────────────────────────── */
export default function CfsMaster({
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

  const canRead   = !isDriver && (isPlatformAdmin || (hasPermission ? (hasPermission('cfs', 'read') || hasPermission('cfs.read')) : true));
  const canCreate = isPlatformAdmin || (resolvedRole !== 'Company Admin' && resolvedRole !== 'Shipper User' && hasPermission ? (hasPermission('cfs', 'create') || hasPermission('cfs.create')) : false);
  const canUpdate = isPlatformAdmin || (resolvedRole !== 'Company Admin' && resolvedRole !== 'Shipper User' && hasPermission ? (hasPermission('cfs', 'update') || hasPermission('cfs.update')) : false);
  const canDelete = isPlatformAdmin || (resolvedRole !== 'Company Admin' && resolvedRole !== 'Shipper User' && hasPermission ? (hasPermission('cfs', 'delete') || hasPermission('cfs.delete')) : false);

  const isBlocked = !canRead || isDriver;

  // Data State
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });

  // Filters & Search
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [facilityTypeFilter, setFacilityTypeFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // Summary Metrics
  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    cfsCount: 0,
  });

  // Modal State
  const [modal, setModal] = useState(null); // { kind: 'add' | 'edit' | 'detail' | 'status' | 'delete', station, tab? }

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
      const [allRes, activeRes, inactiveRes, cfsRes] = await Promise.all([
        getCfsStations('limit=1'),
        getCfsStations('limit=1&status=active'),
        getCfsStations('limit=1&status=inactive'),
        getCfsStations('limit=1&facility_type=cfs'),
      ]);

      setSummary({
        total:    allRes?.pagination?.total    ?? 0,
        active:   activeRes?.pagination?.total   ?? 0,
        inactive: inactiveRes?.pagination?.total ?? 0,
        cfsCount: cfsRes?.pagination?.total ?? 0,
      });
    } catch {
      // Fallback silently if metric queries fail
    }
  }, [profileLoading, isBlocked]);

  // Fetch CFS Stations from API
  const fetchStations = useCallback(async (opts = {}) => {
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

      const ft = opts.facility_type !== undefined ? opts.facility_type : facilityTypeFilter;
      if (ft && ft !== 'all') params.set('facility_type', ft);

      const cf = opts.country !== undefined ? opts.country : countryFilter;
      if (cf && cf.trim()) params.set('country', cf.trim());

      const res = await getCfsStations(params.toString());
      const data = res?.data || [];
      const pag = res?.pagination || { total: data.length, page: 1, limit: 10, totalPages: 1 };

      setStations(data);
      setPagination(pag);
    } catch (ex) {
      if (ex.status === 401 || ex.status === 403) {
        setError(
          ex.status === 401
            ? 'Your session has expired. Please sign in again.'
            : (ex?.data?.message || 'You do not have permission to view CFS Master.')
        );
      } else {
        setError(ex.message || 'Unable to load CFS station records.');
      }
    } finally {
      setLoading(false);
    }
  }, [profileLoading, isBlocked, page, limit, searchQuery, statusFilter, facilityTypeFilter, countryFilter]);

  // Initial & reactive load
  useEffect(() => {
    if (!profileLoading && !isBlocked) {
      fetchStations();
      fetchSummaryMetrics();
    }
  }, [profileLoading, isBlocked, fetchStations, fetchSummaryMetrics]);

  function handleReset() {
    setSearchInput('');
    setSearchQuery('');
    setStatusFilter('all');
    setFacilityTypeFilter('all');
    setCountryFilter('');
    setPage(1);
    setLimit(10);
    fetchStations({ page: 1, limit: 10, search: '', status: 'all', facility_type: 'all', country: '' });
    fetchSummaryMetrics();
  }

  function handlePageChange(newPage) {
    if (newPage < 1 || newPage > pagination.totalPages || newPage === page) return;
    setPage(newPage);
  }

  function handleSuccess() {
    setModal(null);
    fetchStations();
    fetchSummaryMetrics();
  }

  // Access Denied Screen (for Driver or unauthorized roles)
  if (!profileLoading && isBlocked) {
    return (
      <div className="cfs-master">
        <div className="cfs-access-denied">
          <div className="cfs-access-denied-icon">
            <LockKey size={28} />
          </div>
          <h2>Access Restricted</h2>
          <p>
            {isDriver
              ? 'Driver accounts do not have permission to view or manage global CFS records.'
              : 'You do not have the required permissions to view CFS Master. Please contact your system administrator.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="cfs-master">
      {/* ── Page Header ── */}
      <header className="cfs-page-header">
        <div className="cfs-page-header-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Package size={28} style={{ color: 'var(--blue, #005fdc)' }} />
            <h1>CFS Master</h1>
          </div>
          <p>Global directory of Container Freight Stations, inland container depots, bonded warehouses, and deconsolidation hubs.</p>
        </div>

        <div className="cfs-header-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              fetchStations();
              fetchSummaryMetrics();
            }}
            disabled={loading}
            title="Refresh CFS stations"
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
              <Plus size={16} />
              <span>Add CFS</span>
            </button>
          )}
        </div>
      </header>

      {/* ── KPI Summary Cards ── */}
      <div className="cfs-summary-cards">
        <div className="cfs-summary-card">
          <span className="cfs-summary-card-label">Total CFS Stations</span>
          <span className="cfs-summary-card-value">{summary.total}</span>
          <span className="cfs-summary-card-sub">Global freight depots</span>
        </div>

        <div className="cfs-summary-card">
          <span className="cfs-summary-card-label">Active Stations</span>
          <span className="cfs-summary-card-value active">{summary.active}</span>
          <span className="cfs-summary-card-sub">Open for cargo handling</span>
        </div>

        <div className="cfs-summary-card">
          <span className="cfs-summary-card-label">Inactive Stations</span>
          <span className="cfs-summary-card-value inactive">{summary.inactive}</span>
          <span className="cfs-summary-card-sub">Decommissioned / closed</span>
        </div>

        <div className="cfs-summary-card">
          <span className="cfs-summary-card-label">Core CFS Depots</span>
          <span className="cfs-summary-card-value cfs">{summary.cfsCount}</span>
          <span className="cfs-summary-card-sub">Container freight stations</span>
        </div>
      </div>

      {/* ── Toolbar: Search & Filters ── */}
      <div className="cfs-toolbar">
        <div className="search-input">
          <MagnifyingGlass size={17} />
          <input
            type="text"
            aria-label="Search CFS stations"
            placeholder="Search code, name, FIRMS, city, country…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {searchInput && (
            <button
              type="button"
              className="cfs-search-clear-btn"
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
          className="cfs-select"
          aria-label="Filter by facility type"
          value={facilityTypeFilter}
          onChange={(e) => {
            setFacilityTypeFilter(e.target.value);
            setPage(1);
          }}
        >
          {FACILITY_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          className="cfs-select"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <input
          type="text"
          className="cfs-filter-input"
          placeholder="Filter country…"
          aria-label="Filter by country"
          value={countryFilter}
          onChange={(e) => {
            setCountryFilter(e.target.value);
            setPage(1);
          }}
        />

        <select
          className="cfs-select"
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

        {(searchQuery || statusFilter !== 'all' || facilityTypeFilter !== 'all' || countryFilter) && (
          <button
            type="button"
            className="cfs-reset-btn"
            onClick={handleReset}
            title="Reset filters"
          >
            <X size={14} /> Clear filters
          </button>
        )}
      </div>

      {/* ── Main Data View ── */}
      {error && (
        <div className="cfs-error-state" role="alert">
          <div className="cfs-error-icon">
            <WarningCircle size={28} />
          </div>
          <h3>Unable to Load CFS Stations</h3>
          <p>{error}</p>
          <button type="button" className="btn" onClick={() => fetchStations()}>
            Try Again
          </button>
        </div>
      )}

      {!error && (
        <>
          <div className="cfs-table-wrap">
            <table className="cfs-table">
              <thead>
                <tr>
                  <th>CFS Code</th>
                  <th>Name</th>
                  <th>Facility Type</th>
                  <th>FIRMS Code</th>
                  <th>Linked Port</th>
                  <th>City</th>
                  <th>State</th>
                  <th>Country</th>
                  <th>Status</th>
                  <th className="cfs-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '40px 16px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--muted, #506484)' }}>
                        <ArrowClockwise className="toggle-collapsed-icon" size={18} />
                        <span>Loading CFS records…</span>
                      </div>
                    </td>
                  </tr>
                )}

                {!loading && stations.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ padding: '0' }}>
                      <div className="cfs-empty-state" style={{ border: 'none' }}>
                        <div className="cfs-empty-icon">
                          <Package size={28} />
                        </div>
                        <h3>No CFS Stations Found</h3>
                        <p>
                          {searchQuery || statusFilter !== 'all' || facilityTypeFilter !== 'all' || countryFilter
                            ? 'No CFS stations match your current search and filter criteria.'
                            : 'No CFS stations registered in the directory yet. Click "Add CFS" to register the first container freight depot.'}
                        </p>
                        {(searchQuery || statusFilter !== 'all' || facilityTypeFilter !== 'all' || countryFilter) && (
                          <button type="button" className="btn" onClick={handleReset}>
                            Reset Filters
                          </button>
                        )}
                        {!searchQuery && statusFilter === 'all' && canCreate && (
                          <button
                            type="button"
                            className="btn primary"
                            onClick={() => setModal({ kind: 'add' })}
                          >
                            <Plus size={16} /> Add First CFS
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}

                {!loading &&
                  stations.map((st) => (
                    <tr key={st.id}>
                      <td>
                        <button
                          type="button"
                          className="cfs-link-btn"
                          onClick={() => setModal({ kind: 'detail', cfsId: st.id, tab: 'overview' })}
                          title={`View details for ${st.cfs_code}`}
                        >
                          <span className="cfs-code-badge">{st.cfs_code}</span>
                        </button>
                      </td>

                      <td>
                        <strong>{st.name}</strong>
                      </td>

                      <td>
                        <span className={facilityTypeBadgeClass(st.facility_type)}>
                          {facilityTypeDisplay(st.facility_type)}
                        </span>
                      </td>

                      <td>
                        {st.firms_code ? (
                          <span className="cfs-firms-badge">{st.firms_code}</span>
                        ) : (
                          <span style={{ color: 'var(--muted, #506484)' }}>—</span>
                        )}
                      </td>

                      <td>
                        {st.port ? (
                          <span title={`${st.port.port_code} — ${st.port.name}`} style={{ fontSize: '12.5px', fontWeight: 500 }}>
                            <Anchor size={13} style={{ verticalAlign: 'middle', marginRight: '4px', color: '#005fdc' }} />
                            {st.port.port_code}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--muted, #506484)' }}>—</span>
                        )}
                      </td>

                      <td>{st.city || '—'}</td>
                      <td>{st.state || '—'}</td>
                      <td>{st.country || '—'}</td>

                      <td>
                        <span className={statusBadgeClass(st.status)}>
                          {st.status ? st.status.charAt(0).toUpperCase() + st.status.slice(1) : 'Active'}
                        </span>
                      </td>

                      <td>
                        <div className="cfs-row-actions">
                          <button
                            type="button"
                            className="cfs-action-btn"
                            title="View CFS Details"
                            aria-label={`View details for ${st.cfs_code}`}
                            onClick={() => setModal({ kind: 'detail', cfsId: st.id, tab: 'overview' })}
                          >
                            <Eye size={17} />
                          </button>

                          <button
                            type="button"
                            className="cfs-action-btn"
                            title="Audit History"
                            aria-label={`Audit history for ${st.cfs_code}`}
                            onClick={() => setModal({ kind: 'detail', cfsId: st.id, tab: 'audit' })}
                          >
                            <ClockCounterClockwise size={17} />
                          </button>

                          {canUpdate && (
                            <>
                              <button
                                type="button"
                                className="cfs-action-btn"
                                title="Edit CFS Station"
                                aria-label={`Edit ${st.cfs_code}`}
                                onClick={() => setModal({ kind: 'edit', station: st })}
                              >
                                <NotePencil size={17} />
                              </button>

                              <button
                                type="button"
                                className="cfs-action-btn"
                                title="Change Status"
                                aria-label={`Change status for ${st.cfs_code}`}
                                onClick={() => setModal({ kind: 'status', station: st })}
                              >
                                <ShieldCheck size={17} />
                              </button>
                            </>
                          )}

                          {canDelete && (
                            <button
                              type="button"
                              className="cfs-action-btn danger"
                              title={st.status === 'inactive' ? 'Station already inactive' : 'Deactivate CFS Station'}
                              aria-label={`Deactivate ${st.cfs_code}`}
                              disabled={st.status === 'inactive'}
                              onClick={() => setModal({ kind: 'delete', station: st })}
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
          </div>

          {/* ── Pagination ── */}
          {pagination.total > 0 && (
            <div className="cfs-pagination">
              <div className="cfs-pagination-info">
                Showing{' '}
                <strong>
                  {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}
                </strong>{' '}
                to{' '}
                <strong>
                  {Math.min(pagination.page * pagination.limit, pagination.total)}
                </strong>{' '}
                of <strong>{pagination.total}</strong> CFS stations
              </div>

              <div className="cfs-pagination-pages">
                <button
                  type="button"
                  className="cfs-page-btn"
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
                          className={`cfs-page-btn ${p === pagination.page ? 'active' : ''}`}
                          onClick={() => handlePageChange(p)}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    );
                  })}

                <button
                  type="button"
                  className="cfs-page-btn"
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
        <CfsFormModal
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
          notify={notify}
        />
      )}

      {modal?.kind === 'edit' && (
        <CfsFormModal
          station={modal.station}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
          notify={notify}
        />
      )}

      {modal?.kind === 'detail' && (
        <CfsDetailModal
          cfsId={modal.cfsId}
          initialTab={modal.tab || 'overview'}
          onClose={() => setModal(null)}
          onEdit={(st) => setModal({ kind: 'edit', station: st })}
          onChangeStatus={(st) => setModal({ kind: 'status', station: st })}
          canUpdate={canUpdate}
        />
      )}

      {modal?.kind === 'status' && (
        <CfsStatusModal
          station={modal.station}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
          notify={notify}
        />
      )}

      {modal?.kind === 'delete' && (
        <CfsDeactivateModal
          station={modal.station}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
          notify={notify}
        />
      )}
    </div>
  );
}

