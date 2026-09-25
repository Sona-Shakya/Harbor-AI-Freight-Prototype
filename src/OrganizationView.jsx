import React, { useState, useEffect } from 'react';
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
  Globe
} from '@phosphor-icons/react';
import {
  getOrganization,
  updateOrganization,
  verifyCarrier,
  getOrganizationSsoConfig
} from './api';

function Badge({ children, variant }) {
  const v = variant || (
    /^(active|verified|confirmed|approved|resolved)$/i.test(children) ? 'green' :
    /^(pending|review|inactive|unverified)$/i.test(children) ? 'amber' : 'gray'
  );
  return <span className={`badge ${v}`}>{children}</span>;
}

export default function OrganizationView({ hasPermission, notify }) {
  const canRead = hasPermission('organizations', 'read');
  const canUpdate = hasPermission('organizations', 'update');

  const [org, setOrg] = useState(null);
  const [ssoConfig, setSsoConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState(null);

  // Edit modal state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    legal_name: '',
    tax_id: '',
    mc_number: '',
    dot_number: ''
  });
  const [saveLoading, setSaveLoading] = useState(false);
  const [editError, setEditError] = useState('');

  async function loadData() {
    if (!canRead) {
      setError('You do not have permission to view organization details.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const res = await getOrganization();
      const orgData = res?.data || res;
      setOrg(orgData);
      setEditForm({
        legal_name: orgData?.legal_name || '',
        tax_id: orgData?.tax_id || '',
        mc_number: orgData?.mc_number || '',
        dot_number: orgData?.dot_number || ''
      });

      // Also try to load SSO config (optional, company admin only)
      try {
        const ssoRes = await getOrganizationSsoConfig();
        if (ssoRes?.data) setSsoConfig(ssoRes.data);
      } catch (ssoErr) {
        // SSO config not available or unauthorized for non-admin
      }
    } catch (err) {
      setError(err.message || 'Failed to load organization profile.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [canRead]);

  async function handleUpdateOrg(e) {
    e.preventDefault();
    if (!canUpdate) {
      setEditError('You do not have permission to update organization profile.');
      return;
    }

    try {
      setSaveLoading(true);
      setEditError('');
      const res = await updateOrganization(editForm);
      const updated = res?.data || res;
      setOrg(prev => ({ ...prev, ...updated }));
      setIsEditing(false);
      if (notify) notify('Organization profile updated successfully.');
    } catch (err) {
      setEditError(err.message || 'Failed to update organization.');
    } finally {
      setSaveLoading(false);
    }
  }

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
        text: res?.message || 'Carrier verification check completed.'
      });
      if (notify) notify('Carrier verification completed.');
    } catch (err) {
      setVerifyNotice({
        type: 'warn',
        text: err.message || 'FMCSA SAFER carrier verification service returned an exception.'
      });
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return (
      <div className="organization-module" style={{ padding: '24px 0' }}>
        <div className="table-loading-cell">
          <div className="loading-indicator">
            <ArrowClockwise className="spinning" size={20} />
            Loading organization profile...
          </div>
        </div>
      </div>
    );
  }

  if (error && !org) {
    return (
      <div className="organization-module" style={{ padding: '24px 0' }}>
        <div className="notice-banner error">
          <WarningCircle size={20} />
          <div className="notice-content">
            <strong>Access Restricted</strong>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="organization-module" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top summary card */}
      <div className="org-card" style={{
        background: '#fff',
        border: '1px solid var(--line)',
        borderRadius: '10px',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: '10px',
              background: '#eaf2fd',
              color: '#005fdc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Buildings size={28} />
            </div>
            <div>
              <h2 style={{ fontSize: '24px', margin: 0, color: 'var(--ink)' }}>
                {org?.legal_name || 'Organization Profile'}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Type: <strong>{org?.type || 'Standard'}</strong></span>
                <span>•</span>
                <Badge variant={org?.status === 'active' ? 'green' : 'amber'}>
                  {org?.status || 'Active'}
                </Badge>
                {org?.enterprise_tier && (
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    color: '#005ad4',
                    background: '#eaf2fd',
                    padding: '2px 8px',
                    borderRadius: '10px'
                  }}>
                    {org.enterprise_tier.toUpperCase()} TIER
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {canUpdate && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setEditError('');
                  setIsEditing(true);
                }}
              >
                <NotePencil size={17} />
                Edit organization
              </button>
            )}
            <button
              type="button"
              className="btn primary"
              onClick={handleVerifyCarrier}
              disabled={verifying}
            >
              <ShieldCheck size={18} />
              {verifying ? 'Verifying...' : 'Verify Carrier'}
            </button>
          </div>
        </div>

        {verifyNotice && (
          <div className={`notice-banner ${verifyNotice.type === 'success' ? 'info' : 'warn'}`} style={{
            background: verifyNotice.type === 'success' ? '#eaf8f1' : '#fef8e7',
            border: `1px solid ${verifyNotice.type === 'success' ? '#b6e9cd' : '#fae8ba'}`,
            color: verifyNotice.type === 'success' ? '#127d55' : '#9b6100'
          }}>
            {verifyNotice.type === 'success' ? <CheckCircle size={20} /> : <WarningCircle size={20} />}
            <div className="notice-content">
              <strong>Carrier Verification Status</strong>
              <p>{verifyNotice.text}</p>
            </div>
          </div>
        )}

        <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: 0 }} />

        {/* Details Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '20px 24px'
        }}>
          <div>
            <span className="summary-label">Legal Name</span>
            <strong style={{ fontSize: '15px', color: 'var(--ink)' }}>{org?.legal_name || '—'}</strong>
          </div>
          <div>
            <span className="summary-label">Tax ID / EIN</span>
            <strong style={{ fontSize: '15px', color: 'var(--ink)' }}>{org?.tax_id || '—'}</strong>
          </div>
          <div>
            <span className="summary-label">USDOT Number</span>
            <strong style={{ fontSize: '15px', color: 'var(--ink)' }}>{org?.dot_number || '—'}</strong>
          </div>
          <div>
            <span className="summary-label">MC / Carrier Number</span>
            <strong style={{ fontSize: '15px', color: 'var(--ink)' }}>{org?.mc_number || '—'}</strong>
          </div>
        </div>
      </div>

      {/* Enterprise Single Sign-On Section */}
      <div style={{
        background: '#fff',
        border: '1px solid var(--line)',
        borderRadius: '10px',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Key size={22} style={{ color: '#005fdc' }} />
            <h3 style={{ margin: 0, fontSize: '17px', color: 'var(--ink)' }}>Enterprise Single Sign-On (SSO)</h3>
          </div>
          <Badge variant={ssoConfig?.enabled ? 'green' : 'gray'}>
            {ssoConfig?.enabled ? 'Configured' : 'Not Active'}
          </Badge>
        </div>

        <p style={{ fontSize: '13.5px', color: 'var(--muted)', margin: 0 }}>
          Manage your identity provider integration (OIDC / OAuth2) for centralized corporate login.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          background: '#f9fbfe',
          padding: '16px 20px',
          borderRadius: '8px',
          border: '1px solid #e7eff8'
        }}>
          <div>
            <span className="summary-label">Identity Provider</span>
            <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>{ssoConfig?.provider || 'Standard OIDC'}</strong>
          </div>
          <div>
            <span className="summary-label">SSO Domain</span>
            <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>{ssoConfig?.domain || 'harbor.test'}</strong>
          </div>
          <div>
            <span className="summary-label">Enforce SSO</span>
            <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>{ssoConfig?.enforce_sso ? 'Enforced' : 'Optional (Hybrid)'}</strong>
          </div>
        </div>
      </div>

      {/* Edit Organization Modal */}
      {isEditing && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setIsEditing(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-label="Edit Organization Profile">
            <header>
              <h2>Edit organization profile</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close dialog"
                onClick={() => setIsEditing(false)}
              >
                <X size={22} />
              </button>
            </header>

            <form onSubmit={handleUpdateOrg}>
              <p className="modal-description">
                Update the official legal entity information and regulatory registration numbers.
              </p>

              {editError && (
                <div className="notice-banner error modal-error-banner">
                  <WarningCircle size={18} />
                  <span>{editError}</span>
                </div>
              )}

              <div className="form-grid">
                <label>
                  Legal Name *
                  <input
                    required
                    type="text"
                    value={editForm.legal_name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, legal_name: e.target.value }))}
                    placeholder="e.g. Apex Imports Inc."
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
                  {saveLoading ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

