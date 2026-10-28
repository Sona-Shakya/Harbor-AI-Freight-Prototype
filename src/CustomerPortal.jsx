import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShoppingBag,
  MagnifyingGlass,
  Plus,
  ArrowRight,
  MapPin,
  CalendarBlank,
  FileText,
  Receipt,
  ChartBar,
  Buildings,
  CheckCircle,
  Clock,
  WarningCircle,
  Truck,
  Star,
  Prohibit,
  DownloadSimple,
  UploadSimple,
  Eye,
  Trash,
  PencilSimple,
  ArrowsClockwise,
  ArrowLeft,
  Check,
  X,
  CaretRight,
  ShieldCheck,
  CurrencyDollar,
  Package,
} from '@phosphor-icons/react';
import {
  getPortalShipments,
  getPortalShipment,
  getPortalShipmentTracking,
  portalQuoteAndBook,
  getPortalShipmentDocuments,
  downloadPortalShipmentDocument,
  uploadPortalShipmentDocument,
  downloadRateConfirmationDocument,
  getPortalInvoices,
  getPortalInvoice,
  getPortalSavedLocations,
  createPortalSavedLocation,
  updatePortalSavedLocation,
  deletePortalSavedLocation,
  getPortalPreferences,
  updatePortalPreferences,
  getPortalAnalytics,
  getCustomers,
  getVendors,
  getShipmentDynamicEta,
  getShipmentCurrentLocation,
} from './api';
import TrackingMap from './components/tracking/TrackingMap.jsx';
import DocumentsPanel from './DocumentsPanel.jsx';

const money = (val) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(val) || 0);

const formatDate = (val) => {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return String(val);
  }
};

const PORTAL_EQUIPMENT_BY_MODE = {
  ocean: [
    '20ft Standard Ocean Container',
    '40ft Standard Ocean Container',
    '40ft High Cube Container',
  ],
  air: [
    'Air Cargo ULD - LD3',
    'Air Cargo ULD - PMC Pallet',
    'Air Cargo ULD - AKE',
  ],
};

const normalizePortalMode = (mode) => mode === 'air' ? 'air' : 'ocean';

export default function CustomerPortal({
  hasPermission,
  notify,
  profileLoading,
  currentUser,
  currentRoleName,
  currentOrg,
  initialTab = 'overview',
}) {
  // Navigation tabs: 'overview', 'quote-book', 'locations', 'preferences', 'billing', 'analytics'
  const [activeTab, setActiveTab] = useState(initialTab || 'overview');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Cross-tenant context for Platform Admin
  const isPlatformAdmin = currentRoleName === 'Platform Admin';
  const [targetShipperOrgId, setTargetShipperOrgId] = useState('');
  const [shipperCustomers, setShipperCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // Shipments state
  const [shipments, setShipments] = useState([]);
  const [shipmentFilter, setShipmentFilter] = useState('active'); // 'active' | 'past' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loadingShipments, setLoadingShipments] = useState(false);
  const [shipmentPagination, setShipmentPagination] = useState({ total: 0, page: 1, limit: 20 });

  // Detail & Tracking Modals
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [trackingData, setTrackingData] = useState(null);
  const [m8LocationData, setM8LocationData] = useState(null);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Documents Modal
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [shipmentDocs, setShipmentDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadDocModal, setUploadDocModal] = useState(false);
  const [uploadDocType, setUploadDocType] = useState('BOL');
  const [uploadDocName, setUploadDocName] = useState('');
  const [uploadDocFile, setUploadDocFile] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Invoices & Billing state
  const [invoices, setInvoices] = useState([]);
  const [billingSummary, setBillingSummary] = useState(null);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  // Saved Locations state
  const [savedLocations, setSavedLocations] = useState([]);
  const [locationTypeFilter, setLocationTypeFilter] = useState('all');
  const [locationSearch, setLocationSearch] = useState('');
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [locationModal, setLocationModal] = useState({ open: false, isEdit: false, data: null });
  const [deleteLocConfirm, setDeleteLocConfirm] = useState(null);

  // Carrier Preferences state
  const [preferences, setPreferences] = useState({
    preferred_carrier_ids: [],
    blocked_carrier_ids: [],
    preferred_carriers: [],
    blocked_carriers: [],
    notes: '',
  });
  const [allCarriers, setAllCarriers] = useState([]);
  const [loadingPrefs, setLoadingPrefs] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Analytics state
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Guided Quote & Book wizard state
  const [wizardStep, setWizardStep] = useState(1);
  const [quoteFormData, setQuoteFormData] = useState({
    mode: 'ocean',
    origin_name: '',
    origin_address: '',
    origin_city: '',
    origin_state: '',
    origin_zip: '',
    destination_name: '',
    destination_address: '',
    destination_city: '',
    destination_state: '',
    destination_zip: '',
    commodity: 'General Freight',
    equipment_type: PORTAL_EQUIPMENT_BY_MODE.ocean[1],
    weight_lbs: 15000,
    package_type: 'Pallets',
    package_quantity: 12,
    distance_miles: 500,
    rate_per_mile: 2.75,
    pickup_date: '',
    delivery_date: '',
    special_instructions: '',
  });
  const [quoteResult, setQuoteResult] = useState(null);
  const [selectedCarrier, setSelectedCarrier] = useState(null);
  const [requestingQuote, setRequestingQuote] = useState(false);
  const [bookingShipment, setBookingShipment] = useState(false);
  const [bookingConfirmedData, setBookingConfirmedData] = useState(null);

  // Target Shipper Params for API calls
  const targetParams = useMemo(() => {
    if (isPlatformAdmin && targetShipperOrgId) {
      return { shipper_org_id: targetShipperOrgId };
    }
    return {};
  }, [isPlatformAdmin, targetShipperOrgId]);

  // Load Platform Admin shipper customers list
  useEffect(() => {
    if (isPlatformAdmin) {
      setLoadingCustomers(true);
      getCustomers({ type: 'shipper' })
        .then((res) => {
          const list = Array.isArray(res) ? res : res?.data || res?.customers || [];
          setShipperCustomers(list);
          if (list.length > 0 && !targetShipperOrgId) {
            setTargetShipperOrgId(String(list[0].id));
          }
        })
        .catch((err) => {
          console.error('Failed to load shipper organizations:', err);
        })
        .finally(() => setLoadingCustomers(false));
    }
  }, [isPlatformAdmin]);

  // Load Shipments
  const loadShipments = useCallback(() => {
    setLoadingShipments(true);
    const params = {
      ...targetParams,
      status: shipmentFilter,
      search: searchQuery || undefined,
    };
    if (statusFilter !== 'all') {
      params.status = statusFilter;
    }
    getPortalShipments(params)
      .then((res) => {
        const list = res?.shipments || res?.data || [];
        setShipments(list);
        if (res?.pagination) {
          setShipmentPagination(res.pagination);
        }
      })
      .catch((err) => {
        console.error('Failed to load portal shipments:', err);
        notify?.(err.message || 'Error loading shipments');
      })
      .finally(() => setLoadingShipments(false));
  }, [targetParams, shipmentFilter, searchQuery, statusFilter, notify]);

  // Load Saved Locations
  const loadLocations = useCallback(() => {
    setLoadingLocations(true);
    const params = {
      ...targetParams,
      type: locationTypeFilter !== 'all' ? locationTypeFilter : undefined,
      search: locationSearch || undefined,
    };
    getPortalSavedLocations(params)
      .then((res) => {
        const list = res?.locations || res?.data || [];
        setSavedLocations(list);
      })
      .catch((err) => {
        console.error('Failed to load saved locations:', err);
      })
      .finally(() => setLoadingLocations(false));
  }, [targetParams, locationTypeFilter, locationSearch]);

  // Load Carrier Preferences
  const loadPreferences = useCallback(() => {
    setLoadingPrefs(true);
    Promise.all([
      getPortalPreferences(targetParams),
      getVendors({ type: 'carrier' }),
    ])
      .then(([prefRes, vendorRes]) => {
        const prefData = prefRes?.data || prefRes || {};
        setPreferences({
          preferred_carrier_ids: prefData.preferred_carrier_ids || [],
          blocked_carrier_ids: prefData.blocked_carrier_ids || [],
          preferred_carriers: prefData.preferred_carriers || [],
          blocked_carriers: prefData.blocked_carriers || [],
          notes: prefData.notes || '',
        });
        const carriersList = Array.isArray(vendorRes) ? vendorRes : vendorRes?.data || vendorRes?.vendors || [];
        setAllCarriers(carriersList);
      })
      .catch((err) => {
        console.error('Failed to load carrier preferences:', err);
      })
      .finally(() => setLoadingPrefs(false));
  }, [targetParams]);

  // Load Invoices
  const loadInvoices = useCallback(() => {
    setLoadingInvoices(true);
    const params = {
      ...targetParams,
      status: invoiceStatusFilter !== 'all' ? invoiceStatusFilter : undefined,
    };
    getPortalInvoices(params)
      .then((res) => {
        const list = res?.invoices || res?.data || [];
        setInvoices(list);
        setBillingSummary(res?.summary || null);
      })
      .catch((err) => {
        console.error('Failed to load invoices:', err);
      })
      .finally(() => setLoadingInvoices(false));
  }, [targetParams, invoiceStatusFilter]);

  // Load Analytics
  const loadAnalytics = useCallback(() => {
    setLoadingAnalytics(true);
    getPortalAnalytics(targetParams)
      .then((res) => {
        setAnalytics(res?.data || res || null);
      })
      .catch((err) => {
        console.error('Failed to load analytics:', err);
      })
      .finally(() => setLoadingAnalytics(false));
  }, [targetParams]);

  // Auto-reload data when tab or target shipper changes
  useEffect(() => {
    if (activeTab === 'overview') {
      loadShipments();
    } else if (activeTab === 'locations') {
      loadLocations();
    } else if (activeTab === 'preferences') {
      loadPreferences();
    } else if (activeTab === 'billing') {
      loadInvoices();
    } else if (activeTab === 'analytics') {
      loadAnalytics();
    }
  }, [activeTab, targetShipperOrgId, loadShipments, loadLocations, loadPreferences, loadInvoices, loadAnalytics]);

  // Pre-load saved locations for quote-and-book dropdown
  useEffect(() => {
    if (activeTab === 'quote-book') {
      loadLocations();
    }
  }, [activeTab, loadLocations]);

  // FR-8.1: Real-time telemetry polling while tracking modal is open (2-minute interval with cleanup)
  useEffect(() => {
    if (!showTrackingModal || !selectedShipment) return;
    let isMounted = true;
    let inFlight = false;

    const pollM8Location = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const m8Res = await getShipmentCurrentLocation(selectedShipment.id);
        const data = m8Res?.data || m8Res;
        if (isMounted && data) {
          setM8LocationData(data);
        }
      } catch (err) {
        console.warn('Periodic telemetry poll error:', err.message);
      } finally {
        inFlight = false;
      }
    };

    // 2-minute polling interval
    const interval = setInterval(pollM8Location, 120_000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [showTrackingModal, selectedShipment]);

  // Open Tracking Modal
  const openTracking = async (shipment) => {
    setSelectedShipment(shipment);
    setShowTrackingModal(true);
    setLoadingTracking(true);
    setM8LocationData(null);
    try {
      const [res, m8Res] = await Promise.allSettled([
        getPortalShipmentTracking(shipment.id, targetParams),
        getShipmentCurrentLocation(shipment.id),
      ]);

      if (m8Res.status === 'fulfilled' && m8Res.value) {
        setM8LocationData(m8Res.value?.data || m8Res.value);
      }

      const portalData = res.status === 'fulfilled' ? (res.value?.data || res.value) : {};

      let dynEta = null;
      try {
        const dynRes = await getShipmentDynamicEta(shipment.id);
        dynEta = dynRes?.data || dynRes;
      } catch (e) {
        // Dynamic ETA optional fallback
      }
      const combined = { ...portalData, dynamic_eta: dynEta };
      setTrackingData(combined);
    } catch (err) {
      notify?.(err.message || 'Failed to load tracking data');
    } finally {
      setLoadingTracking(false);
    }
  };

  // Open Shipment Documents Modal
  const openDocuments = async (shipment) => {
    setSelectedShipment(shipment);
    setShowDocsModal(true);
    setLoadingDocs(true);
    try {
      const res = await getPortalShipmentDocuments(shipment.id, targetParams);
      setShipmentDocs(res?.documents || res?.data || res || []);
    } catch (err) {
      notify?.(err.message || 'Failed to load documents');
    } finally {
      setLoadingDocs(false);
    }
  };

  // Download Document
  const handleDownloadDoc = async (doc) => {
    try {
      // Check if document is Rate Confirmation - use binary endpoint
      if (doc.type === 'rate_confirmation' || doc.type === 'rate_confirmation_signed') {
        try {
          notify?.('Downloading official Rate Confirmation PDF...');
          const blob = await downloadRateConfirmationDocument(doc.id);
          if (blob instanceof Blob && blob.size > 0) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = doc.file_name || `Rate_Confirmation_${doc.id}.pdf`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              window.URL.revokeObjectURL(url);
              if (document.body.contains(a)) document.body.removeChild(a);
            }, 1000);
            notify?.(`Rate Confirmation PDF downloaded successfully.`);
            return;
          }
        } catch (rcErr) {
          console.warn('Rate confirmation direct download notice:', rcErr.message);
        }
      }

      const res = await downloadPortalShipmentDocument(selectedShipment.id, doc.id, targetParams);
      if (res?.download_url) {
        // Attempt to fetch file stream if endpoint is wired
        try {
          const fileResp = await fetch(res.download_url, { credentials: 'include' });
          if (fileResp.ok) {
            const blob = await fileResp.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = doc.file_name || `${doc.type || 'Document'}-${doc.id}.pdf`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              window.URL.revokeObjectURL(url);
              if (document.body.contains(a)) document.body.removeChild(a);
            }, 1000);
            notify?.(`Document ${doc.file_name} downloaded successfully.`);
            return;
          }
        } catch (fetchErr) {
          // Fall through to informative notice
        }
        notify?.(`Document ${doc.file_name} verified on file. Cloud storage file stream pending backend driver.`);
      } else {
        notify?.(`Document ${doc.file_name} access verified.`);
      }
    } catch (err) {
      notify?.(err.message || 'Download authorization failed');
    }
  };

  // Upload Document
  const handleUploadDoc = async (e) => {
    e.preventDefault();
    if (!uploadDocName.trim()) {
      notify?.('Please enter a document name or reference');
      return;
    }
    setUploadingDoc(true);
    try {
      await uploadPortalShipmentDocument(
        selectedShipment.id,
        {
          type: uploadDocType,
          file_name: uploadDocName.trim(),
          file_size: uploadDocFile?.size || 2048,
          mime_type: uploadDocFile?.type || 'application/pdf',
        },
        targetParams
      );
      notify?.('Document uploaded and linked to shipment successfully');
      setUploadDocModal(false);
      setUploadDocName('');
      setUploadDocFile(null);
      // Refresh docs
      openDocuments(selectedShipment);
    } catch (err) {
      notify?.(err.message || 'Failed to upload document');
    } finally {
      setUploadingDoc(false);
    }
  };

  // Handle Location Form Save
  const handleSaveLocation = async (e) => {
    e.preventDefault();
    const loc = locationModal.data;
    if (!loc.name || !loc.city || !loc.state) {
      notify?.('Location name, city, and state are required.');
      return;
    }
    try {
      const payload = {
        name: loc.name,
        type: loc.type || 'both',
        address: {
          address_line1: loc.address_line1 || '',
          address_line2: loc.address_line2 || '',
          city: loc.city,
          state: loc.state,
          postal_code: loc.postal_code || '',
          country: loc.country || 'USA',
        },
        contact: {
          contact_name: loc.contact_name || '',
          phone: loc.phone || '',
          email: loc.email || '',
        },
      };

      if (locationModal.isEdit) {
        await updatePortalSavedLocation(loc.id, payload, targetParams);
        notify?.(`Location "${loc.name}" updated successfully.`);
      } else {
        await createPortalSavedLocation(payload, targetParams);
        notify?.(`Location "${loc.name}" created successfully.`);
      }
      setLocationModal({ open: false, isEdit: false, data: null });
      loadLocations();
    } catch (err) {
      notify?.(err.message || 'Failed to save location');
    }
  };

  // Handle Delete Location
  const handleDeleteLocation = async (id) => {
    try {
      await deletePortalSavedLocation(id, targetParams);
      notify?.('Saved location deleted successfully.');
      setDeleteLocConfirm(null);
      loadLocations();
    } catch (err) {
      notify?.(err.message || 'Failed to delete location');
    }
  };

  // Toggle Preferred Carrier
  const togglePreferredCarrier = (carrierId) => {
    const id = Number(carrierId);
    setPreferences((prev) => {
      const isPref = prev.preferred_carrier_ids.includes(id);
      const newPref = isPref
        ? prev.preferred_carrier_ids.filter((x) => x !== id)
        : [...prev.preferred_carrier_ids, id];
      // Automatically remove from blocked if adding to preferred
      const newBlocked = prev.blocked_carrier_ids.filter((x) => x !== id);
      return {
        ...prev,
        preferred_carrier_ids: newPref,
        blocked_carrier_ids: newBlocked,
      };
    });
  };

  // Toggle Blocked Carrier
  const toggleBlockedCarrier = (carrierId) => {
    const id = Number(carrierId);
    setPreferences((prev) => {
      const isBlocked = prev.blocked_carrier_ids.includes(id);
      const newBlocked = isBlocked
        ? prev.blocked_carrier_ids.filter((x) => x !== id)
        : [...prev.blocked_carrier_ids, id];
      // Automatically remove from preferred if adding to blocked
      const newPref = prev.preferred_carrier_ids.filter((x) => x !== id);
      return {
        ...prev,
        preferred_carrier_ids: newPref,
        blocked_carrier_ids: newBlocked,
      };
    });
  };

  // Save Preferences
  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    try {
      await updatePortalPreferences(
        {
          preferred_carrier_ids: preferences.preferred_carrier_ids,
          blocked_carrier_ids: preferences.blocked_carrier_ids,
          notes: preferences.notes,
        },
        targetParams
      );
      notify?.('Carrier preferences saved successfully.');
      loadPreferences();
    } catch (err) {
      notify?.(err.message || 'Failed to save carrier preferences');
    } finally {
      setSavingPrefs(false);
    }
  };

  // Step 1 -> Step 2 -> Request Instant Quote
  const handleRequestQuote = async (e) => {
    e.preventDefault();
    if (!quoteFormData.origin_city || !quoteFormData.destination_city) {
      notify?.('Origin and Destination cities are required');
      return;
    }
    setRequestingQuote(true);
    setQuoteResult(null);
    setSelectedCarrier(null);
    try {
      const mode = normalizePortalMode(quoteFormData.mode);
      const payload = {
        action: 'quote',
        mode,
        origin: {
          address: quoteFormData.origin_address,
          city: quoteFormData.origin_city,
          state: quoteFormData.origin_state,
          postal_code: quoteFormData.origin_zip,
        },
        destination: {
          address: quoteFormData.destination_address,
          city: quoteFormData.destination_city,
          state: quoteFormData.destination_state,
          postal_code: quoteFormData.destination_zip,
        },
        distance_miles: Number(quoteFormData.distance_miles) || 500,
        rate_per_mile: Number(quoteFormData.rate_per_mile) || 2.75,
        equipment_type: quoteFormData.equipment_type,
        weight: Number(quoteFormData.weight_lbs) || 15000,
      };

      const res = await portalQuoteAndBook(payload, targetParams);
      const resultData = res?.data || res;
      setQuoteResult(resultData);
      setWizardStep(3);
      notify?.('Quote calculated with live carrier options.');
    } catch (err) {
      notify?.(err.message || 'Failed to calculate quote');
    } finally {
      setRequestingQuote(false);
    }
  };

  // Step 3 -> Book Shipment
  const handleBookShipment = async () => {
    if (!selectedCarrier) {
      notify?.('Please select an available carrier to confirm booking');
      return;
    }
    setBookingShipment(true);
    try {
      const mode = normalizePortalMode(quoteFormData.mode);
      const payload = {
        action: 'book',
        mode,
        carrier_org_id: selectedCarrier.id,
        quote_amount: quoteResult?.rate?.total || selectedCarrier.estimated_cost,
        origin: {
          address: quoteFormData.origin_address,
          city: quoteFormData.origin_city,
          state: quoteFormData.origin_state,
          postal_code: quoteFormData.origin_zip,
        },
        destination: {
          address: quoteFormData.destination_address,
          city: quoteFormData.destination_city,
          state: quoteFormData.destination_state,
          postal_code: quoteFormData.destination_zip,
        },
        pickup_date: quoteFormData.pickup_date || undefined,
        delivery_date: quoteFormData.delivery_date || undefined,
        freight_details: {
          mode,
          commodity: quoteFormData.commodity,
          equipment_type: quoteFormData.equipment_type,
          total_weight: Number(quoteFormData.weight_lbs),
          package_type: quoteFormData.package_type,
          package_quantity: Number(quoteFormData.package_quantity),
          special_instructions: quoteFormData.special_instructions,
        },
      };

      const res = await portalQuoteAndBook(payload, targetParams);
      const bookedData = res?.shipment || res?.data || res;
      setBookingConfirmedData(bookedData);
      setWizardStep(4);
      notify?.(`Shipment ${bookedData?.reference_number || ''} booked successfully!`);
    } catch (err) {
      notify?.(err.message || 'Booking failed');
    } finally {
      setBookingShipment(false);
    }
  };

  // Select Saved Location for Quote Origin or Destination
  const applySavedLocation = (locId, type) => {
    const loc = savedLocations.find((x) => x.id === Number(locId));
    if (!loc) return;
    const addr = loc.address || {};
    if (type === 'origin') {
      setQuoteFormData((prev) => ({
        ...prev,
        origin_name: loc.name,
        origin_address: addr.address_line1 || '',
        origin_city: addr.city || '',
        origin_state: addr.state || '',
        origin_zip: addr.postal_code || '',
      }));
    } else {
      setQuoteFormData((prev) => ({
        ...prev,
        destination_name: loc.name,
        destination_address: addr.address_line1 || '',
        destination_city: addr.city || '',
        destination_state: addr.state || '',
        destination_zip: addr.postal_code || '',
      }));
    }
    notify?.(`Applied saved location "${loc.name}" to ${type}`);
  };

  // Open Invoice Detail Modal
  const openInvoiceDetail = async (inv) => {
    setSelectedInvoice(inv);
    setShowInvoiceModal(true);
    try {
      const res = await getPortalInvoice(inv.id, targetParams);
      setSelectedInvoice(res?.data || res);
    } catch (err) {
      notify?.(err.message || 'Failed to load invoice details');
    }
  };

  return (
    <div className="cportal-container">
      {/* Header Row */}
      <div className="cportal-header-row">
        <div className="cportal-header-title">
          <div className="eyebrow" style={{ color: '#2563eb', fontWeight: 700, fontSize: '11.5px', marginBottom: '4px' }}>
            CUSTOMER & SHIPPER VISIBILITY · M12
          </div>
          <h1>Customer (Shipper) Portal</h1>
          <p>
            Self-service quote and book, shipment tracking, document downloads, billing invoices, and spend analytics.
          </p>
        </div>

        <div className="cportal-header-actions">
          {isPlatformAdmin && (
            <div className="cportal-tenant-badge">
              <Buildings size={16} />
              <span>Target Shipper:</span>
              <select
                className="cportal-tenant-select"
                value={targetShipperOrgId}
                onChange={(e) => setTargetShipperOrgId(e.target.value)}
                disabled={loadingCustomers}
              >
                {shipperCustomers.map((cust) => (
                  <option key={cust.id} value={cust.id}>
                    {cust.legal_name || `Shipper #${cust.id}`} (ID: {cust.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isPlatformAdmin && (
            <div className="cportal-tenant-badge">
              <Buildings size={16} />
              <span>{currentOrg?.legal_name || 'Shipper Account'}</span>
            </div>
          )}

          <button
            className="btn primary"
            onClick={() => {
              setActiveTab('quote-book');
              setWizardStep(1);
            }}
          >
            <Plus size={16} />
            <span>New Quote & Book</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="cportal-nav-tabs" aria-label="Portal Navigation Tabs">
        <button
          className={`cportal-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Truck size={17} />
          <span>Shipments Dashboard</span>
        </button>
        <button
          className={`cportal-tab-btn ${activeTab === 'quote-book' ? 'active' : ''}`}
          onClick={() => setActiveTab('quote-book')}
        >
          <CurrencyDollar size={17} />
          <span>Guided Quote & Book</span>
        </button>
        <button
          className={`cportal-tab-btn ${activeTab === 'locations' ? 'active' : ''}`}
          onClick={() => setActiveTab('locations')}
        >
          <MapPin size={17} />
          <span>Saved Locations</span>
        </button>
        <button
          className={`cportal-tab-btn ${activeTab === 'preferences' ? 'active' : ''}`}
          onClick={() => setActiveTab('preferences')}
        >
          <Star size={17} />
          <span>Carrier Preferences</span>
        </button>
        <button
          className={`cportal-tab-btn ${activeTab === 'billing' ? 'active' : ''}`}
          onClick={() => setActiveTab('billing')}
        >
          <Receipt size={17} />
          <span>Billing & Invoices</span>
        </button>
        <button
          className={`cportal-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <ChartBar size={17} />
          <span>Shipper Analytics</span>
        </button>
      </nav>

      {/* ==================================================================== */}
      {/* TAB 1: SHIPMENTS DASHBOARD (FR-12.2, FR-12.3, FR-12.7)              */}
      {/* ==================================================================== */}
      {activeTab === 'overview' && (
        <>
          {/* Summary KPIs */}
          <div className="cportal-kpi-grid">
            <div className="cportal-kpi-card">
              <div className="cportal-kpi-icon blue">
                <Package size={22} />
              </div>
              <div className="cportal-kpi-content">
                <span className="cportal-kpi-val">{shipmentPagination.total || shipments.length}</span>
                <span className="cportal-kpi-label">Total Shipments</span>
              </div>
            </div>
            <div className="cportal-kpi-card">
              <div className="cportal-kpi-icon emerald">
                <Truck size={22} />
              </div>
              <div className="cportal-kpi-content">
                <span className="cportal-kpi-val">
                  {shipments.filter((s) => ['booked', 'dispatched', 'in_transit'].includes(s.status)).length}
                </span>
                <span className="cportal-kpi-label">Active Movements</span>
              </div>
            </div>
            <div className="cportal-kpi-card">
              <div className="cportal-kpi-icon amber">
                <Clock size={22} />
              </div>
              <div className="cportal-kpi-content">
                <span className="cportal-kpi-val">
                  {shipments.filter((s) => s.status === 'in_transit').length}
                </span>
                <span className="cportal-kpi-label">In Transit Live</span>
              </div>
            </div>
            <div className="cportal-kpi-card">
              <div className="cportal-kpi-icon purple">
                <CheckCircle size={22} />
              </div>
              <div className="cportal-kpi-content">
                <span className="cportal-kpi-val">
                  {shipments.filter((s) => s.status === 'delivered').length}
                </span>
                <span className="cportal-kpi-label">Delivered</span>
              </div>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="cportal-toolbar">
            <div className="cportal-toolbar-left">
              {/* Active vs Past Filter */}
              <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px' }}>
                <button
                  type="button"
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: shipmentFilter === 'active' ? '#ffffff' : 'transparent',
                    fontWeight: shipmentFilter === 'active' ? 700 : 500,
                    color: shipmentFilter === 'active' ? '#2563eb' : '#64748b',
                    cursor: 'pointer',
                    boxShadow: shipmentFilter === 'active' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  }}
                  onClick={() => setShipmentFilter('active')}
                >
                  Active Shipments
                </button>
                <button
                  type="button"
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: shipmentFilter === 'past' ? '#ffffff' : 'transparent',
                    fontWeight: shipmentFilter === 'past' ? 700 : 500,
                    color: shipmentFilter === 'past' ? '#2563eb' : '#64748b',
                    cursor: 'pointer',
                    boxShadow: shipmentFilter === 'past' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  }}
                  onClick={() => setShipmentFilter('past')}
                >
                  Past Shipments
                </button>
                <button
                  type="button"
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: shipmentFilter === 'all' ? '#ffffff' : 'transparent',
                    fontWeight: shipmentFilter === 'all' ? 700 : 500,
                    color: shipmentFilter === 'all' ? '#2563eb' : '#64748b',
                    cursor: 'pointer',
                    boxShadow: shipmentFilter === 'all' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  }}
                  onClick={() => setShipmentFilter('all')}
                >
                  All
                </button>
              </div>

              {/* Search Box */}
              <div className="cportal-search-box">
                <MagnifyingGlass size={17} color="#64748b" />
                <input
                  type="text"
                  placeholder="Search reference #, city, carrier..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Status Specific Dropdown */}
              <select
                className="cportal-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Specific Statuses</option>
                <option value="booked">Booked</option>
                <option value="dispatched">Dispatched</option>
                <option value="in_transit">In Transit</option>
                <option value="delivered">Delivered</option>
                <option value="closed">Closed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="cportal-toolbar-right">
              <button
                className="btn"
                onClick={loadShipments}
                disabled={loadingShipments}
                title="Refresh shipments"
              >
                <ArrowsClockwise size={16} className={loadingShipments ? 'spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Shipments Table */}
          <div className="cportal-table-card">
            {loadingShipments ? (
              <div className="cportal-empty-state">
                <ArrowsClockwise size={32} className="spin" color="#2563eb" />
                <h3>Loading Shipments...</h3>
                <p>Retrieving your scoped freight movements from server.</p>
              </div>
            ) : shipments.length === 0 ? (
              <div className="cportal-empty-state">
                <ShoppingBag size={42} color="#94a3b8" />
                <h3>No shipments found</h3>
                <p>
                  No freight movements match your current filter criteria. Use Guided Quote & Book to schedule a new movement.
                </p>
                <button
                  className="btn primary"
                  style={{ marginTop: '12px' }}
                  onClick={() => {
                    setActiveTab('quote-book');
                    setWizardStep(1);
                  }}
                >
                  <Plus size={16} />
                  <span>Create First Booking</span>
                </button>
              </div>
            ) : (
              <table className="cportal-table">
                <thead>
                  <tr>
                    <th>Reference #</th>
                    <th>Origin</th>
                    <th>Destination</th>
                    <th>Carrier</th>
                    <th>Status</th>
                    <th>ETA</th>
                    <th>Quote Amount</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((shp) => {
                    const originCity = shp.origin?.city || (typeof shp.origin === 'string' ? shp.origin : '—');
                    const originState = shp.origin?.state || '';
                    const destCity = shp.destination?.city || (typeof shp.destination === 'string' ? shp.destination : '—');
                    const destState = shp.destination?.state || '';

                    return (
                      <tr key={shp.id}>
                        <td>
                          <button
                            type="button"
                            className="table-link"
                            style={{ fontWeight: 700, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}
                            onClick={() => {
                              setSelectedShipment(shp);
                              setShowDetailModal(true);
                            }}
                          >
                            {shp.reference_number || `SHP-${shp.id}`}
                          </button>
                        </td>
                        <td>
                          <strong>{originCity}</strong>
                          {originState ? `, ${originState}` : ''}
                        </td>
                        <td>
                          <strong>{destCity}</strong>
                          {destState ? `, ${destState}` : ''}
                        </td>
                        <td>
                          {shp.carrier_org?.legal_name || shp.carrier?.legal_name || (
                            <span style={{ color: '#94a3b8' }}>Unassigned</span>
                          )}
                        </td>
                        <td>
                          <span className={`cportal-badge ${shp.status}`}>
                            {shp.status?.replace('_', ' ')}
                          </span>
                        </td>
                        <td>{formatDate(shp.estimated_delivery || shp.eta)}</td>
                        <td>
                          <strong>{money(shp.quote_amount)}</strong>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn small"
                              title="Live Tracking & Map"
                              onClick={() => openTracking(shp)}
                            >
                              <MapPin size={15} color="#2563eb" />
                              <span>Track</span>
                            </button>
                            <button
                              type="button"
                              className="btn small"
                              title="Shipment Documents"
                              onClick={() => openDocuments(shp)}
                            >
                              <FileText size={15} color="#475569" />
                              <span>Docs</span>
                            </button>
                            <button
                              type="button"
                              className="icon-btn small"
                              title="View Details"
                              onClick={() => {
                                setSelectedShipment(shp);
                                setShowDetailModal(true);
                              }}
                            >
                              <CaretRight size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: GUIDED QUOTE AND BOOK (FR-12.1)                              */}
      {/* ==================================================================== */}
      {activeTab === 'quote-book' && (
        <div className="cportal-wizard-card">
          {/* Stepper Header */}
          <div className="cportal-stepper">
            <div
              className={`cportal-step-node ${wizardStep === 1 ? 'active' : ''} ${wizardStep > 1 ? 'completed' : ''}`}
              onClick={() => wizardStep > 1 && setWizardStep(1)}
            >
              <div className="cportal-step-circle">{wizardStep > 1 ? <Check size={14} /> : '1'}</div>
              <span>1. Route & Addresses</span>
            </div>
            <ArrowRight size={16} color="#cbd5e1" />

            <div
              className={`cportal-step-node ${wizardStep === 2 ? 'active' : ''} ${wizardStep > 2 ? 'completed' : ''}`}
              onClick={() => wizardStep > 2 && setWizardStep(2)}
            >
              <div className="cportal-step-circle">{wizardStep > 2 ? <Check size={14} /> : '2'}</div>
              <span>2. Freight & Cargo</span>
            </div>
            <ArrowRight size={16} color="#cbd5e1" />

            <div
              className={`cportal-step-node ${wizardStep === 3 ? 'active' : ''} ${wizardStep > 3 ? 'completed' : ''}`}
              onClick={() => quoteResult && setWizardStep(3)}
            >
              <div className="cportal-step-circle">{wizardStep > 3 ? <Check size={14} /> : '3'}</div>
              <span>3. Rates & Carriers</span>
            </div>
            <ArrowRight size={16} color="#cbd5e1" />

            <div className={`cportal-step-node ${wizardStep === 4 ? 'completed' : ''}`}>
              <div className="cportal-step-circle">{wizardStep === 4 ? <Check size={14} /> : '4'}</div>
              <span>4. Confirmation</span>
            </div>
          </div>

          {/* STEP 1: ROUTE & ADDRESSES */}
          {wizardStep === 1 && (
            <div>
              <h3 style={{ margin: '0 0 16px', fontSize: '18px', color: '#0f172a' }}>
                Origin & Destination Locations
              </h3>

              {savedLocations.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  <div className="cportal-form-field">
                    <label>Quick Fill Origin from Saved Locations:</label>
                    <select
                      className="cportal-select"
                      onChange={(e) => applySavedLocation(e.target.value, 'origin')}
                    >
                      <option value="">— Select Saved Address —</option>
                      {savedLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} ({loc.address?.city}, {loc.address?.state})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="cportal-form-field">
                    <label>Quick Fill Destination from Saved Locations:</label>
                    <select
                      className="cportal-select"
                      onChange={(e) => applySavedLocation(e.target.value, 'destination')}
                    >
                      <option value="">— Select Saved Address —</option>
                      {savedLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} ({loc.address?.city}, {loc.address?.state})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* Origin Box */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 12px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={18} color="#2563eb" />
                    <span>Origin (Pickup)</span>
                  </h4>
                  <div className="cportal-form-field" style={{ marginBottom: '10px' }}>
                    <label>Facility Name / Dock:</label>
                    <input
                      type="text"
                      placeholder="e.g. Apex Central Distribution"
                      value={quoteFormData.origin_name}
                      onChange={(e) => setQuoteFormData({ ...quoteFormData, origin_name: e.target.value })}
                    />
                  </div>
                  <div className="cportal-form-field" style={{ marginBottom: '10px' }}>
                    <label>Street Address:</label>
                    <input
                      type="text"
                      placeholder="e.g. 100 Logistics Way"
                      value={quoteFormData.origin_address}
                      onChange={(e) => setQuoteFormData({ ...quoteFormData, origin_address: e.target.value })}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr', gap: '10px' }}>
                    <div className="cportal-form-field">
                      <label>City *:</label>
                      <input
                        type="text"
                        placeholder="Dallas"
                        required
                        value={quoteFormData.origin_city}
                        onChange={(e) => setQuoteFormData({ ...quoteFormData, origin_city: e.target.value })}
                      />
                    </div>
                    <div className="cportal-form-field">
                      <label>State *:</label>
                      <input
                        type="text"
                        placeholder="TX"
                        required
                        value={quoteFormData.origin_state}
                        onChange={(e) => setQuoteFormData({ ...quoteFormData, origin_state: e.target.value })}
                      />
                    </div>
                    <div className="cportal-form-field">
                      <label>Postal Code:</label>
                      <input
                        type="text"
                        placeholder="75201"
                        value={quoteFormData.origin_zip}
                        onChange={(e) => setQuoteFormData({ ...quoteFormData, origin_zip: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Destination Box */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 12px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={18} color="#059669" />
                    <span>Destination (Delivery)</span>
                  </h4>
                  <div className="cportal-form-field" style={{ marginBottom: '10px' }}>
                    <label>Facility Name / Receiver:</label>
                    <input
                      type="text"
                      placeholder="e.g. Southeast Fulfillment Center"
                      value={quoteFormData.destination_name}
                      onChange={(e) => setQuoteFormData({ ...quoteFormData, destination_name: e.target.value })}
                    />
                  </div>
                  <div className="cportal-form-field" style={{ marginBottom: '10px' }}>
                    <label>Street Address:</label>
                    <input
                      type="text"
                      placeholder="e.g. 500 Freight Boulevard"
                      value={quoteFormData.destination_address}
                      onChange={(e) => setQuoteFormData({ ...quoteFormData, destination_address: e.target.value })}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr', gap: '10px' }}>
                    <div className="cportal-form-field">
                      <label>City *:</label>
                      <input
                        type="text"
                        placeholder="Atlanta"
                        required
                        value={quoteFormData.destination_city}
                        onChange={(e) => setQuoteFormData({ ...quoteFormData, destination_city: e.target.value })}
                      />
                    </div>
                    <div className="cportal-form-field">
                      <label>State *:</label>
                      <input
                        type="text"
                        placeholder="GA"
                        required
                        value={quoteFormData.destination_state}
                        onChange={(e) => setQuoteFormData({ ...quoteFormData, destination_state: e.target.value })}
                      />
                    </div>
                    <div className="cportal-form-field">
                      <label>Postal Code:</label>
                      <input
                        type="text"
                        placeholder="30301"
                        value={quoteFormData.destination_zip}
                        onChange={(e) => setQuoteFormData({ ...quoteFormData, destination_zip: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!quoteFormData.origin_city.trim() || !quoteFormData.destination_city.trim()}
                  onClick={() => setWizardStep(2)}
                >
                  <span>Continue to Cargo Details</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: CARGO & FREIGHT */}
          {wizardStep === 2 && (
            <div>
              <h3 style={{ margin: '0 0 16px', fontSize: '18px', color: '#0f172a' }}>
                Commodity & Equipment Specifications
              </h3>

              <div className="cportal-form-grid">
                <div className="cportal-form-field">
                  <label>Freight Mode:</label>
                  <select
                    value={quoteFormData.mode}
                    onChange={(e) => {
                      const mode = e.target.value === 'air' ? 'air' : 'ocean';
                      setQuoteFormData({
                        ...quoteFormData,
                        mode,
                        equipment_type: PORTAL_EQUIPMENT_BY_MODE[mode][0],
                      });
                    }}
                  >
                    <option value="ocean">Ocean Freight</option>
                    <option value="air">Air Cargo</option>
                  </select>
                </div>
                <div className="cportal-form-field">
                  <label>Commodity Description:</label>
                  <input
                    type="text"
                    value={quoteFormData.commodity}
                    onChange={(e) => setQuoteFormData({ ...quoteFormData, commodity: e.target.value })}
                  />
                </div>
                <div className="cportal-form-field">
                  <label>Equipment Type:</label>
                  <select
                    value={quoteFormData.equipment_type}
                    onChange={(e) => setQuoteFormData({ ...quoteFormData, equipment_type: e.target.value })}
                  >
                    {PORTAL_EQUIPMENT_BY_MODE[normalizePortalMode(quoteFormData.mode)].map((equipment) => (
                      <option key={equipment} value={equipment}>{equipment}</option>
                    ))}
                  </select>
                </div>
                <div className="cportal-form-field">
                  <label>Total Weight (lbs):</label>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    value={quoteFormData.weight_lbs}
                    onChange={(e) => setQuoteFormData({ ...quoteFormData, weight_lbs: e.target.value })}
                  />
                </div>
                <div className="cportal-form-field">
                  <label>Estimated Distance (Miles):</label>
                  <input
                    type="number"
                    min="10"
                    value={quoteFormData.distance_miles}
                    onChange={(e) => setQuoteFormData({ ...quoteFormData, distance_miles: e.target.value })}
                  />
                </div>
                <div className="cportal-form-field">
                  <label>Package Type & Count:</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <select
                      value={quoteFormData.package_type}
                      onChange={(e) => setQuoteFormData({ ...quoteFormData, package_type: e.target.value })}
                    >
                      <option value="Pallets">Pallets</option>
                      <option value="Boxes">Boxes</option>
                      <option value="Crates">Crates</option>
                      <option value="Drums">Drums</option>
                    </select>
                    <input
                      type="number"
                      min="1"
                      value={quoteFormData.package_quantity}
                      onChange={(e) => setQuoteFormData({ ...quoteFormData, package_quantity: e.target.value })}
                    />
                  </div>
                </div>
                <div className="cportal-form-field">
                  <label>Pickup Date (Earliest):</label>
                  <input
                    type="date"
                    value={quoteFormData.pickup_date}
                    onChange={(e) => setQuoteFormData({ ...quoteFormData, pickup_date: e.target.value })}
                  />
                </div>
                <div className="cportal-form-field">
                  <label>Delivery Date (Required):</label>
                  <input
                    type="date"
                    value={quoteFormData.delivery_date}
                    onChange={(e) => setQuoteFormData({ ...quoteFormData, delivery_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="cportal-form-field" style={{ marginBottom: '24px' }}>
                <label>Special Instructions for Carrier / Driver:</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Liftgate required at delivery, appointment confirmation 24h prior..."
                  value={quoteFormData.special_instructions}
                  onChange={(e) => setQuoteFormData({ ...quoteFormData, special_instructions: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button type="button" className="btn" onClick={() => setWizardStep(1)}>
                  <ArrowLeft size={16} />
                  <span>Back to Route</span>
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={requestingQuote}
                  onClick={handleRequestQuote}
                >
                  {requestingQuote ? (
                    <>
                      <ArrowsClockwise size={16} className="spin" />
                      <span>Calculating Rates...</span>
                    </>
                  ) : (
                    <>
                      <span>Get Instant Quote & Carriers</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: RATES & CARRIER SELECTION */}
          {wizardStep === 3 && quoteResult && (
            <div>
              <h3 style={{ margin: '0 0 16px', fontSize: '18px', color: '#0f172a' }}>
                Calculated Rate & Carrier Selection
              </h3>

              {/* Rate Breakdown Card */}
              <div className="cportal-rate-breakdown">
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b', marginBottom: '8px' }}>
                  Transparent Rate Estimation:
                </div>
                <div className="cportal-rate-row">
                  <span>Linehaul Rate ({quoteFormData.distance_miles} miles @ ${quoteResult.rate?.rate_per_mile || '2.50'}/mi):</span>
                  <strong>{money(quoteResult.rate?.linehaul)}</strong>
                </div>
                <div className="cportal-rate-row">
                  <span>Estimated Fuel Surcharge:</span>
                  <strong>{money(quoteResult.rate?.fuel_surcharge)}</strong>
                </div>
                <div className="cportal-rate-row total">
                  <span>Total Guaranteed Shipper Cost:</span>
                  <span style={{ color: '#2563eb' }}>{money(quoteResult.rate?.total)}</span>
                </div>
              </div>

              {/* Available Carriers List */}
              <h4 style={{ margin: '0 0 12px', color: '#1e293b' }}>
                Select an Authorized Carrier ({quoteResult.available_carriers?.length || 0} active candidates):
              </h4>

              {quoteResult.available_carriers?.length === 0 ? (
                <div className="cportal-alert info">
                  <Info size={18} />
                  <span>No independent carriers currently available for this lane. You can still confirm booking with Harbor Network default capacity.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                  {quoteResult.available_carriers.map((c) => {
                    const isSelected = selectedCarrier?.id === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`cportal-carrier-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedCarrier(c)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '50%',
                              border: isSelected ? '6px solid #2563eb' : '2px solid #cbd5e1',
                              background: '#ffffff',
                              boxSizing: 'border-box',
                            }}
                          />
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <strong>{c.legal_name}</strong>
                              {c.is_preferred && (
                                <span className="cportal-badge preferred">
                                  <Star size={12} weight="fill" />
                                  <span>Preferred Carrier</span>
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>
                              DOT: {c.dot_number || '—'} · MC: {c.mc_number || '—'} · Safety: {c.safety_rating || 'Satisfactory'}
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                            {money(c.estimated_cost || quoteResult.rate?.total)}
                          </div>
                          <span style={{ fontSize: '11.5px', color: '#059669', fontWeight: 600 }}>Available Capacity</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button type="button" className="btn" onClick={() => setWizardStep(2)}>
                  <ArrowLeft size={16} />
                  <span>Back to Freight</span>
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!selectedCarrier || bookingShipment}
                  onClick={handleBookShipment}
                >
                  {bookingShipment ? (
                    <>
                      <ArrowsClockwise size={16} className="spin" />
                      <span>Confirming Booking...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} />
                      <span>Confirm & Book Shipment</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: CONFIRMATION (BOOKING PERSISTED) */}
          {wizardStep === 4 && bookingConfirmedData && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: '#ecfdf5',
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <CheckCircle size={38} weight="fill" />
              </div>

              <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
                Shipment Booked Successfully!
              </h2>

              <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '480px', margin: '0 auto 20px' }}>
                Your shipment has been registered in the system with status <strong>Booked</strong>. Initial Bill of Lading (BOL) and billing invoices have been automatically created.
              </p>

              <div
                style={{
                  display: 'inline-block',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '16px 28px',
                  textAlign: 'left',
                  marginBottom: '28px',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px', fontSize: '13.5px' }}>
                  <span style={{ color: '#64748b' }}>Reference ID:</span>
                  <strong style={{ color: '#2563eb' }}>{bookingConfirmedData.reference_number}</strong>

                  <span style={{ color: '#64748b' }}>Assigned Carrier:</span>
                  <strong>{selectedCarrier?.legal_name || 'Carrier Network'}</strong>

                  <span style={{ color: '#64748b' }}>Agreed Amount:</span>
                  <strong>{money(bookingConfirmedData.quote_amount || quoteResult?.rate?.total)}</strong>

                  <span style={{ color: '#64748b' }}>Status:</span>
                  <span className="cportal-badge booked">Booked</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    setActiveTab('overview');
                    loadShipments();
                  }}
                >
                  <Truck size={16} />
                  <span>View in Shipments Dashboard</span>
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setWizardStep(1);
                    setQuoteResult(null);
                    setSelectedCarrier(null);
                    setBookingConfirmedData(null);
                  }}
                >
                  <span>Book Another Shipment</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: SAVED LOCATIONS (FR-12.6)                                    */}
      {/* ==================================================================== */}
      {activeTab === 'locations' && (
        <>
          <div className="cportal-toolbar">
            <div className="cportal-toolbar-left">
              <div className="cportal-search-box">
                <MagnifyingGlass size={17} color="#64748b" />
                <input
                  type="text"
                  placeholder="Search locations..."
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                />
              </div>

              <select
                className="cportal-select"
                value={locationTypeFilter}
                onChange={(e) => setLocationTypeFilter(e.target.value)}
              >
                <option value="all">All Location Types</option>
                <option value="warehouse">Warehouse</option>
                <option value="pickup">Pickup Only</option>
                <option value="delivery">Delivery Only</option>
                <option value="both">Both Pickup & Delivery</option>
              </select>
            </div>

            <div className="cportal-toolbar-right">
              <button
                className="btn primary"
                onClick={() =>
                  setLocationModal({
                    open: true,
                    isEdit: false,
                    data: { name: '', type: 'both', address_line1: '', city: '', state: '', postal_code: '', country: 'USA' },
                  })
                }
              >
                <Plus size={16} />
                <span>Add Location</span>
              </button>
            </div>
          </div>

          <div className="cportal-table-card">
            {loadingLocations ? (
              <div className="cportal-empty-state">
                <ArrowsClockwise size={32} className="spin" color="#2563eb" />
                <h3>Loading Saved Locations...</h3>
              </div>
            ) : savedLocations.length === 0 ? (
              <div className="cportal-empty-state">
                <MapPin size={42} color="#94a3b8" />
                <h3>No saved locations</h3>
                <p>Add your warehouse, dock, or recurring shipping addresses for quick prefill during booking.</p>
                <button
                  className="btn primary"
                  style={{ marginTop: '10px' }}
                  onClick={() =>
                    setLocationModal({
                      open: true,
                      isEdit: false,
                      data: { name: '', type: 'both', city: '', state: '' },
                    })
                  }
                >
                  <Plus size={16} />
                  <span>Add First Location</span>
                </button>
              </div>
            ) : (
              <table className="cportal-table">
                <thead>
                  <tr>
                    <th>Location Name</th>
                    <th>Type</th>
                    <th>Address</th>
                    <th>City / State</th>
                    <th>Contact</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {savedLocations.map((loc) => {
                    const addr = loc.address || {};
                    const contact = loc.contact || {};
                    return (
                      <tr key={loc.id}>
                        <td>
                          <strong>{loc.name}</strong>
                        </td>
                        <td>
                          <span className="cportal-badge booked" style={{ textTransform: 'capitalize' }}>
                            {loc.type}
                          </span>
                        </td>
                        <td>{addr.address_line1 || '—'}</td>
                        <td>
                          {addr.city}, {addr.state} {addr.postal_code || ''}
                        </td>
                        <td>
                          {contact.contact_name ? (
                            <div>
                              <div>{contact.contact_name}</div>
                              <small style={{ color: '#64748b' }}>{contact.phone || contact.email}</small>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="icon-btn small"
                              title="Edit Location"
                              onClick={() =>
                                setLocationModal({
                                  open: true,
                                  isEdit: true,
                                  data: {
                                    id: loc.id,
                                    name: loc.name,
                                    type: loc.type,
                                    address_line1: addr.address_line1 || '',
                                    city: addr.city || '',
                                    state: addr.state || '',
                                    postal_code: addr.postal_code || '',
                                    country: addr.country || 'USA',
                                    contact_name: contact.contact_name || '',
                                    phone: contact.phone || '',
                                    email: contact.email || '',
                                  },
                                })
                              }
                            >
                              <PencilSimple size={16} />
                            </button>
                            <button
                              type="button"
                              className="icon-btn small"
                              title="Delete Location"
                              onClick={() => setDeleteLocConfirm(loc)}
                            >
                              <Trash size={16} color="#ef4444" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: CARRIER PREFERENCES (FR-12.6)                                */}
      {/* ==================================================================== */}
      {activeTab === 'preferences' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="cportal-toolbar">
            <div>
              <strong>Carrier Routing Rules</strong>
              <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>
                Preferred carriers are ranked first in instant quote comparisons. Blocked carriers are strictly excluded from quoting and booking.
              </p>
            </div>
            <button
              className="btn primary"
              disabled={savingPrefs}
              onClick={handleSavePreferences}
            >
              <Check size={16} />
              <span>{savingPrefs ? 'Saving Rules...' : 'Save Preferences'}</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Preferred Carriers Box */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <Star size={20} color="#d97706" weight="fill" />
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>
                  Preferred Carriers ({preferences.preferred_carrier_ids.length})
                </h3>
              </div>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 14px' }}>
                These carriers receive priority awarding and gold badge highlight in your quote search.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
                {allCarriers.map((c) => {
                  const isPref = preferences.preferred_carrier_ids.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: isPref ? '#fcd34d' : '#e2e8f0',
                        background: isPref ? '#fffbeb' : '#ffffff',
                      }}
                    >
                      <div>
                        <strong>{c.legal_name}</strong>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          MC: {c.mc_number || '—'} · DOT: {c.dot_number || '—'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={isPref ? 'btn small primary' : 'btn small'}
                        onClick={() => togglePreferredCarrier(c.id)}
                      >
                        {isPref ? <Check size={14} /> : <Plus size={14} />}
                        <span>{isPref ? 'Preferred' : 'Mark Preferred'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Blocked Carriers Box */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <Prohibit size={20} color="#ef4444" weight="bold" />
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>
                  Blocked Carriers ({preferences.blocked_carrier_ids.length})
                </h3>
              </div>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 14px' }}>
                These carriers will be blocked by the backend API and cannot be booked under any circumstance.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
                {allCarriers.map((c) => {
                  const isBlocked = preferences.blocked_carrier_ids.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: isBlocked ? '#fca5a5' : '#e2e8f0',
                        background: isBlocked ? '#fef2f2' : '#ffffff',
                      }}
                    >
                      <div>
                        <strong>{c.legal_name}</strong>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          MC: {c.mc_number || '—'} · DOT: {c.dot_number || '—'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={isBlocked ? 'btn small danger' : 'btn small'}
                        onClick={() => toggleBlockedCarrier(c.id)}
                      >
                        {isBlocked ? <Prohibit size={14} /> : <Prohibit size={14} />}
                        <span>{isBlocked ? 'Blocked' : 'Block Carrier'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 5: BILLING & INVOICES (FR-12.5)                                 */}
      {/* ==================================================================== */}
      {activeTab === 'billing' && (
        <>
          {/* Summary KPI Cards */}
          <div className="cportal-kpi-grid">
            <div className="cportal-kpi-card">
              <div className="cportal-kpi-icon blue">
                <Receipt size={22} />
              </div>
              <div className="cportal-kpi-content">
                <span className="cportal-kpi-val">{money(billingSummary?.total_invoiced)}</span>
                <span className="cportal-kpi-label">Total Invoiced</span>
              </div>
            </div>
            <div className="cportal-kpi-card">
              <div className="cportal-kpi-icon emerald">
                <CheckCircle size={22} />
              </div>
              <div className="cportal-kpi-content">
                <span className="cportal-kpi-val">{money(billingSummary?.total_paid)}</span>
                <span className="cportal-kpi-label">Total Paid</span>
              </div>
            </div>
            <div className="cportal-kpi-card">
              <div className="cportal-kpi-icon rose">
                <CurrencyDollar size={22} />
              </div>
              <div className="cportal-kpi-content">
                <span className="cportal-kpi-val" style={{ color: '#e11d48' }}>
                  {money(billingSummary?.total_outstanding)}
                </span>
                <span className="cportal-kpi-label">Outstanding Balance</span>
              </div>
            </div>
            <div className="cportal-kpi-card">
              <div className="cportal-kpi-icon amber">
                <Clock size={22} />
              </div>
              <div className="cportal-kpi-content">
                <span className="cportal-kpi-val">{billingSummary?.pending_count || 0}</span>
                <span className="cportal-kpi-label">Pending Invoices</span>
              </div>
            </div>
          </div>

          <div className="cportal-toolbar">
            <div className="cportal-toolbar-left">
              <select
                className="cportal-select"
                value={invoiceStatusFilter}
                onChange={(e) => setInvoiceStatusFilter(e.target.value)}
              >
                <option value="all">All Invoice Statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
            <div className="cportal-toolbar-right">
              <button className="btn" onClick={loadInvoices} disabled={loadingInvoices}>
                <ArrowsClockwise size={16} className={loadingInvoices ? 'spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="cportal-table-card">
            {loadingInvoices ? (
              <div className="cportal-empty-state">
                <ArrowsClockwise size={32} className="spin" color="#2563eb" />
                <h3>Loading Invoices...</h3>
              </div>
            ) : invoices.length === 0 ? (
              <div className="cportal-empty-state">
                <Receipt size={42} color="#94a3b8" />
                <h3>No billing records found</h3>
                <p>When freight is booked and delivered, shipper invoices will appear here automatically.</p>
              </div>
            ) : (
              <table className="cportal-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Linked Shipment</th>
                    <th>Total Amount</th>
                    <th>Amount Paid</th>
                    <th>Outstanding</th>
                    <th>Status</th>
                    <th>Due Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const outstanding = Math.max(0, Number(inv.amount || 0) - Number(inv.amount_paid || 0));
                    return (
                      <tr key={inv.id}>
                        <td>
                          <strong>{inv.invoice_number || `INV-${inv.id}`}</strong>
                        </td>
                        <td>
                          {inv.shipment ? (
                            <span style={{ fontWeight: 600, color: '#2563eb' }}>
                              {inv.shipment.reference_number || `SHP-${inv.shipment.id}`}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <strong>{money(inv.amount)}</strong>
                        </td>
                        <td style={{ color: '#059669' }}>{money(inv.amount_paid)}</td>
                        <td style={{ fontWeight: 700, color: outstanding > 0 ? '#b91c1c' : '#475569' }}>
                          {money(outstanding)}
                        </td>
                        <td>
                          <span className={`cportal-badge ${inv.status}`}>{inv.status}</span>
                        </td>
                        <td>{formatDate(inv.due_date)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => openInvoiceDetail(inv)}
                          >
                            <Eye size={15} />
                            <span>Details</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ==================================================================== */}
      {/* TAB 6: SHIPPER ANALYTICS (FR-12.8)                                   */}
      {/* ==================================================================== */}
      {activeTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {loadingAnalytics ? (
            <div className="cportal-empty-state">
              <ArrowsClockwise size={32} className="spin" color="#2563eb" />
              <h3>Calculating Shipper Analytics...</h3>
            </div>
          ) : !analytics ? (
            <div className="cportal-empty-state">
              <ChartBar size={42} color="#94a3b8" />
              <h3>No analytics data available</h3>
              <p>Analytics require active or completed shipments for your organization.</p>
            </div>
          ) : (
            <>
              {/* Analytics Metric Cards */}
              <div className="cportal-kpi-grid">
                <div className="cportal-kpi-card">
                  <div className="cportal-kpi-icon blue">
                    <CurrencyDollar size={22} />
                  </div>
                  <div className="cportal-kpi-content">
                    <span className="cportal-kpi-val">{money(analytics.summary?.total_spend)}</span>
                    <span className="cportal-kpi-label">Total Spend</span>
                  </div>
                </div>
                <div className="cportal-kpi-card">
                  <div className="cportal-kpi-icon emerald">
                    <CheckCircle size={22} />
                  </div>
                  <div className="cportal-kpi-content">
                    <span className="cportal-kpi-val">{analytics.summary?.on_time_rate ?? 98}%</span>
                    <span className="cportal-kpi-label">On-Time Performance</span>
                  </div>
                </div>
                <div className="cportal-kpi-card">
                  <div className="cportal-kpi-icon amber">
                    <Truck size={22} />
                  </div>
                  <div className="cportal-kpi-content">
                    <span className="cportal-kpi-val">{analytics.summary?.active_shipments || 0}</span>
                    <span className="cportal-kpi-label">Active Orders</span>
                  </div>
                </div>
                <div className="cportal-kpi-card">
                  <div className="cportal-kpi-icon purple">
                    <Package size={22} />
                  </div>
                  <div className="cportal-kpi-content">
                    <span className="cportal-kpi-val">{analytics.summary?.total_shipments || 0}</span>
                    <span className="cportal-kpi-label">Lifetime Shipments</span>
                  </div>
                </div>
              </div>

              {/* Spend by Lane & Carrier Breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Spend by Lane Table */}
                <div className="cportal-table-card" style={{ padding: '20px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '16px', color: '#0f172a' }}>
                    Spend by Shipping Lane
                  </h3>
                  {!analytics.spend_by_lane || analytics.spend_by_lane.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: '13px' }}>No lane data accumulated yet.</p>
                  ) : (
                    <table className="cportal-table">
                      <thead>
                        <tr>
                          <th>Lane</th>
                          <th>Shipments</th>
                          <th>Total Spend</th>
                          <th>Avg Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.spend_by_lane.map((lane, i) => (
                          <tr key={i}>
                            <td>
                              <strong>{lane.lane}</strong>
                            </td>
                            <td>{lane.shipment_count}</td>
                            <td>{money(lane.total_spend)}</td>
                            <td>{money(lane.avg_spend)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Carrier Performance Breakdown */}
                <div className="cportal-table-card" style={{ padding: '20px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '16px', color: '#0f172a' }}>
                    Carrier Partner Performance
                  </h3>
                  {!analytics.carrier_performance || analytics.carrier_performance.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: '13px' }}>No carrier allocation data yet.</p>
                  ) : (
                    <table className="cportal-table">
                      <thead>
                        <tr>
                          <th>Carrier</th>
                          <th>Volume</th>
                          <th>Safety Rating</th>
                          <th>Total Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.carrier_performance.map((cp, i) => (
                          <tr key={i}>
                            <td>
                              <strong>{cp.carrier_name}</strong>
                            </td>
                            <td>{cp.shipment_count} loads</td>
                            <td>
                              <span className="cportal-badge delivered">{cp.safety_rating || 'Satisfactory'}</span>
                            </td>
                            <td>{money(cp.total_spend)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 1: LIVE TRACKING & MAP PREVIEW (FR-12.3)                       */}
      {/* ==================================================================== */}
      {showTrackingModal && selectedShipment && (
        <div className="cportal-modal-backdrop" onClick={() => setShowTrackingModal(false)}>
          <div className="cportal-modal-box wide" onClick={(e) => e.stopPropagation()}>
            <div className="cportal-modal-header">
              <div>
                <h2>Live Tracking · {selectedShipment.reference_number || `SHP-${selectedShipment.id}`}</h2>
                <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                  Real-time status updates and delivery progression
                </span>
              </div>
              <button className="icon-btn" onClick={() => setShowTrackingModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="cportal-modal-body">
              {loadingTracking ? (
                <div className="cportal-empty-state">
                  <ArrowsClockwise size={32} className="spin" color="#2563eb" />
                  <h3>Retrieving Live GPS Coordinates...</h3>
                </div>
              ) : (
                <>
                  {/* Route Visualizer */}
                  <div className="cportal-tracking-route">
                    <div className="cportal-route-point">
                      <span style={{ color: '#2563eb', fontWeight: 700 }}>ORIGIN PICKUP</span>
                      <strong>
                        {trackingData?.origin?.city || selectedShipment.origin?.city || 'Origin'}
                        {trackingData?.origin?.state ? `, ${trackingData.origin.state}` : ''}
                      </strong>
                    </div>

                    <div className="cportal-route-progress">
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#2563eb' }}>
                        STATUS: {trackingData?.status?.toUpperCase() || selectedShipment.status?.toUpperCase()}
                      </div>
                      <div className="cportal-progress-bar">
                        <div
                          className="cportal-progress-fill"
                          style={{
                            width:
                              trackingData?.status === 'delivered'
                                ? '100%'
                                : trackingData?.status === 'in_transit'
                                ? '65%'
                                : trackingData?.status === 'dispatched'
                                ? '30%'
                                : '10%',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '12px', color: '#1e293b', fontWeight: 600 }}>
                        ETA: {trackingData?.dynamic_eta?.eta
                          ? new Date(trackingData.dynamic_eta.eta).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                          : formatDate(trackingData?.eta || selectedShipment.estimated_delivery)}
                      </div>
                      {trackingData?.dynamic_eta && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '4px' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: trackingData.dynamic_eta.telemetry?.status === 'fresh' ? '#dcfce7' : trackingData.dynamic_eta.telemetry?.status === 'stale' ? '#fef3c7' : '#fee2e2',
                            color: trackingData.dynamic_eta.telemetry?.status === 'fresh' ? '#15803d' : trackingData.dynamic_eta.telemetry?.status === 'stale' ? '#b45309' : '#b91c1c'
                          }}>
                            {trackingData.dynamic_eta.telemetry?.status?.toUpperCase()} TELEMETRY
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            {Math.round((trackingData.dynamic_eta.confidence_score || 0) * 100)}% Confidence
                          </span>
                        </div>
                      )}
                      {trackingData?.dynamic_eta?.traffic?.message && (
                        <div style={{ fontSize: '11px', color: '#92400e', background: '#fffbeb', padding: '4px 8px', borderRadius: '4px', border: '1px solid #fde68a', marginTop: '6px' }}>
                          {trackingData.dynamic_eta.traffic.message}
                        </div>
                      )}
                    </div>

                    <div className="cportal-route-point" style={{ textAlign: 'right' }}>
                      <span style={{ color: '#059669', fontWeight: 700 }}>DESTINATION DELIVERY</span>
                      <strong>
                        {trackingData?.destination?.city || selectedShipment.destination?.city || 'Destination'}
                        {trackingData?.destination?.state ? `, ${trackingData.destination.state}` : ''}
                      </strong>
                    </div>
                  </div>

                  {/* Interactive Map (FR-8.1) */}
                  <div style={{ marginTop: '16px', marginBottom: '16px' }}>
                    <TrackingMap
                      currentLocation={m8LocationData?.current_location}
                      origin={selectedShipment.origin}
                      destination={selectedShipment.destination}
                      referenceNumber={selectedShipment.reference_number || `SHP-${selectedShipment.id}`}
                      height="280px"
                    />
                  </div>

                  {/* Real Coordinates & Carrier Snapshot (FR-8.1) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                          LAST REPORTED TELEMETRY
                        </span>
                        {m8LocationData?.current_location && (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: m8LocationData.is_stale ? '#fef3c7' : '#dcfce7',
                            color: m8LocationData.is_stale ? '#b45309' : '#15803d'
                          }}>
                            {m8LocationData.is_stale ? 'STALE (>15m)' : 'LIVE GPS'}
                          </span>
                        )}
                      </div>

                      {m8LocationData?.current_location ? (
                        <>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                            Lat {Number(m8LocationData.current_location.latitude).toFixed(5)}, Lon {Number(m8LocationData.current_location.longitude).toFixed(5)}
                          </div>
                          <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                            Speed: {m8LocationData.current_location.speed_mph !== null && m8LocationData.current_location.speed_mph !== undefined ? `${m8LocationData.current_location.speed_mph} mph` : 'Stationary'} • Heading: {m8LocationData.current_location.heading_deg ? `${m8LocationData.current_location.heading_deg}°` : 'N/A'}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                            Fix: {new Date(m8LocationData.current_location.recorded_at).toLocaleTimeString()} ({m8LocationData.current_location.source})
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: '13px', color: '#64748b', padding: '6px 0' }}>
                          No GPS telemetry fixes recorded yet for this shipment. Updates appear when driver or ELD hardware transmits.
                        </div>
                      )}
                    </div>

                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                        ASSIGNED MOTOR CARRIER
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                        {currentLocationData?.carrier?.legal_name || trackingData?.carrier?.legal_name || selectedShipment.carrier_org?.legal_name || 'Assigned Carrier'}
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#059669', fontWeight: 600, marginTop: '4px' }}>
                        Carrier Active on Highway
                      </div>
                    </div>
                  </div>

                  {/* Milestone Timeline */}
                  <div>
                    <h4 style={{ margin: '0 0 14px', fontSize: '14px', color: '#1e293b' }}>
                      Milestone Timeline Checkpoints
                    </h4>
                    <div className="cportal-timeline-list">
                      <div className="cportal-timeline-item">
                        <div className="cportal-timeline-dot done" />
                        <div className="cportal-timeline-info">
                          <span className="cportal-timeline-title">Load Booked & Tenders Confirmed</span>
                          <span className="cportal-timeline-meta">{formatDate(selectedShipment.created_at)}</span>
                        </div>
                      </div>

                      <div className="cportal-timeline-item">
                        <div
                          className={`cportal-timeline-dot ${
                            ['dispatched', 'in_transit', 'delivered'].includes(selectedShipment.status)
                              ? 'done'
                              : 'current'
                          }`}
                        />
                        <div className="cportal-timeline-info">
                          <span className="cportal-timeline-title">Driver Dispatched with Signed Rate Confirmation</span>
                          <span className="cportal-timeline-meta">
                            {['dispatched', 'in_transit', 'delivered'].includes(selectedShipment.status)
                              ? 'Completed'
                              : 'Pending Dispatch'}
                          </span>
                        </div>
                      </div>

                      <div className="cportal-timeline-item">
                        <div
                          className={`cportal-timeline-dot ${
                            ['in_transit', 'delivered'].includes(selectedShipment.status)
                              ? 'done'
                              : selectedShipment.status === 'dispatched'
                              ? 'current'
                              : ''
                          }`}
                        />
                        <div className="cportal-timeline-info">
                          <span className="cportal-timeline-title">Pickup Departed · In Transit</span>
                          <span className="cportal-timeline-meta">
                            {['in_transit', 'delivered'].includes(selectedShipment.status)
                              ? 'In Transit'
                              : 'Awaiting Departure'}
                          </span>
                        </div>
                      </div>

                      <div className="cportal-timeline-item">
                        <div
                          className={`cportal-timeline-dot ${selectedShipment.status === 'delivered' ? 'done' : ''}`}
                        />
                        <div className="cportal-timeline-info">
                          <span className="cportal-timeline-title">Destination Delivery & Proof of Delivery (POD)</span>
                          <span className="cportal-timeline-meta">
                            {selectedShipment.status === 'delivered' ? 'Completed' : 'Expected upon arrival'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="cportal-modal-footer">
              <button className="btn" onClick={() => setShowTrackingModal(false)}>
                Close Tracking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: SHIPMENT DETAILS                                            */}
      {/* ==================================================================== */}
      {showDetailModal && selectedShipment && (
        <div className="cportal-modal-backdrop" onClick={() => setShowDetailModal(false)}>
          <div className="cportal-modal-box wide" onClick={(e) => e.stopPropagation()}>
            <div className="cportal-modal-header">
              <div>
                <h2>Shipment Details · {selectedShipment.reference_number || `SHP-${selectedShipment.id}`}</h2>
                <span className={`cportal-badge ${selectedShipment.status}`}>
                  {selectedShipment.status?.replace('_', ' ')}
                </span>
              </div>
              <button className="icon-btn" onClick={() => setShowDetailModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="cportal-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px' }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: '#64748b' }}>ORIGIN (PICKUP)</h4>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{selectedShipment.origin?.city || '—'}, {selectedShipment.origin?.state || ''}</div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>{selectedShipment.origin?.address || ''}</div>
                  <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '6px' }}>
                    Pickup Date: {formatDate(selectedShipment.pickup_date)}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px' }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: '#64748b' }}>DESTINATION (DELIVERY)</h4>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{selectedShipment.destination?.city || '—'}, {selectedShipment.destination?.state || ''}</div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>{selectedShipment.destination?.address || ''}</div>
                  <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '6px' }}>
                    Delivery ETA: {formatDate(selectedShipment.estimated_delivery)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Carrier Partner:</div>
                  <strong>{selectedShipment.carrier_org?.legal_name || 'Unassigned'}</strong>
                </div>
                <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Agreed Quote Rate:</div>
                  <strong style={{ color: '#2563eb' }}>{money(selectedShipment.quote_amount)}</strong>
                </div>
                <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Assigned Region:</div>
                  <strong>{selectedShipment.assigned_region || 'National'}</strong>
                </div>
              </div>

              {selectedShipment.freight_details && (
                <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '13.5px', color: '#0f172a' }}>Cargo & Equipment</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '13px' }}>
                    <div>Commodity: <strong>{selectedShipment.freight_details.commodity || 'General Freight'}</strong></div>
                    <div>Equipment: <strong>{selectedShipment.freight_details.equipment_type || 'Not specified'}</strong></div>
                    <div>Total Weight: <strong>{selectedShipment.freight_details.total_weight || '15,000'} lbs</strong></div>
                    <div>Package Count: <strong>{selectedShipment.freight_details.package_quantity || 1} {selectedShipment.freight_details.package_type || 'units'}</strong></div>
                  </div>
                </div>
              )}
            </div>

            <div className="cportal-modal-footer">
              <button
                className="btn primary"
                onClick={() => {
                  setShowDetailModal(false);
                  openTracking(selectedShipment);
                }}
              >
                <MapPin size={16} />
                <span>Track Movement</span>
              </button>
              <button
                className="btn"
                onClick={() => {
                  setShowDetailModal(false);
                  openDocuments(selectedShipment);
                }}
              >
                <FileText size={16} />
                <span>View Documents</span>
              </button>
              <button className="btn" onClick={() => setShowDetailModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: DOCUMENTS HUB (MODULE M10)                                   */}
      {/* ==================================================================== */}
      {showDocsModal && selectedShipment && (
        <div className="cportal-modal-backdrop" onClick={() => setShowDocsModal(false)}>
          <div className="cportal-modal-box wide" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '980px', width: '100%' }}>
            <div className="cportal-modal-header">
              <div>
                <h2>Documents Hub · {selectedShipment.reference_number || `SHP-${selectedShipment.id}`}</h2>
                <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                  Document checklist, digital signatures, Bills of Lading, Proof of Delivery, and share links
                </span>
              </div>
              <button className="icon-btn" onClick={() => setShowDocsModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="cportal-modal-body" style={{ padding: '20px' }}>
              <DocumentsPanel
                shipmentId={selectedShipment.id}
                shipment={selectedShipment}
                hasPermission={hasPermission}
                role="Shipper User"
                currentUser={currentUser}
                notify={notify}
                isPortal={true}
                onClose={() => setShowDocsModal(false)}
              />
            </div>

            <div className="cportal-modal-footer">
              <button className="btn" onClick={() => setShowDocsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3B: UPLOAD DOCUMENT FORM */}
      {uploadDocModal && (
        <div className="cportal-modal-backdrop" onClick={() => setUploadDocModal(false)}>
          <div className="cportal-modal-box" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleUploadDoc}>
              <div className="cportal-modal-header">
                <h2>Upload Shipment Document</h2>
                <button className="icon-btn" type="button" onClick={() => setUploadDocModal(false)}>
                  <X size={20} />
                </button>
              </div>
              <div className="cportal-modal-body">
                <div className="cportal-form-field">
                  <label>Document Category:</label>
                  <select
                    value={uploadDocType}
                    onChange={(e) => setUploadDocType(e.target.value)}
                  >
                    <option value="BOL">Bill of Lading (BOL)</option>
                    <option value="POD">Proof of Delivery (POD)</option>
                    <option value="Commercial Invoice">Commercial Invoice</option>
                    <option value="Packing List">Packing List</option>
                    <option value="Customs Form">Customs Clearance Form</option>
                    <option value="Other">Other Document</option>
                  </select>
                </div>
                <div className="cportal-form-field">
                  <label>Document Name / Reference:</label>
                  <input
                    type="text"
                    placeholder="e.g. Shipper-Signed-BOL.pdf"
                    required
                    value={uploadDocName}
                    onChange={(e) => setUploadDocName(e.target.value)}
                  />
                </div>
                <div className="cportal-form-field">
                  <label>Attach File (PDF, PNG, JPG):</label>
                  <input
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setUploadDocFile(file);
                        if (!uploadDocName) setUploadDocName(file.name);
                      }
                    }}
                  />
                </div>
              </div>
              <div className="cportal-modal-footer">
                <button type="button" className="btn" onClick={() => setUploadDocModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={uploadingDoc}>
                  {uploadingDoc ? 'Uploading...' : 'Confirm Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 4: INVOICE DETAILS MODAL (FR-12.5)                             */}
      {/* ==================================================================== */}
      {showInvoiceModal && selectedInvoice && (
        <div className="cportal-modal-backdrop" onClick={() => setShowInvoiceModal(false)}>
          <div className="cportal-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="cportal-modal-header">
              <div>
                <h2>Invoice #{selectedInvoice.invoice_number || selectedInvoice.id}</h2>
                <span className={`cportal-badge ${selectedInvoice.status}`}>
                  {selectedInvoice.status}
                </span>
              </div>
              <button className="icon-btn" onClick={() => setShowInvoiceModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="cportal-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Total Invoiced Amount:</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                    {money(selectedInvoice.amount)}
                  </div>
                </div>
                <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Outstanding Balance:</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#b91c1c' }}>
                    {money(Math.max(0, Number(selectedInvoice.amount || 0) - Number(selectedInvoice.amount_paid || 0)))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                <div>Due Date: <strong>{formatDate(selectedInvoice.due_date)}</strong></div>
                <div>Created Date: <strong>{formatDate(selectedInvoice.created_at)}</strong></div>
                <div>Payment Terms: <strong>Net 30 Days</strong></div>
                <div>Accepted Methods: <strong>ACH / Wire Transfer</strong></div>
              </div>

              {selectedInvoice.shipment && (
                <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Associated Freight Shipment:</div>
                  <strong>
                    {selectedInvoice.shipment.reference_number || `SHP-${selectedInvoice.shipment.id}`}
                  </strong>
                </div>
              )}
            </div>

            <div className="cportal-modal-footer">
              <button className="btn" onClick={() => setShowInvoiceModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 5: SAVED LOCATION ADD/EDIT (FR-12.6)                           */}
      {/* ==================================================================== */}
      {locationModal.open && (
        <div
          className="cportal-modal-backdrop"
          onClick={() => setLocationModal({ open: false, isEdit: false, data: null })}
        >
          <div className="cportal-modal-box" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveLocation}>
              <div className="cportal-modal-header">
                <h2>{locationModal.isEdit ? 'Edit Saved Location' : 'Add New Saved Location'}</h2>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setLocationModal({ open: false, isEdit: false, data: null })}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="cportal-modal-body">
                <div className="cportal-form-field">
                  <label>Location Facility Name *:</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dallas Distribution Center #1"
                    value={locationModal.data?.name || ''}
                    onChange={(e) =>
                      setLocationModal({
                        ...locationModal,
                        data: { ...locationModal.data, name: e.target.value },
                      })
                    }
                  />
                </div>

                <div className="cportal-form-field">
                  <label>Location Operational Type:</label>
                  <select
                    value={locationModal.data?.type || 'both'}
                    onChange={(e) =>
                      setLocationModal({
                        ...locationModal,
                        data: { ...locationModal.data, type: e.target.value },
                      })
                    }
                  >
                    <option value="both">Both Pickup & Delivery</option>
                    <option value="warehouse">Warehouse</option>
                    <option value="pickup">Pickup Only</option>
                    <option value="delivery">Delivery Only</option>
                  </select>
                </div>

                <div className="cportal-form-field">
                  <label>Street Address:</label>
                  <input
                    type="text"
                    placeholder="100 Logistics Way"
                    value={locationModal.data?.address_line1 || ''}
                    onChange={(e) =>
                      setLocationModal({
                        ...locationModal,
                        data: { ...locationModal.data, address_line1: e.target.value },
                      })
                    }
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px' }}>
                  <div className="cportal-form-field">
                    <label>City *:</label>
                    <input
                      type="text"
                      required
                      placeholder="Dallas"
                      value={locationModal.data?.city || ''}
                      onChange={(e) =>
                        setLocationModal({
                          ...locationModal,
                          data: { ...locationModal.data, city: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="cportal-form-field">
                    <label>State *:</label>
                    <input
                      type="text"
                      required
                      placeholder="TX"
                      value={locationModal.data?.state || ''}
                      onChange={(e) =>
                        setLocationModal({
                          ...locationModal,
                          data: { ...locationModal.data, state: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="cportal-form-field">
                    <label>Postal Code:</label>
                    <input
                      type="text"
                      placeholder="75201"
                      value={locationModal.data?.postal_code || ''}
                      onChange={(e) =>
                        setLocationModal({
                          ...locationModal,
                          data: { ...locationModal.data, postal_code: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="cportal-form-field">
                    <label>Contact Name:</label>
                    <input
                      type="text"
                      placeholder="Dock Manager"
                      value={locationModal.data?.contact_name || ''}
                      onChange={(e) =>
                        setLocationModal({
                          ...locationModal,
                          data: { ...locationModal.data, contact_name: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="cportal-form-field">
                    <label>Contact Phone:</label>
                    <input
                      type="text"
                      placeholder="(214) 555-0199"
                      value={locationModal.data?.phone || ''}
                      onChange={(e) =>
                        setLocationModal({
                          ...locationModal,
                          data: { ...locationModal.data, phone: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="cportal-modal-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setLocationModal({ open: false, isEdit: false, data: null })}
                >
                  Cancel
                </button>
                <button type="submit" className="btn primary">
                  {locationModal.isEdit ? 'Update Location' : 'Save Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5B: CONFIRM DELETE LOCATION */}
      {deleteLocConfirm && (
        <div className="cportal-modal-backdrop" onClick={() => setDeleteLocConfirm(null)}>
          <div className="cportal-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="cportal-modal-header">
              <h2>Confirm Deletion</h2>
              <button className="icon-btn" onClick={() => setDeleteLocConfirm(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="cportal-modal-body">
              <p>
                Are you sure you want to delete saved location <strong>"{deleteLocConfirm.name}"</strong>?
              </p>
            </div>
            <div className="cportal-modal-footer">
              <button className="btn" onClick={() => setDeleteLocConfirm(null)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => handleDeleteLocation(deleteLocConfirm.id)}
              >
                Delete Location
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
