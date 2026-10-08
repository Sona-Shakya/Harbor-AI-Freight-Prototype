import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MagnifyingGlass,
  Plus,
  ArrowClockwise,
  Eye,
  NotePencil,
  Trash,
  CheckCircle,
  WarningCircle,
  X,
  CaretLeft,
  CaretRight,
  GitBranch,
  Info,
  ShieldCheck,
  FileText,
  Buildings,
  Phone,
  EnvelopeSimple,
  MapPin,
  User,
  Star,
  Check,
} from '@phosphor-icons/react';
import {
  getBranches,
  getBranch,
  createBranch,
  updateBranch,
  updateBranchStatus,
  deleteBranch,
  getBranchAuditLog,
  getAccounts,
} from './api';
import './styles/branchMaster.css';

/* ─── Constants ──────────────────────────────────────────────── */
const ALLOWED_STATUSES = ['active', 'inactive'];
const STATUS_FILTER_OPTIONS = ['all', 'active', 'inactive'];
const DEBOUNCE_MS = 350;

/* ─── Helpers ─────────────────────────────────────────────────── */
function statusBadgeClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'active':
      return 'bm-badge bm-badge-active';
    case 'inactive':
      return 'bm-badge bm-badge-inactive';
    default:
      return 'bm-badge';
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

function actionBadgeClass(action) {
  switch (action) {
    case 'BRANCH_CREATED':
      return 'bm-audit-action-chip created';
    case 'BRANCH_UPDATED':
      return 'bm-audit-action-chip updated';
    case 'BRANCH_STATUS_CHANGED':
      return 'bm-audit-action-chip status';
    case 'BRANCH_DEACTIVATED':
      return 'bm-audit-action-chip deactivated';
    default:
      return 'bm-audit-action-chip';
  }
}

function actionDisplayLabel(action) {
  switch (action) {
    case 'BRANCH_CREATED':
      return 'Branch Created';
    case 'BRANCH_UPDATED':
      return 'Branch Updated';
    case 'BRANCH_STATUS_CHANGED':
      return 'Status Changed';
    case 'BRANCH_DEACTIVATED':
      return 'Branch Deactivated';
    default:
      return action || 'Audit Event';
  }
}

function mapApiError(err) {
  if (!err) return 'An unexpected error occurred.';
  const msg = err.message || '';
  if (err.status === 409 || msg.includes('headquarters branch already exists') || msg.includes('at most one headquarters branch')) {
    return 'Your organization already has a headquarters branch. Please edit the existing headquarters first.';
  }
  if (msg.includes('Cannot deactivate the organization\'s headquarters branch')) {
    return "Cannot deactivate the organization's headquarters branch.";
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
        } else if (
          !e.shiftKey &&
          document.activeElement === focusable[focusable.length - 1]
        ) {
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
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

/* ─── Add Branch Modal ────────────────────────────────────────── */
function AddBranchModal({ accounts, onClose, onSuccess, notify }) {
  const [form, setForm] = useState({
    branch_code: '',
    name: '',
    is_headquarters: false,
    status: 'active',
    manager_user_id: '',
    phone: '',
    email: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    country: '',
    postal_code: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setError('');
  };

  const handleBranchCodeBlur = () => {
    if (form.branch_code) {
      setForm((prev) => ({
        ...prev,
        branch_code: prev.branch_code.trim().toUpperCase(),
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanCode = form.branch_code.trim().toUpperCase();
    const cleanName = form.name.trim();

    if (!cleanCode) {
      setError('Branch code is required.');
      return;
    }
    if (cleanCode.length > 30) {
      setError('Branch code cannot exceed 30 characters.');
      return;
    }
    if (!cleanName) {
      setError('Branch name is required.');
      return;
    }
    if (cleanName.length > 150) {
      setError('Branch name cannot exceed 150 characters.');
      return;
    }

    if (form.email && form.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.email.trim())) {
        setError('Please enter a valid contact email address.');
        return;
      }
    }

    const payload = {
      branch_code: cleanCode,
      name: cleanName,
      is_headquarters: Boolean(form.is_headquarters),
      status: form.status,
      address_line1: form.address_line1.trim() || undefined,
      address_line2: form.address_line2.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state.trim() || undefined,
      country: form.country.trim() || undefined,
      postal_code: form.postal_code.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      manager_user_id: form.manager_user_id ? Number(form.manager_user_id) : null,
    };

    setSaving(true);
    try {
      const res = await createBranch(payload);
      notify?.(res?.message || `Branch "${cleanName}" created successfully.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(mapApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Add Branch" onClose={onClose} wide>
      <p className="bm-modal-description">
        Create an operational branch location. Organization is automatically set to your active tenant.
      </p>

      {error && (
        <div className="bm-notice-banner error" role="alert">
          <WarningCircle size={20} />
          <div className="bm-notice-content">
            <strong>Error</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="bm-modal-sections">
          {/* Section 1: Branch Information */}
          <div className="bm-modal-section">
            <div className="bm-section-header">
              <h4>Branch Information</h4>
              <p>Primary identifiers and designations for this branch</p>
            </div>
            <div className="bm-form-grid">
              <div className="bm-form-group">
                <label className="bm-label" htmlFor="bm-add-code">
                  Branch Code <span className="req">*</span>
                </label>
                <input
                  id="bm-add-code"
                  name="branch_code"
                  type="text"
                  required
                  className="bm-input"
                  placeholder="e.g. CHI-01, NYC-MAIN"
                  maxLength={30}
                  value={form.branch_code}
                  onChange={handleChange}
                  onBlur={handleBranchCodeBlur}
                  disabled={saving}
                  autoFocus
                />
                <span className="bm-hint">Unique identifier within your organization (auto-uppercased).</span>
              </div>

              <div className="bm-form-group">
                <label className="bm-label" htmlFor="bm-add-name">
                  Branch Name <span className="req">*</span>
                </label>
                <input
                  id="bm-add-name"
                  name="name"
                  type="text"
                  required
                  className="bm-input"
                  placeholder="e.g. Chicago Central Terminal"
                  maxLength={150}
                  value={form.name}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>

              <div className="bm-form-group full-width">
                <div className="bm-checkbox-group">
                  <input
                    id="bm-add-hq"
                    name="is_headquarters"
                    type="checkbox"
                    checked={form.is_headquarters}
                    onChange={handleChange}
                    disabled={saving}
                  />
                  <label htmlFor="bm-add-hq" className="bm-checkbox-label">
                    <span className="bm-checkbox-title">Headquarters</span>
                    <span className="bm-checkbox-hint">
                      {form.is_headquarters
                        ? "This branch will be designated as the organization's headquarters."
                        : "Designate as headquarters (an organization can have at most one headquarters branch)."}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Location & Address */}
          <div className="bm-modal-section">
            <div className="bm-section-header">
              <h4>Location & Address</h4>
              <p>Physical street address and postal details</p>
            </div>
            <div className="bm-form-grid">
              <div className="bm-form-group full-width">
                <label className="bm-label" htmlFor="bm-add-addr1">
                  Address Line 1
                </label>
                <input
                  id="bm-add-addr1"
                  name="address_line1"
                  type="text"
                  className="bm-input"
                  placeholder="Street address or logistics park"
                  value={form.address_line1}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>

              <div className="bm-form-group full-width">
                <label className="bm-label" htmlFor="bm-add-addr2">
                  Address Line 2
                </label>
                <input
                  id="bm-add-addr2"
                  name="address_line2"
                  type="text"
                  className="bm-input"
                  placeholder="Suite, Dock, Building number (optional)"
                  value={form.address_line2}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>

              <div className="bm-form-group">
                <label className="bm-label" htmlFor="bm-add-city">
                  City
                </label>
                <input
                  id="bm-add-city"
                  name="city"
                  type="text"
                  className="bm-input"
                  placeholder="City"
                  value={form.city}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>

              <div className="bm-form-group">
                <label className="bm-label" htmlFor="bm-add-state">
                  State
                </label>
                <input
                  id="bm-add-state"
                  name="state"
                  type="text"
                  className="bm-input"
                  placeholder="State or Region"
                  value={form.state}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>

              <div className="bm-form-group">
                <label className="bm-label" htmlFor="bm-add-country">
                  Country
                </label>
                <input
                  id="bm-add-country"
                  name="country"
                  type="text"
                  className="bm-input"
                  placeholder="e.g. USA, Canada"
                  value={form.country}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>

              <div className="bm-form-group">
                <label className="bm-label" htmlFor="bm-add-postal">
                  Postal Code
                </label>
                <input
                  id="bm-add-postal"
                  name="postal_code"
                  type="text"
                  className="bm-input"
                  placeholder="Postal / ZIP code"
                  value={form.postal_code}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Contact & Management */}
          <div className="bm-modal-section">
            <div className="bm-section-header">
              <h4>Contact & Management</h4>
              <p>Branch manager and direct communication channels</p>
            </div>
            <div className="bm-form-grid">
              <div className="bm-form-group">
                <label className="bm-label" htmlFor="bm-add-manager">
                  Branch Manager
                </label>
                <select
                  id="bm-add-manager"
                  name="manager_user_id"
                  className="bm-form-select"
                  value={form.manager_user_id}
                  onChange={handleChange}
                  disabled={saving}
                >
                  <option value="">No manager assigned</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name || acc.email} {acc.email ? `(${acc.email})` : ''}
                    </option>
                  ))}
                </select>
                <span className="bm-hint">Assign an active user belonging to your organization.</span>
              </div>

              <div className="bm-form-group">
                <label className="bm-label" htmlFor="bm-add-phone">
                  Phone Number
                </label>
                <input
                  id="bm-add-phone"
                  name="phone"
                  type="text"
                  className="bm-input"
                  placeholder="e.g. +1 312 555 0192"
                  value={form.phone}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>

              <div className="bm-form-group full-width">
                <label className="bm-label" htmlFor="bm-add-email">
                  Branch Email
                </label>
                <input
                  id="bm-add-email"
                  name="email"
                  type="email"
                  className="bm-input"
                  placeholder="e.g. chicago-ops@harbor.example"
                  value={form.email}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          {/* Section 4: Lifecycle Status */}
          <div className="bm-modal-section">
            <div className="bm-section-header">
              <h4>Lifecycle Status</h4>
              <p>Current operational availability of the location</p>
            </div>
            <div className="bm-form-grid">
              <div className="bm-form-group full-width">
                <label className="bm-label" htmlFor="bm-add-status">
                  Operational Status
                </label>
                <select
                  id="bm-add-status"
                  name="status"
                  className="bm-form-select"
                  value={form.status}
                  onChange={handleChange}
                  disabled={saving}
                >
                  <option value="active">Active — Available for operations</option>
                  <option value="inactive">Inactive — Suspended / Closed</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Adding Branch...' : '+ Add Branch'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Edit Branch Modal ────────────────────────────────────────── */
function EditBranchModal({ branch, accounts, onClose, onSuccess, notify }) {
  const [form, setForm] = useState({
    branch_code: branch?.branch_code || '',
    name: branch?.name || '',
    is_headquarters: Boolean(branch?.is_headquarters),
    status: branch?.status || 'active',
    manager_user_id: branch?.manager_user_id ? String(branch.manager_user_id) : '',
    phone: branch?.phone || '',
    email: branch?.email || '',
    address_line1: branch?.address_line1 || '',
    address_line2: branch?.address_line2 || '',
    city: branch?.city || '',
    state: branch?.state || '',
    country: branch?.country || '',
    postal_code: branch?.postal_code || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setError('');
  };

  const handleBranchCodeBlur = () => {
    if (form.branch_code) {
      setForm((prev) => ({
        ...prev,
        branch_code: prev.branch_code.trim().toUpperCase(),
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanCode = form.branch_code.trim().toUpperCase();
    const cleanName = form.name.trim();

    if (!cleanCode) {
      setError('Branch code is required.');
      return;
    }
    if (cleanCode.length > 30) {
      setError('Branch code cannot exceed 30 characters.');
      return;
    }
    if (!cleanName) {
      setError('Branch name is required.');
      return;
    }
    if (cleanName.length > 150) {
      setError('Branch name cannot exceed 150 characters.');
      return;
    }

    if (form.email && form.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.email.trim())) {
        setError('Please enter a valid contact email address.');
        return;
      }
    }

    // HQ rule check on client for instant guidance
    if (branch.is_headquarters && form.status === 'inactive') {
      setError("Cannot deactivate the organization's headquarters branch.");
      return;
    }

    const payload = {
      branch_code: cleanCode,
      name: cleanName,
      is_headquarters: Boolean(form.is_headquarters),
      status: form.status,
      address_line1: form.address_line1.trim() || null,
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      country: form.country.trim() || null,
      postal_code: form.postal_code.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      manager_user_id: form.manager_user_id ? Number(form.manager_user_id) : null,
    };

    setSaving(true);
    try {
      const res = await updateBranch(branch.id, payload);
      notify?.(res?.message || `Branch "${cleanName}" updated successfully.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(mapApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Edit Branch — ${branch.name}`} onClose={onClose} wide>
      <p className="bm-modal-description">
        Update branch profile, address, contact, and manager details.
      </p>

      {error && (
        <div className="bm-notice-banner error" role="alert">
          <WarningCircle size={20} />
          <div className="bm-notice-content">
            <strong>Update Error</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {branch.is_headquarters && (
        <div className="bm-notice-banner info">
          <Star size={18} weight="fill" />
          <div className="bm-notice-content">
            <strong>Headquarters Branch</strong>
            <p>
              This branch is currently marked as your organization's headquarters. It cannot be set to Inactive, and removing HQ status requires another HQ branch.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="bm-modal-sections">
          {/* Section 1: Branch Information */}
          <div className="bm-modal-section">
            <div className="bm-section-header">
              <h4>Branch Information</h4>
              <p>Primary identifiers and designations for this branch</p>
            </div>
            <div className="bm-form-grid">
              <div className="bm-form-group">
                <label className="bm-label" htmlFor="bm-edit-code">
                  Branch Code <span className="req">*</span>
                </label>
                <input
                  id="bm-edit-code"
                  name="branch_code"
                  type="text"
                  required
                  className="bm-input"
                  maxLength={30}
                  value={form.branch_code}
                  onChange={handleChange}
                  onBlur={handleBranchCodeBlur}
                  disabled={saving}
                />
              </div>

              <div className="bm-form-group">
                <label className="bm-label" htmlFor="bm-edit-name">
                  Branch Name <span className="req">*</span>
                </label>
                <input
                  id="bm-edit-name"
                  name="name"
                  type="text"
                  required
                  className="bm-input"
                  maxLength={150}
                  value={form.name}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>

              <div className="bm-form-group full-width">
                <div className="bm-checkbox-group">
                  <input
                    id="bm-edit-hq"
                    name="is_headquarters"
                    type="checkbox"
                    checked={form.is_headquarters}
                    onChange={handleChange}
                    disabled={saving}
                  />
                  <label htmlFor="bm-edit-hq" className="bm-checkbox-label">
                    <span className="bm-checkbox-title">Headquarters</span>
                    <span className="bm-checkbox-hint">
                      {form.is_headquarters
                        ? "This branch will be designated as the organization's headquarters."
                        : "Designate as headquarters (an organization can have at most one headquarters branch)."}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Location & Address */}
          <div className="bm-modal-section">
            <div className="bm-section-header">
              <h4>Location & Address</h4>
              <p>Physical street address and postal details</p>
            </div>
            <div className="bm-form-grid">
              <div className="bm-form-group full-width">
                <label className="bm-label" htmlFor="bm-edit-addr1">
                  Address Line 1
                </label>
                <input
                  id="bm-edit-addr1"
                  name="address_line1"
                  type="text"
                  className="bm-input"
                  value={form.address_line1}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>

              <div className="bm-form-group full-width">
                <label className="bm-label" htmlFor="bm-edit-addr2">
                  Address Line 2
                </label>
                <input
                  id="bm-edit-addr2"
                  name="address_line2"
                  type="text"
                  className="bm-input"
                  value={form.address_line2}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>

              <div className="bm-form-group">
                <label className="bm-label" htmlFor="bm-edit-city">
                  City
                </label>
                <input
                  id="bm-edit-city"
                  name="city"
                  type="text"
                  className="bm-input"
                  value={form.city}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>

              <div className="bm-form-group">
                <label className="bm-label" htmlFor="bm-edit-state">
                  State
                </label>
                <input
                  id="bm-edit-state"
                  name="state"
                  type="text"
                  className="bm-input"
                  value={form.state}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>

              <div className="bm-form-group">
                <label className="bm-label" htmlFor="bm-edit-country">
                  Country
                </label>
                <input
                  id="bm-edit-country"
                  name="country"
                  type="text"
                  className="bm-input"
                  value={form.country}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>

              <div className="bm-form-group">
                <label className="bm-label" htmlFor="bm-edit-postal">
                  Postal Code
                </label>
                <input
                  id="bm-edit-postal"
                  name="postal_code"
                  type="text"
                  className="bm-input"
                  value={form.postal_code}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Contact & Management */}
          <div className="bm-modal-section">
            <div className="bm-section-header">
              <h4>Contact & Management</h4>
              <p>Branch manager and direct communication channels</p>
            </div>
            <div className="bm-form-grid">
              <div className="bm-form-group">
                <label className="bm-label" htmlFor="bm-edit-manager">
                  Branch Manager
                </label>
                <select
                  id="bm-edit-manager"
                  name="manager_user_id"
                  className="bm-form-select"
                  value={form.manager_user_id}
                  onChange={handleChange}
                  disabled={saving}
                >
                  <option value="">No manager assigned</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name || acc.email} {acc.email ? `(${acc.email})` : ''}
                    </option>
                  ))}
                </select>
                <span className="bm-hint">Assign an active user belonging to your organization.</span>
              </div>

              <div className="bm-form-group">
                <label className="bm-label" htmlFor="bm-edit-phone">
                  Phone Number
                </label>
                <input
                  id="bm-edit-phone"
                  name="phone"
                  type="text"
                  className="bm-input"
                  value={form.phone}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>

              <div className="bm-form-group full-width">
                <label className="bm-label" htmlFor="bm-edit-email">
                  Branch Email
                </label>
                <input
                  id="bm-edit-email"
                  name="email"
                  type="email"
                  className="bm-input"
                  value={form.email}
                  onChange={handleChange}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          {/* Section 4: Lifecycle Status */}
          <div className="bm-modal-section">
            <div className="bm-section-header">
              <h4>Lifecycle Status</h4>
              <p>Current operational availability of the location</p>
            </div>
            <div className="bm-form-grid">
              <div className="bm-form-group full-width">
                <label className="bm-label" htmlFor="bm-edit-status">
                  Operational Status
                </label>
                <select
                  id="bm-edit-status"
                  name="status"
                  className="bm-form-select"
                  value={form.status}
                  onChange={handleChange}
                  disabled={saving || (branch?.is_headquarters && form.status === 'active')}
                >
                  <option value="active">Active — Available for operations</option>
                  <option value="inactive">Inactive — Suspended / Closed</option>
                </select>
                {branch?.is_headquarters && (
                  <span className="bm-hint" style={{ marginTop: '4px', display: 'block' }}>
                    Headquarters branch cannot be marked Inactive.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving Changes...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Change Status Modal ─────────────────────────────────────── */
function ChangeBranchStatusModal({ branch, onClose, onSuccess, notify }) {
  const currentStatus = branch?.status || 'active';
  const targetStatus = currentStatus === 'active' ? 'inactive' : 'active';
  const actionLabel = currentStatus === 'active' ? 'Deactivate' : 'Activate';
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isHq = Boolean(branch?.is_headquarters);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isHq && targetStatus === 'inactive') {
      setError("Cannot deactivate the organization's headquarters branch.");
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await updateBranchStatus(branch.id, targetStatus, reason.trim() || undefined);
      notify?.(res?.message || `Branch status changed to ${targetStatus}.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(mapApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`${actionLabel} Branch — ${branch.name}`} onClose={onClose}>
      <p className="bm-modal-description">
        Change status of branch <strong>{branch.branch_code}</strong> from{' '}
        <span className={statusBadgeClass(currentStatus)}>{currentStatus}</span> to{' '}
        <span className={statusBadgeClass(targetStatus)}>{targetStatus}</span>.
      </p>

      {error && (
        <div className="bm-notice-banner error" role="alert">
          <WarningCircle size={20} />
          <div className="bm-notice-content">
            <strong>Status Update Blocked</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {isHq && targetStatus === 'inactive' && (
        <div className="bm-notice-banner warning">
          <WarningCircle size={20} />
          <div className="bm-notice-content">
            <strong>Headquarters Protection</strong>
            <p>
              Cannot deactivate the organization's headquarters branch. You must designate another branch as headquarters first.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="bm-form-grid single-col">
          <div className="bm-form-group">
            <label className="bm-label" htmlFor="bm-status-reason">
              Reason for Status Change
            </label>
            <textarea
              id="bm-status-reason"
              className="bm-textarea"
              placeholder="e.g. Operational relocation, maintenance, or seasonal depot restart."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={saving}
            />
            <span className="bm-hint">Recorded in the audit trail for compliance tracking.</span>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            className={`btn ${targetStatus === 'inactive' ? '' : 'primary'}`}
            style={targetStatus === 'inactive' ? { background: '#dc2626', color: '#fff', borderColor: '#dc2626' } : {}}
            disabled={saving || (isHq && targetStatus === 'inactive')}
          >
            {saving ? `${actionLabel}ing...` : `${actionLabel} Branch`}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Delete / Deactivate Branch Modal ────────────────────────── */
function DeleteBranchModal({ branch, onClose, onSuccess, notify }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isHq = Boolean(branch?.is_headquarters);

  const handleDelete = async (e) => {
    e.preventDefault();
    if (isHq) {
      setError("Cannot deactivate the organization's headquarters branch.");
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await deleteBranch(branch.id, reason.trim() || undefined);
      notify?.(res?.message || `Branch "${branch.name}" deactivated successfully.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(mapApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Deactivate this branch?" onClose={onClose}>
      {isHq ? (
        <>
          <div className="bm-notice-banner error">
            <WarningCircle size={22} />
            <div className="bm-notice-content">
              <strong>Deactivation Prohibited</strong>
              <p>
                Cannot deactivate the organization's headquarters branch. Please promote another branch to headquarters before deactivating this branch.
              </p>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn primary" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={handleDelete}>
          <p className="bm-modal-description">
            The branch will remain in the system but will become inactive.
          </p>

          {error && (
            <div className="bm-notice-banner error" role="alert">
              <WarningCircle size={20} />
              <div className="bm-notice-content">
                <strong>Action Failed</strong>
                <p>{error}</p>
              </div>
            </div>
          )}

          <div className="bm-form-group" style={{ marginBottom: '20px' }}>
            <label className="bm-label" htmlFor="bm-del-reason">
              Reason for Deactivation
            </label>
            <textarea
              id="bm-del-reason"
              className="bm-textarea"
              placeholder="e.g. Facility consolidated with Central Hub."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
              disabled={saving}
            >
              {saving ? 'Deactivating...' : 'Deactivate Branch'}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}

/* ─── Branch Detail Modal ─────────────────────────────────────── */
function BranchDetailModal({ branch, onClose, onEdit, canUpdate, accounts }) {
  const [tab, setTab] = useState('overview'); // 'overview' | 'address' | 'audit'
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditPagination, setAuditPagination] = useState({ total: 0, totalPages: 1 });

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditError('');
    try {
      const res = await getBranchAuditLog(branch.id, { page: auditPage, limit: 10 });
      setAuditLogs(res?.data || []);
      setAuditPagination(res?.pagination || { total: 0, totalPages: 1 });
    } catch (err) {
      setAuditError(err?.message || 'Failed to load audit trail.');
    } finally {
      setAuditLoading(false);
    }
  }, [branch.id, auditPage]);

  useEffect(() => {
    if (tab === 'audit') {
      fetchAudit();
    }
  }, [tab, fetchAudit]);

  const manager = branch.manager || accounts?.find((a) => a.id === branch.manager_user_id);

  return (
    <ModalShell title={`${branch.name} (${branch.branch_code})`} onClose={onClose} wide>
      <div className="bm-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'overview'}
          className={`bm-tab ${tab === 'overview' ? 'active' : ''}`}
          onClick={() => setTab('overview')}
        >
          <Info size={16} /> Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'address'}
          className={`bm-tab ${tab === 'address' ? 'active' : ''}`}
          onClick={() => setTab('address')}
        >
          <MapPin size={16} /> Address & Contact
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'audit'}
          className={`bm-tab ${tab === 'audit' ? 'active' : ''}`}
          onClick={() => setTab('audit')}
        >
          <FileText size={16} /> Audit Trail
        </button>
      </div>

      {tab === 'overview' && (
        <div className="bm-detail-grid">
          <div className="bm-detail-field">
            <span className="bm-detail-label">Branch Code</span>
            <span className="bm-detail-value mono">{branch.branch_code}</span>
          </div>

          <div className="bm-detail-field">
            <span className="bm-detail-label">Branch Name</span>
            <span className="bm-detail-value">{branch.name}</span>
          </div>

          <div className="bm-detail-field">
            <span className="bm-detail-label">Headquarters</span>
            <span className="bm-detail-value">
              {branch.is_headquarters ? (
                <span className="bm-hq-chip">
                  <Star size={13} weight="fill" /> HQ
                </span>
              ) : (
                '—'
              )}
            </span>
          </div>

          <div className="bm-detail-field">
            <span className="bm-detail-label">Status</span>
            <span className="bm-detail-value">
              <span className={statusBadgeClass(branch.status)}>{branch.status}</span>
            </span>
          </div>

          <div className="bm-detail-field full-width">
            <span className="bm-detail-label">Manager</span>
            <span className="bm-detail-value">
              {manager ? (
                <div>
                  <strong>{manager.name || 'Manager'}</strong>
                  {manager.email && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{manager.email}</div>}
                  {manager.phone && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{manager.phone}</div>}
                </div>
              ) : (
                <span style={{ color: 'var(--muted)' }}>No manager</span>
              )}
            </span>
          </div>

          <div className="bm-detail-field">
            <span className="bm-detail-label">Created At</span>
            <span className="bm-detail-value">{formatDate(branch.created_at)}</span>
          </div>

          <div className="bm-detail-field">
            <span className="bm-detail-label">Updated At</span>
            <span className="bm-detail-value">{formatDate(branch.updated_at)}</span>
          </div>
        </div>
      )}

      {tab === 'address' && (
        <div className="bm-detail-grid">
          <div className="bm-detail-field full-width">
            <span className="bm-detail-label">Address Line 1</span>
            <span className="bm-detail-value">{branch.address_line1 || '—'}</span>
          </div>

          <div className="bm-detail-field full-width">
            <span className="bm-detail-label">Address Line 2</span>
            <span className="bm-detail-value">{branch.address_line2 || '—'}</span>
          </div>

          <div className="bm-detail-field">
            <span className="bm-detail-label">City</span>
            <span className="bm-detail-value">{branch.city || '—'}</span>
          </div>

          <div className="bm-detail-field">
            <span className="bm-detail-label">State</span>
            <span className="bm-detail-value">{branch.state || '—'}</span>
          </div>

          <div className="bm-detail-field">
            <span className="bm-detail-label">Country</span>
            <span className="bm-detail-value">{branch.country || '—'}</span>
          </div>

          <div className="bm-detail-field">
            <span className="bm-detail-label">Postal Code</span>
            <span className="bm-detail-value mono">{branch.postal_code || '—'}</span>
          </div>

          <div className="bm-detail-field">
            <span className="bm-detail-label">Phone</span>
            <span className="bm-detail-value">{branch.phone || '—'}</span>
          </div>

          <div className="bm-detail-field">
            <span className="bm-detail-label">Email</span>
            <span className="bm-detail-value">{branch.email || '—'}</span>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div>
          {auditLoading ? (
            <div className="bm-state-panel">
              <div className="bm-loading-spinner">
                <ArrowClockwise className="bm-spinning" size={20} />
                Loading audit trail...
              </div>
            </div>
          ) : auditError ? (
            <div className="bm-notice-banner error">
              <WarningCircle size={20} />
              <div className="bm-notice-content">
                <strong>Audit Error</strong>
                <p>{auditError}</p>
              </div>
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="bm-state-panel">
              <FileText size={32} />
              <h3>No audit entries recorded</h3>
              <p>Activity history will appear here following branch modifications.</p>
            </div>
          ) : (
            <>
              <div className="bm-audit-table-wrap">
                <table className="bm-audit-table" aria-label="Branch audit log">
                  <thead>
                    <tr>
                      <th>Date / Time</th>
                      <th>Action</th>
                      <th>Actor</th>
                      <th>Before Value</th>
                      <th>After Value</th>
                      <th>Reason / Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => {
                      const oldVal = log.old_value ? JSON.stringify(log.old_value, null, 1) : '—';
                      const newVal = log.new_value ? JSON.stringify(log.new_value, null, 1) : '—';

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
                          <td>
                            <div style={{ fontWeight: 600, fontSize: '12px' }}>
                              {log.actor_name || 'System'}
                            </div>
                            {log.actor_email && (
                              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                {log.actor_email}
                              </div>
                            )}
                          </td>
                          <td style={{ fontSize: '11.5px', fontFamily: 'monospace', maxWidth: '160px', wordBreak: 'break-all' }}>
                            {log.old_value?.status ? `status: ${log.old_value.status}` : oldVal}
                          </td>
                          <td style={{ fontSize: '11.5px', fontFamily: 'monospace', maxWidth: '160px', wordBreak: 'break-all' }}>
                            {log.new_value?.status ? `status: ${log.new_value.status}` : newVal}
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--muted)' }}>
                            {log.reason || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {auditPagination.totalPages > 1 && (
                <div className="bm-pagination" style={{ borderTop: 'none', padding: '10px 0 0' }}>
                  <span>Page {auditPage} of {auditPagination.totalPages}</span>
                  <div className="bm-pagination-controls">
                    <button
                      type="button"
                      className="bm-pagination-btn"
                      disabled={auditPage <= 1}
                      onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    >
                      <CaretLeft size={14} /> Previous
                    </button>
                    <button
                      type="button"
                      className="bm-pagination-btn"
                      disabled={auditPage >= auditPagination.totalPages}
                      onClick={() => setAuditPage((p) => p + 1)}
                    >
                      Next <CaretRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="modal-actions">
        {canUpdate && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              onClose();
              onEdit?.(branch);
            }}
          >
            <NotePencil size={16} /> Edit Branch
          </button>
        )}
        <button type="button" className="btn primary" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}

/* ─── Main BranchMaster Component ─────────────────────────────── */
export default function BranchMaster({
  hasPermission,
  notify,
  profileLoading,
  currentUser,
  currentRoleName,
}) {
  const canRead = hasPermission?.('branches', 'read') ?? true;
  const canCreate = hasPermission?.('branches', 'create') ?? true;
  const canUpdate = hasPermission?.('branches', 'update') ?? true;
  const canDelete = hasPermission?.('branches', 'delete') ?? true;

  // Block Shipper User and Driver from internal branch management
  const isBlockedRole =
    currentRoleName === 'Shipper User' ||
    currentRoleName === 'Driver' ||
    currentUser?.organization_roles?.[0]?.role?.name === 'Shipper User';

  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });

  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    headquarters: 0,
  });

  const [accounts, setAccounts] = useState([]);
  const [modal, setModal] = useState(null); // { kind: 'add' | 'edit' | 'status' | 'delete' | 'detail', branch }

  const searchTimerRef = useRef(null);

  // Debounce search input
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(val.trim());
      setPage(1);
    }, DEBOUNCE_MS);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
  };

  // Load candidate managers (accounts for current org)
  useEffect(() => {
    if (!profileLoading && canRead && !isBlockedRole) {
      getAccounts()
        .then((res) => {
          const list = Array.isArray(res) ? res : res?.data || [];
          setAccounts(list);
        })
        .catch(() => {
          // ignore or fallback
        });
    }
  }, [profileLoading, canRead, isBlockedRole]);

  // Load KPI totals across the organization
  const fetchSummaryCounts = useCallback(async () => {
    try {
      const res = await getBranches('limit=100');
      const all = res?.data || [];
      const total = res?.pagination?.total ?? all.length;
      const active = all.filter((b) => b.status === 'active').length;
      const inactive = all.filter((b) => b.status === 'inactive').length;
      const hq = all.filter((b) => b.is_headquarters).length;

      setSummary({ total, active, inactive, headquarters: hq });
    } catch {
      // ignore
    }
  }, []);

  // Fetch branches with filters and pagination
  const fetchBranchList = useCallback(async () => {
    if (profileLoading || !canRead || isBlockedRole) return;
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (searchQuery) params.set('search', searchQuery);
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);

      const res = await getBranches(params.toString());
      const data = res?.data || [];
      const pag = res?.pagination || {
        total: data.length,
        page: 1,
        limit,
        totalPages: Math.ceil(data.length / limit) || 1,
      };

      setBranches(data);
      setPagination(pag);
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        setError(
          err.status === 401
            ? 'Your session has expired. Please sign in again.'
            : 'You do not have permission to access Branch Master.'
        );
      } else {
        setError(err.message || 'Unable to load branches.');
      }
    } finally {
      setLoading(false);
    }
  }, [profileLoading, canRead, isBlockedRole, page, limit, searchQuery, statusFilter]);

  useEffect(() => {
    fetchBranchList();
  }, [fetchBranchList]);

  useEffect(() => {
    if (!profileLoading && canRead && !isBlockedRole) {
      fetchSummaryCounts();
    }
  }, [profileLoading, canRead, isBlockedRole, fetchSummaryCounts]);

  const handleRefresh = () => {
    fetchBranchList();
    fetchSummaryCounts();
  };

  const handleMutationSuccess = () => {
    fetchBranchList();
    fetchSummaryCounts();
  };

  /* ── Guard States ── */
  if (profileLoading) {
    return (
      <div className="branch-master">
        <div className="bm-table-wrap">
          <div className="bm-state-panel">
            <div className="bm-loading-spinner">
              <ArrowClockwise className="bm-spinning" size={22} />
              Loading permissions...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isBlockedRole || !canRead) {
    return (
      <div className="branch-master">
        <div className="bm-state-panel">
          <WarningCircle size={40} color="#dc2626" />
          <h3>Access Restricted</h3>
          <p>
            {isBlockedRole
              ? 'External shipper users and drivers do not have access to internal Branch Master.'
              : 'You do not have permission to view Branch Master.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="branch-master">
      {/* ── Page Header ── */}
      <div className="bm-page-header">
        <div className="bm-page-header-left">
          <h1>Branches</h1>
          <p>Manage operational branches, hubs, and office locations for your organization.</p>
        </div>
        <div className="bm-header-actions">
          <button
            type="button"
            className="btn"
            onClick={handleRefresh}
            title="Refresh branch list"
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
              Add Branch
            </button>
          )}
        </div>
      </div>

      {/* ── Summary / KPI Cards ── */}
      <div className="bm-summary-cards">
        <div className="bm-summary-card">
          <span className="bm-summary-card-label">Total Branches</span>
          <span className="bm-summary-card-value">
            {loading ? '—' : summary.total}
          </span>
          <span className="bm-summary-card-sub">All operational locations</span>
        </div>

        <div className="bm-summary-card">
          <span className="bm-summary-card-label">Active</span>
          <span className="bm-summary-card-value active">
            {loading ? '—' : summary.active}
          </span>
          <span className="bm-summary-card-sub">In operational service</span>
        </div>

        <div className="bm-summary-card">
          <span className="bm-summary-card-label">Inactive</span>
          <span className="bm-summary-card-value inactive">
            {loading ? '—' : summary.inactive}
          </span>
          <span className="bm-summary-card-sub">Deactivated / suspended</span>
        </div>

        <div className="bm-summary-card">
          <span className="bm-summary-card-label">Headquarters</span>
          <span className="bm-summary-card-value hq">
            {loading ? '—' : summary.headquarters}
          </span>
          <span className="bm-summary-card-sub">Primary operating hub</span>
        </div>
      </div>

      {/* ── Search & Filter Toolbar ── */}
      <div className="bm-toolbar">
        <div className="search-input">
          <MagnifyingGlass size={18} color="var(--muted)" />
          <input
            type="text"
            placeholder="Search branches..."
            value={searchInput}
            onChange={handleSearchChange}
          />
          {searchInput && (
            <button
              type="button"
              className="bm-search-clear-btn"
              onClick={handleClearSearch}
              title="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <select
          className="bm-select"
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
      </div>

      {/* ── Notice Banners (Global Error) ── */}
      {error && (
        <div className="bm-notice-banner error" role="alert">
          <WarningCircle size={20} />
          <div className="bm-notice-content">
            <strong>Unable to load branches.</strong>
            <p>{error}</p>
          </div>
          <button type="button" className="btn" style={{ marginLeft: 'auto' }} onClick={handleRefresh}>
            Retry
          </button>
        </div>
      )}

      {/* ── Branches Table Wrap ── */}
      <div className="bm-table-wrap">
        {loading ? (
          <div className="bm-state-panel">
            <div className="bm-loading-spinner">
              <ArrowClockwise className="bm-spinning" size={22} />
              Loading branch records...
            </div>
          </div>
        ) : branches.length === 0 ? (
          <div className="bm-state-panel">
            <GitBranch size={40} />
            <h3>No branches found</h3>
            <p>
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your search query or status filter.'
                : 'No branches have been registered for your organization yet.'}
            </p>
            {canCreate && (
              <button
                type="button"
                className="btn primary"
                style={{ marginTop: '16px' }}
                onClick={() => setModal({ kind: 'add' })}
              >
                <Plus size={16} /> Add Branch
              </button>
            )}
          </div>
        ) : (
          <>
            <table className="bm-table" aria-label="Branch directory">
              <thead>
                <tr>
                  <th>Branch Code</th>
                  <th>Branch Name</th>
                  <th>City</th>
                  <th>State</th>
                  <th>Country</th>
                  <th>Headquarters</th>
                  <th>Manager</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => {
                  const managerUser =
                    b.manager || accounts.find((a) => a.id === b.manager_user_id);

                  return (
                    <tr key={b.id}>
                      <td>
                        <button
                          type="button"
                          className="bm-code-link"
                          onClick={() => setModal({ kind: 'detail', branch: b })}
                          title="View branch details"
                        >
                          {b.branch_code}
                        </button>
                      </td>

                      <td>
                        <div className="bm-branch-name-wrap">
                          <span className="bm-branch-name">{b.name}</span>
                          {b.address_line1 && (
                            <span className="bm-branch-sub">{b.address_line1}</span>
                          )}
                        </div>
                      </td>

                      <td>{b.city || '—'}</td>

                      <td>{b.state || '—'}</td>

                      <td>{b.country || '—'}</td>

                      <td>
                        {b.is_headquarters ? (
                          <span className="bm-hq-chip table-badge">
                            <Star size={11} weight="fill" /> HQ
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td>
                        {managerUser ? (
                          <div className="bm-manager-cell">
                            <span className="bm-manager-name">{managerUser.name || 'Manager'}</span>
                            {managerUser.email && (
                              <span className="bm-manager-contact">{managerUser.email}</span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: '12px' }}>No manager</span>
                        )}
                      </td>

                      <td>
                        <span className={statusBadgeClass(b.status)}>{b.status === 'active' ? 'Active' : 'Inactive'}</span>
                      </td>

                      <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                        {formatDate(b.created_at)}
                      </td>

                      <td>
                        <div className="bm-actions-cell">
                          <button
                            type="button"
                            className="bm-action-btn"
                            title="View Details"
                            aria-label={`View ${b.name}`}
                            onClick={() => setModal({ kind: 'detail', branch: b })}
                          >
                            <Eye size={14} /> View
                          </button>

                          {canUpdate && (
                            <button
                              type="button"
                              className="bm-action-btn"
                              title="Edit Branch"
                              aria-label={`Edit ${b.name}`}
                              onClick={() => setModal({ kind: 'edit', branch: b })}
                            >
                              <NotePencil size={14} /> Edit
                            </button>
                          )}

                          {canUpdate && (
                            <button
                              type="button"
                              className="bm-action-btn"
                              title={b.status === 'active' ? 'Deactivate Branch' : 'Activate Branch'}
                              aria-label={`Change status for ${b.name}`}
                              onClick={() => setModal({ kind: 'status', branch: b })}
                            >
                              <ArrowClockwise size={14} /> Status
                            </button>
                          )}

                          {canDelete && (
                            <button
                              type="button"
                              className="bm-action-btn danger"
                              title={
                                b.is_headquarters
                                  ? 'Headquarters branch cannot be deactivated'
                                  : 'Deactivate Branch'
                              }
                              aria-label={`Deactivate ${b.name}`}
                              disabled={b.is_headquarters}
                              onClick={() => setModal({ kind: 'delete', branch: b })}
                            >
                              <Trash size={14} /> Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* ── Table Footer & Pagination ── */}
            <div className="bm-pagination">
              <div>
                Showing <strong>{branches.length}</strong> of <strong>{pagination.total}</strong> records
              </div>
              <div className="bm-pagination-controls">
                <button
                  type="button"
                  className="bm-pagination-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <CaretLeft size={14} /> Previous
                </button>
                <span className="bm-page-indicator">
                  Page {page} of {pagination.totalPages || 1}
                </span>
                <button
                  type="button"
                  className="bm-pagination-btn"
                  disabled={page >= (pagination.totalPages || 1)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <CaretRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Modals ── */}
      {modal?.kind === 'add' && (
        <AddBranchModal
          accounts={accounts}
          onClose={() => setModal(null)}
          onSuccess={handleMutationSuccess}
          notify={notify}
        />
      )}

      {modal?.kind === 'edit' && (
        <EditBranchModal
          branch={modal.branch}
          accounts={accounts}
          onClose={() => setModal(null)}
          onSuccess={handleMutationSuccess}
          notify={notify}
        />
      )}

      {modal?.kind === 'status' && (
        <ChangeBranchStatusModal
          branch={modal.branch}
          onClose={() => setModal(null)}
          onSuccess={handleMutationSuccess}
          notify={notify}
        />
      )}

      {modal?.kind === 'delete' && (
        <DeleteBranchModal
          branch={modal.branch}
          onClose={() => setModal(null)}
          onSuccess={handleMutationSuccess}
          notify={notify}
        />
      )}

      {modal?.kind === 'detail' && (
        <BranchDetailModal
          branch={modal.branch}
          accounts={accounts}
          canUpdate={canUpdate}
          onClose={() => setModal(null)}
          onEdit={(b) => setModal({ kind: 'edit', branch: b })}
        />
      )}
    </div>
  );
}
