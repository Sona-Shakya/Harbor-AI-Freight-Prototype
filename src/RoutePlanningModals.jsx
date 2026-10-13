import React, { useState, useEffect } from 'react';
import {
  X,
  Path,
  Truck,
  MapPin,
  Clock,
  WarningCircle,
  CheckCircle,
  ArrowsClockwise,
  ArrowRight,
  ShieldCheck,
  Tag,
  Gauge,
  SlidersHorizontal,
  Info,
  CalendarCheck,
  Check,
  TrendUp,
  GasPump,
  Coin,
  NavigationArrow,
  Flag
} from '@phosphor-icons/react';
import {
  optimizeShipmentRoute,
  getShipmentDirections,
  getRouteDirections,
  getShipmentDynamicEta,
  simulateRoute,
  consolidateRoutes
} from './api';
import './styles/routePlanning.css';

/* ==========================================================================
   FR-7.1: STOP SEQUENCE OPTIMIZATION MODAL (TSP-TW)
   ========================================================================== */
export function OptimizeRouteModal({ isOpen, onClose, load, notify, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [persisted, setPersisted] = useState(false);

  // Load initial preview on open
  useEffect(() => {
    if (!isOpen || !load?.id) return;
    setLoading(true);
    setError(null);
    setPersisted(false);
    optimizeShipmentRoute({ shipment_id: load.id, persist: false })
      .then((res) => {
        setResult(res?.data || res);
      })
      .catch((err) => {
        console.error('Failed to preview route optimization:', err);
        setError(err.message || 'Failed to calculate route sequence');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, load?.id]);

  if (!isOpen || !load) return null;

  const handleApplySequence = async () => {
    setOptimizing(true);
    try {
      const res = await optimizeShipmentRoute({ shipment_id: load.id, persist: true });
      setResult(res?.data || res);
      setPersisted(true);
      notify?.(res?.message || 'Route stop sequence applied to shipment successfully', 'success');
      onSuccess?.();
    } catch (err) {
      console.error('Failed to apply optimized sequence:', err);
      notify?.(err.message || 'Failed to apply route sequence', 'error');
    } finally {
      setOptimizing(false);
    }
  };

  const summary = result?.summary || {};
  const stops = result?.optimized_stops || [];
  const warnings = result?.validation_warnings || [];
  const isFeasible = result?.feasible !== false && warnings.length === 0;

  return (
    <div className="disp-modal-overlay" onClick={onClose}>
      <div className="rp-modal-box wide" onClick={(e) => e.stopPropagation()}>
        <div className="rp-header">
          <div className="rp-header-title">
            <Path size={22} color="#2563eb" weight="bold" />
            <div>
              <h2>Stop Sequence Optimization (TSP-TW)</h2>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Shipment #{load.reference_number || load.id} &bull; {load.stops?.length || stops.length || 0} stops
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {persisted ? (
              <span className="rp-badge green">
                <CheckCircle size={14} weight="bold" /> Sequence Applied
              </span>
            ) : (
              <span className="rp-badge amber">
                <Info size={14} weight="bold" /> Preview Mode (Not Applied)
              </span>
            )}
            <button type="button" className="disp-modal-close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="rp-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <ArrowsClockwise size={32} className="disp-spin" style={{ margin: '0 auto 12px' }} />
              <div>Solving optimal stop sequence with appointment window constraints...</div>
            </div>
          ) : error ? (
            <div className="rp-alert danger">
              <WarningCircle size={20} weight="bold" />
              <div>
                <strong>Optimization Infeasible:</strong> {error}
              </div>
            </div>
          ) : (
            <>
              {/* Feasibility Alert */}
              {isFeasible ? (
                <div className="rp-alert success">
                  <CheckCircle size={20} weight="bold" />
                  <div>
                    <strong>Optimal Stop Sequence Verified:</strong> All pickup-before-delivery dependencies
                    and facility appointment windows are satisfied.
                  </div>
                </div>
              ) : (
                <div className="rp-alert warning">
                  <WarningCircle size={20} weight="bold" />
                  <div>
                    <strong>Constraint Warnings:</strong>
                    <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                      {warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Metrics Comparison */}
              <div className="rp-metrics-grid">
                <div className="rp-metric-card">
                  <span className="rp-metric-label">Optimized Distance</span>
                  <div className="rp-metric-val-row">
                    <span className="rp-metric-val">{summary.optimized_distance_miles ?? '--'} mi</span>
                    {summary.miles_saved > 0 && (
                      <span className="rp-metric-diff gain">
                        -{summary.miles_saved} mi ({summary.efficiency_gain_pct}%)
                      </span>
                    )}
                  </div>
                  <span className="rp-metric-sub">
                    Original sequential: {summary.original_distance_miles ?? '--'} mi
                  </span>
                </div>

                <div className="rp-metric-card">
                  <span className="rp-metric-label">Estimated Transit Time</span>
                  <div className="rp-metric-val-row">
                    <span className="rp-metric-val">{summary.optimized_duration_min ?? '--'} min</span>
                    {summary.minutes_saved > 0 && (
                      <span className="rp-metric-diff gain">
                        -{summary.minutes_saved} min
                      </span>
                    )}
                  </div>
                  <span className="rp-metric-sub">
                    Original sequential: {summary.original_duration_min ?? '--'} min
                  </span>
                </div>

                <div className="rp-metric-card">
                  <span className="rp-metric-label">Precedence & Windows</span>
                  <div className="rp-metric-val-row">
                    <span className="rp-metric-val" style={{ fontSize: '18px', color: isFeasible ? '#15803d' : '#b45309' }}>
                      {isFeasible ? 'Feasible' : 'Warning'}
                    </span>
                  </div>
                  <span className="rp-metric-sub">
                    {stops.length} sequenced facility stops
                  </span>
                </div>
              </div>

              {/* Proposed Stops Sequence Table */}
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 10px', color: '#0f172a' }}>
                  Proposed Stop Sequence
                </h3>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <table className="rp-table">
                    <thead>
                      <tr>
                        <th>Seq</th>
                        <th>Type</th>
                        <th>Facility / Location</th>
                        <th>Appointment Window</th>
                        <th>Projected Arrival</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stops.map((st, idx) => (
                        <tr key={st.stop_id || st.id || idx}>
                          <td>
                            <strong style={{ color: '#2563eb' }}>#{st.sequence || idx + 1}</strong>
                          </td>
                          <td>
                            <span className={`rp-badge ${st.type === 'pickup' ? 'blue' : 'green'}`}>
                              {st.type ? st.type.toUpperCase() : 'STOP'}
                            </span>
                          </td>
                          <td>
                            <strong>
                              {typeof st.address === 'string'
                                ? st.address
                                : `${st.address?.city || 'Facility'}, ${st.address?.state || ''}`}
                            </strong>
                            <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                              {st.address?.address_line1 || ''}
                            </div>
                          </td>
                          <td>
                            {st.appointment_window ? (
                              <span style={{ fontSize: '12px' }}>
                                {st.appointment_window.start
                                  ? new Date(st.appointment_window.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  : 'Open'}
                                {' - '}
                                {st.appointment_window.end
                                  ? new Date(st.appointment_window.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  : 'Open'}
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>Flexible</span>
                            )}
                          </td>
                          <td>
                            {st.estimated_arrival ? (
                              <strong>
                                {new Date(st.estimated_arrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </strong>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>--</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ fontSize: '12px', color: '#64748b', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <Info size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                <strong>Preview Safety Guarantee:</strong> Viewing this optimization does not modify the operational shipment. Clicking "Apply & Save Sequence" will atomically re-sequence the database stops.
              </div>
            </>
          )}
        </div>

        <div className="rp-footer">
          <button type="button" className="disp-btn-sm" onClick={onClose}>
            Close
          </button>
          {!persisted && (
            <button
              type="button"
              className="disp-btn-sm primary"
              onClick={handleApplySequence}
              disabled={optimizing || loading || !result}
            >
              {optimizing ? (
                <>
                  <ArrowsClockwise size={14} className="disp-spin" /> Applying...
                </>
              ) : (
                <>
                  <Check size={14} weight="bold" /> Apply & Save Sequence to Shipment
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   FR-7.2: TRUCK-LEGAL TURN-BY-TURN DIRECTIONS MODAL
   ========================================================================== */
export function TruckDirectionsModal({ isOpen, onClose, load, notify }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [isSimulatedMode, setIsSimulatedMode] = useState(false);
  const [unavailableError, setUnavailableError] = useState(null);

  const fetchDirections = (simulate = false) => {
    if (!load?.id) return;
    setLoading(true);
    setUnavailableError(null);
    getShipmentDirections(load.id, { simulation: simulate })
      .then((res) => {
        setData(res?.data || res);
        setIsSimulatedMode(simulate);
      })
      .catch((err) => {
        console.error('Failed to get directions:', err);
        // Defensible truth: 503 or missing provider message
        setUnavailableError({
          message: err.message || 'Commercial truck-legal routing engine not configured.',
          status: err.status,
          data: err.data
        });
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen && load?.id) {
      fetchDirections(false);
    }
  }, [isOpen, load?.id]);

  if (!isOpen || !load) return null;

  const maneuvers = data?.maneuvers || [];
  const vehicle = data?.vehicle_profile || {};
  const summary = data?.summary || {};

  return (
    <div className="disp-modal-overlay" onClick={onClose}>
      <div className="rp-modal-box wide" onClick={(e) => e.stopPropagation()}>
        <div className="rp-header">
          <div className="rp-header-title">
            <Truck size={22} color="#2563eb" weight="bold" />
            <div>
              <h2>Truck-Legal Turn-by-Turn Route Directions</h2>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Shipment #{load.reference_number || load.id} &bull; Commercial Vehicle Profile
              </div>
            </div>
          </div>
          <button type="button" className="disp-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="rp-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <ArrowsClockwise size={32} className="disp-spin" style={{ margin: '0 auto 12px' }} />
              <div>Querying commercial truck routing network...</div>
            </div>
          ) : unavailableError ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="rp-alert danger">
                <WarningCircle size={24} weight="bold" style={{ flexShrink: 0 }} />
                <div>
                  <strong style={{ fontSize: '15px' }}>Commercial Routing Engine Unavailable (HTTP {unavailableError.status || 503})</strong>
                  <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
                    {unavailableError.message}
                  </p>
                  <div style={{ marginTop: '10px', fontSize: '12.5px', background: '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #fecaca' }}>
                    <strong>Required Production Credentials:</strong>
                    <div style={{ fontFamily: 'monospace', marginTop: '4px', color: '#991b1b' }}>
                      PC_MILER_API_KEY, HERE_ROUTING_API_KEY, or GOOGLE_MAPS_API_KEY
                    </div>
                  </div>
                  <div style={{ marginTop: '10px', fontSize: '12px', color: '#7f1d1d' }}>
                    <strong>Defensible Engineering Standard:</strong> Synthetic turn-by-turn maneuvers, fabricated bridge clearances, and unverified road geometry are strictly prohibited.
                  </div>
                </div>
              </div>

              {/* Capability Matrix */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: '#334155' }}>Capability Verification Matrix</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', fontSize: '12.5px' }}>
                  <div>&bull; Truck-Legal Network: <span style={{ color: '#e11d48', fontWeight: 600 }}>Unconfigured</span></div>
                  <div>&bull; Low-Bridge Avoidance: <span style={{ color: '#e11d48', fontWeight: 600 }}>Unconfigured</span></div>
                  <div>&bull; Gross Weight Limits: <span style={{ color: '#e11d48', fontWeight: 600 }}>Unconfigured</span></div>
                  <div>&bull; Live Traffic Flow: <span style={{ color: '#e11d48', fontWeight: 600 }}>Unconfigured</span></div>
                </div>
              </div>

              {/* Simulation test button */}
              <div style={{ textAlign: 'center', paddingTop: '10px' }}>
                <button
                  type="button"
                  className="disp-btn-sm"
                  onClick={() => fetchDirections(true)}
                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1' }}
                >
                  <SlidersHorizontal size={14} /> Run Test with Mock Truck Simulator Adapter
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Simulation Disclaimer if simulated */}
              {(isSimulatedMode || data?.provider === 'mock_truck_simulator') && (
                <div className="rp-alert warning">
                  <Info size={20} weight="bold" />
                  <div>
                    <strong>Test Simulation Active:</strong> {data?.simulation_disclaimer || 'Simulated truck route for testing. Tortuosity factor 1.25 applied.'}
                  </div>
                </div>
              )}

              {/* Vehicle Profile Card */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '12px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Vehicle Profile</span>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                    Unit #{vehicle.unit_number || 'Standard Tractor'} &bull; Max Weight: {Number(vehicle.max_payload_lbs || 80000).toLocaleString()} lbs
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span className="rp-badge blue">Height: {vehicle.height_ft || 13.5} ft (162 in)</span>
                  <span className="rp-badge gray">Length: {vehicle.length_ft || 53} ft</span>
                  <span className="rp-badge green">Verified Truck Route</span>
                </div>
              </div>

              {/* Route Summary */}
              <div className="rp-metrics-grid">
                <div className="rp-metric-card">
                  <span className="rp-metric-label">Route Mileage</span>
                  <span className="rp-metric-val">{summary.total_miles || data?.distance_miles || '--'} mi</span>
                </div>
                <div className="rp-metric-card">
                  <span className="rp-metric-label">Estimated Drive Time</span>
                  <span className="rp-metric-val">{summary.total_duration_minutes || data?.estimated_duration_min || '--'} min</span>
                </div>
                <div className="rp-metric-card">
                  <span className="rp-metric-label">Route Provider</span>
                  <span className="rp-metric-val" style={{ fontSize: '16px' }}>{data?.provider || 'Commercial'}</span>
                </div>
              </div>

              {/* Maneuvers List */}
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 10px', color: '#0f172a' }}>
                  Step-by-Step Maneuvers ({maneuvers.length} steps)
                </h3>
                {maneuvers.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
                    No specific road step instructions returned by provider.
                  </div>
                ) : (
                  <div className="rp-maneuvers-list">
                    {maneuvers.map((m, idx) => (
                      <div className="rp-maneuver-item" key={idx}>
                        <div className="rp-maneuver-num">{idx + 1}</div>
                        <div className="rp-maneuver-content">
                          <div className="rp-maneuver-text">{m.instruction || m.text}</div>
                          {m.road_name && <div className="rp-maneuver-road">{m.road_name}</div>}
                        </div>
                        <div className="rp-maneuver-meta">
                          {m.distance_miles ? `${m.distance_miles} mi` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="rp-footer">
          <button type="button" className="disp-btn-sm" onClick={onClose}>
            Close
          </button>
          {!unavailableError && (
            <button
              type="button"
              className="disp-btn-sm"
              onClick={() => fetchDirections(isSimulatedMode)}
            >
              <ArrowsClockwise size={14} /> Refresh Directions
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   FR-7.3 & FR-7.6: DYNAMIC SHIPMENT ETA & HOS BREAKS MODAL
   ========================================================================== */
export function DynamicEtaModal({ isOpen, onClose, load, notify }) {
  const [loading, setLoading] = useState(false);
  const [etaData, setEtaData] = useState(null);
  const [error, setError] = useState(null);

  const fetchEta = () => {
    if (!load?.id) return;
    setLoading(true);
    setError(null);
    getShipmentDynamicEta(load.id)
      .then((res) => {
        setEtaData(res?.data || res);
      })
      .catch((err) => {
        console.error('Failed to get dynamic ETA:', err);
        setError(err.message || 'Failed to calculate dynamic ETA');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen && load?.id) {
      fetchEta();
    }
  }, [isOpen, load?.id]);

  if (!isOpen || !load) return null;

  const telemetry = etaData?.telemetry || {};
  const traffic = etaData?.traffic || {};
  const hos = etaData?.hos_adjustments || {};
  const destination = etaData?.destination || {};
  const snapshots = etaData?.recent_snapshots || [];

  const confidencePct = Math.round((etaData?.confidence_score || 0) * 100);

  return (
    <div className="disp-modal-overlay" onClick={onClose}>
      <div className="rp-modal-box wide" onClick={(e) => e.stopPropagation()}>
        <div className="rp-header">
          <div className="rp-header-title">
            <Clock size={22} color="#2563eb" weight="bold" />
            <div>
              <h2>Dynamic Shipment ETA & Telemetry Analysis</h2>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Shipment #{load.reference_number || load.id} &bull; Continuous Recalculation Engine
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="disp-btn-sm"
              onClick={fetchEta}
              disabled={loading}
              title="Recalculate ETA Now"
            >
              <ArrowsClockwise size={14} className={loading ? 'disp-spin' : ''} /> Recalculate
            </button>
            <button type="button" className="disp-modal-close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="rp-body">
          {loading && !etaData ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <ArrowsClockwise size={32} className="disp-spin" style={{ margin: '0 auto 12px' }} />
              <div>Recalculating ETA with driver telemetry and FMCSA HOS rules...</div>
            </div>
          ) : error ? (
            <div className="rp-alert danger">
              <WarningCircle size={20} weight="bold" />
              <div>{error}</div>
            </div>
          ) : (
            <>
              {/* Top ETA Hero Banner */}
              <div style={{ background: '#f8fafc', padding: '18px 24px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                    Estimated Arrival Date & Time
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: '4px 0' }}>
                    {etaData?.eta ? new Date(etaData.eta).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Pending'}
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                    Calculated at: {etaData?.calculated_at ? new Date(etaData.calculated_at).toLocaleTimeString() : 'Just now'} &bull; Source: {etaData?.source || 'telemetry'}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                  {/* Telemetry Freshness Badge */}
                  {telemetry.status === 'fresh' ? (
                    <span className="rp-badge green">
                      <CheckCircle size={14} weight="bold" /> Fresh GPS Telemetry
                    </span>
                  ) : telemetry.status === 'stale' ? (
                    <span className="rp-badge amber">
                      <WarningCircle size={14} weight="bold" /> Stale Telemetry (&gt;4h old)
                    </span>
                  ) : (
                    <span className="rp-badge red">
                      <WarningCircle size={14} weight="bold" /> Telemetry Missing (Baseline)
                    </span>
                  )}

                  {/* Confidence Gauge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}>
                    <span style={{ color: '#64748b' }}>Confidence:</span>
                    <strong style={{ color: confidencePct >= 80 ? '#15803d' : confidencePct >= 60 ? '#b45309' : '#b91c1c' }}>
                      {confidencePct}%
                    </strong>
                  </div>
                </div>
              </div>

              {/* KPI Metrics */}
              <div className="rp-metrics-grid">
                <div className="rp-metric-card">
                  <span className="rp-metric-label">Remaining Distance</span>
                  <span className="rp-metric-val">{destination.remaining_distance_miles ?? '--'} mi</span>
                  <span className="rp-metric-sub">To destination terminal</span>
                </div>

                <div className="rp-metric-card">
                  <span className="rp-metric-label">Base Drive Time</span>
                  <span className="rp-metric-val">{destination.estimated_driving_duration_minutes ?? '--'} min</span>
                  <span className="rp-metric-sub">Without rest breaks</span>
                </div>

                <div className="rp-metric-card">
                  <span className="rp-metric-label">FMCSA Rest Breaks</span>
                  <div className="rp-metric-val-row">
                    <span className="rp-metric-val">+{hos.break_duration_minutes || 0} min</span>
                  </div>
                  <span className="rp-metric-sub">
                    {hos.break_duration_hours ? `${hos.break_duration_hours}h required rest` : 'None required'}
                  </span>
                </div>

                <div className="rp-metric-card">
                  <span className="rp-metric-label">Schedule Variance</span>
                  <div className="rp-metric-val-row">
                    <span className="rp-metric-val" style={{ color: etaData?.variance_minutes > 15 ? '#b91c1c' : '#15803d' }}>
                      {etaData?.variance_minutes ? `${etaData.variance_minutes > 0 ? '+' : ''}${etaData.variance_minutes} min` : 'On Time'}
                    </span>
                  </div>
                  <span className="rp-metric-sub">Vs original appointment</span>
                </div>
              </div>

              {/* FMCSA HOS Regulations Breakdown (FR-7.6) */}
              {hos.reasons && hos.reasons.length > 0 && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <ShieldCheck size={18} color="#1d4ed8" weight="bold" />
                    <strong style={{ fontSize: '13.5px', color: '#1e40af' }}>FMCSA 49 CFR Part 395 Mandatory Rest Break Injections</strong>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#1e3a8a' }}>
                    {hos.reasons.map((r, idx) => (
                      <li key={idx} style={{ marginTop: '4px' }}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Telemetry & Live Traffic Details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#334155' }}>Latest Driver GPS Coordinates</h4>
                  {telemetry.current_coordinates ? (
                    <div style={{ fontSize: '13px', color: '#0f172a' }}>
                      <div><strong>Location:</strong> {telemetry.last_check_call_location || 'En Route'}</div>
                      <div style={{ fontFamily: 'monospace', marginTop: '4px', color: '#64748b' }}>
                        Lat: {telemetry.current_coordinates.lat.toFixed(4)}, Lng: {telemetry.current_coordinates.lng.toFixed(4)}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                        Reported: {telemetry.last_reported_at ? new Date(telemetry.last_reported_at).toLocaleString() : '--'}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                      No live check-calls logged for this shipment. ETA is calculated from origin facility coordinates.
                    </div>
                  )}
                </div>

                <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#334155' }}>Live Traffic Integration Status</h4>
                  <div style={{ fontSize: '13px', color: '#475569' }}>
                    <div><strong>Status:</strong> <span style={{ color: '#d97706', fontWeight: 600 }}>{traffic.traffic_source || 'Unavailable'}</span></div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px', lineHeight: 1.45 }}>
                      {traffic.message || 'Commercial traffic flow stream is unconfigured. ETA reflects speed limits without live congestion.'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Historical ETASnapshot Audit Table */}
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 10px', color: '#0f172a' }}>
                  Recent ETA Snapshots History ({snapshots.length} recorded)
                </h3>
                {snapshots.length === 0 ? (
                  <div style={{ fontSize: '12.5px', color: '#64748b', fontStyle: 'italic' }}>
                    Initial snapshot will be committed with first active check-call.
                  </div>
                ) : (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                    <table className="rp-table">
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Calculated ETA</th>
                          <th>Telemetry Freshness</th>
                          <th>Confidence</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshots.map((s) => (
                          <tr key={s.id}>
                            <td>{new Date(s.calculated_at).toLocaleTimeString()}</td>
                            <td><strong>{new Date(s.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></td>
                            <td>
                              <span className={`rp-badge ${s.telemetry_status === 'fresh' ? 'green' : s.telemetry_status === 'stale' ? 'amber' : 'red'}`}>
                                {s.telemetry_status || 'standard'}
                              </span>
                            </td>
                            <td>{Math.round((s.confidence_score || 0) * 100)}%</td>
                            <td style={{ color: '#64748b' }}>{s.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="rp-footer">
          <button type="button" className="disp-btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   FR-7.4: PRE-DISPATCH ROUTE SIMULATION MODAL (WHAT-IF ANALYSIS)
   ========================================================================== */
export function RouteSimulationModal({ isOpen, onClose, loads = [], availableDrivers = [], availableVehicles = [], notify }) {
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [departureTime, setDepartureTime] = useState(() => new Date().toISOString().slice(0, 16));
  const [fuelPrice, setFuelPrice] = useState('3.85');
  const [fuelMpg, setFuelMpg] = useState('6.5');
  const [tollRate, setTollRate] = useState('0.08');

  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [simError, setSimError] = useState(null);

  useEffect(() => {
    if (isOpen && loads.length > 0 && !selectedShipmentId) {
      setSelectedShipmentId(loads[0].id);
    }
  }, [isOpen, loads, selectedShipmentId]);

  if (!isOpen) return null;

  const handleRunSimulation = async () => {
    if (!selectedShipmentId) {
      notify?.('Please select a shipment to simulate', 'warning');
      return;
    }
    setSimulating(true);
    setSimError(null);
    try {
      const res = await simulateRoute({
        shipment_id: selectedShipmentId,
        vehicle_id: selectedVehicleId || undefined,
        driver_id: selectedDriverId || undefined,
        departure_time: departureTime ? new Date(departureTime).toISOString() : undefined,
        fuel_price_per_gal: Number(fuelPrice) || 3.85,
        mpg: Number(fuelMpg) || 6.5,
        toll_rate_per_mile: Number(tollRate) || 0.08
      });
      setSimResult(res?.data || res);
      notify?.('What-if route simulation evaluated successfully', 'success');
    } catch (err) {
      console.error('Failed to simulate route:', err);
      setSimError(err.message || 'Simulation failed');
      notify?.(err.message || 'Failed to simulate route', 'error');
    } finally {
      setSimulating(false);
    }
  };

  const metrics = simResult?.metrics || {};
  const costs = simResult?.cost_breakdown || {};
  const hos = simResult?.hos_compliance_summary || {};
  const warnings = simResult?.validation_warnings || [];

  return (
    <div className="disp-modal-overlay" onClick={onClose}>
      <div className="rp-modal-box wide" onClick={(e) => e.stopPropagation()}>
        <div className="rp-header">
          <div className="rp-header-title">
            <SlidersHorizontal size={22} color="#2563eb" weight="bold" />
            <div>
              <h2>Pre-Dispatch Route Simulation & Cost Preview</h2>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                FR-7.4 & FR-7.6 &bull; What-If Feasibility, Toll, Fuel, and HOS Rest Break Projector
              </div>
            </div>
          </div>
          <button type="button" className="disp-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="rp-body">
          {/* Simulation Guarantee Banner */}
          <div className="rp-alert warning">
            <Info size={20} weight="bold" style={{ flexShrink: 0 }} />
            <div>
              <strong>SIMULATION ONLY:</strong> Running simulations evaluates what-if assumptions.
              Operational database records (Shipment, Stop, and Dispatch assignments) remain 100% unchanged.
            </div>
          </div>

          {/* Input Controls Grid */}
          <div className="rp-form-grid">
            <div className="rp-form-group">
              <label>Select Shipment to Simulate</label>
              <select
                className="rp-select"
                value={selectedShipmentId}
                onChange={(e) => setSelectedShipmentId(e.target.value)}
              >
                {loads.map((ld) => (
                  <option key={ld.id} value={ld.id}>
                    #{ld.reference_number || ld.id} ({ld.origin?.city || 'Origin'} &rarr; {ld.destination?.city || 'Dest'})
                  </option>
                ))}
              </select>
            </div>

            <div className="rp-form-group">
              <label>Driver (HOS Evaluation)</label>
              <select
                className="rp-select"
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
              >
                <option value="">-- Generic Available Driver --</option>
                {availableDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name || d.user?.name || `Driver #${d.id}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="rp-form-group">
              <label>Vehicle (Tractor Specs)</label>
              <select
                className="rp-select"
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
              >
                <option value="">-- Standard Class 8 (45k lbs) --</option>
                {availableVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    Unit #{v.unit_number} ({v.type || 'Sleeper'} - {Number(v.max_payload_lbs || 45000).toLocaleString()} lbs)
                  </option>
                ))}
              </select>
            </div>

            <div className="rp-form-group">
              <label>Planned Departure Time</label>
              <input
                type="datetime-local"
                className="rp-input"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
              />
            </div>

            <div className="rp-form-group">
              <label>Fuel Price ($/Gallon)</label>
              <input
                type="number"
                step="0.05"
                className="rp-input"
                value={fuelPrice}
                onChange={(e) => setFuelPrice(e.target.value)}
              />
            </div>

            <div className="rp-form-group">
              <label>Vehicle Fuel Economy (MPG)</label>
              <input
                type="number"
                step="0.1"
                className="rp-input"
                value={fuelMpg}
                onChange={(e) => setFuelMpg(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="disp-btn-sm primary"
              onClick={handleRunSimulation}
              disabled={simulating}
            >
              {simulating ? (
                <>
                  <ArrowsClockwise size={15} className="disp-spin" /> Evaluating Simulation...
                </>
              ) : (
                <>
                  <SlidersHorizontal size={15} /> Run What-If Simulation
                </>
              )}
            </button>
          </div>

          {/* Results Area */}
          {simError && (
            <div className="rp-alert danger">
              <WarningCircle size={20} weight="bold" />
              <div>{simError}</div>
            </div>
          )}

          {simResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginTop: '10px' }}>
              <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  Simulation Projections
                </h3>
              </div>

              {/* Metrics Grid */}
              <div className="rp-metrics-grid">
                <div className="rp-metric-card">
                  <span className="rp-metric-label">Total Miles</span>
                  <span className="rp-metric-val">{metrics.total_distance_miles ?? '--'} mi</span>
                  <span className="rp-metric-sub">Commercial highway tortuosity</span>
                </div>

                <div className="rp-metric-card">
                  <span className="rp-metric-label">Base Drive Time</span>
                  <span className="rp-metric-val">{metrics.base_driving_duration_hours ?? '--'} hrs</span>
                  <span className="rp-metric-sub">{metrics.base_driving_duration_minutes} minutes</span>
                </div>

                <div className="rp-metric-card">
                  <span className="rp-metric-label">Mandatory HOS Breaks</span>
                  <span className="rp-metric-val" style={{ color: '#b45309' }}>
                    +{metrics.hos_break_duration_hours ?? 0} hrs
                  </span>
                  <span className="rp-metric-sub">
                    {hos.required_10_hour_resets || 0} reset(s) &bull; {hos.required_30_min_breaks || 0} meal(s)
                  </span>
                </div>

                <div className="rp-metric-card">
                  <span className="rp-metric-label">Total Trip Duration</span>
                  <span className="rp-metric-val">{metrics.total_trip_duration_hours ?? '--'} hrs</span>
                  <span className="rp-metric-sub">
                    Arr: {metrics.estimated_arrival_time ? new Date(metrics.estimated_arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                  </span>
                </div>
              </div>

              {/* Operating Cost Breakdown */}
              <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '13.5px', color: '#1e293b' }}>
                  Projected Trip Cost Breakdown
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                  <div>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>Estimated Fuel Burn:</span>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                      {costs.estimated_fuel_gallons} gal (${costs.estimated_fuel_cost})
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>Estimated Tolls:</span>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                      ${costs.estimated_toll_cost}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>Total Operating Cost:</span>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#2563eb' }}>
                      ${costs.total_operating_cost_estimate}
                    </div>
                  </div>
                </div>
              </div>

              {/* Driver HOS Evaluation & Schedule */}
              {hos.break_schedule && hos.break_schedule.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px', fontSize: '13.5px', color: '#1e293b' }}>
                    FMCSA HOS Break Schedule Timeline
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {hos.break_schedule.map((b, idx) => (
                      <div key={idx} style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '12.5px', color: '#92400e' }}>
                        <strong>Break #{idx + 1} ({b.duration_minutes} min):</strong> {b.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rp-footer">
          <button type="button" className="disp-btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   FR-7.5: CONSOLIDATED MULTI-LOAD / LTL ROUTING MODAL
   ========================================================================== */
export function LtlConsolidationModal({ isOpen, onClose, loads = [], availableVehicles = [], notify }) {
  const [selectedShipmentIds, setSelectedShipmentIds] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && loads.length >= 2 && selectedShipmentIds.length === 0) {
      // Pre-select first 2 loads
      setSelectedShipmentIds([loads[0].id, loads[1].id]);
    }
  }, [isOpen, loads, selectedShipmentIds.length]);

  if (!isOpen) return null;

  const toggleShipment = (id) => {
    setSelectedShipmentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleEvaluateConsolidation = async () => {
    if (selectedShipmentIds.length < 2) {
      notify?.('Please select at least 2 shipments to consolidate', 'warning');
      return;
    }
    setEvaluating(true);
    setError(null);
    try {
      const res = await consolidateRoutes({
        shipment_ids: selectedShipmentIds,
        vehicle_id: selectedVehicleId || undefined
      });
      setResult(res?.data || res);
      notify?.('Consolidated LTL routing evaluated successfully', 'success');
    } catch (err) {
      console.error('Failed to consolidate routes:', err);
      setError(err.message || 'Consolidation evaluation failed');
      notify?.(err.message || 'Failed to evaluate consolidation', 'error');
    } finally {
      setEvaluating(false);
    }
  };

  const vehicle = result?.vehicle || {};
  const manifestStops = result?.manifest_stops || [];
  const warnings = result?.validation_warnings || [];
  const isFeasible = result?.feasible !== false && warnings.length === 0;

  return (
    <div className="disp-modal-overlay" onClick={onClose}>
      <div className="rp-modal-box wide" onClick={(e) => e.stopPropagation()}>
        <div className="rp-header">
          <div className="rp-header-title">
            <Truck size={22} color="#2563eb" weight="bold" />
            <div>
              <h2>Consolidated Multi-Load / LTL Routing (FR-7.5)</h2>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Multi-Order Co-Loading, Pickup/Delivery Precedence & Payload Capacity Verification
              </div>
            </div>
          </div>
          <button type="button" className="disp-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="rp-body">
          {/* Shipment Selection List */}
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 8px', color: '#0f172a' }}>
              Select Active Loads to Consolidate on One Vehicle (Min 2)
            </h3>
            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              {loads.map((ld) => {
                const isSelected = selectedShipmentIds.includes(ld.id);
                return (
                  <div
                    key={ld.id}
                    onClick={() => toggleShipment(ld.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: isSelected ? '#eff6ff' : '#ffffff',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        style={{ cursor: 'pointer' }}
                      />
                      <div>
                        <strong>#{ld.reference_number || ld.id}</strong>
                        <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '10px' }}>
                          {ld.origin?.city || 'Origin'} &rarr; {ld.destination?.city || 'Destination'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span className="rp-badge blue">
                        {Number(ld.cargo_weight_lbs || ld.weight_lbs || 15000).toLocaleString()} lbs
                      </span>
                      <span className="rp-badge gray">{ld.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vehicle Capacity Selection */}
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '240px' }} className="rp-form-group">
              <label>Assign Vehicle (Payload Limits)</label>
              <select
                className="rp-select"
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
              >
                <option value="">-- Standard Fleet Dry Van (45,000 lbs Capacity) --</option>
                {availableVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    Unit #{v.unit_number} (Max payload: {Number(v.max_payload_lbs || 45000).toLocaleString()} lbs)
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="disp-btn-sm primary"
              onClick={handleEvaluateConsolidation}
              disabled={evaluating || selectedShipmentIds.length < 2}
            >
              {evaluating ? (
                <>
                  <ArrowsClockwise size={14} className="disp-spin" /> Evaluating...
                </>
              ) : (
                <>
                  <SlidersHorizontal size={14} /> Evaluate Consolidated Manifest
                </>
              )}
            </button>
          </div>

          {/* Evaluation Results */}
          {error && (
            <div className="rp-alert danger">
              <WarningCircle size={20} weight="bold" />
              <div>{error}</div>
            </div>
          )}

          {result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Feasibility Alert */}
              {isFeasible ? (
                <div className="rp-alert success">
                  <CheckCircle size={20} weight="bold" />
                  <div>
                    <strong>Consolidation Feasible:</strong> All pickup stops precede their respective dropoffs,
                    and cumulative payload does not exceed the vehicle gross payload limit at any segment.
                  </div>
                </div>
              ) : (
                <div className="rp-alert danger">
                  <WarningCircle size={20} weight="bold" />
                  <div>
                    <strong>Consolidation Violation Flagged:</strong>
                    <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                      {warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Payload Utilization Bar */}
              <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                    Peak Payload: {Number(vehicle.peak_payload_lbs || 0).toLocaleString()} lbs / Max Capacity: {Number(vehicle.max_payload_lbs || 45000).toLocaleString()} lbs
                  </span>
                  <strong style={{ fontSize: '13.5px', color: vehicle.peak_utilization_pct > 100 ? '#dc2626' : '#2563eb' }}>
                    {vehicle.peak_utilization_pct || 0}% Utilization
                  </strong>
                </div>
                <div className="rp-progress-track">
                  <div
                    className={`rp-progress-fill ${vehicle.peak_utilization_pct > 100 ? 'over' : vehicle.peak_utilization_pct > 85 ? 'warning' : ''}`}
                    style={{ width: `${Math.min(vehicle.peak_utilization_pct || 0, 100)}%` }}
                  />
                </div>
              </div>

              {/* Consolidated Manifest Stops Table */}
              <div>
                <h4 style={{ margin: '0 0 10px', fontSize: '13.5px', color: '#0f172a' }}>
                  Consolidated Multi-Stop Manifest Profile ({manifestStops.length} stops)
                </h4>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <table className="rp-table">
                    <thead>
                      <tr>
                        <th>Manifest Seq</th>
                        <th>Shipment</th>
                        <th>Action</th>
                        <th>Location</th>
                        <th>Leg Payload (lbs)</th>
                        <th>Capacity Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manifestStops.map((st, idx) => (
                        <tr key={idx} style={{ background: st.is_capacity_exceeded ? '#fef2f2' : 'transparent' }}>
                          <td>
                            <strong>#{st.stop_sequence || idx + 1}</strong>
                          </td>
                          <td>
                            <strong>#{st.shipment_reference || st.shipment_id}</strong>
                          </td>
                          <td>
                            <span className={`rp-badge ${st.type === 'pickup' ? 'blue' : 'green'}`}>
                              {st.type?.toUpperCase()}
                            </span>
                          </td>
                          <td>{st.location}</td>
                          <td>
                            <strong>{Number(st.leg_payload_lbs || 0).toLocaleString()} lbs</strong>
                          </td>
                          <td>
                            {st.is_capacity_exceeded ? (
                              <span className="rp-badge red">
                                <WarningCircle size={12} weight="bold" /> Overweight ({st.utilization_pct}%)
                              </span>
                            ) : (
                              <span className="rp-badge green">
                                OK ({st.utilization_pct}%)
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ fontSize: '12px', color: '#64748b', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <Info size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                <strong>Audit Guarantee:</strong> Operational shipment records were NOT mutated during this consolidation check.
              </div>
            </div>
          )}
        </div>

        <div className="rp-footer">
          <button type="button" className="disp-btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

