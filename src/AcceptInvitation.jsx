import React, { useState, useEffect } from 'react';
import {
  Buildings,
  ShieldCheck,
  LockKey,
  Eye,
  EyeSlash,
  Phone,
  User,
  CheckCircle,
  WarningCircle,
  ArrowClockwise,
  ArrowRight,
  EnvelopeSimple
} from '@phosphor-icons/react';
import { validateInvitation, acceptInvitation } from './api';
import './styles/acceptInvitation.css';

function RolePill({ role }) {
  const isCompanyAdmin = role === 'Company Admin';
  return (
    <span className={`role-pill ${isCompanyAdmin ? 'admin-role' : 'standard-role'}`}>
      <ShieldCheck size={14} />
      {role || 'Standard'}
    </span>
  );
}

function formatExpiryDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return '';
  }
}

export default function AcceptInvitation({ onGoToLogin }) {
  const [token, setToken] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('token') || '';
    } catch {
      return '';
    }
  });

  const [validationState, setValidationState] = useState('validating'); // 'validating' | 'valid' | 'error'
  const [invitationData, setInvitationData] = useState(null);
  const [validationError, setValidationError] = useState('');

  // Setup form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkToken() {
      if (!token || !token.trim()) {
        setValidationState('error');
        setValidationError('Invalid invitation link.');
        return;
      }

      try {
        setValidationState('validating');
        const res = await validateInvitation(token.trim());
        const data = res?.data || res;
        if (!cancelled) {
          setInvitationData(data);
          setValidationState('valid');
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err?.data?.message || err?.message || '';
          if (err?.status === 404 || msg.toLowerCase().includes('invalid invitation')) {
            setValidationError('Invalid invitation link.');
          } else if (
            msg.toLowerCase().includes('already been accepted') ||
            msg.toLowerCase().includes('already used')
          ) {
            setValidationError('This invitation has already been used.');
          } else if (msg.toLowerCase().includes('expired')) {
            setValidationError(
              'This invitation has expired. Please ask your Company Admin to send a new invitation.'
            );
          } else if (msg.toLowerCase().includes('revoked')) {
            setValidationError(
              'This invitation has been revoked. Please ask your Company Admin for a new invitation.'
            );
          } else {
            setValidationError(
              msg || 'Failed to validate invitation link. Please contact your administrator.'
            );
          }
          setValidationState('error');
        }
      }
    }

    checkToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function isPasswordStrong(pw) {
    if (!pw || pw.length < 8) return false;
    const hasUpper = /[A-Z]/.test(pw);
    const hasNumber = /\d/.test(pw);
    const hasSymbol = /[!@#$%^&*(),.?":{}|<>]/.test(pw);
    return hasUpper && hasNumber && hasSymbol;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setSubmitError('Phone number is required for mandatory login verification.');
      return;
    }

    if (!password) {
      setSubmitError('Password is required.');
      return;
    }

    if (!isPasswordStrong(password)) {
      setSubmitError(
        'Password must be at least 8 characters long and contain at least one uppercase letter, one number, and one special character.'
      );
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }

    try {
      setSubmitting(true);
      await acceptInvitation(token.trim(), {
        name: name.trim() || undefined,
        phone: trimmedPhone,
        password
      });
      setAccepted(true);
    } catch (err) {
      const msg =
        err?.data?.message || err?.message || 'Failed to accept invitation. Please try again.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="accept-inv-shell">
      <div className="accept-inv-card">
        <div className="accept-inv-brand">
          <img src="/harbor-mark.png" alt="Harbor Logo" />
          <span>Harbor</span>
        </div>

        {accepted ? (
          /* Step 9 & 10: Successful Acceptance View */
          <div className="accept-inv-state-view">
            <CheckCircle size={54} className="accept-inv-icon success" weight="fill" />
            <h2 className="accept-inv-state-title">Invitation accepted successfully.</h2>
            <p className="accept-inv-state-desc">
              Your account has been created. Please log in with your email and password.
            </p>

            <div className="accept-inv-callout">
              <ShieldCheck
                size={18}
                style={{ display: 'inline-block', verticalAlign: 'sub', marginRight: '6px' }}
              />
              <strong>Mandatory 2-Step Login:</strong> A 6-digit verification code will be sent to your registered phone number (<strong>{phone.trim()}</strong>) upon login.
            </div>

            <button
              type="button"
              className="btn primary accept-inv-state-btn"
              onClick={onGoToLogin}
            >
              <span>Go to Login</span>
              <ArrowRight size={18} />
            </button>
          </div>
        ) : validationState === 'validating' ? (
          /* Step 12: Loading State */
          <div className="accept-inv-state-view">
            <ArrowClockwise size={44} className="accept-inv-icon loading spinning" />
            <h2 className="accept-inv-state-title">Validating invitation...</h2>
            <p className="accept-inv-state-desc">
              Please wait while we verify your invitation link with the server.
            </p>
          </div>
        ) : validationState === 'error' ? (
          /* Step 11: Invalid / Expired / Reused State */
          <div className="accept-inv-state-view">
            <WarningCircle size={54} className="accept-inv-icon error" weight="fill" />
            <h2 className="accept-inv-state-title">
              {validationError.includes('expired')
                ? 'Invitation Expired'
                : validationError.includes('already')
                ? 'Invitation Already Used'
                : 'Invalid Invitation Link'}
            </h2>
            <p className="accept-inv-state-desc">{validationError}</p>

            <button
              type="button"
              className="btn accept-inv-state-btn"
              onClick={onGoToLogin}
            >
              <span>Go to Login</span>
            </button>
          </div>
        ) : (
          /* Step 5 & 6: Valid Invitation Setup Form */
          <>
            <h1 className="accept-inv-title">Join Your Organization</h1>
            <p className="accept-inv-subtitle">
              You've been invited to join Harbor. Complete your profile and set a password to activate your account.
            </p>

            {/* Read-only Invitation Details */}
            <div className="accept-inv-details">
              <div className="accept-inv-detail-row">
                <span className="accept-inv-detail-label">Organization</span>
                <span className="accept-inv-detail-val org-val">
                  <Buildings size={16} />
                  {invitationData?.organization_name || 'Organization'}
                </span>
              </div>

              <div className="accept-inv-detail-row">
                <span className="accept-inv-detail-label">Invited Email</span>
                <span className="accept-inv-detail-val email-val">
                  {invitationData?.email}
                </span>
              </div>

              <div className="accept-inv-detail-row">
                <span className="accept-inv-detail-label">Assigned Role</span>
                <RolePill role={invitationData?.role} />
              </div>

              {invitationData?.expires_at && (
                <div className="accept-inv-detail-row">
                  <span className="accept-inv-detail-label">Expires</span>
                  <span className="accept-inv-detail-val expiry-val">
                    {formatExpiryDate(invitationData.expires_at)}
                  </span>
                </div>
              )}
            </div>

            {submitError && (
              <div className="login-error" role="alert" style={{ marginBottom: '16px' }}>
                {submitError}
              </div>
            )}

            <form className="accept-inv-form" onSubmit={handleSubmit}>
              <div className="accept-inv-field">
                <label htmlFor="inv-setup-name">Full Name</label>
                <div className="accept-inv-input-wrap">
                  <User size={18} />
                  <input
                    id="inv-setup-name"
                    type="text"
                    placeholder="e.g. Alex Morgan"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>

              <div className="accept-inv-field">
                <label htmlFor="inv-setup-phone">Phone Number *</label>
                <div className="accept-inv-input-wrap">
                  <Phone size={18} />
                  <input
                    id="inv-setup-phone"
                    type="tel"
                    required
                    placeholder="+1 555-0199"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (submitError) setSubmitError('');
                    }}
                  />
                </div>
                <small>Required for mandatory 2-step Login OTP verification.</small>
              </div>

              <div className="accept-inv-field">
                <label htmlFor="inv-setup-password">Create Password *</label>
                <div className="accept-inv-input-wrap">
                  <LockKey size={18} />
                  <input
                    id="inv-setup-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (submitError) setSubmitError('');
                    }}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <small>
                  Must be at least 8 characters with 1 uppercase letter, 1 number, and 1 special symbol.
                </small>
              </div>

              <div className="accept-inv-field">
                <label htmlFor="inv-setup-confirm">Confirm Password *</label>
                <div className="accept-inv-input-wrap">
                  <LockKey size={18} />
                  <input
                    id="inv-setup-confirm"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (submitError) setSubmitError('');
                    }}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={
                      showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                    }
                    onClick={() => setShowConfirmPassword((v) => !v)}
                  >
                    {showConfirmPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn primary accept-inv-submit"
                disabled={submitting}
              >
                {submitting ? 'Activating Account...' : 'Activate Account & Join'}
              </button>
            </form>
          </>
        )}

        <footer className="accept-inv-footer">
          © 2026 Harbor · Global trade, more human.
        </footer>
      </div>
    </main>
  );
}

