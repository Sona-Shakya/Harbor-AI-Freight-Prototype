import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MagnifyingGlass,
  Plus,
  ArrowClockwise,
  Eye,
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
  IdentificationCard,
  UploadSimple,
  Check,
  NotePencil,
  Clock,
  ThumbsUp,
  ThumbsDown,
} from '@phosphor-icons/react';
import {
  getDrivers,
  getDriver,
  createDriver,
  updateDriverProfile,
  recordDriverDocument,
  updateDriverDocument,
  updateDriverBackgroundCheck,
  updateDriverOnboardingStatus,
  approveDriverOnboarding,
  getVendors,
} from './api';
import './styles/driverMaster.css';

/* ─── Constants ──────────────────────────────────────────────── */
const ONBOARDING_STATUS_OPTIONS = [
  { value: 'all', label: 'All Onboarding Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'documents_pending', label: 'Documents Pending' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const BACKGROUND_CHECK_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'cleared', label: 'Cleared' },
  { value: 'failed', label: 'Failed' },
];

const DEBOUNCE_MS = 350;

/* ─── Helpers ─────────────────────────────────────────────────── */
function onboardingBadgeClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'approved':          return 'driver-badge driver-badge-approved';
    case 'under_review':      return 'driver-badge driver-badge-review';
    case 'in_progress':       return 'driver-badge driver-badge-progress';
    case 'documents_pending': return 'driver-badge driver-badge-docs';
    case 'rejected':          return 'driver-badge driver-badge-rejected';
    default:                  return 'driver-badge driver-badge-pending';
  }
}

function backgroundCheckBadgeClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'cleared':     return 'driver-bg-badge driver-bg-cleared';
    case 'failed':      return 'driver-bg-badge driver-bg-failed';
    case 'in_progress': return 'driver-bg-badge driver-bg-progress';
    default:            return 'driver-bg-badge driver-bg-pending';
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

function calcExpiryStatus(dateStr) {
  if (!dateStr) return { status: 'none', label: 'No date', isExpired: true };
  const exp = new Date(dateStr).getTime();
  if (isNaN(exp)) return { status: 'none', label: '—', isExpired: true };
  const now = Date.now();
  const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) {
    return { status: 'expired', label: `Expired (${Math.abs(diffDays)}d ago)`, isExpired: true };
  } else if (diffDays <= 30) {
    return { status: 'expiring', label: `Expires in ${diffDays}d`, isExpired: false, isDue: true };
  } else {
    return { status: 'valid', label: `Valid (${diffDays}d left)`, isExpired: false };
  }
}

/* ─── Modal Shell ────────────────────────────────────────────── */
function ModalShell({ title, onClose, children, wide = false }) {
  const boxRef = useRef(null);

  useEffect(() => {
    boxRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(16, 32, 60, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 20px 45px rgba(16, 32, 60, 0.2)',
          width: '100%',
          maxWidth: wide ? '840px' : '620px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          outline: 'none',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #d5e0ee',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--ink, #10203c)' }}>
            {title}
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

/* ─── Create Driver Modal ─────────────────────────────────────── */
function CreateDriverModal({ onClose, onSuccess, notify, currentUser }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('DriverTemp#2026');
  const [orgId, setOrgId] = useState('');
  const [carriers, setCarriers] = useState([]);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseState, setLicenseState] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const isPlatformAdmin =
    currentUser?.role === 'Platform Admin' ||
    currentUser?.roleId === 5 ||
    currentUser?.organization_roles?.some((r) => r.role?.name === 'Platform Admin');

  useEffect(() => {
    if (isPlatformAdmin) {
      getVendors('limit=100&status=active')
        .then((res) => {
          const list = res?.data || (Array.isArray(res) ? res : []);
          setCarriers(list);
          if (list.length > 0) setOrgId(String(list[0].id));
        })
        .catch(() => {});
    } else {
      const callerOrgId =
        currentUser?.organizationId ||
        currentUser?.org_id ||
        currentUser?.organization_roles?.[0]?.organization?.id;
      if (callerOrgId) setOrgId(String(callerOrgId));
    }
  }, [isPlatformAdmin, currentUser]);

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Driver full name is required';
    if (!email.trim()) {
      errs.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Enter a valid email address';
    }
    if (!orgId) errs.orgId = 'Carrier organization assignment is required';
    if (!licenseNumber.trim()) errs.licenseNumber = 'Driver license number is required';
    if (!licenseState.trim() || licenseState.trim().length < 2) {
      errs.licenseState = 'Driver license state is required (2 letters, e.g. CA)';
    }
    if (!licenseExpiry) {
      errs.licenseExpiry = 'License expiration date is required';
    } else if (new Date(licenseExpiry) <= new Date()) {
      errs.licenseExpiry = 'License expiration date must be in the future';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSubmitting(true);
      await createDriver({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        password: password || 'DriverTemp#2026',
        org_id: Number(orgId),
        license_number: licenseNumber.trim(),
        license_state: licenseState.trim().toUpperCase(),
        license_expiry: licenseExpiry,
        notes: notes.trim() || undefined,
      });

      notify('Driver onboard profile created successfully.');
      onSuccess();
    } catch (err) {
      console.error('Create driver error:', err);
      setErrors({ form: err.message || 'Failed to create driver profile.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title="Onboard New Driver" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {errors.form && (
          <div className="driver-warning-box" role="alert">
            <WarningCircle size={18} />
            <span>{errors.form}</span>
          </div>
        )}

        <h4 style={{ margin: '0 0 10px', fontSize: '14px', color: 'var(--ink)' }}>
          1. Driver Basic Information
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
              Full Name *
            </label>
            <input
              type="text"
              className="driver-search-input"
              style={{ paddingLeft: '12px' }}
              placeholder="e.g. John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && <small style={{ color: '#b91c1c' }}>{errors.name}</small>}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
              Email Address *
            </label>
            <input
              type="email"
              className="driver-search-input"
              style={{ paddingLeft: '12px' }}
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email && <small style={{ color: '#b91c1c' }}>{errors.email}</small>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
              Phone Number
            </label>
            <input
              type="tel"
              className="driver-search-input"
              style={{ paddingLeft: '12px' }}
              placeholder="+1-555-0199"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
              Temporary Password
            </label>
            <input
              type="text"
              className="driver-search-input"
              style={{ paddingLeft: '12px' }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <h4 style={{ margin: '14px 0 10px', fontSize: '14px', color: 'var(--ink)' }}>
          2. Organization & License Assignment
        </h4>
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
            Carrier Organization *
          </label>
          {isPlatformAdmin ? (
            <select
              className="driver-select"
              style={{ width: '100%' }}
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            >
              <option value="">Select Carrier Organization</option>
              {carriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legal_name || c.name} (ID: {c.id})
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className="driver-search-input"
              style={{ paddingLeft: '12px' }}
              disabled
              value={currentUser?.organization_roles?.[0]?.organization?.legal_name || 'Current Organization'}
            />
          )}
          {errors.orgId && <small style={{ color: '#b91c1c' }}>{errors.orgId}</small>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
              License Number *
            </label>
            <input
              type="text"
              className="driver-search-input"
              style={{ paddingLeft: '12px' }}
              placeholder="DL-XXXXXXX"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
            />
            {errors.licenseNumber && <small style={{ color: '#b91c1c' }}>{errors.licenseNumber}</small>}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
              State *
            </label>
            <input
              type="text"
              maxLength={2}
              className="driver-search-input"
              style={{ paddingLeft: '12px', textTransform: 'uppercase' }}
              placeholder="CA"
              value={licenseState}
              onChange={(e) => setLicenseState(e.target.value.toUpperCase())}
            />
            {errors.licenseState && <small style={{ color: '#b91c1c' }}>{errors.licenseState}</small>}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
              License Expiry *
            </label>
            <input
              type="date"
              className="driver-search-input"
              style={{ paddingLeft: '12px' }}
              value={licenseExpiry}
              onChange={(e) => setLicenseExpiry(e.target.value)}
            />
            {errors.licenseExpiry && <small style={{ color: '#b91c1c' }}>{errors.licenseExpiry}</small>}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
            Internal Notes
          </label>
          <textarea
            rows={2}
            className="driver-search-input"
            style={{ paddingLeft: '12px', resize: 'vertical' }}
            placeholder="Driver endorsements, CDL class, or special handling notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" className="btn outline" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={submitting}>
            {submitting ? 'Creating Profile...' : 'Create Driver Profile'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Driver Detail & Onboarding Workflow Modal ───────────────── */
function DriverDetailModal({ driverId, onClose, onSuccess, notify, canUpdate, currentUser }) {
  const [tab, setTab] = useState('workflow');
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Background check updater
  const [bgStatus, setBgStatus] = useState('pending');
  const [bgNotes, setBgNotes] = useState('');
  const [savingBg, setSavingBg] = useState(false);

  // Status updater
  const [onboardStatus, setOnboardStatus] = useState('pending');
  const [statusNotes, setStatusNotes] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  // Document upload state
  const [docType, setDocType] = useState('driver_license');
  const [docFile, setDocFile] = useState(null);
  const [docExpiry, setDocExpiry] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState('');

  // Approval state
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState('');

  const loadDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await getDriver(driverId);
      const data = res?.data || res;
      setDriver(data);
      if (data?.driver_profile) {
        setBgStatus(data.driver_profile.background_check_status || 'pending');
        setOnboardStatus(data.driver_profile.onboarding_status || 'pending');
      }
    } catch (err) {
      console.error('Load driver error:', err);
      setError(err.message || 'Failed to load driver details.');
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  // Validation checklist
  const profile = driver?.driver_profile || {};
  const docs = driver?.compliance_documents || [];
  const now = new Date();

  const hasLicenseData = Boolean(profile.license_number?.trim() && profile.license_state?.trim());
  const isBgCleared = profile.background_check_status === 'cleared';

  const licenseDoc = docs.find((d) => d.type === 'driver_license');
  const hasValidLicenseDoc =
    licenseDoc &&
    licenseDoc.verification_status === 'approved' &&
    licenseDoc.expiry_date &&
    new Date(licenseDoc.expiry_date) > now;

  const medicalDoc = docs.find((d) => d.type === 'medical_card');
  const hasValidMedicalDoc =
    medicalDoc &&
    medicalDoc.verification_status === 'approved' &&
    medicalDoc.expiry_date &&
    new Date(medicalDoc.expiry_date) > now;

  const canApproveOnboarding =
    hasLicenseData && isBgCleared && hasValidLicenseDoc && hasValidMedicalDoc;

  // Background check update
  const handleUpdateBg = async (e) => {
    e.preventDefault();
    try {
      setSavingBg(true);
      await updateDriverBackgroundCheck(driverId, {
        status: bgStatus,
        notes: bgNotes.trim() || undefined,
      });
      notify('Background check status updated.');
      await loadDetails();
    } catch (err) {
      console.error('Update bg error:', err);
      notify(err.message || 'Failed to update background check.');
    } finally {
      setSavingBg(false);
    }
  };

  // Status update
  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    try {
      setSavingStatus(true);
      await updateDriverOnboardingStatus(driverId, {
        status: onboardStatus,
        notes: statusNotes.trim() || undefined,
      });
      notify('Driver onboarding status updated.');
      await loadDetails();
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Update status error:', err);
      notify(err.message || 'Failed to update onboarding status.');
    } finally {
      setSavingStatus(false);
    }
  };

  // Document upload
  const handleUploadDoc = async (e) => {
    e.preventDefault();
    setDocError('');

    if (!docFile) {
      setDocError('Please select a document file to upload');
      return;
    }
    if (!docExpiry) {
      setDocError('Document expiration date is required');
      return;
    }
    if (new Date(docExpiry) <= now) {
      setDocError('Expiration date must be in the future');
      return;
    }

    try {
      setUploadingDoc(true);
      const fd = new FormData();
      fd.append('file', docFile);
      fd.append('type', docType);
      fd.append('expiry_date', docExpiry);
      fd.append('verification_status', 'approved');

      await recordDriverDocument(driverId, fd);
      notify(
        `${docType === 'driver_license' ? 'Driver license' : 'Medical card'} uploaded and verified successfully.`
      );
      setDocFile(null);
      setDocExpiry('');
      await loadDetails();
    } catch (err) {
      console.error('Upload document error:', err);
      setDocError(err.message || 'Failed to upload compliance document.');
    } finally {
      setUploadingDoc(false);
    }
  };

  // Approve onboarding
  const handleApprove = async () => {
    setApprovalError('');
    if (!canApproveOnboarding) {
      setApprovalError('All required documents and cleared background check are required before approval.');
      return;
    }

    try {
      setApproving(true);
      await approveDriverOnboarding(driverId, { notes: 'Driver onboarding approved by administrator' });
      notify('Driver onboarding approved successfully.');
      await loadDetails();
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Approve driver error:', err);
      setApprovalError(err.message || 'Failed to approve driver onboarding.');
    } finally {
      setApproving(false);
    }
  };

  // Stepper state computation
  const isApproved = profile.onboarding_status === 'approved';
  const isUnderReview = profile.onboarding_status === 'under_review';
  const isDocsUploaded = Boolean(licenseDoc && medicalDoc);

  return (
    <ModalShell
      title={`Driver Onboarding: ${driver?.name || 'Driver Details'}`}
      onClose={onClose}
      wide
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <ArrowClockwise className="spinning" size={24} />
          <p style={{ marginTop: '10px', color: 'var(--muted)' }}>Loading driver details...</p>
        </div>
      ) : error ? (
        <div className="driver-warning-box" role="alert">
          <WarningCircle size={18} />
          <span>{error}</span>
        </div>
      ) : (
        <>
          {/* Stepper */}
          <div className="driver-stepper">
            <div className="driver-step-item completed">
              <span className="driver-step-circle">1</span>
              <span>Profile Created</span>
            </div>
            <div className={`driver-step-line ${isDocsUploaded ? 'completed' : ''}`} />
            <div className={`driver-step-item ${isDocsUploaded ? 'completed' : 'active'}`}>
              <span className="driver-step-circle">2</span>
              <span>Documents</span>
            </div>
            <div className={`driver-step-line ${isBgCleared ? 'completed' : ''}`} />
            <div className={`driver-step-item ${isBgCleared ? 'completed' : ''}`}>
              <span className="driver-step-circle">3</span>
              <span>Background Check</span>
            </div>
            <div className={`driver-step-line ${isUnderReview || isApproved ? 'completed' : ''}`} />
            <div className={`driver-step-item ${isApproved ? 'completed' : isUnderReview ? 'active' : ''}`}>
              <span className="driver-step-circle">4</span>
              <span>Review</span>
            </div>
            <div className={`driver-step-line ${isApproved ? 'completed' : ''}`} />
            <div className={`driver-step-item ${isApproved ? 'completed' : ''}`}>
              <span className="driver-step-circle">5</span>
              <span>Approved</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="driver-modal-tabs">
            <button
              type="button"
              className={`driver-tab-btn ${tab === 'workflow' ? 'active' : ''}`}
              onClick={() => setTab('workflow')}
            >
              <ShieldCheck size={16} />
              <span>Onboarding & Profile</span>
            </button>
            <button
              type="button"
              className={`driver-tab-btn ${tab === 'documents' ? 'active' : ''}`}
              onClick={() => setTab('documents')}
            >
              <FileText size={16} />
              <span>Compliance Documents ({docs.length})</span>
            </button>
          </div>

          {/* TAB 1: WORKFLOW & PROFILE */}
          {tab === 'workflow' && (
            <div>
              {/* Summary Row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                  background: '#f8fafc',
                  padding: '14px',
                  borderRadius: '8px',
                  marginBottom: '18px',
                }}
              >
                <div>
                  <small style={{ color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                    Driver Name
                  </small>
                  <strong style={{ display: 'block', fontSize: '14px', color: 'var(--ink)' }}>
                    {driver?.name}
                  </strong>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{driver?.email}</span>
                </div>
                <div>
                  <small style={{ color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                    Assigned Carrier
                  </small>
                  <strong style={{ display: 'block', fontSize: '14px', color: 'var(--ink)' }}>
                    {driver?.organization?.legal_name || 'Carrier Organization'}
                  </strong>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    Type: {driver?.organization?.type || 'carrier'}
                  </span>
                </div>
                <div>
                  <small style={{ color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                    Onboarding Status
                  </small>
                  <div style={{ marginTop: '4px' }}>
                    <span className={onboardingBadgeClass(profile.onboarding_status)}>
                      {profile.onboarding_status || 'pending'}
                    </span>
                  </div>
                </div>
              </div>

              {/* License & Endorsement Details */}
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  marginBottom: '18px',
                }}
              >
                <h4 style={{ margin: '0 0 10px', fontSize: '13.5px', color: 'var(--ink)' }}>
                  Driver License & Medical Expirations
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>License Number & State</span>
                    <strong style={{ display: 'block', fontSize: '13.5px' }}>
                      {profile.license_number || '—'} {profile.license_state ? `(${profile.license_state})` : ''}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>License Expiration</span>
                    <strong style={{ display: 'block', fontSize: '13.5px' }}>
                      {formatDate(profile.license_expiry)}
                    </strong>
                    <small style={{ color: calcExpiryStatus(profile.license_expiry).isExpired ? '#b91c1c' : '#15803d' }}>
                      {calcExpiryStatus(profile.license_expiry).label}
                    </small>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Medical Card Expiration</span>
                    <strong style={{ display: 'block', fontSize: '13.5px' }}>
                      {formatDate(profile.medical_card_expiry)}
                    </strong>
                    <small style={{ color: calcExpiryStatus(profile.medical_card_expiry).isExpired ? '#b91c1c' : '#15803d' }}>
                      {calcExpiryStatus(profile.medical_card_expiry).label}
                    </small>
                  </div>
                </div>
              </div>

              {/* Background Check Card */}
              {canUpdate && (
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    marginBottom: '18px',
                  }}
                >
                  <h4 style={{ margin: '0 0 10px', fontSize: '13.5px', color: 'var(--ink)' }}>
                    Background Check Verification (FR-1.7)
                  </h4>
                  <form onSubmit={handleUpdateBg} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                        Check Status
                      </label>
                      <select
                        className="driver-select"
                        value={bgStatus}
                        onChange={(e) => setBgStatus(e.target.value)}
                      >
                        {BACKGROUND_CHECK_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: '180px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                        Verification Notes
                      </label>
                      <input
                        type="text"
                        className="driver-search-input"
                        style={{ paddingLeft: '10px' }}
                        placeholder="e.g. Cleared via HireRight report #8839"
                        value={bgNotes}
                        onChange={(e) => setBgNotes(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn small outline" disabled={savingBg}>
                      {savingBg ? 'Updating...' : 'Update Background Status'}
                    </button>
                  </form>
                </div>
              )}

              {/* Status Update Card */}
              {canUpdate && (
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    marginBottom: '18px',
                  }}
                >
                  <h4 style={{ margin: '0 0 10px', fontSize: '13.5px', color: 'var(--ink)' }}>
                    Onboarding Lifecycle Status
                  </h4>
                  <form onSubmit={handleUpdateStatus} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                        Status
                      </label>
                      <select
                        className="driver-select"
                        value={onboardStatus}
                        onChange={(e) => setOnboardStatus(e.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="documents_pending">Documents Pending</option>
                        <option value="under_review">Under Review</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: '180px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                        Audit Note
                      </label>
                      <input
                        type="text"
                        className="driver-search-input"
                        style={{ paddingLeft: '10px' }}
                        placeholder="Reason or update instructions..."
                        value={statusNotes}
                        onChange={(e) => setStatusNotes(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn small outline" disabled={savingStatus}>
                      {savingStatus ? 'Saving...' : 'Update Status'}
                    </button>
                  </form>
                </div>
              )}

              {/* Approval Checklist & Actions */}
              <div className="driver-checklist">
                <h4 style={{ margin: '0 0 8px', fontSize: '13.5px', color: 'var(--ink)' }}>
                  Onboarding Approval Requirements Checklist
                </h4>
                <div className={`driver-checklist-item ${hasLicenseData ? 'pass' : 'fail'}`}>
                  {hasLicenseData ? <CheckCircle size={16} /> : <WarningCircle size={16} />}
                  <span>Driver license number & state recorded</span>
                </div>
                <div className={`driver-checklist-item ${isBgCleared ? 'pass' : 'fail'}`}>
                  {isBgCleared ? <CheckCircle size={16} /> : <WarningCircle size={16} />}
                  <span>Background check verified as 'Cleared' (Current: {profile.background_check_status || 'pending'})</span>
                </div>
                <div className={`driver-checklist-item ${hasValidLicenseDoc ? 'pass' : 'fail'}`}>
                  {hasValidLicenseDoc ? <CheckCircle size={16} /> : <WarningCircle size={16} />}
                  <span>Valid Driver License document uploaded and unexpired</span>
                </div>
                <div className={`driver-checklist-item ${hasValidMedicalDoc ? 'pass' : 'fail'}`}>
                  {hasValidMedicalDoc ? <CheckCircle size={16} /> : <WarningCircle size={16} />}
                  <span>Valid Medical Card document uploaded and unexpired</span>
                </div>
              </div>

              {approvalError && (
                <div className="driver-warning-box" role="alert">
                  <WarningCircle size={18} />
                  <span>{approvalError}</span>
                </div>
              )}

              {canUpdate && profile.onboarding_status !== 'approved' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn outline"
                    style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
                    onClick={() => {
                      const note = window.prompt('Enter reason for rejecting driver onboarding:');
                      if (note) {
                        updateDriverOnboardingStatus(driverId, { status: 'rejected', notes: note })
                          .then(() => {
                            notify('Driver onboarding marked as rejected.');
                            loadDetails();
                          })
                          .catch((e) => notify(e.message || 'Failed to reject driver.'));
                      }
                    }}
                  >
                    <ThumbsDown size={16} />
                    <span>Reject Onboarding</span>
                  </button>

                  <button
                    type="button"
                    className="btn primary"
                    disabled={!canApproveOnboarding || approving}
                    onClick={handleApprove}
                    title={
                      !canApproveOnboarding
                        ? 'Approval locked: All checklist items must be satisfied first'
                        : 'Approve driver onboarding'
                    }
                  >
                    <ThumbsUp size={16} />
                    <span>{approving ? 'Approving Driver...' : 'Approve Driver Onboarding'}</span>
                  </button>
                </div>
              )}

              {profile.onboarding_status === 'approved' && (
                <div className="driver-success-box">
                  <CheckCircle size={20} />
                  <div>
                    <strong>Driver Onboarding Approved</strong>
                    <p style={{ margin: '2px 0 0', fontSize: '12.5px' }}>
                      This driver account has satisfied all compliance checks and is active for dispatch assignments.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COMPLIANCE DOCUMENTS */}
          {tab === 'documents' && (
            <div>
              {/* Existing Documents Table */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '13.5px', color: 'var(--ink)' }}>
                  Recorded Compliance Documents
                </h4>
                {docs.length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
                    No compliance documents recorded yet. Please upload driver license and medical card below.
                  </p>
                ) : (
                  <div className="driver-table-wrap">
                    <table className="driver-table">
                      <thead>
                        <tr>
                          <th>Document Type</th>
                          <th>Expiry Date</th>
                          <th>Validity Status</th>
                          <th>Verification</th>
                          <th>File Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {docs.map((d) => {
                          const exp = calcExpiryStatus(d.expiry_date);
                          return (
                            <tr key={d.id}>
                              <td>
                                <strong>
                                  {d.type === 'driver_license' ? 'Driver License' : 'Medical Card'}
                                </strong>
                              </td>
                              <td>{formatDate(d.expiry_date)}</td>
                              <td>
                                <span style={{ color: exp.isExpired ? '#b91c1c' : '#15803d', fontWeight: 600 }}>
                                  {exp.label}
                                </span>
                              </td>
                              <td>
                                <span
                                  className={`driver-badge ${
                                    d.verification_status === 'approved'
                                      ? 'driver-badge-approved'
                                      : 'driver-badge-pending'
                                  }`}
                                >
                                  {d.verification_status || 'pending'}
                                </span>
                              </td>
                              <td>
                                <small style={{ color: 'var(--muted)' }}>
                                  {d.file_ref?.slice(0, 30)}...
                                </small>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Upload Document Form */}
              {canUpdate && (
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '16px',
                    background: '#f8fafc',
                  }}
                >
                  <h4 style={{ margin: '0 0 12px', fontSize: '13.5px', color: 'var(--ink)' }}>
                    Upload New Compliance Document (FR-1.7)
                  </h4>
                  {docError && (
                    <div className="driver-warning-box" role="alert">
                      <WarningCircle size={18} />
                      <span>{docError}</span>
                    </div>
                  )}
                  <form onSubmit={handleUploadDoc}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '12px',
                        marginBottom: '14px',
                      }}
                    >
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                          Document Type *
                        </label>
                        <select
                          className="driver-select"
                          style={{ width: '100%' }}
                          value={docType}
                          onChange={(e) => setDocType(e.target.value)}
                        >
                          <option value="driver_license">Driver License</option>
                          <option value="medical_card">Medical Examiner Card</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                          Expiration Date *
                        </label>
                        <input
                          type="date"
                          className="driver-search-input"
                          style={{ paddingLeft: '10px' }}
                          value={docExpiry}
                          onChange={(e) => setDocExpiry(e.target.value)}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                        File Attachment (PDF, PNG, JPG) *
                      </label>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="submit" className="btn primary small" disabled={uploadingDoc}>
                        <UploadSimple size={16} />
                        <span>{uploadingDoc ? 'Uploading & Verifying...' : 'Upload Document'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </ModalShell>
  );
}

/* ─── Main Driver Master Component ───────────────────────────── */
export default function DriverMaster({
  hasPermission,
  notify,
  profileLoading,
  currentUser,
  currentRoleName,
}) {
  const isDriver =
    currentRoleName === 'Driver' ||
    currentUser?.role === 'Driver' ||
    currentUser?.roleName === 'Driver' ||
    currentUser?.organization_roles?.some((r) => r.role?.name === 'Driver');

  const canRead = !isDriver && hasPermission('drivers', 'read');
  const canCreate = !isDriver && hasPermission('drivers', 'create');
  const canUpdate = !isDriver && hasPermission('drivers', 'update');

  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detailDriverId, setDetailDriverId] = useState(null);

  const fetchDrivers = useCallback(async () => {
    if (!canRead) return;
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      const res = await getDrivers(params.toString());
      const data = res?.data || res;
      setDrivers(data?.drivers || (Array.isArray(data) ? data : []));
      setPagination({
        total: data?.total || 0,
        page: data?.page || 1,
        limit: data?.limit || 20,
        totalPages: data?.totalPages || 1,
      });
    } catch (err) {
      console.error('Fetch drivers error:', err);
      setError(err.message || 'Failed to load drivers.');
    } finally {
      setLoading(false);
    }
  }, [canRead, page, statusFilter]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  // Client-side search filter
  const filteredDrivers = drivers.filter((d) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const nameMatch = d.user?.name?.toLowerCase().includes(q) || d.name?.toLowerCase().includes(q);
    const emailMatch = d.user?.email?.toLowerCase().includes(q) || d.email?.toLowerCase().includes(q);
    const licenseMatch = d.license_number?.toLowerCase().includes(q);
    const carrierMatch = d.organization?.legal_name?.toLowerCase().includes(q);
    return nameMatch || emailMatch || licenseMatch || carrierMatch;
  });

  // KPI calculations
  const totalDrivers = pagination.total || drivers.length;
  const approvedCount = drivers.filter((d) => d.onboarding_status === 'approved').length;
  const inReviewCount = drivers.filter(
    (d) => d.onboarding_status === 'under_review' || d.onboarding_status === 'in_progress'
  ).length;
  const docsDueCount = drivers.filter(
    (d) =>
      d.onboarding_status === 'documents_pending' ||
      d.onboarding_status === 'pending' ||
      calcExpiryStatus(d.license_expiry).isExpired ||
      calcExpiryStatus(d.medical_card_expiry).isExpired
  ).length;

  if (!profileLoading && isDriver) {
    return (
      <div className="driver-master">
        <div className="driver-warning-box" style={{ margin: '30px auto', maxWidth: '600px' }}>
          <WarningCircle size={24} />
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: '16px' }}>Access Restricted</h3>
            <p style={{ margin: 0, fontSize: '13.5px' }}>
              Driver accounts do not possess administrative permissions to view or manage driver master records.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="driver-master">
      {/* Page Header */}
      <div className="driver-page-header">
        <div className="driver-page-header-left">
          <h1>Driver Onboarding & Master</h1>
          <p>
            Enterprise driver qualification workflow, CDL verification, medical card compliance, and background screening (FR-1.7).
          </p>
        </div>
        <div className="driver-header-actions">
          <button
            type="button"
            className="icon-btn"
            title="Refresh driver list"
            onClick={fetchDrivers}
            disabled={loading}
          >
            <ArrowClockwise size={18} className={loading ? 'spinning' : ''} />
          </button>
          {canCreate && (
            <button
              type="button"
              className="btn primary"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={18} />
              <span> Onboard Driver</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="driver-summary-cards">
        <div className="driver-summary-card">
          <span className="driver-summary-card-label">Total Drivers</span>
          <span className="driver-summary-card-val">{totalDrivers}</span>
          <span className="driver-summary-card-sub">Fleet operator pool</span>
        </div>
        <div className="driver-summary-card">
          <span className="driver-summary-card-label">Active / Approved</span>
          <span className="driver-summary-card-val" style={{ color: '#15803d' }}>
            {approvedCount}
          </span>
          <span className="driver-summary-card-sub">Eligible for load assignment</span>
        </div>
        <div className="driver-summary-card">
          <span className="driver-summary-card-label">Under Review</span>
          <span className="driver-summary-card-val" style={{ color: '#005fdc' }}>
            {inReviewCount}
          </span>
          <span className="driver-summary-card-sub">Pending verification approval</span>
        </div>
        <div className="driver-summary-card">
          <span className="driver-summary-card-label">Documents Due / Expired</span>
          <span className="driver-summary-card-val" style={{ color: '#b91c1c' }}>
            {docsDueCount}
          </span>
          <span className="driver-summary-card-sub">Missing or expired credentials</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="driver-toolbar">
        <div className="driver-search-wrap">
          <MagnifyingGlass size={18} />
          <input
            type="text"
            className="driver-search-input"
            placeholder="Search drivers by name, email, license number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="driver-select"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          {ONBOARDING_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Error state */}
      {error && (
        <div className="driver-warning-box" role="alert">
          <WarningCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Drivers Table */}
      <div className="driver-table-wrap">
        <table className="driver-table">
          <thead>
            <tr>
              <th>Driver</th>
              <th>Carrier Organization</th>
              <th>License Details</th>
              <th>Medical Expiry</th>
              <th>Background Check</th>
              <th>Onboarding Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && drivers.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)' }}>
                  <ArrowClockwise className="spinning" size={22} />
                  <span style={{ marginLeft: '8px' }}>Loading driver roster...</span>
                </td>
              </tr>
            ) : filteredDrivers.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)' }}>
                  <Truck size={30} style={{ opacity: 0.5, marginBottom: '6px' }} />
                  <div>No driver profiles found matching current filters.</div>
                </td>
              </tr>
            ) : (
              filteredDrivers.map((d) => {
                const driverUser = d.user || d;
                const licExp = calcExpiryStatus(d.license_expiry);
                const medExp = calcExpiryStatus(d.medical_card_expiry);

                return (
                  <tr key={d.id || d.user_id}>
                    <td>
                      <strong style={{ display: 'block', color: 'var(--ink)' }}>
                        {driverUser.name || 'Unnamed Driver'}
                      </strong>
                      <small style={{ color: 'var(--muted)' }}>{driverUser.email}</small>
                      {driverUser.phone && (
                        <small style={{ display: 'block', color: 'var(--muted)' }}>
                          {driverUser.phone}
                        </small>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                        {d.organization?.legal_name || 'Carrier'}
                      </span>
                    </td>
                    <td>
                      <strong style={{ display: 'block', fontSize: '13px' }}>
                        {d.license_number || '—'} {d.license_state ? `(${d.license_state})` : ''}
                      </strong>
                      <small style={{ color: licExp.isExpired ? '#b91c1c' : 'var(--muted)' }}>
                        Exp: {formatDate(d.license_expiry)} ({licExp.label})
                      </small>
                    </td>
                    <td>
                      <span style={{ fontSize: '13px' }}>{formatDate(d.medical_card_expiry)}</span>
                      <small style={{ display: 'block', color: medExp.isExpired ? '#b91c1c' : 'var(--muted)' }}>
                        {medExp.label}
                      </small>
                    </td>
                    <td>
                      <span className={backgroundCheckBadgeClass(d.background_check_status)}>
                        {d.background_check_status || 'pending'}
                      </span>
                    </td>
                    <td>
                      <span className={onboardingBadgeClass(d.onboarding_status)}>
                        {d.onboarding_status || 'pending'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn small outline"
                        onClick={() => setDetailDriverId(d.user_id || d.id)}
                      >
                        <Eye size={14} />
                        <span>View / Onboard</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginTop: '14px' }}>
          <button
            type="button"
            className="icon-btn small"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <CaretLeft size={16} />
          </button>
          <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
            Page {page} of {pagination.totalPages}
          </span>
          <button
            type="button"
            className="icon-btn small"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
          >
            <CaretRight size={16} />
          </button>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateDriverModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchDrivers();
          }}
          notify={notify}
          currentUser={currentUser}
        />
      )}

      {detailDriverId && (
        <DriverDetailModal
          driverId={detailDriverId}
          onClose={() => setDetailDriverId(null)}
          onSuccess={() => {
            fetchDrivers();
          }}
          notify={notify}
          canUpdate={canUpdate}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
