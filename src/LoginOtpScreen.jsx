import React, { useState, useEffect } from 'react';
import {
  LockKey,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  DeviceMobile,
  Clock,
  ArrowCounterClockwise,
  CheckCircle,
} from '@phosphor-icons/react';
import { verifyLoginOtp, resendLoginOtp } from './api';
import './styles/loginOtp.css';

export default function LoginOtpScreen({ challenge, onSuccess, onCancel }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    challenge?.otpToken
      ? ''
      : 'Your verification session has expired. Please sign in again.'
  );
  const [isExpired, setIsExpired] = useState(!challenge?.otpToken);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resendNotice, setResendNotice] = useState('');
  const [currentOtpToken, setCurrentOtpToken] = useState(
    challenge?.otpToken || ''
  );

  // 60-second cooldown timer for Resend OTP with interval cleanup on unmount
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleCodeChange = (e) => {
    // Only accept numeric input up to 6 digits
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(cleaned);
    if (error) setError('');
    if (resendNotice) setResendNotice('');
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resendLoading || isExpired || !currentOtpToken) return;
    setError('');
    setResendNotice('');
    setResendLoading(true);

    try {
      const res = await resendLoginOtp({ otp_token: currentOtpToken });
      setResendCooldown(60);
      const newToken = res?.otp_token || res?.data?.otp_token;
      if (newToken) {
        setCurrentOtpToken(newToken);
      }
      setResendNotice(
        res?.message || 'A new verification code has been sent to your phone.'
      );
    } catch (err) {
      if (err.status === 401 && /expired|session|invalid token/i.test(err.message || '')) {
        setIsExpired(true);
        setError('Your verification session has expired. Please sign in again.');
      } else if (err.status === 429) {
        setError(
          err.message || 'Please wait before requesting another verification code.'
        );
      } else {
        setError(err.message || 'Failed to resend verification code. Please try again.');
      }
    } finally {
      setResendLoading(false);
    }
  };

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    if (loading || isExpired) return;

    if (!code || code.length !== 6) {
      setError('Please enter a valid 6-digit verification code.');
      return;
    }

    if (!currentOtpToken) {
      setError('Your verification session has expired. Please sign in again.');
      setIsExpired(true);
      return;
    }

    setLoading(true);
    setError('');
    setResendNotice('');

    try {
      const response = await verifyLoginOtp({
        otp_token: currentOtpToken,
        otp: code,
      });
      if (onSuccess) {
        onSuccess(response);
      }
    } catch (err) {
      if (err.status === 401 && /expired|session/i.test(err.message || '')) {
        setIsExpired(true);
        setError('Your verification session has expired. Please sign in again.');
      } else if (err.status === 400 || err.status === 401) {
        setError(err.message || 'Invalid verification code. Please try again.');
      } else if (err.status === 429) {
        setError(
          err.message || 'Too many attempts. Please request a new code or try again later.'
        );
      } else {
        setError(
          err.message || 'Verification failed. Please check your connection and try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell login-otp-shell">
      <section className="login-form-panel">
        <div className="login-brand">
          <img src="/harbor-mark.png" alt="" />
          <span>Harbor</span>
        </div>

        <div className="login-form-wrap">
          <div className="login-eyebrow">TWO-STEP VERIFICATION</div>

          <h1>Verify your login</h1>

          <p className="login-intro">
            Enter the 6-digit verification code sent to your registered mobile number.
          </p>

          <div className="otp-phone-card">
            <div className="otp-phone-icon">
              <DeviceMobile size={22} />
            </div>
            <div className="otp-phone-text">
              <span>Verification code sent to</span>
              <strong>{challenge?.phone || 'registered phone number'}</strong>
            </div>
          </div>

          {resendNotice && (
            <div className="otp-notice-success" role="status">
              <CheckCircle size={16} />
              <span>{resendNotice}</span>
            </div>
          )}

          <form className="login-form" onSubmit={handleVerify}>
            <label htmlFor="login-otp-input">
              One-time verification code
              <div className="login-field">
                <LockKey size={20} />
                <input
                  id="login-otp-input"
                  className="otp-input-field"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={handleCodeChange}
                  disabled={loading || isExpired}
                  aria-required="true"
                  autoFocus
                />
              </div>
            </label>

            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}

            <div className="otp-resend-wrapper">
              <span style={{ fontSize: '13px', color: '#6a7c98' }}>
                Didn't receive the code?
              </span>
              {resendCooldown > 0 ? (
                <span className="otp-resend-timer-badge">
                  <Clock size={14} />
                  <span>Resend in {resendCooldown}s</span>
                </span>
              ) : (
                <button
                  type="button"
                  className="otp-resend-btn"
                  onClick={handleResend}
                  disabled={resendLoading || isExpired}
                >
                  <ArrowCounterClockwise size={15} />
                  <span>{resendLoading ? 'Resending...' : 'Resend code'}</span>
                </button>
              )}
            </div>

            <button
              type="submit"
              className="btn primary login-submit"
              disabled={loading || isExpired || code.length !== 6}
            >
              {loading ? 'Verifying...' : 'Verify & Continue'}
              {!loading && <ArrowRight size={18} />}
            </button>

            <button
              type="button"
              className="otp-back-btn"
              onClick={onCancel}
            >
              <ArrowLeft size={16} />
              <span>Back to sign in</span>
            </button>
          </form>

          <div className="login-note">
            <ShieldCheck size={16} />
            <span>Mandatory two-step authentication powered by Harbor FMS.</span>
          </div>
        </div>

        <footer>© 2026 Harbor · Global trade, more human.</footer>
      </section>

      <aside className="login-story">
        <div className="login-story-content">
          <span className="story-kicker">Account Security</span>
          <h2>Mandatory verification for every session.</h2>
          <p>
            Harbor safeguards critical logistics operations with one-time phone
            verification, keeping shipments, customs records, and commercial
            quotes secure.
          </p>

          <div className="login-feature">
            <DeviceMobile size={24} />
            <span>
              <strong>Instant phone verification</strong>
              <small>
                A 6-digit one-time password delivered directly to your registered number.
              </small>
            </span>
          </div>

          <div className="login-feature">
            <Clock size={24} />
            <span>
              <strong>5-minute ephemeral window</strong>
              <small>
                Codes expire rapidly and can only be verified once for maximum security.
              </small>
            </span>
          </div>

          <div className="login-feature">
            <ShieldCheck size={24} />
            <span>
              <strong>Cryptographic protection</strong>
              <small>
                Secure token exchange held only in transient React memory.
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

