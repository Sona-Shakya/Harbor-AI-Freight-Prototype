import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Truck,
  UsersThree,
  WarningCircle,
  CheckCircle,
  CalendarCheck,
  MapPin,
  Path,
  Clock,
  ArrowsClockwise,
  ArrowRight,
  Plus,
  X,
  Check,
  Eye,
  ShieldCheck,
  FileText,
  MagnifyingGlass,
  Stack,
  Tag,
  Funnel,
  Buildings,
  Phone,
  ChatCircleDots,
  CalendarBlank,
  SlidersHorizontal,
  Info,
  ArrowCounterClockwise,
  NavigationArrow,
  CaretUp,
  CaretDown,
  Briefcase,
  Broadcast
} from '@phosphor-icons/react';
import {
  getDispatchBoard,
  assignDispatch,
  driverResponseDispatch,
  reassignDispatch,
  recordStopArrival,
  recordStopDeparture,
  logCheckCall,
  getCheckCalls,
  createShipmentException,
  getShipmentExceptions,
  getDispatchExceptions,
  resolveDispatchException,
  getFleetDrivers,
  getVehicles
} from './api';
import {
  OptimizeRouteModal,
  TruckDirectionsModal,
  DynamicEtaModal,
  RouteSimulationModal,
  LtlConsolidationModal
} from './RoutePlanningModals';
import DocumentsPanel from './DocumentsPanel.jsx';
import './styles/dispatchManagement.css';

export default function DispatchManagement({
  hasPermission,
  notify,
  currentUser,
  currentRoleName,
  currentOrg,
  profileLoading = false,
  initialViewMode = 'kanban',
  initialStatusFilter = 'all',
  operationalFilter,
  onNavigateToJob = null,
  onNavigateToShipment = null,
  onNavigateToBooking = null,
  onNavigateToTracking = null,
}) {
  // Roles & Permissions
  const isDriver = currentRoleName === 'Driver';
  const isPlatformAdmin = currentRoleName === 'Platform Admin';
  const isDispatcher =
    currentRoleName === 'Dispatcher' ||
    currentRoleName === 'Company Admin' ||
    currentRoleName === 'Carrier Admin' ||
    isPlatformAdmin;
  const isShipper = currentRoleName === 'Shipper User';

  const checkPerm = (mod, act) => (!profileLoading && typeof hasPermission === 'function' ? hasPermission(mod, act) : false);

  // M7 Route Planning & Optimization Permissions
  const canOptimize = checkPerm('routes', 'optimize');
  const canSimulate = checkPerm('routes', 'simulate');
  const canConsolidate = checkPerm('routes', 'consolidate');
  const canViewDirections = checkPerm('routes', 'view_directions');
  const canViewEta = checkPerm('eta', 'read') || checkPerm('routes', 'read') || checkPerm('dispatch', 'read');

  // Dispatch Action Permissions
  const canAssign = checkPerm('dispatch', 'assign') || checkPerm('dispatch', 'create');
  const canReassign = checkPerm('dispatch', 'reassign') || checkPerm('dispatch', 'update');
  const canLogCheckCall = checkPerm('dispatch', 'log_checkcall') || checkPerm('dispatch', 'create') || checkPerm('dispatch', 'update');
  const canReportException = checkPerm('dispatch', 'report_exception') || checkPerm('dispatch', 'create') || checkPerm('dispatch', 'update');
  const canResolveException = checkPerm('dispatch', 'resolve_exception') || checkPerm('dispatch', 'update');
  const canDriverResponse = checkPerm('dispatch', 'update') || isDriver;

  // Operational Workflow Guide Display Toggle
  const [showWorkflowGuide, setShowWorkflowGuide] = useState(true);

  // Board Data & Loading State
  const [loading, setLoading] = useState(true);
  const [boardData, setBoardData] = useState(null);
  const [error, setError] = useState(null);

  // Filters & Views
  const [viewMode, setViewMode] = useState(initialViewMode || 'kanban'); // 'kanban' | 'list' | 'by_driver' | 'exceptions'
  const [searchQuery, setSearchQuery] = useState(
    operationalFilter?.searchQuery || (operationalFilter?.shipmentId ? String(operationalFilter.shipmentId) : '')
  );
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    if (initialViewMode) setViewMode(initialViewMode);
  }, [initialViewMode]);

  useEffect(() => {
    if (initialStatusFilter) setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  useEffect(() => {
    if (operationalFilter?.shipmentId) {
      setSearchQuery(String(operationalFilter.shipmentId));
    } else if (operationalFilter?.searchQuery) {
      setSearchQuery(operationalFilter.searchQuery);
    }
  }, [operationalFilter]);

  // Dropdown Reference Data (Drivers & Equipment)
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [availableVehicles, setAvailableVehicles] = useState([]);

  // Active Modals State
  const [assignModalLoad, setAssignModalLoad] = useState(null);
  const [driverResponseModalLoad, setDriverResponseModalLoad] = useState(null);
  const [reassignModalLoad, setReassignModalLoad] = useState(null);
  const [checkCallModalLoad, setCheckCallModalLoad] = useState(null);
  const [milestonesModalLoad, setMilestonesModalLoad] = useState(null);
  const [docsModalLoad, setDocsModalLoad] = useState(null);
  const [exceptionModalLoad, setExceptionModalLoad] = useState(null);
  const [resolveExceptionTarget, setResolveExceptionTarget] = useState(null);

  // M7 Route Planning & Optimization Modals State
  const [optimizeModalLoad, setOptimizeModalLoad] = useState(null);
  const [directionsModalLoad, setDirectionsModalLoad] = useState(null);
  const [dynamicEtaModalLoad, setDynamicEtaModalLoad] = useState(null);
  const [showSimulationModal, setShowSimulationModal] = useState(false);
  const [showConsolidationModal, setShowConsolidationModal] = useState(false);

  // Modal Sub-state
  const [assignForm, setAssignForm] = useState({
    driver_id: '',
    truck_id: '',
    trailer_id: '',
    special_instructions: ''
  });
  const [driverResponseForm, setDriverResponseForm] = useState({
    response: 'accepted',
    rejection_reason: '',
    notes: ''
  });
  const [reassignForm, setReassignForm] = useState({
    new_driver_id: '',
    new_truck_id: '',
    new_trailer_id: '',
    reason: ''
  });
  const [checkCallForm, setCheckCallForm] = useState({
    location: '',
    city: '',
    state: '',
    odometer: '',
    status: 'on_schedule',
    eta: '',
    note: ''
  });
  const [newExceptionForm, setNewExceptionForm] = useState({
    type: 'transit_delay',
    severity: 'medium',
    description: ''
  });
  const [resolveNotes, setResolveNotes] = useState('');

  // Auxiliary data for active modals
  const [activeCheckCalls, setActiveCheckCalls] = useState([]);
  const [activeCheckCallsLoading, setActiveCheckCallsLoading] = useState(false);
  const [fleetExceptions, setFleetExceptions] = useState([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [modalActionBusy, setModalActionBusy] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Fetch Dispatch Board Data
  const loadBoard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (dateFilter) params.date = dateFilter;
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      if (driverFilter && driverFilter !== 'all') params.driver_id = driverFilter;

      const res = await getDispatchBoard(params);
      const data = res?.data || res;
      setBoardData(data);
    } catch (err) {
      console.error('Failed to load dispatch board:', err);
      setError(err.message || 'Failed to load dispatch board.');
      notify?.(err.message || 'Error loading dispatch board.');
    } finally {
      setLoading(false);
    }
  }, [dateFilter, statusFilter, driverFilter, notify]);

  // Load Reference Data (Drivers & Vehicles)
  const loadReferenceData = useCallback(async () => {
    try {
      const [driversRes, vehiclesRes] = await Promise.allSettled([
        getFleetDrivers({ limit: 100 }),
        getVehicles({ limit: 100 })
      ]);

      if (driversRes.status === 'fulfilled') {
        const dList = driversRes.value?.data?.drivers || driversRes.value?.data || [];
        setAvailableDrivers(Array.isArray(dList) ? dList : []);
      }
      if (vehiclesRes.status === 'fulfilled') {
        const vList = vehiclesRes.value?.data?.vehicles || vehiclesRes.value?.data || [];
        setAvailableVehicles(Array.isArray(vList) ? vList : []);
      }
    } catch (err) {
      console.warn('Failed loading reference drivers/vehicles:', err);
    }
  }, []);

  // Load Fleet Exceptions (for Exceptions View)
  const loadFleetExceptions = useCallback(async () => {
    try {
      setExceptionsLoading(true);
      const res = await getDispatchExceptions({ status: 'all' });
      const list = res?.data || [];
      setFleetExceptions(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn('Failed loading dispatch exceptions:', err);
    } finally {
      setExceptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    if (viewMode === 'exceptions') {
      loadFleetExceptions();
    }
  }, [viewMode, loadFleetExceptions]);

  // Available trucks vs trailers from vehicle roster
  const trucksList = useMemo(() => {
    return availableVehicles.filter(
      (v) => (v.type || '').toLowerCase() === 'tractor' || (v.type || '').toLowerCase() === 'truck'
    );
  }, [availableVehicles]);

  const trailersList = useMemo(() => {
    return availableVehicles.filter((v) => (v.type || '').toLowerCase() === 'trailer');
  }, [availableVehicles]);

  // Filtering shipments list by search query
  const allShipments = useMemo(() => {
    return boardData?.shipments || [];
  }, [boardData]);

  const filteredShipments = useMemo(() => {
    if (!searchQuery.trim()) return allShipments;
    const q = searchQuery.toLowerCase().trim();
    return allShipments.filter((s) => {
      const ref = (s.reference_number || '').toLowerCase();
      const origin = `${s.origin?.city || ''} ${s.origin?.state || ''}`.toLowerCase();
      const dest = `${s.destination?.city || ''} ${s.destination?.state || ''}`.toLowerCase();
      const carrier = (s.carrier?.legal_name || '').toLowerCase();
      const driver = (s.assigned_driver?.name || '').toLowerCase();
      const truck = (s.assigned_truck?.unit_number || '').toLowerCase();
      return (
        String(s.id).includes(q) ||
        ref.includes(q) ||
        origin.includes(q) ||
        dest.includes(q) ||
        carrier.includes(q) ||
        driver.includes(q) ||
        truck.includes(q)
      );
    });
  }, [allShipments, searchQuery]);

  // Kanban Columns filtered
  const kanbanColumns = useMemo(() => {
    return {
      booked: filteredShipments.filter((s) => s.status === 'booked'),
      dispatched: filteredShipments.filter((s) => s.status === 'dispatched'),
      in_transit: filteredShipments.filter((s) => s.status === 'in_transit'),
      delivered: filteredShipments.filter((s) => s.status === 'delivered')
    };
  }, [filteredShipments]);

  // Grouped by Driver
  const byDriverGroups = useMemo(() => {
    const map = new Map();
    for (const shp of filteredShipments) {
      const key = shp.assigned_driver_id ? `driver_${shp.assigned_driver_id}` : 'unassigned';
      if (!map.has(key)) {
        map.set(key, {
          driver: shp.assigned_driver || null,
          driver_id: shp.assigned_driver_id,
          loads: []
        });
      }
      map.get(key).loads.push(shp);
    }
    return Array.from(map.values());
  }, [filteredShipments]);

  // Summary Metrics
  const summary = useMemo(() => {
    if (boardData?.summary) return boardData.summary;
    return {
      total_loads: allShipments.length,
      booked: allShipments.filter((s) => s.status === 'booked').length,
      dispatched: allShipments.filter((s) => s.status === 'dispatched').length,
      in_transit: allShipments.filter((s) => s.status === 'in_transit').length,
      delivered: allShipments.filter((s) => s.status === 'delivered').length,
      unassigned_booked_loads: allShipments.filter(
        (s) => s.status === 'booked' && !s.assigned_driver_id
      ).length,
      open_exceptions: allShipments.reduce(
        (acc, s) => acc + (s.exception_events?.length || 0),
        0
      )
    };
  }, [boardData, allShipments]);

  // =========================================================================
  // ACTIONS & HANDLERS
  // =========================================================================

  // Open Load Assignment Modal
  const handleOpenAssign = (load) => {
    setAssignModalLoad(load);
    setAssignForm({
      driver_id: load.assigned_driver_id || '',
      truck_id: load.assigned_truck_id || '',
      trailer_id: load.assigned_trailer_id || '',
      special_instructions: ''
    });
    setModalError(null);
  };

  // Submit Load Assignment (FR-6.2 & FR-6.3)
  const handleSubmitAssign = async (e) => {
    e.preventDefault();
    if (!assignModalLoad) return;
    setModalActionBusy(true);
    setModalError(null);

    try {
      const payload = {
        shipment_id: assignModalLoad.id,
        driver_id: Number(assignForm.driver_id),
        truck_id: assignForm.truck_id ? Number(assignForm.truck_id) : undefined,
        trailer_id: assignForm.trailer_id ? Number(assignForm.trailer_id) : undefined,
        special_instructions: assignForm.special_instructions
      };

      const res = await assignDispatch(payload);
      notify?.(res.message || `Load #${assignModalLoad.reference_number} assigned and dispatched!`);
      setAssignModalLoad(null);
      await loadBoard();
    } catch (err) {
      console.error('Assignment failed:', err);
      setModalError(err.message || 'Failed to dispatch load.');
      notify?.(err.message || 'Dispatch failed.');
    } finally {
      setModalActionBusy(false);
    }
  };

  // Open Driver Response Modal (FR-6.4)
  const handleOpenDriverResponse = (load) => {
    setDriverResponseModalLoad(load);
    setDriverResponseForm({
      response: 'accepted',
      rejection_reason: '',
      notes: ''
    });
    setModalError(null);
  };

  // Submit Driver Response (FR-6.4)
  const handleSubmitDriverResponse = async (e) => {
    e.preventDefault();
    if (!driverResponseModalLoad) return;
    setModalActionBusy(true);
    setModalError(null);

    try {
      const payload = {
        shipment_id: driverResponseModalLoad.id,
        response: driverResponseForm.response,
        rejection_reason:
          driverResponseForm.response === 'rejected'
            ? driverResponseForm.rejection_reason
            : undefined,
        notes: driverResponseForm.notes
      };

      const res = await driverResponseDispatch(payload);
      notify?.(
        res.message ||
          `Driver response '${driverResponseForm.response}' recorded for load #${driverResponseModalLoad.reference_number}.`
      );
      setDriverResponseModalLoad(null);
      await loadBoard();
    } catch (err) {
      console.error('Driver response failed:', err);
      setModalError(err.message || 'Failed to submit driver response.');
      notify?.(err.message || 'Driver response failed.');
    } finally {
      setModalActionBusy(false);
    }
  };

  // Open Reassignment Modal (FR-6.7)
  const handleOpenReassign = (load) => {
    setReassignModalLoad(load);
    setReassignForm({
      new_driver_id: '',
      new_truck_id: load.assigned_truck_id || '',
      new_trailer_id: load.assigned_trailer_id || '',
      reason: ''
    });
    setModalError(null);
  };

  // Submit Reassignment (FR-6.7)
  const handleSubmitReassign = async (e) => {
    e.preventDefault();
    if (!reassignModalLoad) return;
    setModalActionBusy(true);
    setModalError(null);

    try {
      const payload = {
        shipment_id: reassignModalLoad.id,
        new_driver_id: Number(reassignForm.new_driver_id),
        new_truck_id: reassignForm.new_truck_id ? Number(reassignForm.new_truck_id) : undefined,
        new_trailer_id: reassignForm.new_trailer_id ? Number(reassignForm.new_trailer_id) : undefined,
        reason: reassignForm.reason
      };

      const res = await reassignDispatch(payload);
      notify?.(res.message || `Load #${reassignModalLoad.reference_number} successfully reassigned!`);
      setReassignModalLoad(null);
      await loadBoard();
    } catch (err) {
      console.error('Reassignment failed:', err);
      setModalError(err.message || 'Failed to reassign load.');
      notify?.(err.message || 'Reassignment failed.');
    } finally {
      setModalActionBusy(false);
    }
  };

  // Open Check-Calls Modal (FR-6.6)
  const handleOpenCheckCalls = async (load) => {
    setCheckCallModalLoad(load);
    setCheckCallForm({
      location: '',
      city: '',
      state: '',
      odometer: load.assigned_truck?.current_odometer || '',
      status: 'on_schedule',
      eta: '',
      note: ''
    });
    setModalError(null);
    setActiveCheckCallsLoading(true);

    try {
      const res = await getCheckCalls(load.id);
      const list = res?.data || [];
      setActiveCheckCalls(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn('Failed loading check calls:', err);
      setActiveCheckCalls([]);
    } finally {
      setActiveCheckCallsLoading(false);
    }
  };

  // Submit Check-Call (FR-6.6)
  const handleSubmitCheckCall = async (e) => {
    e.preventDefault();
    if (!checkCallModalLoad) return;
    setModalActionBusy(true);
    setModalError(null);

    try {
      const payload = {
        location: checkCallForm.location,
        city: checkCallForm.city,
        state: checkCallForm.state,
        odometer: checkCallForm.odometer ? Number(checkCallForm.odometer) : undefined,
        status: checkCallForm.status,
        eta: checkCallForm.eta || undefined,
        note: checkCallForm.note
      };

      const res = await logCheckCall(checkCallModalLoad.id, payload);
      notify?.(res.message || 'Check-call logged successfully.');

      // Refresh check-calls list inside modal
      const refreshedCalls = await getCheckCalls(checkCallModalLoad.id);
      setActiveCheckCalls(refreshedCalls?.data || []);

      // Reset form
      setCheckCallForm((prev) => ({
        ...prev,
        location: '',
        note: '',
        status: 'on_schedule'
      }));

      // Refresh dispatch board
      await loadBoard();
    } catch (err) {
      console.error('Check-call log failed:', err);
      setModalError(err.message || 'Failed to log check-call.');
      notify?.(err.message || 'Check-call failed.');
    } finally {
      setModalActionBusy(false);
    }
  };

  // Open Stop Milestones Modal
  const handleOpenMilestones = (load) => {
    setMilestonesModalLoad(load);
    setModalError(null);
  };

  // Record Stop Arrival Milestone
  const handleRecordStopArrival = async (stopId) => {
    if (!milestonesModalLoad) return;
    setModalActionBusy(true);
    setModalError(null);

    try {
      const res = await recordStopArrival(milestonesModalLoad.id, stopId, {
        notes: 'Stop arrival confirmed by dispatcher/driver'
      });
      notify?.(res.message || 'Stop arrival recorded.');

      // Reload board and update current modal load
      await loadBoard();
      const updatedShipments = await getDispatchBoard({});
      const updatedMatch = updatedShipments?.data?.shipments?.find(
        (s) => s.id === milestonesModalLoad.id
      );
      if (updatedMatch) setMilestonesModalLoad(updatedMatch);
    } catch (err) {
      console.error('Arrival record failed:', err);
      setModalError(err.message || 'Failed to record stop arrival.');
      notify?.(err.message || 'Arrival record failed.');
    } finally {
      setModalActionBusy(false);
    }
  };

  // Record Stop Departure Milestone
  const handleRecordStopDeparture = async (stopId) => {
    if (!milestonesModalLoad) return;
    setModalActionBusy(true);
    setModalError(null);

    try {
      const res = await recordStopDeparture(milestonesModalLoad.id, stopId, {
        notes: 'Stop departure confirmed. Progressing shipment milestone.'
      });
      notify?.(res.message || 'Stop departure recorded.');

      // Reload board and update current modal load
      await loadBoard();
      const updatedShipments = await getDispatchBoard({});
      const updatedMatch = updatedShipments?.data?.shipments?.find(
        (s) => s.id === milestonesModalLoad.id
      );
      if (updatedMatch) setMilestonesModalLoad(updatedMatch);
    } catch (err) {
      console.error('Departure record failed:', err);
      setModalError(err.message || 'Failed to record stop departure.');
      notify?.(err.message || 'Departure record failed.');
    } finally {
      setModalActionBusy(false);
    }
  };

  // Open Exception Reporting Modal
  const handleOpenReportException = (load) => {
    setExceptionModalLoad(load);
    setNewExceptionForm({
      type: 'transit_delay',
      severity: 'medium',
      description: ''
    });
    setModalError(null);
  };

  // Submit New Exception (FR-6.5)
  const handleSubmitException = async (e) => {
    e.preventDefault();
    if (!exceptionModalLoad) return;
    setModalActionBusy(true);
    setModalError(null);

    try {
      const payload = {
        type: newExceptionForm.type,
        severity: newExceptionForm.severity,
        description: newExceptionForm.description
      };

      const res = await createShipmentException(exceptionModalLoad.id, payload);
      notify?.(res.message || 'Operational exception logged successfully.');
      setExceptionModalLoad(null);
      await loadBoard();
      if (viewMode === 'exceptions') loadFleetExceptions();
    } catch (err) {
      console.error('Exception reporting failed:', err);
      setModalError(err.message || 'Failed to report exception.');
      notify?.(err.message || 'Exception log failed.');
    } finally {
      setModalActionBusy(false);
    }
  };

  // Open Resolve Exception Target
  const handleOpenResolveException = (ex) => {
    setResolveExceptionTarget(ex);
    setResolveNotes('');
    setModalError(null);
  };

  // Submit Exception Resolution (FR-6.5)
  const handleSubmitResolveException = async (e) => {
    e.preventDefault();
    if (!resolveExceptionTarget) return;
    setModalActionBusy(true);
    setModalError(null);

    try {
      const payload = {
        resolution_notes: resolveNotes || 'Resolved with operational confirmation'
      };

      const res = await resolveDispatchException(
        resolveExceptionTarget.id,
        payload,
        resolveExceptionTarget.shipment_id || resolveExceptionTarget.shipment?.id
      );
      notify?.(res.message || `Exception #${resolveExceptionTarget.id} marked as resolved.`);
      setResolveExceptionTarget(null);
      await loadBoard();
      if (viewMode === 'exceptions') loadFleetExceptions();
    } catch (err) {
      console.error('Exception resolution failed:', err);
      setModalError(err.message || 'Failed to resolve exception.');
      notify?.(err.message || 'Resolution failed.');
    } finally {
      setModalActionBusy(false);
    }
  };

  // Format Helper
  const formatDate = (val) => {
    if (!val) return 'TBD';
    try {
      return new Date(val).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return String(val);
    }
  };

  const formatDateTime = (val) => {
    if (!val) return 'TBD';
    try {
      return new Date(val).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return String(val);
    }
  };

  // =========================================================================
  // RENDER HELPERS
  // =========================================================================

  const renderCard = (load) => {
    const isBooked = load.status === 'booked';
    const isDispatched = load.status === 'dispatched';
    const isInTransit = load.status === 'in_transit';
    const isDelivered = load.status === 'delivered';

    const latestAssignment = load.dispatch_assignments?.[0] || null;
    const driverResponse = latestAssignment?.driver_response || 'pending';
    const isRcSigned = Boolean(load.rate_confirmation?.signed_at);
    const openExceptionsCount = load.exception_events?.length || 0;

    return (
      <div key={load.id} className="disp-card">
        <div className="disp-card-top">
          <div className="disp-card-ref">#{load.reference_number || load.id}</div>
          <div className="disp-card-rate">
            {load.quote_amount ? `$${Number(load.quote_amount).toLocaleString()}` : 'Agreed'}
          </div>
        </div>

        <div className="disp-card-route">
          <MapPin size={15} color="#2563eb" />
          <span>
            {load.origin?.city || 'Origin'}, {load.origin?.state || ''}
          </span>
          <span className="disp-card-route-arrow">➔</span>
          <span>
            {load.destination?.city || 'Dest'}, {load.destination?.state || ''}
          </span>
        </div>

        <div className="disp-card-dates">
          <div>
            <strong>Pickup:</strong> {formatDate(load.pickup_date)}
          </div>
          <div>
            <strong>Delivery:</strong> {formatDate(load.estimated_delivery)}
          </div>
        </div>

        <div className="disp-card-assignments">
          <div className="disp-assign-row">
            <span style={{ color: '#64748b' }}>Driver:</span>
            {load.assigned_driver ? (
              <span className={`disp-assign-badge driver-${driverResponse}`}>
                {load.assigned_driver.name} ({driverResponse})
              </span>
            ) : (
              <span className="disp-assign-badge" style={{ color: '#dc2626', background: '#fee2e2' }}>
                Unassigned
              </span>
            )}
          </div>
          <div className="disp-assign-row">
            <span style={{ color: '#64748b' }}>Tractor:</span>
            <span>{load.assigned_truck?.unit_number || 'None'}</span>
          </div>
          {load.carrier && (
            <div className="disp-assign-row">
              <span style={{ color: '#64748b' }}>Carrier:</span>
              <span style={{ fontWeight: 600 }}>{load.carrier.legal_name}</span>
            </div>
          )}
        </div>

        <div className="disp-card-badges">
          {isRcSigned ? (
            <span className="disp-badge rc-signed" title="Signed Rate Confirmation">
              <CheckCircle size={12} weight="bold" /> RC Signed
            </span>
          ) : (
            <span className="disp-badge rc-unsigned" title="Unsigned Rate Confirmation">
              <Clock size={12} weight="bold" /> RC Unsigned
            </span>
          )}

          {openExceptionsCount > 0 && (
            <span
              className="disp-badge exception"
              title={`${openExceptionsCount} active exception(s)`}
            >
              <WarningCircle size={12} weight="bold" /> {openExceptionsCount} Exception
              {openExceptionsCount > 1 ? 's' : ''}
            </span>
          )}

          {isDelivered && (
            <span
              className="disp-badge"
              style={{ color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0' }}
              title="Delivery completed, POD verified and automated Net 30 freight invoice generated"
            >
              <CheckCircle size={12} weight="bold" /> Invoiced (Net 30)
            </span>
          )}
        </div>

        <div className="disp-card-actions">
          {isBooked && canAssign && (
            <button
              type="button"
              className="disp-btn-sm primary"
              onClick={() => handleOpenAssign(load)}
              title="Assign Driver & Equipment"
            >
              <Truck size={14} /> Assign Load
            </button>
          )}

          {/* M7 Route Planning & Optimization Actions */}
          {canOptimize && !isDelivered && (
            <button
              type="button"
              className="disp-btn-sm"
              onClick={() => setOptimizeModalLoad(load)}
              title="Optimize Stop Sequence (TSP-TW)"
            >
              <Path size={14} /> Optimize Stops
            </button>
          )}

          {canViewEta && (
            <button
              type="button"
              className="disp-btn-sm"
              onClick={() => setDynamicEtaModalLoad(load)}
              title="Dynamic ETA & Telemetry Analysis"
            >
              <Clock size={14} /> Dynamic ETA
            </button>
          )}

          {canViewDirections && (
            <button
              type="button"
              className="disp-btn-sm"
              onClick={() => setDirectionsModalLoad(load)}
              title="Truck-Legal Turn-by-Turn Directions"
            >
              <NavigationArrow size={14} /> Directions
            </button>
          )}

          {(isDispatched || isInTransit) && (
            <>
              {canDriverResponse && (
                <button
                  type="button"
                  className="disp-btn-sm"
                  onClick={() => handleOpenDriverResponse(load)}
                  title={isDriver ? "Accept / Reject Load Assignment" : "Driver Acceptance / Rejection Status"}
                >
                  <UsersThree size={14} /> {isDriver ? "Accept / Reject" : "Driver Status"}
                </button>
              )}

              <button
                type="button"
                className="disp-btn-sm"
                onClick={() => handleOpenCheckCalls(load)}
                title="Log / View Check-Calls"
              >
                <MapPin size={14} /> Check-Calls
              </button>

              {onNavigateToTracking && (
                <button
                  type="button"
                  className="disp-btn-sm"
                  style={{ color: '#2563eb', fontWeight: 600 }}
                  onClick={() => onNavigateToTracking(load.id)}
                  title="Open Real-Time Tracking, Geofences & Telematics (M8)"
                >
                  <Broadcast size={14} /> Tracking (M8)
                </button>
              )}

              <button
                type="button"
                className="disp-btn-sm"
                onClick={() => handleOpenMilestones(load)}
                title="Stop-level Arrival & Departure Milestones"
              >
                <CalendarCheck size={14} /> Milestones
              </button>

              <button
                type="button"
                className="disp-btn-sm"
                onClick={() => setDocsModalLoad(load)}
                title="Shipment Documents & Compliance"
              >
                <FileText size={14} /> Documents
              </button>

              {canReassign && (
                <button
                  type="button"
                  className="disp-btn-sm danger"
                  onClick={() => handleOpenReassign(load)}
                  title="Reassign Load (Driver Breakdown/Swap)"
                >
                  <ArrowCounterClockwise size={14} /> Reassign
                </button>
              )}
            </>
          )}

          {isDelivered && (
            <button
              type="button"
              className="disp-btn-sm"
              onClick={() => handleOpenMilestones(load)}
              title="View Completed Milestones"
            >
              <CheckCircle size={14} color="#16a34a" /> Completed Stops
            </button>
          )}

          {/* Report Exception Action available on any active load */}
          {!isDelivered && canReportException && (
            <button
              type="button"
              className="disp-btn-sm danger"
              onClick={() => handleOpenReportException(load)}
              title="Report Operational Exception"
            >
              <WarningCircle size={14} /> Flag Issue
            </button>
          )}

          {onNavigateToJob && (
            <button
              type="button"
              className="disp-btn-sm"
              style={{ color: '#4f46e5', borderColor: '#c7d2fe', background: '#eef2ff' }}
              onClick={() => onNavigateToJob({ shipmentId: load.id, jobNumber: load.reference_number })}
              title="View Operational Job & Lifecycle in Job Console"
            >
              <Briefcase size={14} /> Job
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="disp-container">
      {/* Header Row */}
      <div className="disp-header-row">
        <div className="disp-header-title">
          <h1>Dispatch & Execution Management</h1>
          <p>
            Operational dispatch board, load assignments, driver acceptance, check-calls, stop milestones,
            and automated exception handling.
          </p>
        </div>
        <div className="disp-header-actions">
          {canSimulate && (
            <button
              type="button"
              className="disp-btn-sm"
              onClick={() => setShowSimulationModal(true)}
              title="Pre-Dispatch What-If Route Simulation"
            >
              <SlidersHorizontal size={15} />
              <span>Route Simulation</span>
            </button>
          )}

          {canConsolidate && (
            <button
              type="button"
              className="disp-btn-sm"
              onClick={() => setShowConsolidationModal(true)}
              title="Consolidate Multiple Loads on One Truck (LTL)"
            >
              <Truck size={15} />
              <span>Consolidate (LTL)</span>
            </button>
          )}

          <button
            type="button"
            className="disp-btn-sm"
            onClick={loadBoard}
            disabled={loading}
            title="Refresh Board"
          >
            <ArrowsClockwise size={15} className={loading ? 'disp-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Operational Lifecycle Guide Banner for First-Time Users */}
      <div className="fms-workflow-banner">
        <div className="fms-workflow-banner-header">
          <div className="fms-workflow-banner-title">
            <Truck size={16} weight="bold" />
            <span>Harbor Freight Operations Lifecycle</span>
          </div>
          <button
            type="button"
            className="fms-workflow-toggle-btn"
            onClick={() => setShowWorkflowGuide((v) => !v)}
            title={showWorkflowGuide ? "Collapse workflow guide" : "Expand workflow guide"}
          >
            <span>{showWorkflowGuide ? "Hide Guide" : "How Freight Works"}</span>
            {showWorkflowGuide ? <CaretUp size={13} /> : <CaretDown size={13} />}
          </button>
        </div>

        {showWorkflowGuide && (
          <div className="fms-workflow-steps">
            <div className="fms-workflow-step-card completed">
              <span className="fms-step-number">✓</span>
              <div className="fms-step-content">
                <div className="fms-step-label">
                  <span>Order Intake</span>
                  <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>STEP 1</span>
                </div>
                <div className="fms-step-desc">
                  Customer order created in Shipments. Origin, destination, commodity, and dates specified.
                </div>
              </div>
            </div>

            <div className="fms-workflow-step-card completed">
              <span className="fms-step-number">✓</span>
              <div className="fms-step-content">
                <div className="fms-step-label">
                  <span>Capacity Booking</span>
                  <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>STEP 2</span>
                </div>
                <div className="fms-step-desc">
                  Carrier assigned in Bookings with agreed rate. Rate confirmation signed and locked.
                </div>
              </div>
            </div>

            <div className="fms-workflow-step-card current">
              <span className="fms-step-number">3</span>
              <div className="fms-step-content">
                <div className="fms-step-label">
                  <span>Dispatch & Execution</span>
                  <span style={{ fontSize: '10px', color: '#2563eb', fontWeight: 700 }}>STEP 3 (HERE)</span>
                </div>
                <div className="fms-step-desc">
                  Assign qualified driver & tractor. Driver accepts load assignment to move into transit.
                </div>
              </div>
            </div>

            <div className="fms-workflow-step-card">
              <span className="fms-step-number">4</span>
              <div className="fms-step-content">
                <div className="fms-step-label">
                  <span>Milestones & Delivery</span>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>STEP 4</span>
                </div>
                <div className="fms-step-desc">
                  Log in-transit check-calls, record stop arrival/departure milestones, and confirm final delivery.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* KPI Cards Grid */}
      <div className="disp-kpi-grid">
        <div className="disp-kpi-card">
          <div className="disp-kpi-icon blue">
            <Stack />
          </div>
          <div className="disp-kpi-info">
            <span className="disp-kpi-label">Total Active Loads</span>
            <span className="disp-kpi-value">{summary.total_loads || 0}</span>
          </div>
        </div>

        <div className="disp-kpi-card">
          <div className="disp-kpi-icon indigo">
            <CalendarCheck />
          </div>
          <div className="disp-kpi-info">
            <span className="disp-kpi-label">Booked (Ready)</span>
            <span className="disp-kpi-value">{summary.booked || 0}</span>
          </div>
        </div>

        <div className="disp-kpi-card">
          <div className="disp-kpi-icon amber">
            <Truck />
          </div>
          <div className="disp-kpi-info">
            <span className="disp-kpi-label">Dispatched</span>
            <span className="disp-kpi-value">{summary.dispatched || 0}</span>
          </div>
        </div>

        <div className="disp-kpi-card">
          <div className="disp-kpi-icon purple">
            <Path />
          </div>
          <div className="disp-kpi-info">
            <span className="disp-kpi-label">In Transit</span>
            <span className="disp-kpi-value">{summary.in_transit || 0}</span>
          </div>
        </div>

        <div className="disp-kpi-card">
          <div className="disp-kpi-icon green">
            <CheckCircle />
          </div>
          <div className="disp-kpi-info">
            <span className="disp-kpi-label">Delivered</span>
            <span className="disp-kpi-value">{summary.delivered || 0}</span>
          </div>
        </div>

        <div className="disp-kpi-card">
          <div className="disp-kpi-icon rose">
            <WarningCircle />
          </div>
          <div className="disp-kpi-info">
            <span className="disp-kpi-label">Open Exceptions</span>
            <span className="disp-kpi-value" style={{ color: summary.open_exceptions ? '#e11d48' : '#1e293b' }}>
              {summary.open_exceptions || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="disp-toolbar">
        <div className="disp-toolbar-left">
          <div className="disp-search-box">
            <MagnifyingGlass className="disp-search-icon" size={16} />
            <input
              type="text"
              className="disp-search-input"
              placeholder="Search reference, origin, dest, driver..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="disp-filter-group">
            <span className="disp-filter-label">Date:</span>
            <input
              type="date"
              className="disp-date-input"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              title="Filter by Pickup / Delivery Date"
            />
            {dateFilter && (
              <button
                type="button"
                className="disp-btn-sm"
                onClick={() => setDateFilter('')}
                title="Clear date filter"
              >
                Clear
              </button>
            )}
          </div>

          <div className="disp-filter-group">
            <span className="disp-filter-label">Status:</span>
            <select
              className="disp-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Operational</option>
              <option value="booked">Booked</option>
              <option value="dispatched">Dispatched</option>
              <option value="in_transit">In Transit</option>
              <option value="delivered">Delivered</option>
            </select>
          </div>

          <div className="disp-filter-group">
            <span className="disp-filter-label">Driver:</span>
            <select
              className="disp-select"
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
            >
              <option value="all">All Drivers</option>
              {availableDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name || d.user?.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="disp-view-tabs">
          <button
            type="button"
            className={`disp-view-tab ${viewMode === 'kanban' ? 'active' : ''}`}
            onClick={() => setViewMode('kanban')}
          >
            <Stack size={16} /> Kanban
          </button>
          <button
            type="button"
            className={`disp-view-tab ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            <SlidersHorizontal size={16} /> List
          </button>
          <button
            type="button"
            className={`disp-view-tab ${viewMode === 'by_driver' ? 'active' : ''}`}
            onClick={() => setViewMode('by_driver')}
          >
            <UsersThree size={16} /> By Driver
          </button>
          <button
            type="button"
            className={`disp-view-tab ${viewMode === 'exceptions' ? 'active' : ''}`}
            onClick={() => setViewMode('exceptions')}
          >
            <WarningCircle size={16} /> Exceptions ({summary.open_exceptions || 0})
          </button>
        </div>
      </div>

      {/* Main View Area */}
      {loading && !boardData ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
          <ArrowsClockwise size={32} className="disp-spin" style={{ margin: '0 auto 12px' }} />
          <div>Loading dispatch board...</div>
        </div>
      ) : error ? (
        <div className="disp-alert danger">
          <WarningCircle size={20} />
          <div>{error}</div>
        </div>
      ) : viewMode === 'kanban' ? (
        /* ================= KANBAN BOARD VIEW ================= */
        <div className="disp-kanban-board">
          {/* Column 1: Booked */}
          <div className="disp-kanban-col">
            <div className="disp-kanban-col-header">
              <div className="disp-col-title-wrap">
                <span className="disp-col-indicator booked" />
                <span className="disp-col-title">Booked (Ready)</span>
              </div>
              <span className="disp-col-count">{kanbanColumns.booked.length}</span>
            </div>
            <div className="disp-kanban-col-cards">
              {kanbanColumns.booked.length === 0 ? (
                <div className="disp-empty-col">No booked loads ready for dispatch</div>
              ) : (
                kanbanColumns.booked.map((load) => renderCard(load))
              )}
            </div>
          </div>

          {/* Column 2: Dispatched */}
          <div className="disp-kanban-col">
            <div className="disp-kanban-col-header">
              <div className="disp-col-title-wrap">
                <span className="disp-col-indicator dispatched" />
                <span className="disp-col-title">Dispatched</span>
              </div>
              <span className="disp-col-count">{kanbanColumns.dispatched.length}</span>
            </div>
            <div className="disp-kanban-col-cards">
              {kanbanColumns.dispatched.length === 0 ? (
                <div className="disp-empty-col">No active dispatched loads</div>
              ) : (
                kanbanColumns.dispatched.map((load) => renderCard(load))
              )}
            </div>
          </div>

          {/* Column 3: In Transit */}
          <div className="disp-kanban-col">
            <div className="disp-kanban-col-header">
              <div className="disp-col-title-wrap">
                <span className="disp-col-indicator in_transit" />
                <span className="disp-col-title">In Transit</span>
              </div>
              <span className="disp-col-count">{kanbanColumns.in_transit.length}</span>
            </div>
            <div className="disp-kanban-col-cards">
              {kanbanColumns.in_transit.length === 0 ? (
                <div className="disp-empty-col">No loads currently in transit</div>
              ) : (
                kanbanColumns.in_transit.map((load) => renderCard(load))
              )}
            </div>
          </div>

          {/* Column 4: Delivered */}
          <div className="disp-kanban-col">
            <div className="disp-kanban-col-header">
              <div className="disp-col-title-wrap">
                <span className="disp-col-indicator delivered" />
                <span className="disp-col-title">Delivered</span>
              </div>
              <span className="disp-col-count">{kanbanColumns.delivered.length}</span>
            </div>
            <div className="disp-kanban-col-cards">
              {kanbanColumns.delivered.length === 0 ? (
                <div className="disp-empty-col">No completed deliveries for current view</div>
              ) : (
                kanbanColumns.delivered.map((load) => renderCard(load))
              )}
            </div>
          </div>
        </div>
      ) : viewMode === 'list' ? (
        /* ================= OPERATIONAL LIST VIEW ================= */
        <div className="disp-table-card">
          <div className="disp-table-wrapper">
            <table className="disp-table">
              <thead>
                <tr>
                  <th>Shipment</th>
                  <th>Route</th>
                  <th>Pickup / Delivery</th>
                  <th>Carrier</th>
                  <th>Driver & Equipment</th>
                  <th>Status</th>
                  <th>Rate Conf</th>
                  <th>Exceptions</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredShipments.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '36px' }}>
                      No matching shipments found.
                    </td>
                  </tr>
                ) : (
                  filteredShipments.map((s) => {
                    const isRcSigned = Boolean(s.rate_confirmation?.signed_at);
                    const openExCount = s.exception_events?.length || 0;
                    const latestAssignment = s.dispatch_assignments?.[0] || null;
                    const driverResp = latestAssignment?.driver_response || 'pending';

                    return (
                      <tr key={s.id}>
                        <td>
                          <div className="disp-table-ref">#{s.reference_number || s.id}</div>
                          <div style={{ fontSize: '12px', color: '#059669', fontWeight: 600 }}>
                            {s.quote_amount ? `$${Number(s.quote_amount).toLocaleString()}` : ''}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            {s.origin?.city}, {s.origin?.state} ➔ {s.destination?.city},{' '}
                            {s.destination?.state}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '12px' }}>
                            <div>PU: {formatDate(s.pickup_date)}</div>
                            <div>DEL: {formatDate(s.estimated_delivery)}</div>
                          </div>
                        </td>
                        <td>
                          <div className="disp-table-carrier">
                            {s.carrier?.legal_name || 'Unassigned'}
                          </div>
                        </td>
                        <td>
                          {s.assigned_driver ? (
                            <div>
                              <div style={{ fontWeight: 600 }}>{s.assigned_driver.name}</div>
                              <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                                Unit: {s.assigned_truck?.unit_number || 'N/A'} · ({driverResp})
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>Unassigned</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`disp-assign-badge ${
                              s.status === 'delivered'
                                ? 'driver-accepted'
                                : s.status === 'booked'
                                ? 'driver-pending'
                                : 'driver-accepted'
                            }`}
                          >
                            {s.status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          {isRcSigned ? (
                            <span className="disp-badge rc-signed">Signed</span>
                          ) : (
                            <span className="disp-badge rc-unsigned">Pending</span>
                          )}
                        </td>
                        <td>
                          {openExCount > 0 ? (
                            <span className="disp-badge exception">{openExCount} Open</span>
                          ) : (
                            <span style={{ color: '#16a34a', fontSize: '12px' }}>Clear</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {s.status === 'booked' && canAssign && (
                              <button
                                type="button"
                                className="disp-btn-sm primary"
                                onClick={() => handleOpenAssign(s)}
                              >
                                Assign
                              </button>
                            )}

                            {/* M7 Route Planning Actions */}
                            {canOptimize && s.status !== 'delivered' && (
                              <button
                                type="button"
                                className="disp-btn-sm"
                                onClick={() => setOptimizeModalLoad(s)}
                                title="Optimize Stop Sequence (TSP-TW)"
                              >
                                <Path size={13} /> Optimize
                              </button>
                            )}

                            {canViewEta && (
                              <button
                                type="button"
                                className="disp-btn-sm"
                                onClick={() => setDynamicEtaModalLoad(s)}
                                title="Dynamic ETA & Telemetry Analysis"
                              >
                                <Clock size={13} /> ETA
                              </button>
                            )}

                            {canViewDirections && (
                              <button
                                type="button"
                                className="disp-btn-sm"
                                onClick={() => setDirectionsModalLoad(s)}
                                title="Truck-Legal Turn-by-Turn Directions"
                              >
                                <NavigationArrow size={13} /> Route
                              </button>
                            )}

                            {(s.status === 'dispatched' || s.status === 'in_transit') && (
                              <>
                                {canDriverResponse && s.status === 'dispatched' && (
                                  <button
                                    type="button"
                                    className="disp-btn-sm"
                                    onClick={() => handleOpenDriverResponse(s)}
                                    title={isDriver ? "Accept / Reject Load Assignment" : "Driver Response Status"}
                                  >
                                    {isDriver ? "Accept / Reject" : "Response"}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="disp-btn-sm"
                                  onClick={() => handleOpenCheckCalls(s)}
                                >
                                  Check-Calls
                                </button>
                                {onNavigateToTracking && (
                                  <button
                                    type="button"
                                    className="disp-btn-sm"
                                    style={{ color: '#2563eb', fontWeight: 600 }}
                                    onClick={() => onNavigateToTracking(s.id)}
                                    title="Open Real-Time Tracking (M8)"
                                  >
                                    Tracking (M8)
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="disp-btn-sm"
                                  onClick={() => handleOpenMilestones(s)}
                                >
                                  Stops
                                </button>
                              </>
                            )}

                            {s.status === 'delivered' && (
                              <>
                                <button
                                  type="button"
                                  className="disp-btn-sm"
                                  onClick={() => handleOpenMilestones(s)}
                                >
                                  View Stops
                                </button>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    color: '#059669',
                                    background: '#ecfdf5',
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid #a7f3d0',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  title="Delivery completed and automated Net 30 freight invoice generated"
                                >
                                  <Receipt size={12} weight="bold" /> Invoiced
                                </span>
                              </>
                            )}

                            {onNavigateToJob && (
                              <button
                                type="button"
                                className="disp-btn-sm"
                                style={{ color: '#4f46e5', borderColor: '#c7d2fe', background: '#eef2ff' }}
                                onClick={() => onNavigateToJob({ shipmentId: s.id, jobNumber: s.reference_number })}
                                title="View in Job Console"
                              >
                                <Briefcase size={13} /> Job
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode === 'by_driver' ? (
        /* ================= GROUPED BY DRIVER VIEW ================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {byDriverGroups.map((grp) => (
            <div key={grp.driver_id || 'unassigned'} className="disp-table-card">
              <div
                style={{
                  padding: '14px 18px',
                  background: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <UsersThree size={20} color="#2563eb" />
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>
                    {grp.driver ? grp.driver.name : 'Unassigned Loads'}
                  </span>
                  {grp.driver?.phone && (
                    <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                      ({grp.driver.phone})
                    </span>
                  )}
                </div>
                <span className="disp-col-count">{grp.loads.length} Loads</span>
              </div>
              <div
                style={{
                  padding: '16px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '14px'
                }}
              >
                {grp.loads.map((load) => renderCard(load))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ================= FLEET EXCEPTIONS CONSOLE ================= */
        <div className="disp-table-card">
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <h2 style={{ fontSize: '17px', margin: 0, fontWeight: 700 }}>
                Fleet Exceptions & Incident Console
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                Monitors active delays, mechanical breakdowns, driver rejections, and cargo issues across all
                dispatched shipments.
              </p>
            </div>
            <button
              type="button"
              className="disp-btn-sm"
              onClick={loadFleetExceptions}
              disabled={exceptionsLoading}
            >
              <ArrowsClockwise size={14} className={exceptionsLoading ? 'disp-spin' : ''} />
              <span>Refresh Exceptions</span>
            </button>
          </div>

          <div className="disp-table-wrapper">
            <table className="disp-table">
              <thead>
                <tr>
                  <th>Exception ID</th>
                  <th>Shipment</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Description</th>
                  <th>Detected At</th>
                  <th>Status</th>
                  <th>Resolution</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {fleetExceptions.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      No active exceptions recorded. Fleet execution is running on schedule.
                    </td>
                  </tr>
                ) : (
                  fleetExceptions.map((ex) => (
                    <tr key={ex.id}>
                      <td style={{ fontWeight: 700 }}>#{ex.id}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          #{ex.shipment?.reference_number || ex.shipment_id}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                          {ex.shipment?.origin?.city} ➔ {ex.shipment?.destination?.city}
                        </div>
                      </td>
                      <td>
                        <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                          {(ex.type || 'other').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span className={`disp-severity-badge ${ex.severity || 'medium'}`}>
                          {ex.severity || 'medium'}
                        </span>
                      </td>
                      <td style={{ maxWidth: '280px' }}>{ex.description}</td>
                      <td style={{ fontSize: '12px', color: '#64748b' }}>
                        {formatDateTime(ex.detected_at)}
                      </td>
                      <td>
                        <span
                          className={`disp-assign-badge ${
                            ex.status === 'resolved' ? 'driver-accepted' : 'driver-rejected'
                          }`}
                        >
                          {ex.status ? ex.status.toUpperCase() : 'OPEN'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px' }}>
                        {ex.status === 'resolved' ? (
                          <div>
                            <div>{ex.resolution_notes || 'Resolved'}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              By {ex.resolved_by?.name || 'Dispatcher'}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#dc2626' }}>Pending resolution</span>
                        )}
                      </td>
                      <td>
                        {ex.status !== 'resolved' && canResolveException && (
                          <button
                            type="button"
                            className="disp-btn-sm success"
                            onClick={() => handleOpenResolveException(ex)}
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================
          LOAD ASSIGNMENT MODAL (FR-6.2 & FR-6.3)
          =================================================================== */}
      {assignModalLoad && (
        <div className="disp-modal-overlay" onClick={() => setAssignModalLoad(null)}>
          <div className="disp-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="disp-modal-header">
              <div className="disp-modal-title">
                <h2>Assign & Dispatch Load</h2>
                <p>Shipment #{assignModalLoad.reference_number || assignModalLoad.id}</p>
              </div>
              <button
                type="button"
                className="disp-modal-close"
                onClick={() => setAssignModalLoad(null)}
              >
                <X />
              </button>
            </div>

            <form onSubmit={handleSubmitAssign}>
              <div className="disp-modal-body">
                {modalError && (
                  <div className="disp-alert danger">
                    <WarningCircle size={20} />
                    <div>{modalError}</div>
                  </div>
                )}

                {/* Acceptance Criterion B: Signed Rate Confirmation Gate */}
                {!assignModalLoad.rate_confirmation?.signed_at ? (
                  <div className="disp-alert warning">
                    <Clock size={20} />
                    <div>
                      <strong>Rate Confirmation Not Signed:</strong> The carrier rate confirmation must
                      be signed before dispatching this load. Please execute the signature in Bookings
                      before dispatch.
                    </div>
                  </div>
                ) : (
                  <div className="disp-alert success">
                    <CheckCircle size={20} />
                    <div>
                      <strong>Rate Confirmation Signed:</strong> RC #{' '}
                      {assignModalLoad.rate_confirmation.confirmation_number ||
                        assignModalLoad.rate_confirmation.id}{' '}
                      executed. Load is verified for dispatch.
                    </div>
                  </div>
                )}

                <div className="disp-summary-panel">
                  <div className="disp-summary-grid">
                    <div className="disp-summary-item">
                      <span className="disp-summary-item-label">Origin</span>
                      <span className="disp-summary-item-val">
                        {assignModalLoad.origin?.city}, {assignModalLoad.origin?.state}
                      </span>
                    </div>
                    <div className="disp-summary-item">
                      <span className="disp-summary-item-label">Destination</span>
                      <span className="disp-summary-item-val">
                        {assignModalLoad.destination?.city}, {assignModalLoad.destination?.state}
                      </span>
                    </div>
                    <div className="disp-summary-item">
                      <span className="disp-summary-item-label">Carrier</span>
                      <span className="disp-summary-item-val">
                        {assignModalLoad.carrier?.legal_name || 'Assigned Carrier'}
                      </span>
                    </div>
                    <div className="disp-summary-item">
                      <span className="disp-summary-item-label">Pickup Window</span>
                      <span className="disp-summary-item-val">
                        {formatDate(assignModalLoad.pickup_date)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="disp-form-grid">
                  <div className="disp-form-group full">
                    <label className="disp-form-label">
                      Driver <span className="required">*</span>
                    </label>
                    <select
                      required
                      className="disp-modal-select"
                      value={assignForm.driver_id}
                      onChange={(e) => setAssignForm({ ...assignForm, driver_id: e.target.value })}
                    >
                      <option value="">-- Select Qualified Driver --</option>
                      {availableDrivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name || d.user?.name} {d.phone ? `(${d.phone})` : ''} -{' '}
                          {d.driver_profile?.license_class || 'Class A'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="disp-form-group">
                    <label className="disp-form-label">Tractor / Truck</label>
                    <select
                      className="disp-modal-select"
                      value={assignForm.truck_id}
                      onChange={(e) => setAssignForm({ ...assignForm, truck_id: e.target.value })}
                    >
                      <option value="">-- Select Tractor --</option>
                      {trucksList.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.unit_number} ({t.equipment_type || 'Dry Van'}) - {t.status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="disp-form-group">
                    <label className="disp-form-label">Trailer (Optional)</label>
                    <select
                      className="disp-modal-select"
                      value={assignForm.trailer_id}
                      onChange={(e) => setAssignForm({ ...assignForm, trailer_id: e.target.value })}
                    >
                      <option value="">-- Select Trailer --</option>
                      {trailersList.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.unit_number} ({tr.equipment_type || 'Dry Van'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="disp-form-group full">
                    <label className="disp-form-label">Special Dispatch Instructions</label>
                    <textarea
                      className="disp-textarea"
                      placeholder="e.g. Check in at security gate 4; trailer seal required; call receiver 1 hour prior..."
                      value={assignForm.special_instructions}
                      onChange={(e) =>
                        setAssignForm({ ...assignForm, special_instructions: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="disp-modal-footer">
                <button
                  type="button"
                  className="disp-btn-sm"
                  onClick={() => setAssignModalLoad(null)}
                  disabled={modalActionBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="disp-btn-sm primary"
                  disabled={
                    modalActionBusy ||
                    !assignForm.driver_id ||
                    !assignModalLoad.rate_confirmation?.signed_at
                  }
                >
                  {modalActionBusy ? 'Dispatching...' : 'Confirm & Dispatch Load'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================
          DRIVER RESPONSE MODAL (FR-6.4)
          =================================================================== */}
      {driverResponseModalLoad && (
        <div
          className="disp-modal-overlay"
          onClick={() => setDriverResponseModalLoad(null)}
        >
          <div className="disp-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="disp-modal-header">
              <div className="disp-modal-title">
                <h2>Record Driver Load Response</h2>
                <p>
                  Load #{driverResponseModalLoad.reference_number || driverResponseModalLoad.id} · Driver:{' '}
                  {driverResponseModalLoad.assigned_driver?.name}
                </p>
              </div>
              <button
                type="button"
                className="disp-modal-close"
                onClick={() => setDriverResponseModalLoad(null)}
              >
                <X />
              </button>
            </div>

            <form onSubmit={handleSubmitDriverResponse}>
              <div className="disp-modal-body">
                {modalError && (
                  <div className="disp-alert danger">
                    <WarningCircle size={20} />
                    <div>{modalError}</div>
                  </div>
                )}

                <div className="disp-form-group full">
                  <label className="disp-form-label">
                    Response Action <span className="required">*</span>
                  </label>
                  <select
                    className="disp-modal-select"
                    value={driverResponseForm.response}
                    onChange={(e) =>
                      setDriverResponseForm({ ...driverResponseForm, response: e.target.value })
                    }
                  >
                    <option value="accepted">Accept Assigned Load</option>
                    <option value="rejected">Reject Load (Raises High Exception)</option>
                  </select>
                </div>

                {driverResponseForm.response === 'rejected' && (
                  <div className="disp-form-group full">
                    <label className="disp-form-label">
                      Mandatory Rejection Reason <span className="required">*</span>
                    </label>
                    <textarea
                      required
                      className="disp-textarea"
                      placeholder="e.g. HOS driving limits reached on personal ELD log; vehicle issue..."
                      value={driverResponseForm.rejection_reason}
                      onChange={(e) =>
                        setDriverResponseForm({
                          ...driverResponseForm,
                          rejection_reason: e.target.value
                        })
                      }
                    />
                    <small style={{ color: '#dc2626', marginTop: '4px' }}>
                      Rejecting will unbind the driver and create a HIGH-severity exception for the
                      dispatcher.
                    </small>
                  </div>
                )}

                <div className="disp-form-group full">
                  <label className="disp-form-label">Response Notes</label>
                  <input
                    type="text"
                    className="disp-input"
                    placeholder="e.g. Pre-trip inspection completed; ETA on schedule"
                    value={driverResponseForm.notes}
                    onChange={(e) =>
                      setDriverResponseForm({ ...driverResponseForm, notes: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="disp-modal-footer">
                <button
                  type="button"
                  className="disp-btn-sm"
                  onClick={() => setDriverResponseModalLoad(null)}
                  disabled={modalActionBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`disp-btn-sm ${
                    driverResponseForm.response === 'rejected' ? 'danger' : 'primary'
                  }`}
                  disabled={
                    modalActionBusy ||
                    (driverResponseForm.response === 'rejected' &&
                      !driverResponseForm.rejection_reason.trim())
                  }
                >
                  {modalActionBusy
                    ? 'Submitting...'
                    : driverResponseForm.response === 'rejected'
                    ? 'Submit Rejection'
                    : 'Confirm Acceptance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================
          MID-EXECUTION REASSIGNMENT MODAL (FR-6.7)
          =================================================================== */}
      {reassignModalLoad && (
        <div className="disp-modal-overlay" onClick={() => setReassignModalLoad(null)}>
          <div className="disp-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="disp-modal-header">
              <div className="disp-modal-title">
                <h2>Re-dispatch / Reassign Load</h2>
                <p>
                  Shipment #{reassignModalLoad.reference_number || reassignModalLoad.id} · Driver Breakdown
                  / Swap
                </p>
              </div>
              <button
                type="button"
                className="disp-modal-close"
                onClick={() => setReassignModalLoad(null)}
              >
                <X />
              </button>
            </div>

            <form onSubmit={handleSubmitReassign}>
              <div className="disp-modal-body">
                {modalError && (
                  <div className="disp-alert danger">
                    <WarningCircle size={20} />
                    <div>{modalError}</div>
                  </div>
                )}

                <div className="disp-alert warning">
                  <WarningCircle size={20} />
                  <div>
                    Reassigning unbinds the current driver (
                    <strong>{reassignModalLoad.assigned_driver?.name || 'Unassigned'}</strong>) and transfers
                    the load to the replacement driver while preserving all completed stops.
                  </div>
                </div>

                <div className="disp-form-grid">
                  <div className="disp-form-group full">
                    <label className="disp-form-label">
                      Replacement Driver <span className="required">*</span>
                    </label>
                    <select
                      required
                      className="disp-modal-select"
                      value={reassignForm.new_driver_id}
                      onChange={(e) =>
                        setReassignForm({ ...reassignForm, new_driver_id: e.target.value })
                      }
                    >
                      <option value="">-- Select Replacement Driver --</option>
                      {availableDrivers
                        .filter((d) => d.id !== reassignModalLoad.assigned_driver_id)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name || d.user?.name} {d.phone ? `(${d.phone})` : ''}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="disp-form-group">
                    <label className="disp-form-label">Replacement Tractor (Optional)</label>
                    <select
                      className="disp-modal-select"
                      value={reassignForm.new_truck_id}
                      onChange={(e) =>
                        setReassignForm({ ...reassignForm, new_truck_id: e.target.value })
                      }
                    >
                      <option value="">-- Keep Existing Tractor --</option>
                      {trucksList.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.unit_number} ({t.equipment_type || 'Dry Van'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="disp-form-group">
                    <label className="disp-form-label">Replacement Trailer (Optional)</label>
                    <select
                      className="disp-modal-select"
                      value={reassignForm.new_trailer_id}
                      onChange={(e) =>
                        setReassignForm({ ...reassignForm, new_trailer_id: e.target.value })
                      }
                    >
                      <option value="">-- Keep Existing Trailer --</option>
                      {trailersList.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.unit_number}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="disp-form-group full">
                    <label className="disp-form-label">
                      Reassignment Reason <span className="required">*</span>
                    </label>
                    <textarea
                      required
                      className="disp-textarea"
                      placeholder="e.g. Truck alternator breakdown on highway; swapping to relief driver Bob..."
                      value={reassignForm.reason}
                      onChange={(e) =>
                        setReassignForm({ ...reassignForm, reason: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="disp-modal-footer">
                <button
                  type="button"
                  className="disp-btn-sm"
                  onClick={() => setReassignModalLoad(null)}
                  disabled={modalActionBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="disp-btn-sm danger"
                  disabled={
                    modalActionBusy || !reassignForm.new_driver_id || !reassignForm.reason.trim()
                  }
                >
                  {modalActionBusy ? 'Reassigning...' : 'Execute Reassignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================
          CHECK-CALLS & TIMELINE MODAL (FR-6.6)
          =================================================================== */}
      {checkCallModalLoad && (
        <div className="disp-modal-overlay" onClick={() => setCheckCallModalLoad(null)}>
          <div className="disp-modal-box wide" onClick={(e) => e.stopPropagation()}>
            <div className="disp-modal-header">
              <div className="disp-modal-title">
                <h2>Check-Calls & Execution Timeline</h2>
                <p>
                  Shipment #{checkCallModalLoad.reference_number || checkCallModalLoad.id} ·{' '}
                  {checkCallModalLoad.origin?.city} ➔ {checkCallModalLoad.destination?.city}
                </p>
              </div>
              <button
                type="button"
                className="disp-modal-close"
                onClick={() => setCheckCallModalLoad(null)}
              >
                <X />
              </button>
            </div>

            <div className="disp-modal-body">
              {modalError && (
                <div className="disp-alert danger">
                  <WarningCircle size={20} />
                  <div>{modalError}</div>
                </div>
              )}

              {/* Log New Check Call Form */}
              {canLogCheckCall ? (
                <form onSubmit={handleSubmitCheckCall} style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '18px' }}>
                  <h3 style={{ fontSize: '15px', margin: '0 0 12px', fontWeight: 700 }}>
                    Log New Check-Call
                  </h3>
                  <div className="disp-form-grid">
                    <div className="disp-form-group">
                      <label className="disp-form-label">
                        Location / Mile Marker <span className="required">*</span>
                      </label>
                      <input
                        required
                        type="text"
                        className="disp-input"
                        placeholder="e.g. Rest Stop, I-55 South"
                        value={checkCallForm.location}
                        onChange={(e) =>
                          setCheckCallForm({ ...checkCallForm, location: e.target.value })
                        }
                      />
                    </div>

                    <div className="disp-form-group">
                      <label className="disp-form-label">City, State</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          className="disp-input"
                          placeholder="City"
                          value={checkCallForm.city}
                          onChange={(e) =>
                            setCheckCallForm({ ...checkCallForm, city: e.target.value })
                          }
                        />
                        <input
                          type="text"
                          className="disp-input"
                          placeholder="State"
                          style={{ width: '80px' }}
                          value={checkCallForm.state}
                          onChange={(e) =>
                            setCheckCallForm({ ...checkCallForm, state: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="disp-form-group">
                      <label className="disp-form-label">Odometer</label>
                      <input
                        type="number"
                        className="disp-input"
                        placeholder="Miles"
                        value={checkCallForm.odometer}
                        onChange={(e) =>
                          setCheckCallForm({ ...checkCallForm, odometer: e.target.value })
                        }
                      />
                    </div>

                    <div className="disp-form-group">
                      <label className="disp-form-label">Status</label>
                      <select
                        className="disp-modal-select"
                        value={checkCallForm.status}
                        onChange={(e) =>
                          setCheckCallForm({ ...checkCallForm, status: e.target.value })
                        }
                      >
                        <option value="on_schedule">On Schedule</option>
                        <option value="delayed">Delayed</option>
                        <option value="severe_weather_delay">Severe Weather Delay (Auto-Exception)</option>
                        <option value="traffic_delay">Traffic Standstill Delay (Auto-Exception)</option>
                        <option value="breakdown">Mechanical Breakdown (Auto-Exception)</option>
                      </select>
                    </div>

                    <div className="disp-form-group full">
                      <label className="disp-form-label">Notes / Remarks</label>
                      <input
                        type="text"
                        className="disp-input"
                        placeholder="e.g. Routine check-call; fuel stop complete; road conditions clear"
                        value={checkCallForm.note}
                        onChange={(e) =>
                          setCheckCallForm({ ...checkCallForm, note: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <button
                      type="submit"
                      className="disp-btn-sm primary"
                      disabled={modalActionBusy || !checkCallForm.location.trim()}
                    >
                      {modalActionBusy ? 'Logging...' : 'Submit Check-Call'}
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '6px', fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                  Logging check-calls is restricted to assigned drivers and dispatch personnel (View-only mode).
                </div>
              )}

              {/* History Timeline */}
              <div>
                <h3 style={{ fontSize: '15px', margin: '0 0 12px', fontWeight: 700 }}>
                  Recorded Timeline History ({activeCheckCalls.length})
                </h3>
                {activeCheckCallsLoading ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                    Loading history...
                  </div>
                ) : activeCheckCalls.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                    No check-calls logged yet for this shipment.
                  </div>
                ) : (
                  <div className="disp-timeline-list">
                    {activeCheckCalls.map((c) => {
                      const isDelay =
                        c.status !== 'on_schedule' &&
                        (c.status || '').toLowerCase().includes('delay');
                      return (
                        <div key={c.id} className="disp-timeline-item">
                          <div className={`disp-timeline-dot ${isDelay ? 'delay' : ''}`} />
                          <div className="disp-timeline-content">
                            <div className="disp-timeline-header">
                              <span className="disp-timeline-loc">
                                {c.location || [c.city, c.state].filter(Boolean).join(', ')}
                              </span>
                              <span className="disp-timeline-time">
                                {formatDateTime(c.timestamp)}
                              </span>
                            </div>
                            <div className="disp-timeline-meta">
                              Status:{' '}
                              <strong style={{ color: isDelay ? '#ea580c' : '#16a34a' }}>
                                {(c.status || '').replace(/_/g, ' ').toUpperCase()}
                              </strong>
                              {c.odometer ? ` · Odometer: ${Number(c.odometer).toLocaleString()} mi` : ''}
                              {c.logged_by ? ` · Logged by: ${c.logged_by.name}` : ''}
                            </div>
                            {c.note && <div className="disp-timeline-note">{c.note}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="disp-modal-footer">
              <button
                type="button"
                className="disp-btn-sm"
                onClick={() => setCheckCallModalLoad(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          STOP MILESTONES MODAL (PROGRESSION)
          =================================================================== */}
      {milestonesModalLoad && (
        <div className="disp-modal-overlay" onClick={() => setMilestonesModalLoad(null)}>
          <div className="disp-modal-box wide" onClick={(e) => e.stopPropagation()}>
            <div className="disp-modal-header">
              <div className="disp-modal-title">
                <h2>Stop Milestones & Route Progression</h2>
                <p>
                  Shipment #{milestonesModalLoad.reference_number || milestonesModalLoad.id} · Status:{' '}
                  <strong>{milestonesModalLoad.status.toUpperCase()}</strong>
                </p>
              </div>
              <button
                type="button"
                className="disp-modal-close"
                onClick={() => setMilestonesModalLoad(null)}
              >
                <X />
              </button>
            </div>

            <div className="disp-modal-body">
              {modalError && (
                <div className="disp-alert danger">
                  <WarningCircle size={20} />
                  <div>{modalError}</div>
                </div>
              )}

              <div className="disp-alert info">
                <Info size={20} />
                <div>
                  Departing the pickup stop automatically advances the shipment to{' '}
                  <strong>IN TRANSIT</strong>. Departing the final delivery stop advances the shipment to{' '}
                  <strong>DELIVERED</strong>.
                </div>
              </div>

              <div className="disp-stops-list">
                {(!milestonesModalLoad.stops || milestonesModalLoad.stops.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                    No stop records defined for this load.
                  </div>
                ) : (
                  milestonesModalLoad.stops.map((stop, idx) => {
                    const isArrived = stop.status === 'arrived';
                    const isDeparted = stop.status === 'departed';
                    const isPending = stop.status === 'pending';

                    return (
                      <div
                        key={stop.id}
                        className={`disp-stop-card ${isDeparted ? 'departed' : isArrived ? 'arrived' : ''}`}
                      >
                        <div className="disp-stop-left">
                          <div className="disp-stop-seq">{stop.sequence || idx + 1}</div>
                          <div className="disp-stop-info">
                            <div className="disp-stop-title">
                              <span className="disp-stop-type">
                                {stop.type ? stop.type.toUpperCase() : 'STOP'}
                              </span>
                              <span
                                className={`disp-assign-badge ${
                                  isDeparted
                                    ? 'driver-accepted'
                                    : isArrived
                                    ? 'driver-pending'
                                    : ''
                                }`}
                              >
                                {stop.status.toUpperCase()}
                              </span>
                            </div>

                            <div className="disp-stop-address">
                              {stop.address?.line1 || ''} {stop.address?.city}, {stop.address?.state}{' '}
                              {stop.address?.zip || ''}
                            </div>

                            <div className="disp-stop-times">
                              {stop.arrived_at && (
                                <span>
                                  <strong>Arrived:</strong> {formatDateTime(stop.arrived_at)}
                                </span>
                              )}
                              {stop.departed_at && (
                                <span>
                                  <strong>Departed:</strong> {formatDateTime(stop.departed_at)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {isPending && (
                            <button
                              type="button"
                              className="disp-btn-sm primary"
                              onClick={() => handleRecordStopArrival(stop.id)}
                              disabled={modalActionBusy}
                            >
                              <MapPin size={14} /> Record Arrive
                            </button>
                          )}

                          {isArrived && (
                            <button
                              type="button"
                              className="disp-btn-sm success"
                              onClick={() => handleRecordStopDeparture(stop.id)}
                              disabled={modalActionBusy}
                            >
                              <CheckCircle size={14} /> Record Depart
                            </button>
                          )}

                          {isDeparted && (
                            <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '13px' }}>
                              ✓ Completed
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="disp-modal-footer">
              <button
                type="button"
                className="disp-btn-sm"
                onClick={() => setMilestonesModalLoad(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          FLAG EXCEPTION MODAL (FR-6.5)
          =================================================================== */}
      {exceptionModalLoad && (
        <div className="disp-modal-overlay" onClick={() => setExceptionModalLoad(null)}>
          <div className="disp-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="disp-modal-header">
              <div className="disp-modal-title">
                <h2>Raise Operational Exception</h2>
                <p>Shipment #{exceptionModalLoad.reference_number || exceptionModalLoad.id}</p>
              </div>
              <button
                type="button"
                className="disp-modal-close"
                onClick={() => setExceptionModalLoad(null)}
              >
                <X />
              </button>
            </div>

            <form onSubmit={handleSubmitException}>
              <div className="disp-modal-body">
                {modalError && (
                  <div className="disp-alert danger">
                    <WarningCircle size={20} />
                    <div>{modalError}</div>
                  </div>
                )}

                <div className="disp-form-grid">
                  <div className="disp-form-group">
                    <label className="disp-form-label">
                      Exception Type <span className="required">*</span>
                    </label>
                    <select
                      className="disp-modal-select"
                      value={newExceptionForm.type}
                      onChange={(e) =>
                        setNewExceptionForm({ ...newExceptionForm, type: e.target.value })
                      }
                    >
                      <option value="transit_delay">Transit Delay</option>
                      <option value="late_pickup">Late Pickup</option>
                      <option value="late_delivery">Late Delivery</option>
                      <option value="cargo_damage">Cargo Damage</option>
                      <option value="mechanical_breakdown">Mechanical Breakdown</option>
                      <option value="weather_delay">Severe Weather</option>
                      <option value="other">Other Operational Incident</option>
                    </select>
                  </div>

                  <div className="disp-form-group">
                    <label className="disp-form-label">Severity Level</label>
                    <select
                      className="disp-modal-select"
                      value={newExceptionForm.severity}
                      onChange={(e) =>
                        setNewExceptionForm({ ...newExceptionForm, severity: e.target.value })
                      }
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>

                  <div className="disp-form-group full">
                    <label className="disp-form-label">
                      Incident Description <span className="required">*</span>
                    </label>
                    <textarea
                      required
                      className="disp-textarea"
                      placeholder="Describe the operational incident or delay in detail..."
                      value={newExceptionForm.description}
                      onChange={(e) =>
                        setNewExceptionForm({ ...newExceptionForm, description: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="disp-modal-footer">
                <button
                  type="button"
                  className="disp-btn-sm"
                  onClick={() => setExceptionModalLoad(null)}
                  disabled={modalActionBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="disp-btn-sm danger"
                  disabled={modalActionBusy || !newExceptionForm.description.trim()}
                >
                  {modalActionBusy ? 'Logging...' : 'Raise Exception'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================
          RESOLVE EXCEPTION MODAL (FR-6.5)
          =================================================================== */}
      {resolveExceptionTarget && (
        <div className="disp-modal-overlay" onClick={() => setResolveExceptionTarget(null)}>
          <div className="disp-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="disp-modal-header">
              <div className="disp-modal-title">
                <h2>Resolve Exception #{resolveExceptionTarget.id}</h2>
                <p>
                  Type: {(resolveExceptionTarget.type || 'Issue').replace(/_/g, ' ')} · Severity:{' '}
                  {resolveExceptionTarget.severity}
                </p>
              </div>
              <button
                type="button"
                className="disp-modal-close"
                onClick={() => setResolveExceptionTarget(null)}
              >
                <X />
              </button>
            </div>

            <form onSubmit={handleSubmitResolveException}>
              <div className="disp-modal-body">
                {modalError && (
                  <div className="disp-alert danger">
                    <WarningCircle size={20} />
                    <div>{modalError}</div>
                  </div>
                )}

                <div className="disp-summary-panel">
                  <div style={{ fontWeight: 600, color: '#334155' }}>
                    Incident Description:
                  </div>
                  <div style={{ color: '#0f172a' }}>
                    {resolveExceptionTarget.description || 'No description provided.'}
                  </div>
                </div>

                <div className="disp-form-group full">
                  <label className="disp-form-label">
                    Resolution Notes & Root Cause Fix <span className="required">*</span>
                  </label>
                  <textarea
                    required
                    className="disp-textarea"
                    placeholder="e.g. Relief driver assigned, pallet re-wrapped, shipper authorized delay..."
                    value={resolveNotes}
                    onChange={(e) => setResolveNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="disp-modal-footer">
                <button
                  type="button"
                  className="disp-btn-sm"
                  onClick={() => setResolveExceptionTarget(null)}
                  disabled={modalActionBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="disp-btn-sm success"
                  disabled={modalActionBusy || !resolveNotes.trim()}
                >
                  {modalActionBusy ? 'Resolving...' : 'Confirm Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================
          MODULE M7: ROUTE PLANNING & OPTIMIZATION MODALS (FR-7.1 - FR-7.6)
          =================================================================== */}
      {optimizeModalLoad && (
        <OptimizeRouteModal
          isOpen={Boolean(optimizeModalLoad)}
          onClose={() => setOptimizeModalLoad(null)}
          load={optimizeModalLoad}
          notify={notify}
          onSuccess={loadBoard}
        />
      )}

      {directionsModalLoad && (
        <TruckDirectionsModal
          isOpen={Boolean(directionsModalLoad)}
          onClose={() => setDirectionsModalLoad(null)}
          load={directionsModalLoad}
          notify={notify}
        />
      )}

      {dynamicEtaModalLoad && (
        <DynamicEtaModal
          isOpen={Boolean(dynamicEtaModalLoad)}
          onClose={() => setDynamicEtaModalLoad(null)}
          load={dynamicEtaModalLoad}
          notify={notify}
        />
      )}

      {showSimulationModal && (
        <RouteSimulationModal
          isOpen={showSimulationModal}
          onClose={() => setShowSimulationModal(false)}
          loads={allShipments}
          availableDrivers={availableDrivers}
          availableVehicles={availableVehicles}
          notify={notify}
        />
      )}

      {showConsolidationModal && (
        <LtlConsolidationModal
          isOpen={showConsolidationModal}
          onClose={() => setShowConsolidationModal(false)}
          loads={allShipments}
          availableVehicles={availableVehicles}
          notify={notify}
        />
      )}

      {/* Module M10 Documents Modal */}
      {docsModalLoad && (
        <div className="disp-modal-overlay" onClick={() => setDocsModalLoad(null)}>
          <div className="disp-modal-box wide" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '980px', width: '100%' }}>
            <div className="disp-modal-header">
              <div className="disp-modal-title">
                <h2>Shipment Documents & Compliance</h2>
                <p>
                  Shipment #{docsModalLoad.reference_number || docsModalLoad.id} · BOL, Rate Confirmation, POD, and legal signatures
                </p>
              </div>
              <button
                type="button"
                className="disp-modal-close"
                onClick={() => setDocsModalLoad(null)}
              >
                <X />
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', maxHeight: '78vh' }}>
              <DocumentsPanel
                shipmentId={docsModalLoad.id}
                shipment={docsModalLoad}
                hasPermission={hasPermission}
                role={currentRoleName}
                currentUser={currentUser}
                notify={notify}
                onClose={() => setDocsModalLoad(null)}
              />
            </div>

            <div className="disp-modal-footer">
              <button
                type="button"
                className="disp-btn-sm"
                onClick={() => setDocsModalLoad(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

