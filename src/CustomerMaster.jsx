import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MagnifyingGlass,
  Plus,
  ArrowClockwise,
  Eye,
  NotePencil,
  ArrowCounterClockwise,
  WarningCircle,
  CheckCircle,
  CaretLeft,
  CaretRight,
  X,
  Buildings,
  Info,
  ClockCounterClockwise,
  EnvelopeSimple,
  Copy,
  Check,
} from '@phosphor-icons/react';
import {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  updateCustomerStatus,
  deactivateCustomer,
  getCustomerAuditLog,
  inviteCustomerUser,
} from './api';
import './styles/customerMaster.css';

/* ─── constants ─────────────────────────────────────────────── */
const ALLOWED_STATUSES = ['active', 'suspended', 'terminated'];
const STATUS_FILTER_OPTIONS = ['all', 'active', 'suspended', 'terminated'];
const DEBOUNCE_MS = 350;

/* ─── helpers ────────────────────────────────────────────────── */
function statusBadgeClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'active':     return 'cm-badge cm-badge-active';
    case 'suspended':  return 'cm-badge cm-badge-suspended';
    case 'terminated': return 'cm-badge cm-badge-terminated';
    default:           return 'cm-badge cm-badge-pending';
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

/* ─── sub-components ─────────────────────────────────────────── */

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

/* ── Add / Edit Customer modal ── */
function CustomerFormModal({ customer, onClose, onSuccess, notify }) {
  const isEdit = Boolean(customer);
  const [form, setForm] = useState({
    legal_name:       customer?.legal_name       ?? '',
    tax_id:           customer?.tax_id           ?? '',
    is_enterprise:    customer?.is_enterprise    ?? false,
    operating_status: customer?.operating_status ?? '',
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  function validate() {
    const name = (form.legal_name || '').trim();
    if (!name) return 'Legal Name is required.';
    if (name.length < 2) return 'Legal Name must be at least 2 characters.';
    const taxId = (form.tax_id || '').trim();
    if (!taxId && !isEdit) return 'Tax ID is required.';
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
        legal_name:    form.legal_name.trim(),
        tax_id:        form.tax_id.trim() || undefined,
        is_enterprise: Boolean(form.is_enterprise),
      };
      if (form.operating_status?.trim()) {
        payload.operating_status = form.operating_status.trim();
      }
      if (isEdit) {
        await updateCustomer(customer.id, payload);
        notify('Customer updated successfully.');
      } else {
        await createCustomer(payload);
        notify('Customer created successfully.');
      }
      onSuccess();
    } catch (ex) {
      setError(ex.message || 'An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Customer' : 'Add Customer'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate>
        <p className="cm-modal-description">
          {isEdit
            ? 'Update customer organization information and operational profile.'
            : 'Register a new shipper customer organization and configure initial profile details.'}
        </p>

        {error && (
          <div className="cm-form-error" role="alert">
            <WarningCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="cm-modal-sections">
          {/* Section 1: Customer Information */}
          <div className="cm-modal-section">
            <div className="cm-section-header">
              <h4>Customer Information</h4>
              <p>Core organizational identity and legal registration</p>
            </div>
            <div className="cm-form-grid">
              {/* Legal Name */}
              <label className="cm-form-full-width">
                Legal Company Name <span className="required">*</span>
                <input
                  type="text"
                  value={form.legal_name}
                  onChange={(e) => setForm(prev => ({ ...prev, legal_name: e.target.value }))}
                  placeholder="e.g. Apex Freight Ltd."
                  required
                  maxLength={200}
                  autoFocus
                />
              </label>

              {/* Tax ID */}
              <label className="cm-form-full-width">
                Tax ID / Registration Number {!isEdit && <span className="required">*</span>}
                <input
                  type="text"
                  value={form.tax_id}
                  onChange={(e) => setForm(prev => ({ ...prev, tax_id: e.target.value }))}
                  placeholder="e.g. 12-3456789"
                  maxLength={80}
                />
              </label>

              {/* Enterprise Account Flag */}
              <div className="cm-checkbox-row cm-form-full-width">
                <input
                  type="checkbox"
                  id="cm-enterprise-flag"
                  checked={Boolean(form.is_enterprise)}
                  onChange={(e) => setForm(prev => ({ ...prev, is_enterprise: e.target.checked }))}
                />
                <div>
                  <label htmlFor="cm-enterprise-flag" style={{ cursor: 'pointer', fontWeight: 600 }}>
                    Enterprise Account
                  </label>
                  <span className="cm-form-subtext">
                    Designate this customer as high-volume enterprise tier with priority dispatch and custom reporting.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Operational Profile */}
          <div className="cm-modal-section">
            <div className="cm-section-header">
              <h4>Operational Profile</h4>
              <p>Account classification and service settings</p>
            </div>
            <div className="cm-form-grid">
              {/* Type — read-only */}
              <label>
                Customer Type
                <input type="text" value="Shipper" readOnly />
                <span className="cm-form-subtext">Customers are strictly classified as Shippers.</span>
              </label>

              {/* Operating Status */}
              <label>
                Operating Status
                <input
                  type="text"
                  value={form.operating_status}
                  onChange={(e) => setForm(prev => ({ ...prev, operating_status: e.target.value }))}
                  placeholder="e.g. Standard Operations"
                  maxLength={100}
                />
                <span className="cm-form-subtext">Optional operational status or SLA tier notes.</span>
              </label>
            </div>
          </div>

          {/* Section 3: Account Status */}
          <div className="cm-modal-section">
            <div className="cm-section-header">
              <h4>Account Status</h4>
              <p>Platform access and lifecycle status</p>
            </div>
            <div className="cm-form-grid">
              <div className="cm-form-full-width">
                <div className="cm-status-readout">
                  <span className={statusBadgeClass(isEdit ? customer?.status : 'active')}>
                    {isEdit
                      ? (customer?.status ? customer.status.toUpperCase() : 'ACTIVE')
                      : 'ACTIVE (DEFAULT)'}
                  </span>
                  <span className="cm-status-readout-note">
                    {isEdit
                      ? 'Account status transitions (Active ↔ Suspended ↔ Terminated) are recorded in the audit trail. Use the Status action button in the table to modify.'
                      : 'New customer accounts are activated upon creation.'}
                  </span>
                </div>
              </div>
            </div>
          </div>
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
            {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Customer')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ── View Customer (read-only details) ── */
function CustomerDetailModal({ customerId, onClose, onInvite }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getCustomer(customerId)
      .then(res => {
        if (!cancelled) setCustomer(res?.data || res);
      })
      .catch(ex => {
        if (!cancelled) setError(ex.message || 'Failed to load customer details.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [customerId]);

  return (
    <ModalShell title="Customer Profile" onClose={onClose}>
      {loading && (
        <div className="cm-state-panel">
          <div className="cm-loading-spinner">
            <ArrowClockwise className="cm-spinning" size={20} />
            Loading customer details…
          </div>
        </div>
      )}
      {!loading && error && (
        <div className="cm-notice-banner error" role="alert">
          <WarningCircle size={20} />
          <div className="cm-notice-content">
            <strong>Error</strong>
            <p>{error}</p>
          </div>
        </div>
      )}
      {!loading && customer && (
        <>
          <div className="cm-modal-sections">
            {/* Organization Profile */}
            <div className="cm-modal-section">
              <div className="cm-section-header">
                <h4>Organization Information</h4>
                <p>Registration and business identifiers</p>
              </div>
              <div className="cm-detail-grid">
                <div className="cm-detail-field">
                  <span className="cm-detail-label">Legal Name</span>
                  <span className="cm-detail-value">{customer.legal_name || '—'}</span>
                </div>
                <div className="cm-detail-field">
                  <span className="cm-detail-label">Tax ID</span>
                  <span className="cm-detail-value mono">{customer.tax_id || '—'}</span>
                </div>
                <div className="cm-detail-field">
                  <span className="cm-detail-label">Customer Type</span>
                  <span className="cm-detail-value">Shipper</span>
                </div>
                <div className="cm-detail-field">
                  <span className="cm-detail-label">Account Tier</span>
                  <span className="cm-detail-value">
                    {customer.is_enterprise ? (
                      <span className="cm-badge cm-badge-enterprise">Enterprise</span>
                    ) : (
                      'Standard Tier'
                    )}
                  </span>
                </div>
                <div className="cm-detail-field">
                  <span className="cm-detail-label">Operating Status</span>
                  <span className="cm-detail-value">{customer.operating_status || 'Standard'}</span>
                </div>
                <div className="cm-detail-field">
                  <span className="cm-detail-label">Organization ID</span>
                  <span className="cm-detail-value mono">Org #{customer.id}</span>
                </div>
              </div>
            </div>

            {/* Account Lifecycle */}
            <div className="cm-modal-section">
              <div className="cm-section-header">
                <h4>Account Lifecycle & Audit</h4>
                <p>Status and timestamp tracking</p>
              </div>
              <div className="cm-detail-grid">
                <div className="cm-detail-field">
                  <span className="cm-detail-label">Current Status</span>
                  <span>
                    <span className={statusBadgeClass(customer.status)}>
                      {customer.status
                        ? customer.status.charAt(0).toUpperCase() + customer.status.slice(1)
                        : '—'}
                    </span>
                  </span>
                </div>
                <div className="cm-detail-field">
                  <span className="cm-detail-label">Created Date</span>
                  <span className="cm-detail-value">{formatDate(customer.created_at)}</span>
                </div>
                {customer.updated_at && (
                  <div className="cm-detail-field">
                    <span className="cm-detail-label">Last Updated</span>
                    <span className="cm-detail-value">{formatDate(customer.updated_at)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="modal-actions" style={{ marginTop: '20px' }}>
            {onInvite && customer && customer.status !== 'terminated' && (
              <button
                type="button"
                className="btn outline"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => {
                  onClose();
                  onInvite(customer);
                }}
              >
                <EnvelopeSimple size={15} /> Invite Portal User
              </button>
            )}
            <button className="btn primary" onClick={onClose}>Close</button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

/* ── Invite Customer User modal ── */
function InviteCustomerUserModal({ customer, onClose, onSuccess, notify }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Shipper User');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdData, setCreatedData] = useState(null);
  const [copied, setCopied] = useState(false);

  const SHIPPER_ROLE_OPTIONS = [
    { value: 'Shipper User', label: 'Shipper User' },
  ];

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmedEmail)) {
      setError('Please enter a valid work email address.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await inviteCustomerUser(customer.id, {
        email: trimmedEmail,
        role,
      });
      const data = res?.data || res;
      notify(`Invitation dispatched to ${trimmedEmail} for ${customer.legal_name}.`);
      if (data?.invitation_link) {
        setCreatedData(data);
      } else {
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err) {
      console.error('Invite customer user error:', err);
      setError(err?.message || 'Failed to dispatch invitation.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!createdData?.invitation_link) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(createdData.invitation_link);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      const input = document.querySelector('.cm-invitation-link-input');
      if (input) {
        input.focus();
        input.select();
        document.execCommand('copy');
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <ModalShell title="Invite Customer Portal User" onClose={onClose}>
      <p className="cm-modal-description">
        Invite an authorized customer representative from <strong>{customer.legal_name}</strong> to access the M12 Customer Portal.
      </p>

      {/* Customer Summary Box */}
      <div className="cm-detail-grid" style={{ marginBottom: '16px', background: 'var(--panel)', padding: '12px 14px', borderRadius: '8px' }}>
        <div className="cm-detail-field">
          <span className="cm-detail-label">Customer Organization</span>
          <span className="cm-detail-value font-medium">{customer.legal_name}</span>
        </div>
        <div className="cm-detail-field">
          <span className="cm-detail-label">Organization ID</span>
          <span className="cm-detail-value mono">#{customer.id}</span>
        </div>
        <div className="cm-detail-field">
          <span className="cm-detail-label">Account Type</span>
          <span className="cm-detail-value">Shipper (Customer Master)</span>
        </div>
        <div className="cm-detail-field">
          <span className="cm-detail-label">Account Status</span>
          <span className={statusBadgeClass(customer.status)}>
            {customer.status ? customer.status.charAt(0).toUpperCase() + customer.status.slice(1) : '—'}
          </span>
        </div>
      </div>

      {error && (
        <div className="cm-error-banner" role="alert" style={{ marginBottom: '14px' }}>
          <WarningCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {createdData ? (
        <div className="cm-invite-success">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#148969', marginBottom: '12px' }}>
            <CheckCircle size={20} weight="fill" />
            <strong>Invitation Dispatched Successfully</strong>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '12px' }}>
            An invitation email has been dispatched for <strong>{createdData.email}</strong> with role <strong>{createdData.role}</strong>.
          </p>
          {createdData.invitation_link && (
            <div style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                Invitation Link (Development Preview)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  readOnly
                  value={createdData.invitation_link}
                  className="cm-input cm-invitation-link-input"
                  style={{ fontSize: '12px', flex: 1 }}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={handleCopy}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {copied ? <Check size={16} color="#148969" /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
          <div className="modal-actions" style={{ marginTop: '20px' }}>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                if (onSuccess) onSuccess();
                onClose();
              }}
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="cm-form-group">
            <label className="cm-label" htmlFor="cm-invite-email">
              User Email Address <span className="req">*</span>
            </label>
            <input
              id="cm-invite-email"
              type="email"
              required
              className="cm-input"
              placeholder="e.g. logistics.manager@customer.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              disabled={submitting}
              autoFocus
            />
            <span className="cm-hint">The invitation email with secure activation link will be sent to this address.</span>
          </div>

          <div className="cm-form-group">
            <label className="cm-label" htmlFor="cm-invite-role">
              Customer Portal Role <span className="req">*</span>
            </label>
            <select
              id="cm-invite-role"
              className="cm-select"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={submitting}
            >
              {SHIPPER_ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="cm-hint">
              Shipper roles grant tenant-isolated access strictly to this shipper customer's shipments and preferences.
            </span>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? 'Sending Invitation...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}

/* ── Change Status modal ── */
function ChangeStatusModal({ customer, onClose, onSuccess, notify }) {
  const [selectedStatus, setSelectedStatus] = useState(customer?.status || 'active');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const statusOptions = [
    {
      value: 'active',
      label: 'Active',
      desc: 'Customer can operate normally.',
      danger: false,
    },
    {
      value: 'suspended',
      label: 'Suspended',
      desc: 'Customer access is temporarily suspended.',
      danger: false,
    },
    {
      value: 'terminated',
      label: 'Terminated',
      desc: 'Customer is permanently deactivated.',
      danger: true,
    },
  ];

  async function handleSave() {
    if (selectedStatus === customer?.status) {
      onClose();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateCustomerStatus(customer.id, selectedStatus);
      notify(`Customer status changed to ${selectedStatus}.`);
      onSuccess();
    } catch (ex) {
      setError(ex.message || 'Failed to update status.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Change Customer Status" onClose={onClose}>
      <p className="cm-modal-description">
        Changing status for <strong>{customer?.legal_name}</strong>.
        Select the new status below.
      </p>

      {error && (
        <div className="cm-form-error" role="alert">
          <WarningCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="cm-status-options">
        {statusOptions.map(opt => (
          <button
            key={opt.value}
            type="button"
            className={
              `cm-status-option-btn` +
              (opt.danger ? ' danger-option' : '') +
              (selectedStatus === opt.value ? ' selected' : '')
            }
            onClick={() => setSelectedStatus(opt.value)}
          >
            <span className={statusBadgeClass(opt.value)}>{opt.label}</span>
            <span>
              <span className="cm-status-option-label">{opt.label}</span>
              <span className="cm-status-option-desc">{opt.desc}</span>
            </span>
          </button>
        ))}
      </div>

      {(selectedStatus === 'terminated' || selectedStatus === 'suspended') && (
        <div className="cm-strong-warning">
          <WarningCircle size={18} />
          <span>
            {selectedStatus === 'terminated'
              ? 'This will deactivate this customer and prevent normal operational use. This action cannot be undone from this screen.'
              : 'Suspending a customer prevents them from accessing their portal until the status is restored.'}
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
          type="button"
          className="btn primary"
          onClick={handleSave}
          disabled={saving || selectedStatus === customer?.status}
        >
          {saving ? 'Saving…' : 'Apply status change'}
        </button>
      </div>
    </ModalShell>
  );
}

/* ── Deactivate confirmation modal ── */
function DeactivateModal({ customer, onClose, onSuccess, notify }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleDeactivate() {
    setSaving(true);
    setError('');
    try {
      await deactivateCustomer(customer.id);
      notify(`Customer "${customer.legal_name}" has been deactivated.`);
      onSuccess();
    } catch (ex) {
      setError(ex.message || 'Failed to deactivate customer.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Deactivate Customer" onClose={onClose}>
      <div className="cm-notice-banner warn">
        <WarningCircle size={20} />
        <div className="cm-notice-content">
          <strong>This action will deactivate the customer.</strong>
          <p>
            This will set the status of <strong>{customer?.legal_name}</strong> to{' '}
            <em>terminated</em> and prevent normal operational use. The record is
            preserved but cannot be reversed from this screen.
          </p>
        </div>
      </div>

      {error && (
        <div className="cm-form-error" role="alert">
          <WarningCircle size={18} />
          <span>{error}</span>
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
          type="button"
          className="btn primary"
          style={{ background: '#b53030', borderColor: '#b53030' }}
          onClick={handleDeactivate}
          disabled={saving}
        >
          {saving ? 'Deactivating…' : 'Confirm Deactivate'}
        </button>
      </div>
    </ModalShell>
  );
}

/* ── Audit Log modal ── */
const ACTION_LABELS = {
  CUSTOMER_CREATED:        'Created',
  CUSTOMER_UPDATED:        'Updated',
  CUSTOMER_STATUS_CHANGED: 'Status Changed',
  CUSTOMER_DEACTIVATED:    'Deactivated',
};

function actionBadgeClass(action) {
  switch (action) {
    case 'CUSTOMER_CREATED':        return 'cm-badge cm-badge-active';
    case 'CUSTOMER_UPDATED':        return 'cm-badge cm-badge-pending';
    case 'CUSTOMER_STATUS_CHANGED': return 'cm-badge cm-badge-suspended';
    case 'CUSTOMER_DEACTIVATED':    return 'cm-badge cm-badge-terminated';
    default:                        return 'cm-badge';
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

function diffFields(oldVal, newVal) {
  if (!oldVal || !newVal) return null;
  const keys = new Set([...Object.keys(oldVal), ...Object.keys(newVal)]);
  const changed = [];
  for (const k of keys) {
    if (String(oldVal[k] ?? '') !== String(newVal[k] ?? '')) {
      changed.push(k);
    }
  }
  return changed.length ? changed.join(', ') : null;
}

function AuditLogModal({ customer, onClose }) {
  const [logs, setLogs]         = useState([]);
  const [pagination, setPag]    = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [page, setPage]         = useState(1);

  const LIMIT = 20;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    getCustomerAuditLog(customer.id, { page, limit: LIMIT })
      .then((res) => {
        if (cancelled) return;
        setLogs(res?.data || []);
        setPag(res?.pagination || { total: 0, page: 1, limit: LIMIT, totalPages: 1 });
      })
      .catch((ex) => {
        if (cancelled) return;
        if (ex?.status === 403) {
          setError('You do not have permission to view the audit log for this customer.');
        } else if (ex?.status === 404) {
          setError('Customer not found.');
        } else {
          setError(ex?.message || 'Failed to load audit log.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [customer.id, page]);

  return (
    <ModalShell
      title={`Audit Log — ${customer.legal_name}`}
      onClose={onClose}
      wide
    >
      <p className="cm-modal-description">
        Full activity history for this customer record. Records are append-only.
      </p>

      {/* Loading */}
      {loading && (
        <div className="cm-state-panel">
          <div className="cm-loading-spinner">
            <ArrowClockwise className="cm-spinning" size={20} />
            Loading audit log…
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="cm-notice-banner error" role="alert">
          <WarningCircle size={20} />
          <div className="cm-notice-content">
            <strong>Error</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && logs.length === 0 && (
        <div className="cm-state-panel">
          <ClockCounterClockwise size={36} />
          <h3>No audit records yet</h3>
          <p>Audit events will appear here after any create, update, or status change.</p>
        </div>
      )}

      {/* Audit table */}
      {!loading && !error && logs.length > 0 && (
        <>
          <div className="cm-table-wrap cm-audit-table-wrap">
            <table className="cm-table" aria-label="Audit log">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Action</th>
                  <th>Performed By</th>
                  <th>Status Change</th>
                  <th>Changed Fields</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const oldStatus = log.old_value?.status;
                  const newStatus = log.new_value?.status;
                  const statusChange =
                    oldStatus || newStatus
                      ? `${oldStatus || '—'} → ${newStatus || '—'}`
                      : '—';
                  const changed = diffFields(log.old_value, log.new_value);
                  return (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                        {formatDateTime(log.created_at)}
                      </td>
                      <td>
                        <span className={actionBadgeClass(log.action)}>
                          {ACTION_LABELS[log.action] || log.action}
                        </span>
                      </td>
                      <td>
                        <span className="cm-customer-name" style={{ fontSize: '13px' }}>
                          {log.actor_name || '—'}
                        </span>
                        {log.actor_email && (
                          <span className="cm-customer-org-id">{log.actor_email}</span>
                        )}
                      </td>
                      <td style={{ fontSize: '12px' }}>{statusChange}</td>
                      <td style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        {changed || '—'}
                      </td>
                      <td style={{ fontSize: '12px' }}>{log.reason || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="cm-pagination" style={{ marginTop: '12px' }}>
              <span className="cm-pagination-info">
                {pagination.total} record{pagination.total !== 1 ? 's' : ''}
              </span>
              <div className="cm-pagination-controls">
                <button
                  type="button"
                  className="cm-pagination-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <CaretLeft size={14} /> Prev
                </button>
                <span className="cm-pagination-page-indicator">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  type="button"
                  className="cm-pagination-btn"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  aria-label="Next page"
                >
                  Next <CaretRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="modal-actions" style={{ marginTop: '16px' }}>
        <button className="btn primary" onClick={onClose}>Close</button>
      </div>
    </ModalShell>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function CustomerMaster({ hasPermission, notify, profileLoading = false }) {
  /* RBAC */
  const canRead   = hasPermission('customers', 'read');
  const canCreate = hasPermission('customers', 'create');
  const canUpdate = hasPermission('customers', 'update');
  const canDelete = hasPermission('customers', 'delete');
  // Audit: use a specific permission if defined; fall back to canRead so all
  // authorized users who can view customers can also view the audit trail.
  const canAudit  = hasPermission('customers', 'audit') || canRead;

  /* List state */
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({
    total: 0, page: 1, limit: 10, totalPages: 1,
  });
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage]             = useState(1);
  const [limit, setLimit]           = useState(10);

  /* Summary state (computed from list) */
  const [summary, setSummary] = useState({ total: 0, active: 0, suspended: 0, enterprise: 0 });

  /* Modal state */
  const [modal, setModal] = useState(null); // null | { kind, customer? }

  /* Debounce search */
  const debounceRef = useRef(null);
  const handleSearchChange = (value) => {
    setSearchInput(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(value.trim());
      setPage(1);
    }, DEBOUNCE_MS);
  };

  /* Fetch customers */
  const fetchCustomers = useCallback(async (opts = {}) => {
    if (profileLoading || !canRead) return;
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

      const res = await getCustomers(params.toString());
      const data = res?.data || [];
      const pag  = res?.pagination || { total: data.length, page: 1, limit: 10, totalPages: 1 };

      setCustomers(data);
      setPagination(pag);

      /* Compute summary from full dataset when on page 1 with no filters */
      if (!q && (!sf || sf === 'all') && pag.page === 1) {
        setSummary({
          total: pag.total,
          active: data.filter(c => c.status === 'active').length,
          suspended: data.filter(c => c.status === 'suspended').length,
          enterprise: data.filter(c => c.is_enterprise).length,
        });
      }
    } catch (ex) {
      if (ex.status === 401 || ex.status === 403) {
        setError(ex.status === 401
          ? 'Your session has expired. Please sign in again.'
          : 'You do not have permission to access Customer Master.');
      } else {
        setError(ex.message || 'Unable to load customers.');
      }
    } finally {
      setLoading(false);
    }
  }, [profileLoading, canRead, page, limit, searchQuery, statusFilter]);

  /* Initial load + deps change */
  useEffect(() => {
    if (!profileLoading && canRead) {
      fetchCustomers();
    }
  }, [profileLoading, canRead, fetchCustomers]);

  /* Reset page when filter/search changes */
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, limit]);

  function handleReset() {
    setSearchInput('');
    setSearchQuery('');
    setStatusFilter('all');
    setPage(1);
  }

  function closeModal() { setModal(null); }

  function afterMutation() {
    closeModal();
    fetchCustomers();
  }

  /* ── Loading profile/permissions ── */
  if (profileLoading) {
    return (
      <div className="customer-master">
        <div className="cm-table-wrap">
          <div className="cm-state-panel">
            <div className="cm-loading-spinner">
              <ArrowClockwise className="cm-spinning" size={22} />
              Loading permissions...
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Unauthorised ── */
  if (!canRead) {
    return (
      <div className="customer-master">
        <div className="cm-state-panel">
          <WarningCircle size={38} />
          <h3>Access Restricted</h3>
          <p>You do not have permission to access Customer Master.</p>
        </div>
      </div>
    );
  }

  /* ── Render ── */
  return (
    <div className="customer-master">

      {/* ── Page header ── */}
      <div className="cm-page-header">
        <div className="cm-page-header-left">
          <h1>Customers</h1>
          <p>Manage shipper customer organizations, accounts, and portal access.</p>
        </div>
        <div className="cm-header-actions">
          <button
            type="button"
            className="btn"
            onClick={() => fetchCustomers()}
            title="Refresh customer list"
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
              Add Customer
            </button>
          )}
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="cm-summary-cards">
        <div className="cm-summary-card">
          <span className="cm-summary-card-label">Total Customers</span>
          <span className="cm-summary-card-value">
            {loading ? '—' : pagination.total}
          </span>
          <span className="cm-summary-card-sub">All registered shippers</span>
        </div>
        <div className="cm-summary-card">
          <span className="cm-summary-card-label">Active</span>
          <span className="cm-summary-card-value active">
            {loading ? '—' : summary.active}
          </span>
          <span className="cm-summary-card-sub">Operational customers</span>
        </div>
        <div className="cm-summary-card">
          <span className="cm-summary-card-label">Suspended</span>
          <span className="cm-summary-card-value suspended">
            {loading ? '—' : summary.suspended}
          </span>
          <span className="cm-summary-card-sub">Temporarily restricted</span>
        </div>
        <div className="cm-summary-card">
          <span className="cm-summary-card-label">Enterprise</span>
          <span className="cm-summary-card-value enterprise">
            {loading ? '—' : summary.enterprise}
          </span>
          <span className="cm-summary-card-sub">Enterprise tier enabled</span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="cm-toolbar">
        {/* Search */}
        <div className="search-input">
          <MagnifyingGlass size={18} />
          <input
            aria-label="Search customers by legal name or tax ID"
            placeholder="Search customers..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        {/* Status filter */}
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          {ALLOWED_STATUSES.map(s => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>

        {/* Reset */}
        {(searchQuery || statusFilter !== 'all') && (
          <button type="button" className="btn" onClick={handleReset}>
            <ArrowCounterClockwise size={16} />
            Reset filters
          </button>
        )}

        {/* Page size — right side */}
        <div className="cm-toolbar-right">
          <span className="cm-page-size-label">Rows:</span>
          <select
            aria-label="Records per page"
            className="cm-page-size-select"
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
          >
            {[10, 25, 50, 100].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Table ── */}
      {error ? (
        <div className="cm-notice-banner error" role="alert">
          <WarningCircle size={20} />
          <div className="cm-notice-content">
            <strong>Unable to load customers</strong>
            <p>{error}</p>
          </div>
        </div>
      ) : loading ? (
        <div className="cm-table-wrap">
          <div className="cm-state-panel">
            <div className="cm-loading-spinner">
              <ArrowClockwise className="cm-spinning" size={22} />
              Loading customers…
            </div>
          </div>
        </div>
      ) : customers.length === 0 ? (
        <div className="cm-table-wrap">
          <div className="cm-state-panel">
            <Buildings size={38} />
            <h3>
              {searchQuery || statusFilter !== 'all'
                ? 'No customers match your search.'
                : 'No customers found.'}
            </h3>
            <p>
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'No customer records exist yet. Try adjusting your search or add a new customer.'}
            </p>
            {canCreate && !searchQuery && statusFilter === 'all' && (
              <button
                type="button"
                className="btn primary"
                style={{ marginTop: '8px' }}
                onClick={() => setModal({ kind: 'add' })}
              >
                <Plus size={16} />
                Add Customer
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="cm-table-wrap">
          <table className="cm-table" aria-label="Customer list">
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Tax ID</th>
                <th>Account Type</th>
                <th>Operating Status</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id}>
                  <td>
                    <span className="cm-customer-name">{c.legal_name || '—'}</span>
                    <span className="cm-customer-org-id">Org #{c.id}</span>
                  </td>
                  <td>
                    <span className="cm-tax-id">{c.tax_id || '—'}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span className="cm-badge-type">Shipper</span>
                      {c.is_enterprise && (
                        <span className="cm-badge cm-badge-enterprise">Enterprise</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="cm-operating-status">{c.operating_status || 'Standard'}</span>
                  </td>
                  <td>
                    <span className={statusBadgeClass(c.status)}>
                      {c.status
                        ? c.status.charAt(0).toUpperCase() + c.status.slice(1)
                        : '—'}
                    </span>
                  </td>
                  <td>{formatDate(c.created_at)}</td>
                  <td>
                    <div className="cm-actions-cell">
                      {/* View */}
                      <button
                        type="button"
                        className="cm-action-btn"
                        title="View customer profile"
                        onClick={() => setModal({ kind: 'view', customer: c })}
                      >
                        <Eye size={14} /> View
                      </button>

                      {/* Audit Log */}
                      {canAudit && (
                        <button
                          type="button"
                          className="cm-action-btn"
                          title="View audit log"
                          onClick={() => setModal({ kind: 'audit', customer: c })}
                        >
                          <ClockCounterClockwise size={14} /> Audit
                        </button>
                      )}

                      {/* Edit */}
                      {canUpdate && (
                        <button
                          type="button"
                          className="cm-action-btn"
                          title="Edit customer"
                          onClick={() => setModal({ kind: 'edit', customer: c })}
                        >
                          <NotePencil size={14} /> Edit
                        </button>
                      )}

                      {/* Change Status */}
                      {canUpdate && (
                        <button
                          type="button"
                          className="cm-action-btn"
                          title="Change customer status"
                          onClick={() => setModal({ kind: 'status', customer: c })}
                        >
                          <ArrowClockwise size={14} /> Status
                        </button>
                      )}

                      {/* Invite Customer User */}
                      {canUpdate && c.status !== 'terminated' && (
                        <button
                          type="button"
                          className="cm-action-btn"
                          title="Invite customer portal user"
                          onClick={() => setModal({ kind: 'invite', customer: c })}
                        >
                          <EnvelopeSimple size={14} /> Invite
                        </button>
                      )}

                      {/* Deactivate */}
                      {canDelete && c.status !== 'terminated' && (
                        <button
                          type="button"
                          className="cm-action-btn danger"
                          title="Deactivate customer"
                          onClick={() => setModal({ kind: 'deactivate', customer: c })}
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && !error && pagination.total > 0 && (
        <div className="cm-pagination">
          <span className="cm-pagination-info">
            Showing{' '}
            {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}
            –
            {Math.min(pagination.page * pagination.limit, pagination.total)}
            {' '}of {pagination.total} customers
          </span>
          <div className="cm-pagination-controls">
            <button
              type="button"
              className="cm-pagination-btn"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <CaretLeft size={16} /> Previous
            </button>
            <span className="cm-pagination-page-indicator">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              className="cm-pagination-btn"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              aria-label="Next page"
            >
              Next <CaretRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {modal?.kind === 'add' && (
        <CustomerFormModal
          customer={null}
          onClose={closeModal}
          onSuccess={afterMutation}
          notify={notify}
        />
      )}
      {modal?.kind === 'edit' && (
        <CustomerFormModal
          customer={modal.customer}
          onClose={closeModal}
          onSuccess={afterMutation}
          notify={notify}
        />
      )}
      {modal?.kind === 'view' && (
        <CustomerDetailModal
          customerId={modal.customer?.id}
          onClose={closeModal}
          onInvite={(c) => setModal({ kind: 'invite', customer: c })}
        />
      )}
      {modal?.kind === 'invite' && (
        <InviteCustomerUserModal
          customer={modal.customer}
          onClose={closeModal}
          onSuccess={fetchCustomers}
          notify={notify}
        />
      )}
      {modal?.kind === 'status' && (
        <ChangeStatusModal
          customer={modal.customer}
          onClose={closeModal}
          onSuccess={afterMutation}
          notify={notify}
        />
      )}
      {modal?.kind === 'deactivate' && (
        <DeactivateModal
          customer={modal.customer}
          onClose={closeModal}
          onSuccess={afterMutation}
          notify={notify}
        />
      )}
      {modal?.kind === 'audit' && (
        <AuditLogModal
          customer={modal.customer}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

