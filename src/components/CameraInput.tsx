import React, { useRef } from 'react';

interface CameraInputProps {
  onFile: (file: File) => void;
  isLoading?: boolean;
}

export const CameraInput: React.FC<CameraInputProps> = ({ onFile, isLoading }) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFile(file);
    }
    // Clear input so same file can be re-selected if needed
    e.target.value = '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', width: '100%' }}>
      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleChange}
        disabled={isLoading}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleChange}
        disabled={isLoading}
      />

      {/* Prominent Primary Camera Button */}
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => cameraInputRef.current?.click()}
        disabled={isLoading}
        style={{
          width: '100%',
          padding: '16px 20px',
          fontSize: '1.1rem',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <span style={{ fontSize: '1.3rem' }}>📷</span>
        <span>Take a Picture</span>
      </button>

      {/* Secondary Gallery Upload Button */}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => galleryInputRef.current?.click()}
        disabled={isLoading}
        style={{ width: '100%', padding: '12px 16px' }}
      >
        <span style={{ fontSize: '1.1rem' }}>🖼️</span>
        <span>Choose from Gallery</span>
      </button>
    </div>
  );
};
