/**
 * shipmentImportParser.js
 *
 * Client-side utilities for FMS Bulk Shipment Import (FR-3.2).
 * Handles RFC-4180 CSV parsing, sample template generation,
 * pre-validation, and intra-batch duplicate detection.
 */

export const IMPORT_TEMPLATE_HEADERS = [
  'reference_number',
  'shipper_org_id',
  'origin_city',
  'origin_state',
  'origin_zip',
  'origin_address',
  'destination_city',
  'destination_state',
  'destination_zip',
  'destination_address',
  'pickup_date',
  'estimated_delivery',
  'commodity',
  'weight',
  'equipment_type',
  'quote_amount',
  'quantity',
  'hazmat',
  'special_instructions',
];

export const SAMPLE_TEMPLATE_ROWS = [
  {
    reference_number: 'SHP-IMPORT-001',
    shipper_org_id: '',
    origin_city: 'Dallas',
    origin_state: 'TX',
    origin_zip: '75201',
    origin_address: '1000 Commerce St',
    destination_city: 'Chicago',
    destination_state: 'IL',
    destination_zip: '60601',
    destination_address: '500 Michigan Ave',
    pickup_date: '2026-11-01',
    estimated_delivery: '2026-11-03',
    commodity: 'Consumer Electronics',
    weight: '18500',
    equipment_type: '53ft Dry Van',
    quote_amount: '2850',
    quantity: '24',
    hazmat: 'false',
    special_instructions: 'Handle with care. Liftgate required at pickup.',
  },
  {
    reference_number: 'SHP-IMPORT-002',
    shipper_org_id: '',
    origin_city: 'Atlanta',
    origin_state: 'GA',
    origin_zip: '30301',
    origin_address: '250 Peachtree St',
    destination_city: 'Miami',
    destination_state: 'FL',
    destination_zip: '33101',
    destination_address: '1200 Ocean Dr',
    pickup_date: '2026-11-02',
    estimated_delivery: '2026-11-04',
    commodity: 'Industrial Machinery',
    weight: '34000',
    equipment_type: 'Flatbed',
    quote_amount: '3450',
    quantity: '6',
    hazmat: 'false',
    special_instructions: 'Tarp and straps required.',
  },
  {
    reference_number: 'SHP-IMPORT-003',
    shipper_org_id: '',
    origin_city: 'Seattle',
    origin_state: 'WA',
    origin_zip: '98101',
    origin_address: '700 Pike St',
    destination_city: 'Los Angeles',
    destination_state: 'CA',
    destination_zip: '90001',
    destination_address: '1500 Alameda St',
    pickup_date: '2026-11-05',
    estimated_delivery: '2026-11-07',
    commodity: 'Fresh Produce',
    weight: '42000',
    equipment_type: '53ft Reefer',
    quote_amount: '4100',
    quantity: '22',
    hazmat: 'false',
    special_instructions: 'Maintain temperature between 34F and 38F continuous.',
  },
];

/**
 * Generates official RFC-4180 CSV template string with headers and sample records
 */
export function generateCsvTemplateText() {
  const escapeCell = (val) => {
    if (val === undefined || val === null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = IMPORT_TEMPLATE_HEADERS.join(',');
  const rowLines = SAMPLE_TEMPLATE_ROWS.map((row) =>
    IMPORT_TEMPLATE_HEADERS.map((h) => escapeCell(row[h] || '')).join(',')
  );

  return [headerLine, ...rowLines].join('\r\n');
}

/**
 * Triggers instant browser download of the official CSV template
 */
export function downloadCsvTemplate(filename = 'fms_shipment_import_template.csv') {
  const text = generateCsvTemplateText();
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
    if (document.body.contains(a)) document.body.removeChild(a);
  }, 1000);
}

/**
 * RFC-4180 compliant client-side CSV parser
 * Accurately parses quoted fields, commas inside quotes, multi-line values, and CRLF
 */
export function parseCsvText(text) {
  if (!text || typeof text !== 'string') return [];

  // Remove UTF-8 BOM if present
  const clean = text.replace(/^\uFEFF/, '');
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let insideQuotes = false;
  let i = 0;
  const len = clean.length;

  while (i < len) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentVal += '"';
        i += 2;
        continue;
      } else {
        insideQuotes = !insideQuotes;
        i++;
        continue;
      }
    }

    if (!insideQuotes && char === ',') {
      currentRow.push(currentVal.trim());
      currentVal = '';
      i++;
      continue;
    }

    if (!insideQuotes && (char === '\r' || char === '\n')) {
      currentRow.push(currentVal.trim());
      currentVal = '';
      if (char === '\r' && nextChar === '\n') {
        i += 2;
      } else {
        i++;
      }
      if (currentRow.some((field) => field !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentVal += char;
    i++;
  }

  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some((field) => field !== '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  const dataRows = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c] !== undefined ? row[c] : '';
    }
    dataRows.push(obj);
  }

  return dataRows;
}

/**
 * Validates parsed rows before API submission
 * Checks for intra-batch duplicates and required fields
 */
export function preValidateRows(rows, maxRows = 500) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      isValid: false,
      totalRows: 0,
      errors: ['No data rows found in the file.'],
      warnings: [],
      duplicateRefs: [],
      previewRows: [],
    };
  }

  const errors = [];
  const warnings = [];
  const seenRefs = new Map();
  const duplicateRefs = [];

  if (rows.length > maxRows) {
    errors.push(`File exceeds the maximum limit of ${maxRows} records (found ${rows.length} rows).`);
  }

  rows.forEach((row, idx) => {
    const rowNum = idx + 1;
    const ref = row.reference_number || row.reference_no || row.load_id || '';

    if (ref.trim()) {
      const lower = ref.trim().toLowerCase();
      if (seenRefs.has(lower)) {
        duplicateRefs.push({ row: rowNum, firstSeenAt: seenRefs.get(lower), reference: ref.trim() });
        warnings.push(`Row ${rowNum}: Duplicate reference number '${ref.trim()}' (also at Row ${seenRefs.get(lower)})`);
      } else {
        seenRefs.set(lower, rowNum);
      }
    }

    const originCity = row.origin_city || row.pickup_city || '';
    const destCity = row.destination_city || row.dest_city || row.dropoff_city || '';

    if (!originCity.trim() && !row.origin) {
      warnings.push(`Row ${rowNum}: Missing origin city or location.`);
    }
    if (!destCity.trim() && !row.destination) {
      warnings.push(`Row ${rowNum}: Missing destination city or location.`);
    }
  });

  return {
    isValid: errors.length === 0,
    totalRows: rows.length,
    errors,
    warnings,
    duplicateRefs,
    previewRows: rows.slice(0, 10),
  };
}

