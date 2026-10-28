/**
 * Strict privacy sanitizer for public shipment tracking under SRS v2.0 FR-8.3.
 * Excludes all sensitive customer contact information, rates, margins, invoices,
 * internal notes, tax IDs, and private documentation.
 */
export function sanitizePublicTrackingData(raw) {
  if (!raw) return null;
  const payload = raw?.data || raw;

  // Extract reference number
  const reference = String(
    payload.reference_number ||
    payload.tracking_number ||
    payload.public_token ||
    payload.reference ||
    payload.id ||
    ''
  ).trim();

  // Normalize status
  const rawStatus = String(payload.status || 'unknown').toLowerCase();
  const status = rawStatus === 'confirmed' ? 'booked' : rawStatus;

  // Location formatting helper (city, state, country only — never street addresses)
  const formatLocation = (loc) => {
    if (!loc) return null;
    if (typeof loc === 'string') {
      // Strip any sensitive street details if formatted as multiline or full address
      const parts = loc.split(',').map((s) => s.trim());
      return parts.length >= 2 ? parts.slice(-2).join(', ') : loc;
    }
    const parts = [loc.city, loc.state].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : loc.country || null;
  };

  const origin =
    formatLocation(payload.origin) ||
    (payload.origin_city
      ? `${payload.origin_city}, ${payload.origin_state || ''}`
      : null);
  const destination =
    formatLocation(payload.destination) ||
    (payload.destination_city
      ? `${payload.destination_city}, ${payload.destination_state || ''}`
      : null);
  const currentLocation = formatLocation(payload.current_location) || null;

  // Safe coordinates extraction for public map view (FR-8.1 / FR-8.3)
  let currentCoordinates = null;
  if (payload.current_location && typeof payload.current_location === 'object') {
    const lat = Number(payload.current_location.latitude || payload.current_location.lat);
    const lng = Number(payload.current_location.longitude || payload.current_location.lng);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      currentCoordinates = {
        latitude: lat,
        longitude: lng,
        recorded_at: payload.current_location.updated_at || payload.current_location.recorded_at || null,
        is_stale: Boolean(payload.current_location.is_stale),
      };
    }
  }

  // Date fields
  const estimatedDelivery = payload.estimated_delivery || payload.eta || null;
  const actualDelivery = payload.actual_delivery || payload.delivered_at || null;
  const pickupDate = payload.pickup_date || null;

  // Carrier name (only public legal name, no phone, email, or rate data)
  const carrierName =
    typeof payload.carrier === 'string'
      ? payload.carrier
      : payload.carrier?.legal_name || payload.carrier_name || null;

  // Safe Milestones
  let rawMilestones =
    payload.milestones || payload.tracking_events || payload.check_calls || [];
  if (!Array.isArray(rawMilestones)) {
    rawMilestones = [];
  }

  const milestones = rawMilestones.map((m, idx) => ({
    id: m.id || idx + 1,
    title: m.title || m.event_type || m.status || m.event || 'Status Update',
    location: formatLocation(m.location) || m.city || null,
    timestamp: m.timestamp || m.created_at || m.date || null,
    completed: Boolean(m.completed ?? (m.timestamp || m.created_at)),
    current: Boolean(
      m.current ?? (idx === rawMilestones.length - 1 && status !== 'delivered')
    ),
  }));

  return {
    reference,
    status,
    origin: origin || 'Origin Terminal',
    destination: destination || 'Destination Terminal',
    currentLocation,
    estimatedDelivery,
    actualDelivery,
    pickupDate,
    carrierName,
    milestones,
    currentCoordinates,
  };
}

