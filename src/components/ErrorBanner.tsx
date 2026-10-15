import React from 'react';

interface ErrorBannerProps {
  message: string;
  recoverable?: boolean;
  onRetry?: () => void;
  onRetake?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  message,
  recoverable,
  onRetry,
  onRetake,
}) => {
  return (
    <div
      role="alert"
      style={{
        backgroundColor: '#fee2e2',
        color: '#991b1b',
        border: '1px solid #f87171',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3) var(--space-4)',
        marginBottom: 'var(--space-4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '1.25rem' }}>⚠️</span>
        <div>
          <strong style={{ display: 'block', fontSize: '0.9rem' }}>Scan Issue Occurred</strong>
          <span style={{ fontSize: '0.8rem', opacity: 0.95 }}>{message}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
        {recoverable && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="btn btn-secondary"
            style={{ minHeight: '36px', padding: '6px 12px', fontSize: '0.8rem' }}
          >
            Retry Scan
          </button>
        )}
        {onRetake && (
          <button
            type="button"
            onClick={onRetake}
            className="btn btn-secondary"
            style={{ minHeight: '36px', padding: '6px 12px', fontSize: '0.8rem' }}
          >
            Retake Photo
          </button>
        )}
      </div>
    </div>
  );
};
