import React, { useState, useEffect } from 'react';
import {
  UsersThree,
  Plus,
  MagnifyingGlass,
  ArrowClockwise,
  WarningCircle,
  X,
  LockKey,
  Eye,
  EyeSlash,
  EnvelopeSimple,
  Phone,
  CheckCircle,
  Info,
  ShieldCheck,
  UserPlus,
  PaperPlaneTilt,
  Copy,
  Check
} from '@phosphor-icons/react';
import {
  getAccounts,
  createAccount,
  getRoles,
  deactivateUser,
  updateUserStatus,
  reassignUserRole,
  createInvitation,
  getInvitations
} from './api';
import './styles/userManagement.css';

function Badge({ children, variant = 'gray' }) {
  const v = variant || (
    /^(active|confirmed|approved|resolved)$/i.test(children) ? 'green' :
    /^(pending|review|inactive)$/i.test(children) ? 'amber' : 'gray'
  );
  return <span className={`badge ${v}`}>{children}</span>;
}

function RolePill({ role }) {
  const isCompanyAdmin = role === 'Company Admin';
  return (
    <span className={`role-pill ${isCompanyAdmin ? 'admin-role' : 'standard-role'}`}>
      <ShieldCheck size={14} />
      {role || 'Unassigned'}
    </span>
  );
}

function formatErrorMessage(err, fallback = 'Operation failed.') {
  if (!err) return fallback;
  if (err.status === 403) {
    return 'You do not have permission to perform this action.';
  }
  if (err.status === 404) {
    return 'User not found.';
  }
  if (err.status === 400 || err.status === 409) {
    return err.message || err.data?.message || fallback;
  }
  if (
    err.name === 'TypeError' ||
    err.message?.toLowerCase().includes('failed to fetch') ||
    err.message?.toLowerCase().includes('network')
  ) {
    return 'Network error: Unable to reach the server. Please check your connection.';
  }
  return err.message || fallback;
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return '—';
  }
}

function formatExpiry(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '—';
    const isPast = d < new Date();
    return (
      <span className={isPast ? 'text-danger' : ''}>
        {d.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        })}
        {isPast ? ' (Expired)' : ''}
      </span>
    );
  } catch {
    return '—';
  }
}

export default function UserManagement({ hasPermission, notify, currentUser }) {
  const canRead = hasPermission('users', 'read');
  const canCreate = hasPermission('users', 'create');
  const canUpdate = hasPermission('users', 'update');

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All roles');
  const [statusFilter, setStatusFilter] = useState('All statuses');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [deactivateModalUser, setDeactivateModalUser] = useState(null);
  const [changeRoleModalUser, setChangeRoleModalUser] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const [invitations, setInvitations] = useState([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);

  const isSelf = (u) => {
    if (!currentUser || !u) return false;
    if (currentUser.id && u.id && Number(currentUser.id) === Number(u.id)) return true;
    if (currentUser.email && u.email && currentUser.email.toLowerCase() === u.email.toLowerCase()) return true;
    return false;
  };

  async function fetchUsers() {
    if (!canRead) {
      setError('You do not have permission to view users.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const res = await getAccounts();
      const list = res?.data || (Array.isArray(res) ? res : []);
      setUsers(list);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(formatErrorMessage(err, 'Failed to load user accounts.'));
    } finally {
      setLoading(false);
    }
  }

  async function fetchInvitations() {
    if (!canRead) return;
    try {
      setLoadingInvitations(true);
      const res = await getInvitations();
      const list = res?.data || (Array.isArray(res) ? res : []);
      setInvitations(list);
    } catch (err) {
      console.error('Error fetching invitations:', err);
    } finally {
      setLoadingInvitations(false);
    }
  }

  useEffect(() => {
    fetchUsers();
    fetchInvitations();
  }, [canRead]);

  async function handleActivateUser(u) {
    if (!canUpdate) return;
    try {
      setActionLoadingId(u.id);
      await updateUserStatus(u.id, 'active');
      notify(`User ${u.name || u.email} activated successfully.`);
      await fetchUsers();
    } catch (err) {
      console.error('Error activating user:', err);
      notify(formatErrorMessage(err, 'Failed to activate user.'));
    } finally {
      setActionLoadingId(null);
    }
  }

  // Derived filtered users list
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q) ||
      u.phone?.toLowerCase().includes(q);

    const matchesRole = roleFilter === 'All roles' || u.role === roleFilter;
    const matchesStatus =
      statusFilter === 'All statuses' ||
      u.status?.toLowerCase() === statusFilter.toLowerCase();

    return matchesQuery && matchesRole && matchesStatus;
  });

  const uniqueRoles = Array.from(
    new Set(users.map((u) => u.role).filter(Boolean))
  );

  return (
    <div className="user-management-module">
      {/* Top Banner / Summary */}
      <div className="module-summary-row">
        <div className="summary-stat">
          <span className="summary-label">Total Users</span>
          <strong className="summary-value">{users.length}</strong>
        </div>
        <div className="summary-stat">
          <span className="summary-label">Active Accounts</span>
          <strong className="summary-value">
            {users.filter((u) => u.status === 'active').length}
          </strong>
        </div>
        <div className="summary-stat">
          <span className="summary-label">Configured Roles</span>
          <strong className="summary-value">{uniqueRoles.length}</strong>
        </div>
      </div>

      {/* Permissions Notification banner if cannot create or update */}
      {!canCreate && (
        <div className="notice-banner info">
          <Info size={18} />
          <span>
            You have view-only access to user accounts. Creating and managing users requires Company Admin privileges.
          </span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="notice-banner error" role="alert">
          <WarningCircle size={20} />
          <div className="notice-content">
            <strong>Error loading users</strong>
            <p>{error}</p>
          </div>
          <button className="btn small" onClick={fetchUsers}>
            Retry
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="table-toolbar">
        <div className="search-input">
          <MagnifyingGlass size={19} />
          <input
            aria-label="Search users"
            placeholder="Search users by name, email, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option>All roles</option>
          {uniqueRoles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option>All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="pending">Pending</option>
        </select>

        <button
          className="icon-btn"
          aria-label="Refresh user list"
          title="Refresh user list"
          onClick={fetchUsers}
          disabled={loading}
        >
          <ArrowClockwise size={19} className={loading ? 'spinning' : ''} />
        </button>

        {canCreate && (
          <div className="user-toolbar-actions">
            <button
              className="btn outline invite-user-btn"
              onClick={() => setShowInviteModal(true)}
            >
              <PaperPlaneTilt size={18} />
              <span>Invite user</span>
            </button>
            <button
              className="btn primary create-user-btn"
              onClick={() => setShowCreateModal(true)}
            >
              <UserPlus size={18} />
              <span>Create user</span>
            </button>
          </div>
        )}
      </div>

      {/* Table Wrap */}
      <div className="table-wrap">
        <table className="records-table users-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created By</th>
              {canUpdate && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canUpdate ? 7 : 6} className="table-loading-cell">
                  <div className="loading-indicator">
                    <ArrowClockwise size={22} className="spinning" />
                    <span>Loading user accounts...</span>
                  </div>
                </td>
              </tr>
            ) : filteredUsers.length > 0 ? (
              filteredUsers.map((u) => {
                const initials = (u.name || 'U')
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();

                const self = isSelf(u);

                return (
                  <tr key={u.id || u.email}>
                    <td>
                      <div className="user-name-cell">
                        <span className="avatar small-avatar">{initials}</span>
                        <div>
                          <strong>{u.name}</strong>
                          {self && <small className="muted-text">Current Account</small>}
                          {!self && u.status === 'pending' && (
                            <small className="muted-text">Pending verification</small>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="email-cell">{u.email}</span>
                    </td>
                    <td>
                      <span className="phone-cell">{u.phone || '—'}</span>
                    </td>
                    <td>
                      <RolePill role={u.role} />
                    </td>
                    <td>
                      <Badge variant={u.status === 'active' ? 'green' : 'amber'}>
                        {u.status || 'active'}
                      </Badge>
                    </td>
                    <td>
                      <span className="created-by-cell">
                        {u.createdBy || 'System'}
                      </span>
                    </td>
                    {canUpdate && (
                      <td className="actions-cell">
                        <div className="table-actions-group">
                          <button
                            type="button"
                            className="btn small outline action-btn"
                            onClick={() => setChangeRoleModalUser(u)}
                            disabled={actionLoadingId === u.id}
                          >
                            Change Role
                          </button>

                          {u.status === 'inactive' ? (
                            <button
                              type="button"
                              className="btn small success action-btn"
                              onClick={() => handleActivateUser(u)}
                              disabled={actionLoadingId === u.id}
                            >
                              {actionLoadingId === u.id ? 'Activating...' : 'Activate'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn small danger action-btn"
                              onClick={() => setDeactivateModalUser(u)}
                              disabled={self || actionLoadingId === u.id}
                              title={self ? 'You cannot deactivate your own account' : 'Deactivate user'}
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={canUpdate ? 7 : 6}>
                  <div className="empty">
                    <UsersThree size={32} />
                    <h3>No users found</h3>
                    <p>
                      {searchQuery || roleFilter !== 'All roles' || statusFilter !== 'All statuses'
                        ? 'Try changing your search query or filters.'
                        : 'No user accounts have been provisioned yet.'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-footer">
        {filteredUsers.length} user{filteredUsers.length === 1 ? '' : 's'} displayed
        {users.length !== filteredUsers.length && ` (filtered from ${users.length} total)`}
        {' · Internal company accounts only'}
      </div>

      {/* Invitations Section */}
      <section className="invitations-section" aria-label="Organization Invitations">
        <div className="invitations-header">
          <div className="invitations-title-group">
            <div>
              <h3>Organization Invitations</h3>
              <p className="invitations-desc">
                Pending and historical user invitations sent for this organization.
              </p>
            </div>
          </div>
          <button
            className="icon-btn small"
            aria-label="Refresh invitations list"
            title="Refresh invitations"
            onClick={fetchInvitations}
            disabled={loadingInvitations}
          >
            <ArrowClockwise size={16} className={loadingInvitations ? 'spinning' : ''} />
          </button>
        </div>

        <div className="table-wrap">
          <table className="records-table invitations-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Created</th>
                <th>Invited By</th>
              </tr>
            </thead>
            <tbody>
              {loadingInvitations ? (
                <tr>
                  <td colSpan={6} className="table-loading-cell">
                    <div className="loading-indicator">
                      <ArrowClockwise size={20} className="spinning" />
                      <span>Loading invitations...</span>
                    </div>
                  </td>
                </tr>
              ) : invitations.length > 0 ? (
                invitations.map((inv) => (
                  <tr key={inv.id || inv.email}>
                    <td>
                      <span className="invitation-email-cell">{inv.email}</span>
                    </td>
                    <td>
                      <RolePill role={inv.role} />
                    </td>
                    <td>
                      <Badge variant={inv.status === 'accepted' ? 'green' : inv.status === 'pending' ? 'amber' : 'gray'}>
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="invitation-date-cell">
                      {formatExpiry(inv.expires_at)}
                    </td>
                    <td className="invitation-date-cell">
                      {formatDate(inv.created_at)}
                    </td>
                    <td>
                      <span className="created-by-cell">{inv.invited_by || '—'}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">
                      <EnvelopeSimple size={28} />
                      <h3>No invitations found</h3>
                      <p>No user invitations have been dispatched for this organization yet.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Invite User Modal */}
      {showInviteModal && (
        <InviteUserModal
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            notify('User invitation sent successfully.');
            fetchInvitations();
          }}
        />
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            notify('User account created successfully.');
            fetchUsers();
          }}
        />
      )}

      {/* Deactivate User Confirmation Modal */}
      {deactivateModalUser && (
        <DeactivateUserModal
          user={deactivateModalUser}
          onClose={() => setDeactivateModalUser(null)}
          onSuccess={() => {
            setDeactivateModalUser(null);
            notify('User deactivated successfully.');
            fetchUsers();
          }}
        />
      )}

      {/* Change User Role Modal */}
      {changeRoleModalUser && (
        <ChangeRoleModal
          user={changeRoleModalUser}
          onClose={() => setChangeRoleModalUser(null)}
          onSuccess={() => {
            setChangeRoleModalUser(null);
            notify('User role updated successfully.');
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}

function DeactivateUserModal({ user, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setError('');
    try {
      setSubmitting(true);
      await deactivateUser(user.id);
      onSuccess();
    } catch (err) {
      console.error('Deactivate user error:', err);
      setError(formatErrorMessage(err, 'Failed to deactivate user.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label="Confirm Deactivation">
        <header>
          <h2>Deactivate User</h2>
          <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>
            <X size={22} />
          </button>
        </header>

        <p className="modal-description">
          Are you sure you want to deactivate this user account? The user will immediately lose access and will not be able to log in.
        </p>

        <div className="modal-user-summary">
          <div className="modal-user-summary-row">
            <span className="modal-user-summary-label">User Name:</span>
            <span className="modal-user-summary-val">{user.name}</span>
          </div>
          <div className="modal-user-summary-row">
            <span className="modal-user-summary-label">Email Address:</span>
            <span className="modal-user-summary-val">{user.email}</span>
          </div>
          <div className="modal-user-summary-row">
            <span className="modal-user-summary-label">Current Role:</span>
            <span className="modal-user-summary-val">{user.role || 'Unassigned'}</span>
          </div>
          <div className="modal-user-summary-row">
            <span className="modal-user-summary-label">Current Status:</span>
            <span className="modal-user-summary-val">{user.status || 'active'}</span>
          </div>
        </div>

        {error && (
          <div className="login-error modal-error-banner" role="alert">
            <WarningCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn danger solid"
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? 'Deactivating...' : 'Confirm Deactivation'}
          </button>
        </div>
      </section>
    </div>
  );
}

function ChangeRoleModal({ user, onClose, onSuccess }) {
  const ALLOWED_ROLES = ['Company Admin', 'Dispatcher', 'Driver', 'Finance', 'Read-only'];
  const [selectedRole, setSelectedRole] = useState(() => {
    return ALLOWED_ROLES.includes(user.role) ? user.role : 'Dispatcher';
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    setError('');

    if (!selectedRole) {
      setError('Please select a valid role.');
      return;
    }

    try {
      setSubmitting(true);
      await reassignUserRole(user.id, selectedRole);
      onSuccess();
    } catch (err) {
      console.error('Reassign role error:', err);
      setError(formatErrorMessage(err, 'Failed to update user role.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label="Change User Role">
        <header>
          <h2>Change User Role</h2>
          <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>
            <X size={22} />
          </button>
        </header>

        <p className="modal-description">
          Reassign permissions for this user account. The change takes effect immediately.
        </p>

        <div className="modal-user-summary">
          <div className="modal-user-summary-row">
            <span className="modal-user-summary-label">User:</span>
            <span className="modal-user-summary-val">{user.name}</span>
          </div>
          <div className="modal-user-summary-row">
            <span className="modal-user-summary-label">Email:</span>
            <span className="modal-user-summary-val">{user.email}</span>
          </div>
          <div className="modal-user-summary-row">
            <span className="modal-user-summary-label">Current Role:</span>
            <span className="modal-user-summary-val">{user.role || 'Unassigned'}</span>
          </div>
        </div>

        {error && (
          <div className="login-error modal-error-banner" role="alert">
            <WarningCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSave}>
          <label>
            New Role *
            <select
              required
              value={selectedRole}
              onChange={(e) => {
                setSelectedRole(e.target.value);
                setError('');
              }}
            >
              {ALLOWED_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <div className="modal-actions">
            <button className="btn" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button className="btn primary" type="submit" disabled={submitting}>
              {submitting ? 'Saving Role...' : 'Save Role'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CreateUserModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [roleName, setRoleName] = useState('');

  const [roles, setRoles] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadRolesList() {
      try {
        setLoadingRoles(true);
        const res = await getRoles();
        const roleList = (res?.data || (Array.isArray(res) ? res : [])).filter(
          (r) => r.name !== 'Platform Admin'
        );
        if (!cancelled) {
          setRoles(roleList);
          if (roleList.length > 0) {
            setRoleName(roleList[0].name);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load roles in modal:', err);
          setFormError('Failed to load role options. Please close and retry.');
        }
      } finally {
        if (!cancelled) setLoadingRoles(false);
      }
    }
    loadRolesList();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      setFormError('Full name is required.');
      return;
    }

    if (!trimmedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
      setFormError('Enter a valid work email address.');
      return;
    }

    if (!password || password.length < 6) {
      setFormError('Password must be at least 6 characters long.');
      return;
    }

    if (!roleName) {
      setFormError('Please select a role.');
      return;
    }

    try {
      setSubmitting(true);
      await createAccount({
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone || undefined,
        password,
        roleName,
      });

      onSuccess();
    } catch (err) {
      console.error('Create user error:', err);
      if (err.status === 409 || err.message?.includes('already registered')) {
        setFormError('Email is already registered. Please use a different email.');
      } else if (err.status === 403 || err.message?.includes('Company Admin')) {
        setFormError('Permission denied: Only Company Admin can create accounts.');
      } else if (err.status === 400) {
        setFormError(err.message || 'Validation error: please check the input fields.');
      } else {
        setFormError(formatErrorMessage(err, 'Failed to create user account. Please try again.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label="Create New User">
        <header>
          <h2>Create New User</h2>
          <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>
            <X size={22} />
          </button>
        </header>

        <p className="modal-description">
          Provision an internal user account for your organization. The user will sign in with these credentials.
        </p>

        {formError && (
          <div className="login-error modal-error-banner" role="alert">
            <WarningCircle size={18} />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label>
            Full Name *
            <input
              type="text"
              required
              placeholder="e.g. Alex Morgan"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFormError('');
              }}
            />
          </label>

          <label>
            Work Email *
            <input
              type="email"
              required
              placeholder="name@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFormError('');
              }}
            />
          </label>

          <label>
            Phone Number (optional)
            <input
              type="tel"
              placeholder="+1 555-0199"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>

          <label>
            Assigned Role *
            {loadingRoles ? (
              <select disabled>
                <option>Loading roles...</option>
              </select>
            ) : (
              <select
                required
                value={roleName}
                onChange={(e) => {
                  setRoleName(e.target.value);
                  setFormError('');
                }}
              >
                {roles.map((r) => (
                  <option key={r.id || r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label>
            Initial Password *
            <div className="login-field modal-password-field">
              <LockKey size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFormError('');
                }}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <small className="muted">
              Must be at least 6 characters. Never share credentials publicly.
            </small>
          </label>

          <div className="modal-actions">
            <button className="btn" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button className="btn primary" type="submit" disabled={submitting || loadingRoles}>
              {submitting ? 'Creating User...' : 'Create User'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function InviteUserModal({ onClose, onSuccess }) {
  const ALLOWED_TENANT_ROLES = ['Company Admin', 'Dispatcher', 'Driver', 'Finance', 'Read-only'];
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [roles, setRoles] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [createdData, setCreatedData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadRolesList() {
      try {
        setLoadingRoles(true);
        const res = await getRoles();
        const roleList = (res?.data || (Array.isArray(res) ? res : [])).filter(
          (r) => ALLOWED_TENANT_ROLES.includes(r.name) && r.name !== 'Platform Admin'
        );
        if (!cancelled) {
          setRoles(roleList);
          if (roleList.length > 0) {
            setRoleId(roleList[0].id);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load roles in invite modal:', err);
          setFormError('Failed to load available roles. Please close and retry.');
        }
      } finally {
        if (!cancelled) setLoadingRoles(false);
      }
    }
    loadRolesList();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmedEmail)) {
      setFormError('Please enter a valid work email address.');
      return;
    }

    if (!roleId) {
      setFormError('Please select an authorized role.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await createInvitation(trimmedEmail, Number(roleId));
      const data = res?.data || res;
      onSuccess();

      if (data?.invitation_link) {
        setCreatedData(data);
      } else {
        onClose();
      }
    } catch (err) {
      if (err.status !== 409 && err.status !== 400 && err.status !== 403 && !err.message?.includes('already exists')) {
        console.error('Create invitation error:', err);
      }
      if (err.status === 409 || err.message?.includes('already exists') || err.message?.includes('already a member')) {
        setFormError(err.message || 'An active invitation or account already exists for this email address.');
      } else if (err.status === 403) {
        setFormError(err.message || 'Permission denied: Only Company Admin can invite users.');
      } else if (err.status === 400) {
        setFormError(err.message || 'Validation error: Please verify the email and selected role.');
      } else {
        setFormError(formatErrorMessage(err, 'Failed to send invitation. Please try again.'));
      }
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
    } catch (clipErr) {
      try {
        const input = document.querySelector('.invitation-link-input');
        if (input) {
          input.focus();
          input.select();
          document.execCommand('copy');
        }
      } catch (e) {}
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label="Invite User">
        <header>
          <h2>{createdData ? 'Invitation Created' : 'Invite User'}</h2>
          <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>
            <X size={22} />
          </button>
        </header>

        {createdData ? (
          <div className="invitation-success-view">
            <CheckCircle size={48} className="invitation-success-icon" weight="fill" />
            <h3 className="invitation-success-title">Invitation Sent!</h3>
            <p className="invitation-success-desc">
              An invitation has been dispatched to <strong>{createdData.email}</strong> with the <strong>{createdData.role}</strong> role.
            </p>

            {createdData.invitation_link && (
              <div className="invitation-link-box">
                <span className="invitation-link-label">Invitation Acceptance Link (Development Mode)</span>
                <div className="invitation-link-row">
                  <input
                    type="text"
                    readOnly
                    className="invitation-link-input"
                    value={createdData.invitation_link}
                    aria-label="Invitation link"
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    className="btn primary copy-btn"
                    onClick={handleCopy}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                  </button>
                </div>
                <small className="invitation-link-hint">
                  Share this link with the invitee to let them set their password and complete registration.
                </small>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn primary" type="button" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="modal-description">
              Send an email invitation to add a new team member to your organization. The invitee will receive instructions to accept their invite.
            </p>

            {formError && (
              <div className="login-error modal-error-banner" role="alert">
                <WarningCircle size={18} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <label>
                Invitee Email *
                <input
                  type="email"
                  required
                  placeholder="colleague@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFormError('');
                  }}
                  autoFocus
                />
              </label>

              <label>
                Assigned Role *
                {loadingRoles ? (
                  <select disabled>
                    <option>Loading roles...</option>
                  </select>
                ) : (
                  <select
                    required
                    value={roleId}
                    onChange={(e) => {
                      setRoleId(e.target.value);
                      setFormError('');
                    }}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              <div className="modal-actions">
                <button className="btn" type="button" onClick={onClose} disabled={submitting}>
                  Cancel
                </button>
                <button
                  className="btn primary"
                  type="submit"
                  disabled={submitting || loadingRoles || roles.length === 0}
                >
                  <PaperPlaneTilt size={16} />
                  <span>{submitting ? 'Sending Invite...' : 'Send Invitation'}</span>
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

