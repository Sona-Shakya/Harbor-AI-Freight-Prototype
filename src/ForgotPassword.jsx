import React, { useState } from 'react';
import {
  EnvelopeSimple,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  LockKey,
  Clock,
  Key
} from '@phosphor-icons/react';
import { forgotPassword } from './api';
import './styles/forgotPassword.css';

export default function ForgotPassword({ onSuccess, onBackToLogin }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError('Please enter your email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    try {
      setLoading(true);
      const res = await forgotPassword(normalizedEmail);
      // Backend returns: { success: true, message: "If an account exists for this email, a password reset OTP has been sent." }
      onSuccess(normalizedEmail, res?.message);
    } catch (err) {
      setError(err.message || 'Failed to send password reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell forgot-pwd-shell">
      <section className="login-form-panel">
        <div className="login-brand">
          <img src="/harbor-mark.png" alt="" />
          <span>Harbor</span>
        </div>

        <div className="login-form-wrap">
          <div className="login-eyebrow">PASSWORD RECOVERY</div>

          <h1>Forgot Password</h1>

          <p className="login-intro">
            Enter your registered email address and we will send you an OTP.
          </p>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label htmlFor="forgot-pwd-email">
              Email
              <div className="login-field">
                <EnvelopeSimple size={20} />
                <input
                  id="forgot-pwd-email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  disabled={loading}
                  autoFocus
                  required
                />
              </div>
            </label>

            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn primary login-submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="forgot-pwd-loading-spinner" />
                  <span>Sending OTP...</span>
                </>
              ) : (
                <>
                  <span>Send OTP</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            <button
              type="button"
              className="forgot-pwd-back-btn"
              onClick={onBackToLogin}
              disabled={loading}
            >
              <ArrowLeft size={16} />
              <span>Back to Login</span>
            </button>
          </form>

          <div className="login-note">
            <ShieldCheck size={16} />
            <span>Secure account recovery powered by Harbor FMS.</span>
          </div>
        </div>

        <footer>© 2026 Harbor · Global trade, more human.</footer>
      </section>

      <aside className="login-story">
        <div className="login-story-content">
          <span className="story-kicker">Account Security</span>
          <h2>Recover your access securely.</h2>
          <p>
            Harbor uses single-use verification codes sent directly to your
            registered company email to ensure only authorized operators can reset
            credentials.
          </p>

          <div className="login-feature">
            <Key size={24} />
            <span>
              <strong>Cryptographic reset codes</strong>
              <small>
                One-time numeric verification code hashed with bcrypt for
                foolproof protection.
              </small>
            </span>
          </div>

          <div className="login-feature">
            <Clock size={24} />
            <span>
              <strong>15-minute expiration</strong>
              <small>
                Codes expire promptly to protect your account against unauthorized
                tampering.
              </small>
            </span>
          </div>

          <div className="login-feature">
            <ShieldCheck size={24} />
            <span>
              <strong>Protected operations</strong>
              <small>
                Full audit trails recorded for all security-sensitive password
                reset events.
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
