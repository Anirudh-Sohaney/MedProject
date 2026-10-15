import React from 'react';
import { ProductMatch } from '@/types/contracts';
import { ConfidenceBadge } from './ConfidenceBadge';

interface ProductRowProps {
  match: ProductMatch;
  onCorrect: (match: ProductMatch) => void;
  onHover?: (id: string | null) => void;
}

export const ProductRow: React.FC<ProductRowProps> = ({ match, onCorrect, onHover }) => {
  const isProvisional = match.status === 'provisional';
  const isPendingOcr = match.status === 'ocr-pending';

  return (
    <div
      className="card"
      onMouseEnter={() => onHover?.(match.detectionId)}
      onMouseLeave={() => onHover?.(null)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        transition: 'transform 0.1s ease, box-shadow 0.15s ease',
      }}
    >
      {/* Crop Thumbnail */}
      <div
        style={{
          width: '64px',
          height: '64px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: '#e2e8f0',
          overflow: 'hidden',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {match.cropThumbUrl ? (
          <img
            src={match.cropThumbUrl}
            alt={match.displayName}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: '1.5rem' }}>🛒</span>
        )}
      </div>

      {/* Product Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <h3
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: 'var(--color-text-main)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {match.displayName}
          </h3>
          {match.count && match.count > 1 ? (
            <span
              style={{
                backgroundColor: 'var(--color-primary-light)',
                color: 'var(--color-primary-dark)',
                fontSize: '0.8rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                flexShrink: 0,
              }}
            >
              ×{match.count}
            </span>
          ) : null}
        </div>

        {/* Brand & Variant if available */}
        {(match.brand || match.variant) && (
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            {match.brand && <strong style={{ color: '#334155' }}>{match.brand}</strong>}
            {match.brand && match.variant && ' • '}
            {match.variant && <span>{match.variant}</span>}
          </div>
        )}

        {/* Ingredient summary */}
        {match.ingredient && (
          <p
            style={{
              fontSize: '0.72rem',
              color: 'var(--color-text-muted)',
              marginTop: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
            }}
          >
            <em>Ingredients:</em> {match.ingredient}
          </p>
        )}

        {/* Confidence and Status Badges */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginTop: '8px',
            flexWrap: 'wrap',
          }}
        >
          <ConfidenceBadge
            confidence={match.confidence}
            detectorScore={match.detectorScore}
            classifierScore={match.classifierScore}
            ocrMatch={match.ocrMatch}
            candidateMargin={match.candidateMargin}
            isProduce={match.category === 'produce'}
          />
          {isProvisional && (
            <span
              style={{
                fontSize: '0.72rem',
                color: '#64748b',
                backgroundColor: '#f1f5f9',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              Provisional
            </span>
          )}
          {isPendingOcr && (
            <span
              style={{
                fontSize: '0.72rem',
                color: '#0284c7',
                backgroundColor: '#e0f2fe',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              Reading OCR...
            </span>
          )}

          {/* Manual Correction affordance */}
          <button
            type="button"
            onClick={() => onCorrect(match)}
            style={{
              marginLeft: 'auto',
              fontSize: '0.75rem',
              color: 'var(--color-primary)',
              fontWeight: 600,
              padding: '2px 6px',
              textDecoration: 'underline',
            }}
          >
            Correct
          </button>
        </div>
      </div>
    </div>
  );
};
