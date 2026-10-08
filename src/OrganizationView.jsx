import React, { useState, useEffect, useCallback } from 'react';
import {
  Buildings,
  CheckCircle,
  WarningCircle,
  NotePencil,
  ShieldCheck,
  ArrowClockwise,
  Info,
  LockKey,
  Key,
  IdentificationCard,
  X,
  Globe,
  FileText,
  UploadSimple,
  DownloadSimple,
  Trash,
  Eye,
  CaretLeft,
  CaretRight,
  Check,
  ClockCounterClockwise,
  Phone,
  EnvelopeSimple,
  MapPin,
  ArrowUpRight,
  ShieldWarning,
  Article,
  ArrowsClockwise
} from '@phosphor-icons/react';
import {
  getOrganization,
  updateOrganization,
  updateOrganizationStatus,
  getOrganizationAuditLog,
  getComplianceStatus,
  getComplianceDocuments,
  uploadComplianceDocument,
  downloadComplianceDocument,
  updateComplianceDocument,
  deleteComplianceDocument,
  getOrganizationSsoConfig,
  updateOrganizationSsoConfig,
  verifyCarrier
} from './api';
import './styles/organization.css';

// ── Helpers ──
function formatDate(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return d;
  }
}

function formatDateTime(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return d;
  }
}

function formatCurrency(val) {
  if (val === null || val === undefined || val === '') return '—';
  const num = Number(val);
  if (isNaN(num)) return val;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(num);
}

function getExpiryInfo(expiryDate) {
  if (!expiryDate) return { status: 'none', label: 'No expiry set', days: null };
  const target = new Date(expiryDate);
  if (isNaN(target.getTime())) return { status: 'none', label: 'Invalid date', days: null };

  const now = new Date();
  const diffTime = target - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      status: 'expired',
      label: `Expired (${Math.abs(diffDays)}d ago)`,
      days: diffDays
    };
  } else if (diffDays <= 30) {
    return {
      status: 'expiring',
      label: `Expires in ${diffDays}d`,
      days: diffDays
    };
  } else {
    return {
      status: 'valid',
      label: `Valid (${diffDays}d left)`,
      days: diffDays
    };
  }
}

function docTypeLabel(type) {
  const map = {
    insurance_certificate: 'Certificate of Insurance (COI)',
    w9: 'Form W-9 (Taxpayer ID)',
    safety_permit: 'Safety & Operating Permit',
    hazmat_cert: 'Hazardous Materials Registration',
    authority_letter: 'Operating Authority Letter (MC/DOT)',
    other: 'Other Regulatory Document'
  };
  return map[type] || (type ? type.replace(/_/g, ' ') : 'General Document');
}

export default function OrganizationView({ hasPermission, notify, currentUser, currentRoleName }) {
  const canRead = hasPermission ? hasPermission('organizations', 'read') : true;
  const canUpdate = hasPermission ? hasPermission('organizations', 'update') : true;

  // Navigation tab: 'profile' | 'compliance' | 'sso' | 'audit'
  const [activeTab, setActiveTab] = useState('profile');

  // Core organization state
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Verification state
  const [verifying, setVerifying] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState(null);

  // Edit Profile modal state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    legal_name: '',
    tax_id: '',
    mc_number: '',
    dot_number: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    country: '',
    postal_code: '',
    company_phone: '',
    company_email: '',
    website: ''
  });
  const [saveLoading, setSaveLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Status Change / Lifecycle Modal state
  const [statusModal, setStatusModal] = useState({
    isOpen: false,
    targetStatus: '',
    title: '',
    confirmText: '',
    reason: '',
    requiresReason: false,
    loading: false,
    error: ''
  });

  // Compliance state
  const [complianceStatus, setComplianceStatus] = useState(null);
  const [complianceDocs, setComplianceDocs] = useState([]);
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  const [complianceError, setComplianceError] = useState('');

  // Upload Doc Modal state
  const [uploadModal, setUploadModal] = useState({
    isOpen: false,
    file: null,
    document_type: 'insurance_certificate',
    expiry_date: '',
    coverage_amount: '',
    notes: '',
    loading: false,
    error: ''
  });

  // Edit Doc Metadata Modal state
  const [editDocModal, setEditDocModal] = useState({
    isOpen: false,
    doc: null,
    expiry_date: '',
    coverage_amount: '',
    verification_status: '',
    notes: '',
    loading: false,
    error: ''
  });

  // Delete Doc Modal state
  const [deleteDocModal, setDeleteDocModal] = useState({
    isOpen: false,
    doc: null,
    loading: false,
    error: ''
  });

  // SSO state
  const [ssoConfig, setSsoConfig] = useState(null);
  const [loadingSso, setLoadingSso] = useState(false);
  const [ssoError, setSsoError] = useState('');
  const [ssoModal, setSsoModal] = useState({
    isOpen: false,
    protocol: 'oidc', // 'oidc' | 'saml'
    domain: '',
    client_id: '',
    client_secret: '',
    discovery_url: '',
    entity_id: '',
    sso_url: '',
    certificate: '',
    enforce_sso: false,
    enabled: true,
    loading: false,
    error: ''
  });

  // Audit Log state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPagination, setAuditPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('all');

  // ── Load Organization Profile ──
  const loadOrgData = useCallback(async (isSilent = false) => {
    if (!canRead) {
      setError('You do not have permission to view organization details.');
      setLoading(false);
      return;
    }

    try {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);
      setError('');

      const res = await getOrganization();
      const orgData = res?.data || res;
      setOrg(orgData);

      setEditForm({
        legal_name: orgData?.legal_name || '',
        tax_id: orgData?.tax_id || '',
        mc_number: orgData?.mc_number || '',
        dot_number: orgData?.dot_number || '',
        address_line1: orgData?.address_line1 || '',
        address_line2: orgData?.address_line2 || '',
        city: orgData?.city || '',
        state: orgData?.state || '',
        country: orgData?.country || 'USA',
        postal_code: orgData?.postal_code || '',
        company_phone: orgData?.company_phone || '',
        company_email: orgData?.company_email || '',
        website: orgData?.website || ''
      });
    } catch (err) {
      setError(err.message || 'Failed to load organization profile.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canRead]);

  // Initial load
  useEffect(() => {
    loadOrgData();
  }, [loadOrgData]);

  // ── Load Compliance Data ──
  const loadComplianceData = useCallback(async () => {
    if (!org?.id) return;
    try {
      setLoadingCompliance(true);
      setComplianceError('');

      const [statusRes, docsRes] = await Promise.allSettled([
        getComplianceStatus(org.id),
        getComplianceDocuments(org.id)
      ]);

      if (statusRes.status === 'fulfilled') {
        setComplianceStatus(statusRes.value?.data || statusRes.value);
      }
      if (docsRes.status === 'fulfilled') {
        const docs = docsRes.value?.data || docsRes.value || [];
        setComplianceDocs(Array.isArray(docs) ? docs : []);
      } else {
        setComplianceError(docsRes.reason?.message || 'Failed to load compliance documents');
      }
    } catch (err) {
      setComplianceError(err.message || 'Failed to load compliance data');
    } finally {
      setLoadingCompliance(false);
    }
  }, [org?.id]);

  // ── Load SSO Configuration ──
  const loadSsoData = useCallback(async () => {
    if (!org?.id) return;
    try {
      setLoadingSso(true);
      setSsoError('');
      const res = await getOrganizationSsoConfig(org.id);
      setSsoConfig(res?.data || res);
    } catch (err) {
      if (err.status === 403 || err.status === 404) {
        setSsoConfig({ not_supported: true, message: err.message });
      } else {
        setSsoError(err.message || 'Failed to load SSO configuration');
      }
    } finally {
      setLoadingSso(false);
    }
  }, [org?.id]);

  // ── Load Audit Log ──
  const loadAuditData = useCallback(async (page = 1) => {
    if (!org?.id) return;
    try {
      setLoadingAudit(true);
      setAuditError('');
      const res = await getOrganizationAuditLog({
        page,
        limit: auditPagination.limit,
        organizationId: org.id
      });
      const data = res?.data || res;
      const logs = Array.isArray(data?.logs) ? data.logs : (Array.isArray(data) ? data : []);
      setAuditLogs(logs);
      setAuditPagination(prev => ({
        ...prev,
        page: data?.page || page,
        total: data?.total || logs.length,
        totalPages: data?.totalPages || Math.ceil((data?.total || logs.length) / prev.limit) || 1
      }));
    } catch (err) {
      setAuditError(err.message || 'Failed to load audit logs.');
    } finally {
      setLoadingAudit(false);
    }
  }, [org?.id, auditPagination.limit]);

  // Trigger tab data fetch on tab switch
  useEffect(() => {
    if (activeTab === 'compliance' && org?.id) {
      loadComplianceData();
    } else if (activeTab === 'sso' && org?.id) {
      loadSsoData();
    } else if (activeTab === 'audit' && org?.id) {
      loadAuditData(1);
    }
  }, [activeTab, org?.id, loadComplianceData, loadSsoData, loadAuditData]);

  // ── Profile Updates ──
  async function handleUpdateProfile(e) {
    e.preventDefault();
    if (!canUpdate) {
      setEditError('You do not have permission to update organization profile.');
      return;
    }

    try {
      setSaveLoading(true);
      setEditError('');

      const res = await updateOrganization(editForm, org.id);
      const updated = res?.data || res;
      setOrg(prev => ({ ...prev, ...updated }));
      setIsEditing(false);
      if (notify) notify('Organization profile updated successfully.');
    } catch (err) {
      setEditError(err.message || 'Failed to update organization profile.');
    } finally {
      setSaveLoading(false);
    }
  }

  // ── Lifecycle Transitions ──
  function openStatusModal(targetStatus, title, confirmText, requiresReason = false) {
    setStatusModal({
      isOpen: true,
      targetStatus,
      title,
      confirmText,
      reason: '',
      requiresReason,
      loading: false,
      error: ''
    });
  }

  async function handleStatusChangeConfirm() {
    if (statusModal.requiresReason && !statusModal.reason.trim()) {
      setStatusModal(prev => ({ ...prev, error: 'A justification reason is required for this action.' }));
      return;
    }

    try {
      setStatusModal(prev => ({ ...prev, loading: true, error: '' }));
      const res = await updateOrganizationStatus(statusModal.targetStatus, statusModal.reason.trim(), org.id);
      const updated = res?.data || res;
      setOrg(prev => ({ ...prev, status: statusModal.targetStatus, ...(updated || {}) }));
      setStatusModal(prev => ({ ...prev, isOpen: false }));
      if (notify) notify(`Organization status changed to ${statusModal.targetStatus}.`);
    } catch (err) {
      setStatusModal(prev => ({ ...prev, error: err.message || 'Failed to update organization status.' }));
    } finally {
      setStatusModal(prev => ({ ...prev, loading: false }));
    }
  }

  // ── Carrier Verification ──
  async function handleVerifyCarrier() {
    if (!org?.id) return;
    try {
      setVerifying(true);
      setVerifyNotice(null);
      const res = await verifyCarrier(org.id, {
        mc_number: org.mc_number,
        dot_number: org.dot_number
      });
      setVerifyNotice({
        type: 'success',
        text: res?.message || 'FMCSA SAFER carrier verification check passed successfully.'
      });
      if (res?.data?.safety_rating) {
        setOrg(prev => ({ ...prev, safety_rating: res.data.safety_rating }));
      }
      if (notify) notify('Carrier verification completed.');
    } catch (err) {
      setVerifyNotice({
        type: 'warn',
        text: err.message || 'FMCSA SAFER verification returned an exception or non-verified status.'
      });
    } finally {
      setVerifying(false);
    }
  }

  // ── Document Upload ──
  async function handleUploadDocSubmit(e) {
    e.preventDefault();
    if (!uploadModal.file) {
      setUploadModal(prev => ({ ...prev, error: 'Please choose a document file to upload.' }));
      return;
    }

    try {
      setUploadModal(prev => ({ ...prev, loading: true, error: '' }));
      const fd = new FormData();
      fd.append('file', uploadModal.file);
      fd.append('document_type', uploadModal.document_type);
      if (uploadModal.expiry_date) {
        fd.append('expiry_date', uploadModal.expiry_date);
      }
      if (uploadModal.coverage_amount) {
        fd.append('coverage_amount', uploadModal.coverage_amount);
      }
      if (uploadModal.notes) {
        fd.append('notes', uploadModal.notes);
      }

      await uploadComplianceDocument(org.id, fd);
      setUploadModal(prev => ({ ...prev, isOpen: false, file: null, notes: '' }));
      if (notify) notify('Compliance document uploaded successfully.');
      loadComplianceData();
    } catch (err) {
      setUploadModal(prev => ({ ...prev, error: err.message || 'Failed to upload document.' }));
    } finally {
      setUploadModal(prev => ({ ...prev, loading: false }));
    }
  }

  // ── Document Download ──
  async function handleDownloadDoc(doc) {
    try {
      if (notify) notify(`Downloading ${doc.original_filename || doc.document_type}...`);
      const blob = await downloadComplianceDocument(org.id, doc.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.original_filename || doc.file_name || `compliance-${doc.document_type}-${doc.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    } catch (err) {
      if (notify) notify(`Download failed: ${err.message}`);
    }
  }

  // ── Document Metadata Edit ──
  async function handleEditDocSubmit(e) {
    e.preventDefault();
    if (!editDocModal.doc) return;
    try {
      setEditDocModal(prev => ({ ...prev, loading: true, error: '' }));
      const payload = {};
      if (editDocModal.expiry_date) payload.expiry_date = editDocModal.expiry_date;
      if (editDocModal.coverage_amount) payload.coverage_amount = Number(editDocModal.coverage_amount);
      if (editDocModal.verification_status) payload.verification_status = editDocModal.verification_status;
      if (editDocModal.notes !== undefined) payload.notes = editDocModal.notes;

      await updateComplianceDocument(org.id, editDocModal.doc.id, payload);
      setEditDocModal(prev => ({ ...prev, isOpen: false }));
      if (notify) notify('Document metadata updated successfully.');
      loadComplianceData();
    } catch (err) {
      setEditDocModal(prev => ({ ...prev, error: err.message || 'Failed to update document metadata.' }));
    } finally {
      setEditDocModal(prev => ({ ...prev, loading: false }));
    }
  }

  // ── Document Delete ──
  async function handleDeleteDocConfirm() {
    if (!deleteDocModal.doc) return;
    try {
      setDeleteDocModal(prev => ({ ...prev, loading: true, error: '' }));
      await deleteComplianceDocument(org.id, deleteDocModal.doc.id);
      setDeleteDocModal(prev => ({ ...prev, isOpen: false }));
      if (notify) notify('Document deleted successfully.');
      loadComplianceData();
    } catch (err) {
      setDeleteDocModal(prev => ({ ...prev, error: err.message || 'Failed to delete document.' }));
    } finally {
      setDeleteDocModal(prev => ({ ...prev, loading: false }));
    }
  }

  // ── SSO Configuration Save ──
  function openSsoModal() {
    setSsoModal({
      isOpen: true,
      protocol: ssoConfig?.provider === 'saml' ? 'saml' : 'oidc',
      domain: ssoConfig?.domain || '',
      client_id: ssoConfig?.client_id || '',
      client_secret: '',
      discovery_url: ssoConfig?.discovery_url || '',
      entity_id: ssoConfig?.entity_id || '',
      sso_url: ssoConfig?.sso_url || '',
      certificate: ssoConfig?.certificate || '',
      enforce_sso: Boolean(ssoConfig?.enforce_sso),
      enabled: ssoConfig?.enabled !== false,
      loading: false,
      error: ''
    });
  }

  async function handleSsoSubmit(e) {
    e.preventDefault();
    try {
      setSsoModal(prev => ({ ...prev, loading: true, error: '' }));
      const payload = {
        provider: ssoModal.protocol,
        domain: ssoModal.domain.trim(),
        enforce_sso: ssoModal.enforce_sso,
        enabled: ssoModal.enabled
      };

      if (ssoModal.protocol === 'oidc') {
        payload.client_id = ssoModal.client_id.trim();
        if (ssoModal.discovery_url) payload.discovery_url = ssoModal.discovery_url.trim();
        if (ssoModal.client_secret && !ssoModal.client_secret.startsWith('*')) {
          payload.client_secret = ssoModal.client_secret;
        }
      } else {
        payload.entity_id = ssoModal.entity_id.trim();
        payload.sso_url = ssoModal.sso_url.trim();
        if (ssoModal.certificate) payload.certificate = ssoModal.certificate.trim();
      }

      const res = await updateOrganizationSsoConfig(payload, org.id);
      setSsoConfig(res?.data || res);
      setSsoModal(prev => ({ ...prev, isOpen: false }));
      if (notify) notify('SSO identity provider configuration updated.');
    } catch (err) {
      setSsoModal(prev => ({ ...prev, error: err.message || 'Failed to update SSO configuration.' }));
    } finally {
      setSsoModal(prev => ({ ...prev, loading: false }));
    }
  }

  // ── Render Loading & Error States ──
  if (loading) {
    return (
      <div className="org-master-container organization-page">
        <div className="org-loading-state">
          <ArrowClockwise className="spinning" size={22} />
          <span>Loading organization profile & compliance master...</span>
        </div>
      </div>
    );
  }

  if (error && !org) {
    return (
      <div className="org-master-container organization-page">
        <div className="notice-banner error">
          <WarningCircle size={22} />
          <div>
            <strong>Access Restricted</strong>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const status = (org?.status || 'active').toLowerCase();
  const isPending = status === 'pending';
  const isActive = status === 'active';
  const isSuspended = status === 'suspended';
  const isTerminated = status === 'terminated';

  const isShipper = org?.type === 'shipper';
  const isCarrier = org?.type === 'carrier';
  const isEnterprise = Boolean(org?.is_enterprise || org?.enterprise_tier);

  return (
    <div className="org-master-container organization-page">
      {/* ── Page Header ── */}
      <div className="org-page-header organization-header">
        <div className="org-page-header-left">
          <h1>Organization</h1>
          <p>Manage your company profile, physical address, regulatory compliance, documents, and account status.</p>
        </div>
        <div className="org-page-header-actions organization-actions">
          <button
            type="button"
            className="btn"
            title="Refresh organization data"
            onClick={() => loadOrgData(true)}
            disabled={refreshing}
          >
            <ArrowsClockwise size={16} className={refreshing ? 'spinning' : ''} />
            <span>Refresh</span>
          </button>

          {canUpdate && !isTerminated && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEditError('');
                setIsEditing(true);
              }}
            >
              <NotePencil size={17} />
              <span>Edit Organization</span>
            </button>
          )}

          {isCarrier && (
            <button
              type="button"
              className="btn primary"
              onClick={handleVerifyCarrier}
              disabled={verifying}
            >
              <ShieldCheck size={18} />
              <span>{verifying ? 'Checking FMCSA...' : 'Verify Carrier'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Top Hero Identity Card ── */}
      <section className="org-hero-card organization-card">
        <div className="org-hero-top">
          <div className="org-hero-identity">
            <div className="org-avatar-badge">
              <Buildings size={30} />
            </div>
            <div className="org-identity-text">
              <h2>{org?.legal_name || 'Organization Profile'}</h2>
              <div className="org-tags-row">
                <span className="org-type-label">
                  Entity Type: <strong style={{ textTransform: 'capitalize' }}>{org?.type || 'Standard'}</strong>
                </span>
                <span>•</span>
                <span className={`org-badge org-badge-${status}`}>
                  <span className="org-status-dot" />
                  {org?.status || 'Active'}
                </span>
                {isEnterprise && (
                  <span className="org-enterprise-pill">
                    ENTERPRISE TIER
                  </span>
                )}
                {org?.operating_status && (
                  <span className="org-sub-pill">
                    Authority: {org.operating_status}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Carrier Verification Notice */}
        {verifyNotice && (
          <div className={`notice-banner ${verifyNotice.type === 'success' ? 'info' : 'warn'}`}>
            {verifyNotice.type === 'success' ? <CheckCircle size={20} /> : <WarningCircle size={20} />}
            <div>
              <strong>FMCSA SAFER Verification: </strong>
              <span>{verifyNotice.text}</span>
            </div>
          </div>
        )}

        {/* Hero Quick Stats */}
        <div className="org-hero-stats-grid org-stats-grid">
          <div className="org-stat-cell">
            <span className="org-stat-label">Tax ID / EIN</span>
            <span className="org-stat-value">{org?.tax_id || '—'}</span>
          </div>
          <div className="org-stat-cell">
            <span className="org-stat-label">USDOT Number</span>
            <span className="org-stat-value">{org?.dot_number || '—'}</span>
          </div>
          <div className="org-stat-cell">
            <span className="org-stat-label">MC Number</span>
            <span className="org-stat-value">{org?.mc_number || '—'}</span>
          </div>
          <div className="org-stat-cell">
            <span className="org-stat-label">Phone</span>
            <span className="org-stat-value">{org?.company_phone || '—'}</span>
          </div>
          <div className="org-stat-cell">
            <span className="org-stat-label">Email</span>
            <span className="org-stat-value">{org?.company_email || '—'}</span>
          </div>
        </div>
      </section>

      {/* ── Tabs Bar ── */}
      <nav className="org-tabs-bar organization-tabs" role="tablist" aria-label="Organization views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'profile'}
          className={`org-tab-btn organization-tab ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <IdentificationCard size={18} />
          <span>Company & Contact</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'compliance'}
          className={`org-tab-btn organization-tab ${activeTab === 'compliance' ? 'active' : ''}`}
          onClick={() => setActiveTab('compliance')}
        >
          <ShieldCheck size={18} />
          <span>Compliance & Documents</span>
          {complianceDocs.length > 0 && (
            <span className="org-tab-count">{complianceDocs.length}</span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'sso'}
          className={`org-tab-btn organization-tab ${activeTab === 'sso' ? 'active' : ''}`}
          onClick={() => setActiveTab('sso')}
        >
          <Key size={18} />
          <span>Single Sign-On (SSO)</span>
          {ssoConfig?.enabled && (
            <span className="org-tab-count sso-active-count">Active</span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'audit'}
          className={`org-tab-btn organization-tab ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <ClockCounterClockwise size={18} />
          <span>Activity & Audit Log</span>
        </button>
      </nav>

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 1: COMPANY INFORMATION & CONTACT / ADDRESS & STATUS
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'profile' && (
        <div className="org-tab-pane">
          {/* Company Information Card */}
          <div className="org-card-section organization-section">
            <div className="org-card-header">
              <div className="org-card-title-group">
                <Article size={20} color="#005fdc" />
                <h3>Company Information</h3>
              </div>
            </div>
            <p className="org-card-desc">
              Official legal registration identifiers and carrier regulatory credentials.
            </p>

            <div className="org-info-grid organization-grid">
              <div className="org-field-item organization-field">
                <span className="org-field-label">Legal Name</span>
                <span className="org-field-val">{org?.legal_name || '—'}</span>
              </div>
              <div className="org-field-item organization-field">
                <span className="org-field-label">Organization Type</span>
                <span className="org-field-val" style={{ textTransform: 'capitalize' }}>
                  {org?.type || 'Standard'}
                </span>
              </div>
              <div className="org-field-item organization-field">
                <span className="org-field-label">Tax ID / EIN</span>
                <span className="org-field-val">{org?.tax_id || '—'}</span>
              </div>
              <div className="org-field-item organization-field">
                <span className="org-field-label">USDOT Number</span>
                <span className="org-field-val">{org?.dot_number || '—'}</span>
              </div>
              <div className="org-field-item organization-field">
                <span className="org-field-label">MC / Carrier Number</span>
                <span className="org-field-val">{org?.mc_number || '—'}</span>
              </div>
              <div className="org-field-item organization-field">
                <span className="org-field-label">Safety Rating</span>
                <span className="org-field-val">
                  {org?.safety_rating ? (
                    <span className="org-badge org-badge-valid">{org.safety_rating}</span>
                  ) : 'Not Rated'}
                </span>
              </div>
              <div className="org-field-item organization-field">
                <span className="org-field-label">Operating Authority</span>
                <span className="org-field-val">{org?.operating_status || 'Authorized'}</span>
              </div>
              <div className="org-field-item organization-field">
                <span className="org-field-label">Organization ID</span>
                <span className="org-field-val org-mono-val">
                  {org?.id || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Headquarters Address Card */}
          <div className="org-card-section organization-section">
            <div className="org-card-header">
              <div className="org-card-title-group">
                <MapPin size={20} color="#005fdc" />
                <h3>Headquarters Address</h3>
              </div>
            </div>
            <p className="org-card-desc">
              Primary registered physical office address for billing, operations, and dispatch.
            </p>

            <div className="org-info-grid organization-grid">
              <div className="org-field-item organization-field">
                <span className="org-field-label">Address Line 1</span>
                <span className="org-field-val">{org?.address_line1 || '—'}</span>
              </div>
              <div className="org-field-item organization-field">
                <span className="org-field-label">Address Line 2</span>
                <span className="org-field-val">{org?.address_line2 || '—'}</span>
              </div>
              <div className="org-field-item organization-field">
                <span className="org-field-label">City</span>
                <span className="org-field-val">{org?.city || '—'}</span>
              </div>
              <div className="org-field-item organization-field">
                <span className="org-field-label">State / Province</span>
                <span className="org-field-val">{org?.state || '—'}</span>
              </div>
              <div className="org-field-item organization-field">
                <span className="org-field-label">Postal / ZIP Code</span>
                <span className="org-field-val">{org?.postal_code || '—'}</span>
              </div>
              <div className="org-field-item organization-field">
                <span className="org-field-label">Country</span>
                <span className="org-field-val">{org?.country || 'USA'}</span>
              </div>
            </div>
          </div>

          {/* Contact Information Card */}
          <div className="org-card-section organization-section">
            <div className="org-card-header">
              <div className="org-card-title-group">
                <Phone size={20} color="#005fdc" />
                <h3>Contact Information</h3>
              </div>
            </div>
            <p className="org-card-desc">
              Corporate phone, email communication, and official web address.
            </p>

            <div className="org-info-grid organization-grid">
              <div className="org-field-item organization-field">
                <span className="org-field-label">Company Phone</span>
                <span className="org-field-val">
                  {org?.company_phone ? (
                    <a href={`tel:${org.company_phone}`}>{org.company_phone}</a>
                  ) : '—'}
                </span>
              </div>
              <div className="org-field-item organization-field">
                <span className="org-field-label">Company Email</span>
                <span className="org-field-val">
                  {org?.company_email ? (
                    <a href={`mailto:${org.company_email}`}>{org.company_email}</a>
                  ) : '—'}
                </span>
              </div>
              <div className="org-field-item organization-field">
                <span className="org-field-label">Corporate Website</span>
                <span className="org-field-val">
                  {org?.website ? (
                    <a href={org.website.startsWith('http') ? org.website : `https://${org.website}`} target="_blank" rel="noopener noreferrer">
                      <Globe size={15} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                      <span>{org.website}</span>
                      <ArrowUpRight size={13} style={{ verticalAlign: 'middle', marginLeft: '3px' }} />
                    </a>
                  ) : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Status & Account Information Card */}
          <div className="org-card-section organization-section">
            <div className="org-card-header">
              <div className="org-card-title-group">
                <ShieldWarning size={20} color="#005fdc" />
                <h3>Status & Account Information</h3>
              </div>
            </div>
            <p className="org-card-desc">
              Current organization lifecycle status and operational access controls.
            </p>

            <div className="org-lifecycle-box organization-status">
              <div className="org-lifecycle-desc">
                <strong>Current Status: {org?.status?.toUpperCase() || 'ACTIVE'}</strong>
                <p>
                  {isActive && 'Organization is fully active and authorized for transactions, dispatching, and invoicing.'}
                  {isPending && 'Organization registration is pending administrative review and onboarding verification.'}
                  {isSuspended && 'Organization operations are temporarily halted. No new shipments or orders can be processed.'}
                  {isTerminated && 'Organization has been permanently terminated. All user accounts are deactivated.'}
                </p>
              </div>

              {canUpdate && (
                <div className="org-lifecycle-actions organization-actions">
                  {/* Pending -> Active */}
                  {isPending && (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => openStatusModal('active', 'Activate Organization', 'Confirm Activation', false)}
                    >
                      <CheckCircle size={17} />
                      <span>Activate Organization</span>
                    </button>
                  )}

                  {/* Active -> Suspended */}
                  {isActive && (
                    <button
                      type="button"
                      className="btn outline"
                      style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
                      onClick={() => openStatusModal('suspended', 'Suspend Organization', 'Suspend Account', true)}
                    >
                      <WarningCircle size={17} />
                      <span>Suspend Operations</span>
                    </button>
                  )}

                  {/* Suspended -> Active */}
                  {isSuspended && (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => openStatusModal('active', 'Reactivate Organization', 'Reactivate Account', false)}
                    >
                      <CheckCircle size={17} />
                      <span>Reactivate Organization</span>
                    </button>
                  )}

                  {/* Active or Suspended -> Terminated */}
                  {(isActive || isSuspended) && (
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => openStatusModal('terminated', 'Permanently Terminate Organization', 'Terminate Account', true)}
                    >
                      <Trash size={17} />
                      <span>Terminate</span>
                    </button>
                  )}

                  {isTerminated && (
                    <span className="org-badge org-badge-terminated">
                      Permanent Terminal State
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 2: COMPLIANCE DOCUMENTS
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'compliance' && (
        <div className="org-tab-pane">
          {/* Compliance Status Overview Banner */}
          <div className={`org-compliance-banner organization-compliance ${complianceStatus?.status || (complianceDocs.length ? 'compliant' : 'action_required')}`}>
            <div className="org-compliance-banner-left">
              <ShieldCheck size={28} />
              <div>
                <strong>
                  Compliance Status: {complianceStatus?.status ? complianceStatus.status.toUpperCase().replace(/_/g, ' ') : 'VERIFIED COMPLIANT'}
                </strong>
                <p>
                  Regulatory documentation, active insurance coverage limits, and operating certifications.
                </p>
              </div>
            </div>

            <div className="org-compliance-pills">
              <span className="org-sub-pill">
                <strong>{complianceDocs.length}</strong> Total Documents
              </span>
              {complianceStatus?.valid_count !== undefined && (
                <span className="org-sub-pill" style={{ color: '#127d55' }}>
                  <strong>{complianceStatus.valid_count}</strong> Valid
                </span>
              )}
              {complianceStatus?.expiring_soon_count !== undefined && (
                <span className="org-sub-pill" style={{ color: '#9b6100' }}>
                  <strong>{complianceStatus.expiring_soon_count}</strong> Expiring Soon
                </span>
              )}
              {complianceStatus?.expired_count !== undefined && (
                <span className="org-sub-pill" style={{ color: '#c92a2a' }}>
                  <strong>{complianceStatus.expired_count}</strong> Expired
                </span>
              )}
            </div>
          </div>

          {/* Documents Table Section */}
          <div className="org-card-section organization-section">
            <div className="org-card-header">
              <div className="org-card-title-group">
                <FileText size={20} color="#005fdc" />
                <h3>Documents & Regulatory Filings</h3>
              </div>

              {canUpdate && !isTerminated && (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => setUploadModal({
                    isOpen: true,
                    file: null,
                    document_type: 'insurance_certificate',
                    expiry_date: '',
                    coverage_amount: '',
                    notes: '',
                    loading: false,
                    error: ''
                  })}
                >
                  <UploadSimple size={17} />
                  <span>Upload Document</span>
                </button>
              )}
            </div>

            {loadingCompliance ? (
              <div className="org-loading-state">
                <ArrowClockwise className="spinning" size={20} />
                <span>Loading compliance records...</span>
              </div>
            ) : complianceError ? (
              <div className="notice-banner error">
                <WarningCircle size={18} />
                <span>{complianceError}</span>
              </div>
            ) : complianceDocs.length === 0 ? (
              <div className="empty" style={{ padding: '36px 20px' }}>
                <FileText size={32} color="#8a9eb5" />
                <h4 style={{ margin: '8px 0 4px', color: 'var(--ink)' }}>No Compliance Documents On File</h4>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
                  Upload active certificates of insurance (COI), W-9, or hazardous material permits to maintain good standing.
                </p>
              </div>
            ) : (
              <div className="org-table-wrap">
                <table className="org-table organization-table">
                  <thead>
                    <tr>
                      <th>Document Type</th>
                      <th>Filename / Reference</th>
                      <th>Coverage Amount</th>
                      <th>Expiry Date</th>
                      <th>Verification</th>
                      <th>Uploaded On</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complianceDocs.map((doc) => {
                      const expiry = getExpiryInfo(doc.expiry_date);
                      return (
                        <tr key={doc.id}>
                          <td>
                            <strong style={{ display: 'block', fontSize: '13.5px' }}>
                              {docTypeLabel(doc.document_type)}
                            </strong>
                            {doc.notes && (
                              <small style={{ color: 'var(--muted)', fontSize: '11.5px' }}>{doc.notes}</small>
                            )}
                          </td>
                          <td>
                            <span className="org-mono-val">
                              {doc.original_filename || doc.file_name || doc.file_reference || `doc-${doc.id.slice(0, 8)}`}
                            </span>
                          </td>
                          <td>
                            {doc.coverage_amount ? (
                              <strong style={{ color: '#10203c' }}>{formatCurrency(doc.coverage_amount)}</strong>
                            ) : (
                              <span style={{ color: 'var(--muted)' }}>—</span>
                            )}
                          </td>
                          <td>
                            {doc.expiry_date ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span>{formatDate(doc.expiry_date)}</span>
                                <span className={`org-badge org-badge-${expiry.status}`} style={{ width: 'fit-content', fontSize: '10.5px' }}>
                                  {expiry.label}
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--muted)' }}>No Expiry</span>
                            )}
                          </td>
                          <td>
                            <span className={`org-badge org-badge-${doc.verification_status === 'verified' ? 'valid' : doc.verification_status === 'rejected' ? 'rejected' : 'pending'}`}>
                              {doc.verification_status || 'Pending'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                              {formatDate(doc.created_at || doc.upload_date)}
                            </span>
                          </td>
                          <td>
                            <div className="org-table-actions">
                              <button
                                type="button"
                                className="org-icon-btn"
                                title="Download / View document"
                                onClick={() => handleDownloadDoc(doc)}
                              >
                                <DownloadSimple size={16} />
                              </button>

                              {canUpdate && (
                                <button
                                  type="button"
                                  className="org-icon-btn"
                                  title="Edit document metadata"
                                  onClick={() => setEditDocModal({
                                    isOpen: true,
                                    doc,
                                    expiry_date: doc.expiry_date ? doc.expiry_date.split('T')[0] : '',
                                    coverage_amount: doc.coverage_amount || '',
                                    verification_status: doc.verification_status || 'verified',
                                    notes: doc.notes || '',
                                    loading: false,
                                    error: ''
                                  })}
                                >
                                  <NotePencil size={16} />
                                </button>
                              )}

                              {canUpdate && (
                                <button
                                  type="button"
                                  className="org-icon-btn danger"
                                  title="Delete document"
                                  onClick={() => setDeleteDocModal({
                                    isOpen: true,
                                    doc,
                                    loading: false,
                                    error: ''
                                  })}
                                >
                                  <Trash size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 3: ENTERPRISE SSO
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'sso' && (
        <div className="org-tab-pane">
          {/* Informational banner if account is not enterprise shipper */}
          {(!isShipper || !isEnterprise) && (
            <div className="notice" style={{ background: '#f4f8fe', border: '1px solid #d2e4f9', borderRadius: '10px', padding: '16px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <Info size={24} color="#005fdc" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ fontSize: '15px', color: '#10203c' }}>Enterprise Identity Federation</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '13.5px', color: '#4a5b73', lineHeight: '1.5' }}>
                  Centralized SAML 2.0 and OpenID Connect (OIDC) Single Sign-On is standard for Enterprise Shipper subscriptions.
                  If your organization requires dedicated identity provider integration with Okta, Microsoft Entra ID (Azure AD), or Ping Identity, contact Harbor Enterprise Operations.
                </p>
              </div>
            </div>
          )}

          {/* SSO Configuration Card */}
          <div className="org-card-section organization-section">
            <div className="org-card-header">
              <div className="org-card-title-group">
                <Key size={20} color="#005fdc" />
                <h3>Single Sign-On (SSO) Integration</h3>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className={`org-badge ${ssoConfig?.enabled ? 'org-badge-valid' : 'org-badge-gray'}`}>
                  {ssoConfig?.enabled ? 'Active & Configured' : 'Inactive'}
                </span>

                {canUpdate && !isTerminated && (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={openSsoModal}
                  >
                    <Key size={17} />
                    <span>{ssoConfig?.enabled ? 'Configure SSO' : 'Set Up SSO'}</span>
                  </button>
                )}
              </div>
            </div>

            <p className="org-card-desc">
              Centralized authentication across corporate directories using OIDC or SAML 2.0 protocol standards.
            </p>

            {loadingSso ? (
              <div className="org-loading-state">
                <ArrowClockwise className="spinning" size={20} />
                <span>Loading identity provider parameters...</span>
              </div>
            ) : ssoError ? (
              <div className="notice-banner error">
                <WarningCircle size={18} />
                <span>{ssoError}</span>
              </div>
            ) : (
              <div className="org-sso-box">
                <div className="org-stat-cell">
                  <span className="org-stat-label">Identity Federation Protocol</span>
                  <span className="org-stat-value">
                    {ssoConfig?.provider ? ssoConfig.provider.toUpperCase() : 'OpenID Connect (OIDC)'}
                  </span>
                </div>

                <div className="org-stat-cell">
                  <span className="org-stat-label">Enforcement Mode</span>
                  <span className="org-stat-value">
                    {ssoConfig?.enforce_sso ? (
                      <span className="org-badge org-badge-valid">Enforced (SSO Only)</span>
                    ) : (
                      <span className="org-badge org-badge-gray">Hybrid (SSO or Password)</span>
                    )}
                  </span>
                </div>

                <div className="org-stat-cell">
                  <span className="org-stat-label">Corporate Email Domain</span>
                  <span className="org-stat-value org-mono-val">
                    {ssoConfig?.domain || org?.website?.replace(/^(https?:\/\/)?(www\.)?/, '') || 'harbor.test'}
                  </span>
                </div>

                <div className="org-stat-cell">
                  <span className="org-stat-label">Client ID / Entity ID</span>
                  <span className="org-stat-value org-mono-val">
                    {ssoConfig?.client_id || ssoConfig?.entity_id || '—'}
                  </span>
                </div>

                <div className="org-stat-cell">
                  <span className="org-stat-label">Client Secret / Certificate</span>
                  <span className="org-stat-value">
                    <span className="org-secret-mask">••••••••••••••••</span>
                  </span>
                </div>

                <div className="org-stat-cell org-form-full-width">
                  <span className="org-stat-label">Discovery URL / SSO Endpoint</span>
                  <span className="org-stat-value org-mono-val">
                    {ssoConfig?.discovery_url || ssoConfig?.sso_url || '—'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 4: AUDIT LOG
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'audit' && (
        <div className="org-tab-pane">
          <div className="org-card-section organization-section">
            <div className="org-card-header">
              <div className="org-card-title-group">
                <ClockCounterClockwise size={20} color="#005fdc" />
                <h3>Organization Governance Audit Trail</h3>
              </div>

              <button
                type="button"
                className="btn"
                onClick={() => loadAuditData(auditPagination.page)}
                disabled={loadingAudit}
              >
                <ArrowClockwise size={16} className={loadingAudit ? 'spinning' : ''} />
                <span>Refresh Log</span>
              </button>
            </div>
            <p className="org-card-desc">
              Immutable ledger tracking profile modifications, lifecycle events, compliance filing changes, and SSO updates.
            </p>

            {loadingAudit ? (
              <div className="org-loading-state">
                <ArrowClockwise className="spinning" size={20} />
                <span>Loading audit records...</span>
              </div>
            ) : auditError ? (
              <div className="notice-banner error">
                <WarningCircle size={18} />
                <span>{auditError}</span>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="empty" style={{ padding: '36px 20px' }}>
                <ClockCounterClockwise size={32} color="#8a9eb5" />
                <h4 style={{ margin: '8px 0 4px', color: 'var(--ink)' }}>No Audit Events Recorded</h4>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
                  All administrative modifications to this organization entity will be recorded here automatically.
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label htmlFor="org-audit-filter" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                      Audit Filter:
                    </label>
                    <select
                      id="org-audit-filter"
                      className="org-select"
                      style={{ minWidth: '220px', padding: '6px 10px', fontSize: '13px' }}
                      value={auditActionFilter}
                      onChange={(e) => setAuditActionFilter(e.target.value)}
                    >
                      <option value="all">All Events ({auditLogs.length})</option>
                      <option value="login">Login & Auth Attempts</option>
                      <option value="role">Role & Permission Changes</option>
                      <option value="user">User Status Changes</option>
                      <option value="org">Organization Status & Context</option>
                      <option value="carrier">Carrier Verification</option>
                      <option value="driver">Driver Onboarding</option>
                    </select>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    Showing {
                      auditLogs.filter(log => {
                        if (auditActionFilter === 'all') return true;
                        const act = (log.action || '').toUpperCase();
                        if (auditActionFilter === 'login') return act.includes('LOGIN') || act.includes('MFA') || act.includes('SSO');
                        if (auditActionFilter === 'role') return act.includes('ROLE') || act.includes('PERMISSION');
                        if (auditActionFilter === 'user') return act.includes('USER_');
                        if (auditActionFilter === 'org') return act.includes('ORGANIZATION');
                        if (auditActionFilter === 'carrier') return act.includes('CARRIER') || act.includes('COMPLIANCE');
                        if (auditActionFilter === 'driver') return act.includes('DRIVER');
                        return true;
                      }).length
                    } of {auditLogs.length} events
                  </span>
                </div>

                <div className="org-table-wrap">
                  <table className="org-table organization-table organization-audit">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Action</th>
                        <th>Actor</th>
                        <th>Target Entity</th>
                        <th>Changes / Diffs</th>
                        <th>Reason / Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs
                        .filter(log => {
                          if (auditActionFilter === 'all') return true;
                          const act = (log.action || '').toUpperCase();
                          if (auditActionFilter === 'login') return act.includes('LOGIN') || act.includes('MFA') || act.includes('SSO');
                          if (auditActionFilter === 'role') return act.includes('ROLE') || act.includes('PERMISSION');
                          if (auditActionFilter === 'user') return act.includes('USER_');
                          if (auditActionFilter === 'org') return act.includes('ORGANIZATION');
                          if (auditActionFilter === 'carrier') return act.includes('CARRIER') || act.includes('COMPLIANCE');
                          if (auditActionFilter === 'driver') return act.includes('DRIVER');
                          return true;
                        })
                        .map((log, idx) => {
                        let changes = log.changes || log.diff || null;
                        if (!changes && (log.old_value || log.new_value)) {
                          const oldVal = log.old_value && typeof log.old_value === 'object' ? log.old_value : {};
                          const newVal = log.new_value && typeof log.new_value === 'object' ? log.new_value : {};
                          const allKeys = Array.from(new Set([...Object.keys(oldVal), ...Object.keys(newVal)]));
                          if (allKeys.length > 0) {
                            changes = {};
                            for (const k of allKeys) {
                              if (oldVal[k] !== newVal[k]) {
                                changes[k] = { old: oldVal[k], new: newVal[k] };
                              }
                            }
                          }
                        }
                        const actorName = log.actor?.name || log.actor_name || log.user?.name || log.actor_email || 'System';
                        const actionStr = log.action || log.event || 'UPDATE';
                        const actionBadgeClass =
                          /FAILED|DEACTIVATED|SUSPENDED|TERMINATED/i.test(actionStr) ? 'org-badge org-badge-danger' :
                          /SUCCESS|APPROVED|VERIFIED|ACTIVATED/i.test(actionStr) ? 'org-badge org-badge-success' :
                          /DRIVER|ROLE|ORGANIZATION/i.test(actionStr) ? 'org-badge org-badge-primary' :
                          'org-badge org-badge-gray';
                        return (
                          <tr key={log.id || idx}>
                            <td style={{ whiteSpace: 'nowrap', fontSize: '12.5px', color: 'var(--muted)' }}>
                              {formatDateTime(log.created_at || log.timestamp)}
                            </td>
                            <td>
                              <span className={actionBadgeClass} style={{ fontWeight: 600, fontSize: '11px' }}>
                                {actionStr}
                              </span>
                            </td>
                            <td>
                              <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>{actorName}</strong>
                              {log.actor?.email && (
                                <small style={{ color: 'var(--muted)', fontSize: '11px' }}>{log.actor.email}</small>
                              )}
                            </td>
                            <td>
                              <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
                                {log.target_type || log.entity_type || 'organization'}
                              </span>
                            </td>
                            <td>
                              {changes && typeof changes === 'object' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                  {Object.entries(changes).map(([k, v]) => {
                                    const oldVal = v?.old !== undefined ? String(v.old) : (v?.from !== undefined ? String(v.from) : null);
                                    const newVal = v?.new !== undefined ? String(v.new) : (v?.to !== undefined ? String(v.to) : String(v));
                                    const isSecret = /secret|password|token|key|tax_id/i.test(k);
                                    return (
                                      <div key={k} className="org-diff-chip">
                                        <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{k}:</span>
                                        {oldVal !== null && (
                                          <>
                                            <span className="diff-old">{isSecret ? '••••' : (oldVal || 'empty')}</span>
                                            <span className="diff-arrow">→</span>
                                          </>
                                        )}
                                        <span className="diff-new">{isSecret ? '••••' : (newVal || 'empty')}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
                                  {log.details ? String(log.details) : '—'}
                                </span>
                              )}
                            </td>
                            <td>
                              <span style={{ fontSize: '12.5px', color: 'var(--ink)' }}>
                                {log.reason || log.note || '—'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Audit Pagination */}
                <div className="org-pagination">
                  <span>
                    Showing {auditLogs.length} events · Total: {auditPagination.total}
                  </span>
                  <div className="org-pagination-controls">
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: '4px 10px', minHeight: '28px', fontSize: '12px' }}
                      disabled={auditPagination.page <= 1 || loadingAudit}
                      onClick={() => loadAuditData(auditPagination.page - 1)}
                    >
                      <CaretLeft size={14} />
                      <span>Prev</span>
                    </button>
                    <span>
                      Page {auditPagination.page} of {auditPagination.totalPages || 1}
                    </span>
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: '4px 10px', minHeight: '28px', fontSize: '12px' }}
                      disabled={auditPagination.page >= auditPagination.totalPages || loadingAudit}
                      onClick={() => loadAuditData(auditPagination.page + 1)}
                    >
                      <span>Next</span>
                      <CaretRight size={14} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL 1: EDIT PROFILE & ADDRESS
         ════════════════════════════════════════════════════════════════════════ */}
      {isEditing && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setIsEditing(false)}>
          <section className="modal wide" role="dialog" aria-modal="true" aria-label="Edit Organization Profile">
            <header>
              <h2>Edit Organization Information</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close dialog"
                onClick={() => setIsEditing(false)}
              >
                <X size={22} />
              </button>
            </header>

            <form onSubmit={handleUpdateProfile}>
              <p className="modal-description">
                Update verified legal entity records, physical headquarters address, and corporate contact channels.
              </p>

              {editError && (
                <div className="notice-banner error modal-error-banner">
                  <WarningCircle size={18} />
                  <span>{editError}</span>
                </div>
              )}

              <div className="form-grid">
                <span className="org-form-section-title">Company Information</span>

                <label>
                  Legal Name *
                  <input
                    required
                    type="text"
                    value={editForm.legal_name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, legal_name: e.target.value }))}
                    placeholder="e.g. Apex Ocean Lines LLC"
                  />
                </label>

                <label>
                  Tax ID / EIN
                  <input
                    type="text"
                    value={editForm.tax_id}
                    onChange={(e) => setEditForm(prev => ({ ...prev, tax_id: e.target.value }))}
                    placeholder="XX-XXXXXXX"
                  />
                </label>

                <label>
                  USDOT Number
                  <input
                    type="text"
                    value={editForm.dot_number}
                    onChange={(e) => setEditForm(prev => ({ ...prev, dot_number: e.target.value }))}
                    placeholder="e.g. 1234567"
                  />
                </label>

                <label>
                  MC / Carrier Number
                  <input
                    type="text"
                    value={editForm.mc_number}
                    onChange={(e) => setEditForm(prev => ({ ...prev, mc_number: e.target.value }))}
                    placeholder="e.g. MC-987654"
                  />
                </label>

                <span className="org-form-section-title">Headquarters Address</span>

                <label className="org-form-full-width">
                  Address Line 1
                  <input
                    type="text"
                    value={editForm.address_line1}
                    onChange={(e) => setEditForm(prev => ({ ...prev, address_line1: e.target.value }))}
                    placeholder="Street address or P.O. Box"
                  />
                </label>

                <label className="org-form-full-width">
                  Address Line 2
                  <input
                    type="text"
                    value={editForm.address_line2}
                    onChange={(e) => setEditForm(prev => ({ ...prev, address_line2: e.target.value }))}
                    placeholder="Suite, unit, floor, building (optional)"
                  />
                </label>

                <label>
                  City
                  <input
                    type="text"
                    value={editForm.city}
                    onChange={(e) => setEditForm(prev => ({ ...prev, city: e.target.value }))}
                    placeholder="e.g. Seattle"
                  />
                </label>

                <label>
                  State / Province
                  <input
                    type="text"
                    value={editForm.state}
                    onChange={(e) => setEditForm(prev => ({ ...prev, state: e.target.value }))}
                    placeholder="e.g. WA"
                  />
                </label>

                <label>
                  Postal / ZIP Code
                  <input
                    type="text"
                    value={editForm.postal_code}
                    onChange={(e) => setEditForm(prev => ({ ...prev, postal_code: e.target.value }))}
                    placeholder="e.g. 98101"
                  />
                </label>

                <label>
                  Country
                  <input
                    type="text"
                    value={editForm.country}
                    onChange={(e) => setEditForm(prev => ({ ...prev, country: e.target.value }))}
                    placeholder="e.g. USA"
                  />
                </label>

                <span className="org-form-section-title">Contact Information</span>

                <label>
                  Company Phone
                  <input
                    type="tel"
                    value={editForm.company_phone}
                    onChange={(e) => setEditForm(prev => ({ ...prev, company_phone: e.target.value }))}
                    placeholder="+1 (555) 012-3456"
                  />
                </label>

                <label>
                  Company Email
                  <input
                    type="email"
                    value={editForm.company_email}
                    onChange={(e) => setEditForm(prev => ({ ...prev, company_email: e.target.value }))}
                    placeholder="dispatch@company.com"
                  />
                </label>

                <label className="org-form-full-width">
                  Corporate Website
                  <input
                    type="text"
                    value={editForm.website}
                    onChange={(e) => setEditForm(prev => ({ ...prev, website: e.target.value }))}
                    placeholder="https://company.com"
                  />
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setIsEditing(false)}
                  disabled={saveLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={saveLoading}
                >
                  {saveLoading ? 'Saving changes...' : 'Save Organization Changes'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL 2: LIFECYCLE STATUS TRANSITION CONFIRMATION
         ════════════════════════════════════════════════════════════════════════ */}
      {statusModal.isOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setStatusModal(prev => ({ ...prev, isOpen: false }))}>
          <section className="modal" role="dialog" aria-modal="true" aria-label={statusModal.title}>
            <header>
              <h2>{statusModal.title}</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close dialog"
                onClick={() => setStatusModal(prev => ({ ...prev, isOpen: false }))}
              >
                <X size={22} />
              </button>
            </header>

            <div>
              <p className="modal-description">
                Are you sure you want to transition this organization from <strong>{status.toUpperCase()}</strong> to <strong>{statusModal.targetStatus.toUpperCase()}</strong>?
              </p>

              {statusModal.targetStatus === 'terminated' && (
                <div className="notice-banner error" style={{ margin: '14px 0' }}>
                  <WarningCircle size={20} />
                  <div>
                    <strong>Warning: Permanent Destruction</strong>
                    <p style={{ margin: '2px 0 0 0' }}>
                      Terminating an organization immediately revokes access for all its users and cancels pending shipments.
                    </p>
                  </div>
                </div>
              )}

              {statusModal.error && (
                <div className="notice-banner error modal-error-banner">
                  <WarningCircle size={18} />
                  <span>{statusModal.error}</span>
                </div>
              )}

              <label style={{ display: 'block', marginTop: '14px', fontSize: '13px', color: 'var(--ink)' }}>
                Justification Reason {statusModal.requiresReason ? '*' : '(Optional)'}
                <textarea
                  rows={3}
                  required={statusModal.requiresReason}
                  style={{ width: '100%', marginTop: '6px', padding: '10px', border: '1px solid #d2dcea', borderRadius: '6px', fontFamily: 'inherit' }}
                  placeholder="State the administrative reason for this lifecycle transition..."
                  value={statusModal.reason}
                  onChange={(e) => setStatusModal(prev => ({ ...prev, reason: e.target.value }))}
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setStatusModal(prev => ({ ...prev, isOpen: false }))}
                  disabled={statusModal.loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`btn ${statusModal.targetStatus === 'terminated' ? 'danger' : 'primary'}`}
                  onClick={handleStatusChangeConfirm}
                  disabled={statusModal.loading}
                >
                  {statusModal.loading ? 'Updating...' : statusModal.confirmText}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL 3: UPLOAD COMPLIANCE DOCUMENT
         ════════════════════════════════════════════════════════════════════════ */}
      {uploadModal.isOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setUploadModal(prev => ({ ...prev, isOpen: false }))}>
          <section className="modal" role="dialog" aria-modal="true" aria-label="Upload Compliance Document">
            <header>
              <h2>Upload Compliance Document</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close dialog"
                onClick={() => setUploadModal(prev => ({ ...prev, isOpen: false }))}
              >
                <X size={22} />
              </button>
            </header>

            <form onSubmit={handleUploadDocSubmit}>
              <p className="modal-description">
                Upload regulatory certificates, W-9 tax forms, or proof of commercial carrier liability coverage.
              </p>

              {uploadModal.error && (
                <div className="notice-banner error modal-error-banner">
                  <WarningCircle size={18} />
                  <span>{uploadModal.error}</span>
                </div>
              )}

              {/* Dropzone File Picker */}
              <label
                className={`org-file-dropzone ${uploadModal.file ? 'has-file' : ''}`}
                style={{ marginBottom: '16px' }}
              >
                <input
                  type="file"
                  required
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setUploadModal(prev => ({ ...prev, file: f }));
                  }}
                />
                <UploadSimple size={28} color={uploadModal.file ? '#127d55' : '#005fdc'} />
                {uploadModal.file ? (
                  <div>
                    <strong style={{ color: '#127d55', display: 'block', fontSize: '14px' }}>
                      {uploadModal.file.name}
                    </strong>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      {(uploadModal.file.size / 1024).toFixed(1)} KB · Click to change file
                    </span>
                  </div>
                ) : (
                  <div>
                    <strong style={{ display: 'block', fontSize: '14px', color: 'var(--ink)' }}>
                      Click to choose file or drag & drop
                    </strong>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      PDF, PNG, JPG, or DOCX (Max 15MB)
                    </span>
                  </div>
                )}
              </label>

              <div className="form-grid">
                <label className="org-form-full-width">
                  Document Classification *
                  <select
                    value={uploadModal.document_type}
                    onChange={(e) => setUploadModal(prev => ({ ...prev, document_type: e.target.value }))}
                  >
                    <option value="insurance_certificate">Certificate of Insurance (COI)</option>
                    <option value="w9">Form W-9 (Taxpayer ID & Certification)</option>
                    <option value="safety_permit">Safety & Operating Permit</option>
                    <option value="hazmat_cert">Hazardous Materials Registration</option>
                    <option value="authority_letter">Operating Authority Letter (MC/DOT)</option>
                    <option value="other">Other Regulatory Filing</option>
                  </select>
                </label>

                <label>
                  Policy Expiry Date
                  <input
                    type="date"
                    value={uploadModal.expiry_date}
                    onChange={(e) => setUploadModal(prev => ({ ...prev, expiry_date: e.target.value }))}
                  />
                </label>

                <label>
                  Coverage Limit ($ USD)
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="e.g. 1000000"
                    value={uploadModal.coverage_amount}
                    onChange={(e) => setUploadModal(prev => ({ ...prev, coverage_amount: e.target.value }))}
                  />
                </label>

                <label className="org-form-full-width">
                  Notes / Policy Number
                  <input
                    type="text"
                    placeholder="e.g. Policy #ABC-99120, Auto Liability & Cargo"
                    value={uploadModal.notes}
                    onChange={(e) => setUploadModal(prev => ({ ...prev, notes: e.target.value }))}
                  />
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setUploadModal(prev => ({ ...prev, isOpen: false }))}
                  disabled={uploadModal.loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={uploadModal.loading}
                >
                  {uploadModal.loading ? 'Uploading...' : 'Upload & Save Document'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL 4: EDIT DOCUMENT METADATA
         ════════════════════════════════════════════════════════════════════════ */}
      {editDocModal.isOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setEditDocModal(prev => ({ ...prev, isOpen: false }))}>
          <section className="modal" role="dialog" aria-modal="true" aria-label="Edit Document Metadata">
            <header>
              <h2>Edit Document Metadata</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close dialog"
                onClick={() => setEditDocModal(prev => ({ ...prev, isOpen: false }))}
              >
                <X size={22} />
              </button>
            </header>

            <form onSubmit={handleEditDocSubmit}>
              <p className="modal-description">
                Update verified expiry date, coverage amount, or verification state for <strong>{docTypeLabel(editDocModal.doc?.document_type)}</strong>.
              </p>

              {editDocModal.error && (
                <div className="notice-banner error modal-error-banner">
                  <WarningCircle size={18} />
                  <span>{editDocModal.error}</span>
                </div>
              )}

              <div className="form-grid">
                <label>
                  Policy Expiry Date
                  <input
                    type="date"
                    value={editDocModal.expiry_date}
                    onChange={(e) => setEditDocModal(prev => ({ ...prev, expiry_date: e.target.value }))}
                  />
                </label>

                <label>
                  Coverage Limit ($ USD)
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={editDocModal.coverage_amount}
                    onChange={(e) => setEditDocModal(prev => ({ ...prev, coverage_amount: e.target.value }))}
                  />
                </label>

                <label className="org-form-full-width">
                  Verification Status
                  <select
                    value={editDocModal.verification_status}
                    onChange={(e) => setEditDocModal(prev => ({ ...prev, verification_status: e.target.value }))}
                  >
                    <option value="verified">Verified (Approved)</option>
                    <option value="pending_review">Pending Review</option>
                    <option value="rejected">Rejected (Needs Correction)</option>
                  </select>
                </label>

                <label className="org-form-full-width">
                  Internal Notes / Reference
                  <input
                    type="text"
                    value={editDocModal.notes}
                    onChange={(e) => setEditDocModal(prev => ({ ...prev, notes: e.target.value }))}
                  />
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setEditDocModal(prev => ({ ...prev, isOpen: false }))}
                  disabled={editDocModal.loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={editDocModal.loading}
                >
                  {editDocModal.loading ? 'Saving...' : 'Save Metadata'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL 5: DELETE DOCUMENT CONFIRMATION
         ════════════════════════════════════════════════════════════════════════ */}
      {deleteDocModal.isOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setDeleteDocModal(prev => ({ ...prev, isOpen: false }))}>
          <section className="modal" role="dialog" aria-modal="true" aria-label="Delete Compliance Document">
            <header>
              <h2>Delete Document</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close dialog"
                onClick={() => setDeleteDocModal(prev => ({ ...prev, isOpen: false }))}
              >
                <X size={22} />
              </button>
            </header>

            <div>
              <p className="modal-description">
                Are you sure you want to permanently delete <strong>{docTypeLabel(deleteDocModal.doc?.document_type)}</strong>?
                This action cannot be undone and may affect compliance certification standing.
              </p>

              {deleteDocModal.error && (
                <div className="notice-banner error modal-error-banner">
                  <WarningCircle size={18} />
                  <span>{deleteDocModal.error}</span>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setDeleteDocModal(prev => ({ ...prev, isOpen: false }))}
                  disabled={deleteDocModal.loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={handleDeleteDocConfirm}
                  disabled={deleteDocModal.loading}
                >
                  {deleteDocModal.loading ? 'Deleting...' : 'Delete Document'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL 6: CONFIGURE ENTERPRISE SSO
         ════════════════════════════════════════════════════════════════════════ */}
      {ssoModal.isOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setSsoModal(prev => ({ ...prev, isOpen: false }))}>
          <section className="modal wide" role="dialog" aria-modal="true" aria-label="Configure Single Sign-On">
            <header>
              <h2>Configure Single Sign-On (SSO)</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close dialog"
                onClick={() => setSsoModal(prev => ({ ...prev, isOpen: false }))}
              >
                <X size={22} />
              </button>
            </header>

            <form onSubmit={handleSsoSubmit}>
              <p className="modal-description">
                Configure corporate identity federation using OIDC (OpenID Connect) or SAML 2.0.
              </p>

              {ssoModal.error && (
                <div className="notice-banner error modal-error-banner">
                  <WarningCircle size={18} />
                  <span>{ssoModal.error}</span>
                </div>
              )}

              <div className="form-grid">
                <span className="org-form-section-title">Identity Federation Protocol</span>

                <label>
                  Protocol Standard *
                  <select
                    value={ssoModal.protocol}
                    onChange={(e) => setSsoModal(prev => ({ ...prev, protocol: e.target.value }))}
                  >
                    <option value="oidc">OpenID Connect (OIDC / OAuth 2.0)</option>
                    <option value="saml">SAML 2.0 (Security Assertion Markup)</option>
                  </select>
                </label>

                <label>
                  Corporate Email Domain *
                  <input
                    type="text"
                    required
                    placeholder="e.g. acme-logistics.com"
                    value={ssoModal.domain}
                    onChange={(e) => setSsoModal(prev => ({ ...prev, domain: e.target.value }))}
                  />
                </label>

                {/* OIDC specific fields */}
                {ssoModal.protocol === 'oidc' && (
                  <>
                    <span className="org-form-section-title">OIDC Client Credentials</span>

                    <label>
                      Client ID *
                      <input
                        type="text"
                        required
                        placeholder="e.g. 0oa2abcdef123456"
                        value={ssoModal.client_id}
                        onChange={(e) => setSsoModal(prev => ({ ...prev, client_id: e.target.value }))}
                      />
                    </label>

                    <label>
                      Client Secret {ssoConfig?.client_secret ? '(Leave blank to keep existing)' : '*'}
                      <input
                        type="password"
                        placeholder={ssoConfig?.client_secret ? '•••••••••••••••• (unchanged)' : 'Enter client secret'}
                        value={ssoModal.client_secret}
                        onChange={(e) => setSsoModal(prev => ({ ...prev, client_secret: e.target.value }))}
                      />
                    </label>

                    <label className="org-form-full-width">
                      Discovery URL (Well-Known OIDC Configuration)
                      <input
                        type="url"
                        placeholder="https://identity.company.com/.well-known/openid-configuration"
                        value={ssoModal.discovery_url}
                        onChange={(e) => setSsoModal(prev => ({ ...prev, discovery_url: e.target.value }))}
                      />
                    </label>
                  </>
                )}

                {/* SAML specific fields */}
                {ssoModal.protocol === 'saml' && (
                  <>
                    <span className="org-form-section-title">SAML 2.0 Identity Provider</span>

                    <label>
                      Identity Provider Entity ID *
                      <input
                        type="text"
                        required
                        placeholder="e.g. https://sts.windows.net/tenant-id/"
                        value={ssoModal.entity_id}
                        onChange={(e) => setSsoModal(prev => ({ ...prev, entity_id: e.target.value }))}
                      />
                    </label>

                    <label>
                      SSO Sign-In URL *
                      <input
                        type="url"
                        required
                        placeholder="https://login.microsoftonline.com/tenant-id/saml2"
                        value={ssoModal.sso_url}
                        onChange={(e) => setSsoModal(prev => ({ ...prev, sso_url: e.target.value }))}
                      />
                    </label>

                    <label className="org-form-full-width">
                      X.509 Certificate (PEM Format)
                      <textarea
                        rows={4}
                        placeholder="-----BEGIN CERTIFICATE-----&#10;MIIC...&#10;-----END CERTIFICATE-----"
                        style={{ width: '100%', fontFamily: 'Consolas, monospace', fontSize: '12px' }}
                        value={ssoModal.certificate}
                        onChange={(e) => setSsoModal(prev => ({ ...prev, certificate: e.target.value }))}
                      />
                    </label>
                  </>
                )}

                <span className="org-form-section-title">Enforcement & Activation</span>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: '6px 0' }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto', margin: 0 }}
                    checked={ssoModal.enabled}
                    onChange={(e) => setSsoModal(prev => ({ ...prev, enabled: e.target.checked }))}
                  />
                  <span>Enable Single Sign-On Integration</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: '6px 0' }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto', margin: 0 }}
                    checked={ssoModal.enforce_sso}
                    onChange={(e) => setSsoModal(prev => ({ ...prev, enforce_sso: e.target.checked }))}
                  />
                  <span>Enforce SSO (Block password login for matching domains)</span>
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSsoModal(prev => ({ ...prev, isOpen: false }))}
                  disabled={ssoModal.loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={ssoModal.loading}
                >
                  {ssoModal.loading ? 'Saving configuration...' : 'Save SSO Settings'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
