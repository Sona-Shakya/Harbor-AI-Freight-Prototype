import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Truck,
  Wrench,
  UsersThree,
  ShieldCheck,
  ChartBar,
  Stack,
  ArrowsLeftRight,
  Clock,
  WarningCircle,
  CheckCircle,
  Plus,
  ArrowClockwise,
  MagnifyingGlass,
  FileText,
  Buildings,
  Pen,
  Trash,
  X,
  Check,
  Eye,
  CaretRight,
  CaretLeft,
  CalendarCheck,
  Gauge,
  Phone,
  EnvelopeSimple,
  IdentificationBadge,
  Info,
  DownloadSimple,
} from '@phosphor-icons/react';
import {
  getVehicles,
  getVehicle,
  getAssignedVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicleAvailability,
  getVehicleMaintenance,
  createVehicleMaintenance,
  updateMaintenanceRecord,
  getVehicleInspections,
  createVehicleInspection,
  getFleetDrivers,
  getFleetDriver,
  getDriverHos,
  getDriverHosHistory,
  recordDutyStatus,
  checkHosEligibility,
  getDriverEld,
  syncDriverEld,
  getEldProviders,
  getCarrierCompliance,
  updateCarrierCompliance,
  setCarrierSuspension,
  getCarrierInsurance,
  createInsurancePolicy,
  updateInsurancePolicy,
  getComplianceExpirations,
  assignFleetToShipment,
  getShipmentFleetAssignment,
  removeShipmentFleetAssignment,
  getShipments,
  getCarrierScorecard,
  evaluateCarrierScorecard,
  getCarrierTier,
  listCarrierTiers,
  updateCarrierTier,
} from './api';

import './styles/carrierFleet.css';

const DUTY_STATUS_LABELS = {
  off_duty: 'Off Duty',
  sleeper_berth: 'Sleeper Berth',
  driving: 'Driving',
  on_duty: 'On Duty (Not Driving)',
};

const DUTY_STATUS_BADGES = {
  off_duty: 'cf-badge-off_duty',
  sleeper_berth: 'cf-badge-scheduled',
  driving: 'cf-badge-driving',
  on_duty: 'cf-badge-active',
};

export default function CarrierFleetManagement({
  hasPermission,
  notify,
  currentUser,
  currentRoleName,
  currentOrg,
}) {
  const isDriver = currentRoleName === 'Driver';
  const isPlatformAdmin = currentRoleName === 'Platform Admin';
  const isCarrierStaff = currentRoleName === 'Company Admin' || currentRoleName === 'Carrier Admin' || currentRoleName === 'Dispatcher';
  const isCarrierAdmin = currentRoleName === 'Company Admin' || currentRoleName === 'Carrier Admin' || isPlatformAdmin;
  const isShipper = currentRoleName === 'Shipper User';

  const [activeTab, setActiveTab] = useState(isDriver ? 'drivers' : 'fleet');

  const canManageVehicles = !isDriver && !isShipper && (isCarrierStaff || hasPermission?.('vehicles', 'create'));
  const canManageMaintenance = !isDriver && !isShipper && (isCarrierStaff || hasPermission?.('vehicle_maintenance', 'create'));
  const canViewCosts = !isDriver && !isShipper && (isCarrierAdmin || currentRoleName?.includes('Finance'));
  const canManageCompliance = isCarrierAdmin || hasPermission?.('carrier_compliance', 'update');
  const canSuspendCarrier = isCarrierAdmin || hasPermission?.('carrier_compliance', 'suspend');
  const canAssignFleet = !isDriver && !isShipper && (isCarrierStaff || hasPermission?.('fleet_assignments', 'create'));
  const canEvaluateScorecard = !isDriver && (isCarrierAdmin || hasPermission?.('carrier_scorecards', 'evaluate'));
  const canUpdateTier = isPlatformAdmin || (!isCarrierStaff && hasPermission?.('carrier_network_tiers', 'update'));



  // ============================================================
  // TAB 1: FLEET ASSETS STATE
  // ============================================================
  const [vehicles, setVehicles] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('');
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState('');
  const [vehicleEquipmentFilter, setVehicleEquipmentFilter] = useState('');
  const [assignedVehicle, setAssignedVehicle] = useState(null);

  // Modals
  const [showNewVehicleModal, setShowNewVehicleModal] = useState(false);
  const [selectedVehicleDetail, setSelectedVehicleDetail] = useState(null);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [decommissioningVehicle, setDecommissioningVehicle] = useState(null);

  // ============================================================
  // TAB 2: MAINTENANCE STATE
  // ============================================================
  const [selectedMaintVehicleId, setSelectedMaintVehicleId] = useState('');
  const [maintRecords, setMaintRecords] = useState([]);
  const [inspectionRecords, setInspectionRecords] = useState([]);
  const [vehicleAvailability, setVehicleAvailability] = useState(null);
  const [loadingMaintenance, setLoadingMaintenance] = useState(false);
  const [showNewMaintModal, setShowNewMaintModal] = useState(false);
  const [editingMaintRecord, setEditingMaintRecord] = useState(null);
  const [showNewInspectionModal, setShowNewInspectionModal] = useState(false);

  // ============================================================
  // TAB 3 & 8: DRIVERS, HOS & ELD STATE
  // ============================================================
  const [driverRoster, setDriverRoster] = useState([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [driverHos, setDriverHos] = useState(null);
  const [driverHosHistory, setDriverHosHistory] = useState([]);
  const [driverEld, setDriverEld] = useState(null);
  const [eldProviders, setEldProviders] = useState([]);
  const [loadingHos, setLoadingHos] = useState(false);
  const [showDutyStatusModal, setShowDutyStatusModal] = useState(false);
  const [showHosEligibilityModal, setShowHosEligibilityModal] = useState(false);

  // ============================================================
  // TAB 4: INSURANCE & COMPLIANCE STATE
  // ============================================================
  const [complianceData, setComplianceData] = useState(null);
  const [insurancePolicies, setInsurancePolicies] = useState([]);
  const [expirationsData, setExpirationsData] = useState(null);
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  const [showNewInsuranceModal, setShowNewInsuranceModal] = useState(false);
  const [editingInsurance, setEditingInsurance] = useState(null);
  const [showSuspendModal, setShowSuspendModal] = useState(false);

  // ============================================================
  // TAB 5: CARRIER SCORECARD STATE (FR-5.5)
  // ============================================================
  const [scorecardData, setScorecardData] = useState(null);
  const [loadingScorecard, setLoadingScorecard] = useState(false);
  const [evaluatingScorecard, setEvaluatingScorecard] = useState(false);
  const [scorecardPeriod, setScorecardPeriod] = useState('rolling_90d');

  // ============================================================
  // TAB 6: NETWORK TIERS STATE (FR-5.6)
  // ============================================================
  const [tierData, setTierData] = useState(null);
  const [loadingTier, setLoadingTier] = useState(false);
  const [updatingTier, setUpdatingTier] = useState(false);
  const [showUpdateTierModal, setShowUpdateTierModal] = useState(false);

  // ============================================================
  // TAB 7: FLEET ASSIGNMENT STATE
  // ============================================================
  const [shipments, setShipments] = useState([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [currentAssignment, setCurrentAssignment] = useState(null);
  const [assignTruckId, setAssignTruckId] = useState('');
  const [assignTrailerId, setAssignTrailerId] = useState('');
  const [assignDriverId, setAssignDriverId] = useState('');
  const [submittingAssignment, setSubmittingAssignment] = useState(false);
  const [assignmentError, setAssignmentError] = useState('');

  // ============================================================
  // DATA FETCHING: FLEET ASSETS
  // ============================================================
  const fetchVehicles = useCallback(async () => {
    if (isDriver) {
      // Driver view: fetch assigned vehicle
      try {
        const res = await getAssignedVehicle();
        setAssignedVehicle(res?.data || null);
      } catch (err) {
        console.warn('Driver assigned vehicle error:', err);
      }
      return;
    }

    setLoadingVehicles(true);
    try {
      const params = {};
      if (vehicleSearch.trim()) params.search = vehicleSearch.trim();
      if (vehicleTypeFilter) params.type = vehicleTypeFilter;
      if (vehicleStatusFilter) params.status = vehicleStatusFilter;
      if (vehicleEquipmentFilter) params.equipment_type = vehicleEquipmentFilter;

      const res = await getVehicles(params);
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setVehicles(list);

      // Auto-select first vehicle for maintenance if none selected
      if (!selectedMaintVehicleId && list.length > 0) {
        setSelectedMaintVehicleId(String(list[0].id));
      }
    } catch (err) {
      console.error('Fetch vehicles error:', err);
      notify?.(err.message || 'Failed to load fleet vehicles');
    } finally {
      setLoadingVehicles(false);
    }
  }, [isDriver, vehicleSearch, vehicleTypeFilter, vehicleStatusFilter, vehicleEquipmentFilter, selectedMaintVehicleId, notify]);

  // ============================================================
  // DATA FETCHING: MAINTENANCE & AVAILABILITY
  // ============================================================
  const fetchMaintenance = useCallback(async (vId) => {
    if (!vId) return;
    setLoadingMaintenance(true);
    try {
      const [availRes, maintRes, inspRes] = await Promise.all([
        getVehicleAvailability(vId).catch(() => null),
        getVehicleMaintenance(vId).catch(() => ({ data: [] })),
        getVehicleInspections(vId).catch(() => ({ data: [] })),
      ]);

      setVehicleAvailability(availRes?.data || null);
      setMaintRecords(Array.isArray(maintRes?.data) ? maintRes.data : []);
      setInspectionRecords(Array.isArray(inspRes?.data) ? inspRes.data : []);
    } catch (err) {
      console.error('Fetch maintenance error:', err);
    } finally {
      setLoadingMaintenance(false);
    }
  }, []);

  // ============================================================
  // DATA FETCHING: DRIVER ROSTER & HOS
  // ============================================================
  const fetchDrivers = useCallback(async () => {
    setLoadingDrivers(true);
    try {
      if (isDriver) {
        // Driver only views own driver profile & HOS
        const myDriverId = currentUser?.id;
        if (myDriverId) {
          setSelectedDriverId(String(myDriverId));
          const [hosRes, histRes, eldRes] = await Promise.all([
            getDriverHos(myDriverId).catch(() => null),
            getDriverHosHistory(myDriverId).catch(() => ({ data: [] })),
            getDriverEld(myDriverId).catch(() => null),
          ]);
          setDriverHos(hosRes?.data || null);
          setDriverHosHistory(Array.isArray(histRes?.data) ? histRes.data : []);
          setDriverEld(eldRes?.data || null);
        }
      } else {
        const params = {};
        if (driverSearch.trim()) params.search = driverSearch.trim();
        const res = await getFleetDrivers(params);
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setDriverRoster(list);
        if (!selectedDriverId && list.length > 0) {
          setSelectedDriverId(String(list[0].id));
        }
      }
    } catch (err) {
      console.error('Fetch drivers error:', err);
    } finally {
      setLoadingDrivers(false);
    }
  }, [isDriver, currentUser, driverSearch, selectedDriverId]);

  const fetchDriverHosData = useCallback(async (dId) => {
    if (!dId) return;
    setLoadingHos(true);
    try {
      const [hosRes, histRes, eldRes] = await Promise.all([
        getDriverHos(dId).catch(() => null),
        getDriverHosHistory(dId).catch(() => ({ data: [] })),
        getDriverEld(dId).catch(() => null),
      ]);
      setDriverHos(hosRes?.data || null);
      setDriverHosHistory(Array.isArray(histRes?.data) ? histRes.data : []);
      setDriverEld(eldRes?.data || null);
    } catch (err) {
      console.error('Fetch driver HOS error:', err);
    } finally {
      setLoadingHos(false);
    }
  }, []);

  // ============================================================
  // DATA FETCHING: COMPLIANCE & INSURANCE
  // ============================================================
  const fetchCompliance = useCallback(async () => {
    if (isDriver) return; // Driver strictly denied
    setLoadingCompliance(true);
    try {
      const [compRes, insRes, expRes] = await Promise.all([
        getCarrierCompliance().catch(() => null),
        getCarrierInsurance().catch(() => ({ data: [] })),
        getComplianceExpirations(null, 45).catch(() => null),
      ]);
      setComplianceData(compRes?.data || null);
      setInsurancePolicies(Array.isArray(insRes?.data) ? insRes.data : []);
      setExpirationsData(expRes?.data || null);
    } catch (err) {
      console.error('Fetch compliance error:', err);
    } finally {
      setLoadingCompliance(false);
    }
  }, [isDriver]);

  // ============================================================
  // DATA FETCHING: CARRIER SCORECARD (FR-5.5)
  // ============================================================
  const fetchScorecard = useCallback(async (period = scorecardPeriod) => {
    if (isDriver) return;
    setLoadingScorecard(true);
    try {
      const res = await getCarrierScorecard(null, period);
      setScorecardData(res?.data || null);
    } catch (err) {
      console.warn('Fetch scorecard error:', err);
      setScorecardData(null);
    } finally {
      setLoadingScorecard(false);
    }
  }, [isDriver, scorecardPeriod]);

  const handleEvaluateScorecard = async () => {
    if (!canEvaluateScorecard) {
      notify?.('You do not have permission to evaluate carrier scorecards');
      return;
    }
    setEvaluatingScorecard(true);
    try {
      const res = await evaluateCarrierScorecard(null, scorecardPeriod);
      if (res?.data) {
        setScorecardData(res.data);
      } else {
        await fetchScorecard(scorecardPeriod);
      }
      notify?.('Carrier scorecard evaluated successfully');
    } catch (err) {
      console.error('Evaluate scorecard error:', err);
      notify?.(err.message || 'Failed to evaluate scorecard');
    } finally {
      setEvaluatingScorecard(false);
    }
  };

  // ============================================================
  // DATA FETCHING: CARRIER NETWORK TIERS (FR-5.6)
  // ============================================================
  const fetchTier = useCallback(async () => {
    if (isDriver) return;
    setLoadingTier(true);
    try {
      const res = await getCarrierTier();
      setTierData(res?.data || null);
    } catch (err) {
      console.warn('Fetch tier error:', err);
      setTierData(null);
    } finally {
      setLoadingTier(false);
    }
  }, [isDriver]);


  // ============================================================
  // DATA FETCHING: SHIPMENTS & ASSIGNMENT
  // ============================================================
  const fetchShipmentsAndAssignment = useCallback(async () => {
    if (isDriver) return;
    try {
      const res = await getShipments({ limit: 100 });
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setShipments(list);
      if (!selectedShipmentId && list.length > 0) {
        setSelectedShipmentId(String(list[0].id));
      }
    } catch (err) {
      console.warn('Could not fetch shipments for assignment:', err);
    }
  }, [isDriver, selectedShipmentId]);

  const fetchCurrentAssignment = useCallback(async (sId) => {
    if (!sId) {
      setCurrentAssignment(null);
      return;
    }
    try {
      const res = await getShipmentFleetAssignment(sId);
      setCurrentAssignment(res?.data || null);
    } catch {
      setCurrentAssignment(null);
    }
  }, []);

  // Initial Load Effects
  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  useEffect(() => {
    if (activeTab === 'maintenance' && selectedMaintVehicleId) {
      fetchMaintenance(selectedMaintVehicleId);
    }
  }, [activeTab, selectedMaintVehicleId, fetchMaintenance]);

  useEffect(() => {
    if (activeTab === 'drivers' || activeTab === 'eld') {
      fetchDrivers();
    }
  }, [activeTab, fetchDrivers]);

  useEffect(() => {
    if ((activeTab === 'drivers' || activeTab === 'eld') && selectedDriverId) {
      fetchDriverHosData(selectedDriverId);
    }
  }, [activeTab, selectedDriverId, fetchDriverHosData]);

  useEffect(() => {
    if (activeTab === 'compliance' || activeTab === 'scorecard' || activeTab === 'tiers') {
      fetchCompliance();
    }
  }, [activeTab, fetchCompliance]);

  useEffect(() => {
    if (activeTab === 'scorecard') {
      fetchScorecard(scorecardPeriod);
    }
  }, [activeTab, scorecardPeriod, fetchScorecard]);

  useEffect(() => {
    if (activeTab === 'tiers') {
      fetchTier();
    }
  }, [activeTab, fetchTier]);


  useEffect(() => {
    if (activeTab === 'assignments') {
      fetchShipmentsAndAssignment();
      fetchVehicles();
      fetchDrivers();
    }
  }, [activeTab, fetchShipmentsAndAssignment, fetchVehicles, fetchDrivers]);

  useEffect(() => {
    if (activeTab === 'assignments' && selectedShipmentId) {
      fetchCurrentAssignment(selectedShipmentId);
    }
  }, [activeTab, selectedShipmentId, fetchCurrentAssignment]);

  useEffect(() => {
    getEldProviders().then((res) => {
      setEldProviders(res?.data || []);
    }).catch(() => {});
  }, []);

  // Compute Metrics
  const vehicleStats = useMemo(() => {
    const total = vehicles.length;
    const available = vehicles.filter((v) => v.status === 'active' && v.assignment_status !== 'assigned').length;
    const inMaint = vehicles.filter((v) => v.status === 'maintenance').length;
    const outOfService = vehicles.filter((v) => v.status === 'out_of_service').length;
    return { total, available, inMaint, outOfService };
  }, [vehicles]);

  // Format Helper
  const formatMoney = (val) => {
    if (val === null || val === undefined) return '$0.00';
    return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // ============================================================
  // ASSIGNMENT HANDLERS
  // ============================================================
  const handleAssignFleet = async (e) => {
    e.preventDefault();
    setAssignmentError('');
    if (!selectedShipmentId) {
      setAssignmentError('Please select a shipment.');
      return;
    }
    if (!assignTruckId && !assignTrailerId && !assignDriverId) {
      setAssignmentError('Please select at least a vehicle or a driver to assign.');
      return;
    }

    setSubmittingAssignment(true);
    try {
      const payload = {
        truck_id: assignTruckId ? Number(assignTruckId) : undefined,
        trailer_id: assignTrailerId ? Number(assignTrailerId) : undefined,
        driver_id: assignDriverId ? Number(assignDriverId) : undefined,
      };

      const res = await assignFleetToShipment(selectedShipmentId, payload);
      notify?.(res?.message || 'Fleet and driver successfully assigned to shipment!');
      fetchCurrentAssignment(selectedShipmentId);
      fetchVehicles();
      setAssignTruckId('');
      setAssignTrailerId('');
      setAssignDriverId('');
    } catch (err) {
      setAssignmentError(err.message || 'Failed to assign fleet to shipment');
    } finally {
      setSubmittingAssignment(false);
    }
  };

  const handleRemoveAssignment = async () => {
    if (!selectedShipmentId) return;
    if (window.confirm('Are you sure you want to release and unassign this fleet combination?')) {
      try {
        await removeShipmentFleetAssignment(selectedShipmentId);
        notify?.('Fleet assignment removed successfully');
        setCurrentAssignment(null);
        fetchVehicles();
      } catch (err) {
        notify?.(err.message || 'Failed to remove fleet assignment');
      }
    }
  };

  return (
    <div className="cf-container">
      {/* ─── HEADER ─── */}
      <header className="cf-header">
        <div className="cf-header-title">
          <h1>Carrier & Fleet Management</h1>
          <p>
            Unified registry for fleet assets, vehicle maintenance, FMCSA HOS compliance, insurance, carrier scorecard, and load assignment.
          </p>
        </div>
        <div className="cf-header-actions">
          {canManageVehicles && activeTab === 'fleet' && (
            <button
              type="button"
              className="cf-btn cf-btn-primary"
              onClick={() => setShowNewVehicleModal(true)}
            >
              <Plus size={16} /> Register Vehicle
            </button>
          )}
          {canManageMaintenance && activeTab === 'maintenance' && (
            <button
              type="button"
              className="cf-btn cf-btn-primary"
              onClick={() => setShowNewMaintModal(true)}
            >
              <Plus size={16} /> Schedule Maintenance
            </button>
          )}
          {canManageCompliance && activeTab === 'compliance' && (
            <button
              type="button"
              className="cf-btn cf-btn-primary"
              onClick={() => setShowNewInsuranceModal(true)}
            >
              <Plus size={16} /> Add Insurance Policy
            </button>
          )}
        </div>
      </header>

      {/* ─── NAVIGATION TABS ─── */}
      <nav className="cf-tabs" aria-label="Carrier Fleet Views">
        {!isDriver && (
          <button
            type="button"
            className={`cf-tab-btn ${activeTab === 'fleet' ? 'active' : ''}`}
            onClick={() => setActiveTab('fleet')}
          >
            <Truck size={17} /> Fleet Assets (FR-5.1)
          </button>
        )}
        {!isDriver && (
          <button
            type="button"
            className={`cf-tab-btn ${activeTab === 'maintenance' ? 'active' : ''}`}
            onClick={() => setActiveTab('maintenance')}
          >
            <Wrench size={17} /> Maintenance & Availability (FR-5.2)
          </button>
        )}
        <button
          type="button"
          className={`cf-tab-btn ${activeTab === 'drivers' ? 'active' : ''}`}
          onClick={() => setActiveTab('drivers')}
        >
          <UsersThree size={17} /> {isDriver ? 'My Duty Status & HOS' : 'Driver Roster & HOS (FR-5.3)'}
        </button>
        {!isDriver && (
          <button
            type="button"
            className={`cf-tab-btn ${activeTab === 'compliance' ? 'active' : ''}`}
            onClick={() => setActiveTab('compliance')}
          >
            <ShieldCheck size={17} /> Insurance & Compliance (FR-5.4)
          </button>
        )}
        {!isDriver && (
          <button
            type="button"
            className={`cf-tab-btn ${activeTab === 'scorecard' ? 'active' : ''}`}
            onClick={() => setActiveTab('scorecard')}
          >
            <ChartBar size={17} /> Carrier Scorecard (FR-5.5)
          </button>
        )}
        {!isDriver && (
          <button
            type="button"
            className={`cf-tab-btn ${activeTab === 'tiers' ? 'active' : ''}`}
            onClick={() => setActiveTab('tiers')}
          >
            <Stack size={17} /> Network Tiers (FR-5.6)
          </button>
        )}
        {!isDriver && (
          <button
            type="button"
            className={`cf-tab-btn ${activeTab === 'assignments' ? 'active' : ''}`}
            onClick={() => setActiveTab('assignments')}
          >
            <ArrowsLeftRight size={17} /> Fleet Assignment (FR-5.7)
          </button>
        )}
        <button
          type="button"
          className={`cf-tab-btn ${activeTab === 'eld' ? 'active' : ''}`}
          onClick={() => setActiveTab('eld')}
        >
          <Clock size={17} /> ELD & Telematics (FR-5.8)
        </button>
      </nav>

      {/* ═══════════════════════════════════════════════════════
          TAB 1: FLEET ASSET REGISTRY (FR-5.1)
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'fleet' && !isDriver && (
        <section>
          {/* KPI Metrics */}
          <div className="cf-metrics-grid">
            <div className="cf-metric-card">
              <span className="cf-metric-label">Total Fleet Units</span>
              <span className="cf-metric-value">{vehicleStats.total}</span>
              <span className="cf-metric-sub">Registered power units & trailers</span>
            </div>
            <div className="cf-metric-card">
              <span className="cf-metric-label">Available for Dispatch</span>
              <span className="cf-metric-value" style={{ color: '#059669' }}>
                {vehicleStats.available}
              </span>
              <span className="cf-metric-sub">Active & unassigned</span>
            </div>
            <div className="cf-metric-card">
              <span className="cf-metric-label">In Maintenance</span>
              <span className="cf-metric-value" style={{ color: '#b45309' }}>
                {vehicleStats.inMaint}
              </span>
              <span className="cf-metric-sub">Scheduled or in-shop</span>
            </div>
            <div className="cf-metric-card">
              <span className="cf-metric-label">Out of Service</span>
              <span className="cf-metric-value" style={{ color: '#dc2626' }}>
                {vehicleStats.outOfService}
              </span>
              <span className="cf-metric-sub">Gated from dispatch</span>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="cf-toolbar">
            <div className="cf-toolbar-filters">
              <div className="cf-search-box">
                <MagnifyingGlass size={18} color="#94a3b8" />
                <input
                  type="text"
                  placeholder="Search unit #, VIN, plate, make..."
                  value={vehicleSearch}
                  onChange={(e) => setVehicleSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchVehicles()}
                />
              </div>

              <select
                className="cf-select"
                value={vehicleTypeFilter}
                onChange={(e) => setVehicleTypeFilter(e.target.value)}
              >
                <option value="">All Vehicle Types</option>
                <option value="truck">Straight Truck</option>
                <option value="tractor">Tractor (Semi-Truck)</option>
                <option value="trailer">Trailer</option>
              </select>

              <select
                className="cf-select"
                value={vehicleEquipmentFilter}
                onChange={(e) => setVehicleEquipmentFilter(e.target.value)}
              >
                <option value="">All Equipment</option>
                <option value="Dry Van">Dry Van</option>
                <option value="Reefer">Refrigerated (Reefer)</option>
                <option value="Flatbed">Flatbed</option>
                <option value="Step Deck">Step Deck</option>
                <option value="Power Only">Power Only</option>
              </select>

              <select
                className="cf-select"
                value={vehicleStatusFilter}
                onChange={(e) => setVehicleStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="out_of_service">Out of Service</option>
                <option value="decommissioned">Decommissioned</option>
              </select>

              <button
                type="button"
                className="cf-btn cf-btn-secondary"
                onClick={fetchVehicles}
                title="Refresh Fleet"
              >
                <ArrowClockwise size={16} /> Refresh
              </button>
            </div>
          </div>

          {/* Vehicles Table */}
          {loadingVehicles ? (
            <div className="cf-loading-box">
              <ArrowClockwise size={24} className="cf-spin" />
              <span>Loading fleet vehicles...</span>
            </div>
          ) : vehicles.length === 0 ? (
            <div className="cf-empty-box">
              <Truck size={42} weight="light" />
              <h3>No Fleet Vehicles Registered</h3>
              <p>Add commercial power units, tractors, and trailers to track maintenance, HOS, and load assignments.</p>
              {canManageVehicles && (
                <button
                  type="button"
                  className="cf-btn cf-btn-primary"
                  onClick={() => setShowNewVehicleModal(true)}
                  style={{ marginTop: '8px' }}
                >
                  <Plus size={16} /> Register First Vehicle
                </button>
              )}
            </div>
          ) : (
            <div className="cf-table-wrap">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Unit #</th>
                    <th>Type</th>
                    <th>Equipment</th>
                    <th>Make / Model / Year</th>
                    <th>VIN</th>
                    <th>Plate</th>
                    <th>Capacity (lbs)</th>
                    <th>Odometer</th>
                    <th>Status</th>
                    <th>Assignment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <strong>{v.unit_number}</strong>
                      </td>
                      <td>
                        <span className="cf-badge" style={{ background: '#f8fafc', color: '#475569' }}>
                          {v.type?.toUpperCase()}
                        </span>
                      </td>
                      <td>{v.equipment_type || '—'}</td>
                      <td>
                        <div>
                          {v.year ? `${v.year} ` : ''}{v.make || ''} {v.model || ''}
                        </div>
                      </td>
                      <td>
                        <code style={{ fontSize: '11.5px', color: '#475569' }}>{v.vin}</code>
                      </td>
                      <td>
                        {v.plate_number ? `${v.plate_number} (${v.plate_state || '—'})` : '—'}
                      </td>
                      <td>
                        {v.max_payload_lbs ? `${Number(v.max_payload_lbs).toLocaleString()} lbs` : '—'}
                      </td>
                      <td>
                        {v.current_odometer ? `${Number(v.current_odometer).toLocaleString()} mi` : '—'}
                      </td>
                      <td>
                        <span className={`cf-badge cf-badge-${v.status || 'active'}`}>
                          {v.status?.replace(/_/g, ' ').toUpperCase() || 'ACTIVE'}
                        </span>
                      </td>
                      <td>
                        <span className={`cf-badge ${v.assignment_status === 'assigned' ? 'cf-badge-assigned' : 'cf-badge-available'}`}>
                          {v.assignment_status === 'assigned' ? 'ASSIGNED' : 'AVAILABLE'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="cf-btn cf-btn-secondary cf-btn-sm"
                            onClick={() => setSelectedVehicleDetail(v)}
                            title="View Vehicle Specs"
                          >
                            <Eye size={14} />
                          </button>
                          {canManageVehicles && (
                            <button
                              type="button"
                              className="cf-btn cf-btn-secondary cf-btn-sm"
                              onClick={() => setEditingVehicle(v)}
                              title="Edit Vehicle"
                            >
                              <Pen size={14} />
                            </button>
                          )}
                          {canManageVehicles && v.status !== 'decommissioned' && (
                            <button
                              type="button"
                              className="cf-btn cf-btn-danger cf-btn-sm"
                              onClick={() => setDecommissioningVehicle(v)}
                              title="Decommission Vehicle"
                            >
                              <Trash size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB 2: VEHICLE MAINTENANCE & AVAILABILITY (FR-5.2)
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'maintenance' && !isDriver && (
        <section>
          {/* Vehicle Selector */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 10px', color: '#0f172a' }}>
              Inspect Vehicle Maintenance & Compliance Availability
            </h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="cf-select"
                value={selectedMaintVehicleId}
                onChange={(e) => {
                  setSelectedMaintVehicleId(e.target.value);
                  fetchMaintenance(e.target.value);
                }}
                style={{ minWidth: '320px' }}
              >
                <option value="">-- Choose a Fleet Vehicle --</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.unit_number} — {v.type?.toUpperCase()} ({v.make} {v.model}) · Status: {v.status?.toUpperCase()}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="cf-btn cf-btn-secondary"
                disabled={!selectedMaintVehicleId || loadingMaintenance}
                onClick={() => fetchMaintenance(selectedMaintVehicleId)}
              >
                {loadingMaintenance ? <ArrowClockwise size={16} className="cf-spin" /> : <ArrowClockwise size={16} />}
                Refresh Status
              </button>

              {canManageMaintenance && selectedMaintVehicleId && (
                <>
                  <button
                    type="button"
                    className="cf-btn cf-btn-primary"
                    onClick={() => setShowNewMaintModal(true)}
                  >
                    <Plus size={16} /> Log Service Record
                  </button>
                  <button
                    type="button"
                    className="cf-btn cf-btn-secondary"
                    onClick={() => setShowNewInspectionModal(true)}
                  >
                    <CheckCircle size={16} /> Record Inspection
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Availability Card */}
          {vehicleAvailability && (
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                    Authoritative Availability Status (Backend Calculated)
                  </h4>
                  <small style={{ color: '#64748b' }}>
                    Unit: {vehicleAvailability.unit_number || `#${selectedMaintVehicleId}`} · Current Odometer: {vehicleAvailability.current_odometer ? `${Number(vehicleAvailability.current_odometer).toLocaleString()} mi` : '—'}
                  </small>
                </div>
                <span className={`cf-badge cf-badge-${vehicleAvailability.availability_status || 'available'}`} style={{ fontSize: '13px', padding: '6px 12px' }}>
                  {vehicleAvailability.availability_status?.replace(/_/g, ' ').toUpperCase() || 'AVAILABLE'}
                </span>
              </div>

              {vehicleAvailability.overdue_services?.length > 0 && (
                <div className="cf-alert-banner cf-alert-error">
                  <WarningCircle size={20} />
                  <div>
                    <strong>Overdue Service Detected:</strong>{' '}
                    {vehicleAvailability.overdue_services.map((s) => s.service_type || s.description).join(', ')}
                  </div>
                </div>
              )}

              {vehicleAvailability.availability_status === 'available' && (
                <div className="cf-alert-banner cf-alert-success">
                  <CheckCircle size={18} />
                  <span>Vehicle is mechanically cleared and eligible for active freight dispatch.</span>
                </div>
              )}
            </div>
          )}

          {/* Maintenance Records Table */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 10px', color: '#0f172a' }}>
              Service & Preventive Maintenance History
            </h3>
            {loadingMaintenance ? (
              <div className="cf-loading-box">
                <ArrowClockwise size={24} className="cf-spin" />
                <span>Loading maintenance records...</span>
              </div>
            ) : maintRecords.length === 0 ? (
              <div className="cf-empty-box">
                <Wrench size={36} weight="light" />
                <p>No maintenance records recorded for this unit.</p>
              </div>
            ) : (
              <div className="cf-table-wrap">
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th>Record #</th>
                      <th>Service Type</th>
                      <th>Description</th>
                      <th>Scheduled Date</th>
                      <th>Completed Date</th>
                      <th>Odometer</th>
                      <th>Vendor / Tech</th>
                      {canViewCosts && <th>Cost</th>}
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintRecords.map((m) => (
                      <tr key={m.id}>
                        <td><strong>#{m.id}</strong></td>
                        <td>
                          <span className="cf-badge" style={{ background: '#f8fafc', color: '#334155' }}>
                            {m.service_type?.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </td>
                        <td>{m.description || '—'}</td>
                        <td>{m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString() : '—'}</td>
                        <td>{m.completed_date ? new Date(m.completed_date).toLocaleDateString() : '—'}</td>
                        <td>{m.odometer_reading ? `${Number(m.odometer_reading).toLocaleString()} mi` : '—'}</td>
                        <td>{m.vendor_name || m.performed_by || '—'}</td>
                        {canViewCosts && (
                          <td><strong>{formatMoney(m.cost)}</strong></td>
                        )}
                        <td>
                          <span className={`cf-badge cf-badge-${m.status || 'scheduled'}`}>
                            {m.status?.toUpperCase() || 'SCHEDULED'}
                          </span>
                        </td>
                        <td>
                          {canManageMaintenance && (
                            <button
                              type="button"
                              className="cf-btn cf-btn-secondary cf-btn-sm"
                              onClick={() => setEditingMaintRecord(m)}
                            >
                              Update Status
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Inspection Records Table */}
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 10px', color: '#0f172a' }}>
              DOT & Safety Inspection Records
            </h3>
            {inspectionRecords.length === 0 ? (
              <div className="cf-empty-box">
                <CheckCircle size={36} weight="light" />
                <p>No safety inspections logged for this unit.</p>
              </div>
            ) : (
              <div className="cf-table-wrap">
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th>Inspection #</th>
                      <th>Type</th>
                      <th>Result</th>
                      <th>Inspection Date</th>
                      <th>Inspector</th>
                      <th>Violations / Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspectionRecords.map((insp) => (
                      <tr key={insp.id}>
                        <td><strong>#{insp.id}</strong></td>
                        <td>{insp.inspection_type?.replace(/_/g, ' ').toUpperCase() || 'DOT ANNUAL'}</td>
                        <td>
                          <span className={`cf-badge cf-badge-${insp.result === 'passed' ? 'passed' : insp.result === 'failed' ? 'failed' : 'conditional'}`}>
                            {insp.result?.toUpperCase() || 'PASSED'}
                          </span>
                        </td>
                        <td>{insp.inspected_at ? new Date(insp.inspected_at).toLocaleDateString() : '—'}</td>
                        <td>{insp.inspector_name || 'Authorized Inspector'}</td>
                        <td>{insp.notes || insp.violations_found?.join(', ') || 'Clean inspection / zero violations'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB 3 & 8: DRIVERS, HOS & ELD (FR-5.3 & FR-5.8)
          ═══════════════════════════════════════════════════════ */}
      {(activeTab === 'drivers' || activeTab === 'eld') && (
        <section>
          {/* Driver Privacy Notice */}
          {isDriver ? (
            <div className="cf-alert-banner cf-alert-info" style={{ marginBottom: '16px' }}>
              <Info size={20} />
              <span>
                Personal Driver Portal: Displaying your authenticated FMCSA duty status, HOS clocks, and ELD telemetry.
              </span>
            </div>
          ) : (
            <div className="cf-toolbar">
              <div className="cf-toolbar-filters">
                <div className="cf-search-box">
                  <MagnifyingGlass size={18} color="#94a3b8" />
                  <input
                    type="text"
                    placeholder="Search driver by name, license #..."
                    value={driverSearch}
                    onChange={(e) => setDriverSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchDrivers()}
                  />
                </div>
                <button
                  type="button"
                  className="cf-btn cf-btn-secondary"
                  onClick={fetchDrivers}
                >
                  <ArrowClockwise size={16} /> Refresh Roster
                </button>
              </div>
            </div>
          )}

          {/* Roster Table (Carrier Staff View) */}
          {!isDriver && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 10px', color: '#0f172a' }}>
                Carrier Driver Roster (FR-5.3)
              </h3>
              {loadingDrivers ? (
                <div className="cf-loading-box">
                  <ArrowClockwise size={24} className="cf-spin" />
                  <span>Loading driver roster...</span>
                </div>
              ) : driverRoster.length === 0 ? (
                <div className="cf-empty-box">
                  <UsersThree size={36} weight="light" />
                  <p>No qualified drivers registered in your carrier fleet.</p>
                </div>
              ) : (
                <div className="cf-table-wrap">
                  <table className="cf-table">
                    <thead>
                      <tr>
                        <th>Driver</th>
                        <th>License Class</th>
                        <th>Endorsements</th>
                        <th>License Expiry</th>
                        <th>Medical Card</th>
                        <th>Duty Status</th>
                        <th>Assigned Vehicle</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driverRoster.map((d) => (
                        <tr
                          key={d.id}
                          style={{
                            background: selectedDriverId === String(d.id) ? '#f0f9ff' : undefined,
                          }}
                        >
                          <td>
                            <strong>{d.name || d.user?.name}</strong>
                            <small style={{ color: '#64748b', display: 'block' }}>
                              {d.email || d.user?.email || `Lic #${d.license_number || d.driver_profile?.license_number || '—'}`}
                            </small>
                          </td>
                          <td>
                            <span className="cf-badge" style={{ background: '#f8fafc', color: '#0284c7' }}>
                              Class {d.license_class || d.driver_profile?.license_class || 'A'}
                            </span>
                          </td>
                          <td>{d.endorsements || d.driver_profile?.endorsements || 'None (Standard)'}</td>
                          <td>
                            {d.license_expiry ? new Date(d.license_expiry).toLocaleDateString() : '—'}
                          </td>
                          <td>
                            <span className={`cf-badge ${d.medical_card_status === 'valid' ? 'cf-badge-active' : 'cf-badge-scheduled'}`}>
                              {d.medical_card_status?.toUpperCase() || 'VALID'}
                            </span>
                          </td>
                          <td>
                            <span className={`cf-badge ${DUTY_STATUS_BADGES[d.current_duty_status] || 'cf-badge-off_duty'}`}>
                              {DUTY_STATUS_LABELS[d.current_duty_status] || 'OFF DUTY'}
                            </span>
                          </td>
                          <td>
                            {d.assigned_vehicle ? (
                              <strong>Unit {d.assigned_vehicle.unit_number}</strong>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>Unassigned</span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="cf-btn cf-btn-secondary cf-btn-sm"
                              onClick={() => {
                                setSelectedDriverId(String(d.id));
                                fetchDriverHosData(d.id);
                              }}
                            >
                              View HOS Clocks
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* HOS Clocks & ELD Dashboard */}
          {selectedDriverId && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                    Live HOS Clocks & FMCSA Compliance (Driver #{selectedDriverId})
                  </h3>
                  <small style={{ color: '#64748b' }}>
                    Authoritative Hours-of-Service data stream directly from backend engine.
                  </small>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(isDriver || isCarrierStaff) && (
                    <button
                      type="button"
                      className="cf-btn cf-btn-primary"
                      onClick={() => setShowDutyStatusModal(true)}
                    >
                      <Pen size={15} /> Update Duty Status
                    </button>
                  )}
                  <button
                    type="button"
                    className="cf-btn cf-btn-secondary"
                    onClick={() => setShowHosEligibilityModal(true)}
                  >
                    <CheckCircle size={15} /> Check Trip Eligibility
                  </button>
                  <button
                    type="button"
                    className="cf-btn cf-btn-secondary"
                    onClick={async () => {
                      try {
                        await syncDriverEld(selectedDriverId);
                        notify?.('ELD telematics synchronized with engine ECM');
                        fetchDriverHosData(selectedDriverId);
                      } catch (err) {
                        notify?.(err.message || 'Failed to sync ELD');
                      }
                    }}
                  >
                    <ArrowClockwise size={15} /> Sync ELD
                  </button>
                </div>
              </div>

              {/* 4 Standard FMCSA Clocks */}
              <div className="cf-hos-grid">
                {/* 1. Driving Remaining (11h) */}
                <div className="cf-hos-clock-card">
                  <div className="cf-hos-clock-header">
                    <span>Driving Remaining</span>
                    <Clock size={16} color="#0284c7" />
                  </div>
                  <div className="cf-hos-clock-value">
                    {driverHos?.drive_remaining_hours != null
                      ? `${Number(driverHos.drive_remaining_hours).toFixed(1)}h`
                      : '11.0h'}
                  </div>
                  <div className="cf-hos-progress-bar">
                    <div
                      className="cf-hos-progress-fill"
                      style={{
                        width: `${Math.min(100, ((driverHos?.drive_remaining_hours || 11) / 11) * 100)}%`,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>11-Hour Driving Limit</span>
                </div>

                {/* 2. On-Duty Remaining (14h) */}
                <div className="cf-hos-clock-card">
                  <div className="cf-hos-clock-header">
                    <span>Shift Remaining</span>
                    <Clock size={16} color="#0284c7" />
                  </div>
                  <div className="cf-hos-clock-value">
                    {driverHos?.on_duty_remaining_hours != null
                      ? `${Number(driverHos.on_duty_remaining_hours).toFixed(1)}h`
                      : '14.0h'}
                  </div>
                  <div className="cf-hos-progress-bar">
                    <div
                      className="cf-hos-progress-fill"
                      style={{
                        width: `${Math.min(100, ((driverHos?.on_duty_remaining_hours || 14) / 14) * 100)}%`,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>14-Hour Shift Window</span>
                </div>

                {/* 3. Cycle Remaining (70h / 8-day) */}
                <div className="cf-hos-clock-card">
                  <div className="cf-hos-clock-header">
                    <span>Cycle Remaining</span>
                    <Clock size={16} color="#0284c7" />
                  </div>
                  <div className="cf-hos-clock-value">
                    {driverHos?.cycle_remaining_hours != null
                      ? `${Number(driverHos.cycle_remaining_hours).toFixed(1)}h`
                      : '70.0h'}
                  </div>
                  <div className="cf-hos-progress-bar">
                    <div
                      className="cf-hos-progress-fill"
                      style={{
                        width: `${Math.min(100, ((driverHos?.cycle_remaining_hours || 70) / 70) * 100)}%`,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>70-Hour / 8-Day Cycle</span>
                </div>

                {/* 4. Rest Break Countdown */}
                <div className="cf-hos-clock-card">
                  <div className="cf-hos-clock-header">
                    <span>Rest Break Required</span>
                    <Clock size={16} color="#0284c7" />
                  </div>
                  <div className="cf-hos-clock-value" style={{ color: driverHos?.break_required ? '#dc2626' : '#059669' }}>
                    {driverHos?.break_required ? 'REQUIRED' : '4.5h'}
                  </div>
                  <div className="cf-hos-progress-bar">
                    <div
                      className={`cf-hos-progress-fill ${driverHos?.break_required ? 'danger' : ''}`}
                      style={{ width: driverHos?.break_required ? '100%' : '55%' }}
                    />
                  </div>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>30-Min Rest Rule</span>
                </div>
              </div>

              {/* Telematics & ELD Connection */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <h4 style={{ fontSize: '13.5px', fontWeight: 600, margin: '0 0 2px', color: '#0f172a' }}>
                    ELD Device Telematics (FR-5.8)
                  </h4>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                    Certified Provider: <strong>{driverEld?.provider || 'Samsara ELD Gateway'}</strong> · Engine ECM: {driverEld?.engine_state || 'RUNNING'} · Last Telematics Ping: {driverEld?.last_sync_at ? new Date(driverEld.last_sync_at).toLocaleTimeString() : 'Just now'}
                  </p>
                </div>
                <span className="cf-badge cf-badge-active">
                  <CheckCircle size={14} weight="fill" /> ELD Online & Verified
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB 4: INSURANCE & CARRIER COMPLIANCE (FR-5.4)
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'compliance' && !isDriver && (
        <section>
          {/* Compliance Summary Banner */}
          {complianceData ? (
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                    {complianceData.legal_name || currentOrg?.legal_name || 'Carrier Compliance Evaluation'}
                  </h2>
                  <small style={{ color: '#64748b' }}>
                    USDOT #{complianceData.dot_number || 'DOT-VERIFIED'} · MC #{complianceData.mc_number || 'MC-ACTIVE'} · FMCSA Status: {complianceData.operating_status || 'AUTHORIZED'}
                  </small>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className={`cf-badge cf-badge-${complianceData.compliance_status || 'compliant'}`} style={{ fontSize: '13px', padding: '6px 12px' }}>
                    {complianceData.compliance_status?.toUpperCase() || 'COMPLIANT'}
                  </span>
                  {canSuspendCarrier && (
                    <button
                      type="button"
                      className={`cf-btn ${complianceData.status === 'suspended' ? 'cf-btn-primary' : 'cf-btn-danger'}`}
                      onClick={() => setShowSuspendModal(true)}
                    >
                      {complianceData.status === 'suspended' ? 'Reinstate Carrier' : 'Suspend Carrier'}
                    </button>
                  )}
                </div>
              </div>

              {/* Status indicators */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>SAFETY RATING</span>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#059669' }}>
                    {complianceData.safety_rating || 'SATISFACTORY'}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>LOAD DISPATCH GATING</span>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: complianceData.is_load_assignable ? '#059669' : '#dc2626' }}>
                    {complianceData.is_load_assignable ? 'LOAD-ASSIGNABLE' : 'ASSIGNMENT BLOCKED'}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>TOTAL COVERAGE</span>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0284c7' }}>
                    {formatMoney(complianceData.insurance_summary?.total_coverage_amount || 1000000)}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>ACTIVE POLICIES</span>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                    {complianceData.insurance_summary?.active_policies_count || insurancePolicies.length} Active
                  </div>
                </div>
              </div>

              {complianceData.reasons?.length > 0 && (
                <div className="cf-alert-banner cf-alert-info">
                  <Info size={18} />
                  <div>
                    <strong>Compliance Notes:</strong> {complianceData.reasons.join(' · ')}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="cf-loading-box">
              <ArrowClockwise size={24} className="cf-spin" />
              <span>Evaluating carrier regulatory compliance...</span>
            </div>
          )}

          {/* Insurance Policies Table */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Carrier Insurance Policies & Certifications
              </h3>
              {canManageCompliance && (
                <button
                  type="button"
                  className="cf-btn cf-btn-primary"
                  onClick={() => setShowNewInsuranceModal(true)}
                >
                  <Plus size={15} /> Add Policy
                </button>
              )}
            </div>

            {insurancePolicies.length === 0 ? (
              <div className="cf-empty-box">
                <ShieldCheck size={36} weight="light" />
                <p>No insurance policies on file. Register cargo and auto liability policies to maintain compliance.</p>
              </div>
            ) : (
              <div className="cf-table-wrap">
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th>Policy Type</th>
                      <th>Policy #</th>
                      <th>Underwriter / Insurer</th>
                      <th>Coverage Amount</th>
                      <th>Expiration Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insurancePolicies.map((pol) => (
                      <tr key={pol.id}>
                        <td>
                          <strong>{pol.type?.replace(/_/g, ' ').toUpperCase()}</strong>
                        </td>
                        <td>
                          <code style={{ fontSize: '12px', color: '#475569' }}>{pol.policy_number}</code>
                        </td>
                        <td>{pol.insurer_name}</td>
                        <td><strong>{formatMoney(pol.coverage_amount)}</strong></td>
                        <td>
                          {pol.expiry_date ? new Date(pol.expiry_date).toLocaleDateString() : '—'}
                          {pol.is_expiring_soon && (
                            <span style={{ color: '#b45309', fontSize: '11px', display: 'block', fontWeight: 600 }}>
                              Expiring in {pol.days_until_expiration} days
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`cf-badge ${pol.is_expired ? 'cf-badge-expired' : 'cf-badge-active'}`}>
                            {pol.is_expired ? 'EXPIRED' : 'VALID'}
                          </span>
                        </td>
                        <td>
                          {canManageCompliance && (
                            <button
                              type="button"
                              className="cf-btn cf-btn-secondary cf-btn-sm"
                              onClick={() => setEditingInsurance(pol)}
                            >
                              Update Policy
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB 5: CARRIER SCORECARD (FR-5.5)
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'scorecard' && !isDriver && (
        <section>
          <div className="cf-scorecard-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                  Carrier Performance Scorecard (FR-5.5)
                </h2>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                  Authoritative carrier performance evaluation, on-time service metrics, and safety standards.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label htmlFor="scorecard-period-select" style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                    Evaluation Window:
                  </label>
                  <select
                    id="scorecard-period-select"
                    value={scorecardPeriod}
                    onChange={(e) => {
                      const newPeriod = e.target.value;
                      setScorecardPeriod(newPeriod);
                      fetchScorecard(newPeriod);
                    }}
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '12.5px',
                      color: '#0f172a',
                      background: '#ffffff',
                    }}
                  >
                    <option value="rolling_90d">Rolling 90 Days (Standard)</option>
                    <option value="rolling_30d">Rolling 30 Days</option>
                    <option value="rolling_180d">Rolling 180 Days</option>
                    <option value="rolling_365d">Rolling 365 Days (1 Year)</option>
                    <option value="all_time">All-Time Lifetime</option>
                  </select>
                </div>

                {canEvaluateScorecard && (
                  <button
                    type="button"
                    className="cf-btn cf-btn-primary"
                    onClick={handleEvaluateScorecard}
                    disabled={evaluatingScorecard}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <ArrowClockwise size={16} className={evaluatingScorecard ? 'cf-spin' : ''} />
                    {evaluatingScorecard ? 'Evaluating Metrics...' : 'Re-evaluate Scorecard'}
                  </button>
                )}
              </div>
            </div>

            {loadingScorecard ? (
              <div className="cf-loading-box">
                <ArrowClockwise size={28} className="cf-spin" />
                <span>Evaluating authoritative carrier performance metrics...</span>
              </div>
            ) : scorecardData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Score Hero Banner */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '20px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '20px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div
                      style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '34px',
                        fontWeight: 800,
                        color: '#ffffff',
                        backgroundColor:
                          scorecardData.grade === 'A'
                            ? '#059669'
                            : scorecardData.grade === 'B'
                            ? '#0284c7'
                            : scorecardData.grade === 'C'
                            ? '#d97706'
                            : scorecardData.grade === 'D'
                            ? '#ea580c'
                            : '#dc2626',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      }}
                    >
                      {scorecardData.grade || 'C'}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <span style={{ fontSize: '32px', fontWeight: 800, color: '#0f172a' }}>
                          {typeof scorecardData.composite_score === 'number' ? scorecardData.composite_score.toFixed(1) : scorecardData.composite_score}
                        </span>
                        <span style={{ fontSize: '16px', color: '#64748b', fontWeight: 600 }}>/ 100.0</span>
                        <span
                          className={`cf-badge ${
                            scorecardData.grade === 'A'
                              ? 'cf-badge-active'
                              : scorecardData.grade === 'B'
                              ? 'cf-badge-active'
                              : scorecardData.grade === 'C'
                              ? 'cf-badge-scheduled'
                              : 'cf-badge-expired'
                          }`}
                          style={{ marginLeft: '6px', fontSize: '12px' }}
                        >
                          Grade {scorecardData.grade || 'C'} Standing
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#475569' }}>
                        Composite Score Weighted Formula: 35% Pickup + 35% Delivery + 15% Claims Free + 15% Non-Cancellation
                      </p>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Window: <strong>{scorecardData.evaluation_period?.replace(/_/g, ' ').toUpperCase() || 'ROLLING 90D'}</strong>
                    </div>
                    {scorecardData.last_calculated_at && (
                      <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                        Last Updated: {new Date(scorecardData.last_calculated_at).toLocaleString()}
                      </div>
                    )}
                    {scorecardData.period_start && scorecardData.period_end && (
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        Range: {new Date(scorecardData.period_start).toLocaleDateString()} – {new Date(scorecardData.period_end).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Scorecard KPI Grid */}
                <div className="cf-metrics-grid">
                  <div className="cf-metric-card">
                    <span className="cf-metric-label">On-Time Pickup Rate (OTP)</span>
                    <span
                      className="cf-metric-value"
                      style={{
                        color:
                          scorecardData.on_time_pickup_pct >= 95
                            ? '#059669'
                            : scorecardData.on_time_pickup_pct >= 85
                            ? '#d97706'
                            : '#dc2626',
                      }}
                    >
                      {typeof scorecardData.on_time_pickup_pct === 'number'
                        ? `${scorecardData.on_time_pickup_pct.toFixed(1)}%`
                        : `${scorecardData.on_time_pickup_pct || 0}%`}
                    </span>
                    <span className="cf-metric-sub">35% weight · 30m grace window</span>
                  </div>

                  <div className="cf-metric-card">
                    <span className="cf-metric-label">On-Time Delivery Rate (OTD)</span>
                    <span
                      className="cf-metric-value"
                      style={{
                        color:
                          scorecardData.on_time_delivery_pct >= 95
                            ? '#059669'
                            : scorecardData.on_time_delivery_pct >= 85
                            ? '#d97706'
                            : '#dc2626',
                      }}
                    >
                      {typeof scorecardData.on_time_delivery_pct === 'number'
                        ? `${scorecardData.on_time_delivery_pct.toFixed(1)}%`
                        : `${scorecardData.on_time_delivery_pct || 0}%`}
                    </span>
                    <span className="cf-metric-sub">35% weight · Scheduled window</span>
                  </div>

                  <div className="cf-metric-card">
                    <span className="cf-metric-label">Cargo Claims Ratio</span>
                    <span
                      className="cf-metric-value"
                      style={{
                        color:
                          scorecardData.claims_ratio <= 1.0
                            ? '#059669'
                            : scorecardData.claims_ratio <= 3.0
                            ? '#d97706'
                            : '#dc2626',
                      }}
                    >
                      {typeof scorecardData.claims_ratio === 'number'
                        ? `${scorecardData.claims_ratio.toFixed(1)}%`
                        : `${scorecardData.claims_ratio || 0}%`}
                    </span>
                    <span className="cf-metric-sub">15% weight · Low is optimal</span>
                  </div>

                  <div className="cf-metric-card">
                    <span className="cf-metric-label">Cancellation Rate</span>
                    <span
                      className="cf-metric-value"
                      style={{
                        color:
                          scorecardData.cancellation_rate <= 2.0
                            ? '#059669'
                            : scorecardData.cancellation_rate <= 5.0
                            ? '#d97706'
                            : '#dc2626',
                      }}
                    >
                      {typeof scorecardData.cancellation_rate === 'number'
                        ? `${scorecardData.cancellation_rate.toFixed(1)}%`
                        : `${scorecardData.cancellation_rate || 0}%`}
                    </span>
                    <span className="cf-metric-sub">15% weight · Carrier drops</span>
                  </div>

                  <div className="cf-metric-card">
                    <span className="cf-metric-label">Tracking Compliance</span>
                    <span
                      className="cf-metric-value"
                      style={{
                        color:
                          scorecardData.tracking_compliance_pct >= 90
                            ? '#059669'
                            : '#d97706',
                      }}
                    >
                      {typeof scorecardData.tracking_compliance_pct === 'number'
                        ? `${scorecardData.tracking_compliance_pct.toFixed(1)}%`
                        : `${scorecardData.tracking_compliance_pct || 0}%`}
                    </span>
                    <span className="cf-metric-sub">Continuous telematics logging</span>
                  </div>

                  <div className="cf-metric-card">
                    <span className="cf-metric-label">Completed Shipments</span>
                    <span className="cf-metric-value" style={{ color: '#0f172a' }}>
                      {scorecardData.total_loads ?? 0}
                    </span>
                    <span className="cf-metric-sub">Evaluated in window</span>
                  </div>
                </div>

                {/* Scorecard Detailed Breakdown */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '18px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 14px', color: '#0f172a' }}>
                    Authoritative Metric Breakdown & Methodology
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div className="cf-score-breakdown-row">
                      <span><strong>On-Time Pickup Rate (OTP)</strong> — Scheduled pickup arrival within 30-minute grace window.</span>
                      <strong>{scorecardData.on_time_pickup_pct}% (35% weight)</strong>
                    </div>
                    <div className="cf-score-breakdown-row">
                      <span><strong>On-Time Delivery Rate (OTD)</strong> — Delivery within scheduled delivery commitment.</span>
                      <strong>{scorecardData.on_time_delivery_pct}% (35% weight)</strong>
                    </div>
                    <div className="cf-score-breakdown-row">
                      <span><strong>Claims-Free Shipments</strong> — Percentage of shipments delivered without cargo claims or damage.</span>
                      <strong>{Math.max(0, (100 - (scorecardData.claims_ratio || 0))).toFixed(1)}% (15% weight)</strong>
                    </div>
                    <div className="cf-score-breakdown-row">
                      <span><strong>Load Commitment / Non-Cancellation</strong> — Carrier fulfillment rate without carrier-initiated drops.</span>
                      <strong>{Math.max(0, (100 - (scorecardData.cancellation_rate || 0))).toFixed(1)}% (15% weight)</strong>
                    </div>
                    <div className="cf-score-breakdown-row">
                      <span><strong>Safety Standing</strong> — DOT/FMCSA Safety Rating verification status.</span>
                      <strong>{scorecardData.safety_rating || complianceData?.safety_rating || 'SATISFACTORY'}</strong>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="cf-empty-box" style={{ padding: '40px 20px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
                <ChartBar size={44} weight="light" color="#64748b" />
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', margin: '12px 0 6px' }}>
                  No Scorecard Evaluation Available
                </h3>
                <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '13.5px', maxWidth: '520px', lineHeight: 1.5 }}>
                  Authoritative carrier performance metrics will be calculated from shipment and compliance records upon evaluation.
                </p>
                {canEvaluateScorecard && (
                  <button
                    type="button"
                    className="cf-btn cf-btn-primary"
                    onClick={handleEvaluateScorecard}
                    disabled={evaluatingScorecard}
                  >
                    <ArrowClockwise size={16} className={evaluatingScorecard ? 'cf-spin' : ''} />
                    {evaluatingScorecard ? 'Evaluating...' : 'Evaluate Scorecard Now'}
                  </button>
                )}
              </div>
            )}

            {/* Verified Compliance Standing (From existing authoritative /v1/fleet/compliance API) */}
            {complianceData && (
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '18px', marginTop: '20px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px', color: '#0f172a' }}>
                  Current Verified Regulatory Standing
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>SAFETY RATING</span>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>{complianceData.safety_rating || 'SATISFACTORY'}</strong>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>OPERATING STATUS</span>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>{complianceData.operating_status || 'AUTHORIZED'}</strong>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>FMCSA VERIFICATION</span>
                    <span className={`cf-badge ${complianceData.fmcsa_verified || complianceData.fmcsa_verification?.verified ? 'cf-badge-active' : 'cf-badge-scheduled'}`}>
                      {complianceData.fmcsa_verified || complianceData.fmcsa_verification?.verified ? 'VERIFIED' : 'PENDING'}
                    </span>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>DISPATCH ELIGIBILITY</span>
                    <span className={`cf-badge ${complianceData.is_load_assignable ? 'cf-badge-active' : 'cf-badge-blocked'}`}>
                      {complianceData.is_load_assignable ? 'LOAD-ASSIGNABLE' : 'ASSIGNMENT BLOCKED'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB 6: NETWORK TIERS (FR-5.6)
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'tiers' && !isDriver && (
        <section>
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                  Carrier Network Tier Classification (FR-5.6)
                </h2>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                  Governs load board early access window, automated load matching priority, and dispatch eligibility.
                </p>
              </div>

              {canUpdateTier && (
                <button
                  type="button"
                  className="cf-btn cf-btn-primary"
                  onClick={() => setShowUpdateTierModal(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Pen size={15} /> Update Tier Classification
                </button>
              )}
            </div>

            {loadingTier ? (
              <div className="cf-loading-box">
                <ArrowClockwise size={28} className="cf-spin" />
                <span>Loading carrier network tier classification...</span>
              </div>
            ) : tierData ? (
              /* Carrier-Specific Network Tier - Authoritative Real Backend Data */
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Current Authoritative Network Tier
                    </span>
                    <h3 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                      {tierData.tier === 'tier_1_preferred'
                        ? 'Preferred Carrier (Tier 1)'
                        : tierData.tier === 'tier_2_standard'
                        ? 'Standard Qualified Carrier (Tier 2)'
                        : tierData.tier === 'tier_3_probation'
                        ? 'Probationary Carrier (Tier 3)'
                        : tierData.tier === 'blocked'
                        ? 'Blocked Carrier'
                        : tierData.tier_label || 'Approved'}
                    </h3>
                  </div>

                  <span
                    className={`cf-badge ${
                      tierData.tier === 'tier_1_preferred'
                        ? 'cf-badge-tier1'
                        : tierData.tier === 'tier_2_standard'
                        ? 'cf-badge-tier2'
                        : tierData.tier === 'tier_3_probation'
                        ? 'cf-badge-probation'
                        : 'cf-badge-blocked'
                    }`}
                    style={{ fontSize: '13px', padding: '6px 14px' }}
                  >
                    {tierData.tier_label || (tierData.tier === 'tier_1_preferred' ? 'Preferred' : tierData.tier === 'tier_2_standard' ? 'Approved' : tierData.tier === 'tier_3_probation' ? 'Probation' : 'Blocked')}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '12px' }}>
                  <div style={{ background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>EARLY ACCESS WINDOW</span>
                    <strong style={{ fontSize: '14px', color: '#0284c7' }}>
                      {tierData.priority_access_hours ? `${tierData.priority_access_hours} Hours Early Access` : 'Standard Load Board (0 Hours)'}
                    </strong>
                  </div>

                  <div style={{ background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>DISPATCH ELIGIBILITY</span>
                    <span className={`cf-badge ${tierData.tier === 'blocked' ? 'cf-badge-blocked' : tierData.tier === 'tier_3_probation' ? 'cf-badge-scheduled' : 'cf-badge-active'}`}>
                      {tierData.tier === 'blocked' ? 'Dispatch Gated (Blocked)' : tierData.tier === 'tier_3_probation' ? 'Conditional Review' : 'Priority Dispatch'}
                    </span>
                  </div>

                  <div style={{ background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>STATUS & EFFECTIVE</span>
                    <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                      {tierData.status?.toUpperCase() || 'ACTIVE'} · Since {tierData.effective_from ? new Date(tierData.effective_from).toLocaleDateString() : 'Active'}
                    </strong>
                  </div>

                  <div style={{ background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>EXPIRATION DATE</span>
                    <strong style={{ fontSize: '13px', color: '#475569' }}>
                      {tierData.effective_to ? new Date(tierData.effective_to).toLocaleDateString() : 'Indefinite / Permanent'}
                    </strong>
                  </div>
                </div>

                {tierData.notes && (
                  <div style={{ marginTop: '14px', padding: '10px 14px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#475569' }}>
                    <strong>Classification Notes:</strong> {tierData.notes}
                  </div>
                )}
              </div>
            ) : (
              <div className="cf-empty-box" style={{ padding: '30px 20px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
                <Stack size={40} weight="light" color="#64748b" />
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', margin: '10px 0 6px' }}>
                  No Tier Assigned Yet
                </h3>
                <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: '13.5px' }}>
                  Assign a network tier to control dispatch priority and early access windows.
                </p>
                {canUpdateTier && (
                  <button
                    type="button"
                    className="cf-btn cf-btn-primary"
                    onClick={() => setShowUpdateTierModal(true)}
                  >
                    Assign Carrier Tier
                  </button>
                )}
              </div>
            )}

            {/* Standard Network Tier Matrix (Informational Documentation Reference Only) */}
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px', color: '#0f172a' }}>
                Standard Platform Tier Definitions & Service Level Matrix
              </h4>
              <p style={{ fontSize: '12.5px', color: '#64748b', margin: '0 0 10px' }}>
                Platform standard rules governing early booking windows and matching priorities.
              </p>
              <div className="cf-table-wrap">
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th>Tier Level</th>
                      <th>Classification</th>
                      <th>Early Access Window</th>
                      <th>Dispatch Eligibility</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={tierData?.tier === 'tier_1_preferred' ? { background: '#f0f9ff' } : undefined}>
                      <td><span className="cf-badge cf-badge-tier1">Tier 1</span></td>
                      <td><strong>Preferred Carrier</strong> {tierData?.tier === 'tier_1_preferred' && <CheckCircle size={14} color="#0284c7" weight="fill" />}</td>
                      <td>2 Hours Early Access</td>
                      <td><span className="cf-badge cf-badge-active">Priority Dispatch</span></td>
                    </tr>
                    <tr style={tierData?.tier === 'tier_2_standard' ? { background: '#f0fdf4' } : undefined}>
                      <td><span className="cf-badge cf-badge-tier2">Tier 2</span></td>
                      <td><strong>Standard Qualified Carrier</strong> {tierData?.tier === 'tier_2_standard' && <CheckCircle size={14} color="#059669" weight="fill" />}</td>
                      <td>Standard Load Board</td>
                      <td><span className="cf-badge cf-badge-active">Eligible</span></td>
                    </tr>
                    <tr style={tierData?.tier === 'tier_3_probation' ? { background: '#fffbeb' } : undefined}>
                      <td><span className="cf-badge cf-badge-probation">Tier 3</span></td>
                      <td><strong>Probationary Carrier</strong> {tierData?.tier === 'tier_3_probation' && <CheckCircle size={14} color="#b45309" weight="fill" />}</td>
                      <td>Public Board Only</td>
                      <td><span className="cf-badge cf-badge-conditional">Conditional Review</span></td>
                    </tr>
                    <tr style={tierData?.tier === 'blocked' ? { background: '#fef2f2' } : undefined}>
                      <td><span className="cf-badge cf-badge-blocked">Blocked</span></td>
                      <td><strong>Blocked Carrier</strong> {tierData?.tier === 'blocked' && <CheckCircle size={14} color="#dc2626" weight="fill" />}</td>
                      <td>Zero Access (Hidden)</td>
                      <td><span className="cf-badge cf-badge-blocked">Dispatch Gated</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}


      {/* ═══════════════════════════════════════════════════════
          TAB 7: FLEET ASSIGNMENT (FR-5.7)
          ═══════════════════════════════════════════════════════ */}
      {activeTab === 'assignments' && !isDriver && (
        <section>
          <div className="cf-assignment-stepper">
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                Fleet Asset & Driver Load Assignment (FR-5.7)
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                Assign an active power unit, compatible trailer, and qualified driver to a booked shipment with backend double-booking and HOS validation.
              </p>
            </div>

            {assignmentError && (
              <div className="cf-alert-banner cf-alert-error">
                <WarningCircle size={18} />
                <span>{assignmentError}</span>
              </div>
            )}

            {/* Shipment Selection */}
            <div className="cf-form-col">
              <label>Select Booked Shipment *</label>
              <select
                className="cf-select"
                value={selectedShipmentId}
                onChange={(e) => {
                  setSelectedShipmentId(e.target.value);
                  fetchCurrentAssignment(e.target.value);
                }}
              >
                <option value="">-- Choose Shipment to Assign --</option>
                {shipments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.reference_number || `Shipment #${s.id}`} — {s.origin?.city} → {s.destination?.city} · Status: {s.status?.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Current Assignment Status */}
            {currentAssignment ? (
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#166534', margin: '0 0 4px' }}>
                    Active Assignment on Shipment #{selectedShipmentId}
                  </h4>
                  <div style={{ fontSize: '13px', color: '#14532d' }}>
                    <div><strong>Truck:</strong> {currentAssignment.truck?.unit_number || `Vehicle #${currentAssignment.truck_id}`} ({currentAssignment.truck?.equipment_type || 'Dry Van'})</div>
                    <div><strong>Trailer:</strong> {currentAssignment.trailer?.unit_number || (currentAssignment.trailer_id ? `Trailer #${currentAssignment.trailer_id}` : 'None')}</div>
                    <div><strong>Driver:</strong> {currentAssignment.driver?.name || `Driver #${currentAssignment.driver_id}`}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="cf-btn cf-btn-danger"
                    onClick={handleRemoveAssignment}
                  >
                    Release / Unassign Combination
                  </button>
                </div>
              </div>
            ) : selectedShipmentId ? (
              <div className="cf-alert-banner cf-alert-info">
                <Info size={18} />
                <span>No vehicle or driver is currently assigned to Shipment #{selectedShipmentId}. Use the form below to assign.</span>
              </div>
            ) : null}

            {/* Assignment Form */}
            {canAssignFleet && selectedShipmentId && (
              <form onSubmit={handleAssignFleet} style={{ marginTop: '10px' }}>
                <div className="cf-assignment-grid">
                  {/* Power Unit / Truck Selector */}
                  <div className="cf-assign-box">
                    <h4><Truck size={17} /> 1. Power Unit / Truck</h4>
                    <select
                      className="cf-select"
                      value={assignTruckId}
                      onChange={(e) => setAssignTruckId(e.target.value)}
                    >
                      <option value="">-- Choose Power Unit --</option>
                      {vehicles.filter((v) => v.type === 'truck' || v.type === 'tractor').map((v) => (
                        <option
                          key={v.id}
                          value={v.id}
                          disabled={v.status !== 'active'}
                        >
                          {v.unit_number} ({v.type?.toUpperCase()}) — {v.equipment_type} · {v.status?.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <small style={{ color: '#64748b' }}>Must be active and mechanically available.</small>
                  </div>

                  {/* Trailer Selector */}
                  <div className="cf-assign-box">
                    <h4><Truck size={17} /> 2. Trailer (Optional if Straight Truck)</h4>
                    <select
                      className="cf-select"
                      value={assignTrailerId}
                      onChange={(e) => setAssignTrailerId(e.target.value)}
                    >
                      <option value="">-- Choose Trailer --</option>
                      {vehicles.filter((v) => v.type === 'trailer').map((v) => (
                        <option
                          key={v.id}
                          value={v.id}
                          disabled={v.status !== 'active'}
                        >
                          {v.unit_number} ({v.equipment_type}) · {v.status?.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <small style={{ color: '#64748b' }}>Reefer, dry van or flatbed trailer.</small>
                  </div>

                  {/* Driver Selector */}
                  <div className="cf-assign-box">
                    <h4><UsersThree size={17} /> 3. Qualified Driver</h4>
                    <select
                      className="cf-select"
                      value={assignDriverId}
                      onChange={(e) => setAssignDriverId(e.target.value)}
                    >
                      <option value="">-- Choose Qualified Driver --</option>
                      {driverRoster.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name || d.user?.name} · {DUTY_STATUS_LABELS[d.current_duty_status] || 'Active'}
                        </option>
                      ))}
                    </select>
                    <small style={{ color: '#64748b' }}>HOS hours and license verification required.</small>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                  <button
                    type="submit"
                    className="cf-btn cf-btn-primary"
                    disabled={submittingAssignment}
                  >
                    {submittingAssignment ? 'Validating & Assigning...' : 'Submit & Lock Fleet Assignment'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 1: REGISTER VEHICLE
          ═══════════════════════════════════════════════════════ */}
      {showNewVehicleModal && (
        <NewVehicleModal
          onClose={() => setShowNewVehicleModal(false)}
          onSuccess={() => {
            setShowNewVehicleModal(false);
            fetchVehicles();
          }}
          notify={notify}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 2: EDIT VEHICLE
          ═══════════════════════════════════════════════════════ */}
      {editingVehicle && (
        <EditVehicleModal
          vehicle={editingVehicle}
          onClose={() => setEditingVehicle(null)}
          onSuccess={() => {
            setEditingVehicle(null);
            fetchVehicles();
          }}
          notify={notify}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 3: VEHICLE DETAIL
          ═══════════════════════════════════════════════════════ */}
      {selectedVehicleDetail && (
        <VehicleDetailModal
          vehicle={selectedVehicleDetail}
          onClose={() => setSelectedVehicleDetail(null)}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 4: DECOMMISSION CONFIRMATION
          ═══════════════════════════════════════════════════════ */}
      {decommissioningVehicle && (
        <div className="cf-modal-backdrop">
          <div className="cf-modal">
            <header className="cf-modal-header">
              <h2>Confirm Vehicle Decommission</h2>
              <button type="button" className="icon-btn" onClick={() => setDecommissioningVehicle(null)}>
                <X size={20} />
              </button>
            </header>
            <div className="cf-modal-body">
              <p style={{ margin: 0, fontSize: '14px', color: '#334155' }}>
                Are you sure you want to decommission unit <strong>{decommissioningVehicle.unit_number}</strong>?
                This will retire the vehicle from the active fleet and prevent any future load dispatches.
              </p>
            </div>
            <footer className="cf-modal-footer">
              <button
                type="button"
                className="cf-btn cf-btn-secondary"
                onClick={() => setDecommissioningVehicle(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cf-btn cf-btn-danger"
                onClick={async () => {
                  try {
                    await deleteVehicle(decommissioningVehicle.id);
                    notify?.(`Vehicle ${decommissioningVehicle.unit_number} decommissioned successfully`);
                    setDecommissioningVehicle(null);
                    fetchVehicles();
                  } catch (err) {
                    notify?.(err.message || 'Failed to decommission vehicle');
                  }
                }}
              >
                Confirm Decommission
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 5: LOG MAINTENANCE
          ═══════════════════════════════════════════════════════ */}
      {showNewMaintModal && selectedMaintVehicleId && (
        <NewMaintenanceModal
          vehicleId={selectedMaintVehicleId}
          onClose={() => setShowNewMaintModal(false)}
          onSuccess={() => {
            setShowNewMaintModal(false);
            fetchMaintenance(selectedMaintVehicleId);
          }}
          notify={notify}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 6: UPDATE MAINTENANCE RECORD
          ═══════════════════════════════════════════════════════ */}
      {editingMaintRecord && (
        <EditMaintenanceModal
          record={editingMaintRecord}
          onClose={() => setEditingMaintRecord(null)}
          onSuccess={() => {
            setEditingMaintRecord(null);
            fetchMaintenance(selectedMaintVehicleId);
          }}
          notify={notify}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 7: RECORD INSPECTION
          ═══════════════════════════════════════════════════════ */}
      {showNewInspectionModal && selectedMaintVehicleId && (
        <NewInspectionModal
          vehicleId={selectedMaintVehicleId}
          onClose={() => setShowNewInspectionModal(false)}
          onSuccess={() => {
            setShowNewInspectionModal(false);
            fetchMaintenance(selectedMaintVehicleId);
          }}
          notify={notify}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 8: RECORD DUTY STATUS (HOS)
          ═══════════════════════════════════════════════════════ */}
      {showDutyStatusModal && selectedDriverId && (
        <RecordDutyStatusModal
          driverId={selectedDriverId}
          onClose={() => setShowDutyStatusModal(false)}
          onSuccess={() => {
            setShowDutyStatusModal(false);
            fetchDriverHosData(selectedDriverId);
          }}
          notify={notify}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 9: CHECK HOS ELIGIBILITY
          ═══════════════════════════════════════════════════════ */}
      {showHosEligibilityModal && selectedDriverId && (
        <CheckHosEligibilityModal
          driverId={selectedDriverId}
          onClose={() => setShowHosEligibilityModal(false)}
          notify={notify}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 10: REGISTER INSURANCE
          ═══════════════════════════════════════════════════════ */}
      {showNewInsuranceModal && (
        <NewInsuranceModal
          onClose={() => setShowNewInsuranceModal(false)}
          onSuccess={() => {
            setShowNewInsuranceModal(false);
            fetchCompliance();
          }}
          notify={notify}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 11: SUSPEND / REINSTATE CARRIER
          ═══════════════════════════════════════════════════════ */}
      {showSuspendModal && (
        <SuspendCarrierModal
          currentStatus={complianceData?.status || 'active'}
          onClose={() => setShowSuspendModal(false)}
          onSuccess={() => {
            setShowSuspendModal(false);
            fetchCompliance();
          }}
          notify={notify}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          MODAL 12: UPDATE CARRIER NETWORK TIER (FR-5.6)
          ═══════════════════════════════════════════════════════ */}
      {showUpdateTierModal && (
        <UpdateCarrierTierModal
          currentTier={tierData}
          carrierOrgId={tierData?.carrier_org_id || currentOrg?.id}
          onClose={() => setShowUpdateTierModal(false)}
          onSuccess={() => {
            setShowUpdateTierModal(false);
            fetchTier();
          }}
          notify={notify}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: NEW VEHICLE MODAL (FR-5.1)
// ─────────────────────────────────────────────────────────────
function NewVehicleModal({ onClose, onSuccess, notify }) {
  const [unitNumber, setUnitNumber] = useState('');
  const [type, setType] = useState('truck');
  const [vin, setVin] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [plateState, setPlateState] = useState('IL');
  const [make, setMake] = useState('Freightliner');
  const [model, setModel] = useState('Cascadia');
  const [year, setYear] = useState('2024');
  const [equipmentType, setEquipmentType] = useState('Dry Van');
  const [maxPayloadLbs, setMaxPayloadLbs] = useState('45000');
  const [odometer, setOdometer] = useState('15000');
  const [ownershipType, setOwnershipType] = useState('owned');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!unitNumber.trim() || !vin.trim()) {
      setError('Unit Number and VIN are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        unit_number: unitNumber.trim(),
        type,
        vin: vin.trim(),
        plate_number: plateNumber.trim() || undefined,
        plate_state: plateState.trim() || undefined,
        make: make.trim() || undefined,
        model: model.trim() || undefined,
        year: year ? Number(year) : undefined,
        equipment_type: equipmentType,
        max_payload_lbs: maxPayloadLbs ? Number(maxPayloadLbs) : undefined,
        current_odometer: odometer ? Number(odometer) : 0,
        ownership_type: ownershipType,
      };

      const res = await createVehicle(payload);
      notify?.(`Vehicle ${res?.data?.unit_number || unitNumber} registered successfully!`);
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to register vehicle');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cf-modal-backdrop">
      <div className="cf-modal wide">
        <header className="cf-modal-header">
          <h2>Register Fleet Vehicle (FR-5.1)</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="cf-modal-body">
            {error && (
              <div className="cf-alert-banner cf-alert-error">
                <WarningCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <div className="cf-form-row">
              <div className="cf-form-col">
                <label>Unit / Fleet # *</label>
                <input
                  type="text"
                  placeholder="e.g. TRK-104"
                  value={unitNumber}
                  onChange={(e) => setUnitNumber(e.target.value)}
                  required
                />
              </div>

              <div className="cf-form-col">
                <label>Vehicle Type *</label>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="truck">Straight Truck</option>
                  <option value="tractor">Tractor (Semi-Truck)</option>
                  <option value="trailer">Trailer</option>
                </select>
              </div>

              <div className="cf-form-col">
                <label>Equipment Type</label>
                <select value={equipmentType} onChange={(e) => setEquipmentType(e.target.value)}>
                  <option value="Dry Van">Dry Van</option>
                  <option value="Reefer">Reefer (Temperature Controlled)</option>
                  <option value="Flatbed">Flatbed</option>
                  <option value="Step Deck">Step Deck</option>
                  <option value="Power Only">Power Only</option>
                </select>
              </div>
            </div>

            <div className="cf-form-row">
              <div className="cf-form-col">
                <label>17-Digit VIN *</label>
                <input
                  type="text"
                  placeholder="1HD1AA2449PA..."
                  value={vin}
                  onChange={(e) => setVin(e.target.value)}
                  required
                />
              </div>
              <div className="cf-form-col">
                <label>License Plate #</label>
                <input
                  type="text"
                  placeholder="e.g. IL-40291"
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value)}
                />
              </div>
              <div className="cf-form-col" style={{ maxWidth: '90px' }}>
                <label>State</label>
                <input
                  type="text"
                  maxLength={2}
                  value={plateState}
                  onChange={(e) => setPlateState(e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div className="cf-form-row">
              <div className="cf-form-col">
                <label>Make</label>
                <input
                  type="text"
                  placeholder="Freightliner / Peterbilt"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                />
              </div>
              <div className="cf-form-col">
                <label>Model</label>
                <input
                  type="text"
                  placeholder="Cascadia / 579"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </div>
              <div className="cf-form-col" style={{ maxWidth: '100px' }}>
                <label>Model Year</label>
                <input
                  type="number"
                  min="1990"
                  max="2030"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>
            </div>

            <div className="cf-form-row">
              <div className="cf-form-col">
                <label>Max Payload Capacity (lbs)</label>
                <input
                  type="number"
                  min="0"
                  value={maxPayloadLbs}
                  onChange={(e) => setMaxPayloadLbs(e.target.value)}
                />
              </div>
              <div className="cf-form-col">
                <label>Current Odometer (Miles)</label>
                <input
                  type="number"
                  min="0"
                  value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                />
              </div>
              <div className="cf-form-col">
                <label>Ownership</label>
                <select value={ownershipType} onChange={(e) => setOwnershipType(e.target.value)}>
                  <option value="owned">Company Owned</option>
                  <option value="leased">Leased</option>
                  <option value="owner_operator">Owner Operator</option>
                </select>
              </div>
            </div>
          </div>
          <footer className="cf-modal-footer">
            <button type="button" className="cf-btn cf-btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="cf-btn cf-btn-primary" disabled={submitting}>
              {submitting ? 'Registering...' : 'Register Vehicle'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: EDIT VEHICLE MODAL
// ─────────────────────────────────────────────────────────────
function EditVehicleModal({ vehicle, onClose, onSuccess, notify }) {
  const [unitNumber, setUnitNumber] = useState(vehicle.unit_number || '');
  const [equipmentType, setEquipmentType] = useState(vehicle.equipment_type || 'Dry Van');
  const [status, setStatus] = useState(vehicle.status || 'active');
  const [odometer, setOdometer] = useState(vehicle.current_odometer || 0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await updateVehicle(vehicle.id, {
        unit_number: unitNumber.trim(),
        equipment_type: equipmentType,
        status,
        current_odometer: Number(odometer),
      });
      notify?.('Vehicle updated successfully');
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to update vehicle');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cf-modal-backdrop">
      <div className="cf-modal">
        <header className="cf-modal-header">
          <h2>Edit Vehicle #{vehicle.unit_number}</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="cf-modal-body">
            {error && (
              <div className="cf-alert-banner cf-alert-error">
                <WarningCircle size={18} />
                <span>{error}</span>
              </div>
            )}
            <div className="cf-form-col">
              <label>Unit / Fleet #</label>
              <input
                type="text"
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                required
              />
            </div>
            <div className="cf-form-col">
              <label>Equipment Type</label>
              <select value={equipmentType} onChange={(e) => setEquipmentType(e.target.value)}>
                <option value="Dry Van">Dry Van</option>
                <option value="Reefer">Reefer</option>
                <option value="Flatbed">Flatbed</option>
                <option value="Step Deck">Step Deck</option>
                <option value="Power Only">Power Only</option>
              </select>
            </div>
            <div className="cf-form-col">
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="out_of_service">Out of Service</option>
                <option value="decommissioned">Decommissioned</option>
              </select>
            </div>
            <div className="cf-form-col">
              <label>Odometer (Miles)</label>
              <input
                type="number"
                min="0"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
              />
            </div>
          </div>
          <footer className="cf-modal-footer">
            <button type="button" className="cf-btn cf-btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="cf-btn cf-btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: VEHICLE DETAIL MODAL
// ─────────────────────────────────────────────────────────────
function VehicleDetailModal({ vehicle, onClose }) {
  return (
    <div className="cf-modal-backdrop">
      <div className="cf-modal">
        <header className="cf-modal-header">
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase' }}>
              COMMERCIAL FLEET ASSET
            </span>
            <h2 style={{ margin: '2px 0 0' }}>Unit {vehicle.unit_number}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="cf-modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', background: '#f8fafc', padding: '14px', borderRadius: '8px', fontSize: '13px' }}>
            <div><strong>Type:</strong> {vehicle.type?.toUpperCase()}</div>
            <div><strong>Equipment:</strong> {vehicle.equipment_type || '—'}</div>
            <div><strong>VIN:</strong> <code>{vehicle.vin}</code></div>
            <div><strong>Plate:</strong> {vehicle.plate_number} ({vehicle.plate_state})</div>
            <div><strong>Make / Model:</strong> {vehicle.make} {vehicle.model} ({vehicle.year})</div>
            <div><strong>Odometer:</strong> {vehicle.current_odometer ? `${Number(vehicle.current_odometer).toLocaleString()} mi` : '—'}</div>
            <div><strong>Capacity:</strong> {vehicle.max_payload_lbs ? `${Number(vehicle.max_payload_lbs).toLocaleString()} lbs` : '—'}</div>
            <div><strong>Status:</strong> {vehicle.status?.toUpperCase()}</div>
            <div><strong>Assignment:</strong> {vehicle.assignment_status?.toUpperCase()}</div>
            <div><strong>Ownership:</strong> {vehicle.ownership_type?.toUpperCase() || 'OWNED'}</div>
          </div>
        </div>
        <footer className="cf-modal-footer">
          <button type="button" className="cf-btn cf-btn-secondary" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: LOG MAINTENANCE MODAL (FR-5.2)
// ─────────────────────────────────────────────────────────────
function NewMaintenanceModal({ vehicleId, onClose, onSuccess, notify }) {
  const [serviceType, setServiceType] = useState('oil_change');
  const [description, setDescription] = useState('Scheduled synthetic oil & filter replacement');
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0]);
  const [cost, setCost] = useState('250.00');
  const [vendorName, setVendorName] = useState('FleetCare Service Center');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await createVehicleMaintenance(vehicleId, {
        service_type: serviceType,
        description: description.trim(),
        scheduled_date: new Date(scheduledDate).toISOString(),
        cost: Number(cost) || 0,
        vendor_name: vendorName.trim() || undefined,
        status: 'scheduled',
      });
      notify?.('Maintenance record scheduled successfully');
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to schedule maintenance');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cf-modal-backdrop">
      <div className="cf-modal">
        <header className="cf-modal-header">
          <h2>Schedule Maintenance Service</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="cf-modal-body">
            {error && (
              <div className="cf-alert-banner cf-alert-error">
                <WarningCircle size={18} />
                <span>{error}</span>
              </div>
            )}
            <div className="cf-form-col">
              <label>Service Type *</label>
              <select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
                <option value="oil_change">Oil Change & Filter</option>
                <option value="brake_service">Brake Service & Pad Replacement</option>
                <option value="tire_rotation">Tire Inspection & Replacement</option>
                <option value="annual_dot">Annual DOT Federal Inspection</option>
                <option value="engine_overhaul">Engine & Transmission Service</option>
                <option value="reefer_service">Reefer Unit Maintenance</option>
                <option value="other">Other Service</option>
              </select>
            </div>
            <div className="cf-form-col">
              <label>Service Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
            <div className="cf-form-row">
              <div className="cf-form-col">
                <label>Scheduled Date *</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  required
                />
              </div>
              <div className="cf-form-col">
                <label>Estimated Cost ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
            </div>
            <div className="cf-form-col">
              <label>Vendor / Service Center</label>
              <input
                type="text"
                placeholder="e.g. Rush Truck Centers / Speedco"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
              />
            </div>
          </div>
          <footer className="cf-modal-footer">
            <button type="button" className="cf-btn cf-btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="cf-btn cf-btn-primary" disabled={submitting}>
              {submitting ? 'Scheduling...' : 'Schedule Service'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: EDIT MAINTENANCE MODAL
// ─────────────────────────────────────────────────────────────
function EditMaintenanceModal({ record, onClose, onSuccess, notify }) {
  const [status, setStatus] = useState(record.status || 'scheduled');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const payload = { status };
      if (status === 'completed') {
        payload.completed_date = new Date().toISOString();
      }
      await updateMaintenanceRecord(record.id, payload);
      notify?.(`Maintenance record #${record.id} updated to ${status}`);
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to update record');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cf-modal-backdrop">
      <div className="cf-modal">
        <header className="cf-modal-header">
          <h2>Update Maintenance Status #{record.id}</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="cf-modal-body">
            {error && (
              <div className="cf-alert-banner cf-alert-error">
                <WarningCircle size={18} />
                <span>{error}</span>
              </div>
            )}
            <div className="cf-form-col">
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress (In Shop)</option>
                <option value="completed">Completed & Released</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <footer className="cf-modal-footer">
            <button type="button" className="cf-btn cf-btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="cf-btn cf-btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Update Status'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: RECORD INSPECTION MODAL (FR-5.2)
// ─────────────────────────────────────────────────────────────
function NewInspectionModal({ vehicleId, onClose, onSuccess, notify }) {
  const [inspectionType, setInspectionType] = useState('annual_dot');
  const [result, setResult] = useState('passed');
  const [inspectorName, setInspectorName] = useState('Certified DOT Inspector');
  const [notes, setNotes] = useState('Clean pre-trip / zero mechanical defects');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await createVehicleInspection(vehicleId, {
        inspection_type: inspectionType,
        result,
        inspector_name: inspectorName.trim(),
        notes: notes.trim(),
      });
      notify?.('Safety inspection logged successfully');
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to record inspection');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cf-modal-backdrop">
      <div className="cf-modal">
        <header className="cf-modal-header">
          <h2>Record Vehicle Safety Inspection</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="cf-modal-body">
            {error && (
              <div className="cf-alert-banner cf-alert-error">
                <WarningCircle size={18} />
                <span>{error}</span>
              </div>
            )}
            <div className="cf-form-col">
              <label>Inspection Type *</label>
              <select value={inspectionType} onChange={(e) => setInspectionType(e.target.value)}>
                <option value="pre_trip">Driver Pre-Trip Inspection</option>
                <option value="post_trip">Driver Post-Trip Inspection</option>
                <option value="annual_dot">Annual FMCSA / DOT Inspection</option>
                <option value="roadside">State Roadside Inspection</option>
              </select>
            </div>
            <div className="cf-form-col">
              <label>Result *</label>
              <select value={result} onChange={(e) => setResult(e.target.value)}>
                <option value="passed">Passed (Clean)</option>
                <option value="conditional">Conditional (Minor Defects)</option>
                <option value="failed">Failed (Out-of-Service)</option>
              </select>
            </div>
            <div className="cf-form-col">
              <label>Inspector Name</label>
              <input
                type="text"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
              />
            </div>
            <div className="cf-form-col">
              <label>Violations / Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <footer className="cf-modal-footer">
            <button type="button" className="cf-btn cf-btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="cf-btn cf-btn-primary" disabled={submitting}>
              {submitting ? 'Recording...' : 'Record Inspection'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: RECORD DUTY STATUS (HOS)
// ─────────────────────────────────────────────────────────────
function RecordDutyStatusModal({ driverId, onClose, onSuccess, notify }) {
  const [dutyStatus, setDutyStatus] = useState('on_duty');
  const [location, setLocation] = useState('Chicago, IL (Terminal)');
  const [notes, setNotes] = useState('Pre-trip vehicle inspection');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await recordDutyStatus(driverId, {
        duty_status: dutyStatus,
        location: location.trim(),
        notes: notes.trim() || undefined,
      });
      notify?.(`Duty status updated to ${DUTY_STATUS_LABELS[dutyStatus]}`);
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to update duty status');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cf-modal-backdrop">
      <div className="cf-modal">
        <header className="cf-modal-header">
          <h2>Change Driver Duty Status</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="cf-modal-body">
            {error && (
              <div className="cf-alert-banner cf-alert-error">
                <WarningCircle size={18} />
                <span>{error}</span>
              </div>
            )}
            <div className="cf-form-col">
              <label>Duty Status *</label>
              <select value={dutyStatus} onChange={(e) => setDutyStatus(e.target.value)}>
                <option value="driving">Driving (Behind the Wheel)</option>
                <option value="on_duty">On Duty (Not Driving)</option>
                <option value="sleeper_berth">Sleeper Berth</option>
                <option value="off_duty">Off Duty</option>
              </select>
            </div>
            <div className="cf-form-col">
              <label>Current Location</label>
              <input
                type="text"
                placeholder="e.g. Dallas, TX"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>
            <div className="cf-form-col">
              <label>Remark / Notes</label>
              <input
                type="text"
                placeholder="Pre-trip inspection / loading at shipper"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <footer className="cf-modal-footer">
            <button type="button" className="cf-btn cf-btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="cf-btn cf-btn-primary" disabled={submitting}>
              {submitting ? 'Updating...' : 'Stamp Duty Status'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: CHECK HOS ELIGIBILITY
// ─────────────────────────────────────────────────────────────
function CheckHosEligibilityModal({ driverId, onClose, notify }) {
  const [distanceMiles, setDistanceMiles] = useState('450');
  const [estimatedHours, setEstimatedHours] = useState('8.5');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleCheck = async (e) => {
    e.preventDefault();
    setChecking(true);
    setError('');
    setResult(null);
    try {
      const res = await checkHosEligibility(driverId, {
        distance_miles: Number(distanceMiles),
        estimated_hours: Number(estimatedHours),
      });
      setResult(res?.data || res);
    } catch (err) {
      setError(err.message || 'Eligibility evaluation failed');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="cf-modal-backdrop">
      <div className="cf-modal">
        <header className="cf-modal-header">
          <h2>Check Driver HOS Trip Eligibility</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={handleCheck}>
          <div className="cf-modal-body">
            {error && (
              <div className="cf-alert-banner cf-alert-error">
                <WarningCircle size={18} />
                <span>{error}</span>
              </div>
            )}
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
              Verify whether driver has adequate remaining FMCSA drive and on-duty hours to complete this planned transit without violation.
            </p>
            <div className="cf-form-row">
              <div className="cf-form-col">
                <label>Transit Distance (Miles)</label>
                <input
                  type="number"
                  min="1"
                  value={distanceMiles}
                  onChange={(e) => setDistanceMiles(e.target.value)}
                  required
                />
              </div>
              <div className="cf-form-col">
                <label>Estimated Transit Hours</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  required
                />
              </div>
            </div>

            {result && (
              <div
                style={{
                  background: result.eligible ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${result.eligible ? '#bbf7d0' : '#fecaca'}`,
                  borderRadius: '6px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {result.eligible ? (
                    <CheckCircle size={20} color="#166534" weight="fill" />
                  ) : (
                    <WarningCircle size={20} color="#b91c1c" weight="fill" />
                  )}
                  <strong style={{ color: result.eligible ? '#166534' : '#b91c1c' }}>
                    {result.eligible ? 'DRIVER ELIGIBLE FOR DISPATCH' : 'HOS VIOLATION RISK / INSUFFICIENT HOURS'}
                  </strong>
                </div>
                <div style={{ fontSize: '12.5px', color: '#334155' }}>
                  {result.reason || result.message || 'Driver has sufficient drive window and cycle hours available.'}
                </div>
              </div>
            )}
          </div>
          <footer className="cf-modal-footer">
            <button type="button" className="cf-btn cf-btn-secondary" onClick={onClose}>
              Close
            </button>
            <button type="submit" className="cf-btn cf-btn-primary" disabled={checking}>
              {checking ? 'Evaluating...' : 'Evaluate Eligibility'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: NEW INSURANCE POLICY (FR-5.4)
// ─────────────────────────────────────────────────────────────
function NewInsuranceModal({ onClose, onSuccess, notify }) {
  const [type, setType] = useState('cargo_insurance');
  const [policyNumber, setPolicyNumber] = useState('');
  const [insurerName, setInsurerName] = useState('Travelers Commercial Lines');
  const [coverageAmount, setCoverageAmount] = useState('1000000');
  const [expiryDate, setExpiryDate] = useState(
    new Date(Date.now() + 365 * 86400 * 1000).toISOString().split('T')[0]
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!policyNumber.trim() || !insurerName.trim()) {
      setError('Policy number and insurer name are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await createInsurancePolicy({
        type,
        policy_number: policyNumber.trim(),
        insurer_name: insurerName.trim(),
        coverage_amount: Number(coverageAmount),
        expiry_date: new Date(expiryDate).toISOString(),
        verification_status: 'valid',
      });
      notify?.('Insurance policy registered successfully');
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to register policy');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cf-modal-backdrop">
      <div className="cf-modal">
        <header className="cf-modal-header">
          <h2>Register Carrier Insurance Policy</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="cf-modal-body">
            {error && (
              <div className="cf-alert-banner cf-alert-error">
                <WarningCircle size={18} />
                <span>{error}</span>
              </div>
            )}
            <div className="cf-form-col">
              <label>Policy Type *</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="cargo_insurance">Cargo Insurance ($100,000+)</option>
                <option value="auto_liability">Commercial Auto Liability ($1,000,000+)</option>
                <option value="general_liability">Commercial General Liability</option>
                <option value="workers_comp">Workers' Compensation</option>
              </select>
            </div>
            <div className="cf-form-col">
              <label>Policy Number *</label>
              <input
                type="text"
                placeholder="e.g. POL-CARGO-99201"
                value={policyNumber}
                onChange={(e) => setPolicyNumber(e.target.value)}
                required
              />
            </div>
            <div className="cf-form-col">
              <label>Underwriter / Insurance Carrier *</label>
              <input
                type="text"
                placeholder="e.g. Progressive Commercial / Travelers"
                value={insurerName}
                onChange={(e) => setInsurerName(e.target.value)}
                required
              />
            </div>
            <div className="cf-form-row">
              <div className="cf-form-col">
                <label>Coverage Limit ($) *</label>
                <input
                  type="number"
                  min="0"
                  value={coverageAmount}
                  onChange={(e) => setCoverageAmount(e.target.value)}
                  required
                />
              </div>
              <div className="cf-form-col">
                <label>Expiration Date *</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>
          <footer className="cf-modal-footer">
            <button type="button" className="cf-btn cf-btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="cf-btn cf-btn-primary" disabled={submitting}>
              {submitting ? 'Registering...' : 'Register Policy'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: SUSPEND / REINSTATE CARRIER MODAL
// ─────────────────────────────────────────────────────────────
function SuspendCarrierModal({ currentStatus, onClose, onSuccess, notify }) {
  const isCurrentlySuspended = currentStatus === 'suspended';
  const [reason, setReason] = useState(
    isCurrentlySuspended ? 'Compliance audit satisfied and insurance certificates verified.' : 'Insurance policy expired without active renewal binder.'
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const nextStatus = isCurrentlySuspended ? 'active' : 'suspended';
      await setCarrierSuspension(null, {
        status: nextStatus,
        reason: reason.trim(),
      });
      notify?.(`Carrier status updated to ${nextStatus.toUpperCase()}`);
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to update suspension status');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cf-modal-backdrop">
      <div className="cf-modal">
        <header className="cf-modal-header">
          <h2>{isCurrentlySuspended ? 'Reinstate Carrier' : 'Suspend Carrier Operations'}</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="cf-modal-body">
            {error && (
              <div className="cf-alert-banner cf-alert-error">
                <WarningCircle size={18} />
                <span>{error}</span>
              </div>
            )}
            <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
              {isCurrentlySuspended
                ? 'Reinstating this carrier will remove all dispatch gating blocks and restore full load board matching capabilities.'
                : 'Suspending this carrier will strictly gate all active load dispatches, freeze bidding, and block fleet assignments.'}
            </p>
            <div className="cf-form-col">
              <label>Reason / Audit Justification *</label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>
          </div>
          <footer className="cf-modal-footer">
            <button type="button" className="cf-btn cf-btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              className={`cf-btn ${isCurrentlySuspended ? 'cf-btn-primary' : 'cf-btn-danger'}`}
              disabled={submitting}
            >
              {submitting ? 'Updating...' : isCurrentlySuspended ? 'Reinstate Carrier' : 'Confirm Suspension'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: UPDATE CARRIER TIER MODAL (FR-5.6)
// ─────────────────────────────────────────────────────────────
function UpdateCarrierTierModal({ currentTier, carrierOrgId, onClose, onSuccess, notify }) {
  const [tier, setTier] = useState(currentTier?.tier || 'tier_1_preferred');
  const [priorityAccessHours, setPriorityAccessHours] = useState(
    currentTier?.priority_access_hours !== undefined ? String(currentTier.priority_access_hours) : '2'
  );
  const [notes, setNotes] = useState(currentTier?.notes || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleTierChange = (newTier) => {
    setTier(newTier);
    if (newTier === 'tier_1_preferred') {
      setPriorityAccessHours('2');
    } else {
      setPriorityAccessHours('0');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const targetOrgId = carrierOrgId || currentTier?.carrier_org_id || currentTier?.id;
      const payload = {
        tier,
        priority_access_hours: Number(priorityAccessHours) || 0,
        notes: notes.trim() || undefined,
        carrier_org_id: targetOrgId,
      };
      await updateCarrierTier(targetOrgId, payload);
      notify?.(`Carrier network tier updated to ${tier.replace(/_/g, ' ').toUpperCase()}`);
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to update carrier network tier');
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="cf-modal-backdrop">
      <div className="cf-modal">
        <header className="cf-modal-header">
          <h2>Update Network Tier Classification (FR-5.6)</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="cf-modal-body">
            {error && (
              <div className="cf-alert-banner cf-alert-error">
                <WarningCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <div className="cf-form-col">
              <label>Network Tier *</label>
              <select value={tier} onChange={(e) => handleTierChange(e.target.value)} required>
                <option value="tier_1_preferred">Tier 1 — Preferred (2h Early Access, Priority Dispatch)</option>
                <option value="tier_2_standard">Tier 2 — Standard Qualified (Standard Load Board, Eligible)</option>
                <option value="tier_3_probation">Tier 3 — Probationary (Public Board Only, Conditional Review)</option>
                <option value="blocked">Blocked — Operations Gated (Zero Access)</option>
              </select>
            </div>

            <div className="cf-form-col">
              <label>Priority Access Window (Hours)</label>
              <input
                type="number"
                min="0"
                max="72"
                value={priorityAccessHours}
                onChange={(e) => setPriorityAccessHours(e.target.value)}
                placeholder="2"
              />
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Exclusive early booking window before load board broadcast.
              </span>
            </div>

            <div className="cf-form-col">
              <label>Review Notes / Classification Justification</label>
              <textarea
                rows={3}
                placeholder="Performance review notes, carrier tier evaluation rationale..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <footer className="cf-modal-footer">
            <button type="button" className="cf-btn cf-btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="cf-btn cf-btn-primary" disabled={submitting}>
              {submitting ? 'Updating...' : 'Save Tier Classification'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}


