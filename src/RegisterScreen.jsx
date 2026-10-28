import React, { useState } from 'react';
import {
  User,
  EnvelopeSimple,
  Phone,
  LockKey,
  Eye,
  EyeSlash,
  Buildings,
  Truck,
  UsersThree,
  IdentificationCard,
  ShieldCheck,
  CheckCircle,
  WarningCircle,
  ArrowRight,
  ArrowLeft,
  Clock,
  Sparkle
} from '@phosphor-icons/react';
import { registerCompany } from './api';
import './styles/register.css';

export default function RegisterScreen({ onBackToLogin, onRegisterSuccess }) {
  // Wizard steps: 1 = Account Credentials, 2 = Company Profile, 3 = Authority & Review, 4 = Success
  const [step, setStep] = useState(1);

  // Step 1: User / Account fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Step 2: Company fields
  const [company, setCompany] = useState('');
  const [organizationType, setOrganizationType] = useState('shipper'); // 'shipper' | 'carrier' | 'broker'
  const [taxId, setTaxId] = useState('');

  // Step 3: Carrier Authority fields (if organizationType === 'carrier')
  const [mcNumber, setMcNumber] = useState('');
  const [dotNumber, setDotNumber] = useState('');

  // State management
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationResult, setRegistrationResult] = useState(null);

  // Validation helpers
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const mcRegex = /^(?:MC-?)?\d{5,8}$/i;
  const dotRegex = /^(?:(?:US)?DOT-?)?\d{5,8}$/i;

  const passwordChecks = {
    length: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>_\-=+~`[\]\\;/]/.test(password),
  };

  const isPasswordValid = Object.values(passwordChecks).every(Boolean);

  // Navigation handlers
  const handleNextFromStep1 = (e) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName || trimmedName.length < 2) {
      setError('Please enter your full name.');
      return;
    }

    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid work email address.');
      return;
    }

    if (!trimmedPhone || trimmedPhone.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid phone number with area code (at least 10 digits).');
      return;
    }

    if (!isPasswordValid) {
      setError('Password does not meet the security requirements (minimum 8 chars, 1 uppercase, 1 number, 1 special character).');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    setStep(2);
  };

  const handleNextFromStep2 = (e) => {
    e.preventDefault();
    setError('');

    const trimmedCompany = company.trim();
    const trimmedTaxId = taxId.trim();

    if (!trimmedCompany || trimmedCompany.length < 2) {
      setError('Please enter your company legal name.');
      return;
    }

    if (!trimmedTaxId || trimmedTaxId.length < 5) {
      setError('Please enter a valid Tax ID / Employer Identification Number (EIN).');
      return;
    }

    setStep(3);
  };

  const handlePrevStep = () => {
    setError('');
    setStep((prev) => Math.max(1, prev - 1));
  };

  const handleSubmitRegistration = async (e) => {
    e.preventDefault();
    setError('');

    if (organizationType === 'carrier') {
      const trimmedMc = mcNumber.trim();
      const trimmedDot = dotNumber.trim();

      if (!trimmedMc || !mcRegex.test(trimmedMc)) {
        setError('Please enter a valid MC Number (e.g., MC-123456 or 123456).');
        return;
      }

      if (!trimmedDot || !dotRegex.test(trimmedDot)) {
        setError('Please enter a valid USDOT Number (e.g., DOT-1234567 or 1234567).');
        return;
      }
    }

    const payload = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      password,
      company: company.trim(),
      organizationType,
      taxId: taxId.trim(),
    };

    if (organizationType === 'carrier') {
      payload.mcNumber = mcNumber.trim();
      payload.dotNumber = dotNumber.trim();
    }

    try {
      setLoading(true);
      const res = await registerCompany(payload);
      const responseData = res?.data || res;
      setRegistrationResult(responseData);
      setStep(4);
      if (onRegisterSuccess) {
        onRegisterSuccess(responseData);
      }
    } catch (err) {
      setError(err.message || 'Registration failed. Please check your information and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinishToLogin = () => {
    if (onBackToLogin) {
      onBackToLogin(email.trim(), registrationResult);
    }
  };

  return (
    <main className="login-shell register-shell">
      <section className="login-form-panel register-form-panel">
        <div className="login-brand">
          <img src="/harbor-mark.png" alt="" />
          <span>Harbor</span>
        </div>

        <div className="login-form-wrap register-form-wrap">
          <div className="login-eyebrow">SELF-SERVICE REGISTRATION</div>

          {step < 4 ? (
            <>
              <h1>Register your company</h1>
              <p className="login-intro">
                Create your enterprise Freight Management account as a Shipper, Carrier, or Freight Broker.
              </p>

              {/* Progress Stepper */}
              <div className="register-stepper" aria-label="Registration steps">
                <div className={`register-step-item ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`}>
                  <div className="register-step-circle">
                    {step > 1 ? <CheckCircle size={18} weight="bold" /> : '1'}
                  </div>
                  <span className="register-step-title">Account</span>
                </div>

                <div className={`register-step-item ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`}>
                  <div className="register-step-circle">
                    {step > 2 ? <CheckCircle size={18} weight="bold" /> : '2'}
                  </div>
                  <span className="register-step-title">Company</span>
                </div>

                <div className={`register-step-item ${step === 3 ? 'active' : ''}`}>
                  <div className="register-step-circle">
                    3
                  </div>
                  <span className="register-step-title">
                    {organizationType === 'carrier' ? 'Authority & Review' : 'Review'}
                  </span>
                </div>
              </div>
            </>
          ) : null}

          {/* STEP 1: Account Information */}
          {step === 1 && (
            <form className="login-form" onSubmit={handleNextFromStep1} noValidate>
              <label htmlFor="reg-name">
                Full Name
                <div className="login-field">
                  <User size={20} />
                  <input
                    id="reg-name"
                    type="text"
                    placeholder="e.g. Sarah Jenkins"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (error) setError('');
                    }}
                    required
                  />
                </div>
              </label>

              <label htmlFor="reg-email">
                Work Email Address
                <div className="login-field">
                  <EnvelopeSimple size={20} />
                  <input
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError('');
                    }}
                    required
                  />
                </div>
              </label>

              <label htmlFor="reg-phone">
                Mobile Phone
                <div className="login-field">
                  <Phone size={20} />
                  <input
                    id="reg-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+1 (555) 000-0000"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (error) setError('');
                    }}
                    required
                  />
                </div>
              </label>

              <label htmlFor="reg-password">
                Password
                <div className="login-field">
                  <LockKey size={20} />
                  <input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Create a strong password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError('');
                    }}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </label>

              {/* Password Requirement checklist */}
              <div className="password-requirements">
                <span>Password requirements:</span>
                <div className="password-req-list">
                  <div className={`password-req-item ${passwordChecks.length ? 'met' : 'unmet'}`}>
                    <CheckCircle size={14} weight={passwordChecks.length ? 'fill' : 'regular'} />
                    <span>8+ characters</span>
                  </div>
                  <div className={`password-req-item ${passwordChecks.hasUpper ? 'met' : 'unmet'}`}>
                    <CheckCircle size={14} weight={passwordChecks.hasUpper ? 'fill' : 'regular'} />
                    <span>1 uppercase letter</span>
                  </div>
                  <div className={`password-req-item ${passwordChecks.hasNumber ? 'met' : 'unmet'}`}>
                    <CheckCircle size={14} weight={passwordChecks.hasNumber ? 'fill' : 'regular'} />
                    <span>1 number</span>
                  </div>
                  <div className={`password-req-item ${passwordChecks.hasSpecial ? 'met' : 'unmet'}`}>
                    <CheckCircle size={14} weight={passwordChecks.hasSpecial ? 'fill' : 'regular'} />
                    <span>1 special character</span>
                  </div>
                </div>
              </div>

              <label htmlFor="reg-confirm-password">
                Confirm Password
                <div className="login-field">
                  <LockKey size={20} />
                  <input
                    id="reg-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (error) setError('');
                    }}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    onClick={() => setShowConfirmPassword((v) => !v)}
                  >
                    {showConfirmPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </label>

              {error && (
                <p className="login-error" role="alert">
                  {error}
                </p>
              )}

              <div className="register-actions">
                <button
                  type="button"
                  className="register-back-btn"
                  onClick={onBackToLogin}
                >
                  <ArrowLeft size={16} />
                  Back to Sign In
                </button>
                <button
                  type="submit"
                  className="btn primary login-submit"
                  style={{ marginTop: 0 }}
                >
                  Continue to Company
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Company Profile */}
          {step === 2 && (
            <form className="login-form" onSubmit={handleNextFromStep2} noValidate>
              <label>
                Organization Type
                <div className="register-org-cards" role="radiogroup" aria-label="Organization Type">
                  <div
                    className={`register-org-card ${organizationType === 'shipper' ? 'selected' : ''}`}
                    onClick={() => setOrganizationType('shipper')}
                    role="radio"
                    aria-checked={organizationType === 'shipper'}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setOrganizationType('shipper'); }}
                  >
                    <Buildings size={28} weight={organizationType === 'shipper' ? 'fill' : 'regular'} />
                    <strong>Shipper / BCO</strong>
                    <span>Cargo owner, importer, or manufacturer</span>
                  </div>

                  <div
                    className={`register-org-card ${organizationType === 'carrier' ? 'selected' : ''}`}
                    onClick={() => setOrganizationType('carrier')}
                    role="radio"
                    aria-checked={organizationType === 'carrier'}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setOrganizationType('carrier'); }}
                  >
                    <Truck size={28} weight={organizationType === 'carrier' ? 'fill' : 'regular'} />
                    <strong>Motor Carrier</strong>
                    <span>Fleet, trucking company, or owner-operator</span>
                  </div>

                  <div
                    className={`register-org-card ${organizationType === 'broker' ? 'selected' : ''}`}
                    onClick={() => setOrganizationType('broker')}
                    role="radio"
                    aria-checked={organizationType === 'broker'}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setOrganizationType('broker'); }}
                  >
                    <UsersThree size={28} weight={organizationType === 'broker' ? 'fill' : 'regular'} />
                    <strong>Freight Broker</strong>
                    <span>3PL, freight broker, or logistics intermediary</span>
                  </div>
                </div>
              </label>

              <label htmlFor="reg-company">
                Legal Company Name
                <div className="login-field">
                  <Buildings size={20} />
                  <input
                    id="reg-company"
                    type="text"
                    placeholder="e.g. Apex Global Logistics LLC"
                    value={company}
                    onChange={(e) => {
                      setCompany(e.target.value);
                      if (error) setError('');
                    }}
                    required
                  />
                </div>
              </label>

              <label htmlFor="reg-tax-id">
                Tax ID / EIN
                <div className="login-field">
                  <IdentificationCard size={20} />
                  <input
                    id="reg-tax-id"
                    type="text"
                    placeholder="XX-XXXXXXX or 9-digit Tax ID"
                    value={taxId}
                    onChange={(e) => {
                      setTaxId(e.target.value);
                      if (error) setError('');
                    }}
                    required
                  />
                </div>
              </label>

              {error && (
                <p className="login-error" role="alert">
                  {error}
                </p>
              )}

              <div className="register-actions">
                <button
                  type="button"
                  className="register-back-btn"
                  onClick={handlePrevStep}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
                <button
                  type="submit"
                  className="btn primary login-submit"
                  style={{ marginTop: 0 }}
                >
                  Continue to Authority
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: Operating Authority & Review */}
          {step === 3 && (
            <form className="login-form" onSubmit={handleSubmitRegistration} noValidate>
              {organizationType === 'carrier' ? (
                <>
                  <div className="carrier-fmcsa-notice">
                    <ShieldCheck size={22} weight="bold" />
                    <div>
                      <strong>FMCSA SAFER Verification Notice</strong>
                      <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#78350f' }}>
                        Carrier organizations require verified MC/USDOT authority and active insurance under FR-1.1 and FR-1.6. Your account will be created with status <strong>Pending Verification</strong> until credentials are validated.
                      </p>
                    </div>
                  </div>

                  <label htmlFor="reg-mc">
                    MC / FF Number
                    <div className="login-field">
                      <Truck size={20} />
                      <input
                        id="reg-mc"
                        type="text"
                        placeholder="e.g. MC-123456"
                        value={mcNumber}
                        onChange={(e) => {
                          setMcNumber(e.target.value);
                          if (error) setError('');
                        }}
                        required
                      />
                    </div>
                  </label>

                  <label htmlFor="reg-dot">
                    USDOT Number
                    <div className="login-field">
                      <IdentificationCard size={20} />
                      <input
                        id="reg-dot"
                        type="text"
                        placeholder="e.g. DOT-1234567"
                        value={dotNumber}
                        onChange={(e) => {
                          setDotNumber(e.target.value);
                          if (error) setError('');
                        }}
                        required
                      />
                    </div>
                  </label>
                </>
              ) : null}

              {/* Review Summary */}
              <div className="register-review-box">
                <div className="register-review-section">
                  <h4>
                    <span>Account Profile</span>
                    <button
                      type="button"
                      style={{ border: 0, background: 'none', color: 'var(--blue)', fontSize: '11px', cursor: 'pointer' }}
                      onClick={() => setStep(1)}
                    >
                      Edit
                    </button>
                  </h4>
                  <div className="register-review-row">
                    <span>Full Name</span>
                    <span>{name}</span>
                  </div>
                  <div className="register-review-row">
                    <span>Email</span>
                    <span>{email}</span>
                  </div>
                  <div className="register-review-row">
                    <span>Phone</span>
                    <span>{phone}</span>
                  </div>
                </div>

                <div className="register-review-section">
                  <h4>
                    <span>Company Details</span>
                    <button
                      type="button"
                      style={{ border: 0, background: 'none', color: 'var(--blue)', fontSize: '11px', cursor: 'pointer' }}
                      onClick={() => setStep(2)}
                    >
                      Edit
                    </button>
                  </h4>
                  <div className="register-review-row">
                    <span>Legal Name</span>
                    <span>{company}</span>
                  </div>
                  <div className="register-review-row">
                    <span>Type</span>
                    <span style={{ textTransform: 'capitalize' }}>
                      {organizationType === 'carrier' ? 'Motor Carrier' : organizationType === 'broker' ? 'Freight Broker' : 'Shipper'}
                    </span>
                  </div>
                  <div className="register-review-row">
                    <span>Tax ID / EIN</span>
                    <span>{taxId}</span>
                  </div>
                  {organizationType === 'carrier' && (
                    <>
                      <div className="register-review-row">
                        <span>MC Number</span>
                        <span>{mcNumber || '—'}</span>
                      </div>
                      <div className="register-review-row">
                        <span>USDOT Number</span>
                        <span>{dotNumber || '—'}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {error && (
                <p className="login-error" role="alert">
                  {error}
                </p>
              )}

              <div className="register-actions">
                <button
                  type="button"
                  className="register-back-btn"
                  onClick={handlePrevStep}
                  disabled={loading}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
                <button
                  type="submit"
                  className="btn primary login-submit"
                  style={{ marginTop: 0 }}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="forgot-pwd-loading-spinner" />
                      Registering Company...
                    </>
                  ) : (
                    <>
                      Register Company
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 4: Success View */}
          {step === 4 && (
            <div className="register-success-card">
              {organizationType === 'carrier' ? (
                <>
                  <div className="register-success-icon-wrap pending">
                    <Clock size={36} weight="bold" />
                  </div>
                  <div className="register-status-badge pending">
                    <Clock size={14} weight="bold" />
                    <span>Status: Pending Verification</span>
                  </div>
                  <h2>Carrier Registration Submitted</h2>
                  <p>
                    Your carrier organization <strong>{company}</strong> has been registered. Because you operate as a Motor Carrier, your USDOT and MC authority are queued for FMCSA SAFER verification.
                  </p>

                  <div className="register-success-details">
                    <div className="register-success-row">
                      <span>Legal Entity:</span>
                      <span>{company}</span>
                    </div>
                    <div className="register-success-row">
                      <span>Organization Type:</span>
                      <span>Motor Carrier</span>
                    </div>
                    <div className="register-success-row">
                      <span>MC Number:</span>
                      <span>{mcNumber}</span>
                    </div>
                    <div className="register-success-row">
                      <span>USDOT Number:</span>
                      <span>{dotNumber}</span>
                    </div>
                    <div className="register-success-row">
                      <span>Company Admin:</span>
                      <span>{email}</span>
                    </div>
                    <div className="register-success-row">
                      <span>Initial Status:</span>
                      <span style={{ color: '#b45309' }}>Pending Verification</span>
                    </div>
                  </div>

                  <p style={{ fontSize: '13px', color: '#64748b' }}>
                    Once verified, you will receive an email confirmation and full dispatch and load-board capabilities will be activated.
                  </p>

                  <button
                    type="button"
                    className="btn primary login-submit"
                    onClick={handleFinishToLogin}
                  >
                    Return to Sign In
                    <ArrowRight size={16} />
                  </button>
                </>
              ) : (
                <>
                  <div className="register-success-icon-wrap active">
                    <CheckCircle size={36} weight="fill" />
                  </div>
                  <div className="register-status-badge active">
                    <CheckCircle size={14} weight="fill" />
                    <span>Status: Active Organization</span>
                  </div>
                  <h2>Company Registered Successfully</h2>
                  <p>
                    Welcome to Harbor! Your organization <strong>{company}</strong> is active. You have been assigned the <strong>Company Admin</strong> role with full access to configure your workspace.
                  </p>

                  <div className="register-success-details">
                    <div className="register-success-row">
                      <span>Legal Entity:</span>
                      <span>{company}</span>
                    </div>
                    <div className="register-success-row">
                      <span>Organization Type:</span>
                      <span style={{ textTransform: 'capitalize' }}>
                        {organizationType === 'broker' ? 'Freight Broker' : 'Shipper'}
                      </span>
                    </div>
                    <div className="register-success-row">
                      <span>Company Admin:</span>
                      <span>{email}</span>
                    </div>
                    <div className="register-success-row">
                      <span>Status:</span>
                      <span style={{ color: '#15803d' }}>Active</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn primary login-submit"
                    onClick={handleFinishToLogin}
                  >
                    Proceed to Sign In
                    <ArrowRight size={16} />
                  </button>
                </>
              )}
            </div>
          )}

          <div className="login-note" style={{ marginTop: '20px' }}>
            <ShieldCheck size={16} />
            Enterprise-grade multi-tenant security with role-based access.
          </div>
        </div>

        <footer>
          © 2026 Harbor · Global trade, more human.
        </footer>
      </section>

      <aside className="login-story">
        <div className="login-story-content">
          <span className="story-kicker">
            CONNECTED SUPPLY CHAINS
          </span>

          <h2>
            Modern freight infrastructure built for clarity.
          </h2>

          <p>
            Join shippers, carriers, and brokers orchestrating bookings, tracking shipments, and settling invoices in one unified AI-native platform.
          </p>

          <div className="login-feature">
            <Sparkle size={24} />
            <div>
              <strong>Instant Tenant Onboarding</strong>
              <small>Automated organization setup, role assignment, and branch isolation.</small>
            </div>
          </div>

          <div className="login-feature">
            <Truck size={24} />
            <div>
              <strong>Integrated Operating Authority</strong>
              <small>Continuous FMCSA SAFER compliance verification for motor carriers.</small>
            </div>
          </div>
        </div>

        <div className="login-orbit login-orbit-one" />
        <div className="login-orbit login-orbit-two" />
      </aside>
    </main>
  );
}

