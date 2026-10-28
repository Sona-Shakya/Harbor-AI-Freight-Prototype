import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Briefcase,
  Package,
  CalendarCheck,
  Path,
  Truck,
  User,
  ArrowRight,
  ArrowsClockwise,
  MagnifyingGlass,
  CheckCircle,
  WarningCircle,
  X,
  Eye,
  Plus,
  Buildings,
  Clock,
  ShieldCheck,
  Funnel,
  CaretLeft,
  CaretRight,
  Receipt,
  FileText,
  DownloadSimple
} from '@phosphor-icons/react';
import {
  getJobs,
  getJobById,
  getShipmentJob,
  updateJobStatus,
  assignJob,
  createJob,
  getFleetDrivers,
  getVehicles,
  downloadRateConfirmationDocument
} from './api';
import './styles/jobManagement.css';

export default function JobManagement({
  hasPermission,
  notify,
  profileLoading = false,
  currentUser,
  currentRoleName,
  currentOrg,
  operationalFilter,
  onNavigateToShipment,
  onNavigateToBooking,
  onNavigateToDispatch,
}) {
  // Permission checks
  const checkPerm = (mod, act) =>
    !profileLoading && typeof hasPermission === 'function' ? hasPermission(mod, act) : false;

  const canReadJobs = checkPerm('jobs', 'read') || checkPerm('shipments', 'read') || checkPerm('bookings', 'read') || true;
  const canCreateJobs = checkPerm('jobs', 'create') || currentRoleName === 'Company Admin' || currentRoleName === 'Platform Admin';
  const canUpdateJobs = checkPerm('jobs', 'update') || currentRoleName === 'Company Admin' || currentRoleName === 'Dispatcher' || currentRoleName === 'Platform Admin';
  const canAssignJobs = checkPerm('jobs', 'assign') || checkPerm('dispatch', 'assign') || currentRoleName === 'Company Admin' || currentRoleName === 'Dispatcher' || currentRoleName === 'Platform Admin';

  // Data state
  const [jobs, setJobs] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState(operationalFilter?.jobNumber || operationalFilter?.searchQuery || '');
  const [statusFilter, setStatusFilter] = useState(operationalFilter?.status || 'all');
  const [page, setPage] = useState(1);

  // Modals state
  const [detailJob, setDetailJob] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [downloadingRcId, setDownloadingRcId] = useState(null);

  const [assignModalJob, setAssignModalJob] = useState(null);
  const [assignForm, setAssignForm] = useState({ driver_id: '', truck_id: '', trailer_id: '', notes: '' });
  const [assignDrivers, setAssignDrivers] = useState([]);
  const [assignTrucks, setAssignTrucks] = useState([]);
  const [assignTrailers, setAssignTrailers] = useState([]);
  const [submittingAssign, setSubmittingAssign] = useState(false);

  const [statusModalJob, setStatusModalJob] = useState(null);
  const [targetStatus, setTargetStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [submittingStatus, setSubmittingStatus] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(operationalFilter?.action === 'create');
  const [createForm, setCreateForm] = useState({ shipment_id: operationalFilter?.shipmentId || '', carrier_org_id: '', notes: '', special_instructions: '' });
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Load Job List from Backend
  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        limit: 20,
      };
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;

      const res = await getJobs(params);
      if (res && res.success) {
        setJobs(res.data || []);
        if (res.pagination) {
          setPagination(res.pagination);
        }
      } else {
        setJobs([]);
      }
    } catch (err) {
      console.error('Failed to load jobs:', err);
      setError(err.message || 'Failed to load operational jobs from server.');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, statusFilter, currentOrg?.id]);

  // Initial load and reload on currentOrg change
  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Handle incoming operationalFilter
  useEffect(() => {
    if (operationalFilter?.jobId || operationalFilter?.jobNumber) {
      const target = operationalFilter.jobId || operationalFilter.jobNumber;
      openJobDetail(target);
    } else if (operationalFilter?.shipmentId && operationalFilter.action === 'create') {
      setCreateForm((prev) => ({ ...prev, shipment_id: String(operationalFilter.shipmentId) }));
      setCreateModalOpen(true);
    } else if (operationalFilter?.shipmentId) {
      getShipmentJob(operationalFilter.shipmentId)
        .then((res) => {
          if (res?.data) {
            setDetailJob(res.data);
          }
        })
        .catch(() => {});
    }
  }, [operationalFilter]);

  // Load Single Job Detail
  const openJobDetail = async (jobIdOrNumber) => {
    setLoadingDetail(true);
    setDetailError(null);
    setDetailJob(null);
    try {
      const res = await getJobById(jobIdOrNumber);
      if (res && res.success && res.data) {
        setDetailJob(res.data);
      } else {
        setDetailError('Job record not found or could not be loaded.');
      }
    } catch (err) {
      console.error('Failed to get job detail:', err);
      setDetailError(err.message || 'Failed to retrieve job details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Download official Rate Confirmation PDF stream
  const handleDownloadRateConfirmation = async (rcId, confirmationNumber) => {
    if (!rcId) return;
    try {
      setDownloadingRcId(rcId);
      if (notify) notify('Downloading official Rate Confirmation PDF...', 'info');

      const blob = await downloadRateConfirmationDocument(rcId);
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error('Downloaded document is empty or invalid.');
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Rate_Confirmation_${confirmationNumber || rcId}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        if (document.body.contains(a)) document.body.removeChild(a);
      }, 1000);

      if (notify) notify(`Rate Confirmation ${confirmationNumber || `#${rcId}`} downloaded successfully.`, 'success');
    } catch (err) {
      console.error('Rate confirmation download error:', err);
      const msg = err.status === 404
        ? 'Rate confirmation metadata is registered, but the PDF binary file is currently unavailable on the server.'
        : err.status === 403
        ? 'You do not have permission to download this rate confirmation (tenant restricted).'
        : (err.message || 'Failed to download rate confirmation PDF.');
      if (notify) notify(msg, 'error');
    } finally {
      setDownloadingRcId(null);
    }
  };

  // Open Assign Modal and load drivers / vehicles
  const openAssignModal = async (job) => {
    setAssignModalJob(job);
    setAssignForm({
      driver_id: job.shipment?.assigned_driver_id || '',
      truck_id: job.shipment?.assigned_truck_id || '',
      trailer_id: job.shipment?.assigned_trailer_id || '',
      notes: ''
    });

    try {
      const [driversRes, vehiclesRes] = await Promise.all([
        getFleetDrivers({ status: 'active' }).catch(() => ({ data: [] })),
        getVehicles({ status: 'active' }).catch(() => ({ data: [] }))
      ]);

      const dList = driversRes?.data || driversRes || [];
      const vList = vehiclesRes?.data || vehiclesRes || [];

      setAssignDrivers(Array.isArray(dList) ? dList : []);
      setAssignTrucks(Array.isArray(vList) ? vList.filter((v) => (v.type || '').toLowerCase() === 'truck') : []);
      setAssignTrailers(Array.isArray(vList) ? vList.filter((v) => (v.type || '').toLowerCase() === 'trailer') : []);
    } catch (err) {
      console.warn('Could not load assignment dropdown data:', err);
    }
  };

  // Submit Job Assignment
  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assignModalJob) return;
    setSubmittingAssign(true);
    try {
      const payload = {
        driver_id: assignForm.driver_id ? Number(assignForm.driver_id) : undefined,
        truck_id: assignForm.truck_id ? Number(assignForm.truck_id) : undefined,
        trailer_id: assignForm.trailer_id ? Number(assignForm.trailer_id) : undefined,
        notes: assignForm.notes || undefined,
      };

      const res = await assignJob(assignModalJob.id, payload);
      notify?.(`Job #${assignModalJob.job_number} assigned and dispatched successfully!`);
      setAssignModalJob(null);
      if (detailJob && detailJob.id === assignModalJob.id) {
        setDetailJob(res.data || null);
      }
      await loadJobs();
    } catch (err) {
      console.error('Job assignment error:', err);
      notify?.(err.message || 'Failed to assign job. Please review equipment hold or driver status.');
    } finally {
      setSubmittingAssign(false);
    }
  };

  // Open Status Transition Modal
  const openStatusModal = (job, nextStatus) => {
    setStatusModalJob(job);
    setTargetStatus(nextStatus);
    setStatusNotes('');
  };

  // Submit Status Transition
  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    if (!statusModalJob || !targetStatus) return;
    setSubmittingStatus(true);
    try {
      const res = await updateJobStatus(statusModalJob.id, {
        status: targetStatus,
        notes: statusNotes || undefined,
      });
      notify?.(`Job #${statusModalJob.job_number} transitioned to '${targetStatus}'!`);
      setStatusModalJob(null);
      if (detailJob && detailJob.id === statusModalJob.id) {
        setDetailJob(res.data || null);
      }
      await loadJobs();
    } catch (err) {
      console.error('Job status transition error:', err);
      notify?.(err.message || 'Failed to update job status.');
    } finally {
      setSubmittingStatus(false);
    }
  };

  // Submit Manual Job Creation
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.shipment_id) {
      notify?.('Please provide a valid Shipment ID.');
      return;
    }
    setSubmittingCreate(true);
    try {
      const payload = {
        shipment_id: Number(createForm.shipment_id),
        carrier_org_id: createForm.carrier_org_id ? Number(createForm.carrier_org_id) : undefined,
        notes: createForm.notes || undefined,
        special_instructions: createForm.special_instructions || undefined,
      };

      const res = await createJob(payload);
      notify?.(`Operational Job #${res.data?.job_number || ''} created successfully!`);
      setCreateModalOpen(false);
      setCreateForm({ shipment_id: '', carrier_org_id: '', notes: '', special_instructions: '' });
      await loadJobs();
      if (res.data?.id) {
        openJobDetail(res.data.id);
      }
    } catch (err) {
      console.error('Create job error:', err);
      notify?.(err.message || 'Failed to create job. Please verify shipment status and permissions.');
    } finally {
      setSubmittingCreate(false);
    }
  };

  // Stats calculation
  const stats = useMemo(() => {
    return {
      total: pagination.total || jobs.length,
      booked: jobs.filter((j) => j.status === 'booked').length,
      assigned: jobs.filter((j) => j.status === 'assigned').length,
      dispatched: jobs.filter((j) => j.status === 'dispatched').length,
      in_transit: jobs.filter((j) => j.status === 'in_transit').length,
      completed: jobs.filter((j) => j.status === 'completed').length,
    };
  }, [jobs, pagination.total]);

  // Allowed transitions based on backend state machine
  const getAllowedTransitions = (currentStatus) => {
    const map = {
      booked: ['assigned', 'dispatched', 'cancelled'],
      assigned: ['dispatched', 'cancelled'],
      dispatched: ['in_transit', 'cancelled'],
      in_transit: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };
    return map[String(currentStatus).toLowerCase()] || [];
  };

  return (
    <div className="job-container">
      {/* Top Header Row */}
      <div className="job-header-row">
        <div className="job-header-title">
          <h1>
            <Briefcase size={26} color="#0284c7" weight="bold" />
            Operational Job Console
          </h1>
          <p>
            Centralized operations engine tracking transport execution lifecycle, carrier capacity assignments, and delivery milestones.
          </p>
        </div>
        <div className="job-header-actions">
          <button
            type="button"
            className="job-btn secondary"
            onClick={loadJobs}
            disabled={loading}
            title="Refresh job records"
          >
            <ArrowsClockwise size={16} className={loading ? 'job-spinning' : ''} />
            <span>Refresh</span>
          </button>
          {canCreateJobs && (
            <button
              type="button"
              className="job-btn primary"
              onClick={() => setCreateModalOpen(true)}
              title="Manually create an operational job"
            >
              <Plus size={16} weight="bold" />
              <span>Create Job</span>
            </button>
          )}
        </div>
      </div>

      {/* Operational Pipeline Banner */}
      <div className="job-pipeline-banner">
        <div className="job-pipeline-steps">
          <span className="job-pipeline-step completed">
            <CheckCircle size={15} weight="fill" />
            <span>1. Freight Intake (Shipment)</span>
          </span>
          <span className="job-pipeline-arrow">➔</span>
          <span className="job-pipeline-step completed">
            <CheckCircle size={15} weight="fill" />
            <span>2. Carrier Commitment (Booking)</span>
          </span>
          <span className="job-pipeline-arrow">➔</span>
          <span className="job-pipeline-step active">
            <Briefcase size={15} weight="bold" />
            <span>3. Operational Job Console (Current)</span>
          </span>
          <span className="job-pipeline-arrow">➔</span>
          <span className="job-pipeline-step">
            <Path size={15} />
            <span>4. Live Dispatch & Execution</span>
          </span>
        </div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          Active Org: <strong>{currentOrg?.legal_name || 'Current Organization'}</strong>
        </div>
      </div>

      {/* KPI Stats Chips */}
      <div className="job-stats-grid">
        <div
          className={`job-stat-card ${statusFilter === 'all' ? 'active' : ''}`}
          onClick={() => { setStatusFilter('all'); setPage(1); }}
        >
          <div className="job-stat-icon" style={{ background: '#f1f5f9', color: '#475569' }}>
            <Briefcase size={20} />
          </div>
          <div className="job-stat-info">
            <span className="job-stat-label">Total Jobs</span>
            <span className="job-stat-val">{stats.total}</span>
          </div>
        </div>

        <div
          className={`job-stat-card ${statusFilter === 'booked' ? 'active' : ''}`}
          onClick={() => { setStatusFilter('booked'); setPage(1); }}
        >
          <div className="job-stat-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}>
            <CalendarCheck size={20} />
          </div>
          <div className="job-stat-info">
            <span className="job-stat-label">Booked</span>
            <span className="job-stat-val">{stats.booked}</span>
          </div>
        </div>

        <div
          className={`job-stat-card ${statusFilter === 'assigned' ? 'active' : ''}`}
          onClick={() => { setStatusFilter('assigned'); setPage(1); }}
        >
          <div className="job-stat-icon" style={{ background: '#ede9fe', color: '#7c3aed' }}>
            <User size={20} />
          </div>
          <div className="job-stat-info">
            <span className="job-stat-label">Assigned</span>
            <span className="job-stat-val">{stats.assigned}</span>
          </div>
        </div>

        <div
          className={`job-stat-card ${statusFilter === 'dispatched' ? 'active' : ''}`}
          onClick={() => { setStatusFilter('dispatched'); setPage(1); }}
        >
          <div className="job-stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
            <Truck size={20} />
          </div>
          <div className="job-stat-info">
            <span className="job-stat-label">Dispatched</span>
            <span className="job-stat-val">{stats.dispatched}</span>
          </div>
        </div>

        <div
          className={`job-stat-card ${statusFilter === 'in_transit' ? 'active' : ''}`}
          onClick={() => { setStatusFilter('in_transit'); setPage(1); }}
        >
          <div className="job-stat-icon" style={{ background: '#e0e7ff', color: '#4f46e5' }}>
            <Path size={20} />
          </div>
          <div className="job-stat-info">
            <span className="job-stat-label">In Transit</span>
            <span className="job-stat-val">{stats.in_transit}</span>
          </div>
        </div>

        <div
          className={`job-stat-card ${statusFilter === 'completed' ? 'active' : ''}`}
          onClick={() => { setStatusFilter('completed'); setPage(1); }}
        >
          <div className="job-stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
            <CheckCircle size={20} />
          </div>
          <div className="job-stat-info">
            <span className="job-stat-label">Completed</span>
            <span className="job-stat-val">{stats.completed}</span>
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="job-controls-bar">
        <div className="job-controls-left">
          <div className="job-search-box">
            <MagnifyingGlass size={16} className="job-search-icon" />
            <input
              type="text"
              className="job-search-input"
              placeholder="Search by Job # or Shipment Ref..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); loadJobs(); } }}
            />
          </div>

          <select
            className="job-filter-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Statuses</option>
            <option value="booked">Booked</option>
            <option value="assigned">Assigned</option>
            <option value="dispatched">Dispatched</option>
            <option value="in_transit">In Transit</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="job-controls-right">
          <span style={{ fontSize: '13px', color: '#64748b' }}>
            Showing <strong>{jobs.length}</strong> of <strong>{pagination.total}</strong> records
          </span>
        </div>
      </div>

      {/* Main Table or State */}
      {error && (
        <div className="job-alert error">
          <WarningCircle size={20} />
          <div style={{ flex: 1 }}>
            <strong>Error loading jobs:</strong> {error}
            <div style={{ marginTop: '6px' }}>
              <button type="button" className="job-btn job-btn-sm secondary" onClick={loadJobs}>
                Retry Loading
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="job-table-card">
        <div className="job-table-responsive">
          <table className="job-table">
            <thead>
              <tr>
                <th>Job Number</th>
                <th>Status</th>
                <th>Shipment Reference</th>
                <th>Route</th>
                <th>Assigned Carrier</th>
                <th>Shipper</th>
                <th>Created Date</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                    <ArrowsClockwise size={24} className="job-spinning" style={{ marginBottom: '8px' }} />
                    <div>Loading operational jobs...</div>
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
                    <Briefcase size={40} style={{ color: '#cbd5e1', marginBottom: '12px' }} />
                    <div style={{ fontSize: '16px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      No Operational Jobs Found
                    </div>
                    <p style={{ maxWidth: '440px', margin: '0 auto 16px', fontSize: '13px' }}>
                      {searchQuery || statusFilter !== 'all'
                        ? 'No jobs match your current search and filter criteria. Try resetting filters.'
                        : 'Jobs are automatically instantiated upon Booking confirmation, or created manually for active shipments.'}
                    </p>
                    {canCreateJobs && (
                      <button
                        type="button"
                        className="job-btn primary"
                        onClick={() => setCreateModalOpen(true)}
                      >
                        <Plus size={16} weight="bold" />
                        <span>Create First Job</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                jobs.map((job) => {
                  const s = job.shipment || {};
                  const originText = s.origin?.city ? `${s.origin.city}, ${s.origin.state || ''}` : 'Origin N/A';
                  const destText = s.destination?.city ? `${s.destination.city}, ${s.destination.state || ''}` : 'Destination N/A';

                  return (
                    <tr key={job.id}>
                      <td>
                        <strong style={{ color: '#0f172a', letterSpacing: '0.3px' }}>{job.job_number}</strong>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>ID: #{job.id}</div>
                      </td>
                      <td>
                        <span className={`job-badge ${job.status}`}>
                          {job.status === 'completed' && <CheckCircle size={12} weight="fill" />}
                          {job.status === 'dispatched' && <Truck size={12} weight="fill" />}
                          {job.status === 'in_transit' && <Path size={12} weight="fill" />}
                          {job.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        {s.reference_number || (job.shipment_id ? `#${job.shipment_id}` : 'N/A')}
                        {s.id && onNavigateToShipment && (
                          <button
                            type="button"
                            className="job-btn job-btn-sm secondary"
                            style={{ marginLeft: '8px', padding: '2px 6px', height: '22px', fontSize: '11px' }}
                            onClick={() => onNavigateToShipment(s.id)}
                            title="View linked shipment"
                          >
                            <span>Shipment</span>
                            <ArrowRight size={10} />
                          </button>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{originText} ➔ {destText}</div>
                        {s.pickup_date && (
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            Pickup: {new Date(s.pickup_date).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{job.carrier?.legal_name || 'Pending Carrier'}</div>
                        {job.carrier?.mc_number && (
                          <div style={{ fontSize: '11px', color: '#64748b' }}>MC: {job.carrier.mc_number}</div>
                        )}
                      </td>
                      <td>
                        <div>{job.shipper?.legal_name || currentOrg?.legal_name || 'Shipper Entity'}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '12px' }}>{new Date(job.created_at).toLocaleDateString()}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="job-actions-cell" style={{ justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="job-icon-btn"
                            title="View Job Details"
                            onClick={() => openJobDetail(job.id)}
                          >
                            <Eye size={16} />
                          </button>

                          {['booked', 'assigned'].includes(job.status) && canAssignJobs && (
                            <button
                              type="button"
                              className="job-icon-btn"
                              title="Assign Driver & Dispatch"
                              style={{ color: '#0284c7' }}
                              onClick={() => openAssignModal(job)}
                            >
                              <Truck size={16} />
                            </button>
                          )}

                          {getAllowedTransitions(job.status).length > 0 && canUpdateJobs && (
                            <button
                              type="button"
                              className="job-icon-btn"
                              title="Advance Lifecycle Status"
                              style={{ color: '#16a34a' }}
                              onClick={() => openStatusModal(job, getAllowedTransitions(job.status)[0])}
                            >
                              <ArrowRight size={16} />
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

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="job-pagination-row">
            <div>
              Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.total} total jobs)
            </div>
            <div className="job-pagination-buttons">
              <button
                type="button"
                className="job-btn job-btn-sm secondary"
                disabled={pagination.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <CaretLeft size={14} />
                <span>Previous</span>
              </button>
              <button
                type="button"
                className="job-btn job-btn-sm secondary"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                <span>Next</span>
                <CaretRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          JOB DETAILS MODAL
          ===================================================================== */}
      {(detailJob || loadingDetail || detailError) && (
        <div className="job-modal-backdrop" onClick={() => { setDetailJob(null); setDetailError(null); }}>
          <div
            className="job-modal-container wide"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="job-modal-header">
              <div className="job-modal-title">
                <div style={{ width: 34, height: 34, borderRadius: 8, background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Briefcase size={20} weight="bold" />
                </div>
                <div>
                  <h2>Operational Job #{detailJob?.job_number || 'Details'}</h2>
                  <p>Lifecycle state machine and relational freight context</p>
                </div>
              </div>
              <button
                type="button"
                className="job-icon-btn"
                onClick={() => { setDetailJob(null); setDetailError(null); }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="job-modal-body">
              {loadingDetail ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                  <ArrowsClockwise size={26} className="job-spinning" style={{ marginBottom: '8px' }} />
                  <div>Loading job details...</div>
                </div>
              ) : detailError ? (
                <div className="job-alert error">
                  <WarningCircle size={20} />
                  <div>{detailError}</div>
                </div>
              ) : detailJob ? (
                <div>
                  {/* Status & Transitions Bar */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 18px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>
                        Current Lifecycle Status
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        <span className={`job-badge ${detailJob.status}`} style={{ fontSize: '13px', padding: '4px 12px' }}>
                          {detailJob.status.replace('_', ' ')}
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          Updated {new Date(detailJob.updated_at).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Transition Shortcuts */}
                    {canUpdateJobs && getAllowedTransitions(detailJob.status).length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>Advance to:</span>
                        {getAllowedTransitions(detailJob.status).map((nextSt) => (
                          <button
                            key={nextSt}
                            type="button"
                            className="job-btn job-btn-sm secondary"
                            onClick={() => openStatusModal(detailJob, nextSt)}
                          >
                            <span style={{ textTransform: 'capitalize' }}>{nextSt.replace('_', ' ')}</span>
                            <ArrowRight size={12} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 2-Column Detail Cards */}
                  <div className="job-detail-grid">
                    {/* Shipment & Route Details */}
                    <div className="job-detail-card">
                      <h3>
                        <span>Linked Shipment</span>
                        {detailJob.shipment_id && onNavigateToShipment && (
                          <button
                            type="button"
                            className="job-btn job-btn-sm secondary"
                            onClick={() => {
                              const sId = detailJob.shipment_id;
                              setDetailJob(null);
                              onNavigateToShipment(sId);
                            }}
                          >
                            <span>Open Shipment</span>
                            <ArrowRight size={12} />
                          </button>
                        )}
                      </h3>
                      <div className="job-detail-row">
                        <span>Shipment ID:</span>
                        <span>#{detailJob.shipment_id}</span>
                      </div>
                      <div className="job-detail-row">
                        <span>Reference:</span>
                        <span>{detailJob.shipment?.reference_number || 'N/A'}</span>
                      </div>
                      <div className="job-detail-row">
                        <span>Origin:</span>
                        <span>{detailJob.shipment?.origin?.city}, {detailJob.shipment?.origin?.state}</span>
                      </div>
                      <div className="job-detail-row">
                        <span>Destination:</span>
                        <span>{detailJob.shipment?.destination?.city}, {detailJob.shipment?.destination?.state}</span>
                      </div>
                      <div className="job-detail-row">
                        <span>Commodity:</span>
                        <span>{detailJob.shipment?.freight_details?.commodity || 'General Freight'}</span>
                      </div>
                      <div className="job-detail-row">
                        <span>Equipment:</span>
                        <span>{detailJob.shipment?.freight_details?.equipment_type || 'Dry Van'}</span>
                      </div>
                    </div>

                    {/* Carrier & Rate Details */}
                    <div className="job-detail-card">
                      <h3>
                        <span>Carrier & Booking</span>
                        {detailJob.shipment_id && onNavigateToBooking && (
                          <button
                            type="button"
                            className="job-btn job-btn-sm secondary"
                            onClick={() => {
                              const sId = detailJob.shipment_id;
                              setDetailJob(null);
                              onNavigateToBooking(sId);
                            }}
                          >
                            <span>Open Booking</span>
                            <ArrowRight size={12} />
                          </button>
                        )}
                      </h3>
                      <div className="job-detail-row">
                        <span>Carrier Entity:</span>
                        <span>{detailJob.carrier?.legal_name || 'Carrier Partner'}</span>
                      </div>
                      <div className="job-detail-row">
                        <span>USDOT / MC:</span>
                        <span>DOT: {detailJob.carrier?.dot_number || 'N/A'} • MC: {detailJob.carrier?.mc_number || 'N/A'}</span>
                      </div>
                      <div className="job-detail-row">
                        <span>Agreed Rate:</span>
                        <span style={{ color: '#16a34a' }}>
                          ${Number(detailJob.shipment?.quote_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                        </span>
                      </div>
                      <div className="job-detail-row" style={{ alignItems: 'center' }}>
                        <span>Rate Confirmation:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong>{detailJob.shipment?.rate_confirmation?.confirmation_number || 'Attached'}</strong>
                          {detailJob.shipment?.rate_confirmation?.id && (
                            <button
                              type="button"
                              className="job-btn job-btn-sm secondary"
                              style={{ padding: '2px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              onClick={() =>
                                handleDownloadRateConfirmation(
                                  detailJob.shipment.rate_confirmation.id,
                                  detailJob.shipment.rate_confirmation.confirmation_number
                                )
                              }
                              disabled={downloadingRcId === detailJob.shipment.rate_confirmation.id}
                              title="Download official PDFKit Rate Confirmation PDF"
                            >
                              <DownloadSimple size={12} weight="bold" />
                              <span>{downloadingRcId === detailJob.shipment.rate_confirmation.id ? 'Downloading...' : 'PDF'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="job-detail-row">
                        <span>Shipper Org:</span>
                        <span>{detailJob.shipper?.legal_name || currentOrg?.legal_name || 'Shipper Entity'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Dispatch Assignments Card */}
                  <div className="job-detail-card" style={{ marginBottom: '16px' }}>
                    <h3>
                      <span>Dispatch & Asset Allocation</span>
                      {detailJob.shipment_id && onNavigateToDispatch && (
                        <button
                          type="button"
                          className="job-btn job-btn-sm secondary"
                          onClick={() => {
                            const sId = detailJob.shipment_id;
                            setDetailJob(null);
                            onNavigateToDispatch(sId);
                          }}
                        >
                          <span>Open Dispatch Board</span>
                          <ArrowRight size={12} />
                        </button>
                      )}
                    </h3>
                    {detailJob.dispatch_assignments && detailJob.dispatch_assignments.length > 0 ? (
                      detailJob.dispatch_assignments.map((da, idx) => (
                        <div key={da.id || idx} style={{ padding: '8px 0', borderBottom: idx < detailJob.dispatch_assignments.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                            <span><strong>Driver:</strong> {da.driver?.name || 'Unassigned'} ({da.driver?.phone || 'No phone'})</span>
                            <span><strong>Truck:</strong> {da.truck?.unit_number || 'N/A'}</span>
                            <span><strong>Trailer:</strong> {da.trailer?.unit_number || 'N/A'}</span>
                            <span style={{ color: '#64748b', fontSize: '12px' }}>{new Date(da.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: '#64748b', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>No driver or equipment assigned to this job yet.</span>
                        {canAssignJobs && ['booked', 'assigned'].includes(detailJob.status) && (
                          <button
                            type="button"
                            className="job-btn job-btn-sm primary"
                            onClick={() => openAssignModal(detailJob)}
                          >
                            <Truck size={14} />
                            <span>Assign & Dispatch Now</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Freight Billing & Invoice Status (Milestone 2 Delivery & Invoicing) */}
                  {(detailJob.shipment?.invoices?.length > 0 || detailJob.status === 'completed' || detailJob.shipment?.status === 'delivered' || detailJob.shipment?.status === 'closed') && (
                    <div className="job-detail-card" style={{ marginBottom: '16px', borderLeft: '3px solid #10b981' }}>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Receipt size={16} color="#059669" />
                        <span>Freight Billing & Automated Invoice</span>
                      </h3>
                      {detailJob.shipment?.invoices && detailJob.shipment.invoices.length > 0 ? (
                        detailJob.shipment.invoices.map((inv) => (
                          <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', background: '#f8fafc', padding: '12px', borderRadius: '6px', marginTop: '6px' }}>
                            <div>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>Invoice Number</div>
                              <strong style={{ fontSize: '13px', color: '#0f172a' }}>{inv.invoice_number}</strong>
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>Billed Amount</div>
                              <strong style={{ fontSize: '13px', color: '#059669' }}>${Number(inv.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>Payment Terms</div>
                              <span style={{ fontSize: '13px', color: '#334155' }}>Net 30 Days</span>
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>Invoice Status</div>
                              <span className={`job-badge ${inv.status || 'pending'}`} style={{ fontSize: '11px', padding: '2px 8px' }}>
                                {String(inv.status || 'pending').toUpperCase()}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
                          <CheckCircle size={15} color="#059669" />
                          <span>Delivery confirmed. Automated Net 30 freight invoice generated upon dropoff milestone.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Documents & Compliance Card (Rate Confirmation, BOL, POD) */}
                  {(() => {
                    const rc = detailJob.shipment?.rate_confirmation;
                    const bolDoc = detailJob.shipment?.documents?.find((d) => ['BOL', 'bol'].includes(d.type));
                    const bolRef = Array.isArray(detailJob.shipment?.references)
                      ? detailJob.shipment.references.find((r) => r.type === 'BOL')?.value
                      : detailJob.shipment?.bol_number;
                    const podDoc = detailJob.shipment?.documents?.find((d) => ['POD', 'pod'].includes(d.type));
                    const isCompleted =
                      detailJob.status === 'completed' ||
                      ['delivered', 'closed'].includes(detailJob.shipment?.status);

                    if (!rc && !bolDoc && !bolRef && !podDoc && !isCompleted) return null;

                    return (
                      <div className="job-detail-card" style={{ marginBottom: '16px' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={16} color="#2563eb" />
                          <span>Shipping Documents & Compliance</span>
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {/* Rate Confirmation Row */}
                          {rc && (
                            <div
                              style={{
                                fontSize: '13px',
                                color: '#334155',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: '#f8fafc',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileText size={15} color="#2563eb" />
                                <span>
                                  <strong>Rate Confirmation:</strong> {rc.confirmation_number}
                                </span>
                                <span
                                  className={`bk-status-badge ${
                                    rc.status === 'signed' ? 'signed' : 'pending_signature'
                                  }`}
                                  style={{ fontSize: '10px', padding: '2px 6px' }}
                                >
                                  {rc.status === 'signed' ? 'Signed' : 'Pending Signature'}
                                </span>
                              </div>
                              {rc.id && (
                                <button
                                  type="button"
                                  className="job-btn job-btn-sm secondary"
                                  style={{
                                    padding: '2px 8px',
                                    fontSize: '11px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                  onClick={() => handleDownloadRateConfirmation(rc.id, rc.confirmation_number)}
                                  disabled={downloadingRcId === rc.id}
                                >
                                  <DownloadSimple size={12} weight="bold" />
                                  <span>{downloadingRcId === rc.id ? 'Downloading...' : 'PDF'}</span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* BOL Row */}
                          {(bolDoc || bolRef) && (
                            <div
                              style={{
                                fontSize: '13px',
                                color: '#334155',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: '#f8fafc',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileText size={15} color="#059669" />
                                <span>
                                  <strong>Bill of Lading (BOL):</strong>{' '}
                                  {bolRef ||
                                    bolDoc?.file_name ||
                                    `BOL-${detailJob.shipment?.reference_number || detailJob.job_number}`}
                                </span>
                              </div>
                              <span
                                style={{
                                  fontSize: '11px',
                                  color: '#059669',
                                  background: '#ecfdf5',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  border: '1px solid #a7f3d0',
                                }}
                              >
                                {bolDoc ? 'Verified On File' : 'Reference Logged'}
                              </span>
                            </div>
                          )}

                          {/* POD Row */}
                          {(isCompleted || podDoc) && (
                            <div
                              style={{
                                fontSize: '13px',
                                color: '#334155',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: '#f8fafc',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CheckCircle size={15} color="#16a34a" weight="bold" />
                                <span>
                                  <strong>Proof of Delivery (POD):</strong>{' '}
                                  {podDoc?.file_name ||
                                    `POD-${detailJob.shipment?.reference_number || detailJob.job_number}.pdf`}
                                </span>
                              </div>
                              <span
                                style={{
                                  fontSize: '12px',
                                  color: '#059669',
                                  background: '#ecfdf5',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  border: '1px solid #a7f3d0',
                                }}
                              >
                                {podDoc ? 'Verified On File' : 'Delivery Verified'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Operational Notes */}
                  {detailJob.notes && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', fontSize: '13px' }}>
                      <strong style={{ color: '#334155' }}>Operational Notes:</strong>
                      <p style={{ margin: '4px 0 0', color: '#475569' }}>{detailJob.notes}</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="job-modal-footer">
              <button
                type="button"
                className="job-btn secondary"
                onClick={() => { setDetailJob(null); setDetailError(null); }}
              >
                Close
              </button>
              {detailJob && ['booked', 'assigned'].includes(detailJob.status) && canAssignJobs && (
                <button
                  type="button"
                  className="job-btn primary"
                  onClick={() => openAssignModal(detailJob)}
                >
                  <Truck size={16} />
                  <span>Assign & Dispatch</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          ASSIGN DRIVER & EQUIPMENT MODAL (POST /v1/jobs/:id/assign)
          ===================================================================== */}
      {assignModalJob && (
        <div className="job-modal-backdrop" onClick={() => setAssignModalJob(null)}>
          <div className="job-modal-container" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <form onSubmit={handleAssignSubmit}>
              <div className="job-modal-header">
                <div className="job-modal-title">
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: '#ede9fe', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Truck size={20} weight="bold" />
                  </div>
                  <div>
                    <h2>Assign Assets to Job #{assignModalJob.job_number}</h2>
                    <p>Allocate driver, power unit, and trailer to execute transport</p>
                  </div>
                </div>
                <button type="button" className="job-icon-btn" onClick={() => setAssignModalJob(null)}>
                  <X size={16} />
                </button>
              </div>

              <div className="job-modal-body">
                <div className="job-alert info">
                  <ShieldCheck size={20} />
                  <div>
                    Dispatch execution verifies driver compliance and equipment maintenance status before dispatching.
                  </div>
                </div>

                <div className="job-form-grid">
                  <div className="job-form-group full">
                    <label className="job-form-label">Assign Qualified Driver *</label>
                    <select
                      className="job-form-select"
                      required
                      value={assignForm.driver_id}
                      onChange={(e) => setAssignForm({ ...assignForm, driver_id: e.target.value })}
                    >
                      <option value="">-- Select Driver --</option>
                      {assignDrivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name || d.full_name} ({d.phone || 'Active CDL'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="job-form-group">
                    <label className="job-form-label">Power Unit (Truck)</label>
                    <select
                      className="job-form-select"
                      value={assignForm.truck_id}
                      onChange={(e) => setAssignForm({ ...assignForm, truck_id: e.target.value })}
                    >
                      <option value="">-- Optional / Unassigned --</option>
                      {assignTrucks.map((t) => (
                        <option key={t.id} value={t.id}>
                          Unit #{t.unit_number} ({t.equipment_type || 'Tractor'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="job-form-group">
                    <label className="job-form-label">Trailer Equipment</label>
                    <select
                      className="job-form-select"
                      value={assignForm.trailer_id}
                      onChange={(e) => setAssignForm({ ...assignForm, trailer_id: e.target.value })}
                    >
                      <option value="">-- Optional / Unassigned --</option>
                      {assignTrailers.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          Trailer #{tr.unit_number} ({tr.equipment_type || '53ft'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="job-form-group full">
                    <label className="job-form-label">Dispatch Notes</label>
                    <textarea
                      className="job-form-textarea"
                      placeholder="Special instructions for driver, gate codes, contact on arrival..."
                      value={assignForm.notes}
                      onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="job-modal-footer">
                <button type="button" className="job-btn secondary" onClick={() => setAssignModalJob(null)}>
                  Cancel
                </button>
                <button type="submit" className="job-btn primary" disabled={submittingAssign || !assignForm.driver_id}>
                  {submittingAssign ? 'Assigning...' : 'Confirm Assignment & Dispatch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          STATUS TRANSITION MODAL (PATCH /v1/jobs/:id/status)
          ===================================================================== */}
      {statusModalJob && (
        <div className="job-modal-backdrop" onClick={() => setStatusModalJob(null)}>
          <div className="job-modal-container" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <form onSubmit={handleStatusSubmit}>
              <div className="job-modal-header">
                <div className="job-modal-title">
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ArrowRight size={20} weight="bold" />
                  </div>
                  <div>
                    <h2>Update Job Status: #{statusModalJob.job_number}</h2>
                    <p>Advance job lifecycle state machine</p>
                  </div>
                </div>
                <button type="button" className="job-icon-btn" onClick={() => setStatusModalJob(null)}>
                  <X size={16} />
                </button>
              </div>

              <div className="job-modal-body">
                <div className="job-form-group full" style={{ marginBottom: '14px' }}>
                  <label className="job-form-label">Transition To New Status</label>
                  <select
                    className="job-form-select"
                    required
                    value={targetStatus}
                    onChange={(e) => setTargetStatus(e.target.value)}
                  >
                    {getAllowedTransitions(statusModalJob.status).map((st) => (
                      <option key={st} value={st}>
                        {st.replace('_', ' ').toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="job-form-group full">
                  <label className="job-form-label">Status Change Reason / Remarks</label>
                  <textarea
                    className="job-form-textarea"
                    placeholder="Provide operational reason or milestone confirmation notes..."
                    value={statusNotes}
                    onChange={(e) => setStatusNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="job-modal-footer">
                <button type="button" className="job-btn secondary" onClick={() => setStatusModalJob(null)}>
                  Cancel
                </button>
                <button type="submit" className="job-btn primary" disabled={submittingStatus || !targetStatus}>
                  {submittingStatus ? 'Updating...' : `Set Status to '${targetStatus.replace('_', ' ')}'`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MANUAL CREATE JOB MODAL (POST /v1/jobs)
          ===================================================================== */}
      {createModalOpen && (
        <div className="job-modal-backdrop" onClick={() => setCreateModalOpen(false)}>
          <div className="job-modal-container" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <form onSubmit={handleCreateSubmit}>
              <div className="job-modal-header">
                <div className="job-modal-title">
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plus size={20} weight="bold" />
                  </div>
                  <div>
                    <h2>Create Operational Job</h2>
                    <p>Manually initialize an operational job for an active shipment</p>
                  </div>
                </div>
                <button type="button" className="job-icon-btn" onClick={() => setCreateModalOpen(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className="job-modal-body">
                <div className="job-form-grid">
                  <div className="job-form-group full">
                    <label className="job-form-label">Shipment ID *</label>
                    <input
                      type="number"
                      className="job-form-input"
                      placeholder="e.g. 6061"
                      required
                      value={createForm.shipment_id}
                      onChange={(e) => setCreateForm({ ...createForm, shipment_id: e.target.value })}
                    />
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      Shipment must be active and not cancelled. If already booked, carrier will be linked automatically.
                    </span>
                  </div>

                  <div className="job-form-group full">
                    <label className="job-form-label">Carrier Organization ID (Optional)</label>
                    <input
                      type="number"
                      className="job-form-input"
                      placeholder="e.g. 2122 (leave blank to inherit from shipment)"
                      value={createForm.carrier_org_id}
                      onChange={(e) => setCreateForm({ ...createForm, carrier_org_id: e.target.value })}
                    />
                  </div>

                  <div className="job-form-group full">
                    <label className="job-form-label">Job Notes</label>
                    <textarea
                      className="job-form-textarea"
                      placeholder="Operational requirements, billing instructions..."
                      value={createForm.notes}
                      onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="job-modal-footer">
                <button type="button" className="job-btn secondary" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="job-btn primary" disabled={submittingCreate || !createForm.shipment_id}>
                  {submittingCreate ? 'Creating Job...' : 'Create Operational Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

