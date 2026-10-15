import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  Detection,
  PipelineEvent,
  PipelineStage,
  PipelineTimings,
  Product,
  ProductMatch,
  ScanInput,
} from '@/types/contracts';
import { decodeFileToCanvas, downscaleForDetector } from '@/inference/imageUtils';
import { runPipeline } from '@/inference/pipeline';
import { runOpenRouterPipeline } from '@/inference/openrouter';
import { terminateOcrWorker } from '@/inference/ocr';

export interface SourceImageState {
  objectUrl: string;
  width: number;
  height: number;
  fullResCanvas: HTMLCanvasElement;
  detectorCanvas: HTMLCanvasElement;
}

interface ScanContextValue {
  sourceImage: SourceImageState | null;
  detections: Detection[];
  matches: ProductMatch[];
  stage: PipelineStage;
  stageMessage: string;
  stageProgress?: number;
  timings: PipelineTimings | null;
  omittedCount: number;
  error: { message: string; recoverable: boolean } | null;
  modelReady: boolean;
  scanEngine: 'openrouter' | 'on-device';
  setScanEngine: (engine: 'openrouter' | 'on-device') => void;
  setSourceFromFile: (file: File) => Promise<void>;
  startScan: () => Promise<void>;
  reset: () => void;
  manualCorrect: (detectionId: string, product: Product) => void;
}

const ScanContext = createContext<ScanContextValue | null>(null);

export const ScanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sourceImage, setSourceImage] = useState<SourceImageState | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [matches, setMatches] = useState<ProductMatch[]>([]);
  const [stage, setStage] = useState<PipelineStage>('loading-model');
  const [stageMessage, setStageMessage] = useState<string>('');
  const [stageProgress, setStageProgress] = useState<number | undefined>(undefined);
  const [timings, setTimings] = useState<PipelineTimings | null>(null);
  const [omittedCount, setOmittedCount] = useState<number>(0);
  const [error, setError] = useState<{ message: string; recoverable: boolean } | null>(null);
  const [modelReady, setModelReady] = useState<boolean>(false);
  const [scanEngine, setScanEngineState] = useState<'openrouter' | 'on-device'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('scan_engine') : null;
    return saved === 'on-device' ? 'on-device' : 'openrouter';
  });

  const setScanEngine = useCallback((eng: 'openrouter' | 'on-device') => {
    setScanEngineState(eng);
    if (typeof window !== 'undefined') {
      localStorage.setItem('scan_engine', eng);
    }
  }, []);

  const activeObjectUrls = useRef<Set<string>>(new Set());

  const revokeAllUrls = useCallback(() => {
    activeObjectUrls.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    });
    activeObjectUrls.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      revokeAllUrls();
      terminateOcrWorker();
    };
  }, [revokeAllUrls]);

  const reset = useCallback(() => {
    revokeAllUrls();
    setSourceImage(null);
    setDetections([]);
    setMatches([]);
    setStage('loading-model');
    setStageMessage('');
    setStageProgress(undefined);
    setTimings(null);
    setOmittedCount(0);
    setError(null);
  }, [revokeAllUrls]);

  const setSourceFromFile = useCallback(
    async (file: File) => {
      reset();
      const objectUrl = URL.createObjectURL(file);
      activeObjectUrls.current.add(objectUrl);

      try {
        const fullResCanvas = await decodeFileToCanvas(file);
        const detectorCanvas = downscaleForDetector(fullResCanvas, 1280);

        setSourceImage({
          objectUrl,
          width: fullResCanvas.width,
          height: fullResCanvas.height,
          fullResCanvas,
          detectorCanvas,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to decode image';
        setError({ message: msg, recoverable: false });
      }
    },
    [reset]
  );

  const handlePipelineEvent = useCallback((event: PipelineEvent) => {
    switch (event.type) {
      case 'stage':
        setStage(event.stage);
        if (event.message) setStageMessage(event.message);
        setStageProgress(event.progress);
        if (event.stage === 'detecting' || event.stage === 'finished') {
          setModelReady(true);
        }
        break;

      case 'detected':
        setDetections(event.detections);
        setOmittedCount(event.omitted);
        break;

      case 'identified':
        setMatches((prev) => {
          const index = prev.findIndex((m) => m.detectionId === event.match.detectionId);
          if (index >= 0) {
            const next = [...prev];
            next[index] = event.match;
            return next;
          }
          return [...prev, event.match];
        });
        break;

      case 'done':
        setMatches(event.matches);
        setTimings(event.timings);
        setStage('finished');
        setStageMessage('Finished');
        break;

      case 'error':
        setStage(event.stage);
        setError({ message: event.message, recoverable: event.recoverable });
        break;
    }
  }, []);

  const startScan = useCallback(async () => {
    if (!sourceImage) return;

    setError(null);
    setMatches([]);
    setDetections([]);
    setTimings(null);

    const input: ScanInput = {
      detectorCanvas: sourceImage.detectorCanvas,
      fullResCanvas: sourceImage.fullResCanvas,
      objectUrl: sourceImage.objectUrl,
      width: sourceImage.width,
      height: sourceImage.height,
    };

    if (scanEngine === 'openrouter') {
      await runOpenRouterPipeline(input, handlePipelineEvent);
    } else {
      await runPipeline(input, handlePipelineEvent);
    }
  }, [sourceImage, handlePipelineEvent, scanEngine]);

  const manualCorrect = useCallback((detectionId: string, product: Product) => {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.detectionId === detectionId) {
          return {
            ...m,
            displayName: product.name,
            productId: product.id,
            brand: product.brand,
            variant: product.variantTokens.length ? product.variantTokens.join(', ') : null,
            category: product.category,
            ingredient: product.ingredientName,
            confidence: 100, // Manual correction confirms 100%
            status: 'identified',
          };
        }
        return m;
      })
    );
  }, []);

  return (
    <ScanContext.Provider
      value={{
        sourceImage,
        detections,
        matches,
        stage,
        stageMessage,
        stageProgress,
        timings,
        omittedCount,
        error,
        modelReady,
        scanEngine,
        setScanEngine,
        setSourceFromFile,
        startScan,
        reset,
        manualCorrect,
      }}
    >
      {children}
    </ScanContext.Provider>
  );
};

export function useScanContext(): ScanContextValue {
  const ctx = useContext(ScanContext);
  if (!ctx) {
    throw new Error('useScanContext must be used within a ScanProvider');
  }
  return ctx;
}
