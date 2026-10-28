/**
 * Helper utilities for Module M10 — Documentation Management
 * Pure, testable functions for validation, progress calculation, and badge mapping.
 */

export const ALLOWED_EXTENSIONS = [
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
];

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Validates a single document file for upload
 * @param {File|{name: string, size: number}} file
 * @param {Object} [options]
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateDocumentUpload(file, options = {}) {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  const maxSize = options.maxSizeBytes || MAX_FILE_SIZE_BYTES;
  const allowed = options.allowedExtensions || ALLOWED_EXTENSIONS;

  // Size check
  if (file.size > maxSize) {
    return { valid: false, error: 'File is too large — max 10 MB' };
  }

  // Name & extension check
  const fileName = (file.name || '').trim();
  const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';

  if (!ext || !allowed.includes(ext)) {
    return { valid: false, error: "This file type isn't supported" };
  }

  // Executable rejection
  const dangerousExts = ['exe', 'bat', 'cmd', 'sh', 'ps1', 'dll', 'so', 'bin', 'com', 'msi', 'vbs', 'scr'];
  if (dangerousExts.includes(ext)) {
    return { valid: false, error: "This file type isn't supported" };
  }

  return { valid: true, error: null };
}

/**
 * Formats byte size to human-readable string (KB/MB)
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '0 B';
  const num = Number(bytes);
  if (num === 0) return '0 B';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) {
    const kb = (num / 1024).toFixed(1);
    return `${kb} KB`;
  }
  const mb = (num / (1024 * 1024)).toFixed(1);
  return `${mb} MB`;
}

/**
 * Calculates checklist completion stats and user-friendly summary text
 * @param {Object} checklist - { required: string[], completed: string[], missing: string[], percent_complete: number, blocks_invoicing: boolean }
 * @returns {Object}
 */
export function calculateChecklistProgress(checklist) {
  if (!checklist) {
    return {
      readyCount: 0,
      totalCount: 0,
      missingCount: 0,
      percentage: 0,
      summaryText: '0 of 0 required documents ready',
      isComplete: false,
      blocksInvoicing: false,
      missing: [],
      required: [],
      completed: [],
    };
  }

  const required = Array.isArray(checklist.required) ? checklist.required : [];
  const completed = Array.isArray(checklist.completed) ? checklist.completed : [];
  const missing = Array.isArray(checklist.missing)
    ? checklist.missing
    : required.filter((r) => !completed.includes(r));

  const totalCount = required.length;
  const readyCount = completed.length;
  const missingCount = missing.length;

  const percentage =
    typeof checklist.percent_complete === 'number'
      ? checklist.percent_complete
      : totalCount > 0
      ? Math.round((readyCount / totalCount) * 100)
      : 100;

  const summaryText = `${readyCount} of ${totalCount} required documents ready`;
  const isComplete = totalCount > 0 && readyCount >= totalCount;
  const blocksInvoicing = Boolean(checklist.blocks_invoicing);

  return {
    readyCount,
    totalCount,
    missingCount,
    percentage,
    summaryText,
    isComplete,
    blocksInvoicing,
    missing,
    required,
    completed,
  };
}

/**
 * Maps document status to UI label and style classes
 * @param {string} status
 * @returns {{ label: string, className: string, bg: string, text: string }}
 */
export function getDocumentStatusBadge(status) {
  const norm = (status || '').toLowerCase().trim();
  switch (norm) {
    case 'draft':
      return { label: 'Draft', className: 'status-draft', bg: '#fef3c7', text: '#92400e' };
    case 'final':
      return { label: 'Final', className: 'status-final', bg: '#e0f2fe', text: '#0369a1' };
    case 'signed':
      return { label: 'Signed', className: 'status-signed', bg: '#dcfce7', text: '#15803d' };
    case 'archived':
      return { label: 'Archived', className: 'status-archived', bg: '#f1f5f9', text: '#64748b' };
    default:
      return { label: status || 'Unknown', className: 'status-unknown', bg: '#f1f5f9', text: '#475569' };
  }
}

/**
 * Resolves user-friendly document type name
 * @param {string} type
 * @param {Array} [settingsTypes]
 * @returns {string}
 */
export function formatDocumentTypeName(type, settingsTypes = []) {
  if (!type) return 'Document';
  const norm = String(type).toLowerCase().trim();

  // Check dynamically loaded settings
  if (Array.isArray(settingsTypes) && settingsTypes.length > 0) {
    const found = settingsTypes.find(
      (s) => (s.value || s.key || '').toLowerCase() === norm
    );
    if (found && (found.label || found.name)) {
      return found.label || found.name;
    }
  }

  // Standard fallback dictionary
  const fallback = {
    bol: 'Bill of Lading',
    pod: 'Proof of Delivery',
    rate_confirmation: 'Rate Confirmation',
    invoice: 'Invoice',
    customs_commercial_invoice: 'Customs Commercial Invoice',
    certificate_of_origin: 'Certificate of Origin',
    hazmat_form: 'Dangerous Goods / Hazmat Form',
    packing_list: 'Packing List',
    insurance_certificate: 'Insurance Certificate',
    claim_document: 'Claim Document',
    other: 'Other Document',
  };

  if (fallback[norm]) return fallback[norm];

  // Capitalize snake_case or dash-case
  return norm
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Returns available document action permissions based on document state and user role
 * @param {Object} doc - Document record
 * @param {Object} context - { userRole, hasPermission }
 * @returns {Object}
 */
export function getAvailableActionsForDocument(doc, context = {}) {
  const { userRole = '', hasPermission = () => true } = context;
  const roleName = typeof userRole === 'object' && userRole !== null ? userRole.name : String(userRole || '');

  const isArchived = (doc?.status || '').toLowerCase() === 'archived';
  const isSigned = (doc?.status || '').toLowerCase() === 'signed';

  // Permission checks with safe defaults
  const canUpload = hasPermission('documents', 'upload');
  const canGenerate = hasPermission('documents', 'generate');
  const canSign = hasPermission('documents', 'sign');
  const canShare = hasPermission('documents', 'share');
  const canDelete = hasPermission('documents', 'delete');

  return {
    canPreview: true,
    canDownload: true,
    canUploadVersion: canUpload && !isArchived,
    canViewVersions: true,
    canShare: canShare && !isArchived,
    canSign: canSign && !isSigned && !isArchived,
    // Special rule: Only Platform Admin can delete/archive signed documents
    canArchive: canDelete && (!isSigned || roleName === 'Platform Admin') && !isArchived,
    isSignedLockedForArchive: isSigned && roleName !== 'Platform Admin',
  };
}

/**
 * Clean locale date formatting
 * @param {string|Date} dateVal
 * @param {string} [locale='en-US']
 * @returns {string}
 */
export function formatDateLocale(dateVal, locale = 'en-US') {
  if (!dateVal) return '—';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(dateVal);
  }
}
