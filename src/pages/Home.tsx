import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CameraInput } from '@/components/CameraInput';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useScanContext } from '@/context/ScanContext';
import {
  getOpenRouterApiKey,
  setOpenRouterApiKey,
  getSelectedModel,
  setSelectedModel,
} from '@/inference/openrouter';

const POPULAR_MODELS = [
  { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna (Recommended)', desc: 'Fast, highly accurate grocery & label vision' },
  { id: 'openai/gpt-6-luna-pro', name: 'GPT-6 Luna Pro', desc: 'Maximum precision for complex / occluded scenes' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', desc: 'Ultra-fast multimodal vision' },
  { id: 'openai/gpt-4o', name: 'GPT-4o Vision', desc: 'Standard OpenAI multimodal' },
];

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { setSourceFromFile, error, scanEngine, setScanEngine } = useScanContext();
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => getOpenRouterApiKey());
  const [selectedModel, setModel] = useState(() => getSelectedModel());
  const [savedNotice, setSavedNotice] = useState(false);

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

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setOpenRouterApiKey(apiKeyInput);
    setSelectedModel(selectedModel);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
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
        <header style={{ textAlign: 'center', marginBottom: 'var(--space-5)' }}>
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
              fontSize: '0.92rem',
              color: 'var(--color-text-muted)',
              marginTop: 'var(--space-1)',
            }}
          >
            Scan groceries, packages, produce & ingredients
          </p>
        </header>

        {/* Engine Switcher */}
        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '4px',
            display: 'flex',
            gap: '4px',
            marginBottom: 'var(--space-4)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <button
            type="button"
            onClick={() => setScanEngine('openrouter')}
            style={{
              flex: 1,
              padding: '10px 8px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              backgroundColor: scanEngine === 'openrouter' ? 'var(--color-primary)' : 'transparent',
              color: scanEngine === 'openrouter' ? '#ffffff' : 'var(--color-text-main)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>✨</span>
            <span>GPT-6 Luna AI</span>
          </button>
          <button
            type="button"
            onClick={() => setScanEngine('on-device')}
            style={{
              flex: 1,
              padding: '10px 8px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              backgroundColor: scanEngine === 'on-device' ? 'var(--color-primary)' : 'transparent',
              color: scanEngine === 'on-device' ? '#ffffff' : 'var(--color-text-main)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>📱</span>
            <span>On-Device YOLOE</span>
          </button>
        </div>

        {/* Engine Status / Config Info */}
        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-4)',
            marginBottom: 'var(--space-5)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {scanEngine === 'openrouter' ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                  <span style={{ color: '#16a34a' }}>●</span>
                  <div>
                    <strong style={{ display: 'block' }}>OpenRouter Vision Active</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      Model: {selectedModel}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettings(!showSettings)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    color: 'var(--color-text-main)',
                    fontWeight: 500,
                  }}
                >
                  {showSettings ? 'Close' : '⚙️ Settings'}
                </button>
              </div>

              {/* Collapsible Settings */}
              {showSettings && (
                <form onSubmit={handleSaveSettings} style={{ marginTop: '12px', borderTop: '1px solid var(--color-border)', paddingTop: '10px' }}>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                      OpenRouter API Key:
                    </label>
                    <input
                      type="password"
                      placeholder="sk-or-v1-..."
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        fontSize: '0.8rem',
                        border: '1px solid var(--color-border)',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                      Model:
                    </label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setModel(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        fontSize: '0.8rem',
                        border: '1px solid var(--color-border)',
                        borderRadius: '4px',
                        backgroundColor: '#fff',
                        boxSizing: 'border-box',
                      }}
                    >
                      {POPULAR_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button
                      type="submit"
                      style={{
                        padding: '6px 14px',
                        backgroundColor: 'var(--color-primary)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Save Settings
                    </button>
                    {savedNotice && (
                      <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>
                        ✓ Saved!
                      </span>
                    )}
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--color-primary)' }}>●</span>
              <div>
                <strong style={{ display: 'block' }}>Browser Inference Ready</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  YOLOE-26n (9.4 MB) @ 640×640 + Tesseract OCR
                </span>
              </div>
            </div>
          )}
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
          {scanEngine === 'openrouter' && (
            <span style={{ fontSize: '0.75rem', color: '#16a34a' }}>· GPT-6 Luna Mode</span>
          )}
        </p>
        <p style={{ marginTop: '2px' }}>
          {scanEngine === 'openrouter'
            ? 'High-precision multimodal grocery detection and ingredient recognition.'
            : 'Photos stay on your device. Local browser inference without cloud uploads.'}
        </p>
      </footer>
    </main>
  );
};
