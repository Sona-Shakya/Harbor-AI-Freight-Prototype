import React, { useState } from 'react';
import {
  LockKey,
  Eye,
  EyeSlash,
  CheckCircle,
  WarningCircle,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Circle
} from '@phosphor-icons/react';
import { resetPassword } from './api';
import './styles/resetPassword.css';

export default function ResetPassword({
  resetToken,
  onSuccess,
  onBackToLogin,
  onGoToForgotPassword,
}) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Policy validation checks
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasDigit = /\d/.test(newPassword);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);
  const passwordsMatch = Boolean(
    newPassword && confirmPassword && newPassword === confirmPassword
  );

  const isFormValid =
    hasMinLength &&
    hasUppercase &&
    hasLowercase &&
    hasDigit &&
    hasSpecial &&
    passwordsMatch;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');

    if (!resetToken) {
      setError(
        'Password reset session has expired or is invalid. Please request a new verification code.'
      );
      return;
    }

    if (!newPassword) {
      setError('New password is required.');
      return;
    }

    if (!confirmPassword) {
      setError('Please confirm your new password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (!hasUppercase || !hasLowercase || !hasDigit || !hasSpecial) {
      setError(
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.'
      );
      return;
    }

    setLoading(true);

    try {
      await resetPassword({
        resetToken,
        newPassword,
        confirmPassword,
      });

      const successMsg =
        'Password reset successfully. Please login with your new password.';
      onSuccess(successMsg);
    } catch (err) {
      setError(
        err.message || 'Failed to reset password. Please request a new code.'
      );
    } finally {
      setLoading(false);
    }
  };

  // If page was reached directly without a reset token in memory
  if (!resetToken) {
    return (
      <main className="login-shell reset-pwd-shell">
        <section className="login-form-panel">
          <div className="login-brand">
            <img src="/harbor-mark.png" alt="" />
            <span>Harbor</span>
          </div>

          <div className="login-form-wrap">
            <div className="login-eyebrow">SET NEW PASSWORD</div>
            <h1>Reset Password</h1>
            <p className="login-intro">
              Password reset session has expired or is invalid. Please request a new
              verification code.
            </p>

            <button
              type="button"
              className="btn primary login-submit"
              onClick={onGoToForgotPassword}
            >
              <span>Request new code</span>
              <ArrowRight size={18} />
            </button>

            <button
              type="button"
              className="reset-pwd-back-btn"
              onClick={onBackToLogin}
            >
              <ArrowLeft size={16} />
              <span>Back to Login</span>
            </button>
          </div>

          <footer>© 2026 Harbor · Global trade, more human.</footer>
        </section>

        <aside className="login-story">
          <div className="login-story-content">
            <span className="story-kicker">Account Security</span>
            <h2>Strong credentials protection.</h2>
            <p>
              Harbor enforces enterprise-grade password complexity and multi-factor
              authentication to protect vital freight management operations.
            </p>
          </div>
          <div className="login-orbit login-orbit-one" />
          <div className="login-orbit login-orbit-two" />
        </aside>
      </main>
    );
  }

  return (
    <main className="login-shell reset-pwd-shell">
      <section className="login-form-panel">
        <div className="login-brand">
          <img src="/harbor-mark.png" alt="" />
          <span>Harbor</span>
        </div>

        <div className="login-form-wrap">
          <div className="login-eyebrow">SET NEW PASSWORD</div>

          <h1>Reset Password</h1>

          <p className="login-intro">
            Create a new strong password for your account.
          </p>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label htmlFor="reset-new-password">
              New Password
              <div className="login-field">
                <LockKey size={20} />
                <input
                  id="reset-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (error) setError('');
                  }}
                  disabled={loading}
                  autoFocus
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowNewPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </label>

            <label htmlFor="reset-confirm-password">
              Confirm Password
              <div className="login-field">
                <LockKey size={20} />
                <input
                  id="reset-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (error) setError('');
                  }}
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={
                    showConfirmPassword ? 'Hide password' : 'Show password'
                  }
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeSlash size={20} />
                  ) : (
                    <Eye size={20} />
                  )}
                </button>
              </div>
            </label>

            {/* Password Policy Checklist */}
            <div className="password-policy-card">
              <div className="password-policy-header">
                <ShieldCheck size={16} />
                <span>Password Requirements</span>
              </div>
              <div className="password-policy-list">
                <div
                  className={`password-policy-item ${hasMinLength ? 'met' : ''}`}
                >
                  {hasMinLength ? <CheckCircle size={14} /> : <Circle size={14} />}
                  <span>At least 8 characters</span>
                </div>
                <div
                  className={`password-policy-item ${hasUppercase ? 'met' : ''}`}
                >
                  {hasUppercase ? <CheckCircle size={14} /> : <Circle size={14} />}
                  <span>1 uppercase letter (A-Z)</span>
                </div>
                <div
                  className={`password-policy-item ${hasLowercase ? 'met' : ''}`}
                >
                  {hasLowercase ? <CheckCircle size={14} /> : <Circle size={14} />}
                  <span>1 lowercase letter (a-z)</span>
                </div>
                <div className={`password-policy-item ${hasDigit ? 'met' : ''}`}>
                  {hasDigit ? <CheckCircle size={14} /> : <Circle size={14} />}
                  <span>1 number (0-9)</span>
                </div>
                <div
                  className={`password-policy-item ${hasSpecial ? 'met' : ''}`}
                >
                  {hasSpecial ? <CheckCircle size={14} /> : <Circle size={14} />}
                  <span>1 special symbol (!@#$...)</span>
                </div>
                <div
                  className={`password-policy-item ${
                    passwordsMatch ? 'met' : ''
                  }`}
                >
                  {passwordsMatch ? (
                    <CheckCircle size={14} />
                  ) : (
                    <Circle size={14} />
                  )}
                  <span>Passwords match</span>
                </div>
              </div>
            </div>

            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn primary login-submit"
              disabled={loading || !isFormValid}
            >
              {loading ? (
                <>
                  <span className="reset-pwd-loading-spinner" />
                  <span>Resetting password...</span>
                </>
              ) : (
                <>
                  <span>Reset Password</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            <button
              type="button"
              className="reset-pwd-back-btn"
              onClick={onBackToLogin}
              disabled={loading}
            >
              <ArrowLeft size={16} />
              <span>Back to Login</span>
            </button>
          </form>

          <div className="login-note">
            <ShieldCheck size={16} />
            <span>Secure password encryption powered by Harbor FMS.</span>
          </div>
        </div>

        <footer>© 2026 Harbor · Global trade, more human.</footer>
      </section>

      <aside className="login-story">
        <div className="login-story-content">
          <span className="story-kicker">Security Standards</span>
          <h2>Protecting enterprise logistics.</h2>
          <p>
            High-entropy passwords ensure that freight quotes, carrier agreements,
            and customs documentation remain completely safeguarded.
          </p>

          <div className="login-feature">
            <LockKey size={24} />
            <span>
              <strong>Bcrypt 12-round hashing</strong>
              <small>
                Passwords are cryptographically salted and hashed before reaching
                database storage.
              </small>
            </span>
          </div>

          <div className="login-feature">
            <ShieldCheck size={24} />
            <span>
              <strong>Immediate token revocation</strong>
              <small>
                Reset authorization tokens expire immediately once used to prevent
                replay attacks.
              </small>
            </span>
          </div>
        </div>

        <div className="login-orbit login-orbit-one" />
        <div className="login-orbit login-orbit-two" />
      </aside>
    </main>
  );
}
