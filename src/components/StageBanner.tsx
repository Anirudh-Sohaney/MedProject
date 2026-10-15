import React from 'react';
import { PipelineStage } from '@/types/contracts';

interface StageBannerProps {
  stage: PipelineStage;
  message?: string;
  progress?: number;
}

export const StageBanner: React.FC<StageBannerProps> = ({ stage, message, progress }) => {
  const isFinished = stage === 'finished';
  const isError = stage === 'error';

  let bannerBg = '#e0f2fe';
  let bannerColor = '#0369a1';
  let bannerBorder = '#bae6fd';

  if (isFinished) {
    bannerBg = '#dcfce7';
    bannerColor = '#15803d';
    bannerBorder = '#bbf7d0';
  } else if (isError) {
    bannerBg = '#fee2e2';
    bannerColor = '#b91c1c';
    bannerBorder = '#fecaca';
  }

  const defaultTitles: Record<PipelineStage, string> = {
    'loading-model': 'Loading Model',
    'downloading-model': 'Downloading Model',
    'detecting': 'Detecting Items',
    'reading-label': 'Reading Labels',
    'matching': 'Matching Catalog',
    'finished': 'Scan Complete',
    'error': 'Scan Error',
  };

  return (
    <div
      role="status"
      style={{
        backgroundColor: bannerBg,
        color: bannerColor,
        border: `1px solid ${bannerBorder}`,
        borderRadius: 'var(--radius-md)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--space-3)',
        fontSize: '0.875rem',
        fontWeight: 500,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {!isFinished && !isError && (
          <span
            style={{
              display: 'inline-block',
              width: '12px',
              height: '12px',
              border: '2px solid currentColor',
              borderRightColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        )}
        {isFinished && <span>✓</span>}
        {isError && <span>⚠</span>}
        <div>
          <strong style={{ display: 'block', fontWeight: 600 }}>
            {defaultTitles[stage] || stage}
          </strong>
          {message && (
            <span style={{ fontSize: '0.78rem', opacity: 0.9 }}>{message}</span>
          )}
        </div>
      </div>
      {typeof progress === 'number' && progress < 100 && (
        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{progress}%</span>
      )}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
