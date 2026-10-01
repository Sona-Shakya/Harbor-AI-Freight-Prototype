import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  GearSix,
  LockKey,
  Plus,
  CheckCircle,
  WarningCircle,
  CaretRight,
  CaretUp,
  CaretDown,
  Trash,
  NotePencil,
  ArrowClockwise,
  DownloadSimple,
  ShieldCheck,
  Buildings,
  Eye,
  FileText,
  Info,
  X,
  MagnifyingGlass,
  Clock,
  Copy,
  Check,
} from '@phosphor-icons/react';
import {
  load,
  getSettingCategories,
  getSettingCategoryValues,
  createCategory,
  createValue,
  updateValue,
  deactivateValue,
  createOverride,
  updateOverride,
  loadAudit,
  getSettingAuditLog,
  getConfig,
  updateConfig,
  getSettingsByCategory,
  getCurrentOrganization,
  isApiConfigured,
} from './api';
import { seedSettingCategories } from './data';
import './styles/settingsRegistry.css';

/* ─── Helpers ─────────────────────────────────────────────────── */
const uid = (prefix) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

function formatDate(val) {
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
    return String(val);
  }
}

function actionChipClass(action) {
  switch ((action || '').toUpperCase()) {
    case 'CREATE':
      return 'sr-action-chip create';
    case 'UPDATE':
      return 'sr-action-chip update';
    case 'DEACTIVATE':
    case 'DELETE':
      return 'sr-action-chip deactivate';
    default:
      return 'sr-action-chip';
  }
}

/* ─── Modal Shell Component ───────────────────────────────────── */
function ModalShell({ title, onClose, children, wide = false }) {
  const boxRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    boxRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={boxRef}
        tabIndex={-1}
        className={`modal ${wide ? 'wide' : ''} sr-modal`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: wide ? '760px' : '540px' }}
      >
        <header>
          <h2>{title}</h2>
          <button
            type="button"
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

/* ─── Main SettingsRegistry Component ─────────────────────────── */
export default function SettingsRegistry({
  settings: propSettings,
  setSettings: propSetSettings,
  settingAudit: propSettingAudit,
  setSettingAudit: propSetSettingAudit,
  notify = () => {},
  visible = true,
  hasPermission,
  currentUser,
  currentRoleName,
  currentOrg,
  profileLoading = false,
}) {
  if (!visible) return null;

  /* ─── Role & Access Control ─────────────────────────────────── */
  const resolvedRole =
    currentRoleName || currentUser?.role || currentUser?.roleName || '';
  const isPlatformAdmin = resolvedRole === 'Platform Admin';
  const isCompanyAdmin = resolvedRole === 'Company Admin';
  const isDriver = resolvedRole === 'Driver';

  // Driver role is explicitly restricted from accessing administrative configuration
  const isRestricted = isDriver;

  const canConfigure = isPlatformAdmin;
  const canCreateCategory = isPlatformAdmin;
  const canCreateValue = isPlatformAdmin;
  const canEditValue = isPlatformAdmin;
  const canDeactivateValue = isPlatformAdmin;
  const canReorder = isPlatformAdmin;
  const canManageOverrides = isPlatformAdmin || isCompanyAdmin;

  /* ─── State ─────────────────────────────────────────────────── */
  const [categories, setCategories] = useState(
    propSettings?.length ? propSettings : seedSettingCategories
  );
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [tab, setTab] = useState('Values'); // 'Values' | 'Org overrides' | 'Audit log' | 'Facade'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchCatQuery, setSearchCatQuery] = useState('');

  // Organization Context
  const [organization, setOrganization] = useState({
    id: currentOrg?.id || null,
    name: currentOrg?.legal_name || 'Organization',
  });

  // Audit Log State
  const [auditLogs, setAuditLogs] = useState(propSettingAudit || []);
  const [auditLoading, setAuditLoading] = useState(false);

  // Facade / Config Map State
  const [configData, setConfigData] = useState(null);
  const [copiedConfig, setCopiedConfig] = useState(false);

  // Modals State
  const [modal, setModal] = useState(null);
  // modal: { kind: 'add_category' | 'add_value' | 'edit_value' | 'deactivate_value' | 'add_override' | 'edit_override', ... }

  // New Category Form State
  const [newCatModule, setNewCatModule] = useState('equipment');
  const [newCatKey, setNewCatKey] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);

  // Inline / Card Add Value State
  const [newValueSlug, setNewValueSlug] = useState('');
  const [newValueLabel, setNewValueLabel] = useState('');
  const [addingValue, setAddingValue] = useState(false);

  // Inline Edit Value Label
  const [editingValueId, setEditingValueId] = useState(null);
  const [editingValueLabel, setEditingValueLabel] = useState('');

  // Target Org for Platform Admin Overrides
  const [platformTargetOrgId, setPlatformTargetOrgId] = useState(
    currentOrg?.id || 1
  );

  /* ─── Sync with Parent Props ────────────────────────────────── */
  useEffect(() => {
    if (propSettings && propSettings.length > 0) {
      setCategories(propSettings);
      if (!selectedCatId) {
        setSelectedCatId(propSettings[0].id);
      }
    }
  }, [propSettings]);

  useEffect(() => {
    if (propSettingAudit) {
      setAuditLogs(propSettingAudit);
    }
  }, [propSettingAudit]);

  /* ─── Load Organization Context ─────────────────────────────── */
  useEffect(() => {
    if (currentOrg?.id) {
      setOrganization({
        id: currentOrg.id,
        name: currentOrg.legal_name || 'Organization',
      });
      setPlatformTargetOrgId(currentOrg.id);
      return;
    }

    getCurrentOrganization()
      .then((org) => {
        if (org?.organizationId) {
          setOrganization({
            id: org.organizationId,
            name: org.organizationName || 'Current organization',
          });
          setPlatformTargetOrgId(org.organizationId);
        }
      })
      .catch(() => {});
  }, [currentOrg]);

  /* ─── Fetch Categories & Values from API ─────────────────────── */
  const fetchAllSettings = useCallback(async () => {
    if (isRestricted) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const orgId = organization.id || currentOrg?.id || null;
      const loaded = await load(orgId);

      if (Array.isArray(loaded) && loaded.length > 0) {
        setCategories(loaded);
        if (propSetSettings) propSetSettings(loaded);

        // Keep current selection or default to equipment.type or first category
        setSelectedCatId((prev) => {
          if (prev && loaded.some((c) => c.id === prev)) return prev;
          const equipCat = loaded.find((c) => c.key === 'equipment.type');
          return equipCat ? equipCat.id : loaded[0].id;
        });
      }
    } catch (err) {
      console.warn('Failed to load settings from API, using fallback data:', err);
      // Retain existing or fallback seed categories
      setCategories((prev) => (prev.length ? prev : seedSettingCategories));
      if (!selectedCatId) {
        setSelectedCatId(seedSettingCategories[0].id);
      }
      setError(
        'Could not synchronize with backend settings API. Showing cached catalog.'
      );
    } finally {
      setLoading(false);
    }
  }, [organization.id, currentOrg?.id, isRestricted, selectedCatId, propSetSettings]);

  /* ─── Fetch Audit Logs ──────────────────────────────────────── */
  const fetchAuditLogs = useCallback(async () => {
    if (isRestricted) return;
    setAuditLoading(true);
    try {
      const res = await loadAudit();
      const logs = Array.isArray(res) ? res : res?.data || [];
      setAuditLogs(logs);
      if (propSetSettingAudit) propSetSettingAudit(logs);
    } catch (err) {
      console.warn('Failed to fetch settings audit log:', err);
    } finally {
      setAuditLoading(false);
    }
  }, [isRestricted, propSetSettingAudit]);

  /* ─── Fetch Facade Config Map ───────────────────────────────── */
  const fetchConfigFacade = useCallback(async () => {
    if (isRestricted) return;
    try {
      const orgId = isPlatformAdmin ? platformTargetOrgId : organization.id;
      const res = await getConfig(orgId);
      setConfigData(res?.data || res);
    } catch (err) {
      console.warn('Failed to fetch config facade:', err);
    }
  }, [isRestricted, isPlatformAdmin, platformTargetOrgId, organization.id]);

  /* ─── Initial Data Fetch ────────────────────────────────────── */
  useEffect(() => {
    if (!profileLoading && visible) {
      fetchAllSettings();
      fetchAuditLogs();
    }
  }, [profileLoading, visible]);

  /* ─── Tab Switch Data Loading ───────────────────────────────── */
  useEffect(() => {
    if (tab === 'Audit log') {
      fetchAuditLogs();
    } else if (tab === 'Facade') {
      fetchConfigFacade();
    }
  }, [tab, fetchAuditLogs, fetchConfigFacade]);

  /* ─── Active Category Resolution ────────────────────────────── */
  const activeCategory =
    categories.find((c) => c.id === selectedCatId) ||
    categories.find((c) => c.key === 'equipment.type') ||
    categories[0] ||
    null;

  /* ─── Category Creation Handler ─────────────────────────────── */
  async function handleCreateCategory(e) {
    e.preventDefault();
    if (!canCreateCategory) return;
    if (!newCatKey.trim() || !newCatName.trim()) {
      notify('Category key and name are required.');
      return;
    }

    const formattedKey = newCatKey
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '.');

    setCreatingCat(true);
    try {
      await createCategory({
        module: newCatModule.trim().toLowerCase(),
        key: formattedKey,
        name: newCatName.trim(),
        description: newCatDesc.trim() || 'Custom administrative setting category.',
      });

      notify(`Category '${newCatName.trim()}' created successfully.`);
      setNewCatKey('');
      setNewCatName('');
      setNewCatDesc('');
      setModal(null);
      await fetchAllSettings();
      await fetchAuditLogs();
    } catch (err) {
      notify(err.message || 'Failed to create category.');
    } finally {
      setCreatingCat(false);
    }
  }

  /* ─── Value Creation Handler ────────────────────────────────── */
  async function handleAddValue(e) {
    e?.preventDefault();
    if (!canCreateValue || !activeCategory) return;
    if (!newValueSlug.trim() || !newValueLabel.trim()) {
      notify('Value slug and label are required.');
      return;
    }

    const slug = newValueSlug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');

    setAddingValue(true);
    try {
      await createValue(activeCategory.id, {
        value: slug,
        label: newValueLabel.trim(),
        sort_order: (activeCategory.values?.length || 0) + 1,
        is_active: true,
        is_default: false,
      });

      notify(`Setting value '${newValueLabel.trim()}' added.`);
      setNewValueSlug('');
      setNewValueLabel('');
      await fetchAllSettings();
      await fetchAuditLogs();
    } catch (err) {
      notify(err.message || 'Failed to add setting value.');
    } finally {
      setAddingValue(false);
    }
  }

  /* ─── Value Update Handler ──────────────────────────────────── */
  async function handleUpdateValue(valueItem, patch) {
    if (!canEditValue) return;
    if (valueItem.isSystemDefined || valueItem.is_system_defined) {
      notify('System-defined values are immutable and protected from modification.');
      return;
    }

    try {
      await updateValue(valueItem.id, patch);
      notify('Setting value updated.');
      setEditingValueId(null);
      await fetchAllSettings();
      await fetchAuditLogs();
    } catch (err) {
      notify(err.message || 'Failed to update setting value.');
    }
  }

  /* ─── Value Deactivation Handler ────────────────────────────── */
  async function handleDeactivateValue(valueItem) {
    if (!canDeactivateValue) return;
    if (valueItem.isSystemDefined || valueItem.is_system_defined) {
      notify('System-defined values cannot be deactivated.');
      return;
    }

    try {
      await deactivateValue(valueItem.id);
      notify(`Setting value '${valueItem.label}' deactivated.`);
      setModal(null);
      await fetchAllSettings();
      await fetchAuditLogs();
    } catch (err) {
      notify(err.message || 'Failed to deactivate setting value.');
    }
  }

  /* ─── Reorder Values Handler ────────────────────────────────── */
  async function handleReorder(valueItem, direction) {
    if (!canReorder || !activeCategory) return;
    const sorted = [...(activeCategory.values || [])].sort(
      (a, b) => (a.sortOrder ?? a.sort_order ?? 0) - (b.sortOrder ?? b.sort_order ?? 0)
    );
    const index = sorted.findIndex((v) => v.id === valueItem.id);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    const swapItem = sorted[targetIndex];
    if (
      (valueItem.isSystemDefined || valueItem.is_system_defined) &&
      (swapItem.isSystemDefined || swapItem.is_system_defined)
    ) {
      // System-defined values maintain standardized positions
      notify('System-defined order is fixed by platform specifications.');
      return;
    }

    try {
      const newOrder = swapItem.sortOrder ?? swapItem.sort_order ?? targetIndex + 1;
      await updateValue(valueItem.id, { sort_order: newOrder });
      await fetchAllSettings();
    } catch (err) {
      notify('Failed to update value order.');
    }
  }

  /* ─── Create Override Handler ───────────────────────────────── */
  async function handleCreateOverride(formData) {
    if (!canManageOverrides || !activeCategory) return;

    // Platform Admin can target specified org; Company Admin is strictly scoped to own org
    const targetOrgId = isPlatformAdmin
      ? Number(formData.org_id || platformTargetOrgId)
      : organization.id;

    if (!targetOrgId && isPlatformAdmin) {
      notify('Please select or specify a target organization ID.');
      return;
    }

    try {
      await createOverride({
        category_id: Number(activeCategory.id),
        org_id: targetOrgId ? Number(targetOrgId) : undefined,
        value: formData.value,
        label: formData.label,
        sort_order: Number(formData.sort_order || 1),
        is_active: true,
      });

      notify(`Organization override for '${formData.label}' created.`);
      setModal(null);
      await fetchAllSettings();
      await fetchAuditLogs();
    } catch (err) {
      notify(err.message || 'Failed to create organization override.');
    }
  }

  /* ─── Update Override Handler ───────────────────────────────── */
  async function handleUpdateOverride(overrideId, patch) {
    try {
      await updateOverride(overrideId, patch);
      notify('Organization override updated.');
      setModal(null);
      await fetchAllSettings();
      await fetchAuditLogs();
    } catch (err) {
      notify(err.message || 'Failed to update organization override.');
    }
  }

  /* ─── Export JSON ───────────────────────────────────────────── */
  function exportSettingsJson() {
    const payload = {
      export_date: new Date().toISOString(),
      platform: 'Harbor AI Freight Platform',
      version: '1.0.0',
      categories,
      audit_log: auditLogs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `system-settings-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify('Settings exported as JSON.');
  }

  /* ─── Driver Access Restricted Screen ───────────────────────── */
  if (isRestricted) {
    return (
      <section className="settings-registry" aria-label="System settings registry">
        <div className="sr-access-restricted">
          <div className="lock-icon">
            <LockKey size={30} />
          </div>
          <h2>Access Restricted</h2>
          <p>
            Driver accounts do not possess administrative permissions to view or
            modify System Settings categories, values, or organization overrides.
          </p>
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '14px',
              textAlign: 'left',
              fontSize: '13px',
              color: '#475569',
            }}
          >
            <strong>Permitted Operational Catalog:</strong>
            <p style={{ margin: '6px 0 0 0', fontSize: '12px' }}>
              Drivers receive dispatch-filtered equipment types and assigned shipment
              status transitions directly within the active shipment workflow.
            </p>
          </div>
        </div>
      </section>
    );
  }

  /* ─── Filtered Categories ───────────────────────────────────── */
  const filteredCategories = categories.filter((c) => {
    const query = searchCatQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      (c.name || '').toLowerCase().includes(query) ||
      (c.key || '').toLowerCase().includes(query) ||
      (c.module || '').toLowerCase().includes(query)
    );
  });

  return (
    <section className="settings-registry" aria-label="System settings registry">
      {/* ─── Header ────────────────────────────────────────────── */}
      <div className="sr-page-header">
        <div className="sr-header-left">
          <div className="sr-eyebrow">
            SYSTEM SETTINGS · CONFIGURATION REGISTRY
          </div>
          <h1>System Settings Master</h1>
          <p>
            Central source of truth for equipment types, accessorials, cutoff
            rules, and operational statuses across all freight workflows.
          </p>
        </div>

        <div className="sr-header-actions">
          <button
            type="button"
            className="btn"
            onClick={fetchAllSettings}
            title="Refresh settings from server"
            disabled={loading}
          >
            <ArrowClockwise size={16} className={loading ? 'spin' : ''} />
            Refresh
          </button>

          <button
            type="button"
            className="btn"
            onClick={exportSettingsJson}
            title="Export settings registry JSON"
          >
            <DownloadSimple size={16} />
            Export JSON
          </button>

          {canCreateCategory && (
            <button
              type="button"
              className="btn primary"
              onClick={() => setModal({ kind: 'add_category' })}
            >
              <Plus size={16} />
              New Category
            </button>
          )}

          <span
            className="badge"
            style={{
              background: isPlatformAdmin ? '#dbeafe' : '#f1f5f9',
              color: isPlatformAdmin ? '#1e40af' : '#475569',
              fontWeight: 600,
              padding: '6px 12px',
              borderRadius: '6px',
            }}
          >
            <ShieldCheck size={14} style={{ marginRight: '4px' }} />
            {resolvedRole || 'User'}
          </span>
        </div>
      </div>

      {/* ─── Summary KPI Cards ─────────────────────────────────── */}
      <div className="sr-summary-cards">
        <div className="sr-metric-card">
          <div className="label">Total Categories</div>
          <div className="val">{categories.length}</div>
        </div>
        <div className="sr-metric-card">
          <div className="label">Active Values (Current)</div>
          <div className="val">
            {activeCategory?.values?.filter((v) => v.isActive || v.is_active).length || 0}
          </div>
        </div>
        <div className="sr-metric-card">
          <div className="label">System Protected Values</div>
          <div className="val">
            {activeCategory?.values?.filter(
              (v) => v.isSystemDefined || v.is_system_defined
            ).length || 0}
          </div>
        </div>
        <div className="sr-metric-card">
          <div className="label">Org Overrides Active</div>
          <div className="val">
            {activeCategory?.overrides?.filter((o) => o.is_active || o.isActive).length || 0}
          </div>
        </div>
      </div>

      {/* ─── Error Banner ──────────────────────────────────────── */}
      {error && (
        <div className="sr-error-banner">
          <div className="sr-error-banner-content">
            <WarningCircle size={18} />
            <span>{error}</span>
          </div>
          <button
            type="button"
            className="btn small"
            onClick={fetchAllSettings}
          >
            Retry Sync
          </button>
        </div>
      )}

      {/* ─── 2-Column Main Layout ──────────────────────────────── */}
      <div className="sr-layout">
        {/* Left Column: Categories Sidebar */}
        <aside className="sr-categories-sidebar">
          <div className="sr-sidebar-top">
            <div className="sr-sidebar-title">
              Setting Categories
              <span>{filteredCategories.length}</span>
            </div>
            <div className="sr-search-input">
              <MagnifyingGlass size={16} />
              <input
                type="text"
                placeholder="Search categories…"
                value={searchCatQuery}
                onChange={(e) => setSearchCatQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="sr-categories-list">
            {filteredCategories.map((c) => {
              const isSelected = activeCategory?.id === c.id;
              const valuesCount = c.values?.length || 0;
              const isSys = c.isSystemDefined || c.is_system_defined;

              return (
                <button
                  key={c.id || c.key}
                  type="button"
                  className={`sr-category-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedCatId(c.id);
                  }}
                >
                  <div className="sr-cat-text">
                    <strong>{c.name}</strong>
                    <small>{c.key}</small>
                  </div>
                  <div className="sr-cat-meta">
                    {isSys && (
                      <LockKey
                        size={13}
                        style={{ color: '#64748b' }}
                        title="System-defined category"
                      />
                    )}
                    <span className="sr-count-pill">{valuesCount}</span>
                  </div>
                </button>
              );
            })}

            {filteredCategories.length === 0 && (
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: '#94a3b8',
                  fontSize: '12px',
                }}
              >
                No matching categories found.
              </div>
            )}
          </div>

          {canCreateCategory && (
            <div className="sr-add-cat-bar">
              <button
                type="button"
                className="btn small"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setModal({ kind: 'add_category' })}
              >
                <Plus size={15} /> Add Category
              </button>
            </div>
          )}
        </aside>

        {/* Right Column: Active Category Details & Tabs */}
        <div className="sr-main-panel">
          {activeCategory ? (
            <>
              <div className="sr-cat-header">
                <div className="sr-cat-header-title">
                  <div className="sr-module-badge">
                    Module: {activeCategory.module} ·{' '}
                    {activeCategory.isSystemDefined ||
                    activeCategory.is_system_defined
                      ? 'Protected System Category'
                      : 'Admin Category'}
                  </div>
                  <h2>{activeCategory.name}</h2>
                  <p>{activeCategory.description}</p>
                </div>

                <div className="sr-cat-header-key">
                  <code>{activeCategory.key}</code>
                </div>
              </div>

              {/* Tabs Bar */}
              <div className="sr-tabs-bar" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'Values'}
                  className={`sr-tab-btn ${tab === 'Values' ? 'active' : ''}`}
                  onClick={() => setTab('Values')}
                >
                  Values Catalog
                  <span className="sr-tab-badge">
                    {activeCategory.values?.length || 0}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'Org overrides'}
                  className={`sr-tab-btn ${tab === 'Org overrides' ? 'active' : ''}`}
                  onClick={() => setTab('Org overrides')}
                >
                  Organization Overrides
                  <span className="sr-tab-badge">
                    {activeCategory.overrides?.length || 0}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'Audit log'}
                  className={`sr-tab-btn ${tab === 'Audit log' ? 'active' : ''}`}
                  onClick={() => setTab('Audit log')}
                >
                  Audit Trail
                  <span className="sr-tab-badge">{auditLogs.length}</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'Facade'}
                  className={`sr-tab-btn ${tab === 'Facade' ? 'active' : ''}`}
                  onClick={() => setTab('Facade')}
                >
                  Config Facade (API)
                </button>
              </div>

              {/* ─── TAB 1: VALUES CATALOG ───────────────────────── */}
              {tab === 'Values' && (
                <div>
                  <div className="sr-table-wrap">
                    <table className="sr-table">
                      <thead>
                        <tr>
                          <th style={{ width: '80px' }}>Order</th>
                          <th>Key / Slug</th>
                          <th>Display Label</th>
                          <th style={{ width: '100px' }}>Status</th>
                          <th style={{ width: '130px' }}>Protection</th>
                          <th style={{ width: '90px' }}>Default</th>
                          {canConfigure && <th style={{ width: '100px' }}>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {[...(activeCategory.values || [])]
                          .sort(
                            (a, b) =>
                              (a.sortOrder ?? a.sort_order ?? 0) -
                              (b.sortOrder ?? b.sort_order ?? 0)
                          )
                          .map((val, idx, arr) => {
                            const isSys =
                              val.isSystemDefined || val.is_system_defined;
                            const isActive =
                              val.isActive !== undefined
                                ? val.isActive
                                : val.is_active;
                            const isDef =
                              val.isDefault !== undefined
                                ? val.isDefault
                                : val.is_default;
                            const sortNum =
                              val.sortOrder ?? val.sort_order ?? idx + 1;

                            return (
                              <tr key={val.id || val.value}>
                                <td>
                                  <div className="sr-order-controls">
                                    <span style={{ fontWeight: 600, minWidth: '18px' }}>
                                      {sortNum}
                                    </span>
                                    {canReorder && !isSys && (
                                      <>
                                        <button
                                          type="button"
                                          className="sr-order-btn"
                                          disabled={idx === 0}
                                          onClick={() => handleReorder(val, -1)}
                                          title="Move Up"
                                        >
                                          <CaretUp size={12} />
                                        </button>
                                        <button
                                          type="button"
                                          className="sr-order-btn"
                                          disabled={idx === arr.length - 1}
                                          onClick={() => handleReorder(val, 1)}
                                          title="Move Down"
                                        >
                                          <CaretDown size={12} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>

                                <td>
                                  <code>{val.value}</code>
                                </td>

                                <td>
                                  {editingValueId === val.id && canEditValue && !isSys ? (
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      <input
                                        type="text"
                                        className="sr-label-input"
                                        style={{ border: '1px solid #075fc4' }}
                                        value={editingValueLabel}
                                        onChange={(e) =>
                                          setEditingValueLabel(e.target.value)
                                        }
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        className="btn small primary"
                                        onClick={() =>
                                          handleUpdateValue(val, {
                                            label: editingValueLabel.trim(),
                                          })
                                        }
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        className="btn small"
                                        onClick={() => setEditingValueId(null)}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <span style={{ fontWeight: 500 }}>
                                      {val.label}
                                    </span>
                                  )}
                                </td>

                                <td>
                                  <span
                                    className={`sr-status-pill ${
                                      isActive ? 'active' : 'inactive'
                                    }`}
                                  >
                                    {isActive ? 'Active' : 'Inactive'}
                                  </span>
                                </td>

                                <td>
                                  {isSys ? (
                                    <span
                                      className="sr-protected-badge"
                                      title="System-defined: Core platform enum immutable across all tenants."
                                    >
                                      <LockKey size={13} />
                                      System Defined
                                    </span>
                                  ) : (
                                    <span className="sr-custom-badge">
                                      Custom Value
                                    </span>
                                  )}
                                </td>

                                <td>
                                  {isDef ? (
                                    <span
                                      style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: '#075fc4',
                                        background: '#eaf3ff',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                      }}
                                    >
                                      Default
                                    </span>
                                  ) : canConfigure && !isSys ? (
                                    <button
                                      type="button"
                                      className="text-btn"
                                      style={{ fontSize: '11px' }}
                                      onClick={() =>
                                        handleUpdateValue(val, { is_default: true })
                                      }
                                    >
                                      Set default
                                    </button>
                                  ) : (
                                    '—'
                                  )}
                                </td>

                                {canConfigure && (
                                  <td>
                                    {isSys ? (
                                      <span
                                        style={{
                                          fontSize: '11px',
                                          color: '#94a3b8',
                                          fontStyle: 'italic',
                                        }}
                                      >
                                        Protected
                                      </span>
                                    ) : (
                                      <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                          type="button"
                                          className="icon-btn small"
                                          title="Edit label"
                                          onClick={() => {
                                            setEditingValueId(val.id);
                                            setEditingValueLabel(val.label);
                                          }}
                                        >
                                          <NotePencil size={15} />
                                        </button>

                                        {isActive ? (
                                          <button
                                            type="button"
                                            className="icon-btn small"
                                            title="Deactivate value"
                                            style={{ color: '#dc2626' }}
                                            onClick={() =>
                                              setModal({
                                                kind: 'deactivate_value',
                                                value: val,
                                              })
                                            }
                                          >
                                            <Trash size={15} />
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            className="btn small"
                                            style={{ fontSize: '11px' }}
                                            onClick={() =>
                                              handleUpdateValue(val, {
                                                is_active: true,
                                              })
                                            }
                                          >
                                            Reactivate
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  {/* Add Value Card (Platform Admin Only) */}
                  {canCreateValue && (
                    <div className="sr-add-value-card">
                      <h4>Add New Value to {activeCategory.name}</h4>
                      <form
                        onSubmit={handleAddValue}
                        className="sr-add-value-form"
                      >
                        <div className="sr-form-group">
                          <label>Code / Slug *</label>
                          <input
                            type="text"
                            placeholder="e.g. heated_dry_van"
                            value={newValueSlug}
                            onChange={(e) => setNewValueSlug(e.target.value)}
                            required
                          />
                        </div>

                        <div className="sr-form-group" style={{ flex: 1 }}>
                          <label>Display Label *</label>
                          <input
                            type="text"
                            placeholder="e.g. Heated Dry Van (53')"
                            value={newValueLabel}
                            onChange={(e) => setNewValueLabel(e.target.value)}
                            required
                          />
                        </div>

                        <button
                          type="submit"
                          className="btn primary"
                          disabled={addingValue}
                          style={{ height: '36px' }}
                        >
                          <Plus size={16} />
                          {addingValue ? 'Adding…' : 'Add Value'}
                        </button>
                      </form>
                      <p
                        style={{
                          fontSize: '12px',
                          color: '#64748b',
                          margin: '8px 0 0 0',
                        }}
                      >
                        <Info size={13} style={{ verticalAlign: '-1px' }} />{' '}
                        System-defined items are immutable and protected. Custom
                        values can be modified or deactivated by Platform
                        Administrators.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ─── TAB 2: ORGANIZATION OVERRIDES ──────────────── */}
              {tab === 'Org overrides' && (
                <div>
                  <div className="sr-overrides-header">
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>
                        Tenant Organization Extensions
                      </h3>
                      <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                        Overrides take precedence over platform global values for the
                        scoped organization while leaving defaults intact.
                      </p>
                    </div>

                    {canManageOverrides && (
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() =>
                          setModal({
                            kind: 'add_override',
                            category: activeCategory,
                          })
                        }
                      >
                        <Plus size={16} />
                        Add Org Override
                      </button>
                    )}
                  </div>

                  {/* Scoping Indicator */}
                  {isCompanyAdmin && (
                    <div className="sr-org-scope-notice">
                      <Buildings size={16} />
                      <span>
                        Scoped to <strong>{organization.name}</strong> (Organization ID:{' '}
                        {organization.id || 'Current'}). Only overrides belonging to
                        your company are visible or editable.
                      </span>
                    </div>
                  )}

                  {isPlatformAdmin && (
                    <div className="sr-platform-org-bar">
                      <Buildings size={18} style={{ color: '#075fc4', flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>
                        Platform Admin Target Org ID:
                      </span>
                      <input
                        type="number"
                        min="1"
                        value={platformTargetOrgId}
                        onChange={(e) =>
                          setPlatformTargetOrgId(Number(e.target.value) || 1)
                        }
                      />
                      <button
                        type="button"
                        className="btn small"
                        onClick={fetchAllSettings}
                      >
                        Apply Org Filter
                      </button>
                    </div>
                  )}

                  {/* Overrides Table */}
                  {(() => {
                    const displayedOverrides = (activeCategory.overrides || []).filter((ovr) => {
                      if (isCompanyAdmin) {
                        const myOrgId = organization.id || currentOrg?.id;
                        return !ovr.org_id && !ovr.orgId ? true : (Number(ovr.org_id || ovr.orgId) === Number(myOrgId));
                      }
                      if (isPlatformAdmin && platformTargetOrgId) {
                        return !ovr.org_id && !ovr.orgId ? true : (Number(ovr.org_id || ovr.orgId) === Number(platformTargetOrgId));
                      }
                      return true;
                    });

                    const canEditOverride = (ovr) => {
                      if (isPlatformAdmin) return true;
                      if (isCompanyAdmin) {
                        const myOrgId = organization.id || currentOrg?.id;
                        return myOrgId ? Number(ovr.org_id || ovr.orgId) === Number(myOrgId) : false;
                      }
                      return false;
                    };

                    return (
                      <div className="sr-table-wrap">
                        <table className="sr-table">
                          <thead>
                            <tr>
                              <th>Org ID</th>
                              <th>Category</th>
                              <th>Value Slug</th>
                              <th>Custom Label</th>
                              <th>Sort Order</th>
                              <th>Status</th>
                              {canManageOverrides && <th>Action</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {displayedOverrides.length > 0 ? (
                              displayedOverrides.map((ovr) => (
                                <tr key={ovr.id || ovr.value}>
                                  <td>
                                    <strong>#{ovr.org_id || ovr.orgId}</strong>
                                  </td>
                                  <td>{activeCategory.name}</td>
                                  <td>
                                    <code>{ovr.value}</code>
                                  </td>
                                  <td>
                                    <strong style={{ color: '#075fc4' }}>
                                      {ovr.label}
                                    </strong>
                                  </td>
                                  <td>{ovr.sort_order ?? ovr.sortOrder ?? 1}</td>
                                  <td>
                                    <span
                                      className={`sr-status-pill ${
                                        ovr.is_active ?? ovr.isActive ? 'active' : 'inactive'
                                      }`}
                                    >
                                      {ovr.is_active ?? ovr.isActive
                                        ? 'Active Override'
                                        : 'Inactive'}
                                    </span>
                                  </td>
                                  {canManageOverrides && (
                                    <td>
                                      {canEditOverride(ovr) ? (
                                        <button
                                          type="button"
                                          className="btn small"
                                          onClick={() =>
                                            setModal({
                                              kind: 'edit_override',
                                              override: ovr,
                                            })
                                          }
                                        >
                                          Edit
                                        </button>
                                      ) : (
                                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                          Read-only
                                        </span>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td
                                  colSpan={canManageOverrides ? 7 : 6}
                                  style={{
                                    textAlign: 'center',
                                    padding: '36px',
                                    color: '#94a3b8',
                                  }}
                                >
                                  <Buildings size={30} style={{ margin: '0 auto 8px' }} />
                                  <p style={{ margin: 0 }}>
                                    No active overrides configured for{' '}
                                    <strong>{activeCategory.name}</strong>.
                                  </p>
                                  <small>
                                    Global system values are currently used by all
                                    organizations.
                                  </small>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ─── TAB 3: AUDIT TRAIL ─────────────────────────── */}
              {tab === 'Audit log' && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '16px',
                    }}
                  >
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>
                        System Settings Audit Trail
                      </h3>
                      <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                        Immutable compliance record of all category, value, and
                        override changes.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="btn small"
                      onClick={fetchAuditLogs}
                      disabled={auditLoading}
                    >
                      <ArrowClockwise
                        size={14}
                        className={auditLoading ? 'spin' : ''}
                      />
                      Refresh Log
                    </button>
                  </div>

                  <div className="sr-table-wrap">
                    <table className="sr-table sr-audit-table">
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Action</th>
                          <th>Target Type</th>
                          <th>Target ID</th>
                          <th>Changed By</th>
                          <th>Change Diff Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.length > 0 ? (
                          auditLogs.map((log) => (
                            <tr key={log.id}>
                              <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                                {formatDate(log.changed_at || log.created_at)}
                              </td>

                              <td>
                                <span className={actionChipClass(log.action)}>
                                  {log.action}
                                </span>
                              </td>

                              <td>
                                <code>{log.target_type || 'setting_value'}</code>
                              </td>

                              <td>#{log.target_id || log.setting_value_id}</td>

                              <td>
                                <div>
                                  <strong>
                                    {log.user?.name || `User #${log.changed_by}`}
                                  </strong>
                                  {log.user?.email && (
                                    <div
                                      style={{
                                        fontSize: '11px',
                                        color: '#64748b',
                                      }}
                                    >
                                      {log.user.email}
                                    </div>
                                  )}
                                </div>
                              </td>

                              <td>
                                <div className="sr-diff-box">
                                  {log.old_value && log.new_value ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                      <div><span style={{ color: '#dc2626', fontWeight: 600 }}>Old:</span> {typeof log.old_value === 'object' ? JSON.stringify(log.old_value) : String(log.old_value)}</div>
                                      <div><span style={{ color: '#16a34a', fontWeight: 600 }}>New:</span> {typeof log.new_value === 'object' ? JSON.stringify(log.new_value) : String(log.new_value)}</div>
                                    </div>
                                  ) : log.new_value ? (
                                    <div><span style={{ color: '#16a34a', fontWeight: 600 }}>New:</span> {typeof log.new_value === 'object' ? JSON.stringify(log.new_value) : String(log.new_value)}</div>
                                  ) : log.old_value ? (
                                    <div><span style={{ color: '#dc2626', fontWeight: 600 }}>Old:</span> {typeof log.old_value === 'object' ? JSON.stringify(log.old_value) : String(log.old_value)}</div>
                                  ) : (
                                    'No payload diff'
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={6}
                              style={{
                                textAlign: 'center',
                                padding: '40px',
                                color: '#94a3b8',
                              }}
                            >
                              <Clock size={32} style={{ margin: '0 auto 8px' }} />
                              <p style={{ margin: 0 }}>
                                No audit log records found.
                              </p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ─── TAB 4: FACADE (CONFIG MAP) ────────────────── */}
              {tab === 'Facade' && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '16px',
                    }}
                  >
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>
                        Aggregated Admin Configuration Facade
                      </h3>
                      <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                        Real-time schema map exposed via{' '}
                        <code>GET /v1/admin/config</code> for PDF and service
                        consumption.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        if (configData) {
                          navigator.clipboard.writeText(
                            JSON.stringify(configData, null, 2)
                          );
                          setCopiedConfig(true);
                          setTimeout(() => setCopiedConfig(false), 2000);
                        }
                      }}
                    >
                      {copiedConfig ? (
                        <>
                          <Check size={16} /> Copied JSON
                        </>
                      ) : (
                        <>
                          <Copy size={16} /> Copy JSON
                        </>
                      )}
                    </button>
                  </div>

                  <div className="sr-facade-panel">
                    <pre style={{ margin: 0 }}>
                      {configData
                        ? JSON.stringify(configData, null, 2)
                        : '// Loading configuration facade from /v1/admin/config…'}
                    </pre>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: '#64748b',
              }}
            >
              <GearSix size={40} style={{ margin: '0 auto 12px', color: '#cbd5e1' }} />
              <h3>Select a category from the sidebar</h3>
              <p>
                Browse equipment types, accessorial charges, cutoff rules, or
                organization extensions.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ─── MODAL: CREATE CATEGORY ────────────────────────────── */}
      {modal?.kind === 'add_category' && (
        <ModalShell
          title="Create New Setting Category"
          onClose={() => setModal(null)}
        >
          <form onSubmit={handleCreateCategory} style={{ padding: '4px 0' }}>
            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Module Group *
              </label>
              <select
                value={newCatModule}
                onChange={(e) => setNewCatModule(e.target.value)}
                style={{ width: '100%', height: '36px', padding: '0 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                <option value="equipment">equipment</option>
                <option value="quoting">quoting</option>
                <option value="billing">billing</option>
                <option value="shipment">shipment</option>
                <option value="operations">operations</option>
                <option value="compliance">compliance</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Category Key (dot-separated) *
              </label>
              <input
                type="text"
                placeholder="e.g. customs.declaration_type"
                value={newCatKey}
                onChange={(e) => setNewCatKey(e.target.value)}
                required
                style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Category Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Customs Declaration Type"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                required
                style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Description
              </label>
              <textarea
                rows={3}
                placeholder="Describe the operational purpose of this setting category..."
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setModal(null)}
                disabled={creatingCat}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn primary"
                disabled={creatingCat}
              >
                {creatingCat ? 'Creating…' : 'Create Category'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* ─── MODAL: DEACTIVATE VALUE CONFIRMATION ──────────────── */}
      {modal?.kind === 'deactivate_value' && (
        <ModalShell
          title="Confirm Value Deactivation"
          onClose={() => setModal(null)}
        >
          <div style={{ padding: '8px 0' }}>
            <p style={{ margin: '0 0 12px 0', fontSize: '14px', lineHeight: 1.5 }}>
              Are you sure you want to deactivate the setting value{' '}
              <strong>"{modal.value?.label}"</strong> (
              <code>{modal.value?.value}</code>)?
            </p>
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748b', lineHeight: 1.4 }}>
              Deactivating will exclude this option from new shipment bookings, quotes,
              and load selections. Historical records will retain their references.
            </p>

            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
                onClick={() => handleDeactivateValue(modal.value)}
              >
                Deactivate Value
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* ─── MODAL: ADD / EDIT OVERRIDE ────────────────────────── */}
      {(modal?.kind === 'add_override' || modal?.kind === 'edit_override') && (
        <OverrideModal
          isEdit={modal.kind === 'edit_override'}
          override={modal.override}
          category={activeCategory}
          isPlatformAdmin={isPlatformAdmin}
          targetOrgId={isPlatformAdmin ? platformTargetOrgId : organization.id}
          orgName={organization.name}
          onClose={() => setModal(null)}
          onSubmit={modal.kind === 'edit_override'
            ? (patch) => handleUpdateOverride(modal.override.id, patch)
            : handleCreateOverride}
        />
      )}
    </section>
  );
}

/* ─── Sub-component: Override Form Modal ───────────────────────── */
function OverrideModal({
  isEdit,
  override,
  category,
  isPlatformAdmin,
  targetOrgId,
  orgName,
  onClose,
  onSubmit,
}) {
  const [value, setValue] = useState(override?.value || '');
  const [label, setLabel] = useState(override?.label || '');
  const [sortOrder, setSortOrder] = useState(
    override?.sort_order ?? override?.sortOrder ?? 1
  );
  const [orgIdInput, setOrgIdInput] = useState(
    override?.org_id || override?.orgId || targetOrgId || 1
  );
  const [isActive, setIsActive] = useState(
    override ? (override.is_active ?? override.isActive ?? true) : true
  );
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!label.trim()) return;

    setSubmitting(true);
    if (isEdit) {
      onSubmit({
        label: label.trim(),
        sort_order: Number(sortOrder),
        is_active: isActive,
      });
    } else {
      onSubmit({
        category_id: category.id,
        org_id: isPlatformAdmin ? Number(orgIdInput) : undefined,
        value: value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        label: label.trim(),
        sort_order: Number(sortOrder),
        is_active: true,
      });
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Organization Override' : 'Create Organization Override'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} style={{ padding: '6px 0' }}>
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
            Target Organization
          </label>
          {isPlatformAdmin ? (
            <input
              type="number"
              min="1"
              disabled={isEdit}
              value={orgIdInput}
              onChange={(e) => setOrgIdInput(e.target.value)}
              style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
          ) : (
            <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
              <strong>{orgName}</strong> (ID: {targetOrgId})
            </div>
          )}
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
            Setting Category
          </label>
          <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
            <strong>{category.name}</strong> (<code>{category.key}</code>)
          </div>
        </div>

        {!isEdit && (
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Override Value Slug *
            </label>
            <input
              type="text"
              placeholder="e.g. customized_dry_van"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
          </div>
        )}

        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
            Custom Display Label *
          </label>
          <input
            type="text"
            placeholder="e.g. 53' Standard High-Cube Van"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Sort Order
            </label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
          </div>

          {isEdit && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Status
              </label>
              <select
                value={isActive ? 'true' : 'false'}
                onChange={(e) => setIsActive(e.target.value === 'true')}
                style={{ width: '100%', height: '36px', padding: '0 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : isEdit ? 'Update Override' : 'Create Override'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
