import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScanContext } from '@/context/ScanContext';
import { StageBanner } from '@/components/StageBanner';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ImageOverlay, OverlayBox } from '@/components/ImageOverlay';
import { ProductRow } from '@/components/ProductRow';
import { UnknownRow } from '@/components/UnknownRow';
import { searchProducts } from '@/catalog/loadCatalog';
import { Product, ProductMatch } from '@/types/contracts';

export const Results: React.FC = () => {
  const navigate = useNavigate();
  const {
    sourceImage,
    detections,
    matches,
    stage,
    stageMessage,
    stageProgress,
    timings,
    omittedCount,
    error,
    startScan,
    reset,
    manualCorrect,
  } = useScanContext();

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [correctingMatch, setCorrectingMatch] = useState<ProductMatch | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Redirect to Home if opened directly without a photo session
  useEffect(() => {
    if (!sourceImage) {
      navigate('/', { replace: true });
    }
  }, [sourceImage, navigate]);

  // Start scanning automatically on mount if not already finished
  useEffect(() => {
    if (sourceImage && stage === 'loading-model' && matches.length === 0) {
      startScan();
    }
  }, [sourceImage, stage, matches.length, startScan]);

  if (!sourceImage) {
    return null;
  }

  // Map detections to overlay boxes
  const overlayBoxes: OverlayBox[] = detections.map((d) => ({
    id: d.id,
    box: d.box,
    className: d.className,
    score: d.score,
    highlight: highlightedId === d.id,
  }));

  const handleRetake = () => {
    reset();
    navigate('/');
  };

  const handleCorrectSave = (product: Product) => {
    if (correctingMatch) {
      manualCorrect(correctingMatch.detectionId, product);
      setCorrectingMatch(null);
      setSearchQuery('');
    }
  };

  const candidateSearchResults = correctingMatch
    ? searchProducts(
        searchQuery,
        detections.find((d) => d.id === correctingMatch.detectionId)?.className
      )
    : [];

  return (
    <div
      style={{
        maxWidth: '430px',
        margin: '0 auto',
        padding: 'var(--space-4)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      {/* Top Navigation Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-2)',
        }}
      >
        <button
          type="button"
          onClick={handleRetake}
          className="btn btn-secondary"
          style={{ minHeight: '36px', padding: '6px 14px', fontSize: '0.85rem' }}
        >
          ← Retake
        </button>
        <span style={{ fontWeight: 700, fontSize: '1rem' }}>Scan Results</span>
        <button
          type="button"
          onClick={() => startScan()}
          disabled={stage !== 'finished' && stage !== 'error'}
          className="btn btn-ghost"
          style={{ minHeight: '36px', padding: '6px 12px', fontSize: '0.85rem' }}
        >
          🔄 Rescan
        </button>
      </div>

      {/* Stage Progress Banner */}
      <StageBanner stage={stage} message={stageMessage} progress={stageProgress} />

      {/* Errors if any */}
      {error && (
        <ErrorBanner
          message={error.message}
          recoverable={error.recoverable}
          onRetry={startScan}
          onRetake={handleRetake}
        />
      )}

      {/* Photo with Live Bounding Boxes */}
      <ImageOverlay
        imageUrl={sourceImage.objectUrl}
        boxes={overlayBoxes}
        onSelectBox={(id) => setHighlightedId(id)}
      />

      {/* Results Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 'var(--space-3)',
        }}
      >
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
          Detected Items ({matches.length})
        </h2>
        {omittedCount > 0 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            +{omittedCount} lower-confidence omitted
          </span>
        )}
      </div>

      {/* Progressive Match Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {matches.map((m) =>
          m.status === 'unknown' ? (
            <UnknownRow
              key={m.detectionId}
              match={m}
              onCorrect={(item) => setCorrectingMatch(item)}
              onHover={(id) => setHighlightedId(id)}
            />
          ) : (
            <ProductRow
              key={m.detectionId}
              match={m}
              onCorrect={(item) => setCorrectingMatch(item)}
              onHover={(id) => setHighlightedId(id)}
            />
          )
        )}

        {matches.length === 0 && stage !== 'finished' && (
          <div
            style={{
              textAlign: 'center',
              padding: 'var(--space-6)',
              color: 'var(--color-text-muted)',
            }}
          >
            Analyzing image...
          </div>
        )}

        {matches.length === 0 && stage === 'finished' && (
          <div
            className="card"
            style={{ textAlign: 'center', padding: 'var(--space-6)', color: '#64748b' }}
          >
            <p style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🔍</p>
            <strong style={{ display: 'block', marginBottom: '4px' }}>No items detected</strong>
            <p style={{ fontSize: '0.85rem' }}>
              Ensure items are well lit and in focus, or try taking a closer picture.
            </p>
          </div>
        )}
      </div>

      {/* Latency & Hardware Performance Metrics Summary */}
      {timings && (
        <div
          style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: '#f1f5f9',
            fontSize: '0.75rem',
            color: '#475569',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            Inference Performance ({timings.cold ? 'Cold start' : 'Warm cache'}):
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
            <div>
              Detect: <strong>{timings.detectMs} ms</strong>
            </div>
            <div>
              OCR Budget: <strong>{timings.ocrMs} ms</strong>
            </div>
            {timings.modelLoadMs !== null && (
              <div>
                Model Load: <strong>{timings.modelLoadMs} ms</strong>
              </div>
            )}
            <div>
              Total Elapsed: <strong>{(timings.totalMs / 1000).toFixed(2)} s</strong>
            </div>
          </div>
        </div>
      )}

      {/* Manual Correction Modal Sheet */}
      {correctingMatch && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setCorrectingMatch(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '430px',
              backgroundColor: '#ffffff',
              borderTopLeftRadius: 'var(--radius-lg)',
              borderTopRightRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-3)',
              }}
            >
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Choose Correct Product</h3>
              <button
                type="button"
                onClick={() => setCorrectingMatch(null)}
                style={{ fontSize: '1.25rem', padding: '4px' }}
              >
                ✕
              </button>
            </div>

            <input
              type="search"
              placeholder="Search catalog by name or brand..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                marginBottom: 'var(--space-3)',
                fontSize: '0.9rem',
              }}
              autoFocus
            />

            <div
              style={{
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                paddingBottom: 'var(--space-4)',
              }}
            >
              {candidateSearchResults.map((prod) => (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => handleCorrectSave(prod)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    textAlign: 'left',
                    backgroundColor: '#ffffff',
                  }}
                >
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.85rem' }}>{prod.name}</strong>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {prod.brand ? `${prod.brand} • ` : ''}
                      {prod.parentName}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-primary)' }}>Select</span>
                </button>
              ))}

              {candidateSearchResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: '#64748b' }}>
                  No matching products found
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
