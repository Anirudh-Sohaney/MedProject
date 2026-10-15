import { createWorker, Worker } from 'tesseract.js';
import { Detection, OcrResult } from '@/types/contracts';
import { cropRegion, enhanceForOcr } from './imageUtils';
import { normalizeOcrText } from './normalize';

let workerInstance: Worker | null = null;
let workerInitPromise: Promise<Worker> | null = null;

/**
 * Returns a lazy singleton English Tesseract worker.
 * Worker is initialized only after detection, not at app boot.
 */
export async function getOcrWorker(): Promise<Worker> {
  if (workerInstance) return workerInstance;
  if (workerInitPromise) return workerInitPromise;

  workerInitPromise = (async () => {
    const worker = await createWorker('eng');
    workerInstance = worker;
    return worker;
  })();

  return workerInitPromise;
}

/**
 * Terminates the OCR worker (e.g. on unmount or retake).
 */
export async function terminateOcrWorker(): Promise<void> {
  if (workerInstance) {
    try {
      await workerInstance.terminate();
    } catch (e) {
      console.warn('Error terminating OCR worker:', e);
    }
    workerInstance = null;
    workerInitPromise = null;
  }
}

export interface OcrBudget {
  maxCrops: number; // default 20 (evaluate all readable packages within time budget)
  maxMs: number; // default 8000 ms (8s)
}

/**
 * Reads text labels from prioritized package crops.
 * Enforces wall-clock budget and skips produce items and unreadable <60px crops.
 */
export async function* readLabels(
  detections: Detection[],
  fullResCanvas: HTMLCanvasElement,
  budget: OcrBudget = { maxCrops: 20, maxMs: 8000 }
): AsyncGenerator<{
  type: 'ocr-start' | 'ocr-end';
  detectionId: string;
  index?: number;
  total?: number;
  result?: OcrResult | null;
}> {
  // Filter out produce
  const packaged = detections.filter((d) => !d.isProduce);
  if (packaged.length === 0) return;

  // Rank crops: largest area first
  packaged.sort((a, b) => {
    const areaA = (a.box.x2 - a.box.x1) * (a.box.y2 - a.box.y1);
    const areaB = (b.box.x2 - b.box.x1) * (b.box.y2 - b.box.y1);
    return areaB - areaA;
  });

  const cropsToProcess = packaged.slice(0, budget.maxCrops);
  const totalCrops = cropsToProcess.length;
  const startTime = Date.now();

  let worker: Worker;
  try {
    worker = await getOcrWorker();
  } catch (err) {
    console.warn('Failed to initialize Tesseract worker:', err);
    for (const det of cropsToProcess) {
      yield { type: 'ocr-end', detectionId: det.id, result: null };
    }
    return;
  }

  for (let i = 0; i < totalCrops; i++) {
    const det = cropsToProcess[i];
    const elapsed = Date.now() - startTime;

    // Budget exceeded: stop immediately without blocking pipeline
    if (elapsed >= budget.maxMs) {
      yield { type: 'ocr-end', detectionId: det.id, result: null };
      continue;
    }

    yield {
      type: 'ocr-start',
      detectionId: det.id,
      index: i + 1,
      total: totalCrops,
    };

    const cropCanvas = cropRegion(fullResCanvas, det.box);
    const cropHeight = cropCanvas.height;

    // Skip labels under 60px height if unreadable
    if (cropHeight < 60) {
      yield {
        type: 'ocr-end',
        detectionId: det.id,
        result: {
          detectionId: det.id,
          text: '',
          tokens: [],
          heightPx: cropHeight,
          attempts: 0,
          durationMs: 0,
        },
      };
      continue;
    }

    const cropStart = Date.now();
    let bestText = '';
    let tokens: string[] = [];
    let attemptsUsed = 0;

    // Try enhancement ladder (1: native/scaled -> 2: grayscale+contrast -> 3: threshold)
    for (let attempt = 1; attempt <= 3; attempt++) {
      attemptsUsed++;
      const enhancedCanvas = enhanceForOcr(cropCanvas, attempt);

      try {
        const ret = await worker.recognize(enhancedCanvas);
        const text = ret.data.text || '';
        const curTokens = normalizeOcrText(text);

        if (curTokens.length > 0) {
          bestText = text;
          tokens = curTokens;
          break; // Stop at first token yield
        }
      } catch (ocrErr) {
        console.warn(`OCR attempt ${attempt} failed:`, ocrErr);
      }

      // Check wall-clock budget between attempts
      if (Date.now() - startTime >= budget.maxMs) {
        break;
      }
    }

    const durationMs = Date.now() - cropStart;

    yield {
      type: 'ocr-end',
      detectionId: det.id,
      result: {
        detectionId: det.id,
        text: bestText,
        tokens,
        heightPx: cropHeight,
        attempts: attemptsUsed,
        durationMs,
      },
    };
  }
}
