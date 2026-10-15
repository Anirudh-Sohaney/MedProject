import React from 'react';
import { getConfidenceTier } from '@/inference/confidence';

interface ConfidenceBadgeProps {
  confidence: number;
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ confidence }) => {
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

  return (
    <span
      className="badge"
      title="Estimated confidence — not calibrated"
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
  );
};
