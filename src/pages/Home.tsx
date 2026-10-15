import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CameraInput } from '@/components/CameraInput';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useScanContext } from '@/context/ScanContext';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { setSourceFromFile, error } = useScanContext();
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    try {
      setProcessing(true);
      setLocalError(null);
      await setSourceFromFile(file);
      navigate('/results');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to process selected photo';
      setLocalError(msg);
      setProcessing(false);
    }
  };

  return (
    <main
      style={{
        maxWidth: '430px',
        margin: '0 auto',
        padding: 'var(--space-5) var(--space-4)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
      }}
    >
      {/* Header section */}
      <div>
        <header style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              margin: '0 auto var(--space-3)',
              backgroundColor: 'var(--color-primary-light)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
            }}
          >
            🛒
          </div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: 'var(--color-text-main)',
              letterSpacing: '-0.02em',
            }}
          >
            Grocery Scanner
          </h1>
          <p
            style={{
              fontSize: '0.95rem',
              color: 'var(--color-text-muted)',
              marginTop: 'var(--space-1)',
            }}
          >
            Instant, private on-device grocery recognition
          </p>
        </header>

        {/* Status Chip */}
        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-4)',
            marginBottom: 'var(--space-6)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--color-primary)' }}>●</span>
            <div>
              <strong style={{ display: 'block' }}>Browser Inference Ready</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                YOLO11 Detector + MobileNetV3 Classifier (15.3 MB) on-device
              </span>
            </div>
          </div>
        </div>

        {/* Errors if any */}
        {(localError || error) && (
          <ErrorBanner
            message={localError || error?.message || 'Error occurred'}
            onRetake={() => {
              setLocalError(null);
            }}
          />
        )}
      </div>

      {/* Primary Interaction Area */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        {processing ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                margin: '0 auto var(--space-3)',
                border: '3px solid var(--color-primary)',
                borderRightColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Preparing photo...</p>
          </div>
        ) : (
          <CameraInput onFile={handleFile} isLoading={processing} />
        )}
      </div>

      {/* Privacy Notice Footer */}
      <footer
        style={{
          textAlign: 'center',
          borderTop: '1px solid var(--color-border)',
          paddingTop: 'var(--space-4)',
          fontSize: '0.8rem',
          color: 'var(--color-text-muted)',
          lineHeight: '1.4',
        }}
      >
        <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
          <span>🔒</span>
          <strong>100% On-Device Privacy</strong>
        </p>
        <p style={{ marginTop: '2px' }}>
          Photos stay on your device. Inference runs directly in your browser without cloud uploads.
        </p>
      </footer>
    </main>
  );
};
