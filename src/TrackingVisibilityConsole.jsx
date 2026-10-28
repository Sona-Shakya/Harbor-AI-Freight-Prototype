import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  NavigationArrow,
  MapPin,
  Clock,
  ShieldCheck,
  WarningCircle,
  ArrowsClockwise,
  ShareNetwork,
  DownloadSimple,
  Plus,
  Trash,
  CheckCircle,
  Truck,
  Broadcast,
  Compass,
  Gauge,
  Calendar,
  X,
  Copy,
  Info,
  Sliders,
  Check
} from '@phosphor-icons/react';
import {
  getShipmentCurrentLocation,
  getShipmentLocationHistory,
  exportShipmentLocationHistory,
  getShipmentGeofences,
  createShipmentGeofence,
  getShipmentTrackingAlerts,
  acknowledgeTrackingAlert,
  createTrackingLink,
  listTrackingLinks,
  revokeTrackingLink,
  getPortalShipments
} from './api.js';
import TrackingMap from './components/tracking/TrackingMap.jsx';
import './styles/trackingVisibility.css';

const AUTO_REFRESH_INTERVAL_SEC = 120; // 2 minutes per SRS FR-8.1 (2-5 minutes)

export default function TrackingVisibilityConsole({
  initialShipmentId = null,
  currentUser = null,
  notify = (msg) => console.log(msg),
}) {
  // Shipment selection state
  const [shipmentsList, setShipmentsList] = useState([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState(initialShipmentId || '');
  const [loadingShipments, setLoadingShipments] = useState(false);

  // Active view tab
  const [activeTab, setActiveTab] = useState('live'); // 'live' | 'geofences' | 'alerts' | 'history' | 'links' | 'ingestion'

  // FR-8.1: Live GPS Tracking State
  const [currentLocationData, setCurrentLocationData] = useState(null);
  const [loadingCurrentLocation, setLoadingCurrentLocation] = useState(false);
  const [currentLocationError, setCurrentLocationError] = useState(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [refreshCountdown, setRefreshCountdown] = useState(AUTO_REFRESH_INTERVAL_SEC);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  // FR-8.2: Geofence State
  const [geofences, setGeofences] = useState([]);
  const [loadingGeofences, setLoadingGeofences] = useState(false);
  const [showCreateGeofenceModal, setShowCreateGeofenceModal] = useState(false);
  const [newGeofenceForm, setNewGeofenceForm] = useState({
    name: '',
    type: 'facility',
    center_lat: '',
    center_lng: '',
    radius_meters: 500,
  });

  // FR-8.3: Public Tracking Links State
  const [trackingLinks, setTrackingLinks] = useState([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [showCreateLinkModal, setShowCreateLinkModal] = useState(false);
  const [newLinkHours, setNewLinkHours] = useState('168'); // default 7 days (168 hours)
  const [copiedLinkId, setCopiedLinkId] = useState(null);

  // FR-8.5: Anomaly Alerts State
  const [alerts, setAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [acknowledgingAlertId, setAcknowledgingAlertId] = useState(null);

  // FR-8.6: History & CSV Export State
  const [historyData, setHistoryData] = useState({ pings: [], pagination: {} });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyOrder, setHistoryOrder] = useState('desc');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [exportingCsv, setExportingCsv] = useState(false);

  // Concurrency lock for polling
  const isFetchingRef = useRef(false);
  const pollTimerRef = useRef(null);

  // 1. Initial Load: Load shipments list if not provided
  useEffect(() => {
    let isMounted = true;
    async function loadShipments() {
      setLoadingShipments(true);
      try {
        const res = await getPortalShipments({ status: 'all', limit: 50 });
        const list = res?.shipments || res?.data || (Array.isArray(res) ? res : []);
        if (isMounted) {
          setShipmentsList(list);
          if (!selectedShipmentId && list.length > 0) {
            setSelectedShipmentId(String(list[0].id));
          }
        }
      } catch (err) {
        console.warn('Failed to load shipments list for tracking selector:', err.message);
      } finally {
        if (isMounted) setLoadingShipments(false);
      }
    }
    loadShipments();
    return () => { isMounted = false; };
  }, [selectedShipmentId]);

  // Sync initialShipmentId prop if changed
  useEffect(() => {
    if (initialShipmentId) {
      setSelectedShipmentId(String(initialShipmentId));
    }
  }, [initialShipmentId]);

  // 2. Fetch Live Location (FR-8.1)
  const fetchCurrentLocation = useCallback(async (isSilent = false) => {
    if (!selectedShipmentId || isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (!isSilent) {
      setLoadingCurrentLocation(true);
      setCurrentLocationError(null);
    }

    try {
      const res = await getShipmentCurrentLocation(selectedShipmentId);
      const data = res?.data || res;
      setCurrentLocationData(data);
      setCurrentLocationError(null);
      setLastRefreshedAt(new Date());
      setRefreshCountdown(AUTO_REFRESH_INTERVAL_SEC);
    } catch (err) {
      console.error('Error fetching live location telemetry:', err);
      setCurrentLocationError(err.message || 'Unable to retrieve location telemetry');
    } finally {
      if (!isSilent) setLoadingCurrentLocation(false);
      isFetchingRef.current = false;
    }
  }, [selectedShipmentId]);

  // 3. Fetch Geofences (FR-8.2)
  const fetchGeofences = useCallback(async () => {
    if (!selectedShipmentId) return;
    setLoadingGeofences(true);
    try {
      const res = await getShipmentGeofences(selectedShipmentId);
      const list = res?.data || (Array.isArray(res) ? res : []);
      setGeofences(list);
    } catch (err) {
      console.warn('Geofences fetch failed:', err.message);
    } finally {
      setLoadingGeofences(false);
    }
  }, [selectedShipmentId]);

  // 4. Fetch Tracking Links (FR-8.3)
  const fetchTrackingLinks = useCallback(async () => {
    if (!selectedShipmentId) return;
    setLoadingLinks(true);
    try {
      const res = await listTrackingLinks(selectedShipmentId);
      const list = res?.data || (Array.isArray(res) ? res : []);
      setTrackingLinks(list);
    } catch (err) {
      console.warn('Tracking links fetch failed:', err.message);
    } finally {
      setLoadingLinks(false);
    }
  }, [selectedShipmentId]);

  // 5. Fetch Alerts (FR-8.5)
  const fetchAlerts = useCallback(async () => {
    if (!selectedShipmentId) return;
    setLoadingAlerts(true);
    try {
      const res = await getShipmentTrackingAlerts(selectedShipmentId);
      const list = res?.data || (Array.isArray(res) ? res : []);
      setAlerts(list);
    } catch (err) {
      console.warn('Tracking alerts fetch failed:', err.message);
    } finally {
      setLoadingAlerts(false);
    }
  }, [selectedShipmentId]);

  // 6. Fetch History (FR-8.6)
  const fetchHistory = useCallback(async (page = historyPage) => {
    if (!selectedShipmentId) return;
    setLoadingHistory(true);
    try {
      const params = {
        page,
        limit: 25,
        order: historyOrder,
      };
      if (historyDateFrom) params.from = historyDateFrom;
      if (historyDateTo) params.to = historyDateTo;

      const res = await getShipmentLocationHistory(selectedShipmentId, params);
      const data = res?.data || res || { pings: [], pagination: {} };
      setHistoryData(data);
    } catch (err) {
      console.warn('Location history fetch failed:', err.message);
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedShipmentId, historyPage, historyOrder, historyDateFrom, historyDateTo]);

  // Auto-fetch data on shipment selection change
  useEffect(() => {
    if (selectedShipmentId) {
      fetchCurrentLocation(false);
      fetchGeofences();
      fetchAlerts();
      fetchTrackingLinks();
      fetchHistory(1);
    }
  }, [selectedShipmentId, fetchCurrentLocation, fetchGeofences, fetchAlerts, fetchTrackingLinks, fetchHistory]);

  // FR-8.1: Polling Interval (2-minute periodic refresh with concurrency guard & cleanup)
  useEffect(() => {
    if (!autoRefreshEnabled || !selectedShipmentId) return;

    // Countdown tick every second
    const interval = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          fetchCurrentLocation(true);
          return AUTO_REFRESH_INTERVAL_SEC;
        }
        return prev - 1;
      });
    }, 1000);

    pollTimerRef.current = interval;

    return () => {
      clearInterval(interval);
      pollTimerRef.current = null;
    };
  }, [autoRefreshEnabled, selectedShipmentId, fetchCurrentLocation]);

  // FR-8.2: Create Geofence Handler
  const handleCreateGeofence = async (e) => {
    e.preventDefault();
    if (!selectedShipmentId) return;

    try {
      await createShipmentGeofence(selectedShipmentId, {
        name: newGeofenceForm.name,
        type: newGeofenceForm.type,
        center_lat: parseFloat(newGeofenceForm.center_lat),
        center_lng: parseFloat(newGeofenceForm.center_lng),
        radius_meters: parseInt(newGeofenceForm.radius_meters, 10),
      });
      notify?.('Geofence boundary configured successfully.');
      setShowCreateGeofenceModal(false);
      setNewGeofenceForm({
        name: '',
        type: 'facility',
        center_lat: '',
        center_lng: '',
        radius_meters: 500,
      });
      fetchGeofences();
    } catch (err) {
      notify?.(err.message || 'Failed to create geofence.');
    }
  };

  // FR-8.3: Generate Public Link Handler
  const handleCreateTrackingLink = async (e) => {
    e.preventDefault();
    if (!selectedShipmentId) return;

    try {
      const res = await createTrackingLink(selectedShipmentId, {
        expires_in_hours: parseInt(newLinkHours, 10) || 168,
      });
      notify?.('Shareable tracking link created successfully.');
      setShowCreateLinkModal(false);
      fetchTrackingLinks();
    } catch (err) {
      notify?.(err.message || 'Failed to generate tracking link.');
    }
  };

  // FR-8.3: Revoke Tracking Link Handler
  const handleRevokeTrackingLink = async (linkId) => {
    if (!selectedShipmentId) return;
    if (!window.confirm('Are you sure you want to revoke this shareable link? External recipients will immediately lose access.')) {
      return;
    }

    try {
      await revokeTrackingLink(selectedShipmentId, linkId);
      notify?.('Tracking link revoked.');
      fetchTrackingLinks();
    } catch (err) {
      notify?.(err.message || 'Failed to revoke link.');
    }
  };

  // Copy Link Token / URL
  const handleCopyLink = (token) => {
    const fullUrl = `${window.location.origin}/track/${encodeURIComponent(token)}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLinkId(token);
    notify?.('Tracking link copied to clipboard.');
    setTimeout(() => setCopiedLinkId(null), 2500);
  };

  // FR-8.5: Acknowledge Alert Handler
  const handleAcknowledgeAlert = async (alertId) => {
    setAcknowledgingAlertId(alertId);
    try {
      await acknowledgeTrackingAlert(alertId, { status: 'acknowledged' });
      notify?.('Alert acknowledged successfully.');
      fetchAlerts();
    } catch (err) {
      notify?.(err.message || 'Failed to acknowledge alert.');
    } finally {
      setAcknowledgingAlertId(null);
    }
  };

  // FR-8.6: Export CSV Handler
  const handleExportCsv = async () => {
    if (!selectedShipmentId) return;
    setExportingCsv(true);
    try {
      const blob = await exportShipmentLocationHistory(selectedShipmentId, {
        from: historyDateFrom,
        to: historyDateTo,
      });

      // Browser download trigger
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shipment-${selectedShipmentId}-location-history-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      notify?.('Location history CSV exported successfully.');
    } catch (err) {
      notify?.(err.message || 'Failed to export location history CSV.');
    } finally {
      setExportingCsv(false);
    }
  };

  // Helper formatting functions
  const formatHeading = (heading) => {
    if (heading === null || heading === undefined || isNaN(heading)) return 'N/A';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(((heading % 360) / 45)) % 8;
    return `${heading}° ${directions[idx]}`;
  };

  const selectedShipmentMeta = shipmentsList.find((s) => String(s.id) === String(selectedShipmentId));
  const activeAlertsCount = alerts.filter((a) => a.status === 'active').length;

  return (
    <div className="fms-tracking-console">
      {/* 1. Header Toolbar */}
      <div className="fms-tracking-header">
        <div className="fms-tracking-title-group">
          <h1>
            <Broadcast size={26} color="#2563eb" />
            Module M8 — Real-Time Tracking & Visibility
          </h1>
          <p>
            Enterprise telematics ingestion, GPS map tracking, geofence boundary automation,
            and audit trail analytics.
          </p>
        </div>

        <div className="fms-tracking-actions">
          {/* Shipment Selector */}
          <div className="fms-shipment-selector" title="Select active shipment">
            <Truck size={18} color="#2563eb" />
            <select
              value={selectedShipmentId}
              onChange={(e) => setSelectedShipmentId(e.target.value)}
              disabled={loadingShipments}
            >
              {shipmentsList.length === 0 ? (
                <option value="">No Shipments Loaded</option>
              ) : (
                shipmentsList.map((shp) => (
                  <option key={shp.id} value={shp.id}>
                    {shp.reference_number || `SHP-${shp.id}`} — {shp.status?.toUpperCase()}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Polling Toggle & Countdown */}
          <button
            type="button"
            className={`fms-polling-pill ${autoRefreshEnabled ? 'active' : ''}`}
            onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
            title="Toggle automated 2-minute polling"
          >
            <Clock size={16} />
            <span>
              {autoRefreshEnabled
                ? `Auto-Refresh: ${Math.floor(refreshCountdown / 60)}:${String(refreshCountdown % 60).padStart(2, '0')}`
                : 'Auto-Refresh Paused'}
            </span>
          </button>

          {/* Manual Refresh Button */}
          <button
            type="button"
            className="btn"
            onClick={() => fetchCurrentLocation(false)}
            disabled={loadingCurrentLocation}
            title="Force immediate telemetry query"
          >
            <ArrowsClockwise size={16} className={loadingCurrentLocation ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. KPI Summary Banner */}
      <div className="fms-tracking-kpis">
        <div className="fms-kpi-card">
          <span className="kpi-label">Active Shipment</span>
          <span className="kpi-value">{selectedShipmentMeta?.reference_number || `SHP-${selectedShipmentId}`}</span>
          <span className="kpi-sub">Status: {currentLocationData?.status?.toUpperCase() || selectedShipmentMeta?.status?.toUpperCase() || 'LOADED'}</span>
        </div>

        <div className="fms-kpi-card">
          <span className="kpi-label">Signal Freshness</span>
          <span className="kpi-value">
            {currentLocationData?.current_location ? (
              currentLocationData.is_stale ? (
                <span style={{ color: '#d97706' }}>STALE (&gt;15m)</span>
              ) : (
                <span style={{ color: '#059669' }}>LIVE GPS</span>
              )
            ) : (
              <span style={{ color: '#64748b' }}>NO SIGNAL</span>
            )}
          </span>
          <span className="kpi-sub">
            {currentLocationData?.data_freshness?.minutes_since_ping !== undefined
              ? `${currentLocationData.data_freshness.minutes_since_ping} mins since last ping`
              : 'Waiting for telemetry ingestion'}
          </span>
        </div>

        <div className="fms-kpi-card">
          <span className="kpi-label">Current Velocity</span>
          <span className="kpi-value">
            {currentLocationData?.current_location?.speed_mph !== null &&
            currentLocationData?.current_location?.speed_mph !== undefined
              ? `${currentLocationData.current_location.speed_mph} mph`
              : 'Stationary'}
          </span>
          <span className="kpi-sub">
            Heading: {formatHeading(currentLocationData?.current_location?.heading_deg)}
          </span>
        </div>

        <div className="fms-kpi-card">
          <span className="kpi-label">Active Anomaly Alerts</span>
          <span className="kpi-value" style={{ color: activeAlertsCount > 0 ? '#dc2626' : '#059669' }}>
            {activeAlertsCount}
          </span>
          <span className="kpi-sub">
            {activeAlertsCount > 0 ? 'Requires dispatcher attention' : 'Route corridors clear'}
          </span>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="fms-tracking-tabs">
        <button
          type="button"
          className={`fms-tab-btn ${activeTab === 'live' ? 'active' : ''}`}
          onClick={() => setActiveTab('live')}
        >
          <NavigationArrow size={17} />
          <span>Live GPS & Map (FR-8.1)</span>
        </button>

        <button
          type="button"
          className={`fms-tab-btn ${activeTab === 'geofences' ? 'active' : ''}`}
          onClick={() => setActiveTab('geofences')}
        >
          <ShieldCheck size={17} />
          <span>Geofences & Milestones (FR-8.2)</span>
          <span className="fms-tab-badge">{geofences.length}</span>
        </button>

        <button
          type="button"
          className={`fms-tab-btn ${activeTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveTab('alerts')}
        >
          <WarningCircle size={17} />
          <span>Corridor & Stall Alerts (FR-8.5)</span>
          {activeAlertsCount > 0 && (
            <span className="fms-tab-badge alert-count">{activeAlertsCount}</span>
          )}
        </button>

        <button
          type="button"
          className={`fms-tab-btn ${activeTab === 'links' ? 'active' : ''}`}
          onClick={() => setActiveTab('links')}
        >
          <ShareNetwork size={17} />
          <span>Public Shareable Links (FR-8.3)</span>
          <span className="fms-tab-badge">{trackingLinks.length}</span>
        </button>

        <button
          type="button"
          className={`fms-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <Clock size={17} />
          <span>Location History & Export (FR-8.6)</span>
          <span className="fms-tab-badge">{historyData?.total || 0}</span>
        </button>

        <button
          type="button"
          className={`fms-tab-btn ${activeTab === 'ingestion' ? 'active' : ''}`}
          onClick={() => setActiveTab('ingestion')}
        >
          <Broadcast size={17} />
          <span>Ingestion & Telematics (FR-8.4)</span>
        </button>
      </div>

      {/* 4. Tab Body Content */}

      {/* ================================================================= */}
      {/* TAB 1: LIVE GPS TRACKING & MAP (FR-8.1)                           */}
      {/* ================================================================= */}
      {activeTab === 'live' && (
        <div className="fms-tracking-split">
          {/* Left Column: Interactive Map */}
          <div className="fms-card">
            <div className="fms-card-header">
              <h3>
                <MapPin size={18} color="#2563eb" />
                Live Geospatial Canvas
              </h3>
              {lastRefreshedAt && (
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Updated: {lastRefreshedAt.toLocaleTimeString()}
                </span>
              )}
            </div>
            <div className="fms-card-body" style={{ padding: 0 }}>
              <TrackingMap
                currentLocation={currentLocationData?.current_location}
                geofences={geofences}
                historyPoints={historyData?.pings || []}
                referenceNumber={selectedShipmentMeta?.reference_number || `SHP-${selectedShipmentId}`}
                height="460px"
              />
            </div>
          </div>

          {/* Right Column: Telemetry Specs & Telemetry State */}
          <div className="fms-card">
            <div className="fms-card-header">
              <h3>
                <Gauge size={18} color="#2563eb" />
                Current Telemetry Snapshot
              </h3>
              {currentLocationData?.current_location && (
                <span className={`fms-badge ${currentLocationData.is_stale ? 'amber' : 'green'}`}>
                  {currentLocationData.is_stale ? 'STALE (>15m)' : 'LIVE & FRESH'}
                </span>
              )}
            </div>

            <div className="fms-card-body">
              {loadingCurrentLocation && !currentLocationData ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  <ArrowsClockwise size={32} className="spin" color="#2563eb" />
                  <p style={{ marginTop: '12px', fontWeight: 600 }}>Querying GPS Telemetry from Server...</p>
                </div>
              ) : currentLocationError ? (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', color: '#991b1b' }}>
                  <strong>API Error:</strong> {currentLocationError}
                  <button className="btn" style={{ marginTop: '10px' }} onClick={() => fetchCurrentLocation(false)}>
                    Retry
                  </button>
                </div>
              ) : !currentLocationData?.current_location ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#64748b' }}>
                  <Info size={36} color="#94a3b8" />
                  <h4 style={{ margin: '12px 0 6px', color: '#334155' }}>No Active Telemetry Pings</h4>
                  <p style={{ fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
                    {currentLocationData?.message || 'No GPS coordinates have been recorded for this shipment yet.'}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>LATITUDE</span>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                        {Number(currentLocationData.current_location.latitude).toFixed(6)}
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>LONGITUDE</span>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                        {Number(currentLocationData.current_location.longitude).toFixed(6)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>VELOCITY</span>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                        {currentLocationData.current_location.speed_mph !== null && currentLocationData.current_location.speed_mph !== undefined
                          ? `${currentLocationData.current_location.speed_mph} mph`
                          : '0.0 mph (Stationary)'}
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>BEARING / HEADING</span>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                        {formatHeading(currentLocationData.current_location.heading_deg)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>HORIZONTAL ACCURACY</span>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                        {currentLocationData.current_location.accuracy_m ? `±${currentLocationData.current_location.accuracy_m} m` : 'Standard GPS'}
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>ALTITUDE</span>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                        {currentLocationData.current_location.altitude_m ? `${currentLocationData.current_location.altitude_m} m` : 'Sea Level'}
                      </div>
                    </div>
                  </div>

                  <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '8px', fontSize: '12.5px', color: '#334155' }}>
                    <div><strong>Last Fix Timestamp:</strong> {new Date(currentLocationData.current_location.recorded_at).toLocaleString()}</div>
                    <div style={{ marginTop: '4px' }}>
                      <strong>Source / Provider:</strong> {currentLocationData.current_location.source} ({currentLocationData.current_location.provider || 'internal'})
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: GEOFENCES & STOP MILESTONES (FR-8.2)                      */}
      {/* ================================================================= */}
      {activeTab === 'geofences' && (
        <div className="fms-card">
          <div className="fms-card-header">
            <h3>
              <ShieldCheck size={18} color="#2563eb" />
              Active Geofence Boundaries & Automated Milestones
            </h3>
            <button
              type="button"
              className="btn primary"
              onClick={() => setShowCreateGeofenceModal(true)}
            >
              <Plus size={15} />
              <span>Configure Geofence</span>
            </button>
          </div>

          <div className="fms-card-body">
            {loadingGeofences ? (
              <div style={{ textAlign: 'center', padding: '30px' }}>
                <ArrowsClockwise size={28} className="spin" color="#2563eb" />
                <p>Loading Geofences from backend...</p>
              </div>
            ) : geofences.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                <ShieldCheck size={36} color="#94a3b8" />
                <h4>No Geofences Configured for this Shipment</h4>
                <p>Click "Configure Geofence" to set up an automated boundary around origin, destination, or transit hubs.</p>
              </div>
            ) : (
              <table className="fms-tracking-table">
                <thead>
                  <tr>
                    <th>Boundary Name</th>
                    <th>Facility Type</th>
                    <th>Center Coordinates</th>
                    <th>Radius</th>
                    <th>Associated Stop</th>
                    <th>Automated Events</th>
                  </tr>
                </thead>
                <tbody>
                  {geofences.map((gf) => (
                    <tr key={gf.id}>
                      <td><strong>{gf.name}</strong></td>
                      <td>
                        <span className="fms-badge blue">{gf.type}</span>
                      </td>
                      <td>Lat {Number(gf.center_lat).toFixed(4)}, Lon {Number(gf.center_lng).toFixed(4)}</td>
                      <td>{gf.radius_meters} meters</td>
                      <td>
                        {gf.stop ? (
                          <span>
                            Stop #{gf.stop.sequence} ({gf.stop.type}) —{' '}
                            <span className={`fms-badge ${gf.stop.status === 'arrived' ? 'green' : gf.stop.status === 'departed' ? 'gray' : 'amber'}`}>
                              {gf.stop.status}
                            </span>
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Custom Boundary</span>
                        )}
                      </td>
                      <td>
                        {gf.recent_events && gf.recent_events.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {gf.recent_events.map((ev) => (
                              <div key={ev.id} style={{ fontSize: '11.5px' }}>
                                <span className={`fms-badge ${ev.event_type === 'entry' ? 'green' : 'amber'}`}>
                                  {ev.event_type === 'entry' ? 'Entered' : 'Exited'}
                                </span>{' '}
                                <span style={{ color: '#64748b' }}>{new Date(ev.recorded_at).toLocaleTimeString()}</span>
                                {ev.dwell_time_sec ? ` (${Math.round(ev.dwell_time_sec / 60)}m dwell)` : ''}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>No crossings recorded</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: CORRIDOR DEVIATION & STALLED ALERTS (FR-8.5)              */}
      {/* ================================================================= */}
      {activeTab === 'alerts' && (
        <div className="fms-card">
          <div className="fms-card-header">
            <h3>
              <WarningCircle size={18} color="#dc2626" />
              Automated Telematics Alerts & Corridor Monitoring
            </h3>
            <button type="button" className="btn" onClick={fetchAlerts}>
              <ArrowsClockwise size={15} />
              <span>Refresh Alerts</span>
            </button>
          </div>

          <div className="fms-card-body">
            {loadingAlerts ? (
              <div style={{ textAlign: 'center', padding: '30px' }}>
                <ArrowsClockwise size={28} className="spin" color="#2563eb" />
                <p>Checking automated anomaly alerts...</p>
              </div>
            ) : alerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                <CheckCircle size={36} color="#16a34a" />
                <h4>No Active Tracking Alerts</h4>
                <p>Driver is following planned corridor. Vehicle velocity indicates active progression with no prolonged stalls.</p>
              </div>
            ) : (
              <table className="fms-tracking-table">
                <thead>
                  <tr>
                    <th>Alert Type</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Message</th>
                    <th>Telemetry Metric</th>
                    <th>Configured Threshold</th>
                    <th>Detected At</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((al) => (
                    <tr key={al.id}>
                      <td>
                        <strong>
                          {al.alert_type === 'route_deviation'
                            ? 'Route Corridor Breach'
                            : al.alert_type === 'stalled_shipment'
                            ? 'Prolonged Dwell / Stall'
                            : al.alert_type}
                        </strong>
                      </td>
                      <td>
                        <span className={`fms-badge ${al.severity === 'critical' ? 'red' : al.severity === 'warning' ? 'amber' : 'blue'}`}>
                          {al.severity?.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className={`fms-badge ${al.status === 'active' ? 'red' : al.status === 'acknowledged' ? 'amber' : 'green'}`}>
                          {al.status?.toUpperCase()}
                        </span>
                      </td>
                      <td>{al.message}</td>
                      <td>
                        {al.deviation_miles !== null && al.deviation_miles !== undefined && (
                          <span>{Number(al.deviation_miles).toFixed(2)} mi off-route</span>
                        )}
                        {al.stalled_hours !== null && al.stalled_hours !== undefined && (
                          <span>{Number(al.stalled_hours).toFixed(1)} hrs stationary</span>
                        )}
                      </td>
                      <td>
                        {al.threshold_used ? (
                          <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                            {al.threshold_used.corridor_threshold_miles ? `Tolerance: ${al.threshold_used.corridor_threshold_miles} mi` : ''}
                            {al.threshold_used.stalled_threshold_hours ? `Max Stall: ${al.threshold_used.stalled_threshold_hours} hrs` : ''}
                          </span>
                        ) : 'Default Threshold'}
                      </td>
                      <td>{new Date(al.created_at).toLocaleString()}</td>
                      <td>
                        {al.status === 'active' ? (
                          <button
                            type="button"
                            className="btn primary"
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            onClick={() => handleAcknowledgeAlert(al.id)}
                            disabled={acknowledgingAlertId === al.id}
                          >
                            <Check size={13} />
                            <span>Acknowledge</span>
                          </button>
                        ) : al.acknowledged_at ? (
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            Ack'd {new Date(al.acknowledged_at).toLocaleTimeString()}
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#16a34a' }}>Resolved</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 4: PUBLIC SHAREABLE TRACKING LINKS (FR-8.3)                  */}
      {/* ================================================================= */}
      {activeTab === 'links' && (
        <div className="fms-card">
          <div className="fms-card-header">
            <div>
              <h3>
                <ShareNetwork size={18} color="#2563eb" />
                Public Tracking Links (FR-8.3)
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                Share unauthenticated live tracking with customers. Private rates, margins, and notes are strictly stripped.
              </p>
            </div>
            <button
              type="button"
              className="btn primary"
              onClick={() => setShowCreateLinkModal(true)}
            >
              <Plus size={15} />
              <span>Generate Tracking Link</span>
            </button>
          </div>

          <div className="fms-card-body">
            {loadingLinks ? (
              <div style={{ textAlign: 'center', padding: '30px' }}>
                <ArrowsClockwise size={28} className="spin" color="#2563eb" />
                <p>Retrieving tracking links...</p>
              </div>
            ) : trackingLinks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                <ShareNetwork size={36} color="#94a3b8" />
                <h4>No Public Tracking Links Generated</h4>
                <p>Generate a secure link to allow external consignees to track this freight without logging in.</p>
              </div>
            ) : (
              <table className="fms-tracking-table">
                <thead>
                  <tr>
                    <th>Shareable Link Token</th>
                    <th>Status</th>
                    <th>Expires At</th>
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trackingLinks.map((lnk) => {
                    const isExpired = new Date(lnk.expires_at).getTime() <= Date.now();
                    const isRevoked = !lnk.is_active || Boolean(lnk.revoked_at);

                    return (
                      <tr key={lnk.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>
                              /track/{lnk.token.substring(0, 16)}...
                            </code>
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                              onClick={() => handleCopyLink(lnk.token)}
                              disabled={isRevoked || isExpired}
                              title="Copy Full Public URL"
                            >
                              {copiedLinkId === lnk.token ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                              <span>{copiedLinkId === lnk.token ? 'Copied' : 'Copy URL'}</span>
                            </button>
                          </div>
                        </td>
                        <td>
                          {isRevoked ? (
                            <span className="fms-badge red">Revoked</span>
                          ) : isExpired ? (
                            <span className="fms-badge amber">Expired</span>
                          ) : (
                            <span className="fms-badge green">Active</span>
                          )}
                        </td>
                        <td>{new Date(lnk.expires_at).toLocaleString()}</td>
                        <td>{new Date(lnk.created_at).toLocaleString()}</td>
                        <td>
                          {!isRevoked && !isExpired && (
                            <button
                              type="button"
                              className="btn"
                              style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '4px 8px', fontSize: '11px' }}
                              onClick={() => handleRevokeTrackingLink(lnk.id)}
                            >
                              <Trash size={12} />
                              <span>Revoke Link</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 5: HISTORICAL LOCATION & CSV EXPORT (FR-8.6)                 */}
      {/* ================================================================= */}
      {activeTab === 'history' && (
        <div className="fms-card">
          <div className="fms-card-header">
            <div>
              <h3>
                <Clock size={18} color="#2563eb" />
                Chronological GPS Breadcrumb Audit Trail (FR-8.6)
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                Retains full telemetry fixes for carrier SLA audits and insurance claims investigations.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn primary"
                onClick={handleExportCsv}
                disabled={exportingCsv}
              >
                <DownloadSimple size={15} className={exportingCsv ? 'spin' : ''} />
                <span>{exportingCsv ? 'Generating CSV...' : 'Export Audit CSV'}</span>
              </button>
            </div>
          </div>

          <div className="fms-card-body">
            {/* Filter Row */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>From Date:</span>
                <input
                  type="date"
                  value={historyDateFrom}
                  onChange={(e) => setHistoryDateFrom(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>To Date:</span>
                <input
                  type="date"
                  value={historyDateTo}
                  onChange={(e) => setHistoryDateTo(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>Order:</span>
                <select
                  value={historyOrder}
                  onChange={(e) => setHistoryOrder(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                >
                  <option value="desc">Newest First (Desc)</option>
                  <option value="asc">Oldest First (Asc)</option>
                </select>
              </div>

              <button type="button" className="btn" onClick={() => fetchHistory(1)}>
                Apply Filter
              </button>
            </div>

            {loadingHistory ? (
              <div style={{ textAlign: 'center', padding: '30px' }}>
                <ArrowsClockwise size={28} className="spin" color="#2563eb" />
                <p>Loading historical telemetry points...</p>
              </div>
            ) : !historyData?.pings || historyData.pings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                <Clock size={36} color="#94a3b8" />
                <h4>No Location History Records</h4>
                <p>No telemetry records found for the selected time range.</p>
              </div>
            ) : (
              <>
                <table className="fms-tracking-table">
                  <thead>
                    <tr>
                      <th>Recorded At</th>
                      <th>Latitude</th>
                      <th>Longitude</th>
                      <th>Speed</th>
                      <th>Bearing</th>
                      <th>Accuracy</th>
                      <th>Source / Provider</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData.pings.map((pt) => (
                      <tr key={pt.id}>
                        <td>{new Date(pt.recorded_at).toLocaleString()}</td>
                        <td>{Number(pt.latitude).toFixed(6)}</td>
                        <td>{Number(pt.longitude).toFixed(6)}</td>
                        <td>{pt.speed_mph !== null && pt.speed_mph !== undefined ? `${pt.speed_mph} mph` : '0 mph'}</td>
                        <td>{formatHeading(pt.heading_deg)}</td>
                        <td>{pt.accuracy_m ? `±${pt.accuracy_m} m` : 'GPS Standard'}</td>
                        <td>
                          <span className="fms-badge gray">{pt.source}</span>
                          {pt.provider && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#64748b' }}>({pt.provider})</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination Controls */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', padding: '8px 0' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>
                    Showing page {historyData.page} of {historyData.total_pages || 1} ({historyData.total || 0} total fixes)
                  </span>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn"
                      disabled={historyPage <= 1}
                      onClick={() => {
                        const newPage = historyPage - 1;
                        setHistoryPage(newPage);
                        fetchHistory(newPage);
                      }}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={historyPage >= (historyData.total_pages || 1)}
                      onClick={() => {
                        const newPage = historyPage + 1;
                        setHistoryPage(newPage);
                        fetchHistory(newPage);
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 6: TELEMATICS INGESTION & VISIBILITY (FR-8.4)                */}
      {/* ================================================================= */}
      {activeTab === 'ingestion' && (
        <div className="fms-card">
          <div className="fms-card-header">
            <h3>
              <Broadcast size={18} color="#2563eb" />
              Telematics Source & Ingestion Visibility (FR-8.4)
            </h3>
          </div>

          <div className="fms-card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 10px', color: '#1e293b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Truck size={18} color="#2563eb" />
                  ELD Telematics Ingestion
                </h4>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, margin: '0 0 12px' }}>
                  Backend normalizes payloads from onboard hardware (Samsara, Motive/KeepTruckin) via <code>POST /v1/tracking/ingest</code>.
                </p>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  <strong>Current Ingested Source:</strong>{' '}
                  <span className="fms-badge blue">{currentLocationData?.current_location?.source || 'No signal'}</span>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 10px', color: '#1e293b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <NavigationArrow size={18} color="#059669" />
                  Aggregator Visibility
                </h4>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, margin: '0 0 12px' }}>
                  Integrates location streaming feeds from visibility aggregators (project44, FourKites) with automated GeoJSON coordinate mapping.
                </p>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  <strong>Telemetry Provider:</strong>{' '}
                  <span className="fms-badge gray">{currentLocationData?.current_location?.provider || 'internal'}</span>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 10px', color: '#1e293b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={18} color="#7c3aed" />
                  Hardware Security Architecture
                </h4>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, margin: 0 }}>
                  Telematics credentials and API secrets are securely isolated on the backend server.
                  No vendor API keys or private tokens are exposed in client-side bundles.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 1: CONFIGURE GEOFENCE MODAL (FR-8.2)                        */}
      {/* ================================================================= */}
      {showCreateGeofenceModal && (
        <div className="fms-modal-overlay" onClick={() => setShowCreateGeofenceModal(false)}>
          <div className="fms-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="fms-modal-header">
              <h3>Configure Geofence Boundary (FR-8.2)</h3>
              <button className="icon-btn" onClick={() => setShowCreateGeofenceModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateGeofence}>
              <div className="fms-modal-body">
                <div className="fms-form-group">
                  <label>Boundary Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Dallas Logistics Hub or Consignee Gate"
                    value={newGeofenceForm.name}
                    onChange={(e) => setNewGeofenceForm({ ...newGeofenceForm, name: e.target.value })}
                  />
                </div>

                <div className="fms-form-group">
                  <label>Facility Classification *</label>
                  <select
                    value={newGeofenceForm.type}
                    onChange={(e) => setNewGeofenceForm({ ...newGeofenceForm, type: e.target.value })}
                  >
                    <option value="facility">Distribution Facility / Terminal</option>
                    <option value="origin">Origin Shipper</option>
                    <option value="destination">Destination Consignee</option>
                    <option value="waypoint">Waypoint / Fuel Hub</option>
                  </select>
                </div>

                <div className="fms-form-row">
                  <div className="fms-form-group">
                    <label>Center Latitude *</label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="e.g. 32.7767"
                      value={newGeofenceForm.center_lat}
                      onChange={(e) => setNewGeofenceForm({ ...newGeofenceForm, center_lat: e.target.value })}
                    />
                  </div>

                  <div className="fms-form-group">
                    <label>Center Longitude *</label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="e.g. -96.7970"
                      value={newGeofenceForm.center_lng}
                      onChange={(e) => setNewGeofenceForm({ ...newGeofenceForm, center_lng: e.target.value })}
                    />
                  </div>
                </div>

                <div className="fms-form-group">
                  <label>Radius (Meters) *</label>
                  <input
                    type="number"
                    min="20"
                    max="50000"
                    required
                    value={newGeofenceForm.radius_meters}
                    onChange={(e) => setNewGeofenceForm({ ...newGeofenceForm, radius_meters: e.target.value })}
                  />
                  <small style={{ color: '#64748b' }}>Standard boundary: 200m–500m around facility.</small>
                </div>
              </div>

              <div className="fms-modal-footer">
                <button type="button" className="btn" onClick={() => setShowCreateGeofenceModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary">
                  Save Geofence
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 2: GENERATE TRACKING LINK MODAL (FR-8.3)                    */}
      {/* ================================================================= */}
      {showCreateLinkModal && (
        <div className="fms-modal-overlay" onClick={() => setShowCreateLinkModal(false)}>
          <div className="fms-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="fms-modal-header">
              <h3>Generate Shareable Tracking Link (FR-8.3)</h3>
              <button className="icon-btn" onClick={() => setShowCreateLinkModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTrackingLink}>
              <div className="fms-modal-body">
                <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.5, margin: '0 0 16px' }}>
                  Create an unauthenticated tracking link that can be shared with consignees or customers.
                  The backend automatically sanitizes the response, stripping freight charges, carrier margin, and contact phones.
                </p>

                <div className="fms-form-group">
                  <label>Link Expiration Period</label>
                  <select value={newLinkHours} onChange={(e) => setNewLinkHours(e.target.value)}>
                    <option value="24">24 Hours (1 Day)</option>
                    <option value="48">48 Hours (2 Days)</option>
                    <option value="168">168 Hours (7 Days - Standard)</option>
                    <option value="720">720 Hours (30 Days)</option>
                  </select>
                </div>
              </div>

              <div className="fms-modal-footer">
                <button type="button" className="btn" onClick={() => setShowCreateLinkModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary">
                  Generate Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

