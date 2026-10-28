import React, { useState, useEffect } from 'react';
import {
  FileText,
  FilePdf,
  FileImage,
  DownloadSimple,
  WarningCircle,
  Clock,
  Prohibit,
  ArrowsClockwise,
  ArrowRight,
  ShieldCheck
} from '@phosphor-icons/react';
import { getPublicSharedDocument } from './api';
import './styles/publicSharedDocument.css';

export default function PublicSharedDocumentScreen({ token = '', onBackToLogin = null }) {
  const [loading, setLoading] = useState(true);
  const [errorInfo, setErrorInfo] = useState(null); // { type: '404'|'410'|'429'|'error', title, message }
  const [fileBlob, setFileBlob] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [fileName, setFileName] = useState('Document.pdf');
  const [contentType, setContentType] = useState('application/pdf');

  useEffect(() => {
    let active = true;

    if (!token || !token.trim()) {
      setErrorInfo({
        type: '404',
        title: 'Document Link Missing',
        message: 'No document token was provided in the link. Please check the URL and try again.',
      });
      setLoading(false);
      return;
    }

    const loadDocument = async () => {
      setLoading(true);
      setErrorInfo(null);

      try {
        const res = await getPublicSharedDocument(token.trim());
        if (!active) return;

        const blob = res.blob;
        const mime = res.contentType || 'application/pdf';
        setContentType(mime);
        setFileBlob(blob);

        // Parse filename from Content-Disposition header if present
        let parsedName = 'Shared-Document.pdf';
        const disp = res.contentDisposition || '';
        const match = disp.match(/filename\*?=['"]?(?:UTF-8'')?([^'";\r\n]+)['"]?/i);
        if (match && match[1]) {
          parsedName = decodeURIComponent(match[1]);
        }
        setFileName(parsedName);

        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
      } catch (err) {
        if (!active) return;
        const status = err.status || 0;

        if (status === 410) {
          setErrorInfo({
            type: '410',
            title: 'Link Expired or Revoked',
            message: 'This link has expired. Please ask the sender for a new one.',
          });
        } else if (status === 404) {
          setErrorInfo({
            type: '404',
            title: 'Document Not Found',
            message: 'This document link does not exist or has been removed by the sender.',
          });
        } else if (status === 429) {
          setErrorInfo({
            type: '429',
            title: 'Rate Limit Reached',
            message: 'Too many download requests were received from this address. Please wait a minute and try again.',
          });
        } else {
          setErrorInfo({
            type: 'error',
            title: 'Unable to Load Document',
            message: err.message || 'A network error occurred while retrieving this document. Please check your connection and try again.',
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDocument();

    return () => {
      active = false;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [token]);

  // Handle direct file download
  const handleDownload = () => {
    if (!fileBlob) return;
    const url = URL.createObjectURL(fileBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const isPdf = contentType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
  const isImage = contentType.startsWith('image/') || /\.(png|jpe?g)$/i.test(fileName);

  return (
    <div className="public-shared-page">
      {/* Branded Header */}
      <header className="public-shared-header">
        <div className="public-shared-brand">
          <div className="public-shared-brand-mark">H</div>
          <div>
            <h1>Harbor AI</h1>
            <span>Freight Documentation System</span>
          </div>
        </div>

        {onBackToLogin && (
          <button
            type="button"
            className="btn small"
            onClick={onBackToLogin}
          >
            <span>Sign In to Harbor</span>
            <ArrowRight size={14} />
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main className="public-shared-main">
        {loading ? (
          <div className="public-shared-card">
            <div style={{ textAlign: 'center', padding: '80px 24px' }}>
              <ArrowsClockwise size={32} className="spin" color="#0063fa" />
              <h3 style={{ fontSize: '18px', color: '#1e293b', marginTop: '16px' }}>
                Verifying secure share link...
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b' }}>
                Retrieving authorized document file from private storage.
              </p>
            </div>
          </div>
        ) : errorInfo ? (
          <div className="public-shared-card">
            <div className="public-shared-state-box">
              <div className={`public-shared-state-icon ${errorInfo.type === '410' ? 'expired' : 'error'}`}>
                {errorInfo.type === '410' ? (
                  <Clock size={32} weight="bold" />
                ) : (
                  <WarningCircle size={32} weight="bold" />
                )}
              </div>
              <h3>{errorInfo.title}</h3>
              <p>{errorInfo.message}</p>
              {onBackToLogin && (
                <button
                  type="button"
                  className="btn primary"
                  style={{ marginTop: '8px' }}
                  onClick={onBackToLogin}
                >
                  Return to Home
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="public-shared-card">
            {/* Header with Document Name and Download Button */}
            <div className="public-shared-card-header">
              <div className="public-shared-doc-info">
                <div className="public-shared-icon-box">
                  {isPdf ? (
                    <FilePdf size={24} weight="fill" />
                  ) : isImage ? (
                    <FileImage size={24} weight="fill" />
                  ) : (
                    <FileText size={24} weight="fill" />
                  )}
                </div>
                <div>
                  <h2>{fileName}</h2>
                  <p>Verified Shared Transport Document · Ready for Download</p>
                </div>
              </div>

              <button
                type="button"
                className="btn primary"
                onClick={handleDownload}
                style={{ minWidth: '150px' }}
              >
                <DownloadSimple size={16} weight="bold" />
                <span>Download File</span>
              </button>
            </div>

            {/* Viewer Section */}
            <div className="public-shared-viewer">
              {blobUrl && isPdf && (
                <iframe
                  src={blobUrl}
                  title={`Shared Document: ${fileName}`}
                />
              )}

              {blobUrl && isImage && (
                <img
                  src={blobUrl}
                  alt={fileName}
                />
              )}

              {blobUrl && !isPdf && !isImage && (
                <div style={{ textAlign: 'center', padding: '50px 20px', maxWidth: '420px' }}>
                  <FileText size={48} color="#0063fa" />
                  <h3 style={{ fontSize: '18px', margin: '14px 0 8px 0' }}>Inline Preview Not Supported</h3>
                  <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                    This document format cannot be displayed inside the web browser. Click the download button above to view it on your device.
                  </p>
                  <button type="button" className="btn primary" onClick={handleDownload}>
                    <DownloadSimple size={15} />
                    <span>Download {fileName}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="public-shared-footer">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <ShieldCheck size={16} color="#16a34a" />
          <span>Protected by Harbor AI Freight Transport Security & Audit Controls</span>
        </div>
      </footer>
    </div>
  );
}

