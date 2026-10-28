import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText,
  FilePdf,
  FileImage,
  FileDoc,
  FileXls,
  UploadSimple,
  DownloadSimple,
  Eye,
  ShareNetwork,
  CheckCircle,
  WarningCircle,
  Clock,
  DotsThreeVertical,
  Plus,
  ArrowsClockwise,
  Trash,
  PencilSimple,
  LockKey,
  ShieldCheck,
  X,
  MagnifyingGlass,
  Check,
  Copy,
  Info,
  ArrowRight,
  ArrowLeft
} from '@phosphor-icons/react';
import {
  getShipmentDocuments,
  uploadShipmentDocument,
  downloadDocument,
  getDocumentVersions,
  uploadDocumentVersion,
  archiveDocument,
  generateBol,
  updateDraftBol,
  finalizeDocument,
  signDocument,
  getShipmentDocumentChecklist,
  createDocumentShareLink,
  listDocumentShareLinks,
  revokeDocumentShareLink,
  getShipmentDocumentAudit,
  getDocumentTypes
} from './api';
import {
  validateDocumentUpload,
  formatFileSize,
  calculateChecklistProgress,
  getDocumentStatusBadge,
  formatDocumentTypeName,
  getAvailableActionsForDocument,
  formatDateLocale,
  ALLOWED_EXTENSIONS
} from './services/documentsHelper.js';
import SignaturePad from './components/SignaturePad.jsx';
import DocumentsErrorBoundary from './components/DocumentsErrorBoundary.jsx';
import './styles/documents.css';

function DocumentsPanelInner({
  shipmentId,
  shipment = null,
  hasPermission = () => true,
  role = '',
  currentUser = null,
  notify = () => {},
  onClose = null,
  isPortal = false,
}) {
  // --------------------------------------------------------------------------
  // Core State
  // --------------------------------------------------------------------------
  const [documents, setDocuments] = useState([]);
  const [checklist, setChecklist] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');

  // Drag & Drop Upload State
  const [showDropzone, setShowDropzone] = useState(false);
  const [uploadType, setUploadType] = useState('bol');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadQueue, setUploadQueue] = useState([]); // [{ file, progress, status: 'queued'|'uploading'|'success'|'error', error }]
  const fileInputRef = useRef(null);

  // Action Menu State
  const [openMenuDocId, setOpenMenuDocId] = useState(null);

  // Preview Drawer State
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  // Version History Modal State
  const [versionsModalDoc, setVersionsModalDoc] = useState(null);
  const [versionsList, setVersionsList] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Upload New Version Modal State
  const [newVersionDoc, setNewVersionDoc] = useState(null);
  const [newVersionFile, setNewVersionFile] = useState(null);
  const [newVersionNotes, setNewVersionNotes] = useState('');
  const [newVersionProgress, setNewVersionProgress] = useState(0);
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const [newVersionError, setNewVersionError] = useState(null);

  // BOL Wizard Modal State (Steps: 1: Details, 2: Preview, 3: Finalize)
  const [bolWizardOpen, setBolWizardOpen] = useState(false);
  const [bolWizardStep, setBolWizardStep] = useState(1);
  const [bolWizardDoc, setBolWizardDoc] = useState(null); // draft doc if created/regenerated
  const [bolWizardPdfUrl, setBolWizardPdfUrl] = useState(null);
  const [bolGenerating, setBolGenerating] = useState(false);
  const [bolFinalizing, setBolFinalizing] = useState(false);
  const [bolForm, setBolForm] = useState({
    shipper_name: '',
    shipper_address: '',
    consignee_name: '',
    consignee_address: '',
    special_instructions: '',
    declared_value: '',
    freight_terms: 'PREPAID',
    hazmat: false,
    hazmat_un_number: '',
    hazmat_class: '',
    hazmat_placarding: '',
    hazmat_emergency_phone: '',
  });

  // Digital Signature Modal State
  const [signModalDoc, setSignModalDoc] = useState(null);
  const [signerName, setSignerName] = useState('');
  const [signerRole, setSignerRole] = useState('shipper');
  const [signatureData, setSignatureData] = useState('');
  const [confirmSignature, setConfirmSignature] = useState(false);
  const [signingDoc, setSigningDoc] = useState(false);
  const [signError, setSignError] = useState(null);

  // Share Link Modal State
  const [shareModalDoc, setShareModalDoc] = useState(null);
  const [shareExpiryHours, setShareExpiryHours] = useState(72);
  const [generatedShareLink, setGeneratedShareLink] = useState(null);
  const [activeShareLinks, setActiveShareLinks] = useState([]);
  const [loadingShareLinks, setLoadingShareLinks] = useState(false);
  const [creatingShareLink, setCreatingShareLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Archive Modal State
  const [archiveModalDoc, setArchiveModalDoc] = useState(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [archivingDoc, setArchivingDoc] = useState(false);
  const [archiveError, setArchiveError] = useState(null);

  // Revoke Share Link State
  const [revokingLinkId, setRevokingLinkId] = useState(null);

  // --------------------------------------------------------------------------
  // User & Permission Context
  // --------------------------------------------------------------------------
  const roleName = typeof role === 'object' && role !== null ? role.name : String(role || '');
  const isAdmin = roleName === 'Platform Admin' || roleName === 'Company Admin';
  const canUpload = hasPermission('documents', 'upload');
  const canGenerate = hasPermission('documents', 'generate');
  const canSign = hasPermission('documents', 'sign');
  const canShare = hasPermission('documents', 'share');
  const canDelete = hasPermission('documents', 'delete');

  // --------------------------------------------------------------------------
  // Data Loading
  // --------------------------------------------------------------------------
  const loadDocumentsData = useCallback(async (isSilent = false) => {
    if (!shipmentId) return;
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      // 1. Fetch documents
      const docsRes = await getShipmentDocuments(shipmentId, {
        type: selectedTypeFilter,
        status: selectedStatusFilter,
        include_archived: true,
      });
      const docsList = Array.isArray(docsRes) ? docsRes : (Array.isArray(docsRes?.data) ? docsRes.data : []);
      setDocuments(docsList);

      // 2. Fetch checklist
      try {
        const checkRes = await getShipmentDocumentChecklist(shipmentId);
        setChecklist(checkRes);
      } catch (checkErr) {
        console.warn('Checklist fetch non-blocking warning:', checkErr);
      }

      // 3. Fetch audit logs (Company Admin / Platform Admin only)
      if (isAdmin) {
        try {
          const auditRes = await getShipmentDocumentAudit(shipmentId);
          setAuditLogs(Array.isArray(auditRes) ? auditRes : (Array.isArray(auditRes?.data) ? auditRes.data : []));
        } catch (auditErr) {
          console.warn('Audit trail fetch non-blocking warning:', auditErr);
        }
      }
    } catch (err) {
      console.error('Failed to load documents data:', err);
      let friendlyMsg = 'Unable to load shipment documents. The server encountered an issue.';
      if (err?.status === 401) {
        friendlyMsg = 'Your session has expired. Please refresh the page or sign in again.';
      } else if (err?.status === 403) {
        friendlyMsg = "You don't have permission to view documents for this shipment.";
      } else if (err?.status === 404) {
        friendlyMsg = 'Shipment or document records could not be found.';
      } else if (err?.status === 500) {
        friendlyMsg = 'Unable to load shipment documents. The server encountered an internal error.';
      } else if (err?.message) {
        friendlyMsg = err.message;
      }
      setError(friendlyMsg);
      notify(friendlyMsg, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [shipmentId, selectedTypeFilter, selectedStatusFilter, isAdmin, notify]);

  // Load document types from M17 settings on mount
  useEffect(() => {
    let isMounted = true;
    getDocumentTypes()
      .then((res) => {
        if (!isMounted) return;
        const types = Array.isArray(res)
          ? res
          : Array.isArray(res?.data?.values)
          ? res.data.values
          : Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.items)
          ? res.items
          : [];
        setDocumentTypes(types);
        if (types.length > 0 && !uploadType) {
          const firstVal = types[0]?.value || types[0]?.key || 'bol';
          setUploadType(firstVal);
        }
      })
      .catch((err) => {
        console.warn('Failed to load document types from settings:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch documents when shipmentId changes
  useEffect(() => {
    loadDocumentsData();
  }, [loadDocumentsData]);

  // Close menus on outside click or Esc
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpenMenuDocId(null);
        if (previewDoc) handleClosePreview();
        if (versionsModalDoc) setVersionsModalDoc(null);
        if (newVersionDoc) setNewVersionDoc(null);
        if (bolWizardOpen) handleCloseBolWizard();
        if (signModalDoc) setSignModalDoc(null);
        if (shareModalDoc) setShareModalDoc(null);
        if (archiveModalDoc) setArchiveModalDoc(null);
      }
    };
    const handleClickOutside = () => {
      setOpenMenuDocId(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClickOutside);
    };
  }, [previewDoc, versionsModalDoc, newVersionDoc, bolWizardOpen, signModalDoc, shareModalDoc, archiveModalDoc]);

  // Clean up blob URLs when preview closes
  const handleClosePreview = () => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
    setPreviewDoc(null);
    setPreviewError(null);
  };

  const handleCloseBolWizard = () => {
    if (bolWizardPdfUrl) {
      URL.revokeObjectURL(bolWizardPdfUrl);
      setBolWizardPdfUrl(null);
    }
    setBolWizardOpen(false);
    setBolWizardDoc(null);
    setBolWizardStep(1);
  };

  // --------------------------------------------------------------------------
  // Document Checklist Evaluation
  // --------------------------------------------------------------------------
  const checklistStats = calculateChecklistProgress(checklist);

  // --------------------------------------------------------------------------
  // Preview Document Handler
  // --------------------------------------------------------------------------
  const handleOpenPreview = async (doc) => {
    setPreviewDoc(doc);
    setPreviewLoading(true);
    setPreviewError(null);
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }

    try {
      const res = await downloadDocument(doc.id, true);
      const blob = res.blob || res;
      const url = URL.createObjectURL(blob);
      setPreviewBlobUrl(url);
    } catch (err) {
      console.error('Preview error:', err);
      const msg = err.status === 403
        ? "You don't have permission to preview this document."
        : 'Failed to load preview for this file.';
      setPreviewError(msg);
      notify(msg, 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Download Document Handler
  // --------------------------------------------------------------------------
  const handleDownload = async (doc) => {
    try {
      notify(`Downloading ${doc.original_name || doc.file_name}...`, 'info');
      const res = await downloadDocument(doc.id, false);
      const blob = res.blob || res;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.original_name || doc.file_name || 'document.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      notify(`Downloaded ${doc.original_name || doc.file_name}`, 'success');
    } catch (err) {
      console.error('Download error:', err);
      notify(err.message || 'Failed to download document', 'error');
    }
  };

  // --------------------------------------------------------------------------
  // Drag & Drop Upload
  // --------------------------------------------------------------------------
  const handleFilesSelected = (files) => {
    if (!files || files.length === 0) return;
    const newItems = Array.from(files).map((file) => {
      const validation = validateDocumentUpload(file);
      return {
        file,
        progress: 0,
        status: validation.valid ? 'queued' : 'error',
        error: validation.error,
      };
    });

    setUploadQueue((prev) => [...prev, ...newItems]);
    // Process queue
    processUploadQueue(newItems);
  };

  const processUploadQueue = async (items) => {
    for (const item of items) {
      if (item.status === 'error') continue;

      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('type', uploadType || 'other');
      if (uploadNotes.trim()) {
        formData.append('notes', uploadNotes.trim());
      }

      setUploadQueue((prev) =>
        prev.map((i) => (i.file === item.file ? { ...i, status: 'uploading' } : i))
      );

      try {
        await uploadShipmentDocument(shipmentId, formData, (percent) => {
          setUploadQueue((prev) =>
            prev.map((i) => (i.file === item.file ? { ...i, progress: percent } : i))
          );
        });

        setUploadQueue((prev) =>
          prev.map((i) =>
            i.file === item.file ? { ...i, status: 'success', progress: 100 } : i
          )
        );
        notify(`Uploaded ${item.file.name} successfully`, 'success');
      } catch (err) {
        console.error('File upload failed:', err);
        const errMessage = err.status === 413
          ? 'File is too large — max 10 MB'
          : err.status === 400
          ? err.message || "This file type isn't supported"
          : err.status === 403
          ? "You don't have permission to upload documents"
          : err.message || 'Upload failed. Please try again.';

        setUploadQueue((prev) =>
          prev.map((i) =>
            i.file === item.file ? { ...i, status: 'error', error: errMessage } : i
          )
        );
        notify(errMessage, 'error');
      }
    }

    // Refresh list after uploads finish
    await loadDocumentsData(true);
  };

  const handleRetryUpload = (queueItem) => {
    processUploadQueue([{ ...queueItem, status: 'queued', error: null, progress: 0 }]);
  };

  // --------------------------------------------------------------------------
  // Version History Handlers
  // --------------------------------------------------------------------------
  const handleOpenVersions = async (doc) => {
    setVersionsModalDoc(doc);
    setLoadingVersions(true);
    try {
      const res = await getDocumentVersions(doc.id);
      setVersionsList(res?.data || (Array.isArray(res) ? res : []));
    } catch (err) {
      notify(err.message || 'Failed to load version history', 'error');
    } finally {
      setLoadingVersions(false);
    }
  };

  // --------------------------------------------------------------------------
  // Upload New Version Handlers
  // --------------------------------------------------------------------------
  const handleOpenNewVersion = (doc) => {
    setNewVersionDoc(doc);
    setNewVersionFile(null);
    setNewVersionNotes('');
    setNewVersionProgress(0);
    setNewVersionError(null);
  };

  const handleSubmitNewVersion = async (e) => {
    e.preventDefault();
    if (!newVersionDoc || !newVersionFile) return;

    const validation = validateDocumentUpload(newVersionFile);
    if (!validation.valid) {
      setNewVersionError(validation.error);
      return;
    }

    setUploadingVersion(true);
    setNewVersionError(null);

    const formData = new FormData();
    formData.append('file', newVersionFile);
    if (newVersionNotes.trim()) {
      formData.append('notes', newVersionNotes.trim());
    }

    try {
      await uploadDocumentVersion(newVersionDoc.id, formData, (percent) => {
        setNewVersionProgress(percent);
      });
      notify(`Version ${Number(newVersionDoc.version || 1) + 1} uploaded successfully`, 'success');
      setNewVersionDoc(null);
      await loadDocumentsData(true);
    } catch (err) {
      const msg = err.status === 413
        ? 'File is too large — max 10 MB'
        : err.message || 'Failed to upload new version';
      setNewVersionError(msg);
      notify(msg, 'error');
    } finally {
      setUploadingVersion(false);
    }
  };

  // --------------------------------------------------------------------------
  // BOL Wizard Handlers
  // --------------------------------------------------------------------------
  const handleOpenBolWizard = (existingBolDoc = null) => {
    const s = shipment && typeof shipment === 'object' ? shipment : {};
    const origin = s.origin && typeof s.origin === 'object' ? s.origin : {};
    const destination = s.destination && typeof s.destination === 'object' ? s.destination : {};

    setBolForm({
      shipper_name: s.shipper?.legal_name || s.shipper_name || s.name || '',
      shipper_address: origin.address || (origin.city || origin.state ? `${origin.city || ''}, ${origin.state || ''}`.trim() : ''),
      consignee_name: destination.name || s.consignee?.legal_name || s.consignee_name || 'Consignee Receiver',
      consignee_address: destination.address || (destination.city || destination.state ? `${destination.city || ''}, ${destination.state || ''}`.trim() : ''),
      special_instructions: s.notes || s.special_instructions || 'Handle with care. Liftgate on delivery.',
      declared_value: s.declared_value || '',
      freight_terms: s.freight_terms || 'PREPAID',
      hazmat: Boolean(s.is_hazmat),
      hazmat_un_number: s.hazmat_un_number || '',
      hazmat_class: s.hazmat_class || '',
      hazmat_placarding: s.hazmat_placarding || '',
      hazmat_emergency_phone: s.hazmat_emergency_phone || '',
    });

    setBolWizardDoc(existingBolDoc);
    setBolWizardStep(1);
    setBolWizardOpen(true);
  };

  const handleBolStep1GeneratePreview = async () => {
    setBolGenerating(true);
    try {
      const payload = {
        shipper_name: bolForm.shipper_name,
        shipper_address: bolForm.shipper_address,
        consignee_name: bolForm.consignee_name,
        consignee_address: bolForm.consignee_address,
        special_instructions: bolForm.special_instructions,
        declared_value: bolForm.declared_value ? Number(bolForm.declared_value) : undefined,
        freight_terms: bolForm.freight_terms,
      };

      if (bolForm.hazmat) {
        payload.hazmat_info = {
          un_number: bolForm.hazmat_un_number || 'UN 1993',
          hazard_class: bolForm.hazmat_class || 'Class 3',
          placarding: bolForm.hazmat_placarding || 'Flammable',
          emergency_phone: bolForm.hazmat_emergency_phone || '1-800-535-5053',
        };
      }

      let generatedDoc = null;
      if (bolWizardDoc && bolWizardDoc.status === 'draft') {
        const res = await updateDraftBol(bolWizardDoc.id, payload);
        generatedDoc = res.data || res;
      } else {
        const res = await generateBol(shipmentId, payload);
        generatedDoc = res.data || res;
      }

      setBolWizardDoc(generatedDoc);

      // Load preview PDF blob
      const dlRes = await downloadDocument(generatedDoc.id, true);
      const blob = dlRes.blob || dlRes;
      if (bolWizardPdfUrl) URL.revokeObjectURL(bolWizardPdfUrl);
      const url = URL.createObjectURL(blob);
      setBolWizardPdfUrl(url);

      setBolWizardStep(2);
      notify('BOL generated successfully in under 5 seconds', 'success');
      await loadDocumentsData(true);
    } catch (err) {
      console.error('BOL generation failed:', err);
      notify(err.message || 'Failed to generate BOL draft', 'error');
    } finally {
      setBolGenerating(false);
    }
  };

  const handleBolFinalize = async () => {
    if (!bolWizardDoc) return;
    setBolFinalizing(true);
    try {
      await finalizeDocument(bolWizardDoc.id);
      notify('Bill of Lading finalized and locked from editing', 'success');
      handleCloseBolWizard();
      await loadDocumentsData(true);
    } catch (err) {
      notify(err.message || 'Failed to finalize document', 'error');
    } finally {
      setBolFinalizing(false);
    }
  };

  // --------------------------------------------------------------------------
  // Digital Signature Handlers
  // --------------------------------------------------------------------------
  const handleOpenSign = (doc) => {
    setSignModalDoc(doc);
    setSignerName(currentUser?.name || currentUser?.email?.split('@')[0] || '');
    // Determine default role based on current user role
    if (roleName.includes('Shipper')) setSignerRole('shipper');
    else if (roleName.includes('Driver')) setSignerRole('driver');
    else setSignerRole('carrier');

    setSignatureData('');
    setConfirmSignature(false);
    setSignError(null);
  };

  const handleSubmitSignature = async (e) => {
    e.preventDefault();
    if (!signModalDoc || !signatureData || !confirmSignature || !signerName.trim()) {
      setSignError('Please provide your name, draw your signature, and confirm ownership.');
      return;
    }

    setSigningDoc(true);
    setSignError(null);

    try {
      await signDocument(signModalDoc.id, {
        signer_name: signerName.trim(),
        signer_role: signerRole,
        signature_data: signatureData,
      });

      notify(`Document successfully signed by ${signerName.trim()}`, 'success');
      setSignModalDoc(null);
      await loadDocumentsData(true);
    } catch (err) {
      const msg = err.status === 400
        ? err.message || 'This document has already been signed by this role.'
        : err.message || 'Failed to apply signature.';
      setSignError(msg);
      notify(msg, 'error');
    } finally {
      setSigningDoc(false);
    }
  };

  // --------------------------------------------------------------------------
  // Share Link Handlers
  // --------------------------------------------------------------------------
  const handleOpenShare = async (doc) => {
    setShareModalDoc(doc);
    setGeneratedShareLink(null);
    setCopiedToken(false);
    setLoadingShareLinks(true);

    try {
      const res = await listDocumentShareLinks(doc.id);
      setActiveShareLinks(res?.data || (Array.isArray(res) ? res : []));
    } catch (err) {
      console.warn('Failed to load existing share links:', err);
    } finally {
      setLoadingShareLinks(false);
    }
  };

  const handleCreateShareLink = async () => {
    if (!shareModalDoc) return;
    setCreatingShareLink(true);
    try {
      const res = await createDocumentShareLink(shareModalDoc.id, {
        expires_in_hours: Number(shareExpiryHours) || 72,
      });
      const data = res.data || res;
      // Build full client public share link
      const publicUrl = `${window.location.origin}/shared/${data.token || data.token_hash || data.id}`;
      setGeneratedShareLink({
        ...data,
        client_url: publicUrl,
      });
      notify('Secure share link created', 'success');

      // Refresh links list
      const linksRes = await listDocumentShareLinks(shareModalDoc.id);
      setActiveShareLinks(linksRes?.data || (Array.isArray(linksRes) ? linksRes : []));
    } catch (err) {
      notify(err.message || 'Failed to create share link', 'error');
    } finally {
      setCreatingShareLink(false);
    }
  };

  const handleCopyShareLink = () => {
    if (!generatedShareLink?.client_url) return;
    navigator.clipboard.writeText(generatedShareLink.client_url);
    setCopiedToken(true);
    notify('Share link copied to clipboard!', 'success');
    setTimeout(() => setCopiedToken(false), 2500);
  };

  const handleRevokeShareLink = async (linkId) => {
    if (!window.confirm('Are you sure you want to revoke this share link? Anyone holding this link will lose access immediately.')) {
      return;
    }

    setRevokingLinkId(linkId);
    try {
      await revokeDocumentShareLink(linkId);
      notify('Share link revoked successfully', 'success');
      if (shareModalDoc) {
        const res = await listDocumentShareLinks(shareModalDoc.id);
        setActiveShareLinks(res?.data || (Array.isArray(res) ? res : []));
      }
    } catch (err) {
      notify(err.message || 'Failed to revoke share link', 'error');
    } finally {
      setRevokingLinkId(null);
    }
  };

  // --------------------------------------------------------------------------
  // Archive Document Handlers
  // --------------------------------------------------------------------------
  const handleOpenArchive = (doc) => {
    setArchiveModalDoc(doc);
    setArchiveReason('');
    setArchiveError(null);
  };

  const handleSubmitArchive = async (e) => {
    e.preventDefault();
    if (!archiveModalDoc) return;
    if (archiveReason.trim().length < 5) {
      setArchiveError('Please provide a specific reason (at least 5 characters).');
      return;
    }

    setArchivingDoc(true);
    setArchiveError(null);

    try {
      await archiveDocument(archiveModalDoc.id, archiveReason.trim());
      notify('Document archived successfully', 'success');
      setArchiveModalDoc(null);
      await loadDocumentsData(true);
    } catch (err) {
      const msg = err.status === 403
        ? "Signed documents can only be archived by a Platform Admin."
        : err.message || 'Failed to archive document.';
      setArchiveError(msg);
      notify(msg, 'error');
    } finally {
      setArchivingDoc(false);
    }
  };

  // --------------------------------------------------------------------------
  // Filtering & Search (Defensive)
  // --------------------------------------------------------------------------
  const safeDocs = Array.isArray(documents) ? documents : [];
  const safeDocTypes = Array.isArray(documentTypes) ? documentTypes : [];

  const filteredDocuments = safeDocs.filter((doc) => {
    if (!doc) return false;
    const typeFilter = String(selectedTypeFilter || 'all').toLowerCase();
    if (typeFilter !== 'all' && String(doc.type || '').toLowerCase() !== typeFilter) {
      return false;
    }
    const statusFilter = String(selectedStatusFilter || 'all').toLowerCase();
    if (statusFilter !== 'all' && String(doc.status || '').toLowerCase() !== statusFilter) {
      return false;
    }
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = String(doc.original_name || doc.file_name || '').toLowerCase().includes(q);
      const matchType = String(doc.type || '').toLowerCase().includes(q);
      const matchNotes = String(doc.notes || '').toLowerCase().includes(q);
      const matchUploader = String(doc.uploader_name || '').toLowerCase().includes(q);
      if (!matchName && !matchType && !matchNotes && !matchUploader) return false;
    }
    return true;
  });

  // Check if BOL exists in this shipment
  const existingBol = safeDocs.find((d) => String(d?.type || '').toLowerCase() === 'bol' && d?.status !== 'archived');

  // File Icon Selector (Defensive)
  const renderFileIcon = (doc) => {
    const fileName = String(doc?.original_name || doc?.file_name || '');
    const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
    if (ext === 'pdf') {
      return <div className="docs-type-icon pdf"><FilePdf size={20} weight="fill" /></div>;
    }
    if (['png', 'jpg', 'jpeg'].includes(ext)) {
      return <div className="docs-type-icon image"><FileImage size={20} weight="fill" /></div>;
    }
    if (['xls', 'xlsx', 'csv'].includes(ext)) {
      return <div className="docs-type-icon sheet"><FileXls size={20} weight="fill" /></div>;
    }
    if (['doc', 'docx'].includes(ext)) {
      return <div className="docs-type-icon doc"><FileDoc size={20} weight="fill" /></div>;
    }
    return <div className="docs-type-icon generic"><FileText size={20} weight="fill" /></div>;
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <div className="docs-panel" role="region" aria-label="Documentation Management">
      {/* 1. DOCUMENT CHECKLIST CARD */}
      {loading ? (
        <div className="docs-checklist-card" style={{ opacity: 0.7 }}>
          <div className="docs-skeleton" style={{ height: '22px', width: '220px', marginBottom: '12px' }} />
          <div className="docs-skeleton" style={{ height: '12px', width: '100%', marginBottom: '16px' }} />
          <div className="docs-skeleton" style={{ height: '32px', width: '100%' }} />
        </div>
      ) : checklist ? (
        <div className="docs-checklist-card">
          <div className="docs-checklist-header">
            <div className="docs-checklist-title">
              <CheckCircle size={20} weight={checklistStats.isComplete ? 'fill' : 'bold'} color={checklistStats.isComplete ? '#16a34a' : '#0063fa'} />
              <h3>Required Document Checklist</h3>
              <span className={`docs-checklist-badge ${checklistStats.isComplete ? 'complete' : ''}`}>
                {checklistStats.percentage}% Complete
              </span>
            </div>
            <button
              type="button"
              className="btn small"
              onClick={() => loadDocumentsData(true)}
              disabled={refreshing}
              title="Refresh checklist and documents"
              aria-label="Refresh documents"
            >
              <ArrowsClockwise size={14} className={refreshing ? 'spin' : ''} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>

          <div className="docs-progress-container">
            <div className="docs-progress-meta">
              <span>{checklistStats.summaryText}</span>
              <span>{checklistStats.missingCount === 0 ? 'All requirements met' : `${checklistStats.missingCount} remaining`}</span>
            </div>
            <div className="docs-progress-bar-track">
              <div
                className={`docs-progress-bar-fill ${checklistStats.isComplete ? 'complete' : ''}`}
                style={{ width: `${checklistStats.percentage}%` }}
              />
            </div>
          </div>

          {/* Invoicing Block Banner */}
          {checklistStats.blocksInvoicing && (checklistStats.missing || []).length > 0 && (
            <div className="docs-invoicing-banner" role="alert">
              <WarningCircle size={18} weight="fill" />
              <div>
                <strong>Invoicing is currently blocked:</strong> An invoice cannot be created for this shipment until all mandatory documents are on file.
                <div style={{ marginTop: '4px' }}>
                  Missing: {(checklistStats.missing || []).map((m) => formatDocumentTypeName(m, safeDocTypes)).join(', ')}.
                </div>
              </div>
            </div>
          )}

          {/* Checklist Item Rows */}
          <div className="docs-checklist-items">
            {(checklistStats.required || []).map((reqType) => {
              const isReady = (checklistStats.completed || []).includes(reqType);
              const label = formatDocumentTypeName(reqType, safeDocTypes);
              return (
                <div key={reqType} className="docs-checklist-item">
                  <div className="docs-checklist-item-left">
                    <div className={`docs-check-icon ${isReady ? 'ready' : 'missing'}`}>
                      {isReady ? <Check size={12} weight="bold" /> : <Clock size={12} weight="bold" />}
                    </div>
                    <span className="docs-checklist-item-name">{label}</span>
                  </div>
                  <div className="docs-checklist-item-actions">
                    {isReady ? (
                      <span className="doc-badge status-signed">Ready</span>
                    ) : (
                      <>
                        <span className="doc-badge status-draft">Missing</span>
                        {reqType === 'bol' && canGenerate ? (
                          <button
                            type="button"
                            className="btn primary small"
                            onClick={() => handleOpenBolWizard(null)}
                            style={{ padding: '3px 8px', fontSize: '11px', height: '26px' }}
                          >
                            <Plus size={12} />
                            <span>Create</span>
                          </button>
                        ) : canUpload ? (
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => {
                              setUploadType(reqType);
                              setShowDropzone(true);
                              if (fileInputRef.current) fileInputRef.current.click();
                            }}
                            style={{ padding: '3px 8px', fontSize: '11px', height: '26px' }}
                          >
                            <UploadSimple size={12} />
                            <span>Upload</span>
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 2. TOOLBAR */}
      <div className="docs-toolbar">
        <div className="docs-toolbar-left">
          {canUpload && (
            <button
              type="button"
              className="btn primary"
              onClick={() => setShowDropzone((prev) => !prev)}
            >
              <UploadSimple size={16} />
              <span>{showDropzone ? 'Close Upload' : 'Upload Document'}</span>
            </button>
          )}

          {canGenerate && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => handleOpenBolWizard(existingBol)}
            >
              <FileText size={16} />
              <span>{existingBol ? 'New BOL Version' : 'Create Bill of Lading'}</span>
            </button>
          )}
        </div>

        <div className="docs-toolbar-right">
          <div className="docs-search-box">
            <MagnifyingGlass size={15} color="#64748b" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search documents by name, type, or notes"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                aria-label="Clear search"
              >
                <X size={14} color="#64748b" />
              </button>
            )}
          </div>

          <select
            className="docs-select"
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            aria-label="Filter documents by type"
          >
            <option value="all">All Document Types</option>
            {safeDocTypes.map((dt) => (
              <option key={dt.value || dt.key} value={dt.value || dt.key}>
                {dt.label || dt.name}
              </option>
            ))}
          </select>

          <select
            className="docs-select"
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            aria-label="Filter documents by status"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="final">Final</option>
            <option value="signed">Signed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* 3. DRAG & DROP UPLOAD ZONE (Collapsible) */}
      {showDropzone && canUpload && (
        <div
          className="docs-dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add('drag-active');
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('drag-active');
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('drag-active');
            handleFilesSelected(e.dataTransfer.files);
          }}
          onClick={(e) => {
            // Avoid triggering file picker if clicking inputs/selects inside
            if (['SELECT', 'INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return;
            if (fileInputRef.current) fileInputRef.current.click();
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />

          <div className="docs-dropzone-icon">
            <UploadSimple size={24} />
          </div>
          <h4>Drag files here or click to browse</h4>
          <p>Accepted formats: PDF, PNG, JPG, DOC, DOCX, XLS, XLSX, CSV (Max 10 MB per file)</p>

          <div className="docs-upload-meta-row" onClick={(e) => e.stopPropagation()}>
            <label htmlFor="upload-doc-type" style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>
              Document Type:
            </label>
            <select
              id="upload-doc-type"
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value)}
            >
              {safeDocTypes.map((dt) => (
                <option key={dt.value || dt.key} value={dt.value || dt.key}>
                  {dt.label || dt.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Optional notes or reference..."
              value={uploadNotes}
              onChange={(e) => setUploadNotes(e.target.value)}
              style={{ width: '260px' }}
            />
          </div>

          {/* Upload Queue Progress */}
          {uploadQueue.length > 0 && (
            <div className="docs-upload-queue" onClick={(e) => e.stopPropagation()}>
              {uploadQueue.map((item, idx) => (
                <div key={idx} className="docs-queue-item">
                  <div className="docs-queue-item-meta">
                    <strong>{item.file.name}</strong>
                    <span>
                      {item.status === 'uploading' && `${item.progress}%`}
                      {item.status === 'success' && <span style={{ color: '#16a34a' }}>✓ Uploaded</span>}
                      {item.status === 'error' && <span style={{ color: '#dc2626' }}>✗ Failed</span>}
                      {item.status === 'queued' && 'Queued'}
                    </span>
                  </div>

                  {item.status === 'uploading' && (
                    <div className="docs-queue-progress-bar">
                      <div className="docs-queue-progress-fill" style={{ width: `${item.progress}%` }} />
                    </div>
                  )}

                  {item.status === 'error' && (
                    <div className="docs-queue-error">
                      <span>{item.error}</span>
                      <button
                        type="button"
                        className="btn small"
                        style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '11px', height: '24px' }}
                        onClick={() => handleRetryUpload(item)}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. DOCUMENT LIST (TABLE ON DESKTOP, CARDS ON MOBILE) */}
      {error ? (
        <div
          className="docs-error-card"
          role="alert"
          style={{
            padding: '36px 24px',
            textAlign: 'center',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #fee2e2',
            margin: '16px 0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '14px',
            }}
          >
            <WarningCircle size={28} weight="fill" />
          </div>
          <h4 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>
            Unable to display documents
          </h4>
          <p
            style={{
              margin: '0 0 20px',
              fontSize: '13px',
              color: '#64748b',
              maxWidth: '440px',
              marginLeft: 'auto',
              marginRight: 'auto',
              lineHeight: 1.5,
            }}
          >
            {error}
          </p>
          <button
            type="button"
            className="btn primary"
            onClick={() => loadDocumentsData()}
            disabled={loading || refreshing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: '0 auto' }}
          >
            <ArrowsClockwise size={15} className={loading || refreshing ? 'spin' : ''} />
            <span>{loading || refreshing ? 'Retrying...' : 'Retry'}</span>
          </button>
        </div>
      ) : loading ? (
        <div className="docs-table-wrapper" style={{ padding: '20px' }}>
          <div className="docs-skeleton" style={{ height: '38px', marginBottom: '12px' }} />
          <div className="docs-skeleton" style={{ height: '38px', marginBottom: '12px' }} />
          <div className="docs-skeleton" style={{ height: '38px' }} />
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="docs-empty-state">
          <div className="docs-empty-icon">
            <FileText size={28} />
          </div>
          <h4>No documents yet — upload the first one</h4>
          <p>
            Attach Bills of Lading, Proof of Delivery, rate confirmations, or commercial invoices to maintain full legal compliance.
          </p>
          {canUpload && (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setShowDropzone(true);
                if (fileInputRef.current) fileInputRef.current.click();
              }}
            >
              <UploadSimple size={15} />
              <span>Upload Document</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="docs-table-wrapper">
            <table className="docs-table">
              <thead>
                <tr>
                  <th>Document Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>Size</th>
                  <th>Uploaded By</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((doc) => {
                  const statusBadge = getDocumentStatusBadge(doc.status);
                  const actions = getAvailableActionsForDocument(doc, { userRole: roleName, hasPermission });
                  const isMenuOpen = openMenuDocId === doc.id;

                  return (
                    <tr key={doc.id}>
                      <td>
                        <div className="docs-file-cell">
                          {renderFileIcon(doc)}
                          <div className="docs-file-name-meta">
                            <span className="docs-file-name" title={doc.original_name || doc.file_name}>
                              {doc.original_name || doc.file_name}
                            </span>
                            {doc.notes && <span className="docs-file-subtext" title={doc.notes}>{doc.notes}</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="doc-badge" style={{ background: '#f1f5f9', color: '#334155' }}>
                          {formatDocumentTypeName(doc.type, documentTypes)}
                        </span>
                      </td>
                      <td>
                        <span className={`doc-badge ${statusBadge.className}`}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td>
                        <span className="doc-version-pill">v{doc.version || 1}</span>
                      </td>
                      <td style={{ color: '#64748b' }}>{formatFileSize(doc.file_size)}</td>
                      <td style={{ color: '#475569' }}>{doc.uploader_name || 'System / Auto'}</td>
                      <td style={{ color: '#64748b' }}>{formatDateLocale(doc.created_at)}</td>
                      <td>
                        <div className="docs-row-actions">
                          <button
                            type="button"
                            className="btn small"
                            style={{ padding: '4px 8px', height: '30px' }}
                            onClick={() => handleOpenPreview(doc)}
                            title="Preview document"
                            aria-label={`Preview ${doc.original_name || doc.file_name}`}
                          >
                            <Eye size={14} />
                            <span>Preview</span>
                          </button>

                          <button
                            type="button"
                            className="btn small"
                            style={{ padding: '4px 8px', height: '30px' }}
                            onClick={() => handleDownload(doc)}
                            title="Download document file"
                            aria-label={`Download ${doc.original_name || doc.file_name}`}
                          >
                            <DownloadSimple size={14} />
                          </button>

                          {/* Overflow Menu (⋯) */}
                          <div style={{ position: 'relative' }}>
                            <button
                              type="button"
                              className="docs-overflow-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuDocId(isMenuOpen ? null : doc.id);
                              }}
                              title="More actions"
                              aria-label="More actions"
                            >
                              <DotsThreeVertical size={18} weight="bold" />
                            </button>

                            {isMenuOpen && (
                              <div className="docs-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="docs-dropdown-item"
                                  onClick={() => {
                                    setOpenMenuDocId(null);
                                    handleOpenPreview(doc);
                                  }}
                                >
                                  <Eye size={14} />
                                  <span>Preview</span>
                                </button>

                                <button
                                  type="button"
                                  className="docs-dropdown-item"
                                  onClick={() => {
                                    setOpenMenuDocId(null);
                                    handleDownload(doc);
                                  }}
                                >
                                  <DownloadSimple size={14} />
                                  <span>Download</span>
                                </button>

                                {actions.canUploadVersion && (
                                  <button
                                    type="button"
                                    className="docs-dropdown-item"
                                    onClick={() => {
                                      setOpenMenuDocId(null);
                                      handleOpenNewVersion(doc);
                                    }}
                                  >
                                    <UploadSimple size={14} />
                                    <span>Upload New Version</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  className="docs-dropdown-item"
                                  onClick={() => {
                                    setOpenMenuDocId(null);
                                    handleOpenVersions(doc);
                                  }}
                                >
                                  <Clock size={14} />
                                  <span>Version History</span>
                                </button>

                                {actions.canShare && (
                                  <button
                                    type="button"
                                    className="docs-dropdown-item"
                                    onClick={() => {
                                      setOpenMenuDocId(null);
                                      handleOpenShare(doc);
                                    }}
                                  >
                                    <ShareNetwork size={14} />
                                    <span>Share Link</span>
                                  </button>
                                )}

                                {actions.canSign && (
                                  <button
                                    type="button"
                                    className="docs-dropdown-item"
                                    onClick={() => {
                                      setOpenMenuDocId(null);
                                      handleOpenSign(doc);
                                    }}
                                  >
                                    <PencilSimple size={14} />
                                    <span>Sign Document</span>
                                  </button>
                                )}

                                {actions.canArchive && (
                                  <button
                                    type="button"
                                    className="docs-dropdown-item danger"
                                    onClick={() => {
                                      setOpenMenuDocId(null);
                                      handleOpenArchive(doc);
                                    }}
                                  >
                                    <Trash size={14} />
                                    <span>Archive</span>
                                  </button>
                                )}

                                {actions.isSignedLockedForArchive && (
                                  <div
                                    className="docs-dropdown-item"
                                    style={{ color: '#94a3b8', cursor: 'not-allowed' }}
                                    title="Signed documents can only be archived by a Platform Admin"
                                  >
                                    <LockKey size={14} />
                                    <span>Signed (Admin Archive Only)</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="docs-cards-grid">
            {filteredDocuments.map((doc) => {
              const statusBadge = getDocumentStatusBadge(doc.status);
              const actions = getAvailableActionsForDocument(doc, { userRole: roleName, hasPermission });

              return (
                <div key={doc.id} className="docs-card">
                  <div className="docs-card-header">
                    <div className="docs-file-cell">
                      {renderFileIcon(doc)}
                      <div className="docs-file-name-meta">
                        <span className="docs-file-name">{doc.original_name || doc.file_name}</span>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                          <span className={`doc-badge ${statusBadge.className}`}>{statusBadge.label}</span>
                          <span className="doc-version-pill">v{doc.version || 1}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="docs-card-meta">
                    <div>
                      <span>Type:</span> <strong>{formatDocumentTypeName(doc.type, documentTypes)}</strong>
                    </div>
                    <div>
                      <span>Size:</span> <strong>{formatFileSize(doc.file_size)}</strong>
                    </div>
                    <div>
                      <span>Uploader:</span> <strong>{doc.uploader_name || 'System'}</strong>
                    </div>
                    <div>
                      <span>Date:</span> <strong>{formatDateLocale(doc.created_at)}</strong>
                    </div>
                  </div>

                  <div className="docs-card-actions">
                    <button type="button" className="btn small" onClick={() => handleOpenPreview(doc)}>
                      <Eye size={14} />
                      <span>Preview</span>
                    </button>
                    <button type="button" className="btn small" onClick={() => handleDownload(doc)}>
                      <DownloadSimple size={14} />
                      <span>Download</span>
                    </button>
                    {actions.canSign && (
                      <button type="button" className="btn primary small" onClick={() => handleOpenSign(doc)}>
                        <PencilSimple size={14} />
                        <span>Sign</span>
                      </button>
                    )}
                    {actions.canShare && (
                      <button type="button" className="btn secondary small" onClick={() => handleOpenShare(doc)}>
                        <ShareNetwork size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 5. PREVIEW DRAWER / MODAL */}
      {previewDoc && (
        <div className="docs-modal-backdrop" onClick={handleClosePreview}>
          <div className="docs-modal-box preview" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <DocumentsErrorBoundary fallbackTitle="Unable to preview document" compact>
              <div className="docs-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileText size={20} color="#0063fa" />
                  <div>
                    <h3 style={{ margin: 0 }}>{previewDoc.original_name || previewDoc.file_name}</h3>
                    <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      <span>Version v{previewDoc.version || 1}</span>
                      <span>·</span>
                      <span>{formatFileSize(previewDoc.file_size)}</span>
                      <span>·</span>
                      <span className={`doc-badge ${getDocumentStatusBadge(previewDoc.status).className}`}>
                        {getDocumentStatusBadge(previewDoc.status).label}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => handleDownload(previewDoc)}
                    title="Download File"
                  >
                    <DownloadSimple size={14} />
                    <span>Download</span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn small"
                    onClick={handleClosePreview}
                    aria-label="Close preview"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="docs-modal-body" style={{ padding: '0', display: 'flex', flex: 1 }}>
                <div className="docs-preview-viewport">
                  {previewLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <ArrowsClockwise size={24} className="spin" color="#0063fa" />
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Loading secure preview...</span>
                    </div>
                  ) : previewError ? (
                    <div className="docs-preview-fallback">
                      <WarningCircle size={36} color="#dc2626" />
                      <h4>Preview Failed</h4>
                      <p>{previewError}</p>
                      <button type="button" className="btn primary" onClick={() => handleDownload(previewDoc)}>
                        <DownloadSimple size={14} />
                        <span>Download File Instead</span>
                      </button>
                    </div>
                  ) : previewBlobUrl ? (
                    (() => {
                      const ext = (previewDoc.original_name || previewDoc.file_name || '').split('.').pop().toLowerCase();
                      if (ext === 'pdf') {
                        return <iframe src={previewBlobUrl} title="Document PDF Preview" />;
                      }
                      if (['png', 'jpg', 'jpeg'].includes(ext)) {
                        return <img src={previewBlobUrl} alt={previewDoc.file_name} />;
                      }
                      return (
                        <div className="docs-preview-fallback">
                          <FileDoc size={40} color="#0063fa" />
                          <h4>Inline Preview Not Available</h4>
                          <p>This file format ({ext.toUpperCase()}) cannot be rendered directly inside the browser.</p>
                          <button type="button" className="btn primary" onClick={() => handleDownload(previewDoc)}>
                            <DownloadSimple size={14} />
                            <span>Download to View</span>
                          </button>
                        </div>
                      );
                    })()
                  ) : null}
                </div>
              </div>
            </DocumentsErrorBoundary>
          </div>
        </div>
      )}

      {/* 6. VERSION HISTORY MODAL */}
      {versionsModalDoc && (
        <div className="docs-modal-backdrop" onClick={() => setVersionsModalDoc(null)}>
          <div className="docs-modal-box wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <DocumentsErrorBoundary fallbackTitle="Unable to load version history" compact>
              <div className="docs-modal-header">
                <h3>Version History · {versionsModalDoc.original_name || versionsModalDoc.file_name}</h3>
                <button
                  type="button"
                  className="icon-btn small"
                  onClick={() => setVersionsModalDoc(null)}
                  aria-label="Close version history"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="docs-modal-body">
                {loadingVersions ? (
                  <div style={{ textAlign: 'center', padding: '30px' }}>
                    <ArrowsClockwise size={20} className="spin" color="#0063fa" />
                    <span style={{ display: 'block', marginTop: '8px', fontSize: '13px' }}>Loading version timeline...</span>
                  </div>
                ) : (versionsList || []).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                    Only 1 version exists for this document.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(versionsList || []).map((ver) => (
                      <div
                        key={ver.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 14px',
                          background: ver.is_current ? '#eff6ff' : '#f8fafc',
                          border: `1px solid ${ver.is_current ? '#bfdbfe' : '#e2e8f0'}`,
                          borderRadius: '8px',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="doc-version-pill">v{ver.version}</span>
                            <strong>{ver.original_name || ver.file_name}</strong>
                            {ver.is_current && (
                              <span className="doc-badge status-final" style={{ fontSize: '10px' }}>Current</span>
                            )}
                            <span className={`doc-badge ${getDocumentStatusBadge(ver.status).className}`} style={{ fontSize: '10px' }}>
                              {getDocumentStatusBadge(ver.status).label}
                            </span>
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                            Size: {formatFileSize(ver.file_size)} · Uploaded by {ver.uploader_name || 'System'} on {formatDateLocale(ver.created_at)}
                            {ver.notes && <span> · Note: "{ver.notes}"</span>}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn small"
                          onClick={() => handleDownload(ver)}
                          title="Download this version"
                        >
                          <DownloadSimple size={13} />
                          <span>Download v{ver.version}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="docs-modal-footer">
                <button type="button" className="btn" onClick={() => setVersionsModalDoc(null)}>
                  Close
                </button>
              </div>
            </DocumentsErrorBoundary>
          </div>
        </div>
      )}

      {/* 7. UPLOAD NEW VERSION MODAL */}
      {newVersionDoc && (
        <div className="docs-modal-backdrop" onClick={() => setNewVersionDoc(null)}>
          <div className="docs-modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <DocumentsErrorBoundary fallbackTitle="Unable to upload new version" compact>
              <div className="docs-modal-header">
                <h3>Upload New Version · {newVersionDoc.original_name || newVersionDoc.file_name}</h3>
                <button
                  type="button"
                  className="icon-btn small"
                  onClick={() => setNewVersionDoc(null)}
                  aria-label="Close dialog"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitNewVersion}>
                <div className="docs-modal-body">
                  <p style={{ fontSize: '13px', color: '#475569', marginBottom: '14px' }}>
                    Uploading a revised file will create <strong>Version {Number(newVersionDoc.version || 1) + 1}</strong> and archive the previous version into revision history.
                  </p>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Select Revised File (Max 10 MB) <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv"
                      onChange={(e) => setNewVersionFile(e.target.files?.[0] || null)}
                      required
                      style={{ fontSize: '13px' }}
                    />
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Revision Notes (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={newVersionNotes}
                      onChange={(e) => setNewVersionNotes(e.target.value)}
                      placeholder="e.g. Corrected consignee dock instructions, updated seal number..."
                      style={{ width: '100%', fontSize: '13px', borderRadius: '6px', padding: '8px 10px', border: '1px solid #cbd5e1' }}
                    />
                  </div>

                  {uploadingVersion && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                        <span>Uploading new version...</span>
                        <span>{newVersionProgress}%</span>
                      </div>
                      <div className="docs-queue-progress-bar">
                        <div className="docs-queue-progress-fill" style={{ width: `${newVersionProgress}%` }} />
                      </div>
                    </div>
                  )}

                  {newVersionError && (
                    <div style={{ color: '#dc2626', fontSize: '12.5px', background: '#fef2f2', padding: '8px 12px', borderRadius: '6px', border: '1px solid #fecaca' }}>
                      {newVersionError}
                    </div>
                  )}
                </div>

                <div className="docs-modal-footer">
                  <button type="button" className="btn" onClick={() => setNewVersionDoc(null)} disabled={uploadingVersion}>
                    Cancel
                  </button>
                  <button type="submit" className="btn primary" disabled={!newVersionFile || uploadingVersion}>
                    <UploadSimple size={15} />
                    <span>{uploadingVersion ? 'Uploading...' : `Upload v${Number(newVersionDoc.version || 1) + 1}`}</span>
                  </button>
                </div>
              </form>
            </DocumentsErrorBoundary>
          </div>
        </div>
      )}

      {/* 8. CREATE / EDIT BOL WIZARD MODAL (3 STEPS) */}
      {bolWizardOpen && (
        <div className="docs-modal-backdrop" onClick={handleCloseBolWizard}>
          <div className="docs-modal-box wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxHeight: '92vh' }}>
            <DocumentsErrorBoundary fallbackTitle="Unable to load Bill of Lading wizard" compact>
            <div className="docs-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>
                  {existingBol ? 'Generate Revised Bill of Lading (BOL)' : 'Generate Standard Bill of Lading (BOL)'}
                </h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Sub-second vector PDF generation with full legal terms and commodity itemization
                </span>
              </div>
              <button
                type="button"
                className="icon-btn small"
                onClick={handleCloseBolWizard}
                aria-label="Close BOL wizard"
              >
                <X size={18} />
              </button>
            </div>

            {/* Stepper Header */}
            <div style={{ padding: '16px 20px 0 20px' }}>
              <div className="docs-stepper">
                <div className={`docs-step-item ${bolWizardStep === 1 ? 'active' : bolWizardStep > 1 ? 'done' : ''}`}>
                  <div className="docs-step-dot">{bolWizardStep > 1 ? '✓' : '1'}</div>
                  <span className="docs-step-label">Check Details</span>
                </div>
                <div className={`docs-step-item ${bolWizardStep === 2 ? 'active' : bolWizardStep > 2 ? 'done' : ''}`}>
                  <div className="docs-step-dot">{bolWizardStep > 2 ? '✓' : '2'}</div>
                  <span className="docs-step-label">Preview BOL</span>
                </div>
                <div className={`docs-step-item ${bolWizardStep === 3 ? 'active' : ''}`}>
                  <div className="docs-step-dot">3</div>
                  <span className="docs-step-label">Finalize</span>
                </div>
              </div>
            </div>

            <div className="docs-modal-body">
              {/* STEP 1: CHECK DETAILS */}
              {bolWizardStep === 1 && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Shipper Name & Facility
                      </label>
                      <input
                        type="text"
                        value={bolForm.shipper_name}
                        onChange={(e) => setBolForm({ ...bolForm, shipper_name: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Shipper Origin Address
                      </label>
                      <input
                        type="text"
                        value={bolForm.shipper_address}
                        onChange={(e) => setBolForm({ ...bolForm, shipper_address: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Consignee / Receiver Name
                      </label>
                      <input
                        type="text"
                        value={bolForm.consignee_name}
                        onChange={(e) => setBolForm({ ...bolForm, consignee_name: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Consignee Delivery Address
                      </label>
                      <input
                        type="text"
                        value={bolForm.consignee_address}
                        onChange={(e) => setBolForm({ ...bolForm, consignee_address: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Freight Payment Terms
                      </label>
                      <select
                        value={bolForm.freight_terms}
                        onChange={(e) => setBolForm({ ...bolForm, freight_terms: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                      >
                        <option value="PREPAID">Prepaid</option>
                        <option value="COLLECT">Collect</option>
                        <option value="THIRD_PARTY">Third Party Billing</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Declared Cargo Value ($ USD)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 50000.00"
                        value={bolForm.declared_value}
                        onChange={(e) => setBolForm({ ...bolForm, declared_value: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Special Handling & Delivery Instructions
                    </label>
                    <textarea
                      rows={2}
                      value={bolForm.special_instructions}
                      onChange={(e) => setBolForm({ ...bolForm, special_instructions: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>

                  {/* Hazmat Section */}
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>
                      <input
                        type="checkbox"
                        checked={bolForm.hazmat}
                        onChange={(e) => setBolForm({ ...bolForm, hazmat: e.target.checked })}
                      />
                      <span>Dangerous Goods / Hazmat Declaration Included</span>
                    </label>

                    {bolForm.hazmat && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '10px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>UN Number</label>
                          <input
                            type="text"
                            placeholder="UN 1993"
                            value={bolForm.hazmat_un_number}
                            onChange={(e) => setBolForm({ ...bolForm, hazmat_un_number: e.target.value })}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>Hazard Class</label>
                          <input
                            type="text"
                            placeholder="Class 3"
                            value={bolForm.hazmat_class}
                            onChange={(e) => setBolForm({ ...bolForm, hazmat_class: e.target.value })}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>Placarding</label>
                          <input
                            type="text"
                            placeholder="Flammable Liquid"
                            value={bolForm.hazmat_placarding}
                            onChange={(e) => setBolForm({ ...bolForm, hazmat_placarding: e.target.value })}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>Emergency Contact Phone</label>
                          <input
                            type="text"
                            placeholder="1-800-535-5053"
                            value={bolForm.hazmat_emergency_phone}
                            onChange={(e) => setBolForm({ ...bolForm, hazmat_emergency_phone: e.target.value })}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 2: PREVIEW */}
              {bolWizardStep === 2 && (
                <div style={{ height: '520px', display: 'flex', flexDirection: 'column' }}>
                  {bolGenerating ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '10px' }}>
                      <ArrowsClockwise size={24} className="spin" color="#0063fa" />
                      <span style={{ fontSize: '13px', color: '#475569' }}>Creating your BOL… usually under 5 seconds</span>
                    </div>
                  ) : bolWizardPdfUrl ? (
                    <iframe
                      src={bolWizardPdfUrl}
                      title="Generated Bill of Lading PDF"
                      style={{ width: '100%', height: '100%', border: '1px solid #e2e8f0', borderRadius: '6px' }}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                      <p>No preview generated yet.</p>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: FINALIZE */}
              {bolWizardStep === 3 && (
                <div style={{ padding: '20px', textAlign: 'center', maxWidth: '480px', margin: '0 auto' }}>
                  <ShieldCheck size={54} color="#16a34a" />
                  <h3 style={{ fontSize: '18px', margin: '14px 0 8px 0', color: '#0f172a' }}>
                    Lock & Finalize Bill of Lading
                  </h3>
                  <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                    Finalizing this document converts it from <strong>Draft</strong> to <strong>Final</strong>. Once finalized, the cargo, route, and terms become an official shipping contract and cannot be modified without generating a new version.
                  </p>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginTop: '16px', textAlign: 'left', fontSize: '12.5px' }}>
                    <div>Document: <strong>{bolWizardDoc?.original_name || 'Bill of Lading'}</strong></div>
                    <div>Version: <strong>v{bolWizardDoc?.version || 1}</strong></div>
                    <div>Status: <strong>Ready to Finalize</strong></div>
                  </div>
                </div>
              )}
            </div>

            <div className="docs-modal-footer">
              {bolWizardStep > 1 && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setBolWizardStep((prev) => prev - 1)}
                  disabled={bolGenerating || bolFinalizing}
                >
                  <ArrowLeft size={14} />
                  <span>Back</span>
                </button>
              )}

              <button
                type="button"
                className="btn secondary"
                onClick={handleCloseBolWizard}
                disabled={bolGenerating || bolFinalizing}
              >
                Save as Draft & Exit
              </button>

              {bolWizardStep === 1 && (
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleBolStep1GeneratePreview}
                  disabled={bolGenerating}
                >
                  {bolGenerating ? (
                    <>
                      <ArrowsClockwise size={14} className="spin" />
                      <span>Creating your BOL…</span>
                    </>
                  ) : (
                    <>
                      <span>Next: Preview BOL</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              )}

              {bolWizardStep === 2 && (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => setBolWizardStep(3)}
                >
                  <span>Next: Finalize</span>
                  <ArrowRight size={14} />
                </button>
              )}

              {bolWizardStep === 3 && (
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleBolFinalize}
                  disabled={bolFinalizing}
                >
                  <CheckCircle size={15} weight="bold" />
                  <span>{bolFinalizing ? 'Finalizing...' : 'Confirm & Finalize BOL'}</span>
                </button>
              )}
            </div>
          </DocumentsErrorBoundary>
        </div>
      </div>
    )}

      {/* 9. SIGN MODAL */}
      {signModalDoc && (
        <div className="docs-modal-backdrop" onClick={() => setSignModalDoc(null)}>
          <div className="docs-modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <DocumentsErrorBoundary compact fallbackTitle="Unable to render signature pad">
              <div className="docs-modal-header">
                <h3>Execute Digital E-Signature</h3>
                <button
                  type="button"
                  className="icon-btn small"
                  onClick={() => setSignModalDoc(null)}
                  aria-label="Close sign modal"
                >
                  <X size={18} />
                </button>
              </div>

            <form onSubmit={handleSubmitSignature}>
              <div className="docs-modal-body">
                <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '14px', fontSize: '12.5px' }}>
                  Document: <strong>{signModalDoc.original_name || signModalDoc.file_name}</strong> (v{signModalDoc.version || 1})
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Signer Full Name <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder="e.g. Johnathan Miller"
                      required
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Signer Capacity / Role
                    </label>
                    <select
                      value={signerRole}
                      onChange={(e) => setSignerRole(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    >
                      <option value="shipper">Shipper / Customer</option>
                      <option value="carrier">Carrier Representative</option>
                      <option value="driver">Assigned Driver</option>
                    </select>
                  </div>
                </div>

                {/* Canvas Signature Pad */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Signature (Draw with finger or mouse) <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <SignaturePad
                    onChange={(dataUrl) => setSignatureData(dataUrl)}
                    onClear={() => setSignatureData('')}
                    height={150}
                  />
                </div>

                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#1e293b' }}>
                    <input
                      type="checkbox"
                      checked={confirmSignature}
                      onChange={(e) => setConfirmSignature(e.target.checked)}
                      required
                    />
                    <span>I confirm this signature is mine and legally binding on this transport record.</span>
                  </label>
                </div>

                {signError && (
                  <div style={{ marginTop: '12px', color: '#dc2626', fontSize: '12.5px', background: '#fef2f2', padding: '8px 12px', borderRadius: '6px', border: '1px solid #fecaca' }}>
                    {signError}
                  </div>
                )}
              </div>

              <div className="docs-modal-footer">
                <button type="button" className="btn" onClick={() => setSignModalDoc(null)} disabled={signingDoc}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={!signerName.trim() || !signatureData || !confirmSignature || signingDoc}
                >
                  <PencilSimple size={15} />
                  <span>{signingDoc ? 'Signing Document...' : 'Submit & Sign'}</span>
                </button>
              </div>
            </form>
          </DocumentsErrorBoundary>
        </div>
      </div>
    )}

      {/* 10. SHARE MODAL */}
      {shareModalDoc && (
        <div className="docs-modal-backdrop" onClick={() => setShareModalDoc(null)}>
          <div className="docs-modal-box wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <DocumentsErrorBoundary compact fallbackTitle="Unable to load share links">
              <div className="docs-modal-header">
              <h3>Share Document Securely · {shareModalDoc.original_name || shareModalDoc.file_name}</h3>
              <button
                type="button"
                className="icon-btn small"
                onClick={() => setShareModalDoc(null)}
                aria-label="Close share modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="docs-modal-body">
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: '#166534', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Privacy Guarantee:</strong> Time-limited public links stream only this specific document file. They never expose internal shipment carrier rates, customer phone numbers, or operational notes.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Link Expiration:</label>
                <select
                  value={shareExpiryHours}
                  onChange={(e) => setShareExpiryHours(e.target.value)}
                  className="docs-select"
                  style={{ height: '36px' }}
                >
                  <option value={24}>24 Hours</option>
                  <option value={72}>3 Days (Recommended)</option>
                  <option value={168}>7 Days</option>
                  <option value={720}>30 Days</option>
                </select>

                <button
                  type="button"
                  className="btn primary"
                  onClick={handleCreateShareLink}
                  disabled={creatingShareLink}
                >
                  <Plus size={14} />
                  <span>{creatingShareLink ? 'Generating...' : 'Create Secure Link'}</span>
                </button>
              </div>

              {/* Newly Generated Share Link Box */}
              {generatedShareLink && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px', marginBottom: '18px' }}>
                  <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: 600, marginBottom: '6px' }}>
                    Share Link Ready (Expires: {formatDateLocale(generatedShareLink.expires_at)})
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      readOnly
                      value={generatedShareLink.client_url}
                      style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px', background: '#ffffff' }}
                    />
                    <button
                      type="button"
                      className="btn primary"
                      onClick={handleCopyShareLink}
                      style={{ minWidth: '100px' }}
                    >
                      {copiedToken ? (
                        <>
                          <Check size={14} weight="bold" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
                  </div>
                  <span style={{ display: 'block', fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                    Anyone with this link can view and download this document until it expires.
                  </span>
                </div>
              )}

              {/* Active & Historical Links List */}
              <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: '10px' }}>
                Active & Previous Share Links
              </h4>

              {loadingShareLinks ? (
                <div style={{ textAlign: 'center', padding: '16px' }}>
                  <ArrowsClockwise size={18} className="spin" color="#0063fa" />
                </div>
              ) : activeShareLinks.length === 0 ? (
                <p style={{ fontSize: '12.5px', color: '#64748b' }}>No share links generated yet for this document.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {activeShareLinks.map((link) => {
                    const isRevoked = Boolean(link.revoked_at || link.is_revoked);
                    const isExpired = new Date(link.expires_at).getTime() < Date.now();
                    const statusText = isRevoked ? 'Revoked' : isExpired ? 'Expired' : 'Active';
                    const statusClass = isRevoked ? 'status-archived' : isExpired ? 'status-draft' : 'status-signed';

                    return (
                      <div
                        key={link.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className={`doc-badge ${statusClass}`} style={{ fontSize: '10px' }}>
                              {statusText}
                            </span>
                            <span>Created {formatDateLocale(link.created_at)}</span>
                            <span>·</span>
                            <span>Expires {formatDateLocale(link.expires_at)}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                            Views / Downloads: <strong>{link.access_count || 0}</strong>
                            {link.last_accessed_at && <span> · Last accessed: {formatDateLocale(link.last_accessed_at)}</span>}
                          </div>
                        </div>

                        {!isRevoked && !isExpired && (
                          <button
                            type="button"
                            className="btn small"
                            style={{ color: '#dc2626' }}
                            onClick={() => handleRevokeShareLink(link.id)}
                            disabled={revokingLinkId === link.id}
                          >
                            <Trash size={13} />
                            <span>{revokingLinkId === link.id ? 'Revoking...' : 'Revoke'}</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="docs-modal-footer">
              <button type="button" className="btn" onClick={() => setShareModalDoc(null)}>
                Close
              </button>
            </div>
          </DocumentsErrorBoundary>
        </div>
      </div>
    )}

      {/* 11. ARCHIVE CONFIRMATION MODAL */}
      {archiveModalDoc && (
        <div className="docs-modal-backdrop" onClick={() => setArchiveModalDoc(null)}>
          <div className="docs-modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <DocumentsErrorBoundary compact fallbackTitle="Unable to display archive dialog">
              <div className="docs-modal-header">
                <h3 style={{ color: '#dc2626' }}>Archive Document</h3>
                <button
                  type="button"
                  className="icon-btn small"
                  onClick={() => setArchiveModalDoc(null)}
                  aria-label="Close dialog"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitArchive}>
                <div className="docs-modal-body">
                  <p style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
                    Are you sure you want to archive <strong>{archiveModalDoc.original_name || archiveModalDoc.file_name}</strong>?
                  </p>

                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '10px 12px', fontSize: '12px', color: '#991b1b', marginBottom: '14px' }}>
                    <strong>Important:</strong> Archiving soft-deletes this document and removes it from active shipment workflows. This action cannot be undone from the standard interface.
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Reason for archiving <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={archiveReason}
                      onChange={(e) => setArchiveReason(e.target.value)}
                      placeholder="e.g. Superseded by corrected customs invoice, wrong attachment..."
                      required
                      style={{ width: '100%', fontSize: '13px', borderRadius: '6px', padding: '8px 10px', border: '1px solid #cbd5e1' }}
                    />
                  </div>

                  {archiveError && (
                    <div style={{ marginTop: '10px', color: '#dc2626', fontSize: '12.5px' }}>
                      {archiveError}
                    </div>
                  )}
                </div>

                <div className="docs-modal-footer">
                  <button type="button" className="btn" onClick={() => setArchiveModalDoc(null)} disabled={archivingDoc}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn"
                    style={{ background: '#dc2626', color: '#ffffff', borderColor: '#dc2626' }}
                    disabled={(archiveReason || '').trim().length < 5 || archivingDoc}
                  >
                    <Trash size={14} />
                    <span>{archivingDoc ? 'Archiving...' : 'Yes, Archive Document'}</span>
                  </button>
                </div>
              </form>
            </DocumentsErrorBoundary>
          </div>
        </div>
      )}

      {/* 12. AUDIT TRAIL ACTIVITY SECTION (Company Admin & Platform Admin Only) */}
      {isAdmin && auditLogs.length > 0 && (
        <div className="docs-activity-card">
          <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={16} color="#0063fa" />
            <span>Document Activity & Legal Audit Trail</span>
          </h4>

          <div className="docs-activity-timeline">
            {auditLogs.slice(0, 8).map((log) => {
              const metaText = log.meta ? JSON.stringify(log.meta) : '';
              return (
                <div key={log.id} className="docs-activity-row">
                  <div className="docs-activity-dot" />
                  <div style={{ flex: 1 }}>
                    <div>
                      <strong>User #{log.actor_user_id || 'System'}</strong> executed action{' '}
                      <span className="doc-badge status-draft" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                        {log.action}
                      </span>
                    </div>
                    <div className="docs-activity-meta">
                      {formatDateLocale(log.created_at)}
                      {log.ip && <span> · IP: {log.ip}</span>}
                      {metaText && metaText !== '{}' && <span> · Meta: {metaText}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DocumentsPanel(props) {
  return (
    <DocumentsErrorBoundary fallbackTitle="Something went wrong loading documents.">
      <DocumentsPanelInner {...props} />
    </DocumentsErrorBoundary>
  );
}

