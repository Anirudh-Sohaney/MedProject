import React from 'react';
import { getConfidenceTier } from '@/inference/confidence';

interface ConfidenceBadgeProps {
  confidence: number;
  detectorScore?: number;
  ocrMatch?: number;
  candidateMargin?: number;
  isProduce?: boolean;
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({
  confidence,
  detectorScore,
  ocrMatch,
  candidateMargin,
  isProduce,
}) => {
  const tier = getConfidenceTier(confidence);

  let bg = '#f1f5f9';
  let color = '#475569';
  let border = '#cbd5e1';

  if (tier === 'high') {
    bg = '#dcfce7';
    color = '#15803d';
    border = '#bbf7d0';
  } else if (tier === 'medium') {
    bg = '#fef3c7';
    color = '#b45309';
    border = '#fde68a';
  }

  const tooltip =
    detectorScore !== undefined
      ? `Estimated score: ${confidence}% (Uncalibrated)\n• Detector: ${Math.round(detectorScore * 100)}%\n• OCR agreement: ${
          isProduce ? 'N/A (Produce)' : `${Math.round((ocrMatch ?? 0) * 100)}%`
        }\n• Candidate margin: ${Math.round((candidateMargin ?? 0) * 100)}%`
      : 'Estimated confidence — uncalibrated heuristic';

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      <span
        className="badge"
        title={tooltip}
        style={{
          backgroundColor: bg,
          color,
          border: `1px solid ${border}`,
          fontSize: '0.75rem',
          padding: '3px 8px',
          borderRadius: '9999px',
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span style={{ fontSize: '0.65rem' }}>●</span>
        {confidence}% conf
      </span>

      {detectorScore !== undefined && (
        <span
          style={{
            fontSize: '0.68rem',
            color: '#64748b',
            display: 'inline-flex',
            gap: '4px',
          }}
          title={tooltip}
        >
          <span>det: {Math.round(detectorScore * 100)}%</span>
          {!isProduce && ocrMatch !== undefined && <span>· ocr: {Math.round(ocrMatch * 100)}%</span>}
        </span>
      )}
    </div>
  );
};
