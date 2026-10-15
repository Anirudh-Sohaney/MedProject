import React from 'react';
import { BoxCoords } from '@/types/contracts';

export interface OverlayBox {
  id: string;
  box: BoxCoords;
  className: string;
  score: number;
  highlight?: boolean;
}

interface ImageOverlayProps {
  imageUrl: string;
  boxes: OverlayBox[];
  onSelectBox?: (id: string) => void;
}

export const ImageOverlay: React.FC<ImageOverlayProps> = ({
  imageUrl,
  boxes,
  onSelectBox,
}) => {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-md)',
        backgroundColor: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <img
        src={imageUrl}
        alt="Captured groceries"
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          maxHeight: '45vh',
          objectFit: 'contain',
        }}
      />

      {/* Scaled Bounding Boxes Layer */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
        }}
      >
        {boxes.map((b) => {
          const left = `${b.box.x1 * 100}%`;
          const top = `${b.box.y1 * 100}%`;
          const width = `${Math.max(0, (b.box.x2 - b.box.x1) * 100)}%`;
          const height = `${Math.max(0, (b.box.y2 - b.box.y1) * 100)}%`;

          const borderColor = b.highlight ? '#f59e0b' : '#22c55e';
          const bgColor = b.highlight ? 'rgba(245, 158, 11, 0.2)' : 'rgba(34, 197, 94, 0.15)';

          return (
            <div
              key={b.id}
              onClick={() => onSelectBox?.(b.id)}
              style={{
                position: 'absolute',
                left,
                top,
                width,
                height,
                border: `2px solid ${borderColor}`,
                backgroundColor: bgColor,
                borderRadius: '4px',
                pointerEvents: 'auto',
                cursor: 'pointer',
                transition: 'border-color 0.15s ease, background-color 0.15s ease',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '-18px',
                  left: '-2px',
                  backgroundColor: borderColor,
                  color: '#ffffff',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '3px',
                  whiteSpace: 'nowrap',
                  textTransform: 'capitalize',
                  lineHeight: '1.2',
                }}
              >
                {b.className} {Math.round(b.score * 100)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
