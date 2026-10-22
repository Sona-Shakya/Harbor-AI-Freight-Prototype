import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Truck,
  Boat,
  AirplaneTilt,
  Train,
  Plus,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  WarningCircle,
  Clock,
  CurrencyDollar,
  FileText,
  Trash,
  X,
  MagnifyingGlass,
  ArrowClockwise,
  CaretRight,
  CaretDown,
  CaretUp,
  MapPin,
  Buildings,
  User,
  Phone,
  EnvelopeSimple,
  Eye,
  NotePencil,
  Info,
  Check,
  Tag,
  Broadcast,
  Receipt,
  DownloadSimple,
  CalendarBlank,
  ArrowsClockwise,
  Path,
  Briefcase
} from '@phosphor-icons/react';
import {
  getShipments,
  getShipment,
  createShipment,
  updateShipment,
  updateShipmentStatus,
  cancelShipment,
  addShipmentStop,
  getCustomers,
  getVendors,
  getPorts,
  getCfsStations,
} from './api';
import './styles/bookingManagement.css';

const FREIGHT_MODES = [
  { id: 'inland', name: 'Inland / Road', icon: Truck },
  { id: 'ocean', name: 'Ocean Freight', icon: Boat },
  { id: 'air', name: 'Air Cargo', icon: AirplaneTilt },
  { id: 'rail', name: 'Rail Intermodal', icon: Train },
];

const EQUIPMENT_TYPES = [
  '53ft Dry Van',
  '53ft Reefer (Refrigerated)',
  'Flatbed / Stepdeck',
  '40ft Standard Ocean Container',
  '40ft High Cube Container',
  '20ft Standard Ocean Container',
  'Air Cargo ULD Container',
  'Box Truck / Straight Truck',
  'Sprinter Van / Hotshot',
  'Rail Boxcar',
];

export default function ShipmentManagement({
  hasPermission = () => true,
  notify = () => {},
  profileLoading = false,
  currentUser = null,
  currentRoleName = '',
  currentOrg = null,
  initialRecords = [],
  initialStatusFilter = 'all',
  autoOpenCreate = false,
  onNavigateToBooking = null,
  onNavigateToDispatch = null,
  onNavigateToQuote = null,
  onNavigateToLoadBoard = null,
  onNavigateToJob = null,
}) {
  // Operational Workflow Guide Display Toggle
  const [showWorkflowGuide, setShowWorkflowGuide] = useState(true);

  // State: Listing & Master Data
  const [shipmentsList, setShipmentsList] = useState([]);
  const [customersList, setCustomersList] = useState([]);
  const [vendorsList, setVendorsList] = useState([]);
  const [portsList, setPortsList] = useState([]);
  const [cfsList, setCfsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorNotice, setErrorNotice] = useState('');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'all');

  // Modals & Drawers
  const [isFormOpen, setIsFormOpen] = useState(Boolean(autoOpenCreate));
  const [editingShipment, setEditingShipment] = useState(null);
  const [detailShipment, setDetailShipment] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [closingShipment, setClosingShipment] = useState(false);
  const [cancelModalShipment, setCancelModalShipment] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [addStopShipment, setAddStopShipment] = useState(null);

  // Form State
  const initialFormState = {
    shipper_org_id: '',
    reference_number: '',
    mode: 'inland',
    equipment_type: '53ft Dry Van',
    service_type: 'Standard Truckload',
    
    // Origin
    origin_address: '',
    origin_city: '',
    origin_state: '',
    origin_zip: '',
    origin_country: 'USA',
    pickup_date: '',

    // Destination
    destination_address: '',
    destination_city: '',
    destination_state: '',
    destination_zip: '',
    destination_country: 'USA',
    delivery_date: '',

    // Cargo & Items
    commodity: '',
    package_type: 'Pallets',
    quantity: '1',
    weight: '',
    weight_unit: 'lbs',
    volume: '',
    is_hazardous: false,
    temperature_controlled: false,
    temp_min: '',
    temp_max: '',

    // Customer References
    po_number: '',
    bol_number: '',
    special_instructions: '',
  };

  const [form, setForm] = useState(initialFormState);
  const [formErrors, setFormErrors] = useState({});
  const [formStep, setFormStep] = useState(1); // 1: Order & Parties, 2: Route & Stops, 3: Cargo & Equipment

  // New Stop Form State
  const [newStopData, setNewStopData] = useState({
    type: 'pickup',
    facility_name: '',
    address: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'USA',
    scheduled_arrival: '',
    special_instructions: '',
  });

  // Permissions
  const isPlatformAdmin = currentRoleName === 'Platform Admin';
  const checkPerm = (mod, act) => (typeof hasPermission === 'function' ? hasPermission(mod, act) : false);
  const canCreate = !profileLoading && (isPlatformAdmin || checkPerm('shipments', 'create'));
  const canUpdate = !profileLoading && (isPlatformAdmin || checkPerm('shipments', 'update'));
  const canCancel = !profileLoading && (isPlatformAdmin || checkPerm('shipments', 'update') || checkPerm('shipments', 'cancel'));

  // Load Data
  const loadData = async () => {
    try {
      setLoading(true);
      setErrorNotice('');

      const [shipmentsRes, customersRes, vendorsRes, portsRes, cfsRes] =
        await Promise.allSettled([
          getShipments({ limit: 100 }),
          getCustomers(),
          getVendors(),
          getPorts(),
          getCfsStations(),
        ]);

      if (shipmentsRes.status === 'fulfilled' && shipmentsRes.value) {
        const list = Array.isArray(shipmentsRes.value)
          ? shipmentsRes.value
          : shipmentsRes.value?.data || shipmentsRes.value?.shipments || [];
        setShipmentsList(list);
      } else {
        setShipmentsList(initialRecords || []);
      }

      if (customersRes.status === 'fulfilled' && customersRes.value) {
        const custs = Array.isArray(customersRes.value)
          ? customersRes.value
          : customersRes.value?.data || customersRes.value?.customers || [];
        setCustomersList(custs);
      }

      if (vendorsRes.status === 'fulfilled' && vendorsRes.value) {
        const vends = Array.isArray(vendorsRes.value)
          ? vendorsRes.value
          : vendorsRes.value?.data || vendorsRes.value?.vendors || [];
        setVendorsList(vends);
      }

      if (portsRes.status === 'fulfilled' && portsRes.value) {
        const ports = Array.isArray(portsRes.value)
          ? portsRes.value
          : portsRes.value?.data || portsRes.value?.ports || [];
        setPortsList(ports);
      }

      if (cfsRes.status === 'fulfilled' && cfsRes.value) {
        const cfs = Array.isArray(cfsRes.value)
          ? cfsRes.value
          : cfsRes.value?.data || cfsRes.value?.cfs || [];
        setCfsList(cfs);
      }
    } catch (err) {
      console.error('Failed to load shipment orders data:', err);
      setErrorNotice('Could not connect to backend. Showing local records.');
      setShipmentsList(initialRecords || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentOrg]);

  // Handle open create form
  const handleOpenCreate = () => {
    const timeCode = Math.floor(1000 + Math.random() * 9000);
    setForm({
      ...initialFormState,
      reference_number: `SHP-${new Date().getFullYear()}-${timeCode}`,
      shipper_org_id: currentOrg?.id || (customersList[0]?.id || ''),
    });
    setEditingShipment(null);
    setFormErrors({});
    setFormStep(1);
    setIsFormOpen(true);
  };

  // Handle edit shipment
  const handleOpenEdit = async (shipment) => {
    try {
      setLoading(true);
      const res = await getShipment(shipment.id);
      const details = res?.data || res || shipment;
      const freight = details.freight_details || {};
      const origin = details.origin || {};
      const destination = details.destination || {};
      const firstItem = Array.isArray(details.items) && details.items[0] ? details.items[0] : {};
      const poRef = Array.isArray(details.references) ? details.references.find(r => r.type === 'PO')?.value : '';
      const bolRef = Array.isArray(details.references) ? details.references.find(r => r.type === 'BOL')?.value : '';

      setForm({
        shipper_org_id: details.shipper_org_id || details.shipper?.id || '',
        reference_number: details.reference_number || `SHP-${details.id}`,
        mode: freight.mode || 'inland',
        equipment_type: freight.equipment_type || '53ft Dry Van',
        service_type: freight.service_type || 'Standard Truckload',
        
        origin_address: origin.address || origin.address_line1 || '',
        origin_city: origin.city || '',
        origin_state: origin.state || '',
        origin_zip: origin.postal_code || origin.zip || '',
        origin_country: origin.country || 'USA',
        pickup_date: details.pickup_date ? new Date(details.pickup_date).toISOString().slice(0, 10) : '',

        destination_address: destination.address || destination.address_line1 || '',
        destination_city: destination.city || '',
        destination_state: destination.state || '',
        destination_zip: destination.postal_code || destination.zip || '',
        destination_country: destination.country || 'USA',
        delivery_date: details.estimated_delivery ? new Date(details.estimated_delivery).toISOString().slice(0, 10) : '',

        commodity: firstItem.description || freight.commodity || '',
        package_type: freight.package_type || 'Pallets',
        quantity: String(firstItem.quantity || freight.quantity || 1),
        weight: String(firstItem.weight || freight.weight || ''),
        weight_unit: freight.weight_unit || 'lbs',
        volume: String(freight.volume || ''),
        is_hazardous: Boolean(freight.is_hazardous),
        temperature_controlled: Boolean(freight.temperature_controlled),
        temp_min: freight.temp_min || '',
        temp_max: freight.temp_max || '',

        po_number: poRef || '',
        bol_number: bolRef || '',
        special_instructions: details.notes || '',
      });
      setEditingShipment(details);
      setFormErrors({});
      setFormStep(1);
      setIsFormOpen(true);
    } catch (err) {
      console.error('Failed to load shipment details:', err);
      notify('Could not load complete shipment details.');
    } finally {
      setLoading(false);
    }
  };

  // Handle open full detail modal with real backend records
  const handleOpenDetail = async (shipment) => {
    setDetailShipment(shipment);
    if (!shipment || !shipment.id) return;
    try {
      setLoadingDetail(true);
      const res = await getShipment(shipment.id);
      const details = res?.data || res;
      if (details && details.id === shipment.id) {
        setDetailShipment(details);
      }
    } catch (err) {
      console.error('Failed to load full shipment details:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Handle close delivered shipment
  const handleCloseShipment = async (shipmentId) => {
    try {
      setClosingShipment(true);
      await updateShipmentStatus(shipmentId, {
        status: 'closed',
        notes: 'Final delivery milestones validated and invoice issued. Shipment formally closed.'
      });
      if (notify) notify('Shipment closed and finalized successfully.', 'success');
      const res = await getShipment(shipmentId);
      const details = res?.data || res;
      setDetailShipment(details);
      loadData();
    } catch (err) {
      console.error('Failed to close shipment:', err);
      if (notify) notify(err.message || 'Failed to close shipment', 'error');
    } finally {
      setClosingShipment(false);
    }
  };

  // Validate form steps
  const validateStep = (step) => {
    const errors = {};
    if (step === 1) {
      if (!form.shipper_org_id) errors.shipper_org_id = 'Shipper organization is required.';
      if (!form.reference_number?.trim()) errors.reference_number = 'Shipment reference is required.';
    } else if (step === 2) {
      if (!form.origin_city?.trim()) errors.origin_city = 'Origin city is required.';
      if (!form.destination_city?.trim()) errors.destination_city = 'Destination city is required.';
      if (!form.pickup_date) errors.pickup_date = 'Pickup date is required.';
    } else if (step === 3) {
      if (!form.commodity?.trim()) errors.commodity = 'Commodity / cargo description is required.';
      if (!form.weight || Number(form.weight) <= 0) errors.weight = 'Valid cargo weight is required.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Shipment Form
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!validateStep(formStep)) return;

    try {
      setSubmitting(true);
      const payload = {
        shipper_org_id: Number(form.shipper_org_id),
        reference_number: form.reference_number.trim(),
        origin: {
          address: form.origin_address,
          city: form.origin_city,
          state: form.origin_state,
          postal_code: form.origin_zip,
          country: form.origin_country,
        },
        destination: {
          address: form.destination_address,
          city: form.destination_city,
          state: form.destination_state,
          postal_code: form.destination_zip,
          country: form.destination_country,
        },
        pickup_date: form.pickup_date ? new Date(form.pickup_date).toISOString() : undefined,
        estimated_delivery: form.delivery_date ? new Date(form.delivery_date).toISOString() : undefined,
        freight_details: {
          mode: form.mode,
          equipment_type: form.equipment_type,
          service_type: form.service_type,
          commodity: form.commodity,
          package_type: form.package_type,
          weight: Number(form.weight) || 0,
          weight_unit: form.weight_unit,
          volume: form.volume ? Number(form.volume) : undefined,
          is_hazardous: form.is_hazardous,
          temperature_controlled: form.temperature_controlled,
          temp_min: form.temp_min,
          temp_max: form.temp_max,
        },
        items: [
          {
            description: form.commodity.trim(),
            quantity: Number(form.quantity) || 1,
            weight: Number(form.weight) || 0,
          },
        ],
        references: [
          ...(form.po_number ? [{ type: 'PO', value: form.po_number.trim() }] : []),
          ...(form.bol_number ? [{ type: 'BOL', value: form.bol_number.trim() }] : []),
        ],
        notes: form.special_instructions || 'Created via Shipment Orders & Cargo Management',
      };

      if (editingShipment && editingShipment.id) {
        await updateShipment(editingShipment.id, payload);
        notify(`Shipment ${form.reference_number} updated successfully!`);
      } else {
        await createShipment(payload);
        notify(`Shipment order ${form.reference_number} created in draft status and ready for booking!`);
      }

      setIsFormOpen(false);
      await loadData();
    } catch (err) {
      console.error('Shipment save error:', err);
      notify(err.message || 'Failed to save shipment order. Please check inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  // Add Stop
  const handleAddStopSubmit = async (e) => {
    e.preventDefault();
    if (!addStopShipment) return;
    try {
      setSubmitting(true);
      await addShipmentStop(addStopShipment.id, {
        type: newStopData.type,
        address: {
          facility_name: newStopData.facility_name,
          address: newStopData.address,
          city: newStopData.city,
          state: newStopData.state,
          postal_code: newStopData.postal_code,
          country: newStopData.country,
        },
        arrival_time: newStopData.scheduled_arrival ? new Date(newStopData.scheduled_arrival).toISOString() : undefined,
        special_instructions: newStopData.special_instructions,
      });
      notify(`Stop added to shipment #${addStopShipment.reference_number || addStopShipment.id}`);
      setAddStopShipment(null);
      await loadData();
    } catch (err) {
      console.error('Add stop error:', err);
      notify(err.message || 'Failed to add stop to shipment.');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel Shipment
  const handleConfirmCancel = async () => {
    if (!cancelModalShipment) return;
    try {
      setSubmitting(true);
      await cancelShipment(cancelModalShipment.id, {
        reason: cancelReason || 'Order cancelled by user',
      });
      notify(`Shipment #${cancelModalShipment.reference_number || cancelModalShipment.id} cancelled.`);
      setCancelModalShipment(null);
      setCancelReason('');
      await loadData();
    } catch (err) {
      console.error('Cancel shipment error:', err);
      notify(err.message || 'Failed to cancel shipment.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered shipments
  const filteredShipments = useMemo(() => {
    return shipmentsList.filter((s) => {
      const mode = (s.freight_details?.mode || s.mode || 'inland').toLowerCase();
      if (modeFilter !== 'all' && mode !== modeFilter) return false;

      const status = (s.status || 'draft').toLowerCase();
      if (statusFilter === 'unbooked') {
        if (!['draft', 'quoted'].includes(status)) return false;
      } else if (statusFilter !== 'all' && status !== statusFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const ref = (s.reference_number || s.reference || `#${s.id}`).toLowerCase();
        const shipper = (s.shipper?.legal_name || s.name || '').toLowerCase();
        const originCity = typeof s.origin === 'object' ? (s.origin?.city || '').toLowerCase() : (s.origin || '').toLowerCase();
        const destCity = typeof s.destination === 'object' ? (s.destination?.city || '').toLowerCase() : (s.destination || '').toLowerCase();
        const commodity = (s.freight_details?.commodity || s.items?.[0]?.description || '').toLowerCase();

        return ref.includes(q) || shipper.includes(q) || originCity.includes(q) || destCity.includes(q) || commodity.includes(q);
      }

      return true;
    });
  }, [shipmentsList, modeFilter, statusFilter, searchQuery]);

  // KPI Calculations
  const kpiStats = useMemo(() => {
    const total = shipmentsList.length;
    const unbooked = shipmentsList.filter((s) => ['draft', 'quoted'].includes((s.status || 'draft').toLowerCase())).length;
    const booked = shipmentsList.filter((s) => ['booked', 'dispatched'].includes((s.status || '').toLowerCase())).length;
    const inTransit = shipmentsList.filter((s) => (s.status || '').toLowerCase() === 'in_transit').length;
    return { total, unbooked, booked, inTransit };
  }, [shipmentsList]);

  return (
    <div className="bk-container">
      {/* Header */}
      <div className="bk-header-row">
        <div className="bk-header-title">
          <h1>Freight Orders & Shipments</h1>
          <p>
            Central workspace for managing cargo requirements, shipper purchase orders, multi-stop routes, and booking readiness.
          </p>
        </div>
        <div className="bk-header-actions">
          <button
            type="button"
            className="bk-btn secondary"
            onClick={loadData}
            disabled={loading}
            title="Refresh shipments"
          >
            <ArrowClockwise size={16} />
            <span>Refresh</span>
          </button>
          {canCreate && (
            <button
              type="button"
              className="bk-btn primary"
              onClick={handleOpenCreate}
            >
              <Plus size={18} weight="bold" />
              <span>New Shipment Order</span>
            </button>
          )}
        </div>
      </div>

      {errorNotice && (
        <div className="bk-alert warning" role="alert">
          <WarningCircle size={18} />
          <span>{errorNotice}</span>
        </div>
      )}

      {/* Operational Lifecycle Guide Banner for First-Time Users */}
      <div className="fms-workflow-banner">
        <div className="fms-workflow-banner-header">
          <div className="fms-workflow-banner-title">
            <Path size={16} weight="bold" />
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
            <div className="fms-workflow-step-card current">
              <span className="fms-step-number">1</span>
              <div className="fms-step-content">
                <div className="fms-step-label">
                  <span>Order Intake</span>
                  <span style={{ fontSize: '10px', color: '#2563eb', fontWeight: 700 }}>STEP 1</span>
                </div>
                <div className="fms-step-desc">
                  Shipper creates freight order with commodity, weight, and route. Status: <strong>Draft (Unbooked)</strong>.
                </div>
              </div>
            </div>

            <div className="fms-workflow-step-card">
              <span className="fms-step-number">2</span>
              <div className="fms-step-content">
                <div className="fms-step-label">
                  <span>Capacity Booking</span>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>STEP 2</span>
                </div>
                <div className="fms-step-desc">
                  Carrier assigned in Bookings with agreed rate & Rate Confirmation signed. Status: <strong>Booked</strong>.
                </div>
              </div>
            </div>

            <div className="fms-workflow-step-card">
              <span className="fms-step-number">3</span>
              <div className="fms-step-content">
                <div className="fms-step-label">
                  <span>Dispatch & Assignment</span>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>STEP 3</span>
                </div>
                <div className="fms-step-desc">
                  Driver & tractor assigned; driver accepts load assignment. Status: <strong>Dispatched</strong>.
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
                  En-route check-calls, stop arrival/departure milestones, and delivery POD. Status: <strong>In Transit ➔ Delivered</strong>.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* KPI Summary Cards */}
      <div className="bk-kpi-grid">
        <div className="bk-kpi-card">
          <div className="bk-kpi-icon blue">
            <Package />
          </div>
          <div className="bk-kpi-info">
            <span className="bk-kpi-label">Total Freight Orders</span>
            <span className="bk-kpi-value">{kpiStats.total}</span>
          </div>
        </div>

        <div className="bk-kpi-card">
          <div className="bk-kpi-icon amber">
            <Clock />
          </div>
          <div className="bk-kpi-info">
            <span className="bk-kpi-label">Unbooked (Awaiting Carrier)</span>
            <span className="bk-kpi-value">{kpiStats.unbooked}</span>
          </div>
        </div>

        <div className="bk-kpi-card">
          <div className="bk-kpi-icon green">
            <CheckCircle />
          </div>
          <div className="bk-kpi-info">
            <span className="bk-kpi-label">Booked & Confirmed</span>
            <span className="bk-kpi-value">{kpiStats.booked}</span>
          </div>
        </div>

        <div className="bk-kpi-card">
          <div className="bk-kpi-icon purple">
            <Truck />
          </div>
          <div className="bk-kpi-info">
            <span className="bk-kpi-label">Active In Transit</span>
            <span className="bk-kpi-value">{kpiStats.inTransit}</span>
          </div>
        </div>
      </div>

      {/* Toolbar / Search & Filters */}
      <div className="bk-toolbar">
        <div className="bk-toolbar-left">
          <div className="bk-search-wrap">
            <MagnifyingGlass size={17} />
            <input
              type="text"
              className="bk-search-input"
              placeholder="Search reference, shipper, city, commodity..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="bk-mode-pills">
            <button
              type="button"
              className={`bk-mode-pill ${modeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setModeFilter('all')}
            >
              All Modes
            </button>
            <button
              type="button"
              className={`bk-mode-pill ${modeFilter === 'inland' ? 'active' : ''}`}
              onClick={() => setModeFilter('inland')}
            >
              <Truck size={14} />
              Inland
            </button>
            <button
              type="button"
              className={`bk-mode-pill ${modeFilter === 'ocean' ? 'active' : ''}`}
              onClick={() => setModeFilter('ocean')}
            >
              <Boat size={14} />
              Ocean
            </button>
            <button
              type="button"
              className={`bk-mode-pill ${modeFilter === 'air' ? 'active' : ''}`}
              onClick={() => setModeFilter('air')}
            >
              <AirplaneTilt size={14} />
              Air
            </button>
            <button
              type="button"
              className={`bk-mode-pill ${modeFilter === 'rail' ? 'active' : ''}`}
              onClick={() => setModeFilter('rail')}
            >
              <Train size={14} />
              Rail
            </button>
          </div>
        </div>

        <div className="bk-toolbar-right">
          <select
            className="bk-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Operational Statuses</option>
            <option value="unbooked">Unbooked Only (Draft / Quoted)</option>
            <option value="draft">Draft</option>
            <option value="booked">Booked</option>
            <option value="dispatched">Dispatched</option>
            <option value="in_transit">In Transit</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Shipments Table */}
      <div className="bk-table-card">
        <div className="bk-table-responsive">
          <table className="bk-table">
            <thead>
              <tr>
                <th>Shipment Ref #</th>
                <th>Mode / Equipment</th>
                <th>Shipper / Customer</th>
                <th>Route (Origin ➔ Destination)</th>
                <th>Pickup Date</th>
                <th>Cargo Specs</th>
                <th>Transport Booking State</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && filteredShipments.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
                      <Clock size={18} />
                      <span>Loading shipment orders from FMS backend...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredShipments.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <div className="fms-empty-card">
                      <div className="fms-empty-icon">
                        <Package size={28} />
                      </div>
                      <h3>{shipmentsList.length === 0 ? 'No Freight Orders Created Yet' : 'No Matching Shipments Found'}</h3>
                      <p>
                        {shipmentsList.length === 0
                          ? 'Freight orders are Step 1 of your logistics execution workflow. Enter customer cargo, origin, and destination requirements to begin booking carrier capacity.'
                          : 'No shipments match the selected filters or search query. Try clearing the filter criteria.'}
                      </p>
                      <div className="fms-empty-actions">
                        {shipmentsList.length > 0 && (
                          <button
                            type="button"
                            className="bk-btn secondary"
                            onClick={() => {
                              setSearchQuery('');
                              setModeFilter('all');
                              setStatusFilter('all');
                            }}
                          >
                            <span>Clear Filters</span>
                          </button>
                        )}
                        {canCreate && (
                          <button
                            type="button"
                            className="bk-btn primary"
                            onClick={handleOpenCreate}
                          >
                            <Plus size={16} />
                            <span>Create Shipment Order</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredShipments.map((s) => {
                  const mode = (s.freight_details?.mode || s.mode || 'inland').toLowerCase();
                  const equipment = s.freight_details?.equipment_type || '53ft Dry Van';
                  const originCity = typeof s.origin === 'object' ? s.origin?.city || s.origin?.address || '—' : s.origin || '—';
                  const destCity = typeof s.destination === 'object' ? s.destination?.city || s.destination?.address || '—' : s.destination || '—';
                  const status = (s.status || 'draft').toLowerCase();
                  const isBooked = ['booked', 'dispatched', 'in_transit', 'delivered', 'closed'].includes(status);
                  const carrierName = s.carrier?.legal_name || s.provider || s.partner;
                  const weightVal = s.freight_details?.weight || s.items?.[0]?.weight;
                  const commodity = s.freight_details?.commodity || s.items?.[0]?.description || 'General Cargo';

                  return (
                    <tr key={s.id || s.reference_number}>
                      <td className="bk-ref-cell">
                        <strong>{s.reference_number || `#${s.id}`}</strong>
                        <small>{s.parent_shipment_id ? `Split from #${s.parent_shipment_id}` : 'Primary Order'}</small>
                      </td>
                      <td>
                        <span className={`bk-mode-badge ${mode}`}>
                          {mode === 'ocean' && <Boat size={14} />}
                          {mode === 'air' && <AirplaneTilt size={14} />}
                          {mode === 'rail' && <Train size={14} />}
                          {(mode === 'inland' || mode === 'road') && <Truck size={14} />}
                          <span>{mode}</span>
                        </span>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>{equipment}</div>
                      </td>
                      <td>
                        <strong>{s.shipper?.legal_name || s.name || 'Enterprise Customer'}</strong>
                      </td>
                      <td>
                        <span>{originCity}</span>
                        <span style={{ color: '#94a3b8', margin: '0 6px' }}>➔</span>
                        <span>{destCity}</span>
                      </td>
                      <td>
                        {s.pickup_date
                          ? new Date(s.pickup_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : 'TBD'}
                      </td>
                      <td>
                        <div><strong>{commodity}</strong></div>
                        <small style={{ color: '#64748b' }}>
                          {weightVal ? `${Number(weightVal).toLocaleString()} lbs` : 'Weight TBD'}
                        </small>
                      </td>
                      <td>
                        {isBooked ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span className="bk-status-badge booked" style={{ alignSelf: 'flex-start' }}>
                              Booked with {carrierName || 'Carrier'}
                            </span>
                            {s.quote_amount && (
                              <span style={{ fontSize: '11px', fontWeight: 600, color: '#059669' }}>
                                Carrier Pay: ${Number(s.quote_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                            )}
                            {['booked', 'dispatched', 'in_transit', 'delivered', 'completed'].includes(status) && onNavigateToJob && (
                              <button
                                type="button"
                                className="fms-next-btn info"
                                style={{ padding: '2px 8px', fontSize: '11px', alignSelf: 'flex-start', marginTop: '2px', background: '#e0e7ff', color: '#4338ca', borderColor: '#c7d2fe' }}
                                title="View operational job & assignments in Job Console"
                                onClick={() => onNavigateToJob(s.id)}
                              >
                                <Briefcase size={12} />
                                <span>Job Console</span>
                              </button>
                            )}
                            {['dispatched', 'in_transit'].includes(status) && onNavigateToDispatch && (
                              <button
                                type="button"
                                className="fms-next-btn success"
                                style={{ padding: '2px 8px', fontSize: '11px', alignSelf: 'flex-start', marginTop: '2px' }}
                                title="Track live execution on Dispatch Board"
                                onClick={() => onNavigateToDispatch(s.id)}
                              >
                                <Truck size={12} />
                                <span>Track on Dispatch</span>
                              </button>
                            )}
                            {status === 'booked' && onNavigateToDispatch && (
                              <button
                                type="button"
                                className="fms-next-btn primary"
                                style={{ padding: '2px 8px', fontSize: '11px', alignSelf: 'flex-start', marginTop: '2px' }}
                                title="Assign driver & equipment on Dispatch Board"
                                onClick={() => onNavigateToDispatch(s.id)}
                              >
                                <span>Assign in Dispatch</span>
                                <ArrowRight size={11} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span className="bk-status-badge draft" style={{ background: '#fef3c7', color: '#92400e' }}>
                              Unbooked
                            </span>
                            {onNavigateToQuote && (
                              <button
                                type="button"
                                className="fms-next-btn secondary"
                                style={{ padding: '3px 7px', fontSize: '11px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                title="Get quotes & calculate rates for this shipment"
                                onClick={() => onNavigateToQuote(s.id)}
                              >
                                <Tag size={11} />
                                <span>Quotes</span>
                              </button>
                            )}
                            {onNavigateToLoadBoard && (
                              <button
                                type="button"
                                className="fms-next-btn secondary"
                                style={{ padding: '3px 7px', fontSize: '11px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                title="Post shipment to marketplace load board"
                                onClick={() => onNavigateToLoadBoard(s.id)}
                              >
                                <Broadcast size={11} />
                                <span>Load Board</span>
                              </button>
                            )}
                            {onNavigateToBooking && (
                              <button
                                type="button"
                                className="fms-next-btn primary"
                                title="Assign carrier and lock agreed rate in Bookings"
                                onClick={() => onNavigateToBooking(s.id)}
                              >
                                <span>Book Carrier</span>
                                <ArrowRight size={11} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`bk-status-badge ${status}`}>
                          {status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="bk-table-actions" style={{ justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="bk-icon-btn"
                            title="View Shipment Details"
                            onClick={() => handleOpenDetail(s)}
                          >
                            <Eye size={16} />
                          </button>
                          {canUpdate && (
                            <button
                              type="button"
                              className="bk-icon-btn"
                              title="Edit Shipment Order"
                              onClick={() => handleOpenEdit(s)}
                            >
                              <NotePencil size={16} />
                            </button>
                          )}
                          {canUpdate && status !== 'delivered' && status !== 'cancelled' && (
                            <button
                              type="button"
                              className="bk-icon-btn"
                              title="Add Stop (Pickup/Dropoff)"
                              style={{ color: '#0284c7' }}
                              onClick={() => setAddStopShipment(s)}
                            >
                              <MapPin size={16} />
                            </button>
                          )}
                          {canCancel && status !== 'cancelled' && status !== 'delivered' && (
                            <button
                              type="button"
                              className="bk-icon-btn danger"
                              title="Cancel Shipment"
                              onClick={() => setCancelModalShipment(s)}
                            >
                              <X size={16} />
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

      {/* =====================================================================
          SHIPMENT ORDER CREATION & EDIT MODAL
          ===================================================================== */}
      {isFormOpen && (
        <div className="bk-modal-backdrop" onClick={() => setIsFormOpen(false)}>
          <div
            className="bk-modal-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="bk-modal-header">
              <div className="bk-modal-title">
                <div className="bk-modal-title-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                  <Package />
                </div>
                <div>
                  <h2>{editingShipment ? `Edit Shipment Order #${form.reference_number}` : 'New Freight Shipment Order'}</h2>
                  <p>Define cargo requirements, customer references, route origin/destination, and schedule</p>
                </div>
              </div>
              <button
                type="button"
                className="bk-close-btn"
                onClick={() => setIsFormOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {/* Step Progress Tabs */}
            <div className="bk-tabs-nav" style={{ padding: '0 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className={`bk-tab-btn ${formStep === 1 ? 'active' : ''}`}
                onClick={() => setFormStep(1)}
              >
                1. Order & Customer
              </button>
              <button
                type="button"
                className={`bk-tab-btn ${formStep === 2 ? 'active' : ''}`}
                onClick={() => validateStep(1) && setFormStep(2)}
              >
                2. Route & Schedule
              </button>
              <button
                type="button"
                className={`bk-tab-btn ${formStep === 3 ? 'active' : ''}`}
                onClick={() => validateStep(1) && validateStep(2) && setFormStep(3)}
              >
                3. Cargo & Equipment
              </button>
            </div>

            <form onSubmit={handleSubmitForm} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="bk-modal-body" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', color: '#475569' }}>
                  <Info size={18} color="#2563eb" style={{ flexShrink: 0 }} />
                  <span>
                    <strong>Freight Order (Step 1):</strong> Enter cargo, customer, and route specifications. Once created, proceed to <strong>Bookings</strong> to lock in carrier rates and legal confirmation.
                  </span>
                </div>
                {formStep === 1 && (
                  <div className="bk-form-grid">
                    <div className="bk-field-group">
                      <label className="bk-label">
                        Customer / Shipper Organization <span className="bk-badge-req">Required</span>
                      </label>
                      <select
                        className={`bk-select ${formErrors.shipper_org_id ? 'has-error' : ''}`}
                        value={form.shipper_org_id}
                        onChange={(e) => setForm({ ...form, shipper_org_id: e.target.value })}
                        required
                      >
                        <option value="">-- Select Customer Organization --</option>
                        {customersList.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.legal_name || c.name} {c.tax_id ? `(Tax ID: ${c.tax_id})` : ''}
                          </option>
                        ))}
                      </select>
                      {formErrors.shipper_org_id && <span className="bk-field-error-msg">{formErrors.shipper_org_id}</span>}
                      <div className="bk-term-helper">
                        <Info size={13} />
                        <span>The commercial customer or manufacturing shipper owning this freight demand.</span>
                      </div>
                    </div>

                    <div className="bk-field-group">
                      <label className="bk-label">
                        Shipment Order Reference # <span className="bk-badge-req">Required</span>
                      </label>
                      <input
                        type="text"
                        className={`bk-input ${formErrors.reference_number ? 'has-error' : ''}`}
                        value={form.reference_number}
                        onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
                        required
                      />
                      {formErrors.reference_number && <span className="bk-field-error-msg">{formErrors.reference_number}</span>}
                      <div className="bk-term-helper">
                        <Info size={13} />
                        <span>Unique reference code for tracking this cargo request (e.g. SHP-2026-XXXX).</span>
                      </div>
                    </div>

                    <div className="bk-field-group">
                      <label className="bk-label">
                        Customer Purchase Order (PO #) <span className="bk-badge-opt">Optional</span>
                      </label>
                      <input
                        type="text"
                        className="bk-input"
                        placeholder="e.g. PO-88941"
                        value={form.po_number}
                        onChange={(e) => setForm({ ...form, po_number: e.target.value })}
                      />
                      <div className="bk-term-helper">
                        <Info size={13} />
                        <span>Customer internal purchase authorization linking to commercial invoices.</span>
                      </div>
                    </div>

                    <div className="bk-field-group">
                      <label className="bk-label">
                        Bill of Lading (BOL #) <span className="bk-badge-opt">Optional</span>
                      </label>
                      <input
                        type="text"
                        className="bk-input"
                        placeholder="e.g. BOL-2026-X"
                        value={form.bol_number}
                        onChange={(e) => setForm({ ...form, bol_number: e.target.value })}
                      />
                      <div className="bk-term-helper">
                        <Info size={13} />
                        <span>Primary shipping receipt establishing legal contract and receipt of goods.</span>
                      </div>
                    </div>
                  </div>
                )}

                {formStep === 2 && (
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px' }}>
                      Origin Pickup Location (Shipper Dock)
                    </h3>
                    <div className="bk-form-grid" style={{ marginBottom: '20px' }}>
                      <div className="bk-field-group" style={{ gridColumn: 'span 2' }}>
                        <label className="bk-label">
                          Street Address <span className="bk-badge-opt">Optional</span>
                        </label>
                        <input
                          type="text"
                          className="bk-input"
                          placeholder="e.g. 100 Industrial Parkway, Dock 4"
                          value={form.origin_address}
                          onChange={(e) => setForm({ ...form, origin_address: e.target.value })}
                        />
                      </div>
                      <div className="bk-field-group">
                        <label className="bk-label">
                          Origin City <span className="bk-badge-req">Required</span>
                        </label>
                        <input
                          type="text"
                          className={`bk-input ${formErrors.origin_city ? 'has-error' : ''}`}
                          placeholder="e.g. Chicago"
                          value={form.origin_city}
                          onChange={(e) => setForm({ ...form, origin_city: e.target.value })}
                          required
                        />
                        {formErrors.origin_city && <span className="bk-field-error-msg">{formErrors.origin_city}</span>}
                      </div>
                      <div className="bk-field-group">
                        <label className="bk-label">
                          State / Province <span className="bk-badge-opt">Optional</span>
                        </label>
                        <input
                          type="text"
                          className="bk-input"
                          placeholder="IL"
                          value={form.origin_state}
                          onChange={(e) => setForm({ ...form, origin_state: e.target.value })}
                        />
                      </div>
                      <div className="bk-field-group">
                        <label className="bk-label">
                          Postal / Zip Code <span className="bk-badge-opt">Optional</span>
                        </label>
                        <input
                          type="text"
                          className="bk-input"
                          value={form.origin_zip}
                          onChange={(e) => setForm({ ...form, origin_zip: e.target.value })}
                        />
                      </div>
                      <div className="bk-field-group">
                        <label className="bk-label">
                          Pickup Date <span className="bk-badge-req">Required</span>
                        </label>
                        <input
                          type="date"
                          className={`bk-input ${formErrors.pickup_date ? 'has-error' : ''}`}
                          value={form.pickup_date}
                          onChange={(e) => setForm({ ...form, pickup_date: e.target.value })}
                          required
                        />
                        {formErrors.pickup_date && <span className="bk-field-error-msg">{formErrors.pickup_date}</span>}
                      </div>
                    </div>

                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px' }}>
                      Destination Delivery Location (Consignee Facility)
                    </h3>
                    <div className="bk-form-grid">
                      <div className="bk-field-group" style={{ gridColumn: 'span 2' }}>
                        <label className="bk-label">
                          Street Address <span className="bk-badge-opt">Optional</span>
                        </label>
                        <input
                          type="text"
                          className="bk-input"
                          placeholder="e.g. 450 Logistics Blvd, Receiving Bay 12"
                          value={form.destination_address}
                          onChange={(e) => setForm({ ...form, destination_address: e.target.value })}
                        />
                      </div>
                      <div className="bk-field-group">
                        <label className="bk-label">
                          Destination City <span className="bk-badge-req">Required</span>
                        </label>
                        <input
                          type="text"
                          className={`bk-input ${formErrors.destination_city ? 'has-error' : ''}`}
                          placeholder="e.g. Dallas"
                          value={form.destination_city}
                          onChange={(e) => setForm({ ...form, destination_city: e.target.value })}
                          required
                        />
                        {formErrors.destination_city && <span className="bk-field-error-msg">{formErrors.destination_city}</span>}
                      </div>
                      <div className="bk-field-group">
                        <label className="bk-label">
                          State / Province <span className="bk-badge-opt">Optional</span>
                        </label>
                        <input
                          type="text"
                          className="bk-input"
                          placeholder="TX"
                          value={form.destination_state}
                          onChange={(e) => setForm({ ...form, destination_state: e.target.value })}
                        />
                      </div>
                      <div className="bk-field-group">
                        <label className="bk-label">
                          Postal / Zip Code <span className="bk-badge-opt">Optional</span>
                        </label>
                        <input
                          type="text"
                          className="bk-input"
                          value={form.destination_zip}
                          onChange={(e) => setForm({ ...form, destination_zip: e.target.value })}
                        />
                      </div>
                      <div className="bk-field-group">
                        <label className="bk-label">
                          Estimated Delivery Date <span className="bk-badge-opt">Optional</span>
                        </label>
                        <input
                          type="date"
                          className="bk-input"
                          value={form.delivery_date}
                          onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {formStep === 3 && (
                  <div className="bk-form-grid">
                    <div className="bk-field-group">
                      <label className="bk-label">
                        Transport Mode <span className="bk-badge-req">Required</span>
                      </label>
                      <select
                        className="bk-select"
                        value={form.mode}
                        onChange={(e) => setForm({ ...form, mode: e.target.value })}
                      >
                        {FREIGHT_MODES.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <div className="bk-term-helper">
                        <Info size={13} />
                        <span>Select over-the-road trucking, ocean maritime, air cargo, or rail.</span>
                      </div>
                    </div>

                    <div className="bk-field-group">
                      <label className="bk-label">
                        Required Equipment <span className="bk-badge-req">Required</span>
                      </label>
                      <select
                        className="bk-select"
                        value={form.equipment_type}
                        onChange={(e) => setForm({ ...form, equipment_type: e.target.value })}
                      >
                        {EQUIPMENT_TYPES.map((eq) => (
                          <option key={eq} value={eq}>
                            {eq}
                          </option>
                        ))}
                      </select>
                    </div>

                    {form.mode === 'ocean' && (
                      <>
                        <div className="bk-field-group">
                          <label className="bk-label">
                            Port of Loading (POL) <span className="bk-badge-opt">Ocean Port</span>
                          </label>
                          <select
                            className="bk-select"
                            value={form.ocean_pol || ''}
                            onChange={(e) => setForm({ ...form, ocean_pol: e.target.value })}
                          >
                            <option value="">-- Choose Loading Seaport --</option>
                            {portsList.map((p) => (
                              <option key={p.id} value={p.name}>
                                {p.name} ({p.code || 'PORT'})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="bk-field-group">
                          <label className="bk-label">
                            Port of Discharge (POD) <span className="bk-badge-opt">Ocean Port</span>
                          </label>
                          <select
                            className="bk-select"
                            value={form.ocean_pod || ''}
                            onChange={(e) => setForm({ ...form, ocean_pod: e.target.value })}
                          >
                            <option value="">-- Choose Discharge Seaport --</option>
                            {portsList.map((p) => (
                              <option key={p.id} value={p.name}>
                                {p.name} ({p.code || 'PORT'})
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}

                    {form.mode === 'air' && (
                      <>
                        <div className="bk-field-group">
                          <label className="bk-label">
                            Origin Airport (IATA) <span className="bk-badge-opt">Air Hub</span>
                          </label>
                          <input
                            type="text"
                            className="bk-input"
                            placeholder="e.g. ORD / JFK"
                            maxLength={4}
                            value={form.air_origin || ''}
                            onChange={(e) => setForm({ ...form, air_origin: e.target.value.toUpperCase() })}
                          />
                        </div>
                        <div className="bk-field-group">
                          <label className="bk-label">
                            Destination Airport (IATA) <span className="bk-badge-opt">Air Hub</span>
                          </label>
                          <input
                            type="text"
                            className="bk-input"
                            placeholder="e.g. FRA / LHR"
                            maxLength={4}
                            value={form.air_dest || ''}
                            onChange={(e) => setForm({ ...form, air_dest: e.target.value.toUpperCase() })}
                          />
                        </div>
                      </>
                    )}

                    <div className="bk-field-group" style={{ gridColumn: 'span 2' }}>
                      <label className="bk-label">
                        Commodity / Cargo Description <span className="bk-badge-req">Required</span>
                      </label>
                      <input
                        type="text"
                        className={`bk-input ${formErrors.commodity ? 'has-error' : ''}`}
                        placeholder="e.g. Precision Machinery, Automotive Components, Electronics"
                        value={form.commodity}
                        onChange={(e) => setForm({ ...form, commodity: e.target.value })}
                        required
                      />
                      {formErrors.commodity && <span className="bk-field-error-msg">{formErrors.commodity}</span>}
                    </div>

                    <div className="bk-field-group">
                      <label className="bk-label">
                        Total Weight ({form.weight_unit}) <span className="bk-badge-req">Required</span>
                      </label>
                      <input
                        type="number"
                        className={`bk-input ${formErrors.weight ? 'has-error' : ''}`}
                        placeholder="e.g. 42000"
                        value={form.weight}
                        onChange={(e) => setForm({ ...form, weight: e.target.value })}
                        required
                      />
                      {formErrors.weight && <span className="bk-field-error-msg">{formErrors.weight}</span>}
                    </div>

                    <div className="bk-field-group">
                      <label className="bk-label">
                        Package Units / Quantity <span className="bk-badge-opt">Optional</span>
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="number"
                          className="bk-input"
                          style={{ width: '80px' }}
                          value={form.quantity}
                          onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                        />
                        <select
                          className="bk-select"
                          value={form.package_type}
                          onChange={(e) => setForm({ ...form, package_type: e.target.value })}
                        >
                          <option value="Pallets">Pallets</option>
                          <option value="Boxes">Boxes / Cartons</option>
                          <option value="Crates">Crates</option>
                          <option value="Drums">Drums</option>
                          <option value="Containers">Containers</option>
                        </select>
                      </div>
                    </div>

                    <div className="bk-field-group" style={{ gridColumn: 'span 2' }}>
                      <div style={{ display: 'flex', gap: '24px', padding: '10px 0' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={form.is_hazardous}
                            onChange={(e) => setForm({ ...form, is_hazardous: e.target.checked })}
                          />
                          <span>Hazardous Materials (Hazmat)</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={form.temperature_controlled}
                            onChange={(e) => setForm({ ...form, temperature_controlled: e.target.checked })}
                          />
                          <span>Temperature Controlled (Reefer)</span>
                        </label>
                      </div>
                    </div>

                    <div className="bk-field-group" style={{ gridColumn: 'span 2' }}>
                      <label className="bk-label">
                        Special Handling & Shipper Notes <span className="bk-badge-opt">Optional</span>
                      </label>
                      <textarea
                        className="bk-textarea"
                        rows={2}
                        placeholder="Forklift required, dock height loading, appointment required..."
                        value={form.special_instructions}
                        onChange={(e) => setForm({ ...form, special_instructions: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="bk-modal-footer">
                {formStep > 1 ? (
                  <button
                    type="button"
                    className="bk-btn secondary"
                    onClick={() => setFormStep((s) => s - 1)}
                  >
                    <ArrowLeft size={16} />
                    <span>Back</span>
                  </button>
                ) : (
                  <div />
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="bk-btn secondary"
                    onClick={() => setIsFormOpen(false)}
                  >
                    Cancel
                  </button>

                  {formStep === 1 && (
                    <button
                      type="button"
                      className="bk-btn primary"
                      onClick={() => validateStep(1) && setFormStep(2)}
                    >
                      <span>Next: Route & Schedule</span>
                      <ArrowRight size={16} />
                    </button>
                  )}
                  {formStep === 2 && (
                    <button
                      type="button"
                      className="bk-btn primary"
                      onClick={() => validateStep(2) && setFormStep(3)}
                    >
                      <span>Next: Cargo & Equipment</span>
                      <ArrowRight size={16} />
                    </button>
                  )}
                  {formStep === 3 && (
                    <button
                      type="submit"
                      className="bk-btn primary"
                      disabled={submitting}
                    >
                      <CheckCircle size={16} />
                      <span>{editingShipment ? 'Save Changes' : 'Create Order & Ready for Booking'}</span>
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          SHIPMENT DETAIL MODAL
          ===================================================================== */}
      {detailShipment && (
        <div className="bk-modal-backdrop" onClick={() => setDetailShipment(null)}>
          <div
            className="bk-modal-container"
            style={{ maxWidth: '750px' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="bk-modal-header">
              <div className="bk-modal-title">
                <div className="bk-modal-title-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                  <FileText />
                </div>
                <div>
                  <h2>Shipment Overview · {detailShipment.reference_number || `#${detailShipment.id}`}</h2>
                  <p>Customer requirements, origin/destination stops, cargo details, and booking state</p>
                </div>
              </div>
              <button
                type="button"
                className="bk-close-btn"
                onClick={() => setDetailShipment(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="bk-modal-body" style={{ padding: '24px' }}>
              {loadingDetail && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '8px 12px', marginBottom: '16px', fontSize: '12px', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ArrowsClockwise size={14} className="spin" />
                  <span>Loading full operational relations, assignments, documents, and billing...</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
                    Shipper / Customer
                  </div>
                  <strong style={{ fontSize: '15px', color: '#0f172a' }}>
                    {detailShipment.shipper?.legal_name || detailShipment.name || 'Enterprise Customer'}
                  </strong>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    Status: <span className={`bk-status-badge ${detailShipment.status}`}>{detailShipment.status}</span>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
                    Transport Booking State
                  </div>
                  {['booked', 'dispatched', 'in_transit', 'delivered', 'closed'].includes(detailShipment.status) ? (
                    <div>
                      <strong style={{ color: '#059669', fontSize: '15px' }}>
                        Booked with {detailShipment.carrier?.legal_name || detailShipment.provider || 'Carrier'}
                      </strong>
                      {detailShipment.quote_amount && (
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginTop: '4px' }}>
                          Carrier Pay: ${Number(detailShipment.quote_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <strong style={{ color: '#d97706', fontSize: '15px' }}>Unbooked (Awaiting Carrier Booking)</strong>
                      <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {onNavigateToQuote && (
                          <button
                            type="button"
                            className="bk-btn secondary small"
                            onClick={() => {
                              const sId = detailShipment.id;
                              setDetailShipment(null);
                              onNavigateToQuote(sId);
                            }}
                          >
                            <Tag size={13} />
                            <span>Get Quotes & Rates</span>
                          </button>
                        )}
                        {onNavigateToLoadBoard && (
                          <button
                            type="button"
                            className="bk-btn secondary small"
                            onClick={() => {
                              const sId = detailShipment.id;
                              setDetailShipment(null);
                              onNavigateToLoadBoard(sId);
                            }}
                          >
                            <Broadcast size={13} />
                            <span>Post to Load Board</span>
                          </button>
                        )}
                        {onNavigateToBooking && (
                          <button
                            type="button"
                            className="bk-btn primary small"
                            onClick={() => {
                              const sId = detailShipment.id;
                              setDetailShipment(null);
                              onNavigateToBooking(sId);
                            }}
                          >
                            <span>Book Carrier Directly</span>
                            <ArrowRight size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Milestone Stops Sequence */}
              {detailShipment.stops && detailShipment.stops.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Path size={15} color="#2563eb" />
                    <span>Stop Milestones & Execution Sequence</span>
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                    {detailShipment.stops.map((stop, sIdx) => (
                      <div key={stop.id || sIdx} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                            Stop #{stop.sequence || sIdx + 1} · {stop.type}
                          </span>
                          <span className={`bk-status-badge ${stop.status || 'scheduled'}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                            {stop.status || 'scheduled'}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                          {stop.address?.city || stop.city || 'TBD'}, {stop.address?.state || stop.state || ''}
                        </div>
                        {stop.appointment_window && (
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                            Appt: {typeof stop.appointment_window === 'object' ? JSON.stringify(stop.appointment_window) : stop.appointment_window}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Route & Cargo */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Origin & Destination Route
                </h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: '#ffffff', border: '1px solid #e2e8f0', padding: '14px', borderRadius: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>ORIGIN PICKUP</div>
                    <strong>{typeof detailShipment.origin === 'object' ? `${detailShipment.origin?.city || ''}, ${detailShipment.origin?.state || ''}` : detailShipment.origin || 'TBD'}</strong>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {detailShipment.pickup_date ? new Date(detailShipment.pickup_date).toLocaleDateString() : 'Date TBD'}
                    </div>
                  </div>
                  <div style={{ color: '#3b82f6', fontSize: '20px' }}>➔</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>DESTINATION DELIVERY</div>
                    <strong>{typeof detailShipment.destination === 'object' ? `${detailShipment.destination?.city || ''}, ${detailShipment.destination?.state || ''}` : detailShipment.destination || 'TBD'}</strong>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {detailShipment.estimated_delivery ? new Date(detailShipment.estimated_delivery).toLocaleDateString() : 'Date TBD'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Operational Job & Dispatch Assignment Card */}
              {(detailShipment.job || detailShipment.assigned_driver || (detailShipment.dispatch_assignments && detailShipment.dispatch_assignments.length > 0)) && (
                <div style={{ marginBottom: '20px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Briefcase size={16} color="#4f46e5" />
                      <span>Operational Job & Dispatch Assignment</span>
                    </h4>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {onNavigateToJob && (
                        <button
                          type="button"
                          className="bk-btn secondary small"
                          onClick={() => {
                            const sId = detailShipment.id;
                            const jId = detailShipment.job?.id;
                            const jNum = detailShipment.job?.job_number;
                            setDetailShipment(null);
                            onNavigateToJob(sId, jId, jNum);
                          }}
                        >
                          <Briefcase size={13} />
                          <span>Job Console</span>
                        </button>
                      )}
                      {onNavigateToDispatch && (
                        <button
                          type="button"
                          className="bk-btn secondary small"
                          onClick={() => {
                            const sId = detailShipment.id;
                            setDetailShipment(null);
                            onNavigateToDispatch(sId);
                          }}
                        >
                          <Truck size={13} />
                          <span>Dispatch Board</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', fontSize: '13px' }}>
                    {detailShipment.job && (
                      <div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Job Reference</div>
                        <strong>{detailShipment.job.job_number}</strong>
                        <div style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>
                          Status: {detailShipment.job.status}
                        </div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Assigned Driver</div>
                      <strong>
                        {detailShipment.assigned_driver?.name ||
                         detailShipment.dispatch_assignments?.[0]?.driver?.name ||
                         'Unassigned'}
                      </strong>
                      {(detailShipment.assigned_driver?.phone || detailShipment.dispatch_assignments?.[0]?.driver?.phone) && (
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          {detailShipment.assigned_driver?.phone || detailShipment.dispatch_assignments?.[0]?.driver?.phone}
                        </div>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Equipment (Truck / Trailer)</div>
                      <span>
                        {detailShipment.assigned_truck?.unit_number ||
                         detailShipment.dispatch_assignments?.[0]?.truck?.unit_number ||
                         'Tractor N/A'}
                        {' / '}
                        {detailShipment.assigned_trailer?.unit_number ||
                         detailShipment.dispatch_assignments?.[0]?.trailer?.unit_number ||
                         'Trailer N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Documents & Proof of Delivery (POD) Card */}
              {(detailShipment.documents?.length > 0 || detailShipment.rate_confirmation || ['delivered', 'closed'].includes(detailShipment.status)) && (
                <div style={{ marginBottom: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={16} color="#2563eb" />
                    <span>Compliance Documents & Proof of Delivery (POD)</span>
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                    {/* Rate Confirmation Status */}
                    <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>Rate Confirmation</span>
                        <span className={`bk-status-badge ${detailShipment.rate_confirmation?.status || 'signed'}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                          {detailShipment.rate_confirmation?.status || 'signed'}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                        Ref: {detailShipment.rate_confirmation?.confirmation_number || `RC-${detailShipment.reference_number || detailShipment.id}`}
                      </div>
                    </div>

                    {/* Proof of Delivery (POD) */}
                    <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>Proof of Delivery (POD)</span>
                        <span className="bk-status-badge delivered" style={{ fontSize: '10px', padding: '2px 6px' }}>
                          {detailShipment.documents?.some(d => d.type === 'POD') ? 'Verified & On File' : ['delivered', 'closed'].includes(detailShipment.status) ? 'Delivery Confirmed' : 'Pending Delivery'}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                        {detailShipment.documents?.find(d => d.type === 'POD')?.file_name || `POD-${detailShipment.reference_number || detailShipment.id}.pdf`}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Freight Invoicing & Billing Card */}
              {(detailShipment.invoices?.length > 0 || ['delivered', 'closed'].includes(detailShipment.status)) && (
                <div style={{ marginBottom: '20px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, color: '#065f46', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Receipt size={16} color="#059669" />
                    <span>Freight Invoicing & Financial Settlement</span>
                  </h4>
                  {detailShipment.invoices && detailShipment.invoices.length > 0 ? (
                    detailShipment.invoices.map((inv) => (
                      <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', fontSize: '13px', background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px solid #d1fae5' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Invoice Number</div>
                          <strong style={{ color: '#0f172a' }}>{inv.invoice_number}</strong>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Total Amount</div>
                          <strong style={{ color: '#059669' }}>${Number(inv.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Payment Terms</div>
                          <span>Net 30 Days</span>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Invoice Status</div>
                          <span className={`bk-status-badge ${inv.status || 'pending'}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                            {String(inv.status || 'pending').toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '13px', color: '#065f46', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={16} weight="bold" color="#059669" />
                      <span>Delivery confirmed. Automated Net 30 freight invoice generated in financial records.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Items & Cargo */}
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Cargo Items & Specifications
                </h4>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '14px', borderRadius: '8px' }}>
                  <div><strong>Commodity:</strong> {detailShipment.freight_details?.commodity || detailShipment.items?.[0]?.description || 'General Freight'}</div>
                  <div style={{ marginTop: '4px', fontSize: '13px', color: '#475569' }}>
                    <strong>Equipment:</strong> {detailShipment.freight_details?.equipment_type || '53ft Dry Van'} · <strong>Weight:</strong> {detailShipment.freight_details?.weight || detailShipment.items?.[0]?.weight || 'TBD'} lbs
                  </div>
                  {detailShipment.notes && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
                      Notes: {detailShipment.notes}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bk-modal-footer">
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="bk-btn secondary"
                  onClick={() => setDetailShipment(null)}
                >
                  Close
                </button>

                {/* Milestone 2 Final Shipment Closure Action */}
                {detailShipment.status === 'delivered' && (
                  <button
                    type="button"
                    className="bk-btn primary"
                    onClick={() => handleCloseShipment(detailShipment.id)}
                    disabled={closingShipment}
                  >
                    <CheckCircle size={16} weight="bold" />
                    <span>{closingShipment ? 'Closing...' : 'Close & Finalize Shipment'}</span>
                  </button>
                )}

                {detailShipment.status === 'closed' && (
                  <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px', background: '#ecfdf5', padding: '6px 12px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                    <CheckCircle size={16} weight="bold" />
                    <span>Shipment Closed & Finalized</span>
                  </span>
                )}
              </div>

              {!['booked', 'dispatched', 'in_transit', 'delivered', 'closed'].includes(detailShipment.status) && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {onNavigateToQuote && (
                    <button
                      type="button"
                      className="bk-btn secondary"
                      onClick={() => {
                        const sId = detailShipment.id;
                        setDetailShipment(null);
                        onNavigateToQuote(sId);
                      }}
                    >
                      <Tag size={16} />
                      <span>Quotes</span>
                    </button>
                  )}
                  {onNavigateToLoadBoard && (
                    <button
                      type="button"
                      className="bk-btn secondary"
                      onClick={() => {
                        const sId = detailShipment.id;
                        setDetailShipment(null);
                        onNavigateToLoadBoard(sId);
                      }}
                    >
                      <Broadcast size={16} />
                      <span>Load Board</span>
                    </button>
                  )}
                  {onNavigateToBooking && (
                    <button
                      type="button"
                      className="bk-btn primary"
                      onClick={() => {
                        const sId = detailShipment.id;
                        setDetailShipment(null);
                        onNavigateToBooking(sId);
                      }}
                    >
                      <span>Book Carrier</span>
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          ADD STOP MODAL
          ===================================================================== */}
      {addStopShipment && (
        <div className="bk-modal-backdrop" onClick={() => setAddStopShipment(null)}>
          <div
            className="bk-modal-container"
            style={{ maxWidth: '520px' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="bk-modal-header">
              <div className="bk-modal-title">
                <div className="bk-modal-title-icon" style={{ background: '#f0f9ff', color: '#0284c7' }}>
                  <MapPin />
                </div>
                <div>
                  <h2>Add Stop · Shipment #{addStopShipment.reference_number || addStopShipment.id}</h2>
                  <p>Append a pickup or dropoff waypoint to this shipment order</p>
                </div>
              </div>
              <button
                type="button"
                className="bk-close-btn"
                onClick={() => setAddStopShipment(null)}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddStopSubmit}>
              <div className="bk-modal-body" style={{ padding: '20px' }}>
                <div className="bk-form-grid">
                  <div className="bk-field-group">
                    <label className="bk-label required">Stop Type</label>
                    <select
                      className="bk-select"
                      value={newStopData.type}
                      onChange={(e) => setNewStopData({ ...newStopData, type: e.target.value })}
                    >
                      <option value="pickup">Pickup Stop</option>
                      <option value="dropoff">Dropoff Stop</option>
                    </select>
                  </div>

                  <div className="bk-field-group">
                    <label className="bk-label">Facility / Location Name</label>
                    <input
                      type="text"
                      className="bk-input"
                      placeholder="e.g. Crossdock #4"
                      value={newStopData.facility_name}
                      onChange={(e) => setNewStopData({ ...newStopData, facility_name: e.target.value })}
                    />
                  </div>

                  <div className="bk-field-group" style={{ gridColumn: 'span 2' }}>
                    <label className="bk-label required">Street Address</label>
                    <input
                      type="text"
                      className="bk-input"
                      placeholder="e.g. 500 Terminal Way"
                      value={newStopData.address}
                      onChange={(e) => setNewStopData({ ...newStopData, address: e.target.value })}
                      required
                    />
                  </div>

                  <div className="bk-field-group">
                    <label className="bk-label required">City</label>
                    <input
                      type="text"
                      className="bk-input"
                      placeholder="City"
                      value={newStopData.city}
                      onChange={(e) => setNewStopData({ ...newStopData, city: e.target.value })}
                      required
                    />
                  </div>

                  <div className="bk-field-group">
                    <label className="bk-label">State / Postal Code</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        className="bk-input"
                        placeholder="State"
                        style={{ width: '80px' }}
                        value={newStopData.state}
                        onChange={(e) => setNewStopData({ ...newStopData, state: e.target.value })}
                      />
                      <input
                        type="text"
                        className="bk-input"
                        placeholder="Zip"
                        value={newStopData.postal_code}
                        onChange={(e) => setNewStopData({ ...newStopData, postal_code: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="bk-field-group" style={{ gridColumn: 'span 2' }}>
                    <label className="bk-label">Scheduled Arrival Window</label>
                    <input
                      type="datetime-local"
                      className="bk-input"
                      value={newStopData.scheduled_arrival}
                      onChange={(e) => setNewStopData({ ...newStopData, scheduled_arrival: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="bk-modal-footer">
                <button
                  type="button"
                  className="bk-btn secondary"
                  onClick={() => setAddStopShipment(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bk-btn primary"
                  disabled={submitting}
                >
                  <Plus size={16} />
                  <span>Add Stop to Route</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          CANCEL SHIPMENT CONFIRMATION MODAL
          ===================================================================== */}
      {cancelModalShipment && (
        <div className="bk-modal-backdrop" onClick={() => setCancelModalShipment(null)}>
          <div
            className="bk-modal-container"
            style={{ maxWidth: '480px' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="bk-modal-header">
              <div className="bk-modal-title">
                <div className="bk-modal-title-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>
                  <X />
                </div>
                <div>
                  <h2>Cancel Shipment Order</h2>
                  <p>Reference #{cancelModalShipment.reference_number || cancelModalShipment.id}</p>
                </div>
              </div>
              <button
                type="button"
                className="bk-close-btn"
                onClick={() => setCancelModalShipment(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="bk-modal-body" style={{ padding: '20px' }}>
              <p style={{ margin: '0 0 14px', fontSize: '13.5px', color: '#475569' }}>
                Are you sure you want to cancel this shipment order? The order will be marked cancelled in the system.
              </p>
              <div className="bk-field-group">
                <label className="bk-label">Cancellation Reason / Notes</label>
                <input
                  type="text"
                  className="bk-input"
                  placeholder="e.g. Shipper cancelled order, schedule revised"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>
            </div>

            <div className="bk-modal-footer">
              <button
                type="button"
                className="bk-btn secondary"
                onClick={() => setCancelModalShipment(null)}
              >
                Keep Order
              </button>
              <button
                type="button"
                className="bk-btn primary"
                style={{ background: '#dc2626', borderColor: '#dc2626' }}
                onClick={handleConfirmCancel}
                disabled={submitting}
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
