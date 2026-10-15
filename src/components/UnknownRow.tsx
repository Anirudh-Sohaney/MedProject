import React from 'react';
import { ProductMatch } from '@/types/contracts';

interface UnknownRowProps {
  match: ProductMatch;
  onCorrect: (match: ProductMatch) => void;
  onHover?: (id: string | null) => void;
}

export const UnknownRow: React.FC<UnknownRowProps> = ({ match, onCorrect, onHover }) => {
  return (
    <div
      className="card"
      onMouseEnter={() => onHover?.(match.detectionId)}
      onMouseLeave={() => onHover?.(null)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        borderStyle: 'dashed',
        borderColor: '#cbd5e1',
        backgroundColor: '#fafafa',
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: '#f1f5f9',
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
            alt="Unidentified crop"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: '1.25rem' }}>❓</span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>
          Unidentified item
        </h4>
        <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
          Can't identify package from label
        </p>
      </div>

      <button
        type="button"
        onClick={() => onCorrect(match)}
        className="btn btn-secondary"
        style={{
          minHeight: '36px',
          padding: '4px 10px',
          fontSize: '0.8rem',
          flexShrink: 0,
        }}
      >
        Identify
      </button>
    </div>
  );
};
