import React from 'react';
import { WarningCircle, ArrowsClockwise } from '@phosphor-icons/react';

/**
 * DocumentsErrorBoundary
 * Catches rendering exceptions in DocumentsPanel or nested sub-modals (BOL wizard, Preview, Sign, Share, etc.)
 * Displays a friendly user-facing card with a "Try again" action and logs the error only to console.
 */
export default class DocumentsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[DocumentsErrorBoundary Caught Exception]:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onReset === 'function') {
      try {
        this.props.onReset();
      } catch (err) {
        console.error('[DocumentsErrorBoundary onReset Error]:', err);
      }
    }
  };

  render() {
    if (this.state.hasError) {
      const {
        fallbackTitle = 'Something went wrong loading documents.',
        fallbackMessage = 'We encountered an unexpected display issue. Your documents and data remain completely safe.',
        compact = false,
      } = this.props;

      return (
        <div
          role="alert"
          style={{
            padding: compact ? '20px' : '40px 24px',
            textAlign: 'center',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #fee2e2',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            margin: compact ? '12px 0' : '16px auto',
            maxWidth: compact ? '100%' : '640px',
            fontFamily: 'inherit',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: compact ? '40px' : '52px',
              height: compact ? '40px' : '52px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              marginBottom: '14px',
            }}
          >
            <WarningCircle size={compact ? 24 : 30} weight="fill" />
          </div>

          <h3
            style={{
              margin: '0 0 8px',
              fontSize: compact ? '15px' : '18px',
              fontWeight: 600,
              color: '#0f172a',
            }}
          >
            {fallbackTitle}
          </h3>

          <p
            style={{
              margin: '0 0 20px',
              fontSize: '13px',
              lineHeight: 1.5,
              color: '#64748b',
              maxWidth: '440px',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            {fallbackMessage}
          </p>

          <button
            type="button"
            onClick={this.handleReset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
          >
            <ArrowsClockwise size={16} />
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

