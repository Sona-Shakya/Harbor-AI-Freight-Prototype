import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../../styles/trackingMap.css';

/**
 * Creates custom SVG HTML for vehicle/terminal markers without external image assets
 */
function createTruckMarkerHtml(heading = null, isStale = false) {
  const rotationStyle = heading !== null && !isNaN(heading)
    ? `transform: rotate(${heading}deg);`
    : '';

  return `
    <div class="fms-truck-pin ${isStale ? 'stale' : ''}" style="${rotationStyle}">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
        <path d="M15 18H9"/>
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
        <circle cx="17" cy="18" r="2"/>
        <circle cx="7" cy="18" r="2"/>
      </svg>
    </div>
  `;
}

function createTerminalMarkerHtml(type = 'origin') {
  const isDest = type === 'destination';
  return `
    <div class="fms-terminal-pin ${isDest ? 'destination' : 'origin'}">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
      </svg>
    </div>
  `;
}

export default function TrackingMap({
  currentLocation = null,
  historyPoints = [],
  geofences = [],
  origin = null,
  destination = null,
  referenceNumber = '',
  height = '400px',
  interactive = true,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersGroupRef = useRef(null);

  // Initialize Map Instance
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [39.8283, -98.5795], // Geographic center of contiguous US
        zoom: 4,
        zoomControl: interactive,
        dragging: interactive,
        scrollWheelZoom: interactive ? 'center' : false,
        doubleClickZoom: interactive,
        attributionControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(map);

      const layersGroup = L.featureGroup().addTo(map);
      mapInstanceRef.current = map;
      layersGroupRef.current = layersGroup;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        layersGroupRef.current = null;
      }
    };
  }, [interactive]);

  // Update Layers when data changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layersGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const bounds = L.latLngBounds([]);

    let hasRenderablePoints = false;

    // 1. Render Geofences
    if (Array.isArray(geofences) && geofences.length > 0) {
      geofences.forEach((gf) => {
        const lat = Number(gf.center_lat);
        const lng = Number(gf.center_lng);
        const radius = Number(gf.radius_meters || 500);

        if (!isNaN(lat) && !isNaN(lng)) {
          const circle = L.circle([lat, lng], {
            radius,
            color: '#2563eb',
            weight: 2,
            fillColor: '#3b82f6',
            fillOpacity: 0.15,
            dashArray: '4, 4',
          });

          circle.bindPopup(`
            <div style="font-family: system-ui, sans-serif;">
              <strong style="color: #1e3a8a; font-size: 13px;">🛡️ Geofence: ${gf.name || 'Boundary'}</strong><br/>
              <span style="font-size: 12px; color: #475569;">Type: <strong>${gf.type || 'Facility'}</strong></span><br/>
              <span style="font-size: 12px; color: #475569;">Radius: <strong>${radius} m</strong></span>
            </div>
          `);

          circle.addTo(layerGroup);
          bounds.extend([lat, lng]);
          hasRenderablePoints = true;
        }
      });
    }

    // 2. Render Historical Breadcrumbs Trail (FR-8.6)
    if (Array.isArray(historyPoints) && historyPoints.length > 0) {
      // Sort chronologically ascending for polyline
      const sortedHistory = [...historyPoints].sort(
        (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
      );

      const polylineCoords = [];

      sortedHistory.forEach((pt, index) => {
        const lat = Number(pt.latitude);
        const lng = Number(pt.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          polylineCoords.push([lat, lng]);
          bounds.extend([lat, lng]);
          hasRenderablePoints = true;

          // Add a discrete breadcrumb circle marker every few points or key points
          const breadcrumbIcon = L.divIcon({
            className: 'fms-breadcrumb-icon-wrapper',
            html: '<div class="fms-breadcrumb-pin"></div>',
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          });

          const marker = L.marker([lat, lng], { icon: breadcrumbIcon });
          const recordedStr = pt.recorded_at ? new Date(pt.recorded_at).toLocaleString() : 'N/A';
          marker.bindPopup(`
            <div style="font-family: system-ui, sans-serif;">
              <strong style="color: #2563eb;">📍 Ping #${index + 1}</strong><br/>
              <span style="font-size: 11.5px; color: #475569;">Time: ${recordedStr}</span><br/>
              <span style="font-size: 11.5px; color: #475569;">Speed: ${pt.speed_mph !== null && pt.speed_mph !== undefined ? `${pt.speed_mph} mph` : 'N/A'}</span><br/>
              <span style="font-size: 11px; color: #94a3b8;">Coords: ${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
            </div>
          `);
          marker.addTo(layerGroup);
        }
      });

      if (polylineCoords.length > 1) {
        const pathLine = L.polyline(polylineCoords, {
          color: '#2563eb',
          weight: 4,
          opacity: 0.8,
          smoothFactor: 1,
        });
        pathLine.addTo(layerGroup);
      }
    }

    // 3. Render Origin & Destination markers if coordinates provided
    if (origin && typeof origin === 'object') {
      const oLat = Number(origin.latitude || origin.lat);
      const oLng = Number(origin.longitude || origin.lng);
      if (!isNaN(oLat) && !isNaN(oLng)) {
        const originIcon = L.divIcon({
          className: 'fms-terminal-icon-wrapper',
          html: createTerminalMarkerHtml('origin'),
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          popupAnchor: [0, -28],
        });
        const oMarker = L.marker([oLat, oLng], { icon: originIcon });
        oMarker.bindPopup(`<strong>Origin:</strong> ${origin.city || 'Pickup'}, ${origin.state || ''}`);
        oMarker.addTo(layerGroup);
        bounds.extend([oLat, oLng]);
        hasRenderablePoints = true;
      }
    }

    if (destination && typeof destination === 'object') {
      const dLat = Number(destination.latitude || destination.lat);
      const dLng = Number(destination.longitude || destination.lng);
      if (!isNaN(dLat) && !isNaN(dLng)) {
        const destIcon = L.divIcon({
          className: 'fms-terminal-icon-wrapper',
          html: createTerminalMarkerHtml('destination'),
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          popupAnchor: [0, -28],
        });
        const dMarker = L.marker([dLat, dLng], { icon: destIcon });
        dMarker.bindPopup(`<strong>Destination:</strong> ${destination.city || 'Delivery'}, ${destination.state || ''}`);
        dMarker.addTo(layerGroup);
        bounds.extend([dLat, dLng]);
        hasRenderablePoints = true;
      }
    }

    // 4. Render Current Live Vehicle Marker (FR-8.1)
    if (currentLocation && currentLocation.latitude && currentLocation.longitude) {
      const lat = Number(currentLocation.latitude);
      const lng = Number(currentLocation.longitude);

      if (!isNaN(lat) && !isNaN(lng)) {
        const truckIcon = L.divIcon({
          className: 'fms-truck-icon-wrapper',
          html: createTruckMarkerHtml(currentLocation.heading_deg, currentLocation.is_stale),
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -18],
        });

        const truckMarker = L.marker([lat, lng], { icon: truckIcon, zIndexOffset: 1000 });
        const recordedStr = currentLocation.recorded_at
          ? new Date(currentLocation.recorded_at).toLocaleString()
          : 'Just now';

        const freshnessBadge = currentLocation.is_stale
          ? '<span style="color:#b45309;font-weight:700;">⚠️ STALE TELEMETRY (&gt;15 min)</span>'
          : '<span style="color:#15803d;font-weight:700;">🟢 LIVE TELEMETRY</span>';

        truckMarker.bindPopup(`
          <div style="font-family: system-ui, sans-serif; min-width: 200px;">
            <div style="margin-bottom: 6px;">
              <strong style="color: #0f172a; font-size: 14px;">🚚 ${referenceNumber || 'Shipment Load'}</strong><br/>
              <span style="font-size: 11px;">${freshnessBadge}</span>
            </div>
            <div style="font-size: 12px; color: #334155; line-height: 1.5;">
              <div><strong>Recorded:</strong> ${recordedStr}</div>
              <div><strong>Speed:</strong> ${currentLocation.speed_mph !== null && currentLocation.speed_mph !== undefined ? `${currentLocation.speed_mph} mph` : 'Stationary'}</div>
              <div><strong>Heading:</strong> ${currentLocation.heading_deg !== null && currentLocation.heading_deg !== undefined ? `${currentLocation.heading_deg}°` : 'N/A'}</div>
              <div><strong>Source:</strong> ${currentLocation.source || 'telematics'} (${currentLocation.provider || 'internal'})</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Lat: ${lat.toFixed(5)}, Lon: ${lng.toFixed(5)}</div>
            </div>
          </div>
        `);

        truckMarker.addTo(layerGroup);
        bounds.extend([lat, lng]);
        hasRenderablePoints = true;
      }
    }

    // Fit Map View to Bounds
    if (hasRenderablePoints && bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [45, 45],
        maxZoom: 15,
        animate: true,
      });
    }
  }, [currentLocation, historyPoints, geofences, origin, destination, referenceNumber]);

  const hasCoordinates = Boolean(
    (currentLocation && currentLocation.latitude && currentLocation.longitude) ||
    (historyPoints && historyPoints.length > 0) ||
    (geofences && geofences.length > 0)
  );

  return (
    <div className="fms-map-container" style={{ height }}>
      <div ref={mapContainerRef} className="fms-leaflet-map" />

      {/* Overlay Status Badge */}
      {currentLocation && currentLocation.latitude && (
        <div className="fms-map-badge-overlay">
          <div className={`fms-map-badge ${currentLocation.is_stale ? 'stale' : 'live'}`}>
            <span className={`fms-map-dot-pulse ${currentLocation.is_stale ? 'stale' : 'live'}`} />
            <span>
              {currentLocation.is_stale ? 'Telemetry Stale (>15m)' : 'Live GPS Signal'}
              {currentLocation.speed_mph !== null && currentLocation.speed_mph !== undefined
                ? ` • ${currentLocation.speed_mph} mph`
                : ''}
            </span>
          </div>
        </div>
      )}

      {/* No GPS Signal Placeholder */}
      {!hasCoordinates && (
        <div className="fms-map-placeholder">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <h4>No Telemetry Ingested Yet</h4>
          <p>
            This shipment has not received GPS or ELD telematics fixes from mobile or onboard hardware.
            Updates will render live upon first ping ingestion.
          </p>
        </div>
      )}
    </div>
  );
}

