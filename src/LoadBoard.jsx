import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  MagnifyingGlass,
  Plus,
  ArrowClockwise,
  CheckCircle,
  WarningCircle,
  X,
  Truck,
  Info,
  ShieldCheck,
  Tag,
  CurrencyDollar,
  Lightning,
  Handshake,
  UsersThree,
  ChartBar,
  Broadcast,
  ArrowsLeftRight,
  MapPin,
  Clock,
  Check,
  Lock,
  Globe,
  Sliders,
  CaretRight,
  CaretLeft,
} from '@phosphor-icons/react';
import {
  getLoadPostings,
  getLoadPosting,
  createLoadPosting,
  cancelLoadPosting,
  bookNowLoad,
  submitLoadBid,
  getLoadBids,
  counterLoadBid,
  acceptLoadBid,
  rejectLoadBid,
  withdrawLoadBid,
  getLoadMatches,
  getCarrierPreferences,
  saveCarrierPreference,
  getLaneMetrics,
  getShipments,
} from './api';
import * as authService from './services/authService';
import './styles/loadBoard.css';

/* ─── Geographic Reference for Deadhead Resolution ───────────────── */
const US_CITIES_GEO = {
  'CHICAGO, IL': { lat: 41.8781, lng: -87.6298 },
  'ATLANTA, GA': { lat: 33.749, lng: -84.388 },
  'DALLAS, TX': { lat: 32.7767, lng: -96.797 },
  'HOUSTON, TX': { lat: 29.7604, lng: -95.3698 },
  'LOS ANGELES, CA': { lat: 34.0522, lng: -118.2437 },
  'ONTARIO, CA': { lat: 34.0633, lng: -117.6509 },
  'SEATTLE, WA': { lat: 47.6062, lng: -122.3321 },
  'MIAMI, FL': { lat: 25.7617, lng: -80.1918 },
  'NEWARK, NJ': { lat: 40.7357, lng: -74.1724 },
  'PHILADELPHIA, PA': { lat: 39.9526, lng: -75.1652 },
  'MEMPHIS, TN': { lat: 35.1495, lng: -90.049 },
  'INDIANAPOLIS, IN': { lat: 39.7684, lng: -86.1581 },
  'COLUMBUS, OH': { lat: 39.9612, lng: -82.9988 },
  'KANSAS CITY, MO': { lat: 39.0997, lng: -94.5786 },
  'DENVER, CO': { lat: 39.7392, lng: -104.9903 },
  'PHOENIX, AZ': { lat: 33.4484, lng: -112.074 },
  'CHARLOTTE, NC': { lat: 35.2271, lng: -80.8431 },
  'NASHVILLE, TN': { lat: 36.1627, lng: -86.7816 },
  'DETROIT, MI': { lat: 42.3314, lng: -83.0458 },
  'MINNEAPOLIS, MN': { lat: 44.9778, lng: -93.265 },
  'SAVANNAH, GA': { lat: 32.0809, lng: -81.0912 },
  'JACKSONVILLE, FL': { lat: 30.3322, lng: -81.6557 },
  'LOUISVILLE, KY': { lat: 38.2527, lng: -85.7585 },
  'LAREDO, TX': { lat: 27.5036, lng: -99.5076 },
};

/* ─── Equipment Types Catalog ────────────────────────────────────── */
const EQUIPMENT_OPTIONS = [
  { value: 'dry_van', label: "Dry Van (53')" },
  { value: 'reefer', label: "Refrigerated (53')" },
  { value: 'flatbed', label: "Flatbed (48')" },
  { value: 'step_deck', label: 'Step Deck' },
  { value: 'power_only', label: 'Power Only' },
  { value: 'box_truck', label: 'Straight / Box Truck' },
];

function formatMoney(num) {
  if (num === null || num === undefined || isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(num));
}

function formatDate(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return val;
  }
}

export default function LoadBoard({
  hasPermission = () => true,
  notify = () => {},
  currentUser = null,
  currentRoleName = '',
  currentOrg = null,
}) {
  // Active Tab
  const [activeTab, setActiveTab] = useState('available'); // 'available' | 'my_postings' | 'preferences' | 'analytics'

  // Data states
  const [postings, setPostings] = useState([]);
  const [loadingPostings, setLoadingPostings] = useState(false);
  const [totalPostings, setTotalPostings] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState('all');
  const [statusFilter, setStatusFilter] = useState('posted');
  const [deadheadRadius, setDeadheadRadius] = useState(0);
  const [originSearchCity, setOriginSearchCity] = useState('');
  const [minRpmFilter, setMinRpmFilter] = useState('');

  // Conflict / Concurrency Alert Banner
  const [conflictError, setConflictError] = useState(null);

  // Real-time Socket.io Notification
  const [socketConnected, setSocketConnected] = useState(false);
  const [realtimeAlert, setRealtimeAlert] = useState(null);
  const [newLoadsCount, setNewLoadsCount] = useState(0);
  const socketRef = useRef(null);

  // Modals
  const [showPostModal, setShowPostModal] = useState(false);
  const [showBookModal, setShowBookModal] = useState(null); // posting object
  const [showBidModal, setShowBidModal] = useState(null); // posting object
  const [showBidsManager, setShowBidsManager] = useState(null); // posting object
  const [showMatchesModal, setShowMatchesModal] = useState(null); // posting object
  const [showAddPrefModal, setShowAddPrefModal] = useState(false);

  // Bids manager data
  const [activeBids, setActiveBids] = useState([]);
  const [loadingBids, setLoadingBids] = useState(false);
  const [counterInput, setCounterInput] = useState({}); // bidId -> { amount, notes }

  // Matches data
  const [matchesData, setMatchesData] = useState(null);
  const [loadingMatches, setLoadingMatches] = useState(false);

  // Carrier Preferences data
  const [carrierPrefs, setCarrierPrefs] = useState([]);
  const [loadingPrefs, setLoadingPrefs] = useState(false);

  // Analytics Lane Metrics
  const [laneMetrics, setLaneMetrics] = useState(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [analyticsOriginState, setAnalyticsOriginState] = useState('');
  const [analyticsDestState, setAnalyticsDestState] = useState('');

  // Unbooked Shipments for Post Load modal
  const [availableShipments, setAvailableShipments] = useState([]);

  // Submitting locks
  const [submittingAction, setSubmittingAction] = useState(false);

  // Role permissions helpers
  const isPlatformAdmin = currentRoleName === 'Platform Admin';
  const isShipper = currentOrg?.type === 'shipper' || isPlatformAdmin;
  const isCarrier = currentOrg?.type === 'carrier' || isPlatformAdmin || currentRoleName === 'Dispatcher';
  const canRead = typeof hasPermission === 'function' ? hasPermission('load_board', 'read') : true;

  // KPI calculations
  const bookableCount = postings.filter((p) => p.status === 'posted' && p.allow_book_now).length;
  const biddableCount = postings.filter((p) => p.status === 'posted' && p.allow_bids).length;
  const privateCount = postings.filter((p) => p.visibility === 'private').length;

  // Active filters helper
  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
    destQuery.trim() ||
    (selectedEquipment && selectedEquipment !== 'all') ||
    (statusFilter && statusFilter !== 'posted') ||
    deadheadRadius > 0 ||
    minRpmFilter ||
    originSearchCity.trim()
  );

  const resetFilters = () => {
    setSearchQuery('');
    setDestQuery('');
    setSelectedEquipment('all');
    setStatusFilter('posted');
    setDeadheadRadius(0);
    setMinRpmFilter('');
    setOriginSearchCity('');
    setPage(1);
  };

  // Keyboard shortcut: Escape to close modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowBookModal(null);
        setShowBidsManager(null);
        setShowMatchesModal(null);
        setShowPostModal(false);
        setShowAddPrefModal(false);
        setShowBidModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /* ─── Real-Time Socket.io Connection (FR-3.7) ──────────────────── */
  useEffect(() => {
    let socket;
    try {
      const socketUrl =
        (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
        "";

      const token = authService.getToken();

      socket = io(socketUrl, {
        auth: { token },
        extraHeaders: {
          authorization: token ? `Bearer ${token}` : '',
        },
        autoConnect: true,
        transports: ['websocket', 'polling'],
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setSocketConnected(true);
      });

      socket.on('disconnect', () => {
        setSocketConnected(false);
      });

      socket.on('connect_error', () => {
        setSocketConnected(false);
      });

      // FR-3.7: Listen for "load:new" event
      socket.on('load:new', (payload) => {
        setRealtimeAlert(payload);
        setNewLoadsCount((c) => c + 1);
        notify(
          `New Load Posted: ${payload.origin || 'Origin'} → ${payload.destination || 'Destination'} (${formatMoney(
            payload.posted_rate
          )})`
        );
      });
    } catch (e) {
      console.warn('[LOAD_BOARD_SOCKET_INIT_WARN]', e.message);
    }

    return () => {
      if (socket) {
        socket.off('load:new');
        socket.disconnect();
      }
    };
  }, [notify]);

  /* ─── Fetch Postings ───────────────────────────────────────────── */
  const fetchPostings = useCallback(
    async (overrideStatus) => {
      setLoadingPostings(true);
      setConflictError(null);
      try {
        const params = {
          page,
          limit: 20,
        };

        const targetStatus = overrideStatus !== undefined ? overrideStatus : statusFilter;
        if (targetStatus && targetStatus !== 'all') {
          params.status = targetStatus;
        }

        if (selectedEquipment && selectedEquipment !== 'all') {
          params.equipment_type = selectedEquipment;
        }

        if (searchQuery.trim()) {
          params.origin = searchQuery.trim();
        }

        if (destQuery.trim()) {
          params.destination = destQuery.trim();
        }

        if (minRpmFilter && Number(minRpmFilter) > 0) {
          params.min_rpm = minRpmFilter;
        }

        // Deadhead radius geocoding resolution
        if (deadheadRadius > 0 && originSearchCity.trim()) {
          params.deadhead_radius = deadheadRadius;
          const key = originSearchCity.trim().toUpperCase();
          if (US_CITIES_GEO[key]) {
            params.origin_lat = US_CITIES_GEO[key].lat;
            params.origin_lng = US_CITIES_GEO[key].lng;
          }
        }

        const res = await getLoadPostings(params);
        if (res?.success) {
          setPostings(res.data || []);
          setTotalPostings(res.pagination?.total || 0);
          setTotalPages(res.pagination?.totalPages || 1);
        } else if (Array.isArray(res)) {
          setPostings(res);
          setTotalPostings(res.length);
        }
      } catch (err) {
        console.error('Failed to fetch load postings:', err);
      } finally {
        setLoadingPostings(false);
      }
    },
    [page, statusFilter, selectedEquipment, searchQuery, destQuery, minRpmFilter, deadheadRadius, originSearchCity]
  );

  useEffect(() => {
    if (activeTab === 'available' || activeTab === 'my_postings') {
      fetchPostings();
    }
  }, [fetchPostings, activeTab]);

  /* ─── Fetch Carrier Preferences (FR-3.4) ───────────────────────── */
  const fetchCarrierPreferences = useCallback(async () => {
    setLoadingPrefs(true);
    try {
      const res = await getCarrierPreferences();
      if (res?.success) {
        setCarrierPrefs(res.data || []);
      } else if (Array.isArray(res)) {
        setCarrierPrefs(res);
      }
    } catch (err) {
      console.warn('Preferences fetch:', err.message);
    } finally {
      setLoadingPrefs(false);
    }
  }, []);

  /* ─── Fetch Lane Metrics (FR-3.8) ──────────────────────────────── */
  const fetchLaneMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    try {
      const params = {};
      if (analyticsOriginState.trim()) params.origin_state = analyticsOriginState.trim();
      if (analyticsDestState.trim()) params.dest_state = analyticsDestState.trim();

      const res = await getLaneMetrics(params);
      if (res?.success) {
        setLaneMetrics(res.data);
      }
    } catch (err) {
      console.warn('Lane metrics fetch:', err.message);
    } finally {
      setLoadingMetrics(false);
    }
  }, [analyticsOriginState, analyticsDestState]);

  useEffect(() => {
    if (activeTab === 'preferences') fetchCarrierPreferences();
    if (activeTab === 'analytics') fetchLaneMetrics();
  }, [activeTab, fetchCarrierPreferences, fetchLaneMetrics]);

  /* ─── Load Shipments for New Posting Modal ──────────────────────── */
  const openNewPostingModal = async () => {
    setShowPostModal(true);
    try {
      const res = await getShipments({ limit: 50 });
      const raw = res?.data || (Array.isArray(res) ? res : []);
      // Filter shipments that are unbooked or quoted
      const unbooked = raw.filter((s) => !['booked', 'in_transit', 'delivered', 'cancelled'].includes((s.status || '').toLowerCase()));
      setAvailableShipments(unbooked);
    } catch (err) {
      console.warn('Could not load shipments:', err.message);
    }
  };

  /* ─── FR-3.5: Execute Concurrency-Safe Book Now ─────────────────── */
  const handleExecuteBookNow = async (posting) => {
    if (!posting?.id) return;
    setSubmittingAction(true);
    setConflictError(null);
    try {
      const res = await bookNowLoad(posting.id);
      if (res?.success) {
        notify(`Load #${posting.id} booked successfully!`);
        setShowBookModal(null);
        fetchPostings();
      }
    } catch (err) {
      // Handle HTTP 409 Conflict strictly
      if (err.status === 409 || (err.message && err.message.toLowerCase().includes('conflict'))) {
        const msg =
          err.message ||
          'Conflict: This load has already been booked by another carrier or is no longer available.';
        setConflictError(msg);
        notify(msg);
      } else {
        notify(err.message || 'Failed to book load');
      }
      setShowBookModal(null);
      // Auto-refresh data to ensure updated state is visible
      fetchPostings();
    } finally {
      setSubmittingAction(false);
    }
  };

  /* ─── FR-3.3: Submit Carrier Bid ───────────────────────────────── */
  const handleExecuteBid = async (postingId, bidAmount, notes) => {
    if (!postingId || !bidAmount) return;
    setSubmittingAction(true);
    setConflictError(null);
    try {
      const res = await submitLoadBid(postingId, {
        bid_amount: Number(bidAmount),
        notes: notes || undefined,
      });
      if (res?.success) {
        notify(`Bid of ${formatMoney(bidAmount)} submitted successfully!`);
        setShowBidModal(null);
        fetchPostings();
      }
    } catch (err) {
      if (err.status === 409) {
        const msg = 'Conflict: This load is no longer available for bidding.';
        setConflictError(msg);
        notify(msg);
        fetchPostings();
      } else {
        notify(err.message || 'Failed to submit bid');
      }
    } finally {
      setSubmittingAction(false);
    }
  };

  /* ─── Open Bids Manager for a Posting ──────────────────────────── */
  const openBidsForPosting = async (posting) => {
    setShowBidsManager(posting);
    setLoadingBids(true);
    try {
      const res = await getLoadBids(posting.id);
      if (res?.success) {
        setActiveBids(res.data || []);
      } else if (Array.isArray(res)) {
        setActiveBids(res);
      }
    } catch (err) {
      notify(err.message || 'Failed to retrieve bids');
    } finally {
      setLoadingBids(false);
    }
  };

  /* ─── Accept Bid (FR-3.3 & FR-3.5 Concurrency-Safe) ────────────── */
  const handleAcceptBid = async (postingId, bidId) => {
    setSubmittingAction(true);
    setConflictError(null);
    try {
      const res = await acceptLoadBid(postingId, bidId);
      if (res?.success) {
        notify(`Bid #${bidId} accepted and load awarded!`);
        setShowBidsManager(null);
        fetchPostings();
      }
    } catch (err) {
      if (err.status === 409 || (err.message && err.message.toLowerCase().includes('conflict'))) {
        const msg = 'Conflict: This load has already been booked or is no longer available.';
        setConflictError(msg);
        notify(msg);
      } else {
        notify(err.message || 'Failed to accept bid');
      }
      setShowBidsManager(null);
      fetchPostings();
    } finally {
      setSubmittingAction(false);
    }
  };

  /* ─── Reject Bid (FR-3.3) ───────────────────────────────────────── */
  const handleRejectBid = async (postingId, bidId, notes) => {
    setSubmittingAction(true);
    try {
      const res = await rejectLoadBid(postingId, bidId, { notes });
      if (res?.success) {
        notify(`Bid #${bidId} rejected.`);
        // Refresh bids in modal
        const updated = await getLoadBids(postingId);
        setActiveBids(updated.data || []);
      }
    } catch (err) {
      notify(err.message || 'Failed to reject bid');
    } finally {
      setSubmittingAction(false);
    }
  };

  /* ─── Counter Bid (FR-3.3) ──────────────────────────────────────── */
  const handleCounterBid = async (postingId, bidId) => {
    const input = counterInput[bidId];
    if (!input || !input.amount || Number(input.amount) <= 0) {
      notify('Please enter a valid counter-offer amount.');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await counterLoadBid(postingId, bidId, {
        counter_amount: Number(input.amount),
        notes: input.notes,
      });
      if (res?.success) {
        notify(`Counter-offer of ${formatMoney(input.amount)} sent!`);
        const updated = await getLoadBids(postingId);
        setActiveBids(updated.data || []);
        setCounterInput((prev) => ({ ...prev, [bidId]: undefined }));
      }
    } catch (err) {
      notify(err.message || 'Failed to counter bid');
    } finally {
      setSubmittingAction(false);
    }
  };

  /* ─── Withdraw Bid (FR-3.3) ─────────────────────────────────────── */
  const handleWithdrawBid = async (postingId, bidId) => {
    setSubmittingAction(true);
    try {
      const res = await withdrawLoadBid(postingId, bidId);
      if (res?.success) {
        notify(`Bid #${bidId} withdrawn.`);
        const updated = await getLoadBids(postingId);
        setActiveBids(updated.data || []);
      }
    } catch (err) {
      notify(err.message || 'Failed to withdraw bid');
    } finally {
      setSubmittingAction(false);
    }
  };

  /* ─── FR-3.4: Open Matching Recommendations Modal ───────────────── */
  const openMatchesForPosting = async (posting) => {
    setShowMatchesModal(posting);
    setLoadingMatches(true);
    try {
      const res = await getLoadMatches(posting.id);
      if (res?.success) {
        setMatchesData(res.data);
      }
    } catch (err) {
      notify(err.message || 'Failed to generate carrier matches');
    } finally {
      setLoadingMatches(false);
    }
  };

  /* ─── Cancel Posting (FR-3.1) ──────────────────────────────────── */
  const handleCancelPosting = async (postingId) => {
    if (!window.confirm(`Are you sure you want to cancel load posting #${postingId}?`)) return;
    try {
      const res = await cancelLoadPosting(postingId);
      if (res?.success) {
        notify(`Load posting #${postingId} cancelled.`);
        fetchPostings();
      }
    } catch (err) {
      notify(err.message || 'Failed to cancel load posting');
    }
  };

  if (!canRead) {
    return (
      <div className="lb-container" data-testid="load-board-container">
        <div className="lb-warning-box" style={{ margin: '30px auto', maxWidth: '600px' }}>
          <WarningCircle size={24} />
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: '16px' }}>Access Restricted</h3>
            <p style={{ margin: 0, fontSize: '13.5px' }}>
              Your account does not possess permission to view or manage load board postings. Contact your organization administrator for access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lb-container" data-testid="load-board-container">
      {/* ─── Page Header ────────────────────────────────────────── */}
      <header className="lb-header">
        <div className="lb-header-titles">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Truck size={28} style={{ color: 'var(--lb-blue, #005fdc)' }} />
            <h1>Find Loads</h1>
          </div>
          <p>
            Public and private freight marketplace, automated carrier scoring, live bidding, and concurrency-safe
            booking.
          </p>
        </div>

        <div className="lb-header-actions">
          {/* Socket.io Live Status Pill */}
          <div
            className={`lb-socket-pill ${socketConnected ? 'connected' : ''}`}
            title={socketConnected ? 'Real-time WebSocket connected' : 'Connecting to real-time events...'}
          >
            <span className="lb-socket-dot" />
            <span>{socketConnected ? 'Live Network' : 'Connecting...'}</span>
          </div>

          <button
            type="button"
            className="btn"
            onClick={() => fetchPostings()}
            disabled={loadingPostings}
            title="Refresh load postings"
          >
            <ArrowClockwise size={16} className={loadingPostings ? 'lb-spin' : ''} />
            <span>Refresh</span>
          </button>

          {/* Post Load button (Shippers / Admins) */}
          {isShipper && (
            <button
              type="button"
              className="btn primary"
              onClick={openNewPostingModal}
              title="Post shipment to load board"
            >
              <Plus size={16} weight="bold" />
              <span>Post Load</span>
            </button>
          )}
        </div>
      </header>

      {/* ─── Real-Time WebSocket Toast Banner (FR-3.7) ─────────── */}
      {realtimeAlert && (
        <div className="lb-live-banner" role="status">
          <div className="lb-live-banner-content">
            <Broadcast size={20} weight="fill" />
            <span>
              <strong>New Load Live:</strong> {realtimeAlert.origin} → {realtimeAlert.destination} ·{' '}
              {formatMoney(realtimeAlert.posted_rate)} · {realtimeAlert.equipment_type?.replace('_', ' ')} ·{' '}
              <span className="lb-badge lb-badge-public">{realtimeAlert.visibility}</span>
            </span>
          </div>
          <div className="lb-live-banner-actions">
            <button
              type="button"
              className="lb-live-banner-btn"
              onClick={() => {
                fetchPostings('posted');
                setRealtimeAlert(null);
              }}
            >
              View Loads ({newLoadsCount})
            </button>
            <button
              type="button"
              className="lb-live-banner-close"
              onClick={() => setRealtimeAlert(null)}
              aria-label="Dismiss real-time alert"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ─── Concurrency HTTP 409 Conflict Alert (FR-3.5) ───────── */}
      {conflictError && (
        <div className="lb-conflict-banner" role="alert">
          <div className="lb-conflict-banner-msg">
            <WarningCircle size={22} weight="fill" />
            <span>{conflictError}</span>
          </div>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setConflictError(null);
              fetchPostings();
            }}
          >
            Refresh Available Loads
          </button>
        </div>
      )}

      {/* ─── Tabs Navigation ────────────────────────────────────── */}
      <nav className="lb-tabs-bar" aria-label="Load board view navigation">
        <button
          type="button"
          className={`lb-tab-btn ${activeTab === 'available' ? 'active' : ''}`}
          onClick={() => setActiveTab('available')}
        >
          <Globe size={18} />
          <span>Available Loads</span>
          <span className="lb-tab-count">{totalPostings}</span>
        </button>

        {isShipper && (
          <button
            type="button"
            className={`lb-tab-btn ${activeTab === 'my_postings' ? 'active' : ''}`}
            onClick={() => setActiveTab('my_postings')}
          >
            <Tag size={18} />
            <span>My Load Postings</span>
          </button>
        )}

        {isCarrier && (
          <button
            type="button"
            className={`lb-tab-btn ${activeTab === 'preferences' ? 'active' : ''}`}
            onClick={() => setActiveTab('preferences')}
          >
            <Sliders size={18} />
            <span>Carrier Preferences</span>
            <span className="lb-tab-count">{carrierPrefs.length}</span>
          </button>
        )}

        <button
          type="button"
          className={`lb-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <ChartBar size={18} />
          <span>Lane Analytics</span>
        </button>
      </nav>

      {/* ─── TAB 1: Available Loads & TAB 2: My Postings ─────────── */}
      {(activeTab === 'available' || activeTab === 'my_postings') && (
        <>
          {/* Summary / KPI Cards Bar */}
          <div className="lb-summary-cards">
            <div className="lb-summary-card">
              <span className="lb-summary-card-label">Marketplace Loads</span>
              <span className="lb-summary-card-val">{totalPostings}</span>
              <span className="lb-summary-card-sub">Active listings</span>
            </div>
            <div className="lb-summary-card">
              <span className="lb-summary-card-label">Instant Book</span>
              <span className="lb-summary-card-val" style={{ color: '#059669' }}>
                {bookableCount}
              </span>
              <span className="lb-summary-card-sub">Direct award loads</span>
            </div>
            <div className="lb-summary-card">
              <span className="lb-summary-card-label">Open for Bidding</span>
              <span className="lb-summary-card-val" style={{ color: '#005fdc' }}>
                {biddableCount}
              </span>
              <span className="lb-summary-card-sub">Accepting carrier offers</span>
            </div>
            <div className="lb-summary-card">
              <span className="lb-summary-card-label">Private Network</span>
              <span className="lb-summary-card-val" style={{ color: '#7e22ce' }}>
                {privateCount}
              </span>
              <span className="lb-summary-card-sub">Restricted access loads</span>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="lb-toolbar">
            <div className="lb-toolbar-row">
              {/* Origin search (FR-3.2) */}
              <div className="lb-search-box">
                <MapPin size={17} />
                <input
                  type="text"
                  placeholder="Filter origin (city, state)..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && fetchPostings()}
                  aria-label="Filter origin"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="lb-search-clear-btn"
                    aria-label="Clear origin filter"
                    onClick={() => {
                      setSearchQuery('');
                      setPage(1);
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Destination search (FR-3.2) */}
              <div className="lb-search-box">
                <MapPin size={17} />
                <input
                  type="text"
                  placeholder="Filter destination (city, state)..."
                  value={destQuery}
                  onChange={(e) => {
                    setDestQuery(e.target.value);
                    setPage(1);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && fetchPostings()}
                  aria-label="Filter destination"
                />
                {destQuery && (
                  <button
                    type="button"
                    className="lb-search-clear-btn"
                    aria-label="Clear destination filter"
                    onClick={() => {
                      setDestQuery('');
                      setPage(1);
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Status filter */}
              <select
                className="lb-select"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter status"
              >
                <option value="posted">Status: Available (Posted)</option>
                <option value="booked">Status: Booked</option>
                <option value="cancelled">Status: Cancelled</option>
                <option value="all">Status: All Statuses</option>
              </select>

              {/* Equipment filter */}
              <select
                className="lb-select"
                value={selectedEquipment}
                onChange={(e) => {
                  setSelectedEquipment(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter equipment"
              >
                <option value="all">All Equipment Types</option>
                {EQUIPMENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Min RPM filter */}
              <div className="lb-rpm-group" title="Minimum Rate Per Mile">
                <span className="lb-rpm-label">Min RPM:</span>
                <input
                  type="number"
                  step="0.10"
                  min="0"
                  placeholder="$2.50"
                  className="lb-rpm-input"
                  value={minRpmFilter}
                  onChange={(e) => {
                    setMinRpmFilter(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>

            {/* Row 2: Deadhead Radius Filter (FR-3.2) */}
            <div className="lb-toolbar-row">
              <div className="lb-deadhead-group" title="Filter by maximum deadhead radius from your hub">
                <span className="lb-deadhead-label">Deadhead Radius:</span>
                <input
                  type="range"
                  min="0"
                  max="250"
                  step="25"
                  className="lb-deadhead-slider"
                  value={deadheadRadius}
                  onChange={(e) => setDeadheadRadius(Number(e.target.value))}
                />
                <span className="lb-deadhead-badge">{deadheadRadius === 0 ? 'Any' : `${deadheadRadius} mi`}</span>
              </div>

              {deadheadRadius > 0 && (
                <div className="lb-search-box" style={{ maxWidth: '280px' }}>
                  <MapPin size={16} />
                  <input
                    type="text"
                    placeholder="Origin Hub (e.g. Chicago, IL)"
                    value={originSearchCity}
                    onChange={(e) => setOriginSearchCity(e.target.value)}
                  />
                </div>
              )}

              <button type="button" className="btn small primary" onClick={() => fetchPostings()}>
                <MagnifyingGlass size={14} />
                <span>Apply Filters</span>
              </button>

              {hasActiveFilters && (
                <button
                  type="button"
                  className="lb-reset-btn"
                  onClick={resetFilters}
                  title="Clear all active filters"
                >
                  <X size={14} />
                  <span>Clear filters</span>
                </button>
              )}
            </div>
          </div>

          {/* Table of Load Postings */}
          {loadingPostings ? (
            <div className="lb-loading-box">
              <ArrowClockwise size={24} className="lb-spin" />
              <span>Loading load postings from marketplace...</span>
            </div>
          ) : postings.length === 0 ? (
            <div className="lb-empty-state">
              <Truck size={48} weight="light" />
              <h3>No Load Postings Found</h3>
              <p>
                {hasActiveFilters
                  ? 'No loads matched your current filters. Adjust your deadhead radius, equipment, or origin query.'
                  : 'There are currently no active loads posted to the marketplace.'}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn outline small"
                  onClick={resetFilters}
                  style={{ marginTop: '8px' }}
                >
                  <X size={14} /> Clear Filters
                </button>
              )}
              {isShipper && !hasActiveFilters && (
                <button
                  type="button"
                  className="btn primary"
                  onClick={openNewPostingModal}
                  style={{ marginTop: '8px' }}
                >
                  <Plus size={16} />
                  Post a New Load
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="lb-table-wrap">
              <table className="lb-table">
                <thead>
                  <tr>
                    <th style={{ width: '130px' }}>Load Ref</th>
                    <th>Corridor Lane</th>
                    <th>Equipment</th>
                    <th>Posted Rate</th>
                    <th>Visibility</th>
                    <th>Bids</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right', paddingRight: '16px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {postings.map((p) => {
                    const isPrivate = p.visibility === 'private';
                    const rpm =
                      p.rate_per_mile !== undefined
                        ? p.rate_per_mile
                        : p.distance_miles && p.distance_miles > 0
                        ? Math.round((Number(p.posted_rate) / Number(p.distance_miles)) * 100) / 100
                        : null;
                    const isPoster = currentOrg && p.poster_org_id === currentOrg.id;
                    const canBook = isCarrier && p.status === 'posted' && p.allow_book_now;
                    const canBid = isCarrier && p.status === 'posted' && p.allow_bids;

                    return (
                      <tr key={p.id}>
                        {/* ID & Ref */}
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--lb-ink, #0f172a)' }}>#{p.id}</div>
                          <small style={{ color: 'var(--lb-muted, #64748b)' }}>
                            {p.shipment?.reference_number ? `Shipment: ${p.shipment.reference_number}` : `Shipment #${p.shipment_id}`}
                          </small>
                        </td>

                        {/* Lane */}
                        <td>
                          <div className="lb-lane-display">
                            <span className="lb-lane-route">
                              {p.origin_city || 'Origin'}, {p.origin_state || ''}
                              <ArrowsLeftRight size={14} style={{ color: '#94a3b8' }} />
                              {p.dest_city || 'Dest'}, {p.dest_state || ''}
                            </span>
                            <span className="lb-lane-distance">
                              {p.distance_miles ? `${p.distance_miles} miles` : 'Distance uncalculated'}
                            </span>
                          </div>
                        </td>

                        {/* Equipment */}
                        <td>
                          <span className="lb-equip-pill">
                            <Truck size={14} />
                            {p.equipment_type?.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>

                        {/* Posted Rate & RPM */}
                        <td>
                          <div className="lb-rate-display">
                            <span className="lb-rate-amount">{formatMoney(p.posted_rate)}</span>
                            {rpm && <span className="lb-rate-rpm">${rpm}/mi</span>}
                          </div>
                        </td>

                        {/* Visibility (FR-3.6) */}
                        <td>
                          {isPrivate ? (
                            <span className="lb-badge lb-badge-private" title="Restricted to preferred carrier network">
                              <Lock size={12} weight="bold" />
                              Private Load
                            </span>
                          ) : (
                            <span className="lb-badge lb-badge-public" title="Open to all compliant carriers">
                              <Globe size={12} />
                              Public Load
                            </span>
                          )}
                        </td>

                        {/* Bids Count (FR-3.3) */}
                        <td>
                          <span style={{ fontWeight: 600 }}>{p._count?.bids ?? (p.bids?.length || 0)}</span>
                          <small style={{ color: 'var(--lb-muted, #64748b)', marginLeft: '4px' }}>bids</small>
                        </td>

                        {/* Status */}
                        <td>
                          <span className={`lb-badge lb-badge-${p.status || 'posted'}`}>
                            {p.status ? p.status.toUpperCase() : 'POSTED'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'right' }}>
                          <div className="lb-row-actions">
                            {/* Instant Book Now (FR-3.5) */}
                            {canBook && (
                              <button
                                type="button"
                                className="lb-action-btn book"
                                onClick={() => setShowBookModal(p)}
                                disabled={submittingAction}
                                title="Book Now instantly at posted rate"
                              >
                                <Lightning size={13} weight="fill" />
                                <span>Book Now</span>
                              </button>
                            )}

                            {/* Submit Bid (FR-3.3) */}
                            {canBid && (
                              <button
                                type="button"
                                className="lb-action-btn bid"
                                onClick={() => setShowBidModal(p)}
                                disabled={submittingAction}
                                title="Submit a carrier rate bid"
                              >
                                <CurrencyDollar size={13} />
                                <span>Submit Bid</span>
                              </button>
                            )}

                            {/* Shipper: View Bids Manager (FR-3.3) */}
                            {(isPoster || isPlatformAdmin) && (
                              <button
                                type="button"
                                className="lb-action-btn"
                                onClick={() => openBidsForPosting(p)}
                                title="Inspect incoming bids and counter-offers"
                              >
                                <Handshake size={13} />
                                <span>Bids ({p._count?.bids ?? (p.bids?.length || 0)})</span>
                              </button>
                            )}

                            {/* Shipper: View Matching Carriers (FR-3.4) */}
                            {(isPoster || isPlatformAdmin) && (
                              <button
                                type="button"
                                className="lb-action-btn"
                                onClick={() => openMatchesForPosting(p)}
                                title="Automated carrier matching recommendations"
                              >
                                <UsersThree size={13} />
                                <span>Matches</span>
                              </button>
                            )}

                            {/* Shipper: Cancel posting */}
                            {(isPoster || isPlatformAdmin) && p.status === 'posted' && (
                              <button
                                type="button"
                                className="lb-action-btn danger"
                                onClick={() => handleCancelPosting(p.id)}
                                title="Cancel this load posting"
                              >
                                <X size={13} />
                                <span>Cancel</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Server-Side Pagination Controls (FR-3.2) */}
            {totalPages > 1 && (
              <div className="lb-pagination" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginTop: '14px' }}>
                <button
                  type="button"
                  className="btn small"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <CaretLeft size={14} />
                  <span>Previous</span>
                </button>
                <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                  Page {page} of {totalPages} ({totalPostings} {totalPostings === 1 ? 'load' : 'loads'})
                </span>
                <button
                  type="button"
                  className="btn small"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  <span>Next</span>
                  <CaretRight size={14} />
                </button>
              </div>
            )}
            </>
          )}
        </>
      )}

      {/* ─── TAB 3: Carrier Lane Preferences (FR-3.4) ───────────── */}
      {activeTab === 'preferences' && (
        <div className="lb-tab-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
                Your Lane Preferences
              </h2>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                Set your operating corridors and equipment profiles to receive automated load recommendations.
              </p>
            </div>
            <button
              type="button"
              className="btn primary"
              onClick={() => setShowAddPrefModal(true)}
              title="Add a new lane preference"
            >
              <Plus size={16} weight="bold" />
              Add Lane Preference
            </button>
          </div>

          {loadingPrefs ? (
            <div className="lb-loading-box">
              <ArrowClockwise size={24} className="lb-spin" />
              <span>Loading lane preferences...</span>
            </div>
          ) : carrierPrefs.length === 0 ? (
            <div className="lb-empty-state">
              <Sliders size={48} weight="light" />
              <h3>No Lane Preferences Saved</h3>
              <p>Add your preferred lanes and equipment to power the automated load matching algorithm.</p>
              <button
                type="button"
                className="btn primary"
                onClick={() => setShowAddPrefModal(true)}
                style={{ marginTop: '8px' }}
              >
                Add Your First Lane
              </button>
            </div>
          ) : (
            <div className="lb-table-wrap">
              <table className="lb-table">
                <thead>
                  <tr>
                    <th>Preferred Lane</th>
                    <th>Max Deadhead</th>
                    <th>Equipment Types</th>
                    <th>Min Rate Per Mile</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {carrierPrefs.map((pref) => (
                    <tr key={pref.id}>
                      <td style={{ fontWeight: 700 }}>
                        {pref.origin_city || 'Any Origin'}, {pref.origin_state || ''} →{' '}
                        {pref.dest_city || 'Any Destination'}, {pref.dest_state || ''}
                      </td>
                      <td>{pref.max_deadhead_miles ? `${pref.max_deadhead_miles} mi` : '50 mi'}</td>
                      <td>
                        {Array.isArray(pref.equipment_types) && pref.equipment_types.length > 0 ? (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {pref.equipment_types.map((eq) => (
                              <span key={eq} className="lb-equip-pill">
                                {eq.replace('_', ' ').toUpperCase()}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>All equipment</span>
                        )}
                      </td>
                      <td>{pref.min_rate_per_mile ? `$${Number(pref.min_rate_per_mile).toFixed(2)}/mi` : 'None'}</td>
                      <td>
                        <span className={`lb-badge ${pref.is_active ? 'lb-badge-posted' : 'lb-badge-expired'}`}>
                          {pref.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td>{formatDate(pref.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 4: Lane Performance & Analytics (FR-3.8) ────────── */}
      {activeTab === 'analytics' && (
        <div className="lb-tab-content">
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
              Lane Performance & Acceptance Metrics
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              Real metrics aggregated across load postings, awarded carrier bids, and time-to-book performance.
            </p>
          </div>

          {/* KPI Summary Cards */}
          <div className="lb-kpi-grid">
            <div className="lb-kpi-card highlight">
              <span className="lb-kpi-label">Active Corridors</span>
              <span className="lb-kpi-val">{laneMetrics?.summary?.total_lanes ?? 0}</span>
              <span className="lb-kpi-sub">Distinct origin-destination pairs</span>
            </div>
            <div className="lb-kpi-card">
              <span className="lb-kpi-label">Total Posted</span>
              <span className="lb-kpi-val">{laneMetrics?.summary?.total_posted_loads ?? 0}</span>
              <span className="lb-kpi-sub">Loads published to board</span>
            </div>
            <div className="lb-kpi-card">
              <span className="lb-kpi-label">Total Booked</span>
              <span className="lb-kpi-val">{laneMetrics?.summary?.total_booked_loads ?? 0}</span>
              <span className="lb-kpi-sub">Awarded to motor carriers</span>
            </div>
            <div className="lb-kpi-card">
              <span className="lb-kpi-label">Carrier Acceptance Rate</span>
              <span className="lb-kpi-val" style={{ color: '#059669' }}>
                {laneMetrics?.summary?.overall_acceptance_rate_pct ?? 0}%
              </span>
              <span className="lb-kpi-sub">Of evaluated carrier bids</span>
            </div>
            <div className="lb-kpi-card">
              <span className="lb-kpi-label">Carrier Rejection Rate</span>
              <span className="lb-kpi-val" style={{ color: '#dc2626' }}>
                {laneMetrics?.summary?.overall_rejection_rate_pct ?? 0}%
              </span>
              <span className="lb-kpi-sub">Unmatched or declined bids</span>
            </div>
            <div className="lb-kpi-card">
              <span className="lb-kpi-label">Avg Time to Book</span>
              <span className="lb-kpi-val">
                {laneMetrics?.summary?.avg_time_to_book_minutes !== null &&
                laneMetrics?.summary?.avg_time_to_book_minutes !== undefined
                  ? `${laneMetrics.summary.avg_time_to_book_minutes}m`
                  : '—'}
              </span>
              <span className="lb-kpi-sub">From posting to carrier award</span>
            </div>
          </div>

          {/* Lane breakdown table */}
          {loadingMetrics ? (
            <div className="lb-loading-box">
              <ArrowClockwise size={24} className="lb-spin" />
              <span>Calculating lane metrics...</span>
            </div>
          ) : !laneMetrics?.lanes || laneMetrics.lanes.length === 0 ? (
            <div className="lb-empty-state">
              <ChartBar size={48} weight="light" />
              <h3>No Lane Analytics Available Yet</h3>
              <p>Analytics will calculate automatically once loads and bids are processed across platform corridors.</p>
            </div>
          ) : (
            <div className="lb-table-wrap">
              <table className="lb-table">
                <thead>
                  <tr>
                    <th>Corridor Lane</th>
                    <th>Posted</th>
                    <th>Booked</th>
                    <th>Total Bids</th>
                    <th>Acceptance Rate</th>
                    <th>Rejection Rate</th>
                    <th>Avg Time to Book</th>
                    <th>Avg Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {laneMetrics.lanes.map((l, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 700 }}>{l.lane}</td>
                      <td>{l.total_posted}</td>
                      <td>{l.total_booked}</td>
                      <td>{l.total_bids}</td>
                      <td>
                        <div className="lb-pct-bar-wrap">
                          <span style={{ fontWeight: 700, color: '#059669', minWidth: '45px' }}>
                            {l.carrier_acceptance_rate_pct}%
                          </span>
                          <div className="lb-pct-bar">
                            <div
                              className="lb-pct-bar-fill"
                              style={{ width: `${Math.min(100, l.carrier_acceptance_rate_pct)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td style={{ color: '#dc2626', fontWeight: 600 }}>{l.carrier_rejection_rate_pct}%</td>
                      <td>{l.avg_time_to_book_minutes !== null ? `${l.avg_time_to_book_minutes} min` : '—'}</td>
                      <td style={{ fontWeight: 700 }}>{formatMoney(l.avg_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL 1: Post Load to Board (FR-3.1 & FR-3.6) ──────── */}
      {showPostModal && (
        <PostLoadModal
          shipments={availableShipments}
          onClose={() => setShowPostModal(false)}
          onSuccess={() => {
            setShowPostModal(false);
            notify('Shipment posted to load board successfully!');
            fetchPostings();
          }}
          notify={notify}
        />
      )}

      {/* ─── MODAL 2: Instant Book Now Confirmation (FR-3.5) ────── */}
      {showBookModal && (
        <div
          className="lb-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lb-book-title"
          onMouseDown={(e) => e.target === e.currentTarget && setShowBookModal(null)}
        >
          <div className="lb-modal-box">
            <div className="lb-modal-header">
              <h2 id="lb-book-title">
                <Lightning size={22} weight="fill" style={{ color: '#10b981' }} />
                Instant Book Now Confirmation
              </h2>
              <button
                type="button"
                className="lb-modal-close"
                onClick={() => setShowBookModal(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="lb-modal-body">
              <p style={{ margin: 0, fontSize: '14px', color: '#334155' }}>
                You are about to book this load immediately at the shipper's posted rate.
              </p>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b', fontSize: '13px' }}>Route:</span>
                  <strong>
                    {showBookModal.origin_city}, {showBookModal.origin_state} → {showBookModal.dest_city},{' '}
                    {showBookModal.dest_state}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b', fontSize: '13px' }}>Distance:</span>
                  <strong>{showBookModal.distance_miles ? `${showBookModal.distance_miles} miles` : '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b', fontSize: '13px' }}>Equipment:</span>
                  <strong>{showBookModal.equipment_type?.replace('_', ' ').toUpperCase()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                  <span style={{ color: '#0f172a', fontWeight: 700 }}>Agreed Rate:</span>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: '#10b981' }}>
                    {formatMoney(showBookModal.posted_rate)}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748b' }}>
                <ShieldCheck size={18} style={{ color: '#10b981' }} />
                <span>
                  Concurrency protected: Exclusive PostgreSQL row-lock will ensure no double-booking occurs.
                </span>
              </div>
            </div>
            <div className="lb-modal-footer">
              <button
                type="button"
                className="btn"
                onClick={() => setShowBookModal(null)}
                disabled={submittingAction}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => handleExecuteBookNow(showBookModal)}
                disabled={submittingAction}
              >
                {submittingAction ? 'Booking...' : 'Confirm Book Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: Submit Carrier Bid (FR-3.3) ────────────────── */}
      {showBidModal && (
        <SubmitBidModal
          posting={showBidModal}
          onClose={() => setShowBidModal(null)}
          onSubmit={(amount, notes) => handleExecuteBid(showBidModal.id, amount, notes)}
          submitting={submittingAction}
        />
      )}

      {/* ─── MODAL 4: Bids Manager & Counter-Offers (FR-3.3) ─────── */}
      {showBidsManager && (
        <div
          className="lb-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lb-bids-mgr-title"
          onMouseDown={(e) => e.target === e.currentTarget && setShowBidsManager(null)}
        >
          <div className="lb-modal-box wide">
            <div className="lb-modal-header">
              <h2 id="lb-bids-mgr-title">
                <Handshake size={22} />
                Bids on Load #{showBidsManager.id} ({showBidsManager.origin_city} → {showBidsManager.dest_city})
              </h2>
              <button
                type="button"
                className="lb-modal-close"
                onClick={() => setShowBidsManager(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="lb-modal-body">
              {loadingBids ? (
                <div className="lb-loading-box">
                  <ArrowClockwise size={20} className="lb-spin" />
                  <span>Loading carrier bids...</span>
                </div>
              ) : activeBids.length === 0 ? (
                <div className="lb-empty-state">
                  <Tag size={40} weight="light" />
                  <h3>No Bids Submitted Yet</h3>
                  <p>When carriers submit rate offers on this posting, they will appear here for review.</p>
                </div>
              ) : (
                <div className="lb-table-wrap">
                  <table className="lb-table">
                    <thead>
                      <tr>
                        <th>Carrier</th>
                        <th>Compliance / Safety</th>
                        <th>Bid Amount</th>
                        <th>Counter Amount</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right', paddingRight: '14px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeBids.map((b) => {
                        const isCountering = counterInput[b.id] !== undefined;
                        return (
                          <tr key={b.id}>
                            <td>
                              <div style={{ fontWeight: 700 }}>{b.carrier_org?.legal_name || `Carrier #${b.carrier_org_id}`}</div>
                              <small style={{ color: '#64748b' }}>
                                MC: {b.carrier_org?.mc_number || 'N/A'} · DOT: {b.carrier_org?.dot_number || 'N/A'}
                              </small>
                            </td>
                            <td>
                              <span
                                className="lb-badge"
                                style={{
                                  background: b.carrier_org?.safety_rating === 'Satisfactory' ? '#ecfdf5' : '#eff6ff',
                                  color: b.carrier_org?.safety_rating === 'Satisfactory' ? '#047857' : '#1d4ed8',
                                }}
                              >
                                {b.carrier_org?.safety_rating || 'Active'}
                              </span>
                            </td>
                            <td>
                              <strong style={{ fontSize: '14.5px' }}>{formatMoney(b.bid_amount)}</strong>
                              {b.notes && <div style={{ fontSize: '11px', color: '#64748b' }}>"{b.notes}"</div>}
                            </td>
                            <td>
                              {b.counter_amount ? (
                                <strong style={{ color: '#c2410c' }}>{formatMoney(b.counter_amount)}</strong>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>
                              <span className={`lb-badge lb-badge-${b.status || 'submitted'}`}>
                                {b.status?.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div className="lb-row-actions">
                                {isShipper && ['submitted', 'countered'].includes(b.status) && (
                                  <>
                                    <button
                                      type="button"
                                      className="lb-action-btn book"
                                      onClick={() => handleAcceptBid(showBidsManager.id, b.id)}
                                      disabled={submittingAction}
                                      title="Accept this bid and award the load"
                                    >
                                      <Check size={13} weight="bold" />
                                      <span>Accept</span>
                                    </button>
                                    <button
                                      type="button"
                                      className="lb-action-btn"
                                      onClick={() =>
                                        setCounterInput((prev) => ({
                                          ...prev,
                                          [b.id]: prev[b.id] ? undefined : { amount: '', notes: '' },
                                        }))
                                      }
                                    >
                                      <ArrowsLeftRight size={13} />
                                      <span>{isCountering ? 'Cancel' : 'Counter'}</span>
                                    </button>
                                    <button
                                      type="button"
                                      className="lb-action-btn danger"
                                      onClick={() => handleRejectBid(showBidsManager.id, b.id, 'Declined by poster')}
                                      disabled={submittingAction}
                                    >
                                      <X size={13} />
                                      <span>Reject</span>
                                    </button>
                                  </>
                                )}

                                {isCarrier && ['submitted', 'countered'].includes(b.status) && (
                                  <button
                                    type="button"
                                    className="lb-action-btn danger"
                                    onClick={() => handleWithdrawBid(showBidsManager.id, b.id)}
                                    disabled={submittingAction}
                                  >
                                    <X size={13} />
                                    <span>Withdraw</span>
                                  </button>
                                )}
                              </div>

                              {/* Inline Counter Form */}
                              {isCountering && (
                                <div
                                  style={{
                                    marginTop: '8px',
                                    display: 'flex',
                                    gap: '6px',
                                    alignItems: 'center',
                                  }}
                                >
                                  <input
                                    type="number"
                                    placeholder="Counter $"
                                    style={{ width: '90px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                    value={counterInput[b.id]?.amount || ''}
                                    onChange={(e) =>
                                      setCounterInput((prev) => ({
                                        ...prev,
                                        [b.id]: { ...(prev[b.id] || {}), amount: e.target.value },
                                      }))
                                    }
                                  />
                                  <button
                                    type="button"
                                    className="btn small primary"
                                    onClick={() => handleCounterBid(showBidsManager.id, b.id)}
                                    disabled={submittingAction}
                                  >
                                    Send
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="lb-modal-footer">
              <button type="button" className="btn" onClick={() => setShowBidsManager(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 5: Automated Carrier Matches (FR-3.4) ─────────── */}
      {showMatchesModal && (
        <div
          className="lb-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lb-matches-title"
          onMouseDown={(e) => e.target === e.currentTarget && setShowMatchesModal(null)}
        >
          <div className="lb-modal-box wide">
            <div className="lb-modal-header">
              <h2 id="lb-matches-title">
                <UsersThree size={22} />
                Automated Carrier Matches for Load #{showMatchesModal.id}
              </h2>
              <button
                type="button"
                className="lb-modal-close"
                onClick={() => setShowMatchesModal(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="lb-modal-body">
              {loadingMatches ? (
                <div className="lb-loading-box">
                  <ArrowClockwise size={20} className="lb-spin" />
                  <span>Computing deterministic carrier match scores...</span>
                </div>
              ) : !matchesData?.matches || matchesData.matches.length === 0 ? (
                <div className="lb-empty-state">
                  <Truck size={40} weight="light" />
                  <h3>No Carrier Matches Found</h3>
                  <p>
                    No eligible active carriers matched this lane, equipment type, or preference rules. Blocked
                    carriers are excluded.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>
                    Ranked by deterministic scoring model:{' '}
                    <strong>45% Lane Match + 35% Equipment Fit + 20% Performance Rating</strong>.
                  </div>

                  {matchesData.matches.map((m) => {
                    const score = m.match_score || 0;
                    const scoreClass = score >= 80 ? 'high' : score >= 50 ? 'med' : 'low';
                    const bd = m.breakdown || {};

                    return (
                      <div key={m.carrier_id} className="lb-match-card">
                        <div className="lb-match-top">
                          <div>
                            <div className="lb-match-carrier-name">{m.legal_name}</div>
                            <div className="lb-match-carrier-meta">
                              <span>MC: {m.mc_number || 'N/A'}</span>
                              <span>DOT: {m.dot_number || 'N/A'}</span>
                              <span>Safety: {m.safety_rating || 'Unrated'}</span>
                              <span
                                className="lb-badge"
                                style={{
                                  background: m.is_compliant ? '#ecfdf5' : '#fef2f2',
                                  color: m.is_compliant ? '#047857' : '#b91c1c',
                                }}
                              >
                                {m.is_compliant ? 'Compliant' : 'Non-compliant'}
                              </span>
                            </div>
                          </div>

                          <div className={`lb-match-score-badge ${scoreClass}`}>
                            <span>{score}%</span>
                            <small style={{ fontSize: '10px', textTransform: 'uppercase' }}>Match</small>
                          </div>
                        </div>

                        {/* Breakdown progress bars */}
                        <div className="lb-match-breakdown">
                          <div className="lb-breakdown-row">
                            <span>Lane Proximity & Corridor Match (45%)</span>
                            <strong>{bd.lane_score ?? '—'} / 100</strong>
                          </div>
                          <div className="lb-breakdown-bar">
                            <div
                              className="lb-breakdown-fill"
                              style={{ width: `${Math.min(100, bd.lane_score || 0)}%`, background: '#2563eb' }}
                            />
                          </div>

                          <div className="lb-breakdown-row" style={{ marginTop: '6px' }}>
                            <span>Equipment Capability Fit (35%)</span>
                            <strong>{bd.equipment_score ?? '—'} / 100</strong>
                          </div>
                          <div className="lb-breakdown-bar">
                            <div
                              className="lb-breakdown-fill"
                              style={{ width: `${Math.min(100, bd.equipment_score || 0)}%`, background: '#059669' }}
                            />
                          </div>

                          <div className="lb-breakdown-row" style={{ marginTop: '6px' }}>
                            <span>Safety & Performance Rating (20%)</span>
                            <strong>{bd.performance_score ?? '—'} / 100</strong>
                          </div>
                          <div className="lb-breakdown-bar">
                            <div
                              className="lb-breakdown-fill"
                              style={{ width: `${Math.min(100, bd.performance_score || 0)}%`, background: '#d97706' }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="lb-modal-footer">
              <button type="button" className="btn" onClick={() => setShowMatchesModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 6: Add Carrier Preference (FR-3.4) ───────────── */}
      {showAddPrefModal && (
        <AddCarrierPreferenceModal
          onClose={() => setShowAddPrefModal(false)}
          onSuccess={() => {
            setShowAddPrefModal(false);
            notify('Carrier lane preference saved successfully!');
            fetchCarrierPreferences();
          }}
          notify={notify}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Sub-Component: PostLoadModal (FR-3.1 & FR-3.6)
   ────────────────────────────────────────────────────────────────── */
function PostLoadModal({ shipments = [], onClose, onSuccess, notify }) {
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [postedRate, setPostedRate] = useState('');
  const [equipmentType, setEquipmentType] = useState('dry_van');
  const [visibility, setVisibility] = useState('public');
  const [allowBookNow, setAllowBookNow] = useState(true);
  const [allowBids, setAllowBids] = useState(true);
  const [originCity, setOriginCity] = useState('');
  const [originState, setOriginState] = useState('');
  const [destCity, setDestCity] = useState('');
  const [destState, setDestState] = useState('');
  const [distanceMiles, setDistanceMiles] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // When a shipment is selected, prefill fields
  const handleSelectShipment = (e) => {
    const sId = e.target.value;
    setSelectedShipmentId(sId);
    const found = shipments.find((s) => String(s.id) === String(sId));
    if (found) {
      if (found.quote_amount) setPostedRate(String(found.quote_amount));
      if (found.freight_details?.equipment_type) setEquipmentType(found.freight_details.equipment_type);

      const pickup = found.stops?.find((st) => st.type === 'pickup') || found.stops?.[0];
      const dropoff = found.stops?.find((st) => st.type === 'dropoff') || found.stops?.[found.stops.length - 1];

      if (found.origin?.city) {
        setOriginCity(found.origin.city);
        if (found.origin.state) setOriginState(found.origin.state);
      } else if (typeof found.origin === 'string') {
        const parts = found.origin.split(',');
        if (parts[0]) setOriginCity(parts[0].trim());
        if (parts[1]) setOriginState(parts[1].trim());
      } else if (pickup?.address?.city) {
        setOriginCity(pickup.address.city);
        if (pickup.address.state) setOriginState(pickup.address.state);
      }

      if (found.destination?.city) {
        setDestCity(found.destination.city);
        if (found.destination.state) setDestState(found.destination.state);
      } else if (typeof found.destination === 'string') {
        const parts = found.destination.split(',');
        if (parts[0]) setDestCity(parts[0].trim());
        if (parts[1]) setDestState(parts[1].trim());
      } else if (dropoff?.address?.city) {
        setDestCity(dropoff.address.city);
        if (dropoff.address.state) setDestState(dropoff.address.state);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedShipmentId) {
      notify('Please select an active shipment to post.');
      return;
    }
    if (!postedRate || Number(postedRate) <= 0) {
      notify('Please enter a valid positive posted rate.');
      return;
    }

    setSubmitting(true);
    try {
      const origKey = `${(originCity || '').trim().toUpperCase()}, ${(originState || '').trim().toUpperCase()}`;
      const destKey = `${(destCity || '').trim().toUpperCase()}, ${(destState || '').trim().toUpperCase()}`;
      const origGeo = US_CITIES_GEO[origKey];
      const destGeo = US_CITIES_GEO[destKey];

      const payload = {
        shipment_id: Number(selectedShipmentId),
        posted_rate: Number(postedRate),
        equipment_type: equipmentType,
        visibility,
        allow_book_now: allowBookNow,
        allow_bids: allowBids,
        origin_city: originCity.trim() || undefined,
        origin_state: originState.trim() || undefined,
        origin_lat: origGeo?.lat,
        origin_lng: origGeo?.lng,
        dest_city: destCity.trim() || undefined,
        dest_state: destState.trim() || undefined,
        dest_lat: destGeo?.lat,
        dest_lng: destGeo?.lng,
        distance_miles: distanceMiles ? Number(distanceMiles) : undefined,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      };

      const res = await createLoadPosting(payload);
      if (res?.success) {
        onSuccess();
      }
    } catch (err) {
      notify(err.message || 'Failed to post shipment to load board');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="lb-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lb-post-modal-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="lb-modal-box wide">
        <div className="lb-modal-header">
          <h2 id="lb-post-modal-title">
            <Tag size={22} />
            Post Shipment to Load Board
          </h2>
          <button type="button" className="lb-modal-close" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="lb-modal-body">
          <div className="lb-form-grid">
            {/* Shipment select */}
            <div className="lb-form-field full">
              <label>Select Unbooked Shipment *</label>
              <select value={selectedShipmentId} onChange={handleSelectShipment} required>
                <option value="">-- Choose a shipment to post --</option>
                {shipments.map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.id} · {s.reference_number || 'No Ref'} — {s.status?.toUpperCase()}
                    {s.quote_amount ? ` ($${s.quote_amount})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Rate & Equipment */}
            <div className="lb-form-field">
              <label>Posted Rate ($ USD) *</label>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                placeholder="e.g. 2400.00"
                value={postedRate}
                onChange={(e) => setPostedRate(e.target.value)}
              />
            </div>

            <div className="lb-form-field">
              <label>Equipment Type *</label>
              <select value={equipmentType} onChange={(e) => setEquipmentType(e.target.value)}>
                {EQUIPMENT_OPTIONS.map((eq) => (
                  <option key={eq.value} value={eq.value}>
                    {eq.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Origin */}
            <div className="lb-form-field">
              <label>Origin City</label>
              <input
                type="text"
                placeholder="Chicago"
                value={originCity}
                onChange={(e) => setOriginCity(e.target.value)}
              />
            </div>

            <div className="lb-form-field">
              <label>Origin State</label>
              <input
                type="text"
                maxLength={2}
                placeholder="IL"
                value={originState}
                onChange={(e) => setOriginState(e.target.value.toUpperCase())}
              />
            </div>

            {/* Destination */}
            <div className="lb-form-field">
              <label>Destination City</label>
              <input
                type="text"
                placeholder="Dallas"
                value={destCity}
                onChange={(e) => setDestCity(e.target.value)}
              />
            </div>

            <div className="lb-form-field">
              <label>Destination State</label>
              <input
                type="text"
                maxLength={2}
                placeholder="TX"
                value={destState}
                onChange={(e) => setDestState(e.target.value.toUpperCase())}
              />
            </div>

            {/* Distance & Expiration */}
            <div className="lb-form-field">
              <label>Distance (Miles)</label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 920"
                value={distanceMiles}
                onChange={(e) => setDistanceMiles(e.target.value)}
              />
            </div>

            <div className="lb-form-field">
              <label>Expires At (Optional)</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>

            {/* Visibility Radio (FR-3.6) */}
            <div className="lb-form-field full">
              <label>Marketplace Visibility (FR-3.6)</label>
              <div className="lb-radio-group">
                <label className="lb-radio-item">
                  <input
                    type="radio"
                    name="vis"
                    value="public"
                    checked={visibility === 'public'}
                    onChange={() => setVisibility('public')}
                  />
                  <span>🌐 Public Load Board (Open to all compliant carriers)</span>
                </label>
                <label className="lb-radio-item">
                  <input
                    type="radio"
                    name="vis"
                    value="private"
                    checked={visibility === 'private'}
                    onChange={() => setVisibility('private')}
                  />
                  <span>🔒 Private Network (Restricted to preferred carrier network)</span>
                </label>
              </div>
            </div>

            {/* Booking Options Checkboxes */}
            <div className="lb-form-field full">
              <label>Carrier Interaction Controls</label>
              <div className="lb-checkbox-group">
                <label className="lb-checkbox-item">
                  <input
                    type="checkbox"
                    checked={allowBookNow}
                    onChange={(e) => setAllowBookNow(e.target.checked)}
                  />
                  <span>Allow Instant "Book Now" at posted rate</span>
                </label>
                <label className="lb-checkbox-item">
                  <input
                    type="checkbox"
                    checked={allowBids}
                    onChange={(e) => setAllowBids(e.target.checked)}
                  />
                  <span>Allow Carrier Bids / Counter-Offers</span>
                </label>
              </div>
            </div>
          </div>

          <div className="lb-modal-footer">
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? 'Publishing...' : 'Publish to Load Board'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Sub-Component: SubmitBidModal (FR-3.3)
   ────────────────────────────────────────────────────────────────── */
function SubmitBidModal({ posting, onClose, onSubmit, submitting }) {
  const [bidAmount, setBidAmount] = useState('');
  const [notes, setNotes] = useState('');

  const miles = posting.distance_miles ? Number(posting.distance_miles) : 0;
  const rpm =
    miles > 0 && bidAmount && Number(bidAmount) > 0
      ? Math.round((Number(bidAmount) / miles) * 100) / 100
      : null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!bidAmount || Number(bidAmount) <= 0) return;
    onSubmit(bidAmount, notes);
  };

  return (
    <div
      className="lb-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lb-bid-modal-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="lb-modal-box">
        <div className="lb-modal-header">
          <h2 id="lb-bid-modal-title">
            <CurrencyDollar size={22} />
            Submit Carrier Bid on Load #{posting.id}
          </h2>
          <button type="button" className="lb-modal-close" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="lb-modal-body">
          <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', fontSize: '13px' }}>
            <div>
              Route: <strong>{posting.origin_city}, {posting.origin_state} → {posting.dest_city}, {posting.dest_state}</strong>
            </div>
            <div>
              Posted Target Rate: <strong>{formatMoney(posting.posted_rate)}</strong>
              {miles > 0 && ` (${miles} miles)`}
            </div>
          </div>

          <div className="lb-form-field">
            <label>Your Bid Amount ($ USD) *</label>
            <input
              type="number"
              step="0.01"
              min="1"
              required
              autoFocus
              placeholder="e.g. 2550.00"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
            />
            {rpm && (
              <small style={{ color: '#059669', fontWeight: 600 }}>
                Effective Rate Per Mile: ${rpm}/mi
              </small>
            )}
          </div>

          <div className="lb-form-field">
            <label>Notes / Transit Details (Optional)</label>
            <textarea
              rows={3}
              placeholder="e.g. Can pick up tomorrow morning at 08:00 AM sharp with clean 53ft reefer."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="lb-modal-footer">
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? 'Submitting Bid...' : 'Submit Bid'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Sub-Component: AddCarrierPreferenceModal (FR-3.4)
   ────────────────────────────────────────────────────────────────── */
function AddCarrierPreferenceModal({ onClose, onSuccess, notify }) {
  const [originCity, setOriginCity] = useState('');
  const [originState, setOriginState] = useState('');
  const [destCity, setDestCity] = useState('');
  const [destState, setDestState] = useState('');
  const [maxDeadhead, setMaxDeadhead] = useState(50);
  const [equipmentTypes, setEquipmentTypes] = useState(['dry_van']);
  const [minRpm, setMinRpm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggleEquipment = (eq) => {
    setEquipmentTypes((prev) =>
      prev.includes(eq) ? prev.filter((item) => item !== eq) : [...prev, eq]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        origin_city: originCity.trim() || undefined,
        origin_state: originState.trim() || undefined,
        dest_city: destCity.trim() || undefined,
        dest_state: destState.trim() || undefined,
        max_deadhead_miles: Number(maxDeadhead) || 50,
        equipment_types: equipmentTypes,
        min_rate_per_mile: minRpm ? Number(minRpm) : undefined,
        is_active: true,
      };

      const res = await saveCarrierPreference(payload);
      if (res?.success) {
        onSuccess();
      }
    } catch (err) {
      notify(err.message || 'Failed to save carrier preference');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="lb-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lb-pref-modal-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="lb-modal-box">
        <div className="lb-modal-header">
          <h2 id="lb-pref-modal-title">
            <Sliders size={22} />
            Add Preferred Operating Corridor
          </h2>
          <button type="button" className="lb-modal-close" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="lb-modal-body">
          <div className="lb-form-grid">
            <div className="lb-form-field">
              <label>Origin Hub City</label>
              <input
                type="text"
                placeholder="Chicago"
                value={originCity}
                onChange={(e) => setOriginCity(e.target.value)}
              />
            </div>
            <div className="lb-form-field">
              <label>Origin State</label>
              <input
                type="text"
                maxLength={2}
                placeholder="IL"
                value={originState}
                onChange={(e) => setOriginState(e.target.value.toUpperCase())}
              />
            </div>

            <div className="lb-form-field">
              <label>Destination Hub City</label>
              <input
                type="text"
                placeholder="Atlanta"
                value={destCity}
                onChange={(e) => setDestCity(e.target.value)}
              />
            </div>
            <div className="lb-form-field">
              <label>Destination State</label>
              <input
                type="text"
                maxLength={2}
                placeholder="GA"
                value={destState}
                onChange={(e) => setDestState(e.target.value.toUpperCase())}
              />
            </div>

            <div className="lb-form-field">
              <label>Max Deadhead (Miles)</label>
              <input
                type="number"
                min="0"
                max="500"
                value={maxDeadhead}
                onChange={(e) => setMaxDeadhead(e.target.value)}
              />
            </div>

            <div className="lb-form-field">
              <label>Minimum Rate Per Mile ($)</label>
              <input
                type="number"
                step="0.10"
                placeholder="e.g. 2.75"
                value={minRpm}
                onChange={(e) => setMinRpm(e.target.value)}
              />
            </div>

            <div className="lb-form-field full">
              <label>Supported Equipment Types</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                {EQUIPMENT_OPTIONS.map((eq) => (
                  <label key={eq.value} className="lb-checkbox-item">
                    <input
                      type="checkbox"
                      checked={equipmentTypes.includes(eq.value)}
                      onChange={() => toggleEquipment(eq.value)}
                    />
                    <span>{eq.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="lb-modal-footer">
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Corridor Preference'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

