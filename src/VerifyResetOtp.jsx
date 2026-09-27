import React, { useState, useEffect } from 'react';
import {
  LockKey,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  EnvelopeSimple,
  Clock,
  ArrowCounterClockwise,
  CheckCircle,
  WarningCircle
} from '@phosphor-icons/react';
import { verifyResetOtp, resendResetOtp } from './api';
import './styles/verifyResetOtp.css';

export default function VerifyResetOtp({
  email,
  onSuccess,
  onBackToLogin,
  onGoToForgotPassword,
}) {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resendNotice, setResendNotice] = useState('');

  // 60-second cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleOtpChange = (e) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(cleaned);
    if (error) setError('');
    if (resendNotice) setResendNotice('');
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resendLoading || !email) return;
    setError('');
    setResendNotice('');
    setResendLoading(true);

    try {
      const res = await resendResetOtp(email);
      setResendCooldown(60);
      setResendNotice(
        res?.message || 'A new password reset OTP has been sent to your email.'
      );
    } catch (err) {
      if (err.status === 429) {
        setError(
          err.message || 'Please wait before requesting a new password reset code.'
        );
      } else {
        setError(err.message || 'Failed to resend verification code. Please try again.');
      }
    } finally {
      setResendLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (!email) {
      setError('No registered email found. Please start from the beginning.');
      return;
    }

    if (!otp || otp.length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    setError('');
    setResendNotice('');

    try {
      const response = await verifyResetOtp(email, otp);
      const token = response?.resetToken || response?.reset_token;
      if (!token) {
        throw new Error('Reset authorization token missing from response.');
      }
      onSuccess(token, response?.message);
    } catch (err) {
      setError(
        err.message || 'Invalid or expired verification code. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // If page was reached directly without an email in session
  if (!email) {
    return (
      <main className="login-shell verify-reset-otp-shell">
        <section className="login-form-panel">
          <div className="login-brand">
            <img src="/harbor-mark.png" alt="" />
            <span>Harbor</span>
          </div>

          <div className="login-form-wrap">
            <div className="login-eyebrow">OTP VERIFICATION</div>
            <h1>Verify OTP</h1>
            <p className="login-intro">
              No active password reset session was found. Please enter your email
              address to request a verification code.
            </p>

            <button
              type="button"
              className="btn primary login-submit"
              onClick={onGoToForgotPassword}
            >
              <span>Go to Forgot Password</span>
              <ArrowRight size={18} />
            </button>

            <button
              type="button"
              className="reset-otp-back-btn"
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
            <h2>Two-step reset verification.</h2>
            <p>
              Harbor protects sensitive logistics workflows with single-use verification
              codes before allowing any password changes.
            </p>
          </div>
          <div className="login-orbit login-orbit-one" />
          <div className="login-orbit login-orbit-two" />
        </aside>
      </main>
    );
  }

  return (
    <main className="login-shell verify-reset-otp-shell">
      <section className="login-form-panel">
        <div className="login-brand">
          <img src="/harbor-mark.png" alt="" />
          <span>Harbor</span>
        </div>

        <div className="login-form-wrap">
          <div className="login-eyebrow">OTP VERIFICATION</div>

          <h1>Verify OTP</h1>

          <p className="login-intro">
            Enter the OTP sent to your registered email address.
          </p>

          <div className="reset-otp-target-card">
            <div className="reset-otp-target-icon">
              <EnvelopeSimple size={20} />
            </div>
            <div className="reset-otp-target-text">
              <span>Code sent to</span>
              <strong>{email}</strong>
            </div>
          </div>

          {resendNotice && (
            <div className="reset-otp-notice-success" role="status">
              <CheckCircle size={16} />
              <span>{resendNotice}</span>
            </div>
          )}

          <form className="login-form" onSubmit={handleVerify} noValidate>
            <label htmlFor="reset-otp-input">
              OTP
              <div className="login-field">
                <LockKey size={20} />
                <input
                  id="reset-otp-input"
                  className="reset-otp-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  onChange={handleOtpChange}
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

            <div className="reset-otp-resend-wrapper">
              <span style={{ fontSize: '13px', color: '#6a7c98' }}>
                Didn't receive the OTP?
              </span>
              {resendCooldown > 0 ? (
                <span className="reset-otp-resend-timer">
                  <Clock size={14} />
                  <span>Resend in {resendCooldown}s</span>
                </span>
              ) : (
                <button
                  type="button"
                  className="reset-otp-resend-btn"
                  onClick={handleResend}
                  disabled={resendLoading}
                >
                  <ArrowCounterClockwise size={15} />
                  <span>{resendLoading ? 'Resending...' : 'Resend OTP'}</span>
                </button>
              )}
            </div>

            <button
              type="submit"
              className="btn primary login-submit"
              disabled={loading || otp.length !== 6}
            >
              {loading ? 'Verifying...' : 'Verify OTP'}
              {!loading && <ArrowRight size={18} />}
            </button>

            <button
              type="button"
              className="reset-otp-back-btn"
              onClick={onBackToLogin}
              disabled={loading}
            >
              <ArrowLeft size={16} />
              <span>Back to Login</span>
            </button>
          </form>

          <div className="login-note">
            <ShieldCheck size={16} />
            <span>Secure code verification powered by Harbor FMS.</span>
          </div>
        </div>

        <footer>© 2026 Harbor · Global trade, more human.</footer>
      </section>

      <aside className="login-story">
        <div className="login-story-content">
          <span className="story-kicker">Account Security</span>
          <h2>Two-step reset verification.</h2>
          <p>
            Harbor safeguards logistics operations with time-limited numeric OTPs,
            ensuring credentials can only be reset by the confirmed recipient.
          </p>

          <div className="login-feature">
            <EnvelopeSimple size={24} />
            <span>
              <strong>Direct email delivery</strong>
              <small>
                A 6-digit one-time code sent directly to your registered work email.
              </small>
            </span>
          </div>

          <div className="login-feature">
            <Clock size={24} />
            <span>
              <strong>15-minute validity</strong>
              <small>
                Codes expire automatically to prevent replay attempts and misuse.
              </small>
            </span>
          </div>

          <div className="login-feature">
            <ShieldCheck size={24} />
            <span>
              <strong>Single-use token authorization</strong>
              <small>
                Successful verification generates a short-lived authorization token
                in transient memory.
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
