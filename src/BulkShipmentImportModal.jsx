import React, { useState, useRef, useCallback } from 'react';
import {
  UploadSimple,
  DownloadSimple,
  X,
  FileText,
  CheckCircle,
  WarningCircle,
  ArrowClockwise,
  ArrowRight,
  Info,
  Trash,
  Tag
} from '@phosphor-icons/react';
import { bulkImportShipments } from './api';
import {
  downloadCsvTemplate,
  parseCsvText,
  preValidateRows,
} from './services/shipmentImportParser';
import './styles/bulkShipmentImport.css';

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB matching backend Multer limit
const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

export default function BulkShipmentImportModal({
  isOpen,
  onClose,
  onSuccess,
  notify,
  customers = [],
  currentOrg,
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [shipperOrgId, setShipperOrgId] = useState(currentOrg?.id ? String(currentOrg.id) : '');
  const [parsedPreview, setParsedPreview] = useState(null);
  const [fileError, setFileError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'success' | 'failed'

  const fileInputRef = useRef(null);

  // Reset modal state
  const handleReset = () => {
    setSelectedFile(null);
    setParsedPreview(null);
    setFileError('');
    setImportResult(null);
    setFilterTab('all');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // Validate and inspect selected file
  const processFile = (file) => {
    setFileError('');
    setParsedPreview(null);
    setImportResult(null);

    if (!file) return;

    // 1. File size validation
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError(`File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed limit of 15 MB.`);
      setSelectedFile(null);
      return;
    }

    // 2. File extension validation
    const nameLower = file.name.toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => nameLower.endsWith(ext));
    if (!hasValidExt) {
      setFileError('Invalid file format. Please upload a CSV (.csv) or Excel spreadsheet (.xlsx, .xls).');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);

    // 3. If CSV, parse client-side for immediate preview and pre-validation
    if (nameLower.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const rows = parseCsvText(text);
          const validation = preValidateRows(rows);
          setParsedPreview(validation);
        } catch (err) {
          console.warn('Client CSV preview error:', err);
          setParsedPreview({
            isValid: true,
            totalRows: 0,
            warnings: ['Could not generate client preview. File will be validated server-side.'],
            errors: [],
            duplicateRefs: [],
            previewRows: [],
          });
        }
      };
      reader.readAsText(file);
    } else {
      // Excel (.xlsx/.xls) - parsed directly by server-side excel engine
      setParsedPreview({
        isExcel: true,
        isValid: true,
        totalRows: null,
        warnings: [],
        errors: [],
        duplicateRefs: [],
        previewRows: [],
      });
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // Submit bulk import to real backend endpoint
  const handleSubmitImport = async () => {
    if (!selectedFile) {
      setFileError('Please select a file to import.');
      return;
    }

    try {
      setSubmitting(true);
      setFileError('');

      const formData = new FormData();
      formData.append('file', selectedFile);
      if (shipperOrgId) {
        formData.append('shipper_org_id', shipperOrgId);
      }

      if (notify) notify('Uploading and processing shipment import batch...', 'info');

      const res = await bulkImportShipments(formData);
      setImportResult(res);

      const succeeded = res.summary?.succeeded || 0;
      const failed = res.summary?.failed || 0;
      const total = res.summary?.total || 0;

      if (failed === 0) {
        if (notify) notify(`Bulk import successful: ${succeeded} of ${total} shipments created!`, 'success');
      } else {
        if (notify) notify(`Import completed with warnings: ${succeeded} created, ${failed} rejected. Check row details below.`, 'warning');
      }

      if (onSuccess) {
        onSuccess(res);
      }
    } catch (err) {
      console.error('Bulk shipment import failed:', err);
      const msg = err.message || 'Failed to complete bulk shipment import.';
      setFileError(msg);
      if (notify) notify(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Filtered results for view
  const displayResults = (importResult?.results || []).filter((r) => {
    if (filterTab === 'success') return r.status === 'success';
    if (filterTab === 'failed') return r.status === 'error';
    return true;
  });

  return (
    <div className="fms-import-overlay" role="dialog" aria-modal="true" aria-labelledby="fms-import-title">
      <div className="fms-import-modal">
        {/* Header */}
        <div className="fms-import-header">
          <div className="fms-import-header-title">
            <UploadSimple size={22} color="#2563eb" weight="bold" />
            <div>
              <h2 id="fms-import-title">Bulk Shipment Import (FR-3.2)</h2>
              <p>Batch import multiple shipment orders from CSV or Excel spreadsheets (up to 500 rows per batch).</p>
            </div>
          </div>
          <button
            type="button"
            className="bk-close-btn"
            onClick={handleClose}
            aria-label="Close bulk import dialog"
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="fms-import-body">
          {!importResult ? (
            <>
              {/* Template Download Banner */}
              <div className="fms-template-banner">
                <div className="fms-template-banner-info">
                  <FileText size={20} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Need the official spreadsheet template?</strong>
                    <p>Download our pre-formatted CSV template with standard column headers, sample loads, and data formatting instructions.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="fms-template-download-btn"
                  onClick={() => downloadCsvTemplate()}
                >
                  <DownloadSimple size={15} weight="bold" />
                  <span>Download Sample CSV Template</span>
                </button>
              </div>

              {/* Shipper Organization Selector (if available) */}
              {customers && customers.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="import-shipper-org" style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                    Default Shipper Organization <span style={{ color: '#64748b', fontWeight: 400 }}>(Applied if row lacks shipper_org_id)</span>:
                  </label>
                  <select
                    id="import-shipper-org"
                    className="bk-input"
                    value={shipperOrgId}
                    onChange={(e) => setShipperOrgId(e.target.value)}
                    disabled={submitting}
                    style={{ maxWidth: '400px' }}
                  >
                    <option value="">-- Active User Organization ({currentOrg?.legal_name || 'Current Tenant'}) --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.legal_name || c.name || `Org #${c.id}`} (ID: {c.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* File Dropzone */}
              {!selectedFile ? (
                <div
                  className={`fms-dropzone ${isDragOver ? 'drag-active' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  aria-label="Upload CSV or Excel file"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/csv"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files?.[0]) processFile(e.target.files[0]);
                    }}
                  />
                  <div className="fms-dropzone-icon">
                    <UploadSimple size={24} weight="bold" />
                  </div>
                  <div className="fms-dropzone-text">Click to choose a file or drag and drop here</div>
                  <div className="fms-dropzone-subtext">Supported formats: CSV (.csv) or Microsoft Excel (.xlsx, .xls) up to 15 MB</div>
                </div>
              ) : (
                /* Selected File Card */
                <div className="fms-selected-file-card">
                  <div className="fms-file-details">
                    <div className="fms-file-icon">
                      {selectedFile.name.endsWith('.csv') ? 'CSV' : 'XLS'}
                    </div>
                    <div>
                      <div className="fms-file-name">{selectedFile.name}</div>
                      <div className="fms-file-meta">
                        {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || 'Spreadsheet'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="bk-btn secondary"
                    onClick={handleReset}
                    disabled={submitting}
                    style={{ padding: '4px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    title="Remove selected file"
                  >
                    <Trash size={14} />
                    <span>Change File</span>
                  </button>
                </div>
              )}

              {/* Error Notice */}
              {fileError && (
                <div className="bk-alert warning" role="alert">
                  <WarningCircle size={18} style={{ flexShrink: 0 }} />
                  <span>{fileError}</span>
                </div>
              )}

              {/* Pre-Validation Feedback */}
              {parsedPreview && (
                <>
                  {parsedPreview.isExcel ? (
                    <div className="fms-validation-summary">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0369a1' }}>
                        <Info size={16} weight="bold" />
                        <strong>Excel Workbook Ready for Server Parsing</strong>
                      </div>
                      <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                        The backend Excel parser will extract row records from the first worksheet upon submission.
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Warnings / Duplicate alerts */}
                      {(parsedPreview.warnings?.length > 0 || parsedPreview.errors?.length > 0) && (
                        <div className={`fms-validation-summary ${parsedPreview.errors?.length > 0 ? 'has-errors' : 'has-warnings'}`}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                            <WarningCircle size={16} weight="bold" />
                            <span>Pre-Validation Notice ({parsedPreview.warnings.length} warning{parsedPreview.warnings.length === 1 ? '' : 's'})</span>
                          </div>
                          <ul style={{ margin: '4px 0 0', paddingLeft: '20px', fontSize: '11px', lineHeight: 1.5 }}>
                            {parsedPreview.warnings.slice(0, 5).map((w, idx) => (
                              <li key={idx}>{w}</li>
                            ))}
                            {parsedPreview.warnings.length > 5 && (
                              <li>...and {parsedPreview.warnings.length - 5} more warnings.</li>
                            )}
                          </ul>
                        </div>
                      )}

                      {/* Preview Table */}
                      {parsedPreview.previewRows?.length > 0 && (
                        <div className="fms-preview-section">
                          <div className="fms-preview-header">
                            <span>CSV Data Preview (First {parsedPreview.previewRows.length} of {parsedPreview.totalRows} rows)</span>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>{parsedPreview.totalRows} shipments detected</span>
                          </div>
                          <div className="fms-preview-table-wrapper">
                            <table className="fms-preview-table">
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>Reference #</th>
                                  <th>Origin</th>
                                  <th>Destination</th>
                                  <th>Pickup</th>
                                  <th>Commodity</th>
                                  <th>Weight</th>
                                  <th>Rate</th>
                                </tr>
                              </thead>
                              <tbody>
                                {parsedPreview.previewRows.map((row, idx) => (
                                  <tr key={idx}>
                                    <td>{idx + 1}</td>
                                    <td>
                                      <strong>{row.reference_number || row.reference_no || `(Auto-assign)`}</strong>
                                    </td>
                                    <td>
                                      {row.origin_city ? `${row.origin_city}, ${row.origin_state || ''}` : row.origin || '—'}
                                    </td>
                                    <td>
                                      {row.destination_city ? `${row.destination_city}, ${row.dest_state || ''}` : row.destination || '—'}
                                    </td>
                                    <td>{row.pickup_date || '—'}</td>
                                    <td>{row.commodity || row.description || 'General Freight'}</td>
                                    <td>{row.weight ? `${Number(row.weight).toLocaleString()} lbs` : '—'}</td>
                                    <td>{row.quote_amount ? `$${Number(row.quote_amount).toFixed(2)}` : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            /* Results View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Summary Banner */}
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  background:
                    importResult.summary?.failed === 0
                      ? '#ecfdf5'
                      : importResult.summary?.succeeded === 0
                      ? '#fef2f2'
                      : '#fffbeb',
                  border: `1px solid ${
                    importResult.summary?.failed === 0
                      ? '#a7f3d0'
                      : importResult.summary?.succeeded === 0
                      ? '#fecaca'
                      : '#fde68a'
                  }`,
                  color:
                    importResult.summary?.failed === 0
                      ? '#065f46'
                      : importResult.summary?.succeeded === 0
                      ? '#991b1b'
                      : '#92400e',
                }}
              >
                {importResult.summary?.failed === 0 ? (
                  <CheckCircle size={24} weight="bold" color="#059669" />
                ) : (
                  <WarningCircle size={24} weight="bold" />
                )}
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: '14px', display: 'block' }}>{importResult.message}</strong>
                  <span style={{ fontSize: '12px', opacity: 0.9 }}>
                    Processed in {importResult.summary?.execution_time_ms || 0} ms via high-concurrency worker pipeline.
                  </span>
                </div>
              </div>

              {/* KPI Summary Cards */}
              <div className="fms-results-kpi-grid">
                <div className="fms-results-kpi-card">
                  <div className="fms-results-kpi-num">{importResult.summary?.total || 0}</div>
                  <div className="fms-results-kpi-label">Total Rows</div>
                </div>
                <div className="fms-results-kpi-card success">
                  <div className="fms-results-kpi-num">{importResult.summary?.succeeded || 0}</div>
                  <div className="fms-results-kpi-label">Succeeded</div>
                </div>
                <div className="fms-results-kpi-card failed">
                  <div className="fms-results-kpi-num">{importResult.summary?.failed || 0}</div>
                  <div className="fms-results-kpi-label">Failed / Rejected</div>
                </div>
                <div className="fms-results-kpi-card">
                  <div className="fms-results-kpi-num">{importResult.summary?.execution_time_ms || 0}ms</div>
                  <div className="fms-results-kpi-label">Processing Time</div>
                </div>
              </div>

              {/* Filter Tabs */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                <button
                  type="button"
                  className={`job-btn job-btn-sm ${filterTab === 'all' ? 'primary' : 'secondary'}`}
                  onClick={() => setFilterTab('all')}
                >
                  All Rows ({importResult.results?.length || 0})
                </button>
                <button
                  type="button"
                  className={`job-btn job-btn-sm ${filterTab === 'success' ? 'primary' : 'secondary'}`}
                  onClick={() => setFilterTab('success')}
                >
                  Succeeded ({importResult.summary?.succeeded || 0})
                </button>
                <button
                  type="button"
                  className={`job-btn job-btn-sm ${filterTab === 'failed' ? 'primary' : 'secondary'}`}
                  onClick={() => setFilterTab('failed')}
                >
                  Failed ({importResult.summary?.failed || 0})
                </button>
              </div>

              {/* Results Table */}
              <div className="fms-results-table-wrapper">
                <table className="fms-results-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>Row</th>
                      <th style={{ width: '180px' }}>Reference Number</th>
                      <th style={{ width: '110px' }}>Status</th>
                      <th>Origin &rarr; Destination</th>
                      <th>Result Details / Error Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayResults.map((item, idx) => (
                      <tr key={idx} className={item.status === 'error' ? 'error-row' : ''}>
                        <td><strong>#{item.row}</strong></td>
                        <td>
                          <strong>{item.shipment?.reference_number || 'N/A'}</strong>
                        </td>
                        <td>
                          <span className={`bk-status-badge ${item.status === 'success' ? 'completed' : 'rejected'}`} style={{ fontSize: '11px', padding: '2px 8px' }}>
                            {item.status === 'success' ? 'Created' : 'Rejected'}
                          </span>
                        </td>
                        <td>
                          {item.shipment?.origin?.city
                            ? `${item.shipment.origin.city}, ${item.shipment.origin.state || ''} → ${item.shipment.destination?.city || 'TBD'}, ${item.shipment.destination?.state || ''}`
                            : '—'}
                        </td>
                        <td>
                          {item.status === 'success' ? (
                            <span style={{ color: '#059669', fontSize: '12px' }}>
                              Created in draft status (Shipment ID: #{item.shipment?.id})
                            </span>
                          ) : (
                            <span style={{ color: '#dc2626', fontSize: '12px', fontWeight: 500 }}>
                              {item.error || 'Validation error'} {item.code ? `(Code: ${item.code})` : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="fms-import-footer">
          {!importResult ? (
            <>
              <button
                type="button"
                className="bk-btn secondary"
                onClick={handleClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bk-btn primary"
                onClick={handleSubmitImport}
                disabled={!selectedFile || submitting || (parsedPreview?.errors?.length > 0)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {submitting ? (
                  <>
                    <ArrowClockwise size={16} className="bk-spinning" />
                    <span>Processing Import Batch...</span>
                  </>
                ) : (
                  <>
                    <UploadSimple size={16} weight="bold" />
                    <span>
                      {parsedPreview?.totalRows
                        ? `Import ${parsedPreview.totalRows} Shipment${parsedPreview.totalRows === 1 ? '' : 's'}`
                        : 'Import Shipments'}
                    </span>
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="bk-btn secondary"
                onClick={handleReset}
              >
                Import Another File
              </button>
              <button
                type="button"
                className="bk-btn primary"
                onClick={handleClose}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <span>Done & View Shipments</span>
                <ArrowRight size={15} weight="bold" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

