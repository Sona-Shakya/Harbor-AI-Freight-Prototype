import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarCheck,
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
  UploadSimple,
  ShieldCheck,
  CaretRight,
  CaretDown,
  CaretUp,
  MapPin,
  Buildings,
  User,
  Phone,
  EnvelopeSimple,
  Package,
  Eye,
  NotePencil,
  Info,
  Check,
  Tag,
  Receipt,
  BookmarkSimple
} from '@phosphor-icons/react';
import {
  getShipments,
  getShipment,
  createShipment,
  updateShipment,
  updateShipmentStatus,
  cancelShipment,
  getCustomers,
  getVendors,
  getPorts,
  getCfsStations,
  getQuotes,
} from './api';
import './styles/bookingManagement.css';

const FREIGHT_MODES = [
  {
    id: 'inland',
    name: 'Inland / Road',
    icon: Truck,
    description: 'Over-the-road freight with dispatch & equipment assignment',
    statusBadge: 'Fully Operational',
    statusClass: 'operational',
  },
  {
    id: 'ocean',
    name: 'Ocean Freight',
    icon: Boat,
    description: 'FCL & LCL marine transport with Port and CFS integration',
    statusBadge: 'Port / CFS Active',
    statusClass: 'active',
  },
  {
    id: 'air',
    name: 'Air Cargo',
    icon: AirplaneTilt,
    description: 'Expedited air waybill shipments and airport gateways',
    statusBadge: 'Gateway Active',
    statusClass: 'active',
  },
  {
    id: 'rail',
    name: 'Rail / Intermodal',
    icon: Train,
    description: 'Intermodal ramp-to-ramp railcar & container routing',
    statusBadge: 'Intermodal Active',
    statusClass: 'active',
  },
];

const PACKAGE_TYPES = [
  'Pallets',
  'Cartons',
  'Crates',
  'Drums',
  'Boxes',
  'Rolls',
  'Skids',
  'Totes',
  'Loose / Bulk',
];

const EQUIPMENT_TYPES = [
  "Dry Van (53')",
  "Refrigerated (53')",
  "Flatbed (48')",
  'Step Deck',
  'Power Only',
  'Straight / Box Truck',
];

const LTL_CLASSES = [
  '50', '55', '60', '65', '70', '77.5', '85', '92.5', '100',
  '110', '125', '150', '175', '200', '250', '300', '400', '500',
];

const STANDARD_ACCESSORIALS = [
  { id: 'liftgate', name: 'Liftgate Service', defaultFee: 50 },
  { id: 'residential', name: 'Residential Delivery', defaultFee: 65 },
  { id: 'inside_delivery', name: 'Inside Delivery', defaultFee: 75 },
  { id: 'hazmat', name: 'Hazardous Materials Handling', defaultFee: 150 },
  { id: 'detention', name: 'Detention Surcharge', defaultFee: 75 },
  { id: 'layover', name: 'Layover Protection', defaultFee: 250 },
  { id: 'storage', name: 'Storage / Holding Fee', defaultFee: 100 },
];

const FORM_TABS = [
  { id: 'info', label: '1. Booking Info' },
  { id: 'parties', label: '2. Parties & Route' },
  { id: 'cargo', label: '3. Cargo Details' },
  { id: 'mode', label: '4. Mode-Specific' },
  { id: 'rates', label: '5. Rates & Docs' },
  { id: 'review', label: '6. Review & Submit' },
];

export default function BookingManagement({
  hasPermission = () => true,
  notify = () => {},
  profileLoading = false,
  currentUser = null,
  currentRoleName = '',
  currentOrg = null,
  initialRecords = [],
}) {
  // Navigation & View State
  const [activeTab, setActiveTab] = useState('info');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [cancelModalBooking, setCancelModalBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Table Filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Master Data & Entity States
  const [shipmentsList, setShipmentsList] = useState([]);
  const [customersList, setCustomersList] = useState([]);
  const [vendorsList, setVendorsList] = useState([]);
  const [portsList, setPortsList] = useState([]);
  const [cfsList, setCfsList] = useState([]);
  const [quotesList, setQuotesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorNotice, setErrorNotice] = useState('');

  // Form State
  const initialFormState = {
    // 1. Booking Information
    booking_source: 'new', // 'new' | 'existing_shipment'
    linked_shipment_id: '',
    booking_number: '',
    booking_date: new Date().toISOString().slice(0, 10),
    booking_mode: 'inland',
    shipper_org_id: '',
    status: 'draft',

    // 2. Parties
    shipper_name: '',
    pickup_contact_name: '',
    pickup_contact_phone: '',
    pickup_contact_email: '',
    consignee_name: '',
    consignee_company: '',
    delivery_contact_name: '',
    delivery_contact_phone: '',
    delivery_contact_email: '',
    notify_party_name: '',
    notify_party_email: '',

    // 3. Route & Stops
    origin_address: '',
    origin_city: '',
    origin_state: '',
    origin_zip: '',
    origin_country: 'USA',
    pickup_date: '',
    pickup_time_start: '08:00',
    pickup_time_end: '16:00',

    destination_address: '',
    destination_city: '',
    destination_state: '',
    destination_zip: '',
    destination_country: 'USA',
    delivery_date: '',
    delivery_time_start: '09:00',
    delivery_time_end: '17:00',

    stops: [],

    // 4. Cargo Details
    commodity: '',
    cargo_description: '',
    package_count: 1,
    package_type: 'Pallets',
    gross_weight: '',
    weight_unit: 'lbs',
    dim_length: '',
    dim_width: '',
    dim_height: '',
    dim_unit: 'in',
    volume: '',
    cargo_value: '',
    equipment_type: "Dry Van (53')",
    freight_class: '70',
    special_instructions: '',
    hazmat_flag: false,
    un_number: '',
    hazard_class: '',
    placarding: '',

    // 5. Mode Specific
    road_vehicle_requirements: '',
    road_driver_notes: '',
    road_strict_appointment: false,

    ocean_pol: '',
    ocean_pod: '',
    ocean_receipt_place: '',
    ocean_delivery_place: '',
    ocean_shipment_type: 'FCL',
    ocean_container_type: "40' Standard",
    ocean_container_qty: 1,
    ocean_vessel_name: '',
    ocean_voyage_number: '',
    ocean_etd: '',
    ocean_eta: '',
    ocean_cfs_id: '',

    air_origin_airport: '',
    air_dest_airport: '',
    air_awb_number: '',
    air_flight_number: '',
    air_flight_date: '',
    air_chargeable_weight: '',

    rail_origin_ramp: '',
    rail_dest_ramp: '',
    rail_car_number: '',
    rail_schedule_number: '',

    // 6. Reference Information
    po_number: '',
    bol_number: '',
    customer_reference: '',
    internal_notes: '',
    external_instructions: '',

    // 7. Rates and Charges
    quote_amount: '',
    currency: 'USD',
    carrier_org_id: '',
    selected_quote_id: '',
    transit_time: '',
    payment_terms: 'Prepaid',
    selected_accessorials: [],

    // 8. Documents
    documents: [],
  };

  const [form, setForm] = useState(initialFormState);
  const [formErrors, setFormErrors] = useState({});

  // Roles & Permissions check
  const isPlatformAdmin = currentRoleName === 'Platform Admin';
  const isShipper = currentOrg?.type === 'shipper';
  const canCreate = isPlatformAdmin || hasPermission('shipments', 'create') || hasPermission('bookings', 'create');
  const canUpdate = isPlatformAdmin || hasPermission('shipments', 'update') || hasPermission('bookings', 'update');
  const canCancel = isPlatformAdmin || hasPermission('shipments', 'update') || hasPermission('bookings', 'cancel');
  const canSubmitCurrentForm = editingBooking ? canUpdate : canCreate;

  // Load all backend entities
  const loadData = async () => {
    try {
      setLoading(true);
      setErrorNotice('');

      const [shipmentsRes, customersRes, vendorsRes, portsRes, cfsRes, quotesRes] =
        await Promise.allSettled([
          getShipments({ limit: 100 }),
          getCustomers(),
          getVendors(),
          getPorts(),
          getCfsStations(),
          getQuotes(),
        ]);

      if (shipmentsRes.status === 'fulfilled' && shipmentsRes.value) {
        const list = Array.isArray(shipmentsRes.value)
          ? shipmentsRes.value
          : shipmentsRes.value?.data || shipmentsRes.value?.shipments || [];
        setShipmentsList(list);
      } else {
        // Fallback to sample bookings if real backend list is empty
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

      if (quotesRes.status === 'fulfilled' && quotesRes.value) {
        const quotes = Array.isArray(quotesRes.value)
          ? quotesRes.value
          : quotesRes.value?.data || quotesRes.value?.quotes || [];
        setQuotesList(quotes);
      }
    } catch (err) {
      console.warn('Data fetch warning:', err);
      setErrorNotice('Could not load complete backend data. Operating in offline/cached mode.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered Bookings List
  const filteredBookings = useMemo(() => {
    return shipmentsList.filter((item) => {
      const mode = (item.freight_details?.mode || item.mode || 'inland').toLowerCase();
      const status = (item.status || 'draft').toLowerCase();
      const ref = (item.reference_number || item.reference || item.id || '').toLowerCase();
      const shipper = (item.shipper?.legal_name || item.name || '').toLowerCase();
      const origin = (
        typeof item.origin === 'object'
          ? item.origin?.city || item.origin?.address || ''
          : item.origin || ''
      ).toLowerCase();
      const dest = (
        typeof item.destination === 'object'
          ? item.destination?.city || item.destination?.address || ''
          : item.destination || ''
      ).toLowerCase();
      const query = searchQuery.toLowerCase().trim();

      const matchesMode = modeFilter === 'all' || mode.includes(modeFilter);
      const matchesStatus =
        statusFilter === 'all' || status === statusFilter.toLowerCase();
      const matchesSearch =
        !query ||
        ref.includes(query) ||
        shipper.includes(query) ||
        origin.includes(query) ||
        dest.includes(query);

      return matchesMode && matchesStatus && matchesSearch;
    });
  }, [shipmentsList, modeFilter, statusFilter, searchQuery]);

  // KPI Calculations
  const kpiStats = useMemo(() => {
    const total = shipmentsList.length;
    const active = shipmentsList.filter((s) =>
      ['booked', 'dispatched', 'in_transit'].includes((s.status || '').toLowerCase())
    ).length;
    const confirmed = shipmentsList.filter((s) =>
      (s.status || '').toLowerCase() === 'booked'
    ).length;
    const drafts = shipmentsList.filter((s) =>
      (s.status || '').toLowerCase() === 'draft'
    ).length;

    return { total, active, confirmed, drafts };
  }, [shipmentsList]);

  // Open Form for New Booking
  const handleOpenNewForm = () => {
    const timeCode = Math.floor(1000 + Math.random() * 9000);
    setForm({
      ...initialFormState,
      booking_number: `BK-${new Date().getFullYear()}-${timeCode}`,
      shipper_org_id: currentOrg?.id || (customersList[0]?.id || ''),
    });
    setEditingBooking(null);
    setFormErrors({});
    setActiveTab('info');
    setIsFormOpen(true);
  };

  // Open Form to View/Edit Existing Booking
  const handleOpenEditForm = async (booking) => {
    try {
      setLoading(true);
      let details = booking;
      if (typeof booking.id === 'number') {
        try {
          const res = await getShipment(booking.id);
          if (res?.data || res?.id) details = res.data || res;
        } catch (_) {
          // Use item as is if single fetch fails
        }
      }

      // Populate form fields from shipment structure
      const freight = details.freight_details || {};
      const originObj = typeof details.origin === 'object' ? details.origin : {};
      const destObj = typeof details.destination === 'object' ? details.destination : {};
      const firstItem = details.items?.[0] || {};
      const poRef = details.references?.find((r) => r.type === 'PO')?.value || '';
      const bolRef = details.references?.find((r) => r.type === 'BOL')?.value || '';
      const custRef = details.references?.find((r) => r.type === 'customer_reference')?.value || '';

      setForm({
        ...initialFormState,
        booking_source: details.parent_shipment_id ? 'existing_shipment' : 'new',
        linked_shipment_id: details.parent_shipment_id || '',
        booking_number: details.reference_number || details.id,
        booking_date: details.created_at
          ? new Date(details.created_at).toISOString().slice(0, 10)
          : initialFormState.booking_date,
        booking_mode: freight.mode || 'inland',
        shipper_org_id: details.shipper_org_id || details.shipper?.id || '',
        status: details.status || 'draft',

        // Parties
        shipper_name: details.shipper?.legal_name || freight.shipper_name || '',
        pickup_contact_name: freight.pickup_contact_name || '',
        pickup_contact_phone: freight.pickup_contact_phone || '',
        pickup_contact_email: freight.pickup_contact_email || '',
        consignee_name: freight.consignee_name || '',
        consignee_company: freight.consignee_company || '',
        delivery_contact_name: freight.delivery_contact_name || '',
        delivery_contact_phone: freight.delivery_contact_phone || '',
        delivery_contact_email: freight.delivery_contact_email || '',
        notify_party_name: freight.notify_party_name || '',
        notify_party_email: freight.notify_party_email || '',

        // Route & Stops
        origin_address: originObj.address || originObj.address_line1 || details.origin || '',
        origin_city: originObj.city || '',
        origin_state: originObj.state || '',
        origin_zip: originObj.postal_code || originObj.zip || '',
        origin_country: originObj.country || 'USA',
        pickup_date: details.pickup_date
          ? new Date(details.pickup_date).toISOString().slice(0, 10)
          : '',
        pickup_time_start: originObj.window_start || '08:00',
        pickup_time_end: originObj.window_end || '16:00',

        destination_address: destObj.address || destObj.address_line1 || details.destination || '',
        destination_city: destObj.city || '',
        destination_state: destObj.state || '',
        destination_zip: destObj.postal_code || destObj.zip || '',
        destination_country: destObj.country || 'USA',
        delivery_date: details.estimated_delivery
          ? new Date(details.estimated_delivery).toISOString().slice(0, 10)
          : '',
        delivery_time_start: destObj.window_start || '09:00',
        delivery_time_end: destObj.window_end || '17:00',

        stops: Array.isArray(details.stops)
          ? details.stops.map((s, idx) => ({
              sequence: s.sequence || idx + 1,
              type: s.type || 'pickup',
              address_line1: s.address?.address_line1 || s.address?.address || '',
              city: s.address?.city || '',
              state: s.address?.state || '',
              postal_code: s.address?.postal_code || '',
              country: s.address?.country || 'USA',
              contact_name: s.contact?.name || '',
              contact_phone: s.contact?.phone || '',
              instructions: s.instructions || '',
            }))
          : [],

        // Cargo
        commodity: firstItem.description || freight.commodity || '',
        cargo_description: firstItem.description || freight.cargo_description || '',
        package_count: firstItem.quantity || freight.package_count || 1,
        package_type: freight.package_type || 'Pallets',
        gross_weight: firstItem.weight || freight.gross_weight || '',
        weight_unit: freight.weight_unit || 'lbs',
        dim_length: firstItem.dimensions?.length || '',
        dim_width: firstItem.dimensions?.width || '',
        dim_height: firstItem.dimensions?.height || '',
        dim_unit: firstItem.dimensions?.unit || 'in',
        volume: freight.volume || '',
        cargo_value: freight.cargo_value || '',
        equipment_type: freight.equipment_type || "Dry Van (53')",
        freight_class: firstItem.freight_class || '70',
        special_instructions: freight.special_instructions || '',
        hazmat_flag: Boolean(firstItem.hazmat_flag || freight.hazmat_flag),
        un_number: firstItem.un_number || freight.un_number || '',
        hazard_class: firstItem.hazard_class || freight.hazard_class || '',
        placarding: firstItem.placarding || freight.placarding || '',

        // Mode specific
        road_vehicle_requirements: freight.road_vehicle_requirements || '',
        road_driver_notes: freight.road_driver_notes || '',
        road_strict_appointment: Boolean(freight.road_strict_appointment),

        ocean_pol: freight.ocean_pol || '',
        ocean_pod: freight.ocean_pod || '',
        ocean_receipt_place: freight.ocean_receipt_place || '',
        ocean_delivery_place: freight.ocean_delivery_place || '',
        ocean_shipment_type: freight.ocean_shipment_type || 'FCL',
        ocean_container_type: freight.ocean_container_type || "40' Standard",
        ocean_container_qty: freight.ocean_container_qty || 1,
        ocean_vessel_name: freight.ocean_vessel_name || '',
        ocean_voyage_number: freight.ocean_voyage_number || '',
        ocean_etd: freight.ocean_etd || '',
        ocean_eta: freight.ocean_eta || '',
        ocean_cfs_id: freight.ocean_cfs_id || '',

        air_origin_airport: freight.air_origin_airport || '',
        air_dest_airport: freight.air_dest_airport || '',
        air_awb_number: freight.air_awb_number || '',
        air_flight_number: freight.air_flight_number || '',
        air_flight_date: freight.air_flight_date || '',
        air_chargeable_weight: freight.air_chargeable_weight || '',

        rail_origin_ramp: freight.rail_origin_ramp || '',
        rail_dest_ramp: freight.rail_dest_ramp || '',
        rail_car_number: freight.rail_car_number || '',
        rail_schedule_number: freight.rail_schedule_number || '',

        // References
        po_number: poRef,
        bol_number: bolRef,
        customer_reference: custRef,
        internal_notes: freight.internal_notes || '',
        external_instructions: freight.external_instructions || '',

        // Rates
        quote_amount: details.quote_amount || freight.rate || '',
        currency: freight.currency || 'USD',
        carrier_org_id: details.carrier_org_id || details.carrier?.id || '',
        selected_quote_id: freight.quote_id || '',
        transit_time: freight.transit_time || '',
        payment_terms: freight.payment_terms || 'Prepaid',
        selected_accessorials: freight.selected_accessorials || [],

        documents: details.documents || freight.documents || [],
      });

      setEditingBooking(details);
      setFormErrors({});
      setActiveTab('info');
      setIsFormOpen(true);
    } catch (err) {
      notify?.(err.message || 'Error opening booking details');
    } finally {
      setLoading(false);
    }
  };

  // Prefill when an existing shipment is selected
  const handleSelectExistingShipment = (shipmentId) => {
    if (!shipmentId) {
      setForm((prev) => ({ ...prev, linked_shipment_id: '' }));
      return;
    }
    const found = shipmentsList.find(
      (s) => String(s.id) === String(shipmentId) || s.reference_number === shipmentId
    );
    if (!found) return;

    // Check if user has already entered custom route or cargo data
    const hasCustomData = Boolean(
      (form.origin_city && form.origin_city.trim()) ||
      (form.destination_city && form.destination_city.trim()) ||
      (form.commodity && form.commodity.trim())
    );

    if (hasCustomData) {
      const confirmed = window.confirm(
        `Prefilling from Shipment #${found.reference_number || found.id} will replace your currently entered route and cargo details. Do you wish to proceed?`
      );
      if (!confirmed) return;
    }

    const freight = found.freight_details || {};
    const originObj = typeof found.origin === 'object' ? found.origin : {};
    const destObj = typeof found.destination === 'object' ? found.destination : {};
    const firstItem = found.items?.[0] || {};

    setForm((prev) => ({
      ...prev,
      linked_shipment_id: found.id || found.reference_number,
      shipper_org_id: found.shipper_org_id || found.shipper?.id || prev.shipper_org_id,
      booking_mode: freight.mode || prev.booking_mode,
      origin_address: originObj.address || originObj.address_line1 || prev.origin_address,
      origin_city: originObj.city || prev.origin_city,
      origin_state: originObj.state || prev.origin_state,
      origin_zip: originObj.postal_code || originObj.zip || prev.origin_zip,
      destination_address: destObj.address || destObj.address_line1 || prev.destination_address,
      destination_city: destObj.city || prev.destination_city,
      destination_state: destObj.state || prev.destination_state,
      destination_zip: destObj.postal_code || destObj.zip || prev.destination_zip,
      pickup_date: found.pickup_date
        ? new Date(found.pickup_date).toISOString().slice(0, 10)
        : prev.pickup_date,
      delivery_date: found.estimated_delivery
        ? new Date(found.estimated_delivery).toISOString().slice(0, 10)
        : prev.delivery_date,
      commodity: firstItem.description || freight.commodity || prev.commodity,
      gross_weight: firstItem.weight || freight.gross_weight || prev.gross_weight,
      package_count: firstItem.quantity || freight.package_count || prev.package_count,
      quote_amount: found.quote_amount || prev.quote_amount,
    }));

    notify?.(`Prefilled supported fields from Shipment #${found.reference_number || found.id}`);
  };

  // Multi-stop actions
  const handleAddStop = () => {
    setForm((prev) => ({
      ...prev,
      stops: [
        ...prev.stops,
        {
          sequence: prev.stops.length + 1,
          type: 'pickup',
          facility_name: '',
          address_line1: '',
          city: '',
          state: '',
          postal_code: '',
          country: 'USA',
          contact_name: '',
          contact_phone: '',
          instructions: '',
        },
      ],
    }));
  };

  const handleRemoveStop = (idx) => {
    setForm((prev) => ({
      ...prev,
      stops: prev.stops
        .filter((_, i) => i !== idx)
        .map((s, i) => ({ ...s, sequence: i + 1 })),
    }));
  };

  const handleUpdateStop = (idx, field, value) => {
    setForm((prev) => {
      const updated = [...prev.stops];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, stops: updated };
    });
  };

  // Document upload handler (in-memory simulation metadata adhering to rules)
  const handleFileUpload = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newDocs = Array.from(files).map((f) => ({
      id: 'DOC-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      name: f.name,
      size: `${(f.size / 1024).toFixed(1)} KB`,
      type: f.type || 'Document',
      uploaded_at: new Date().toISOString(),
    }));

    setForm((prev) => ({
      ...prev,
      documents: [...(prev.documents || []), ...newDocs],
    }));

    notify?.(`${newDocs.length} document(s) attached to booking draft`);
    e.target.value = '';
  };

  const handleRemoveDocument = (docId) => {
    setForm((prev) => ({
      ...prev,
      documents: prev.documents.filter((d) => d.id !== docId),
    }));
  };

  // Helper to update form field and immediately clear its error
  const updateFormField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Close form with unsaved changes protection
  const handleCloseForm = () => {
    const isDirty =
      Boolean(form.origin_city) ||
      Boolean(form.destination_city) ||
      Boolean(form.commodity) ||
      Boolean(form.quote_amount) ||
      Boolean(form.po_number);

    if (isDirty) {
      const confirmDiscard = window.confirm(
        'You have unsaved changes in this booking form. Are you sure you want to close and discard them?'
      );
      if (!confirmDiscard) return;
    }
    setIsFormOpen(false);
  };

  // Step-Level Validation
  const validateStep = (stepId) => {
    const errors = {};

    if (stepId === 'info') {
      if (!form.shipper_org_id && !isShipper) {
        errors.shipper_org_id = 'Shipper organization is required.';
      }
      if (!form.booking_date) {
        errors.booking_date = 'Booking date is required.';
      }
      if (form.booking_source === 'existing_shipment' && !form.linked_shipment_id) {
        errors.linked_shipment_id = 'Please select an existing shipment to prefill.';
      }
    } else if (stepId === 'parties') {
      if (!form.origin_city?.trim()) {
        errors.origin_city = 'Origin city is required.';
      }
      if (!form.destination_city?.trim()) {
        errors.destination_city = 'Destination city is required.';
      }
      if (form.pickup_date && form.delivery_date) {
        if (new Date(form.delivery_date) < new Date(form.pickup_date)) {
          errors.delivery_date = 'Delivery date cannot be earlier than pickup date.';
        }
      }
    } else if (stepId === 'cargo') {
      if (form.package_count && Number(form.package_count) < 1) {
        errors.package_count = 'Package count must be at least 1.';
      }
      if (form.gross_weight && Number(form.gross_weight) <= 0) {
        errors.gross_weight = 'Gross weight must be a positive number.';
      }
      if (form.hazmat_flag) {
        if (!form.un_number?.trim()) {
          errors.un_number = 'UN Number is mandatory for hazardous materials.';
        }
        if (!form.hazard_class?.trim()) {
          errors.hazard_class = 'Hazard Class is mandatory for hazardous materials.';
        }
      }
    } else if (stepId === 'mode') {
      if (form.booking_mode === 'ocean') {
        if (form.ocean_shipment_type === 'FCL' && Number(form.ocean_container_qty) < 1) {
          errors.ocean_container_qty = 'Container quantity must be at least 1.';
        }
      } else if (form.booking_mode === 'air') {
        if (form.air_origin_airport && form.air_origin_airport.length !== 3) {
          errors.air_origin_airport = 'Origin airport must be a valid 3-letter IATA code.';
        }
        if (form.air_dest_airport && form.air_dest_airport.length !== 3) {
          errors.air_dest_airport = 'Destination airport must be a valid 3-letter IATA code.';
        }
      }
    } else if (stepId === 'rates') {
      if (form.quote_amount && Number(form.quote_amount) < 0) {
        errors.quote_amount = 'Rate cannot be negative.';
      }
    }

    setFormErrors((prev) => {
      const next = { ...prev };
      if (stepId === 'info') {
        delete next.shipper_org_id;
        delete next.booking_date;
        delete next.linked_shipment_id;
      } else if (stepId === 'parties') {
        delete next.origin_city;
        delete next.destination_city;
        delete next.delivery_date;
      } else if (stepId === 'cargo') {
        delete next.package_count;
        delete next.gross_weight;
        delete next.un_number;
        delete next.hazard_class;
      } else if (stepId === 'mode') {
        delete next.ocean_container_qty;
        delete next.air_origin_airport;
        delete next.air_dest_airport;
      } else if (stepId === 'rates') {
        delete next.quote_amount;
      }
      return { ...next, ...errors };
    });

    return Object.keys(errors).length === 0;
  };

  // Full Form Validation across all steps
  const validateForm = () => {
    let firstInvalidTab = null;
    let allValid = true;

    for (const tab of ['info', 'parties', 'cargo', 'mode', 'rates']) {
      const isValid = validateStep(tab);
      if (!isValid && !firstInvalidTab) {
        firstInvalidTab = tab;
        allValid = false;
      }
    }

    if (!allValid && firstInvalidTab) {
      setActiveTab(firstInvalidTab);
      const tabObj = FORM_TABS.find((t) => t.id === firstInvalidTab);
      notify?.(`Please complete required fields in "${tabObj?.label || firstInvalidTab}".`);
      return false;
    }
    return true;
  };

  // Continue to next step with validation gating
  const handleContinue = () => {
    const isValid = validateStep(activeTab);
    if (!isValid) {
      notify?.('Please fill in the required fields before continuing.');
      return;
    }
    const idx = FORM_TABS.findIndex((t) => t.id === activeTab);
    if (idx < FORM_TABS.length - 1) {
      setActiveTab(FORM_TABS[idx + 1].id);
    }
  };

  // Return to previous step
  const handlePrevious = () => {
    const idx = FORM_TABS.findIndex((t) => t.id === activeTab);
    if (idx > 0) {
      setActiveTab(FORM_TABS[idx - 1].id);
    }
  };

  // Initiate Save (prompts confirmation modal for booked status)
  const handleInitiateSave = (targetStatus = 'draft') => {
    if (submitting) return;

    if (targetStatus === 'booked') {
      const valid = validateForm();
      if (!valid) return;
      setShowConfirmModal(true);
      return;
    }

    // Save as draft directly
    executeSaveBooking('draft');
  };

  // Submit Handler: Saves Draft or Confirms Booking
  const executeSaveBooking = async (targetStatus = 'draft') => {
    if (submitting) return;

    if (targetStatus === 'booked' && !validateForm()) {
      notify?.('Please correct the highlighted form errors before proceeding.');
      return;
    }

    setSubmitting(true);
    try {
      // Build clean payload adhering strictly to backend models
      const stopsPayload = [];

      // Primary pickup stop
      if (form.origin_city) {
        stopsPayload.push({
          sequence: 1,
          type: 'pickup',
          address: {
            address_line1: form.origin_address || 'Terminal / Facility',
            city: form.origin_city,
            state: form.origin_state || '',
            postal_code: form.origin_zip || '',
            country: form.origin_country || 'USA',
          },
          contact: {
            name: form.pickup_contact_name || '',
            phone: form.pickup_contact_phone || '',
            email: form.pickup_contact_email || '',
          },
          appointment_window: {
            date: form.pickup_date || null,
            start: form.pickup_time_start || '08:00',
            end: form.pickup_time_end || '16:00',
          },
          instructions: form.road_driver_notes || '',
        });
      }

      // Intermediate multi-stops
      form.stops.forEach((st, idx) => {
        stopsPayload.push({
          sequence: stopsPayload.length + 1,
          type: st.type || 'pickup',
          address: {
            address_line1: st.address_line1 || 'Stop Facility',
            city: st.city,
            state: st.state || '',
            postal_code: st.postal_code || '',
            country: st.country || 'USA',
          },
          contact: {
            name: st.contact_name || '',
            phone: st.contact_phone || '',
          },
          instructions: st.instructions || '',
        });
      });

      // Primary delivery stop
      if (form.destination_city) {
        stopsPayload.push({
          sequence: stopsPayload.length + 1,
          type: 'dropoff',
          address: {
            address_line1: form.destination_address || 'Consignee Facility',
            city: form.destination_city,
            state: form.destination_state || '',
            postal_code: form.destination_zip || '',
            country: form.destination_country || 'USA',
          },
          contact: {
            name: form.delivery_contact_name || '',
            phone: form.delivery_contact_phone || '',
            email: form.delivery_contact_email || '',
          },
          appointment_window: {
            date: form.delivery_date || null,
            start: form.delivery_time_start || '09:00',
            end: form.delivery_time_end || '17:00',
          },
          instructions: form.external_instructions || '',
        });
      }

      const referencesPayload = [];
      if (form.po_number?.trim()) {
        referencesPayload.push({ type: 'PO', value: form.po_number.trim() });
      }
      if (form.bol_number?.trim()) {
        referencesPayload.push({ type: 'BOL', value: form.bol_number.trim() });
      }
      if (form.customer_reference?.trim()) {
        referencesPayload.push({ type: 'customer_reference', value: form.customer_reference.trim() });
      }

      const itemsPayload = [
        {
          description: form.commodity?.trim() || form.cargo_description?.trim() || 'General Cargo',
          weight: form.gross_weight ? Number(form.gross_weight) : null,
          quantity: form.package_count ? Number(form.package_count) : 1,
          freight_class: form.freight_class || null,
          dimensions:
            form.dim_length && form.dim_width && form.dim_height
              ? {
                  length: Number(form.dim_length),
                  width: Number(form.dim_width),
                  height: Number(form.dim_height),
                  unit: form.dim_unit,
                }
              : null,
          hazmat_flag: Boolean(form.hazmat_flag),
          un_number: form.hazmat_flag ? form.un_number : null,
          hazard_class: form.hazmat_flag ? form.hazard_class : null,
          placarding: form.hazmat_flag ? form.placarding : null,
        },
      ];

      const freightDetails = {
        mode: form.booking_mode,
        equipment_type: form.equipment_type,
        package_type: form.package_type,
        special_instructions: form.special_instructions,
        payment_terms: form.payment_terms,
        currency: form.currency,
        carrier_id: form.carrier_org_id || null,
        transit_time: form.transit_time,
        accessorials: form.selected_accessorials,
        shipper_name: form.shipper_name,
        pickup_contact_name: form.pickup_contact_name,
        pickup_contact_phone: form.pickup_contact_phone,
        consignee_name: form.consignee_name,
        delivery_contact_name: form.delivery_contact_name,
        delivery_contact_phone: form.delivery_contact_phone,
        internal_notes: form.internal_notes,
        documents: form.documents || [],

        // Mode specific fields stored structured in freight_details
        ...(form.booking_mode === 'inland' && {
          road_vehicle_requirements: form.road_vehicle_requirements,
          road_driver_notes: form.road_driver_notes,
          road_strict_appointment: form.road_strict_appointment,
        }),
        ...(form.booking_mode === 'ocean' && {
          ocean_pol: form.ocean_pol,
          ocean_pod: form.ocean_pod,
          ocean_receipt_place: form.ocean_receipt_place,
          ocean_delivery_place: form.ocean_delivery_place,
          ocean_shipment_type: form.ocean_shipment_type,
          ocean_container_type: form.ocean_container_type,
          ocean_container_qty: form.ocean_container_qty,
          ocean_vessel_name: form.ocean_vessel_name,
          ocean_voyage_number: form.ocean_voyage_number,
          ocean_etd: form.ocean_etd,
          ocean_eta: form.ocean_eta,
          ocean_cfs_id: form.ocean_cfs_id,
        }),
        ...(form.booking_mode === 'air' && {
          air_origin_airport: form.air_origin_airport,
          air_dest_airport: form.air_dest_airport,
          air_awb_number: form.air_awb_number,
          air_flight_number: form.air_flight_number,
          air_flight_date: form.air_flight_date,
          air_chargeable_weight: form.air_chargeable_weight,
        }),
        ...(form.booking_mode === 'rail' && {
          rail_origin_ramp: form.rail_origin_ramp,
          rail_dest_ramp: form.rail_dest_ramp,
          rail_car_number: form.rail_car_number,
          rail_schedule_number: form.rail_schedule_number,
        }),
      };

      const resolvedShipperOrgId = isShipper
        ? Number(currentOrg?.id || form.shipper_org_id)
        : Number(form.shipper_org_id);

      const backendPayload = {
        shipper_org_id: resolvedShipperOrgId,
        reference_number: form.booking_number?.trim() || undefined,
        carrier_org_id: form.carrier_org_id ? Number(form.carrier_org_id) : undefined,
        quote_amount: form.quote_amount ? Number(form.quote_amount) : undefined,
        pickup_date: form.pickup_date ? new Date(form.pickup_date).toISOString() : undefined,
        estimated_delivery: form.delivery_date ? new Date(form.delivery_date).toISOString() : undefined,
        parent_shipment_id:
          form.booking_source === 'existing_shipment' && form.linked_shipment_id
            ? Number(form.linked_shipment_id)
            : undefined,
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
        freight_details: freightDetails,
        stops: stopsPayload,
        items: itemsPayload,
        references: referencesPayload,
      };

      let result = null;
      if (editingBooking && typeof editingBooking.id === 'number') {
        // Update existing booking
        result = await updateShipment(editingBooking.id, backendPayload);

        if (targetStatus === 'booked' && editingBooking.status !== 'booked') {
          const currentStatus = (editingBooking.status || 'draft').toLowerCase();
          try {
            if (currentStatus === 'draft') {
              await updateShipmentStatus(editingBooking.id, { status: 'quoted' });
              await updateShipmentStatus(editingBooking.id, { status: 'booked' });
            } else if (currentStatus === 'quoted') {
              await updateShipmentStatus(editingBooking.id, { status: 'booked' });
            }
          } catch (statusErr) {
            console.warn('Status transition notice:', statusErr);
            notify?.(`Booking updated, but status notice: ${statusErr.message}`);
          }
        }
        notify?.(`Booking #${form.booking_number} updated successfully!`);
      } else {
        // Create new booking
        result = await createShipment(backendPayload);
        const createdId = result?.data?.id || result?.id;
        if (createdId && targetStatus === 'booked') {
          try {
            await updateShipmentStatus(createdId, { status: 'quoted' });
            await updateShipmentStatus(createdId, { status: 'booked' });
          } catch (statusErr) {
            console.warn('Status transition notice:', statusErr);
            notify?.(`Booking #${form.booking_number} saved as draft (lifecycle notice: ${statusErr.message})`);
            setIsFormOpen(false);
            await loadData();
            return;
          }
        }
        notify?.(
          targetStatus === 'booked'
            ? `Booking #${form.booking_number} created and confirmed!`
            : `Booking draft saved successfully!`
        );
      }

      setIsFormOpen(false);
      await loadData();
    } catch (err) {
      console.error('Save booking error:', err);
      notify?.(err.message || 'Failed to save booking. Please review fields.');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel Booking Action
  const handleConfirmCancel = async () => {
    if (!cancelModalBooking) return;
    try {
      setSubmitting(true);
      if (typeof cancelModalBooking.id === 'number') {
        await cancelShipment(cancelModalBooking.id, { reason: cancelReason });
      }
      notify?.(`Booking #${cancelModalBooking.reference_number || cancelModalBooking.id} cancelled.`);
      setCancelModalBooking(null);
      setCancelReason('');
      await loadData();
    } catch (err) {
      notify?.(err.message || 'Failed to cancel booking.');
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate total price with accessorials
  const calculatedTotalRate = useMemo(() => {
    const base = Number(form.quote_amount) || 0;
    const accessorialTotal = form.selected_accessorials.reduce((sum, accId) => {
      const match = STANDARD_ACCESSORIALS.find((a) => a.id === accId);
      return sum + (match?.defaultFee || 0);
    }, 0);
    return base + accessorialTotal;
  }, [form.quote_amount, form.selected_accessorials]);

  return (
    <div className="bk-container">
      {/* Top Header */}
      <div className="bk-header-row">
        <div className="bk-header-title">
          <h1>Booking Management</h1>
          <p>
            Centralized booking desk for Inland, Ocean, Air, and Rail freight.
            Create bookings directly or lock in confirmed quotes.
          </p>
        </div>
        <div className="bk-header-actions">
          <button
            type="button"
            className="bk-btn secondary"
            onClick={loadData}
            disabled={loading}
            title="Refresh bookings"
          >
            <ArrowClockwise size={16} />
            <span>Refresh</span>
          </button>
          {canCreate && (
            <button
              type="button"
              className="bk-btn primary"
              onClick={handleOpenNewForm}
            >
              <Plus size={18} weight="bold" />
              <span>New Booking</span>
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

      {/* KPI Cards */}
      <div className="bk-kpi-grid">
        <div className="bk-kpi-card">
          <div className="bk-kpi-icon blue">
            <CalendarCheck />
          </div>
          <div className="bk-kpi-info">
            <span className="bk-kpi-label">Total Bookings</span>
            <span className="bk-kpi-value">{kpiStats.total}</span>
          </div>
        </div>

        <div className="bk-kpi-card">
          <div className="bk-kpi-icon green">
            <CheckCircle />
          </div>
          <div className="bk-kpi-info">
            <span className="bk-kpi-label">Confirmed / Locked</span>
            <span className="bk-kpi-value">{kpiStats.confirmed}</span>
          </div>
        </div>

        <div className="bk-kpi-card">
          <div className="bk-kpi-icon purple">
            <Truck />
          </div>
          <div className="bk-kpi-info">
            <span className="bk-kpi-label">Active / In Transit</span>
            <span className="bk-kpi-value">{kpiStats.active}</span>
          </div>
        </div>

        <div className="bk-kpi-card">
          <div className="bk-kpi-icon amber">
            <Clock />
          </div>
          <div className="bk-kpi-info">
            <span className="bk-kpi-label">Draft Orders</span>
            <span className="bk-kpi-value">{kpiStats.drafts}</span>
          </div>
        </div>
      </div>

      {/* Toolbar / Filters */}
      <div className="bk-toolbar">
        <div className="bk-toolbar-left">
          <div className="bk-search-wrap">
            <MagnifyingGlass size={17} />
            <input
              type="text"
              className="bk-search-input"
              placeholder="Search reference, customer, origin, destination..."
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
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="booked">Booked</option>
            <option value="dispatched">Dispatched</option>
            <option value="in_transit">In Transit</option>
            <option value="delivered">Delivered</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bk-table-card">
        <div className="bk-table-responsive">
          <table className="bk-table">
            <thead>
              <tr>
                <th>Booking Ref #</th>
                <th>Mode</th>
                <th>Customer / Shipper</th>
                <th>Route (Origin ➔ Destination)</th>
                <th>Pickup Date</th>
                <th>Carrier</th>
                <th>Rate (USD)</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
                      <Clock size={18} />
                      <span>Loading bookings from FMS backend...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="bk-empty-state">
                      <CalendarCheck size={42} />
                      <h3>No bookings found</h3>
                      <p>Try adjusting your search filters or create a new booking.</p>
                      {canCreate && (
                        <button
                          type="button"
                          className="bk-btn primary"
                          onClick={handleOpenNewForm}
                        >
                          <Plus size={16} />
                          <span>Create Booking</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBookings.map((bk) => {
                  const mode = (bk.freight_details?.mode || bk.mode || 'inland').toLowerCase();
                  const originCity =
                    typeof bk.origin === 'object'
                      ? bk.origin?.city || bk.origin?.address || '—'
                      : bk.origin || '—';
                  const destCity =
                    typeof bk.destination === 'object'
                      ? bk.destination?.city || bk.destination?.address || '—'
                      : bk.destination || '—';
                  const status = (bk.status || 'draft').toLowerCase();

                  return (
                    <tr key={bk.id || bk.reference_number}>
                      <td className="bk-ref-cell">
                        <strong>{bk.reference_number || bk.reference || `#${bk.id}`}</strong>
                        <small>{bk.parent_shipment_id ? `Linked #${bk.parent_shipment_id}` : 'Direct Booking'}</small>
                      </td>
                      <td>
                        <span className={`bk-mode-badge ${mode}`}>
                          {mode === 'ocean' && <Boat size={14} />}
                          {mode === 'air' && <AirplaneTilt size={14} />}
                          {mode === 'rail' && <Train size={14} />}
                          {(mode === 'inland' || mode === 'road') && <Truck size={14} />}
                          <span>{mode}</span>
                        </span>
                      </td>
                      <td>
                        <strong>{bk.shipper?.legal_name || bk.name || 'Enterprise Shipper'}</strong>
                      </td>
                      <td>
                        <span>{originCity}</span>
                        <span style={{ color: '#94a3b8', margin: '0 6px' }}>➔</span>
                        <span>{destCity}</span>
                      </td>
                      <td>
                        {bk.pickup_date
                          ? new Date(bk.pickup_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : 'TBD'}
                      </td>
                      <td>
                        {bk.carrier?.legal_name || bk.provider || bk.partner || (
                          <span style={{ color: '#94a3b8' }}>Unassigned</span>
                        )}
                      </td>
                      <td>
                        <strong>
                          {bk.quote_amount
                            ? `$${Number(bk.quote_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                            : '—'}
                        </strong>
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
                            title="View / Edit Booking"
                            onClick={() => handleOpenEditForm(bk)}
                          >
                            <NotePencil size={16} />
                          </button>
                          {canCancel && status !== 'cancelled' && status !== 'delivered' && (
                            <button
                              type="button"
                              className="bk-icon-btn danger"
                              title="Cancel Booking"
                              onClick={() => setCancelModalBooking(bk)}
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
          ONE COMMON REUSABLE BOOKING FORM MODAL
          ===================================================================== */}
      {isFormOpen && (
        <div className="bk-modal-backdrop" onClick={handleCloseForm}>
          <div
            className="bk-modal-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bk-form-title"
          >
            {/* Modal Header */}
            <div className="bk-modal-header">
              <div className="bk-modal-title">
                <div className="bk-modal-title-icon">
                  <CalendarCheck />
                </div>
                <div>
                  <h2 id="bk-form-title">
                    {editingBooking ? `Edit Booking ${form.booking_number}` : 'New Freight Booking'}
                  </h2>
                  <p>
                    Universal multi-mode booking form · Inland, Ocean, Air, and Rail
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="bk-close-btn"
                aria-label="Close booking form"
                onClick={handleCloseForm}
              >
                <X size={20} />
              </button>
            </div>

            {/* Step Progress Indicator Bar */}
            <div className="bk-progress-bar-wrap">
              <div className="bk-progress-meta">
                <span className="bk-progress-step-text">
                  <span style={{ color: '#2563eb', fontWeight: 700 }}>
                    Step {FORM_TABS.findIndex((t) => t.id === activeTab) + 1} of {FORM_TABS.length}:
                  </span>{' '}
                  {FORM_TABS.find((t) => t.id === activeTab)?.label.replace(/^\d+\.\s*/, '')}
                </span>
                <span className="bk-progress-pct">
                  {Math.round(((FORM_TABS.findIndex((t) => t.id === activeTab) + 1) / FORM_TABS.length) * 100)}% Completed
                </span>
              </div>
              <div className="bk-progress-track">
                <div
                  className="bk-progress-fill"
                  style={{
                    width: `${((FORM_TABS.findIndex((t) => t.id === activeTab) + 1) / FORM_TABS.length) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* Step Navigation Tabs */}
            <div className="bk-tabs-nav" role="tablist">
              {FORM_TABS.map((tab, idx) => {
                const currentIdx = FORM_TABS.findIndex((t) => t.id === activeTab);
                const isCompleted = idx < currentIdx;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`bk-tab-btn ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                    onClick={() => {
                      if (idx > currentIdx && !validateStep(activeTab)) {
                        notify?.('Please complete the required fields in this step before advancing.');
                        return;
                      }
                      setActiveTab(tab.id);
                    }}
                  >
                    <span className="bk-tab-step-num">
                      {isCompleted ? <Check size={12} weight="bold" /> : idx + 1}
                    </span>
                    <span>{tab.label.replace(/^\d+\.\s*/, '')}</span>
                  </button>
                );
              })}
            </div>

            {/* Modal Body */}
            <div className="bk-modal-body">
              {/* ==========================================
                  TAB 1: BOOKING INFORMATION
                  ========================================== */}
              {activeTab === 'info' && (
                <div className="bk-section">
                  <div className="bk-section-header">
                    <h3>Booking Source & Freight Mode</h3>
                    <p>Select whether this is a new booking or prefilled from an existing shipment.</p>
                  </div>

                  {/* Booking Source Choice */}
                  <div className="bk-source-box">
                    <div>
                      <strong>Booking Source:</strong>
                      <span style={{ fontSize: '12.5px', color: '#64748b', marginLeft: '8px' }}>
                        Create from scratch or link an existing shipment record
                      </span>
                    </div>
                    <div className="bk-source-radios">
                      <label className="bk-source-radio-label">
                        <input
                          type="radio"
                          name="booking_source"
                          value="new"
                          checked={form.booking_source === 'new'}
                          onChange={() => updateFormField('booking_source', 'new')}
                        />
                        <span>New Booking</span>
                      </label>
                      <label className="bk-source-radio-label">
                        <input
                          type="radio"
                          name="booking_source"
                          value="existing_shipment"
                          checked={form.booking_source === 'existing_shipment'}
                          onChange={() => updateFormField('booking_source', 'existing_shipment')}
                        />
                        <span>From Existing Shipment</span>
                      </label>
                    </div>
                  </div>

                  {/* Linked Shipment Dropdown (Conditional) */}
                  {form.booking_source === 'existing_shipment' && (
                    <div className="bk-field full">
                      <label>
                        Select Existing Shipment to Prefill <span className="bk-badge-req">Required</span>
                      </label>
                      <select
                        className={`bk-select ${formErrors.linked_shipment_id ? 'has-error' : ''}`}
                        value={form.linked_shipment_id}
                        onChange={(e) => handleSelectExistingShipment(e.target.value)}
                      >
                        <option value="">-- Choose an active shipment --</option>
                        {shipmentsList.map((s) => (
                          <option key={s.id || s.reference_number} value={s.id || s.reference_number}>
                            {s.reference_number || `#${s.id}`} — {s.shipper?.legal_name || s.name || 'Shipper'} (
                            {typeof s.origin === 'object' ? s.origin?.city : s.origin} ➔{' '}
                            {typeof s.destination === 'object' ? s.destination?.city : s.destination})
                          </option>
                        ))}
                      </select>
                      {formErrors.linked_shipment_id && (
                        <span className="bk-field-error-msg">{formErrors.linked_shipment_id}</span>
                      )}
                      <div className="bk-term-helper">
                        <Info size={13} />
                        <span>Prefills customer, route, cargo, and rate data from an existing shipment record without silently overwriting.</span>
                      </div>
                    </div>
                  )}

                  {/* Mode Selector Cards */}
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      Freight Booking Mode <span className="bk-badge-req">Required</span>
                    </label>
                    <div className="bk-mode-selector-grid">
                      {FREIGHT_MODES.map((mode) => {
                        const Icon = mode.icon;
                        const isSelected = form.booking_mode === mode.id;
                        return (
                          <div
                            key={mode.id}
                            className={`bk-mode-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => updateFormField('booking_mode', mode.id)}
                          >
                            <div className="bk-mode-card-icon">
                              <Icon size={30} />
                            </div>
                            <strong>{mode.name}</strong>
                            <span className="bk-mode-card-status">{mode.statusBadge}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Booking Metadata Grid */}
                  <div className="bk-grid-3">
                    <div className="bk-field">
                      <label>
                        Booking Number <span className="bk-badge-opt">Auto-generated</span>
                      </label>
                      <input
                        type="text"
                        className="bk-input"
                        value={form.booking_number}
                        readOnly
                        disabled
                      />
                    </div>

                    <div className="bk-field">
                      <label>
                        Booking Date <span className="bk-badge-req">Required</span>
                      </label>
                      <input
                        type="date"
                        className={`bk-input ${formErrors.booking_date ? 'has-error' : ''}`}
                        value={form.booking_date}
                        onChange={(e) => updateFormField('booking_date', e.target.value)}
                      />
                      {formErrors.booking_date && (
                        <span className="bk-field-error-msg">{formErrors.booking_date}</span>
                      )}
                    </div>

                    <div className="bk-field">
                      <label>
                        Customer / Shipper Org <span className="bk-badge-req">Required</span>
                      </label>
                      <select
                        className={`bk-select ${formErrors.shipper_org_id ? 'has-error' : ''}`}
                        value={form.shipper_org_id}
                        onChange={(e) => updateFormField('shipper_org_id', e.target.value)}
                        disabled={isShipper}
                      >
                        <option value="">-- Select Shipper --</option>
                        {customersList.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.legal_name} {c.tax_id ? `(Tax ID: ${c.tax_id})` : ''}
                          </option>
                        ))}
                      </select>
                      {formErrors.shipper_org_id && (
                        <span className="bk-field-error-msg">{formErrors.shipper_org_id}</span>
                      )}
                      <div className="bk-term-helper">
                        <Info size={13} />
                        <span>The contracting commercial party responsible for the booking.</span>
                      </div>
                    </div>
                  </div>

                  <div className="bk-grid-3">
                    <div className="bk-field">
                      <label>
                        Booking Status <span className="bk-badge-opt">System</span>
                      </label>
                      <input
                        type="text"
                        className="bk-input"
                        value={form.status.toUpperCase()}
                        readOnly
                        disabled
                      />
                    </div>

                    <div className="bk-field">
                      <label>
                        Created By <span className="bk-badge-opt">System</span>
                      </label>
                      <input
                        type="text"
                        className="bk-input"
                        value={currentUser?.name || currentUser?.email || 'Logged In Operator'}
                        readOnly
                        disabled
                      />
                    </div>

                    <div className="bk-field">
                      <label>
                        Organization Tenant <span className="bk-badge-opt">System</span>
                      </label>
                      <input
                        type="text"
                        className="bk-input"
                        value={currentOrg?.legal_name || 'Harbor FMS Enterprise'}
                        readOnly
                        disabled
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ==========================================
                  TAB 2: PARTIES & ROUTE
                  ========================================== */}
              {activeTab === 'parties' && (
                <div className="bk-section">
                  <div className="bk-section-header">
                    <h3>Shipper & Consignee Parties</h3>
                    <p>Enter pickup and delivery contact parties and primary origin/destination.</p>
                  </div>

                  <div className="bk-grid-2">
                    {/* Shipper Party */}
                    <div className="bk-field" style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px' }}>
                      <strong style={{ fontSize: '14px', color: '#0f172a', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Buildings size={16} /> Shipper (Pickup Party)
                      </strong>
                      <div className="bk-field">
                        <label>
                          Company / Facility Name <span className="bk-badge-opt">Optional</span>
                        </label>
                        <input
                          type="text"
                          className="bk-input"
                          placeholder="e.g. Acme Logistics Hub"
                          value={form.shipper_name}
                          onChange={(e) => updateFormField('shipper_name', e.target.value)}
                        />
                      </div>
                      <div className="bk-field">
                        <label>
                          Pickup Contact Person <span className="bk-badge-opt">Optional</span>
                        </label>
                        <input
                          type="text"
                          className="bk-input"
                          placeholder="e.g. John Doe"
                          value={form.pickup_contact_name}
                          onChange={(e) => updateFormField('pickup_contact_name', e.target.value)}
                        />
                      </div>
                      <div className="bk-grid-2">
                        <div className="bk-field">
                          <label>
                            Phone <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="tel"
                            className="bk-input"
                            placeholder="+1 (555) 000-0000"
                            value={form.pickup_contact_phone}
                            onChange={(e) => updateFormField('pickup_contact_phone', e.target.value)}
                          />
                        </div>
                        <div className="bk-field">
                          <label>
                            Email <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="email"
                            className="bk-input"
                            placeholder="shipping@company.com"
                            value={form.pickup_contact_email}
                            onChange={(e) => updateFormField('pickup_contact_email', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Consignee Party */}
                    <div className="bk-field" style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px' }}>
                      <strong style={{ fontSize: '14px', color: '#0f172a', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Buildings size={16} /> Consignee (Delivery Party)
                      </strong>
                      <div className="bk-field">
                        <label>
                          Company / Receiver Name <span className="bk-badge-opt">Optional</span>
                        </label>
                        <input
                          type="text"
                          className="bk-input"
                          placeholder="e.g. Metro Distribution Center"
                          value={form.consignee_name}
                          onChange={(e) => updateFormField('consignee_name', e.target.value)}
                        />
                      </div>
                      <div className="bk-field">
                        <label>
                          Delivery Contact Person <span className="bk-badge-opt">Optional</span>
                        </label>
                        <input
                          type="text"
                          className="bk-input"
                          placeholder="e.g. Jane Smith"
                          value={form.delivery_contact_name}
                          onChange={(e) => updateFormField('delivery_contact_name', e.target.value)}
                        />
                      </div>
                      <div className="bk-grid-2">
                        <div className="bk-field">
                          <label>
                            Phone <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="tel"
                            className="bk-input"
                            placeholder="+1 (555) 111-2222"
                            value={form.delivery_contact_phone}
                            onChange={(e) => updateFormField('delivery_contact_phone', e.target.value)}
                          />
                        </div>
                        <div className="bk-field">
                          <label>
                            Email <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="email"
                            className="bk-input"
                            placeholder="receiving@company.com"
                            value={form.delivery_contact_email}
                            onChange={(e) => updateFormField('delivery_contact_email', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Primary Route Locations */}
                  <div className="bk-section-header" style={{ marginTop: '12px' }}>
                    <h3>Primary Route & Appointment Windows</h3>
                  </div>

                  <div className="bk-grid-2">
                    {/* Origin Details */}
                    <div className="bk-field">
                      <label>
                        Origin Address Line 1 <span className="bk-badge-opt">Optional</span>
                      </label>
                      <input
                        type="text"
                        className="bk-input"
                        placeholder="123 Warehouse Way"
                        value={form.origin_address}
                        onChange={(e) => updateFormField('origin_address', e.target.value)}
                      />
                      <div className="bk-grid-3" style={{ marginTop: '6px' }}>
                        <div className="bk-field">
                          <label>
                            Origin City <span className="bk-badge-req">Required</span>
                          </label>
                          <input
                            type="text"
                            className={`bk-input ${formErrors.origin_city ? 'has-error' : ''}`}
                            placeholder="Chicago"
                            value={form.origin_city}
                            onChange={(e) => updateFormField('origin_city', e.target.value)}
                          />
                          {formErrors.origin_city && (
                            <span className="bk-field-error-msg">{formErrors.origin_city}</span>
                          )}
                        </div>
                        <div className="bk-field">
                          <label>
                            State <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="text"
                            className="bk-input"
                            placeholder="IL"
                            value={form.origin_state}
                            onChange={(e) => updateFormField('origin_state', e.target.value)}
                          />
                        </div>
                        <div className="bk-field">
                          <label>
                            Zip <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="text"
                            className="bk-input"
                            placeholder="60601"
                            value={form.origin_zip}
                            onChange={(e) => updateFormField('origin_zip', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="bk-grid-3" style={{ marginTop: '6px' }}>
                        <div className="bk-field">
                          <label>
                            Pickup Date <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="date"
                            className="bk-input"
                            value={form.pickup_date}
                            onChange={(e) => updateFormField('pickup_date', e.target.value)}
                          />
                          <div className="bk-term-helper">
                            <Info size={13} />
                            <span>Scheduled loading date at origin.</span>
                          </div>
                        </div>
                        <div className="bk-field">
                          <label>
                            Window Start <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="time"
                            className="bk-input"
                            value={form.pickup_time_start}
                            onChange={(e) => updateFormField('pickup_time_start', e.target.value)}
                          />
                        </div>
                        <div className="bk-field">
                          <label>
                            Window End <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="time"
                            className="bk-input"
                            value={form.pickup_time_end}
                            onChange={(e) => updateFormField('pickup_time_end', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Destination Details */}
                    <div className="bk-field">
                      <label>
                        Destination Address Line 1 <span className="bk-badge-opt">Optional</span>
                      </label>
                      <input
                        type="text"
                        className="bk-input"
                        placeholder="789 Distribution Blvd"
                        value={form.destination_address}
                        onChange={(e) => updateFormField('destination_address', e.target.value)}
                      />
                      <div className="bk-grid-3" style={{ marginTop: '6px' }}>
                        <div className="bk-field">
                          <label>
                            Destination City <span className="bk-badge-req">Required</span>
                          </label>
                          <input
                            type="text"
                            className={`bk-input ${formErrors.destination_city ? 'has-error' : ''}`}
                            placeholder="Dallas"
                            value={form.destination_city}
                            onChange={(e) => updateFormField('destination_city', e.target.value)}
                          />
                          {formErrors.destination_city && (
                            <span className="bk-field-error-msg">{formErrors.destination_city}</span>
                          )}
                        </div>
                        <div className="bk-field">
                          <label>
                            State <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="text"
                            className="bk-input"
                            placeholder="TX"
                            value={form.destination_state}
                            onChange={(e) => updateFormField('destination_state', e.target.value)}
                          />
                        </div>
                        <div className="bk-field">
                          <label>
                            Zip <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="text"
                            className="bk-input"
                            placeholder="75201"
                            value={form.destination_zip}
                            onChange={(e) => updateFormField('destination_zip', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="bk-grid-3" style={{ marginTop: '6px' }}>
                        <div className="bk-field">
                          <label>
                            Delivery Date <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="date"
                            className={`bk-input ${formErrors.delivery_date ? 'has-error' : ''}`}
                            value={form.delivery_date}
                            onChange={(e) => updateFormField('delivery_date', e.target.value)}
                          />
                          {formErrors.delivery_date && (
                            <span className="bk-field-error-msg">{formErrors.delivery_date}</span>
                          )}
                          <div className="bk-term-helper">
                            <Info size={13} />
                            <span>Estimated arrival date at destination.</span>
                          </div>
                        </div>
                        <div className="bk-field">
                          <label>
                            Window Start <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="time"
                            className="bk-input"
                            value={form.delivery_time_start}
                            onChange={(e) => updateFormField('delivery_time_start', e.target.value)}
                          />
                        </div>
                        <div className="bk-field">
                          <label>
                            Window End <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="time"
                            className="bk-input"
                            value={form.delivery_time_end}
                            onChange={(e) => updateFormField('delivery_time_end', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Multi-Stop Sequence Manager */}
                  <div className="bk-stops-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>Intermediate Multi-Stops</strong>
                        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                          Add intermediate pickup or drop-off stops along the route.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="bk-btn secondary"
                        onClick={handleAddStop}
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        <Plus size={14} /> Add Stop
                      </button>
                    </div>

                    {form.stops.length === 0 ? (
                      <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '6px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                        No intermediate stops added. (Direct point-to-point shipment).
                      </div>
                    ) : (
                      form.stops.map((stop, idx) => (
                        <div key={idx} className="bk-stop-item">
                          <div className="bk-stop-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className={`bk-stop-tag ${stop.type}`}>
                                Stop #{stop.sequence} ({stop.type.toUpperCase()})
                              </span>
                              <select
                                className="bk-select"
                                style={{ width: '130px', padding: '4px 8px', height: '30px', fontSize: '12px' }}
                                value={stop.type}
                                onChange={(e) => handleUpdateStop(idx, 'type', e.target.value)}
                              >
                                <option value="pickup">Pickup</option>
                                <option value="dropoff">Drop-off</option>
                              </select>
                            </div>
                            <button
                              type="button"
                              className="bk-icon-btn danger"
                              onClick={() => handleRemoveStop(idx)}
                              title="Remove Stop"
                            >
                              <Trash size={14} />
                            </button>
                          </div>

                          <div className="bk-grid-4">
                            <div className="bk-field">
                              <label>Address</label>
                              <input
                                type="text"
                                className="bk-input"
                                placeholder="Stop Address"
                                value={stop.address_line1}
                                onChange={(e) => handleUpdateStop(idx, 'address_line1', e.target.value)}
                              />
                            </div>
                            <div className="bk-field">
                              <label>City</label>
                              <input
                                type="text"
                                className="bk-input"
                                placeholder="City"
                                value={stop.city}
                                onChange={(e) => handleUpdateStop(idx, 'city', e.target.value)}
                              />
                            </div>
                            <div className="bk-field">
                              <label>Contact Name</label>
                              <input
                                type="text"
                                className="bk-input"
                                placeholder="Contact"
                                value={stop.contact_name}
                                onChange={(e) => handleUpdateStop(idx, 'contact_name', e.target.value)}
                              />
                            </div>
                            <div className="bk-field">
                              <label>Special Instructions</label>
                              <input
                                type="text"
                                className="bk-input"
                                placeholder="Instructions"
                                value={stop.instructions}
                                onChange={(e) => handleUpdateStop(idx, 'instructions', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ==========================================
                  TAB 3: CARGO DETAILS
                  ========================================== */}
              {activeTab === 'cargo' && (
                <div className="bk-section">
                  <div className="bk-section-header">
                    <h3>Cargo Specifications & Packaging</h3>
                    <p>Enter physical cargo dimensions, weights, vehicle requirements and hazmat declarations.</p>
                  </div>

                  <div className="bk-grid-3">
                    <div className="bk-field">
                      <label>
                        Commodity / Product Name <span className="bk-badge-opt">Optional</span>
                      </label>
                      <input
                        type="text"
                        className="bk-input"
                        placeholder="e.g. Industrial Automation Valves"
                        value={form.commodity}
                        onChange={(e) => updateFormField('commodity', e.target.value)}
                      />
                    </div>

                    <div className="bk-field">
                      <label>
                        Equipment / Vehicle Type <span className="bk-badge-opt">Optional</span>
                      </label>
                      <select
                        className="bk-select"
                        value={form.equipment_type}
                        onChange={(e) => updateFormField('equipment_type', e.target.value)}
                      >
                        {EQUIPMENT_TYPES.map((eq) => (
                          <option key={eq} value={eq}>{eq}</option>
                        ))}
                      </select>
                      <div className="bk-term-helper">
                        <Info size={13} />
                        <span>Trailer or container specification (e.g. 53' Dry Van, Reefer, Flatbed).</span>
                      </div>
                    </div>

                    <div className="bk-field">
                      <label>
                        Freight Classification (LTL) <span className="bk-badge-opt">Optional</span>
                      </label>
                      <select
                        className="bk-select"
                        value={form.freight_class}
                        onChange={(e) => updateFormField('freight_class', e.target.value)}
                      >
                        {LTL_CLASSES.map((fc) => (
                          <option key={fc} value={fc}>Class {fc}</option>
                        ))}
                      </select>
                      <div className="bk-term-helper">
                        <Info size={13} />
                        <span>Standard NMFC class (50 to 500) based on cargo density and handling.</span>
                      </div>
                    </div>
                  </div>

                  <div className="bk-grid-4">
                    <div className="bk-field">
                      <label>
                        Package Count <span className="bk-badge-opt">Optional</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        className={`bk-input ${formErrors.package_count ? 'has-error' : ''}`}
                        value={form.package_count}
                        onChange={(e) => updateFormField('package_count', e.target.value)}
                      />
                      {formErrors.package_count && (
                        <span className="bk-field-error-msg">{formErrors.package_count}</span>
                      )}
                    </div>

                    <div className="bk-field">
                      <label>
                        Packaging Type <span className="bk-badge-opt">Optional</span>
                      </label>
                      <select
                        className="bk-select"
                        value={form.package_type}
                        onChange={(e) => updateFormField('package_type', e.target.value)}
                      >
                        {PACKAGE_TYPES.map((pt) => (
                          <option key={pt} value={pt}>{pt}</option>
                        ))}
                      </select>
                    </div>

                    <div className="bk-field">
                      <label>
                        Gross Weight <span className="bk-badge-opt">Optional</span>
                      </label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={`bk-input ${formErrors.gross_weight ? 'has-error' : ''}`}
                          placeholder="e.g. 15000"
                          value={form.gross_weight}
                          onChange={(e) => updateFormField('gross_weight', e.target.value)}
                        />
                        <select
                          className="bk-select"
                          style={{ width: '80px' }}
                          value={form.weight_unit}
                          onChange={(e) => updateFormField('weight_unit', e.target.value)}
                        >
                          <option value="lbs">lbs</option>
                          <option value="kg">kg</option>
                        </select>
                      </div>
                      {formErrors.gross_weight && (
                        <span className="bk-field-error-msg">{formErrors.gross_weight}</span>
                      )}
                    </div>

                    <div className="bk-field">
                      <label>
                        Total Cargo Value (USD) <span className="bk-badge-opt">Optional</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="bk-input"
                        placeholder="e.g. 45000"
                        value={form.cargo_value}
                        onChange={(e) => updateFormField('cargo_value', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Dimensions */}
                  <div className="bk-grid-4">
                    <div className="bk-field">
                      <label>
                        Length ({form.dim_unit}) <span className="bk-badge-opt">Optional</span>
                      </label>
                      <input
                        type="number"
                        className="bk-input"
                        placeholder="Length"
                        value={form.dim_length}
                        onChange={(e) => updateFormField('dim_length', e.target.value)}
                      />
                    </div>
                    <div className="bk-field">
                      <label>
                        Width ({form.dim_unit}) <span className="bk-badge-opt">Optional</span>
                      </label>
                      <input
                        type="number"
                        className="bk-input"
                        placeholder="Width"
                        value={form.dim_width}
                        onChange={(e) => updateFormField('dim_width', e.target.value)}
                      />
                    </div>
                    <div className="bk-field">
                      <label>
                        Height ({form.dim_unit}) <span className="bk-badge-opt">Optional</span>
                      </label>
                      <input
                        type="number"
                        className="bk-input"
                        placeholder="Height"
                        value={form.dim_height}
                        onChange={(e) => updateFormField('dim_height', e.target.value)}
                      />
                    </div>
                    <div className="bk-field">
                      <label>
                        Dim Unit <span className="bk-badge-opt">Optional</span>
                      </label>
                      <select
                        className="bk-select"
                        value={form.dim_unit}
                        onChange={(e) => updateFormField('dim_unit', e.target.value)}
                      >
                        <option value="in">Inches (in)</option>
                        <option value="cm">Centimeters (cm)</option>
                        <option value="ft">Feet (ft)</option>
                      </select>
                    </div>
                  </div>

                  <div className="bk-field full">
                    <label>
                      Cargo Description & Handling Instructions <span className="bk-badge-opt">Optional</span>
                    </label>
                    <textarea
                      className="bk-textarea"
                      placeholder="Special handling, fragile warning, do not stack, temperature instructions..."
                      value={form.special_instructions}
                      onChange={(e) => updateFormField('special_instructions', e.target.value)}
                    />
                  </div>

                  {/* Hazardous Materials Block */}
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: form.hazmat_flag ? '14px' : '0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <WarningCircle size={20} color="#b45309" />
                        <strong style={{ fontSize: '13.5px', color: '#92400e' }}>Hazardous Materials (Hazmat) Declaration</strong>
                      </div>
                      <label className="bk-source-radio-label">
                        <input
                          type="checkbox"
                          checked={form.hazmat_flag}
                          onChange={(e) => updateFormField('hazmat_flag', e.target.checked)}
                        />
                        <span>Cargo Contains Hazmat</span>
                      </label>
                    </div>
                    <div className="bk-term-helper" style={{ color: '#b45309' }}>
                      <Info size={13} />
                      <span>Check only if shipping dangerous goods regulated under 49 CFR / IMDG / ICAO.</span>
                    </div>

                    {form.hazmat_flag && (
                      <div className="bk-grid-3" style={{ marginTop: '12px' }}>
                        <div className="bk-field">
                          <label>
                            UN Number (e.g. UN1993) <span className="bk-badge-req">Required</span>
                          </label>
                          <input
                            type="text"
                            className={`bk-input ${formErrors.un_number ? 'has-error' : ''}`}
                            placeholder="UN1993"
                            value={form.un_number}
                            onChange={(e) => updateFormField('un_number', e.target.value)}
                          />
                          {formErrors.un_number && (
                            <span className="bk-field-error-msg">{formErrors.un_number}</span>
                          )}
                          <div className="bk-term-helper">
                            <Info size={13} />
                            <span>4-digit United Nations ID for hazardous materials.</span>
                          </div>
                        </div>
                        <div className="bk-field">
                          <label>
                            Hazard Class <span className="bk-badge-req">Required</span>
                          </label>
                          <input
                            type="text"
                            className={`bk-input ${formErrors.hazard_class ? 'has-error' : ''}`}
                            placeholder="Class 3 - Flammable Liquid"
                            value={form.hazard_class}
                            onChange={(e) => updateFormField('hazard_class', e.target.value)}
                          />
                          {formErrors.hazard_class && (
                            <span className="bk-field-error-msg">{formErrors.hazard_class}</span>
                          )}
                          <div className="bk-term-helper">
                            <Info size={13} />
                            <span>Primary DOT / IMO hazard class classification.</span>
                          </div>
                        </div>
                        <div className="bk-field">
                          <label>
                            Placarding & Packing Group <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="text"
                            className="bk-input"
                            placeholder="Placards required / PG II"
                            value={form.placarding}
                            onChange={(e) => updateFormField('placarding', e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ==========================================
                  TAB 4: MODE-SPECIFIC DETAILS
                  ========================================== */}
              {activeTab === 'mode' && (
                <div className="bk-section">
                  <div className="bk-section-header">
                    <h3>
                      Mode-Specific Parameters —{' '}
                      {FREIGHT_MODES.find((m) => m.id === form.booking_mode)?.name}
                    </h3>
                    <p>
                      Displays relevant fields strictly tailored to the chosen freight transport mode.
                    </p>
                  </div>

                  {/* INLAND / ROAD */}
                  {form.booking_mode === 'inland' && (
                    <div className="bk-section">
                      <div className="bk-mode-banner">
                        <div className="bk-mode-banner-icon">
                          <Truck size={20} />
                        </div>
                        <div className="bk-mode-banner-text">
                          <h4>Inland Road Freight Parameters</h4>
                          <p>Specific directives for highway carriers, driver site protocols, and appointment windows.</p>
                        </div>
                      </div>

                      <div className="bk-grid-2">
                        <div className="bk-field">
                          <label>
                            Vehicle / Equipment Requirements <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="text"
                            className="bk-input"
                            placeholder="Air Ride Suspension, E-track, Liftgate, Pallet Jack"
                            value={form.road_vehicle_requirements}
                            onChange={(e) => updateFormField('road_vehicle_requirements', e.target.value)}
                          />
                          <div className="bk-term-helper">
                            <Info size={13} />
                            <span>Special accessories or equipment required (e.g. Liftgate, Pallet Jack).</span>
                          </div>
                        </div>

                        <div className="bk-field">
                          <label>
                            Appointment Enforcement <span className="bk-badge-opt">Optional</span>
                          </label>
                          <label className="bk-source-radio-label" style={{ marginTop: '10px' }}>
                            <input
                              type="checkbox"
                              checked={form.road_strict_appointment}
                              onChange={(e) => updateFormField('road_strict_appointment', e.target.checked)}
                            />
                            <span>Strict appointment required at shipper & consignee facility</span>
                          </label>
                        </div>
                      </div>

                      <div className="bk-field full">
                        <label>
                          Driver Instructions & Loading Directives <span className="bk-badge-opt">Optional</span>
                        </label>
                        <textarea
                          className="bk-textarea"
                          placeholder="Check-in gate instructions, required PPE, securement straps, tarping instructions..."
                          value={form.road_driver_notes}
                          onChange={(e) => updateFormField('road_driver_notes', e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {/* OCEAN */}
                  {form.booking_mode === 'ocean' && (
                    <div className="bk-section">
                      <div className="bk-mode-banner">
                        <div className="bk-mode-banner-icon">
                          <Boat size={20} />
                        </div>
                        <div className="bk-mode-banner-text">
                          <h4>Ocean Maritime Freight Parameters</h4>
                          <p>Seaport container movements, vessel voyage itineraries, and CFS station connections.</p>
                        </div>
                      </div>

                      <div className="bk-grid-2">
                        <div className="bk-field">
                          <label>
                            Port of Loading (POL) <span className="bk-badge-opt">Optional</span>
                          </label>
                          <select
                            className="bk-select"
                            value={form.ocean_pol}
                            onChange={(e) => updateFormField('ocean_pol', e.target.value)}
                          >
                            <option value="">-- Select Port of Loading --</option>
                            {portsList.map((port) => (
                              <option key={port.id} value={port.port_code}>
                                {port.port_code} — {port.name} ({port.city}, {port.country})
                              </option>
                            ))}
                          </select>
                          <div className="bk-term-helper">
                            <Info size={13} />
                            <span>POL: Seaport where the container is loaded aboard the vessel.</span>
                          </div>
                        </div>

                        <div className="bk-field">
                          <label>
                            Port of Discharge (POD) <span className="bk-badge-opt">Optional</span>
                          </label>
                          <select
                            className="bk-select"
                            value={form.ocean_pod}
                            onChange={(e) => updateFormField('ocean_pod', e.target.value)}
                          >
                            <option value="">-- Select Port of Discharge --</option>
                            {portsList.map((port) => (
                              <option key={port.id} value={port.port_code}>
                                {port.port_code} — {port.name} ({port.city}, {port.country})
                              </option>
                            ))}
                          </select>
                          <div className="bk-term-helper">
                            <Info size={13} />
                            <span>POD: Destination seaport where container is unloaded.</span>
                          </div>
                        </div>
                      </div>

                      <div className="bk-grid-3">
                        <div className="bk-field">
                          <label>
                            Ocean Service Type <span className="bk-badge-req">Required</span>
                          </label>
                          <select
                            className="bk-select"
                            value={form.ocean_shipment_type}
                            onChange={(e) => updateFormField('ocean_shipment_type', e.target.value)}
                          >
                            <option value="FCL">FCL (Full Container Load)</option>
                            <option value="LCL">LCL (Less than Container Load)</option>
                          </select>
                          <div className="bk-term-helper">
                            <Info size={13} />
                            <span>FCL = Dedicated full container · LCL = Consolidated shared container.</span>
                          </div>
                        </div>

                        <div className="bk-field">
                          <label>
                            Container Type <span className="bk-badge-opt">Optional</span>
                          </label>
                          <select
                            className="bk-select"
                            value={form.ocean_container_type}
                            onChange={(e) => updateFormField('ocean_container_type', e.target.value)}
                          >
                            <option value="20' Standard">20' Standard Dry</option>
                            <option value="40' Standard">40' Standard Dry</option>
                            <option value="40' High Cube">40' High Cube</option>
                            <option value="45' High Cube">45' High Cube</option>
                            <option value="20' Reefer">20' Reefer</option>
                            <option value="40' Reefer">40' Reefer</option>
                            <option value="Flat Rack">Flat Rack</option>
                            <option value="Open Top">Open Top</option>
                          </select>
                        </div>

                        <div className="bk-field">
                          <label>
                            Container Quantity <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            className={`bk-input ${formErrors.ocean_container_qty ? 'has-error' : ''}`}
                            value={form.ocean_container_qty}
                            onChange={(e) => updateFormField('ocean_container_qty', e.target.value)}
                          />
                          {formErrors.ocean_container_qty && (
                            <span className="bk-field-error-msg">{formErrors.ocean_container_qty}</span>
                          )}
                        </div>
                      </div>

                      <div className="bk-grid-4">
                        <div className="bk-field">
                          <label>
                            Vessel Name <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="text"
                            className="bk-input"
                            placeholder="e.g. EVER GIVEN"
                            value={form.ocean_vessel_name}
                            onChange={(e) => updateFormField('ocean_vessel_name', e.target.value)}
                          />
                        </div>
                        <div className="bk-field">
                          <label>
                            Voyage Number <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="text"
                            className="bk-input"
                            placeholder="e.g. 024W"
                            value={form.ocean_voyage_number}
                            onChange={(e) => updateFormField('ocean_voyage_number', e.target.value)}
                          />
                        </div>
                        <div className="bk-field">
                          <label>
                            Estimated ETD <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="date"
                            className="bk-input"
                            value={form.ocean_etd}
                            onChange={(e) => updateFormField('ocean_etd', e.target.value)}
                          />
                        </div>
                        <div className="bk-field">
                          <label>
                            Estimated ETA <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="date"
                            className="bk-input"
                            value={form.ocean_eta}
                            onChange={(e) => updateFormField('ocean_eta', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="bk-field full">
                        <label>
                          Assigned CFS Station (Deconsolidation Depot) <span className="bk-badge-opt">Optional</span>
                        </label>
                        <select
                          className="bk-select"
                          value={form.ocean_cfs_id}
                          onChange={(e) => updateFormField('ocean_cfs_id', e.target.value)}
                        >
                          <option value="">-- Choose Container Freight Station (CFS) --</option>
                          {cfsList.map((cfs) => (
                            <option key={cfs.id} value={cfs.cfs_code || cfs.id}>
                              {cfs.cfs_code} — {cfs.name} ({cfs.city}, {cfs.country})
                            </option>
                          ))}
                        </select>
                        <div className="bk-term-helper">
                          <Info size={13} />
                          <span>CFS (Container Freight Station): Bonded warehouse facility for consolidating or deconsolidating cargo.</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AIR */}
                  {form.booking_mode === 'air' && (
                    <div className="bk-section">
                      <div className="bk-mode-banner">
                        <div className="bk-mode-banner-icon">
                          <AirplaneTilt size={20} />
                        </div>
                        <div className="bk-mode-banner-text">
                          <h4>Air Freight Parameters</h4>
                          <p>Airport-to-airport routing, IATA station codes, Master Air Waybill (AWB), and flight schedules.</p>
                        </div>
                      </div>

                      <div className="bk-grid-2">
                        <div className="bk-field">
                          <label>
                            Origin Airport (IATA Code, 3 chars) <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="text"
                            maxLength={3}
                            className={`bk-input ${formErrors.air_origin_airport ? 'has-error' : ''}`}
                            placeholder="ORD (Chicago O'Hare)"
                            value={form.air_origin_airport}
                            onChange={(e) => updateFormField('air_origin_airport', e.target.value.toUpperCase())}
                          />
                          {formErrors.air_origin_airport && (
                            <span className="bk-field-error-msg">{formErrors.air_origin_airport}</span>
                          )}
                          <div className="bk-term-helper">
                            <Info size={13} />
                            <span>3-letter IATA airport code (e.g. ORD, LAX, JFK).</span>
                          </div>
                        </div>

                        <div className="bk-field">
                          <label>
                            Destination Airport (IATA Code, 3 chars) <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="text"
                            maxLength={3}
                            className={`bk-input ${formErrors.air_dest_airport ? 'has-error' : ''}`}
                            placeholder="FRA (Frankfurt)"
                            value={form.air_dest_airport}
                            onChange={(e) => updateFormField('air_dest_airport', e.target.value.toUpperCase())}
                          />
                          {formErrors.air_dest_airport && (
                            <span className="bk-field-error-msg">{formErrors.air_dest_airport}</span>
                          )}
                          <div className="bk-term-helper">
                            <Info size={13} />
                            <span>3-letter IATA destination airport code (e.g. FRA, LHR, NRT).</span>
                          </div>
                        </div>
                      </div>

                      <div className="bk-grid-3">
                        <div className="bk-field">
                          <label>
                            Air Waybill (AWB) # <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="text"
                            className="bk-input"
                            placeholder="e.g. 020-12345678"
                            value={form.air_awb_number}
                            onChange={(e) => updateFormField('air_awb_number', e.target.value)}
                          />
                          <div className="bk-term-helper">
                            <Info size={13} />
                            <span>Official airline tracking number and contract of carriage.</span>
                          </div>
                        </div>

                        <div className="bk-field">
                          <label>
                            Flight Number <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="text"
                            className="bk-input"
                            placeholder="e.g. LH431"
                            value={form.air_flight_number}
                            onChange={(e) => updateFormField('air_flight_number', e.target.value)}
                          />
                        </div>

                        <div className="bk-field">
                          <label>
                            Flight Date <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="date"
                            className="bk-input"
                            value={form.air_flight_date}
                            onChange={(e) => updateFormField('air_flight_date', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* RAIL */}
                  {form.booking_mode === 'rail' && (
                    <div className="bk-section">
                      <div className="bk-mode-banner">
                        <div className="bk-mode-banner-icon">
                          <Train size={20} />
                        </div>
                        <div className="bk-mode-banner-text">
                          <h4>Rail Intermodal Parameters</h4>
                          <p>Intermodal ramp hubs, well-car rail numbers, and rail schedule references.</p>
                        </div>
                      </div>

                      <div className="bk-grid-2">
                        <div className="bk-field">
                          <label>
                            Origin Rail Ramp / Terminal <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="text"
                            className="bk-input"
                            placeholder="e.g. BNSF Cicero Intermodal Ramp"
                            value={form.rail_origin_ramp}
                            onChange={(e) => updateFormField('rail_origin_ramp', e.target.value)}
                          />
                          <div className="bk-term-helper">
                            <Info size={13} />
                            <span>Rail ramp where containers are transferred from truck to railcar.</span>
                          </div>
                        </div>

                        <div className="bk-field">
                          <label>
                            Destination Rail Ramp / Terminal <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="text"
                            className="bk-input"
                            placeholder="e.g. UP Dallas Intermodal Terminal"
                            value={form.rail_dest_ramp}
                            onChange={(e) => updateFormField('rail_dest_ramp', e.target.value)}
                          />
                          <div className="bk-term-helper">
                            <Info size={13} />
                            <span>Destination rail facility for offloading to destination drayage.</span>
                          </div>
                        </div>
                      </div>

                      <div className="bk-grid-2">
                        <div className="bk-field">
                          <label>
                            Rail Car / Well Car Number <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="text"
                            className="bk-input"
                            placeholder="e.g. TTX-549102"
                            value={form.rail_car_number}
                            onChange={(e) => updateFormField('rail_car_number', e.target.value)}
                          />
                        </div>

                        <div className="bk-field">
                          <label>
                            Train Schedule / Route Reference <span className="bk-badge-opt">Optional</span>
                          </label>
                          <input
                            type="text"
                            className="bk-input"
                            placeholder="e.g. BNSF-Q-CHIDAL1"
                            value={form.rail_schedule_number}
                            onChange={(e) => updateFormField('rail_schedule_number', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ==========================================
                  TAB 5: RATES & DOCUMENTS
                  ========================================== */}
              {activeTab === 'rates' && (
                <div className="bk-section">
                  <div className="bk-section-header">
                    <h3>Rates, Charges & Supporting Documents</h3>
                    <p>Bind agreed carrier rates, quotes, accessorial charges and upload compliance files.</p>
                  </div>

                  {/* Link from Quotes */}
                  <div className="bk-grid-2">
                    <div className="bk-field">
                      <label>
                        Link Approved Quote / Rate Agreement <span className="bk-badge-opt">Optional</span>
                      </label>
                      <select
                        className="bk-select"
                        value={form.selected_quote_id}
                        onChange={(e) => {
                          const qId = e.target.value;
                          const foundQ = quotesList.find((q) => String(q.id) === qId);
                          setForm((p) => ({
                            ...p,
                            selected_quote_id: qId,
                            quote_amount: foundQ?.total_amount || p.quote_amount,
                          }));
                          if (foundQ) {
                            notify?.(`Loaded rate agreement: $${Number(foundQ.total_amount).toFixed(2)}`);
                          }
                        }}
                      >
                        <option value="">-- Choose active quote or enter manual rate --</option>
                        {quotesList.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.quote_number || `#${q.id}`} — ${Number(q.total_amount || 0).toFixed(2)} (
                            {q.origin_city} ➔ {q.dest_city})
                          </option>
                        ))}
                      </select>
                      <div className="bk-term-helper">
                        <Info size={13} />
                        <span>Optionally links a real committed rate quote from M4.</span>
                      </div>
                    </div>

                    <div className="bk-field">
                      <label>
                        Assigned Carrier / Vendor <span className="bk-badge-opt">Optional</span>
                      </label>
                      <select
                        className="bk-select"
                        value={form.carrier_org_id}
                        onChange={(e) => updateFormField('carrier_org_id', e.target.value)}
                      >
                        <option value="">-- Unassigned / Spot Carrier --</option>
                        {vendorsList.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.legal_name} {v.mc_number ? `(MC# ${v.mc_number})` : ''}
                          </option>
                        ))}
                      </select>
                      <div className="bk-term-helper">
                        <Info size={13} />
                        <span>Contracting motor carrier or vendor assigned to move the freight.</span>
                      </div>
                    </div>
                  </div>

                  <div className="bk-grid-3">
                    <div className="bk-field">
                      <label>
                        Base Linehaul Rate ($) <span className="bk-badge-opt">Optional</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="bk-input"
                        placeholder="e.g. 2400.00"
                        value={form.quote_amount}
                        onChange={(e) => updateFormField('quote_amount', e.target.value)}
                      />
                    </div>

                    <div className="bk-field">
                      <label>
                        Currency <span className="bk-badge-req">Required</span>
                      </label>
                      <select
                        className="bk-select"
                        value={form.currency}
                        onChange={(e) => updateFormField('currency', e.target.value)}
                      >
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="CAD">CAD ($)</option>
                        <option value="GBP">GBP (£)</option>
                      </select>
                    </div>

                    <div className="bk-field">
                      <label>
                        Payment Terms <span className="bk-badge-req">Required</span>
                      </label>
                      <select
                        className="bk-select"
                        value={form.payment_terms}
                        onChange={(e) => updateFormField('payment_terms', e.target.value)}
                      >
                        <option value="Prepaid">Prepaid</option>
                        <option value="Collect">Collect</option>
                        <option value="Third Party">Third Party Billing</option>
                      </select>
                    </div>
                  </div>

                  {/* Accessorials Selection */}
                  <div className="bk-field full">
                    <label>
                      Applicable Accessorial Charges <span className="bk-badge-opt">Optional</span>
                    </label>
                    <div className="bk-term-helper" style={{ marginBottom: '8px' }}>
                      <Info size={13} />
                      <span>Supplemental services required (e.g. liftgate, detention, inside delivery).</span>
                    </div>
                    <div className="bk-accessorial-grid">
                      {STANDARD_ACCESSORIALS.map((acc) => {
                        const isSelected = form.selected_accessorials.includes(acc.id);
                        return (
                          <div
                            key={acc.id}
                            className={`bk-accessorial-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              updateFormField(
                                'selected_accessorials',
                                isSelected
                                  ? form.selected_accessorials.filter((id) => id !== acc.id)
                                  : [...form.selected_accessorials, acc.id]
                              );
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // handled by parent div click
                            />
                            <div>
                              <strong>{acc.name}</strong>
                              <small>+${acc.defaultFee.toFixed(2)} flat</small>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: '10px', fontSize: '13.5px', fontWeight: 600, color: '#0f172a' }}>
                      Calculated Total Rate: ${calculatedTotalRate.toFixed(2)} {form.currency}
                    </div>
                  </div>

                  {/* Reference Numbers Block */}
                  <div className="bk-section-header" style={{ marginTop: '12px' }}>
                    <h3>Reference Numbers</h3>
                  </div>

                  <div className="bk-grid-3">
                    <div className="bk-field">
                      <label>
                        PO Number <span className="bk-badge-opt">Optional</span>
                      </label>
                      <input
                        type="text"
                        className="bk-input"
                        placeholder="PO-1042"
                        value={form.po_number}
                        onChange={(e) => updateFormField('po_number', e.target.value)}
                      />
                    </div>
                    <div className="bk-field">
                      <label>
                        Bill of Lading (BOL) # <span className="bk-badge-opt">Optional</span>
                      </label>
                      <input
                        type="text"
                        className="bk-input"
                        placeholder="BOL-998811"
                        value={form.bol_number}
                        onChange={(e) => updateFormField('bol_number', e.target.value)}
                      />
                    </div>
                    <div className="bk-field">
                      <label>
                        Customer Reference # <span className="bk-badge-opt">Optional</span>
                      </label>
                      <input
                        type="text"
                        className="bk-input"
                        placeholder="CUST-REF-77"
                        value={form.customer_reference}
                        onChange={(e) => updateFormField('customer_reference', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Supporting Documents Upload */}
                  <div className="bk-section-header" style={{ marginTop: '12px' }}>
                    <h3>Supporting Documents</h3>
                    <p>Attach BOL, commercial invoice, packing list, or customs clearance paperwork.</p>
                  </div>

                  <div>
                    <label className="bk-btn secondary" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                      <UploadSimple size={16} />
                      <span>Upload Document</span>
                      <input
                        type="file"
                        multiple
                        hidden
                        onChange={handleFileUpload}
                      />
                    </label>
                    <p className="bk-hint" style={{ marginTop: '8px' }}>
                      Document references and metadata are stored with the booking record. Dedicated binary cloud storage for shipment documents is pending backend route implementation.
                    </p>

                    {form.documents?.length > 0 && (
                      <div className="bk-doc-list">
                        {form.documents.map((doc) => (
                          <div key={doc.id || doc.name} className="bk-doc-item">
                            <div className="bk-doc-info">
                              <FileText size={18} />
                              <div>
                                <strong>{doc.name}</strong>
                                <span style={{ color: '#64748b', fontSize: '11.5px', marginLeft: '8px' }}>
                                  {doc.size || 'Attached'}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="bk-icon-btn danger"
                              onClick={() => handleRemoveDocument(doc.id)}
                              title="Remove Document"
                            >
                              <Trash size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ==========================================
                  TAB 6: REVIEW & SUBMIT
                  ========================================== */}
              {activeTab === 'review' && (
                <div className="bk-section">
                  <div className="bk-section-header">
                    <h3>Booking Summary & Verification</h3>
                    <p>Review all booking terms before saving as draft or confirming to the carrier.</p>
                  </div>

                  <div className="bk-review-card">
                    <div className="bk-review-grid">
                      {/* Block 1: Overview */}
                      <div className="bk-review-block">
                        <div className="bk-review-block-header">
                          <h4><CalendarCheck size={16} /> Booking Overview</h4>
                          <button
                            type="button"
                            className="bk-review-edit-btn"
                            onClick={() => setActiveTab('info')}
                            title="Edit Booking Information"
                          >
                            <NotePencil size={12} /> Edit
                          </button>
                        </div>
                        <div className="bk-review-row">
                          <span>Booking Number:</span>
                          <span>{form.booking_number || 'Auto-generated'}</span>
                        </div>
                        <div className="bk-review-row">
                          <span>Freight Mode:</span>
                          <span style={{ textTransform: 'capitalize' }}>{form.booking_mode}</span>
                        </div>
                        <div className="bk-review-row">
                          <span>Status:</span>
                          <span style={{ textTransform: 'uppercase' }}>{form.status}</span>
                        </div>
                        <div className="bk-review-row">
                          <span>Shipper:</span>
                          <span>
                            {customersList.find((c) => String(c.id) === String(form.shipper_org_id))?.legal_name ||
                              form.shipper_name ||
                              'Direct Enterprise'}
                          </span>
                        </div>
                        <div className="bk-review-row">
                          <span>Carrier:</span>
                          <span>
                            {vendorsList.find((v) => String(v.id) === String(form.carrier_org_id))?.legal_name ||
                              'Unassigned (Spot)'}
                          </span>
                        </div>
                      </div>

                      {/* Block 2: Route */}
                      <div className="bk-review-block">
                        <div className="bk-review-block-header">
                          <h4><MapPin size={16} /> Route & Timing</h4>
                          <button
                            type="button"
                            className="bk-review-edit-btn"
                            onClick={() => setActiveTab('parties')}
                            title="Edit Route & Parties"
                          >
                            <NotePencil size={12} /> Edit
                          </button>
                        </div>
                        <div className="bk-review-row">
                          <span>Origin:</span>
                          <span>{form.origin_city || 'Not set'}, {form.origin_state}</span>
                        </div>
                        <div className="bk-review-row">
                          <span>Pickup Date:</span>
                          <span>{form.pickup_date || 'TBD'} ({form.pickup_time_start} - {form.pickup_time_end})</span>
                        </div>
                        <div className="bk-review-row">
                          <span>Destination:</span>
                          <span>{form.destination_city || 'Not set'}, {form.destination_state}</span>
                        </div>
                        <div className="bk-review-row">
                          <span>Delivery Date:</span>
                          <span>{form.delivery_date || 'TBD'} ({form.delivery_time_start} - {form.delivery_time_end})</span>
                        </div>
                        <div className="bk-review-row">
                          <span>Intermediate Stops:</span>
                          <span>{form.stops.length} stop(s)</span>
                        </div>
                      </div>

                      {/* Block 3: Cargo */}
                      <div className="bk-review-block">
                        <div className="bk-review-block-header">
                          <h4><Package size={16} /> Cargo & Equipment</h4>
                          <button
                            type="button"
                            className="bk-review-edit-btn"
                            onClick={() => setActiveTab('cargo')}
                            title="Edit Cargo Details"
                          >
                            <NotePencil size={12} /> Edit
                          </button>
                        </div>
                        <div className="bk-review-row">
                          <span>Commodity:</span>
                          <span>{form.commodity || form.cargo_description || 'General Freight'}</span>
                        </div>
                        <div className="bk-review-row">
                          <span>Quantity & Packaging:</span>
                          <span>{form.package_count} {form.package_type}</span>
                        </div>
                        <div className="bk-review-row">
                          <span>Gross Weight:</span>
                          <span>{form.gross_weight ? `${form.gross_weight} ${form.weight_unit}` : 'TBD'}</span>
                        </div>
                        <div className="bk-review-row">
                          <span>Equipment Type:</span>
                          <span>{form.equipment_type}</span>
                        </div>
                        <div className="bk-review-row">
                          <span>Hazardous:</span>
                          <span style={{ color: form.hazmat_flag ? '#dc2626' : '#16a34a' }}>
                            {form.hazmat_flag ? `YES (${form.un_number})` : 'NO'}
                          </span>
                        </div>
                      </div>

                      {/* Block 4: Mode Specific */}
                      <div className="bk-review-block">
                        <div className="bk-review-block-header">
                          <h4><Truck size={16} /> Mode Details ({form.booking_mode.toUpperCase()})</h4>
                          <button
                            type="button"
                            className="bk-review-edit-btn"
                            onClick={() => setActiveTab('mode')}
                            title="Edit Mode Specific Parameters"
                          >
                            <NotePencil size={12} /> Edit
                          </button>
                        </div>
                        {form.booking_mode === 'ocean' && (
                          <>
                            <div className="bk-review-row">
                              <span>POL:</span>
                              <span>{form.ocean_pol || 'TBD'}</span>
                            </div>
                            <div className="bk-review-row">
                              <span>POD:</span>
                              <span>{form.ocean_pod || 'TBD'}</span>
                            </div>
                            <div className="bk-review-row">
                              <span>Service Type:</span>
                              <span>{form.ocean_shipment_type} ({form.ocean_container_qty}x {form.ocean_container_type})</span>
                            </div>
                          </>
                        )}
                        {form.booking_mode === 'air' && (
                          <>
                            <div className="bk-review-row">
                              <span>Airports:</span>
                              <span>{form.air_origin_airport || 'TBD'} ➔ {form.air_dest_airport || 'TBD'}</span>
                            </div>
                            <div className="bk-review-row">
                              <span>AWB Number:</span>
                              <span>{form.air_awb_number || 'TBD'}</span>
                            </div>
                          </>
                        )}
                        {form.booking_mode === 'rail' && (
                          <>
                            <div className="bk-review-row">
                              <span>Rail Ramps:</span>
                              <span>{form.rail_origin_ramp || 'TBD'} ➔ {form.rail_dest_ramp || 'TBD'}</span>
                            </div>
                            <div className="bk-review-row">
                              <span>Railcar:</span>
                              <span>{form.rail_car_number || 'TBD'}</span>
                            </div>
                          </>
                        )}
                        {form.booking_mode === 'inland' && (
                          <>
                            <div className="bk-review-row">
                              <span>Vehicle Reqs:</span>
                              <span>{form.road_vehicle_requirements || 'Standard'}</span>
                            </div>
                            <div className="bk-review-row">
                              <span>Strict Appt:</span>
                              <span>{form.road_strict_appointment ? 'Yes' : 'No'}</span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Block 5: Financials */}
                      <div className="bk-review-block">
                        <div className="bk-review-block-header">
                          <h4><CurrencyDollar size={16} /> Pricing & Terms</h4>
                          <button
                            type="button"
                            className="bk-review-edit-btn"
                            onClick={() => setActiveTab('rates')}
                            title="Edit Rates & Terms"
                          >
                            <NotePencil size={12} /> Edit
                          </button>
                        </div>
                        <div className="bk-review-row">
                          <span>Linehaul Rate:</span>
                          <span>${Number(form.quote_amount || 0).toFixed(2)}</span>
                        </div>
                        <div className="bk-review-row">
                          <span>Accessorials:</span>
                          <span>{form.selected_accessorials.length} item(s)</span>
                        </div>
                        <div className="bk-review-row">
                          <span>Total Expected Cost:</span>
                          <span style={{ fontSize: '14px', color: '#16a34a' }}>
                            ${calculatedTotalRate.toFixed(2)} {form.currency}
                          </span>
                        </div>
                        <div className="bk-review-row">
                          <span>Payment Terms:</span>
                          <span>{form.payment_terms}</span>
                        </div>
                        <div className="bk-review-row">
                          <span>PO Reference:</span>
                          <span>{form.po_number || 'None'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bk-alert info">
                      <ShieldCheck size={20} />
                      <div>
                        <strong>Enterprise FMS Verification:</strong> Once confirmed, this booking enters the active
                        operational lifecycle and allows dispatch gating, vehicle assignment, and milestone tracking.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="bk-modal-footer">
              <div className="bk-modal-footer-left">
                {activeTab !== 'info' && (
                  <button
                    type="button"
                    className="bk-btn secondary"
                    onClick={handlePrevious}
                  >
                    <ArrowLeft size={16} />
                    <span>Previous</span>
                  </button>
                )}
                {activeTab !== 'review' && (
                  <button
                    type="button"
                    className="bk-btn primary"
                    onClick={handleContinue}
                  >
                    <span>Continue</span>
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>

              <div className="bk-modal-footer-right">
                <button
                  type="button"
                  className="bk-btn secondary"
                  onClick={handleCloseForm}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="bk-btn secondary"
                  disabled={submitting || !canSubmitCurrentForm}
                  onClick={() => handleInitiateSave('draft')}
                  title="Save draft without committing to active carrier operations"
                >
                  <BookmarkSimple size={16} />
                  <span>Save Draft</span>
                </button>

                <button
                  type="button"
                  className="bk-btn primary"
                  disabled={submitting || !canSubmitCurrentForm}
                  onClick={() => handleInitiateSave('booked')}
                  title={!canSubmitCurrentForm ? 'Insufficient permission to modify bookings' : undefined}
                >
                  <CheckCircle size={18} weight="bold" />
                  <span>
                    {submitting
                      ? 'Saving...'
                      : editingBooking
                      ? 'Update & Lock Booking'
                      : 'Confirm & Book Shipment'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          CANCELLATION REASON CONFIRMATION MODAL
          ===================================================================== */}
      {cancelModalBooking && (
        <div className="bk-modal-backdrop" onClick={() => setCancelModalBooking(null)}>
          <div
            className="bk-modal-container bk-cancel-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="bk-modal-header">
              <div className="bk-modal-title">
                <WarningCircle size={24} color="#dc2626" />
                <div>
                  <h2 style={{ fontSize: '17px' }}>Cancel Booking</h2>
                  <p>Booking #{cancelModalBooking.reference_number || cancelModalBooking.id}</p>
                </div>
              </div>
              <button
                type="button"
                className="bk-close-btn"
                onClick={() => setCancelModalBooking(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="bk-cancel-body">
              <p style={{ margin: 0, fontSize: '13.5px', color: '#475569', lineHeight: 1.5 }}>
                Are you sure you want to cancel this booking? If this shipment has passed the scheduled pickup
                cutoff window (default 2h), cancellation rules and penalties will apply according to system policy.
              </p>
              <div className="bk-field">
                <label>Cancellation Reason / Note</label>
                <textarea
                  className="bk-textarea"
                  placeholder="Enter reason for cancellation (e.g. shipper requested date change, cargo not ready)..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>
            </div>

            <div className="bk-modal-footer">
              <button
                type="button"
                className="bk-btn secondary"
                onClick={() => setCancelModalBooking(null)}
              >
                Keep Booking
              </button>
              <button
                type="button"
                className="bk-btn danger"
                disabled={submitting}
                onClick={handleConfirmCancel}
              >
                {submitting ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          CONFIRM & BOOK SHIPMENT CONFIRMATION MODAL
          ===================================================================== */}
      {showConfirmModal && (
        <div className="bk-modal-backdrop" onClick={() => setShowConfirmModal(false)}>
          <div
            className="bk-modal-container bk-confirm-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bk-confirm-title"
          >
            <div className="bk-modal-header">
              <div className="bk-modal-title">
                <div className="bk-modal-title-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
                  <CheckCircle size={22} weight="bold" />
                </div>
                <div>
                  <h2 id="bk-confirm-title" style={{ fontSize: '18px' }}>
                    {editingBooking ? 'Confirm & Update Booking' : 'Confirm & Book Shipment'}
                  </h2>
                  <p>Commit this booking to active freight operations</p>
                </div>
              </div>
              <button
                type="button"
                className="bk-close-btn"
                aria-label="Close confirmation dialog"
                onClick={() => setShowConfirmModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="bk-confirm-body">
              <p style={{ margin: 0 }}>
                You are about to commit booking <strong>#{form.booking_number}</strong> for{' '}
                <strong style={{ textTransform: 'capitalize' }}>{form.booking_mode}</strong> transport from{' '}
                <strong>{form.origin_city || 'Origin'}</strong> to <strong>{form.destination_city || 'Destination'}</strong>.
              </p>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', fontSize: '12.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#64748b' }}>Customer / Shipper:</span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>
                    {customersList.find((c) => String(c.id) === String(form.shipper_org_id))?.legal_name || form.shipper_name || 'Direct Shipper'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#64748b' }}>Assigned Carrier:</span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>
                    {vendorsList.find((v) => String(v.id) === String(form.carrier_org_id))?.legal_name || 'Unassigned (Spot)'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Total Expected Cost:</span>
                  <span style={{ fontWeight: 700, color: '#16a34a' }}>
                    ${calculatedTotalRate.toFixed(2)} {form.currency}
                  </span>
                </div>
              </div>

              <div className="bk-alert info" style={{ fontSize: '12.5px' }}>
                <ShieldCheck size={18} />
                <div>
                  Confirming locks this booking into operational status <strong>BOOKED</strong> and initiates tracking milestones and dispatch readiness.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="bk-btn secondary"
                  onClick={() => setShowConfirmModal(false)}
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  className="bk-btn primary"
                  disabled={submitting}
                  onClick={() => {
                    setShowConfirmModal(false);
                    executeSaveBooking('booked');
                  }}
                >
                  <CheckCircle size={17} weight="bold" />
                  <span>{submitting ? 'Confirming...' : 'Yes, Confirm & Book'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

