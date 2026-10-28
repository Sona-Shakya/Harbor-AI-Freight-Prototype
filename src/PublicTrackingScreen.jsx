import React, { useState, useEffect } from 'react';
import {
  MagnifyingGlass,
  Package,
  Truck,
  MapPin,
  CalendarBlank,
  CheckCircle,
  WarningCircle,
  Clock,
  ArrowRight,
  X,
  ShieldCheck,
  SignIn,
  Info,
  ArrowsClockwise,
  Prohibit
} from '@phosphor-icons/react';
import { getPublicTracking } from './api';
import { sanitizePublicTrackingData } from './services/trackingSanitizer.js';
import TrackingMap from './components/tracking/TrackingMap.jsx';
import './styles/publicTracking.css';

export { sanitizePublicTrackingData };

export default function PublicTrackingScreen({ onBackToLogin, initialRef = '' }) {
  const [referenceInput, setReferenceInput] = useState(initialRef || '');
  const [searchedRef, setSearchedRef] = useState(initialRef || '');
  const [loading, setLoading] = useState(false);
  const [trackingData, setTrackingData] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null); // { type: '404' | 'error' | 'validation', message, detail }

  // Auto-search if initialRef was provided via URL
  useEffect(() => {
    if (initialRef && initialRef.trim()) {
      handleSearchReference(initialRef.trim());
    }
  }, [initialRef]);

  const handleSearchReference = async (refToSearch) => {
    const cleanRef = String(refToSearch || '').trim();
    if (!cleanRef) {
      setErrorInfo({
        type: 'validation',
        message: 'Please enter a valid tracking reference or shipment number.',
      });
      setTrackingData(null);
      return;
    }

    setErrorInfo(null);
    setLoading(true);
    setSearchedRef(cleanRef);

    // Update browser URL to /track/:ref without page reload for deep-linkability
    try {
      const targetUrl = `/track/${encodeURIComponent(cleanRef)}`;
      if (window.location.pathname !== targetUrl) {
        window.history.pushState({}, '', targetUrl);
      }
    } catch {}

    try {
      const res = await getPublicTracking(cleanRef);
      const sanitized = sanitizePublicTrackingData(res);
      setTrackingData(sanitized);
    } catch (err) {
      setTrackingData(null);
      const status = err.status || (err.message && err.message.includes('404') ? 404 : null);

      if (status === 404) {
        setErrorInfo({
          type: '404',
          message: `No shipment found matching tracking reference "${cleanRef}".`,
          detail: 'Please verify the reference number. If this shipment was just created, telemetry updates may take a few minutes to register.',
          backendNote: 'Real-time public tracking endpoint GET /v1/track/:reference returned HTTP 404.',
        });
      } else if (status === 400) {
        setErrorInfo({
          type: 'error',
          message: 'Invalid tracking reference format.',
          detail: 'Tracking references must match standard format (e.g., SHP-2026-XXXX or public token).',
        });
      } else {
        setErrorInfo({
          type: 'error',
          message: 'Unable to retrieve tracking information at this time.',
          detail: err.message || 'The tracking service encountered a network or server error. Please try again in a few moments.',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSearchReference(referenceInput);
  };

  const handleClear = () => {
    setReferenceInput('');
    setErrorInfo(null);
    setTrackingData(null);
    setSearchedRef('');
    try {
      window.history.pushState({}, '', '/track');
    } catch {}
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return null;
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'delivered':
        return 'delivered';
      case 'in_transit':
        return 'in_transit';
      case 'dispatched':
        return 'dispatched';
      case 'booked':
      case 'confirmed':
        return 'booked';
      case 'cancelled':
        return 'cancelled';
      case 'exception':
        return 'exception';
      default:
        return 'in_transit';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'in_transit':
        return 'In Transit';
      case 'dispatched':
        return 'Dispatched';
      case 'delivered':
        return 'Delivered';
      case 'booked':
      case 'confirmed':
        return 'Booked';
      case 'cancelled':
        return 'Cancelled';
      case 'exception':
        return 'Exception';
      case 'draft':
        return 'Pending Dispatch';
      default:
        return status ? status.toUpperCase() : 'UNKNOWN';
    }
  };

  return (
    <main className="login-shell track-shell">
      <section className="login-form-panel track-form-panel">
        <div className="track-header-row">
          <div className="login-brand">
            <img src="/harbor-mark.png" alt="" />
            <span>Harbor</span>
          </div>

          <button
            type="button"
            className="track-nav-signin-btn"
            onClick={onBackToLogin}
          >
            <SignIn size={16} />
            Sign in
          </button>
        </div>

        <div className="track-form-wrap">
          <div className="track-eyebrow">CARGO VISIBILITY · FR-8.3</div>
          <h1>Track Your Shipment</h1>
          <p className="track-intro">
            Check the real-time transit status, route milestones, and estimated delivery of your freight without signing in.
          </p>

          {/* Search Form */}
          <form className="track-search-bar" onSubmit={handleSubmit} role="search">
            <div className="track-search-input-wrap">
              <Package size={20} />
              <input
                type="text"
                aria-label="Shipment tracking reference"
                placeholder="Enter reference (e.g. SHP-2026-001)"
                value={referenceInput}
                onChange={(e) => {
                  setReferenceInput(e.target.value);
                  if (errorInfo?.type === 'validation') setErrorInfo(null);
                }}
                disabled={loading}
              />
              {referenceInput && (
                <button
                  type="button"
                  className="track-clear-btn"
                  onClick={handleClear}
                  aria-label="Clear search input"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <button
              type="submit"
              className="btn primary track-submit-btn"
              disabled={loading}
            >
              {loading ? 'Tracking...' : 'Track Shipment'}
            </button>
          </form>

          {/* Validation Alert */}
          {errorInfo?.type === 'validation' && (
            <div className="track-alert-banner warning" role="alert">
              <WarningCircle size={20} weight="bold" />
              <div>
                <strong>Missing Reference</strong>
                <p>{errorInfo.message}</p>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="track-loading-card" aria-live="polite">
              <div className="track-spinner" />
              <strong>Contacting Tracking Service...</strong>
              <p style={{ margin: '6px 0 0', fontSize: '13px' }}>
                Querying live telemetry for reference: <code>{searchedRef}</code>
              </p>
            </div>
          )}

          {/* 404 Not Found State */}
          {!loading && errorInfo?.type === '404' && (
            <div className="track-alert-banner warning" role="alert">
              <WarningCircle size={24} weight="bold" />
              <div>
                <strong>Shipment Not Found</strong>
                <p>{errorInfo.message}</p>
                <p style={{ marginTop: '6px', color: '#78350f' }}>{errorInfo.detail}</p>
                {errorInfo.backendNote && (
                  <p style={{ marginTop: '8px', fontSize: '11px', opacity: 0.85 }}>
                    Technical Status: {errorInfo.backendNote}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Generic/Server Error State */}
          {!loading && errorInfo?.type === 'error' && (
            <div className="track-alert-banner error" role="alert">
              <WarningCircle size={24} weight="bold" />
              <div>
                <strong>Tracking Lookup Error</strong>
                <p>{errorInfo.message}</p>
                <p style={{ marginTop: '6px' }}>{errorInfo.detail}</p>
              </div>
            </div>
          )}

          {/* Successful Tracking Result State */}
          {!loading && trackingData && (
            <div className="track-result-container">
              {/* Header with Reference & Status Pill */}
              <div className="track-result-header">
                <div>
                  <div className="track-ref-label">Tracking Reference</div>
                  <div className="track-ref-value">{trackingData.reference || searchedRef}</div>
                </div>

                <div className={`track-status-pill ${getStatusClass(trackingData.status)}`}>
                  {trackingData.status === 'delivered' ? (
                    <CheckCircle size={14} weight="bold" />
                  ) : trackingData.status === 'cancelled' ? (
                    <Prohibit size={14} weight="bold" />
                  ) : (
                    <Clock size={14} weight="bold" />
                  )}
                  <span>{getStatusLabel(trackingData.status)}</span>
                </div>
              </div>

              {/* Delivered State Banner */}
              {trackingData.status === 'delivered' && (
                <div className="track-delivered-banner">
                  <CheckCircle size={22} weight="fill" />
                  <div>
                    <strong>Delivered Successfully</strong>
                    <div style={{ fontSize: '12px' }}>
                      Cargo was delivered on {formatDate(trackingData.actualDelivery) || 'Recorded Delivery Time'}.
                    </div>
                  </div>
                </div>
              )}

              {/* Cancelled State Banner */}
              {trackingData.status === 'cancelled' && (
                <div className="track-cancelled-banner">
                  <Prohibit size={22} weight="bold" />
                  <div>
                    <strong>Shipment Cancelled</strong>
                    <div style={{ fontSize: '12px' }}>
                      This shipment booking was cancelled before final delivery.
                    </div>
                  </div>
                </div>
              )}

              {/* Route Summary */}
              <div className="track-route-card">
                <div className="track-route-grid">
                  <div className="track-route-node">
                    <span className="track-route-type">Origin</span>
                    <span className="track-route-city">{trackingData.origin}</span>
                  </div>

                  <div className="track-route-path">
                    <Truck size={22} style={{ color: 'var(--blue, #0063fa)' }} />
                    <div className="track-route-line" />
                  </div>

                  <div className="track-route-node destination">
                    <span className="track-route-type">Destination</span>
                    <span className="track-route-city">{trackingData.destination}</span>
                  </div>
                </div>
              </div>

              {/* Delivery ETA or In-Transit Telemetry */}
              <div className="track-delivery-box">
                <div className="track-delivery-item">
                  <CalendarBlank size={18} />
                  <div>
                    <span>Estimated Delivery: </span>
                    <strong>
                      {formatDate(trackingData.estimatedDelivery) || 'Pending schedule confirmation'}
                    </strong>
                  </div>
                </div>

                {trackingData.carrierName && (
                  <div className="track-delivery-item">
                    <Truck size={18} />
                    <div>
                      <span>Carrier: </span>
                      <strong>{trackingData.carrierName}</strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Interactive Geospatial Map (FR-8.1 / FR-8.3) */}
              {trackingData.currentCoordinates && (
                <div style={{ marginTop: '16px', borderRadius: '10px', overflow: 'hidden' }}>
                  <TrackingMap
                    currentLocation={trackingData.currentCoordinates}
                    referenceNumber={trackingData.reference}
                    height="280px"
                  />
                </div>
              )}

              {/* Milestone Timeline */}
              <div className="track-timeline-wrap">
                <div className="track-timeline-title">
                  <span>Shipment Milestones</span>
                  <button
                    type="button"
                    style={{ border: 0, background: 'none', color: 'var(--blue)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={() => handleSearchReference(searchedRef)}
                  >
                    <ArrowsClockwise size={14} />
                    Refresh
                  </button>
                </div>

                {trackingData.milestones.length > 0 ? (
                  <div className="track-timeline-list">
                    {trackingData.milestones.map((m, idx) => {
                      const isCompleted = m.completed;
                      const isCurrent = m.current;
                      return (
                        <div
                          key={m.id || idx}
                          className={`track-timeline-item ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}
                        >
                          <div className="track-timeline-marker">
                            {isCompleted ? (
                              <CheckCircle size={14} weight="bold" />
                            ) : (
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8' }} />
                            )}
                          </div>

                          <div className="track-timeline-content">
                            <h4>
                              {m.title}
                              {isCurrent && <span className="track-latest-tag">Latest</span>}
                            </h4>
                            <div className="track-timeline-meta">
                              {m.location && (
                                <div className="track-timeline-location">
                                  <MapPin size={13} />
                                  <span>{m.location}</span>
                                </div>
                              )}
                              {m.timestamp && (
                                <div className="track-timeline-time">
                                  <Clock size={13} />
                                  <span>{formatDate(m.timestamp)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '16px 0', color: '#64748b', fontSize: '13px' }}>
                    Shipment record initialized. Milestone check-calls and location pings will appear as cargo progresses through transit.
                  </div>
                )}

                {/* Privacy Assurance Note */}
                <div className="track-privacy-notice">
                  <ShieldCheck size={16} />
                  <span>
                    Privacy protected under FR-8.3: Commercial rates, billing invoices, and private contact information are not disclosed on public tracking views.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Initial State / Help Guide */}
          {!loading && !trackingData && !errorInfo && (
            <div className="track-info-card">
              <Info size={24} weight="bold" />
              <div>
                <strong>Where do I find my tracking reference?</strong>
                <p style={{ margin: '4px 0 8px' }}>
                  Your shipment tracking code is provided on your cargo confirmation email, Bill of Lading (BOL), or delivery receipt. References typically begin with <code>SHP-2026-</code>.
                </p>
                <div style={{ display: 'flex', gap: 16, fontSize: '12px', color: '#64748b' }}>
                  <span>✓ Live GPS transit status</span>
                  <span>✓ Milestone check-calls</span>
                  <span>✓ Estimated arrival time</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer>
          © 2026 Harbor · Global trade, more human.
        </footer>
      </section>

      <aside className="login-story">
        <div className="login-story-content">
          <span className="story-kicker">
            CONNECTED VISIBILITY · FR-8.3
          </span>

          <h2>
            Total transit transparency for cargo recipients.
          </h2>

          <p>
            Track ocean and air shipments with live milestones, telemetry updates, and automated delivery schedules.
          </p>

          <div className="login-feature">
            <Truck size={24} />
            <div>
              <strong>Verified Carrier Telemetry</strong>
              <small>Real-time geofence events and milestone updates from the dispatch board.</small>
            </div>
          </div>

          <div className="login-feature">
            <ShieldCheck size={24} />
            <div>
              <strong>Privacy-Preserving Tracking</strong>
              <small>Share shipment progress securely with recipients without exposing confidential rates or contracts.</small>
            </div>
          </div>
        </div>

        <div className="login-orbit login-orbit-one" />
        <div className="login-orbit login-orbit-two" />
      </aside>
    </main>
  );
}
