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
  ArrowsDownUp,
  DownloadSimple,
  UploadSimple,
  FileCsv,
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
  exportSettingsJSON,
  exportSettingsCSV,
  importSettings,
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

function parseAuditPayload(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  return val;
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
  const [tab, setTab] = useState('Values'); // 'Values' | 'Org overrides' | 'Audit log'
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
  const [selectedAuditDiff, setSelectedAuditDiff] = useState(null);

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
    }
  }, [tab, fetchAuditLogs]);

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
            SYSTEM SETTINGS (M17) · CONFIGURATION REGISTRY
          </div>
          <h1>Settings</h1>
          <p>
            Administrators manage configurable system categories, default operational values, and organization-specific overrides across the freight platform.
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
            <ArrowClockwise size={15} className={loading ? 'spin' : ''} />
            Refresh
          </button>

          {canConfigure && (
            <button
              type="button"
              className="btn"
              onClick={() => setModal({ kind: 'import_export' })}
              title="Bulk import or export settings configuration (M17 FR-17.10)"
            >
              <ArrowsDownUp size={15} />
              Import / Export
            </button>
          )}

          {canCreateCategory && (
            <button
              type="button"
              className="btn primary"
              onClick={() => setModal({ kind: 'add_category' })}
            >
              <Plus size={15} />
              New Category
            </button>
          )}

          <span className="sr-role-pill">
            <ShieldCheck size={14} />
            {resolvedRole || 'User'}
          </span>
        </div>
      </div>

      {/* ─── Compact Operational Summary Strip ─────────────────── */}
      <div className="sr-summary-bar">
        <div className="sr-summary-item">
          <span className="sr-summary-label">Configured Categories</span>
          <strong className="sr-summary-val">{categories.length}</strong>
        </div>
        <div className="sr-summary-divider" />
        <div className="sr-summary-item">
          <span className="sr-summary-label">Values in Category</span>
          <strong className="sr-summary-val">
            {activeCategory?.values?.filter((v) => v.isActive || v.is_active).length || 0}
            <span style={{ color: '#64748b', fontWeight: 500, fontSize: '12px', marginLeft: '3px' }}>
              active / {activeCategory?.values?.length || 0} total
            </span>
          </strong>
        </div>
        <div className="sr-summary-divider" />
        <div className="sr-summary-item">
          <span className="sr-summary-label">Protected System Values</span>
          <strong className="sr-summary-val">
            {activeCategory?.values?.filter(
              (v) => v.isSystemDefined || v.is_system_defined
            ).length || 0}
          </strong>
        </div>
        <div className="sr-summary-divider" />
        <div className="sr-summary-item">
          <span className="sr-summary-label">Active Org Overrides</span>
          <strong className="sr-summary-val">
            {activeCategory?.overrides?.filter((o) => o.is_active || o.isActive).length || 0}
          </strong>
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
              </div>

              {/* ─── TAB 1: VALUES CATALOG ───────────────────────── */}
              {tab === 'Values' && (
                <div>
                  <div className="sr-table-wrap">
                    <table className="sr-table">
                      <thead>
                        <tr>
                          <th style={{ width: '80px' }}>Order</th>
                          <th style={{ width: '160px' }}>Value Code</th>
                          <th>Display Label</th>
                          <th style={{ width: '100px' }}>Status</th>
                          <th style={{ width: '140px' }}>Type</th>
                          <th style={{ width: '90px' }}>Default</th>
                          {canConfigure && <th style={{ width: '110px' }}>Actions</th>}
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
                                        style={{ border: '1px solid #005fdc' }}
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
                                    <span className="sr-default-badge">
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
                                      <span className="sr-protected-text">
                                        <LockKey size={12} />
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

                        {(!activeCategory.values || activeCategory.values.length === 0) && (
                          <tr>
                            <td
                              colSpan={canConfigure ? 7 : 6}
                              style={{
                                textAlign: 'center',
                                padding: '36px 16px',
                                color: '#94a3b8',
                              }}
                            >
                              <GearSix size={32} style={{ margin: '0 auto 8px', color: '#cbd5e1' }} />
                              <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#475569' }}>
                                No values configured for {activeCategory.name}
                              </p>
                              <small style={{ color: '#94a3b8' }}>
                                Use the form below to add initial custom values to this category.
                              </small>
                            </td>
                          </tr>
                        )}
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
                  <div className="sr-overrides-hierarchy-banner">
                    <Info size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <div>
                      <strong>Additive Tenant Scoping:</strong> Organization overrides are tenant-scoped configurations that take precedence over platform global values for your organization while leaving default platform configurations intact for all other tenants. Consuming modules resolve system defaults first, then apply active tenant overrides.
                    </div>
                  </div>

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
                          <th>Change Details</th>
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
                                <button
                                  type="button"
                                  className="sr-diff-trigger-btn"
                                  onClick={() => setSelectedAuditDiff(log)}
                                  title="View audit change details"
                                >
                                  <Eye size={13} />
                                  <span>View details</span>
                                </button>
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

      {/* ─── MODAL: IMPORT / EXPORT (FR-17.10) ─────────────── */}
      {modal?.kind === 'import_export' && canConfigure && (
        <ImportExportModal
          canConfigure={canConfigure}
          onClose={() => setModal(null)}
          onSuccess={async () => {
            await fetchAllSettings();
            await fetchAuditLogs();
          }}
          notify={notify}
        />
      )}

      {/* ─── MODAL: AUDIT CHANGE DETAILS ──────────────────────── */}
      {selectedAuditDiff && (
        <ChangeDiffModal
          log={selectedAuditDiff}
          categories={categories}
          onClose={() => setSelectedAuditDiff(null)}
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

/* ─── Sub-component: Audit Trail Change Diff Modal ─────────────── */
function ChangeDiffModal({ log, categories = [], onClose }) {
  if (!log) return null;

  const oldParsed = parseAuditPayload(log.old_value);
  const newParsed = parseAuditPayload(log.new_value);
  const hasDiffData = oldParsed !== null || newParsed !== null;

  function formatKeyLabel(key) {
    if (!key) return '';
    const lower = String(key).toLowerCase();
    if (lower === 'org_id' || lower === 'orgid' || lower === 'organization_id') return 'Organization';
    if (lower === 'category_id' || lower === 'categoryid') return 'Category';
    if (lower === 'is_active' || lower === 'isactive') return 'Active';
    if (lower === 'sort_order' || lower === 'sortorder') return 'Sort Order';
    if (lower === 'setting_value_id') return 'Setting Value ID';
    if (lower === 'created_at' || lower === 'createdat') return 'Created At';
    if (lower === 'updated_at' || lower === 'updatedat') return 'Updated At';
    return String(key)
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatHumanValue(val) {
    if (val === null || val === undefined) {
      return <span className="sr-diff-val-empty">—</span>;
    }
    if (typeof val === 'boolean') {
      return (
        <span className={`sr-diff-val-bool ${val ? 'true' : 'false'}`}>
          {val ? 'Yes' : 'No'}
        </span>
      );
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return <span className="sr-diff-val-empty">Empty list</span>;
      const allPrimitives = val.every((v) => typeof v !== 'object' || v === null);
      if (allPrimitives) {
        return val.map((v) => (v === null ? 'null' : String(v))).join(', ');
      }
      return <code className="sr-diff-code-inline">{JSON.stringify(val)}</code>;
    }
    if (typeof val === 'object') {
      try {
        return <code className="sr-diff-code-inline">{JSON.stringify(val)}</code>;
      } catch {
        return String(val);
      }
    }
    return String(val);
  }

  const isOldObj =
    oldParsed !== null && typeof oldParsed === 'object' && !Array.isArray(oldParsed);
  const isNewObj =
    newParsed !== null && typeof newParsed === 'object' && !Array.isArray(newParsed);
  const isObjectDiff = isOldObj || isNewObj;

  // Resolve property keys for breakdown table
  let fieldKeys = [];
  if (isObjectDiff) {
    const keysSet = new Set([
      ...Object.keys(oldParsed || {}),
      ...Object.keys(newParsed || {}),
    ]);
    fieldKeys = Array.from(keysSet);
  }

  // Resolve associated category information
  const targetId = log.target_id ?? log.setting_value_id;
  const targetType = (log.target_type || '').toLowerCase();

  const explicitCatId =
    log.category_id ??
    log.target_category_id ??
    (typeof newParsed === 'object' ? (newParsed?.category_id ?? newParsed?.categoryId) : null) ??
    (typeof oldParsed === 'object' ? (oldParsed?.category_id ?? oldParsed?.categoryId) : null);

  const explicitCatKey =
    log.category_key ??
    log.target_category_key ??
    (typeof newParsed === 'object' ? (newParsed?.category_key ?? newParsed?.categoryKey) : null) ??
    (typeof oldParsed === 'object' ? (oldParsed?.category_key ?? oldParsed?.categoryKey) : null) ??
    (typeof newParsed === 'object' && typeof newParsed?.category === 'string' ? newParsed.category : null) ??
    (typeof oldParsed === 'object' && typeof oldParsed?.category === 'string' ? oldParsed.category : null);

  const resolvedCategory =
    (explicitCatId ? categories.find((c) => c.id === explicitCatId || String(c.id) === String(explicitCatId)) : null) ||
    (explicitCatKey ? categories.find((c) => c.key === explicitCatKey) : null) ||
    (targetType === 'setting_category' ? categories.find((c) => c.id === targetId || c.key === targetId) : null) ||
    (targetType === 'override' && targetId ? categories.find((c) => (c.overrides || []).some((o) => o.id === targetId || String(o.id) === String(targetId))) : null) ||
    (targetId ? categories.find((c) => (c.values || []).some((v) => v.id === targetId || String(v.id) === String(targetId))) : null) ||
    (log.category && typeof log.category === 'object' ? log.category : null);

  const categoryName =
    resolvedCategory?.name ||
    (typeof log.category === 'string' && !log.category.includes('.') ? log.category : null) ||
    (log.category_name ?? null);

  const categoryKey =
    resolvedCategory?.key ||
    explicitCatKey ||
    (typeof log.category === 'string' && log.category.includes('.') ? log.category : null);

  function getFieldStatus(key) {
    const inOld = oldParsed && Object.prototype.hasOwnProperty.call(oldParsed, key);
    const inNew = newParsed && Object.prototype.hasOwnProperty.call(newParsed, key);
    if (!inOld && inNew) {
      return { type: 'added', label: 'Added', className: 'sr-diff-tag added' };
    }
    if (inOld && !inNew) {
      return { type: 'removed', label: 'Removed', className: 'sr-diff-tag removed' };
    }
    const valOldStr = JSON.stringify(oldParsed[key]);
    const valNewStr = JSON.stringify(newParsed[key]);
    if (valOldStr !== valNewStr) {
      return { type: 'modified', label: 'Modified', className: 'sr-diff-tag modified' };
    }
    return { type: 'unchanged', label: 'Unchanged', className: 'sr-diff-tag unchanged' };
  }

  function renderVal(val) {
    if (val === null || val === undefined) {
      return <span className="sr-diff-val-empty">null</span>;
    }
    if (typeof val === 'boolean') {
      return (
        <span className={`sr-diff-val-bool ${val ? 'true' : 'false'}`}>
          {val ? 'true' : 'false'}
        </span>
      );
    }
    if (typeof val === 'object') {
      return (
        <code className="sr-diff-code-inline">{JSON.stringify(val)}</code>
      );
    }
    return <span className="sr-diff-val-text">{String(val)}</span>;
  }

  return (
    <ModalShell title="Audit Change Details" onClose={onClose} wide={true}>
      <div className="sr-diff-modal-body">
        {/* Metadata Summary Header */}
        <div className="sr-diff-meta-grid">
          <div className="sr-diff-meta-item">
            <span className="sr-diff-meta-label">Timestamp</span>
            <span className="sr-diff-meta-value">
              {formatDate(log.changed_at || log.created_at)}
            </span>
          </div>

          <div className="sr-diff-meta-item">
            <span className="sr-diff-meta-label">Action</span>
            <span className="sr-diff-meta-value">
              <span className={actionChipClass(log.action)}>
                {log.action}
              </span>
            </span>
          </div>

          <div className="sr-diff-meta-item">
            <span className="sr-diff-meta-label">Target Entity</span>
            <span className="sr-diff-meta-value">
              <code>{log.target_type || 'setting_value'}</code> #{log.target_id || log.setting_value_id || '—'}
            </span>
          </div>

          <div className="sr-diff-meta-item">
            <span className="sr-diff-meta-label">System Category</span>
            <span className="sr-diff-meta-value">
              {categoryName && categoryKey ? (
                <>
                  <strong className="sr-diff-cat-name">{categoryName}</strong>
                  <span className="sr-diff-cat-key">{categoryKey}</span>
                </>
              ) : categoryName ? (
                <strong className="sr-diff-cat-name">{categoryName}</strong>
              ) : categoryKey ? (
                <span className="sr-diff-cat-key">{categoryKey}</span>
              ) : (
                <span className="sr-diff-val-empty">Category unavailable</span>
              )}
            </span>
          </div>

          <div className="sr-diff-meta-item">
            <span className="sr-diff-meta-label">Performed By</span>
            <span className="sr-diff-meta-value">
              <strong>
                {log.user?.name || (log.changed_by ? `User #${log.changed_by}` : 'System')}
              </strong>
              {log.user?.email && (
                <span className="sr-diff-meta-sub">{log.user.email}</span>
              )}
            </span>
          </div>

          {(log.org_id || log.organization_id) && (
            <div className="sr-diff-meta-item">
              <span className="sr-diff-meta-label">Scope / Org</span>
              <span className="sr-diff-meta-value">
                Organization #{log.org_id || log.organization_id}
              </span>
            </div>
          )}
        </div>

        {/* Change Comparison Content */}
        {!hasDiffData ? (
          <div className="sr-diff-empty-state">
            <Clock size={36} style={{ color: '#94a3b8', margin: '0 auto 8px' }} />
            <p className="sr-diff-empty-title">
              No detailed change information is available for this audit record.
            </p>
            <span className="sr-diff-empty-sub">
              This action was logged without explicit before/after payload snapshots.
            </span>
          </div>
        ) : (
          <div className="sr-diff-content">
            {/* Side-by-Side Before vs After Panels */}
            <div className="sr-diff-panels">
              <div className="sr-diff-panel before">
                <div className="sr-diff-panel-header">
                  <span className="sr-diff-panel-title">Before (Previous State)</span>
                  {oldParsed === null && (
                    <span className="sr-diff-panel-pill">Initial Record Creation</span>
                  )}
                </div>
                <div className="sr-diff-panel-body">
                  {oldParsed === null || oldParsed === undefined ? (
                    <div className="sr-diff-empty-panel">
                      No previous state exists (new item was created)
                    </div>
                  ) : typeof oldParsed === 'object' ? (
                    <div className="sr-diff-summary-list">
                      {Object.entries(oldParsed).map(([key, val]) => (
                        <div key={key} className="sr-diff-summary-row">
                          <span className="sr-diff-summary-key">{formatKeyLabel(key)}</span>
                          <span className="sr-diff-summary-val">{formatHumanValue(val)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="sr-diff-summary-list">
                      <div className="sr-diff-summary-row">
                        <span className="sr-diff-summary-key">Value</span>
                        <span className="sr-diff-summary-val">{String(oldParsed)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="sr-diff-panel after">
                <div className="sr-diff-panel-header">
                  <span className="sr-diff-panel-title">After (New State)</span>
                  {newParsed === null && (
                    <span className="sr-diff-panel-pill warn">Record Removed / Deactivated</span>
                  )}
                </div>
                <div className="sr-diff-panel-body">
                  {newParsed === null || newParsed === undefined ? (
                    <div className="sr-diff-empty-panel">
                      No new state exists (item deactivated or deleted)
                    </div>
                  ) : typeof newParsed === 'object' ? (
                    <div className="sr-diff-summary-list">
                      {Object.entries(newParsed).map(([key, val]) => (
                        <div key={key} className="sr-diff-summary-row">
                          <span className="sr-diff-summary-key">{formatKeyLabel(key)}</span>
                          <span className="sr-diff-summary-val">{formatHumanValue(val)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="sr-diff-summary-list">
                      <div className="sr-diff-summary-row">
                        <span className="sr-diff-summary-key">Value</span>
                        <span className="sr-diff-summary-val">{String(newParsed)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Property-by-Property Breakdown Table */}
            {isObjectDiff && fieldKeys.length > 0 && (
              <div className="sr-diff-fields-section">
                <div className="sr-diff-fields-header">
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--ink, #102247)' }}>
                    Property-Level Breakdown
                  </h4>
                  <span className="sr-diff-fields-count">
                    {fieldKeys.length} {fieldKeys.length === 1 ? 'property' : 'properties'} evaluated
                  </span>
                </div>

                <div className="sr-table-wrap" style={{ marginTop: '10px' }}>
                  <table className="sr-table sr-diff-table">
                    <thead>
                      <tr>
                        <th style={{ width: '180px' }}>Property</th>
                        <th style={{ width: '110px' }}>Status</th>
                        <th>Before</th>
                        <th>After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fieldKeys.map((key) => {
                        const status = getFieldStatus(key);
                        const vOld =
                          oldParsed && Object.prototype.hasOwnProperty.call(oldParsed, key)
                            ? oldParsed[key]
                            : undefined;
                        const vNew =
                          newParsed && Object.prototype.hasOwnProperty.call(newParsed, key)
                            ? newParsed[key]
                            : undefined;

                        return (
                          <tr key={key} className={`sr-diff-row ${status.type}`}>
                            <td>
                              <code className="sr-diff-prop-code">{key}</code>
                            </td>
                            <td>
                              <span className={status.className}>{status.label}</span>
                            </td>
                            <td className="sr-diff-cell before">
                              {vOld !== undefined ? (
                                renderVal(vOld)
                              ) : (
                                <span className="sr-diff-val-empty">—</span>
                              )}
                            </td>
                            <td className="sr-diff-cell after">
                              {vNew !== undefined ? (
                                renderVal(vNew)
                              ) : (
                                <span className="sr-diff-val-empty">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Actions Footer */}
        <div
          className="modal-actions"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '20px',
            paddingTop: '14px',
            borderTop: '1px solid #e2e8f0',
          }}
        >
          <button type="button" className="btn primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ─── Sub-component: Import / Export Modal (FR-17.10) ────────── */
function ImportExportModal({ onClose, onSuccess, notify, canConfigure = true }) {
  if (!canConfigure) {
    return (
      <ModalShell title="Access Denied" onClose={onClose}>
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <WarningCircle size={36} color="#dc2626" style={{ marginBottom: '12px' }} />
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#0f172a' }}>
            Administrative Privileges Required
          </h3>
          <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
            Bulk import and export of system configuration is restricted strictly to Platform Administrators.
          </p>
          <button type="button" className="btn primary" onClick={onClose}>
            Close
          </button>
        </div>
      </ModalShell>
    );
  }

  const [activeTab, setActiveTab] = useState('export'); // 'export' | 'import'

  // Export state
  const [exporting, setExporting] = useState(null); // 'json' | 'csv' | null
  const [exportError, setExportError] = useState(null);

  // Import state
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [importSummary, setImportSummary] = useState(null);
  const fileInputRef = useRef(null);

  // Handle Export
  const handleExport = async (format) => {
    try {
      setExporting(format);
      setExportError(null);
      const res = format === 'csv' ? await exportSettingsCSV() : await exportSettingsJSON();
      const blob = res?.blob || res;
      const contentDisposition = res?.contentDisposition;
      let filename = `settings-export-${new Date().toISOString().slice(0, 10)}.${format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
        if (match && match[1]) {
          filename = decodeURIComponent(match[1]);
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (notify) notify(`Settings exported as ${format.toUpperCase()} (${filename}).`);
    } catch (err) {
      console.error('Settings export failed:', err);
      setExportError(err.message || `Failed to export settings as ${format.toUpperCase()}.`);
    } finally {
      setExporting(null);
    }
  };

  // Handle File Selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file) => {
    setImportError(null);
    setValidationErrors([]);
    setImportSummary(null);

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'json' && ext !== 'csv') {
      setImportError('Invalid file format. Please select a .json or .csv configuration file.');
      setSelectedFile(null);
      return;
    }

    if (file.size === 0) {
      setImportError('The selected configuration file is empty.');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setConfirmed(false);
    setImportError(null);
    setValidationErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle Import Submit
  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    try {
      setImporting(true);
      setImportError(null);
      setValidationErrors([]);
      setImportSummary(null);

      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await importSettings(formData);

      if (response && response.success) {
        setImportSummary(response.summary || {});
        if (notify) notify('Settings imported successfully.');
        if (onSuccess) {
          await onSuccess();
        }
      } else {
        setImportError(response?.message || 'Import completed with warnings.');
      }
    } catch (err) {
      console.error('Settings import failed:', err);
      const data = err.data;
      const errorMsg = data?.message || data?.error || err.message || 'Import failed. Please review your file formatting and M17 rules.';
      setImportError(errorMsg);
      if (Array.isArray(data?.errors)) {
        setValidationErrors(data.errors);
      }
    } finally {
      setImporting(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <ModalShell
      title="Import / Export Settings (FR-17.10)"
      onClose={onClose}
      wide={true}
    >
      <div className="sr-import-export-container">
        {/* Navigation Tabs */}
        <div className="sr-ie-tabs" role="tablist">
          <button
            type="button"
            className={`sr-ie-tab ${activeTab === 'export' ? 'active' : ''}`}
            onClick={() => setActiveTab('export')}
            role="tab"
            aria-selected={activeTab === 'export'}
          >
            <DownloadSimple size={16} />
            Export Settings
          </button>
          <button
            type="button"
            className={`sr-ie-tab ${activeTab === 'import' ? 'active' : ''}`}
            onClick={() => setActiveTab('import')}
            role="tab"
            aria-selected={activeTab === 'import'}
          >
            <UploadSimple size={16} />
            Bulk Import
          </button>
        </div>

        {/* ─── TAB: EXPORT ─── */}
        {activeTab === 'export' && (
          <div className="sr-ie-content">
            <div className="sr-ie-desc-box">
              <p>
                Export the live catalog of system setting categories, operational values,
                sort orders, and system flags directly from the PostgreSQL database.
              </p>
            </div>

            {exportError && (
              <div className="sr-ie-error-banner" role="alert">
                <WarningCircle size={18} />
                <span>{exportError}</span>
              </div>
            )}

            <div className="sr-export-grid">
              {/* JSON Export Card */}
              <div className="sr-export-card">
                <div className="sr-export-card-header">
                  <div className="sr-export-icon-wrapper json">
                    <FileText size={24} weight="bold" />
                  </div>
                  <div>
                    <h3 className="sr-export-card-title">JSON Configuration</h3>
                    <span className="sr-export-badge">Structured Catalog</span>
                  </div>
                </div>
                <p className="sr-export-card-desc">
                  Full hierarchical structure containing module groups, category keys, labels,
                  system flags, and value arrays. Recommended for backups, environment migrations, and platform deployments.
                </p>
                <div className="sr-export-card-meta">
                  <span>MIME: <code>application/json</code></span>
                  <span>Schema: M17 v1.0 JSON</span>
                </div>
                <button
                  type="button"
                  className="btn primary sr-export-btn"
                  onClick={() => handleExport('json')}
                  disabled={exporting !== null}
                >
                  {exporting === 'json' ? (
                    <>
                      <ArrowClockwise size={16} className="spin" />
                      Generating JSON...
                    </>
                  ) : (
                    <>
                      <DownloadSimple size={16} />
                      Export as JSON
                    </>
                  )}
                </button>
              </div>

              {/* CSV Export Card */}
              <div className="sr-export-card">
                <div className="sr-export-card-header">
                  <div className="sr-export-icon-wrapper csv">
                    <FileCsv size={24} weight="bold" />
                  </div>
                  <div>
                    <h3 className="sr-export-card-title">CSV Spreadsheet</h3>
                    <span className="sr-export-badge">Tabular Format</span>
                  </div>
                </div>
                <p className="sr-export-card-desc">
                  Flat tabular rows compatible with Microsoft Excel, Google Sheets, and ETL pipelines.
                  Includes category module, key, name, value, label, sort order, and flags.
                </p>
                <div className="sr-export-card-meta">
                  <span>MIME: <code>text/csv</code></span>
                  <span>Columns: 9 Standard Fields</span>
                </div>
                <button
                  type="button"
                  className="btn sr-export-btn"
                  onClick={() => handleExport('csv')}
                  disabled={exporting !== null}
                >
                  {exporting === 'csv' ? (
                    <>
                      <ArrowClockwise size={16} className="spin" />
                      Generating CSV...
                    </>
                  ) : (
                    <>
                      <DownloadSimple size={16} />
                      Export as CSV
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="sr-ie-info-callout">
              <Info size={18} />
              <div>
                <strong>Database Synchronization & Real-time Records</strong>
                <p>
                  Exports are queried directly from the NeonDB/PostgreSQL database via <code>GET /v1/admin/settings/export</code>.
                  System-defined categories and default operational flags are preserved.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB: IMPORT ─── */}
        {activeTab === 'import' && (
          <div className="sr-ie-content">
            <div className="sr-ie-desc-box">
              <p>
                Upload a JSON or CSV file to create new setting categories or operational values,
                and update non-system records. All changes are verified against M17 schema rules.
              </p>
            </div>

            {/* Success Summary Banner (Check 9) */}
            {importSummary && (
              <div className="sr-ie-success-card">
                <div className="sr-ie-success-header">
                  <CheckCircle size={24} weight="fill" className="sr-success-icon" />
                  <div>
                    <h4>Import completed</h4>
                    <p>Settings imported successfully and synchronized with the database.</p>
                  </div>
                </div>

                <div className="sr-import-summary-grid">
                  {importSummary.categoriesCreated !== undefined && (
                    <div className="sr-summary-stat">
                      <span className="stat-label">Categories created</span>
                      <span className="stat-value">{importSummary.categoriesCreated}</span>
                    </div>
                  )}
                  {importSummary.categoriesUpdated !== undefined && (
                    <div className="sr-summary-stat">
                      <span className="stat-label">Categories updated</span>
                      <span className="stat-value">{importSummary.categoriesUpdated}</span>
                    </div>
                  )}
                  {importSummary.valuesCreated !== undefined && (
                    <div className="sr-summary-stat">
                      <span className="stat-label">Values created</span>
                      <span className="stat-value">{importSummary.valuesCreated}</span>
                    </div>
                  )}
                  {importSummary.valuesUpdated !== undefined && (
                    <div className="sr-summary-stat">
                      <span className="stat-label">Values updated</span>
                      <span className="stat-value">{importSummary.valuesUpdated}</span>
                    </div>
                  )}
                  {importSummary.valuesSkipped !== undefined && (
                    <div className="sr-summary-stat">
                      <span className="stat-label">Values skipped</span>
                      <span className="stat-value">{importSummary.valuesSkipped}</span>
                    </div>
                  )}
                </div>

                <div className="sr-ie-success-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={handleRemoveFile}
                  >
                    Import Another File
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={onClose}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {importError && (
              <div className="sr-ie-error-banner" role="alert">
                <WarningCircle size={20} className="sr-error-icon" />
                <div style={{ flex: 1 }}>
                  <strong>Import Error</strong>
                  <p>{importError}</p>
                </div>
              </div>
            )}

            {/* Structured Validation Errors (Check 10) */}
            {validationErrors.length > 0 && (
              <div className="sr-ie-validation-box">
                <div className="sr-validation-title">
                  <WarningCircle size={16} />
                  <span>Validation Issues Encountered ({validationErrors.length})</span>
                </div>
                <div className="sr-validation-list">
                  {validationErrors.map((err, idx) => (
                    <div key={idx} className="sr-validation-row">
                      {err.row !== undefined && (
                        <span className="sr-val-row-num">Row {err.row}</span>
                      )}
                      {err.field && (
                        <span className="sr-val-field">Field: <code>{err.field}</code></span>
                      )}
                      <span className="sr-val-msg">{err.message || 'Validation error'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!importSummary && (
              <form onSubmit={handleImportSubmit} className="sr-ie-form">
                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  id="settings-file-input"
                  accept=".json,.csv"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />

                {/* Dropzone Area */}
                {!selectedFile ? (
                  <div
                    className={`sr-dropzone ${isDragging ? 'dragging' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                  >
                    <div className="sr-dropzone-icon">
                      <UploadSimple size={36} />
                    </div>
                    <div className="sr-dropzone-text">
                      <p className="sr-dropzone-primary">
                        Click to select or drag and drop file here
                      </p>
                      <p className="sr-dropzone-secondary">
                        Supports <strong>.json</strong> (structured catalog) or <strong>.csv</strong> (tabular records)
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="sr-selected-file-card">
                    <div className="sr-file-info">
                      <div className="sr-file-icon">
                        {selectedFile.name.endsWith('.csv') ? (
                          <FileCsv size={28} />
                        ) : (
                          <FileText size={28} />
                        )}
                      </div>
                      <div className="sr-file-details">
                        <span className="sr-file-name">{selectedFile.name}</span>
                        <div className="sr-file-meta">
                          <span>{formatFileSize(selectedFile.size)}</span>
                          <span className="sr-file-format-badge">
                            {selectedFile.name.split('.').pop()?.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn sr-btn-remove-file"
                      onClick={handleRemoveFile}
                      disabled={importing}
                      title="Remove file"
                    >
                      <X size={16} />
                      Remove
                    </button>
                  </div>
                )}

                {/* Safety Rules Callout (Check 11) */}
                <div className="sr-ie-info-callout">
                  <Info size={18} />
                  <div>
                    <strong>System-defined values are protected.</strong>
                    <p>
                      System-defined categories and protected system values cannot be overwritten. Only permitted operational values will be created or updated according to M17 validation rules.
                    </p>
                  </div>
                </div>

                {/* Confirmation Box (Check 7) */}
                {selectedFile && (
                  <div className="sr-confirmation-box" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 16px' }}>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                      Import Settings?
                    </h4>
                    <p style={{ margin: '0 0 10px 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.45 }}>
                      This configuration will be processed using the platform's M17 import rules and will update live settings in the database.
                    </p>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                        disabled={importing}
                        style={{ marginTop: '2px' }}
                      />
                      <span>
                        I understand this configuration will be processed using the platform's M17 import rules and will update live settings in the database.
                      </span>
                    </label>
                  </div>
                )}

                {/* Submit Actions (Check 7 & Check 8) */}
                <div
                  className="modal-actions"
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '10px',
                    marginTop: '20px',
                    paddingTop: '14px',
                    borderTop: '1px solid #e2e8f0',
                  }}
                >
                  <button
                    type="button"
                    className="btn"
                    onClick={selectedFile ? handleRemoveFile : onClose}
                    disabled={importing}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={!selectedFile || !confirmed || importing}
                  >
                    {importing ? (
                      <>
                        <ArrowClockwise size={16} className="spin" />
                        Importing settings...
                      </>
                    ) : (
                      <>
                        <UploadSimple size={16} />
                        Import Settings
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Modal Footer when in Export mode */}
        {activeTab === 'export' && (
          <div
            className="modal-actions"
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: '20px',
              paddingTop: '14px',
              borderTop: '1px solid #e2e8f0',
            }}
          >
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

