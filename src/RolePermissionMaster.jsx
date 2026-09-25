import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle,
  WarningCircle,
  FloppyDisk,
  ArrowCounterClockwise,
  ArrowClockwise,
  Info,
  LockKey,
  Key,
  UsersThree,
  SquaresFour,
  Check,
  X
} from '@phosphor-icons/react';
import { getRoles, getRolePermissions, updateRolePermissions } from './api';

// Canonical list of standard modules in the Freight Management System
export const SYSTEM_MODULES = [
  { id: 'users', name: 'User Management', category: 'Administration', description: 'Internal user provisioning and account lifecycle.' },
  { id: 'roles', name: 'Roles & Permissions', category: 'Administration', description: 'RBAC master and granular action permissions.' },
  { id: 'organizations', name: 'Organizations', category: 'Administration', description: 'Tenant company profile and business compliance.' },
  { id: 'system_settings', name: 'System Settings', category: 'Administration', description: 'Master registries, status lookups, and audit log.' },
  { id: 'shipments', name: 'Shipment Operations', category: 'Operations', description: 'Multi-modal cargo movement and milestones.' },
  { id: 'documents', name: 'Documents & Verification', category: 'Operations', description: 'Bills of lading, packing lists, and customs files.' },
  { id: 'invoices', name: 'Invoices & Reconciliation', category: 'Finance', description: 'Freight invoices, surcharges, and variance audits.' },
  { id: 'rates', name: 'Rates & Contracts', category: 'Freight', description: 'Tariffs, RFQs, spot quotes, and awarded contracts.' },
  { id: 'customs', name: 'Customs Coordination', category: 'Operations', description: 'Declaration filings, clearance statuses, and duties.' },
  { id: 'reports', name: 'Reports & Analytics', category: 'Workspace', description: 'Operational performance, delivery KPIs, and logs.' },
];

const ACTIONS = [
  { id: 'create', label: 'Create', tooltip: 'Add new records' },
  { id: 'read', label: 'Read', tooltip: 'View records and details' },
  { id: 'update', label: 'Update', tooltip: 'Edit or advance records' },
  { id: 'delete', label: 'Delete', tooltip: 'Remove or archive records' },
];

export default function RolePermissionMaster({ hasPermission, notify, currentRoleName }) {
  const canRead = hasPermission('roles', 'read');
  const canUpdate = hasPermission('roles', 'update');

  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [initialPermissions, setInitialPermissions] = useState({});

  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 1. Fetch available tenant roles
  async function fetchRoles() {
    if (!canRead) {
      setError('You do not have permission to view roles.');
      setLoadingRoles(false);
      return;
    }

    try {
      setLoadingRoles(true);
      setError('');
      const res = await getRoles();
      const list = res?.data || (Array.isArray(res) ? res : []);
      setRoles(list);

      // Default select first role if none selected or current selection missing
      if (list.length > 0) {
        setSelectedRoleId((prev) => (prev && list.some((r) => r.id === prev) ? prev : list[0].id));
      }
    } catch (err) {
      console.error('Failed to load roles:', err);
      if (err.status === 403 || err.message?.toLowerCase().includes('permission')) {
        setError('Permission denied: You do not have permission to view roles.');
      } else {
        setError(err.message || 'Failed to load roles from server.');
      }
    } finally {
      setLoadingRoles(false);
    }
  }

  useEffect(() => {
    fetchRoles();
  }, [canRead]);

  // 2. Fetch permissions for the selected role
  useEffect(() => {
    if (!selectedRoleId) return;

    let cancelled = false;
    async function fetchPermissions() {
      try {
        setLoadingPermissions(true);
        setSaveError('');
        setSaveSuccess(false);

        const res = await getRolePermissions(selectedRoleId);
        if (cancelled) return;

        const roleData = res?.data || res;
        const set = roleData?.permission_set || {};
        setPermissions(set);
        setInitialPermissions(JSON.parse(JSON.stringify(set)));
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load role permissions:', err);
        setSaveError(err.message || 'Failed to fetch permissions for this role.');
      } finally {
        if (!cancelled) setLoadingPermissions(false);
      }
    }

    fetchPermissions();

    return () => {
      cancelled = true;
    };
  }, [selectedRoleId]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  // Check if there are unsaved permission changes
  const hasChanges =
    JSON.stringify(permissions) !== JSON.stringify(initialPermissions);

  // Checkbox toggle handler
  function toggleAction(moduleId, actionId) {
    if (!canUpdate) return;

    setPermissions((prev) => {
      const currentActions = prev[moduleId] || [];
      const updatedActions = currentActions.includes(actionId)
        ? currentActions.filter((a) => a !== actionId)
        : [...currentActions, actionId];

      const next = { ...prev };
      if (updatedActions.length > 0) {
        next[moduleId] = updatedActions;
      } else {
        delete next[moduleId];
      }
      return next;
    });

    setSaveSuccess(false);
    setSaveError('');
  }

  // Quick module toggle: select all actions or clear all actions for a module
  function toggleAllModuleActions(moduleId) {
    if (!canUpdate) return;

    setPermissions((prev) => {
      const currentActions = prev[moduleId] || [];
      const allActionIds = ACTIONS.map((a) => a.id);
      const allSelected = allActionIds.every((a) => currentActions.includes(a));

      const next = { ...prev };
      if (allSelected) {
        delete next[moduleId];
      } else {
        next[moduleId] = allActionIds;
      }
      return next;
    });

    setSaveSuccess(false);
    setSaveError('');
  }

  // Discard changes
  function resetChanges() {
    setPermissions(JSON.parse(JSON.stringify(initialPermissions)));
    setSaveError('');
    setSaveSuccess(false);
  }

  // Save changes to backend
  async function handleSave() {
    if (!canUpdate || !selectedRoleId || saving) return;

    try {
      setSaving(true);
      setSaveError('');
      setSaveSuccess(false);

      await updateRolePermissions(selectedRoleId, permissions);

      setInitialPermissions(JSON.parse(JSON.stringify(permissions)));
      setSaveSuccess(true);
      notify(`Permissions for "${selectedRole?.name}" updated successfully.`);
    } catch (err) {
      console.error('Failed to update permissions:', err);
      if (err.status === 403 || err.message?.toLowerCase().includes('company admin')) {
        setSaveError('Permission denied: only Company Admin can modify role permissions.');
      } else if (err.status === 400) {
        setSaveError(err.message || 'Validation error while updating permissions.');
      } else {
        setSaveError(err.message || 'Failed to save permissions. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  // Merge predefined modules with any custom modules returned in permission_set
  const allModuleKeys = Array.from(
    new Set([...SYSTEM_MODULES.map((m) => m.id), ...Object.keys(permissions)])
  );

  const displayedModules = allModuleKeys.map((key) => {
    const known = SYSTEM_MODULES.find((m) => m.id === key);
    return (
      known || {
        id: key,
        name: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        category: 'Custom',
        description: `Permissions for ${key} module.`,
      }
    );
  });

  return (
    <div className="role-permission-master">
      {/* Read-only notification banner if user lacks update permissions */}
      {!canUpdate && (
        <div className="notice-banner info">
          <Info size={18} />
          <span>
            You have read-only access to roles and permissions. Modifying permissions requires Company Admin privileges.
          </span>
        </div>
      )}

      {/* Main Error */}
      {error && (
        <div className="notice-banner error" role="alert">
          <WarningCircle size={20} />
          <div className="notice-content">
            <strong>Error loading roles</strong>
            <p>{error}</p>
          </div>
          <button className="btn small" onClick={fetchRoles}>
            Retry
          </button>
        </div>
      )}

      {/* Two Column Layout: Left Role List, Right Permission Matrix */}
      <div className="role-master-layout">
        {/* Left Column: Roles Sidebar */}
        <aside className="roles-sidebar">
          <div className="roles-sidebar-header">
            <h3>System Roles</h3>
            <span className="count-pill">{roles.length}</span>
          </div>

          <div className="roles-list" role="tablist" aria-label="Available roles">
            {loadingRoles ? (
              <div className="roles-loading">
                <ArrowClockwise size={18} className="spinning" />
                <span>Loading roles...</span>
              </div>
            ) : roles.length > 0 ? (
              roles.map((role) => {
                const isSelected = role.id === selectedRoleId;
                const isUserRole = role.name === currentRoleName;

                return (
                  <button
                    key={role.id}
                    role="tab"
                    aria-selected={isSelected}
                    className={`role-item-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedRoleId(role.id)}
                  >
                    <div className="role-item-info">
                      <div className="role-item-title-row">
                        <ShieldCheck size={17} />
                        <strong>{role.name}</strong>
                      </div>
                      {isUserRole && (
                        <span className="current-user-tag">Your current role</span>
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="muted empty-roles">No roles available.</p>
            )}
          </div>

          <div className="roles-sidebar-footer">
            <small className="muted">
              Roles are system-defined and shared across tenant organizations.
            </small>
          </div>
        </aside>

        {/* Right Column: Permission Matrix for Selected Role */}
        <section className="permissions-matrix-panel">
          {selectedRole ? (
            <>
              {/* Matrix Header */}
              <div className="matrix-header">
                <div>
                  <div className="matrix-title-row">
                    <h2>{selectedRole.name}</h2>
                    {hasChanges && <span className="unsaved-badge">Unsaved changes</span>}
                    {saveSuccess && (
                      <span className="saved-badge">
                        <Check size={14} /> Saved
                      </span>
                    )}
                  </div>
                  <p className="muted">
                    Configure granular permissions (create, read, update, delete) across modules for this role.
                  </p>
                </div>

                {canUpdate && (
                  <div className="matrix-actions">
                    <button
                      className="btn"
                      type="button"
                      disabled={!hasChanges || saving}
                      onClick={resetChanges}
                    >
                      <ArrowCounterClockwise size={16} />
                      <span>Reset</span>
                    </button>
                    <button
                      className="btn primary"
                      type="button"
                      disabled={!hasChanges || saving}
                      onClick={handleSave}
                    >
                      <CheckCircle size={16} />
                      <span>{saving ? 'Saving...' : 'Save permissions'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Inline Save Error alert */}
              {saveError && (
                <div className="notice-banner error matrix-alert" role="alert">
                  <WarningCircle size={18} />
                  <span>{saveError}</span>
                </div>
              )}

              {/* Matrix Table */}
              <div className="table-wrap matrix-table-wrap">
                <table className="records-table matrix-table">
                  <thead>
                    <tr>
                      <th className="module-col-header">Module</th>
                      {ACTIONS.map((action) => (
                        <th key={action.id} className="action-col-header" title={action.tooltip}>
                          {action.label}
                        </th>
                      ))}
                      {canUpdate && <th className="bulk-col-header">All</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingPermissions ? (
                      <tr>
                        <td colSpan={canUpdate ? 6 : 5} className="table-loading-cell">
                          <div className="loading-indicator">
                            <ArrowClockwise size={22} className="spinning" />
                            <span>Loading role permissions...</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      displayedModules.map((mod) => {
                        const moduleActions = permissions[mod.id] || [];
                        const allSelected = ACTIONS.every((a) =>
                          moduleActions.includes(a.id)
                        );

                        return (
                          <tr key={mod.id}>
                            <td className="module-info-cell">
                              <strong>{mod.name}</strong>
                              <small className="muted">{mod.description}</small>
                            </td>

                            {ACTIONS.map((action) => {
                              const checked = moduleActions.includes(action.id);
                              return (
                                <td key={action.id} className="checkbox-cell">
                                  <label
                                    className={`matrix-checkbox-label ${
                                      !canUpdate ? 'disabled' : ''
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      aria-label={`${action.label} ${mod.name}`}
                                      checked={checked}
                                      disabled={!canUpdate || saving}
                                      onChange={() => toggleAction(mod.id, action.id)}
                                    />
                                    <span className="custom-checkbox" />
                                  </label>
                                </td>
                              );
                            })}

                            {canUpdate && (
                              <td className="bulk-toggle-cell">
                                <button
                                  type="button"
                                  className="toggle-all-btn"
                                  title={allSelected ? 'Deselect all' : 'Select all'}
                                  onClick={() => toggleAllModuleActions(mod.id)}
                                  disabled={saving}
                                >
                                  {allSelected ? 'Clear' : 'Select'}
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="table-footer matrix-footer">
                <span>
                  {Object.keys(permissions).length} modules configured with active permissions
                </span>
                {selectedRole.name === currentRoleName && (
                  <span className="self-role-warning">
                    <WarningCircle size={14} />
                    Editing your own role affects your immediate session permissions upon reload.
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="empty">
              <ShieldCheck size={36} />
              <h3>Select a role</h3>
              <p>Choose a role on the left to inspect and configure its permission matrix.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

