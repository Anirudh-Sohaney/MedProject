import {
  OcrResult,
  PipelineEvent,
  PipelineStage,
  PipelineTimings,
  ProductMatch,
  ScanInput,
} from '@/types/contracts';
import { getCatalog } from '@/catalog/loadCatalog';
import { loadDetector } from './detector';
import { cropRegion, makeThumbUrl } from './imageUtils';
import { groupMatches, matchDetection } from './matcher';
import { readLabels } from './ocr';

export interface PipelineOptions {
  modelUrl?: string;
  metaUrl?: string;
  ocrBudget?: { maxCrops: number; maxMs: number };
}

/**
 * Runs the end-to-end on-device grocery scanning pipeline.
 * Emits strictly typed events: loading-model -> detecting -> detected -> reading-label
 * -> ocr-start / ocr-end -> identified -> matching -> done | error.
 */
export async function runPipeline(
  input: ScanInput,
  emit: (event: PipelineEvent) => void,
  options?: PipelineOptions
): Promise<void> {
  let currentStage: PipelineStage = 'loading-model';
  const pipelineStartTime = Date.now();
  let modelLoadMs: number | null = null;
  let detectMs = 0;
  let ocrMs = 0;
  let matchMs = 0;
  let cold = false;

  try {
    // 1. Model Loading / Download Stage
    currentStage = 'loading-model';
    emit({ type: 'stage', stage: currentStage, message: 'Loading YOLOE model...' });

    const loadStart = Date.now();
    const detector = await loadDetector({
      modelUrl: options?.modelUrl,
      metaUrl: options?.metaUrl,
      onProgress: (pct) => {
        if (pct < 100) {
          emit({
            type: 'stage',
            stage: 'downloading-model',
            message: `Downloading model: ${pct}%`,
            progress: pct,
          });
        }
      },
    });

    if (!detector.isWarm) {
      cold = true;
      modelLoadMs = Date.now() - loadStart;
    }

    // 2. Detection Stage
    currentStage = 'detecting';
    emit({ type: 'stage', stage: currentStage, message: 'Detecting grocery items...' });

    const detectStart = Date.now();
    const { detections, omitted } = await detector.predict(
      input.detectorCanvas,
      input.width,
      input.height
    );
    detectMs = Date.now() - detectStart;

    emit({
      type: 'detected',
      detections,
      omitted,
      elapsedMs: detectMs,
    });

    const catalog = getCatalog();
    const currentMatches = new Map<string, ProductMatch>();
    const thumbnails = new Map<string, string>();

    // Generate thumbnails and provisional matches immediately
    for (const det of detections) {
      const crop = cropRegion(input.fullResCanvas, det.box);
      const thumb = makeThumbUrl(crop);
      thumbnails.set(det.id, thumb);

      // Initial provisional match (classifier-only)
      const provMatch = matchDetection(det, null, catalog);
      provMatch.cropThumbUrl = thumb;
      provMatch.status = 'provisional';
      currentMatches.set(det.id, provMatch);

      emit({
        type: 'identified',
        match: provMatch,
      });
    }

    // 3. OCR Reading Stage
    currentStage = 'reading-label';
    emit({ type: 'stage', stage: currentStage, message: 'Reading package labels...' });

    const ocrStartTime = Date.now();
    const ocrGenerator = readLabels(detections, input.fullResCanvas, options?.ocrBudget);

    for await (const ocrEvt of ocrGenerator) {
      if (ocrEvt.type === 'ocr-start') {
        emit({
          type: 'ocr-start',
          detectionId: ocrEvt.detectionId,
          index: ocrEvt.index || 1,
          total: ocrEvt.total || 1,
        });
        emit({
          type: 'stage',
          stage: 'reading-label',
          message: `Reading label ${ocrEvt.index}/${ocrEvt.total}...`,
        });
      } else if (ocrEvt.type === 'ocr-end') {
        const ocrResult: OcrResult | null = ocrEvt.result || null;
        emit({
          type: 'ocr-end',
          detectionId: ocrEvt.detectionId,
          result: ocrResult,
        });

        // Refine match with OCR result
        const det = detections.find((d) => d.id === ocrEvt.detectionId);
        if (det) {
          const refinedMatch = matchDetection(det, ocrResult, catalog);
          refinedMatch.cropThumbUrl = thumbnails.get(det.id) || '';
          refinedMatch.status = refinedMatch.displayName === 'Unidentified item' ? 'unknown' : 'identified';
          currentMatches.set(det.id, refinedMatch);

          emit({
            type: 'identified',
            match: refinedMatch,
          });
        }
      }
    }
    ocrMs = Date.now() - ocrStartTime;

    // 4. Final Matching & Grouping Stage
    currentStage = 'matching';
    emit({ type: 'stage', stage: currentStage, message: 'Finalizing item matches...' });

    const matchStart = Date.now();
    const allMatchesList = Array.from(currentMatches.values());
    const grouped = groupMatches(allMatchesList);
    matchMs = Date.now() - matchStart;

    const totalMs = Date.now() - pipelineStartTime;
    const timings: PipelineTimings = {
      modelLoadMs,
      detectMs,
      ocrMs,
      matchMs,
      totalMs,
      cold,
    };

    currentStage = 'finished';
    emit({ type: 'stage', stage: currentStage, message: 'Scan finished.' });
    emit({
      type: 'done',
      matches: grouped,
      timings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    emit({
      type: 'error',
      stage: currentStage,
      message,
      recoverable: currentStage === 'loading-model' || currentStage === 'reading-label',
    });
  }
}
