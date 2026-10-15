import {
  PipelineEvent,
  PipelineStage,
  PipelineTimings,
  ProductMatch,
  ScanInput,
} from '@/types/contracts';
import { loadDetector } from './detector';
import { loadProductClassifier } from './classifier';
import { resolveHierarchy, groupProductMatches } from './hierarchy';
import { cropRegion, makeThumbUrl } from './imageUtils';
import { readLabels } from './ocr';

export interface PipelineOptions {
  detectorModelUrl?: string;
  detectorMetaUrl?: string;
  classifierModelUrl?: string;
  ocrBudget?: { maxCrops: number; maxMs: number };
}

/**
 * Runs the dedicated CV on-device grocery scanning pipeline:
 * Photo -> Object detector -> Crop each detection -> MobileNetV3 classifier -> Hierarchical fallback -> Product grouping -> Results
 *
 * Emits strictly typed events: loading-model -> detecting -> detected -> classifying -> identified -> matching -> finished -> done | error.
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
  let classifyMs = 0;
  let matchMs = 0;
  let cold = false;

  try {
    // 1. Model Loading Stage (Detector + MobileNetV3 Classifier)
    currentStage = 'loading-model';
    emit({ type: 'stage', stage: currentStage, message: 'Loading detector and MobileNetV3 classifier...' });

    const loadStart = Date.now();
    const [detector, classifier] = await Promise.all([
      loadDetector({
        modelUrl: options?.detectorModelUrl,
        metaUrl: options?.detectorMetaUrl,
        onProgress: (pct) => {
          if (pct < 100) {
            emit({
              type: 'stage',
              stage: 'downloading-model',
              message: `Downloading detector: ${pct}%`,
              progress: pct,
            });
          }
        },
      }),
      loadProductClassifier(options?.classifierModelUrl),
    ]);

    if (!detector.isWarm || !classifier.isWarm) {
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

    if (detections.length === 0) {
      // No objects detected
      const totalMs = Date.now() - pipelineStartTime;
      const timings: PipelineTimings = {
        modelLoadMs,
        detectMs,
        classifyMs: 0,
        ocrMs: 0,
        matchMs: 0,
        totalMs,
        cold,
      };
      currentStage = 'finished';
      emit({ type: 'stage', stage: currentStage, message: 'No items detected.' });
      emit({ type: 'done', matches: [], timings });
      return;
    }

    // 3. Cropping & MobileNetV3 Product Classification Stage
    currentStage = 'classifying';
    emit({
      type: 'stage',
      stage: currentStage,
      message: `Classifying ${detections.length} product crops with MobileNetV3...`,
    });

    const classifyStart = Date.now();
    const cropCanvases: HTMLCanvasElement[] = [];
    const thumbnails: string[] = [];

    for (let i = 0; i < detections.length; i++) {
      const det = detections[i];
      const crop = cropRegion(input.fullResCanvas, det.box);
      cropCanvases.push(crop);
      thumbnails.push(makeThumbUrl(crop));
    }

    const classificationResults = await classifier.classifyBatch(cropCanvases);
    classifyMs = Date.now() - classifyStart;

    // 4. Supplementary OCR Reading Stage (Optional text tokens for variety confirmation)
    let ocrMs = 0;
    const ocrTokensMap = new Map<string, string[]>();
    if (options?.ocrBudget !== undefined || detections.some((d) => !d.isProduce)) {
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
        } else if (ocrEvt.type === 'ocr-end') {
          emit({
            type: 'ocr-end',
            detectionId: ocrEvt.detectionId,
            result: ocrEvt.result || null,
          });
          if (ocrEvt.result?.tokens) {
            ocrTokensMap.set(ocrEvt.detectionId, ocrEvt.result.tokens);
          }
        }
      }
      ocrMs = Date.now() - ocrStartTime;
    }

    // 5. Hierarchical Fallback Resolution
    currentStage = 'matching';
    emit({ type: 'stage', stage: currentStage, message: 'Applying product hierarchy & grouping...' });

    const matchStart = Date.now();
    const rawMatches: ProductMatch[] = [];

    for (let i = 0; i < detections.length; i++) {
      const det = detections[i];
      const classification = classificationResults[i];
      const thumb = thumbnails[i];
      const ocrTokens = ocrTokensMap.get(det.id) || [];

      const resolution = resolveHierarchy(classification, det.score, ocrTokens);

      const match: ProductMatch = {
        detectionId: det.id,
        displayName: resolution.displayName,
        productId: resolution.productId,
        brand: resolution.brand,
        variant: resolution.variant,
        category: resolution.category,
        ingredient: resolution.ingredient,
        confidence: resolution.calibratedConfidence,
        detectorScore: Math.round(det.score * 100) / 100,
        ocrMatch: 0,
        candidateMargin: classification.margin,
        classifierScore: classification.top1.score,
        classifierClassId: classification.top1.classId,
        hierarchyLevel: resolution.hierarchyLevel,
        cropThumbUrl: thumb,
        status: resolution.status,
        box: det.box,
      };

      rawMatches.push(match);

      emit({
        type: 'identified',
        match,
      });
    }

    // 5. Product Grouping and Aggregated Item Counting
    const groupedMatches = groupProductMatches(rawMatches);
    matchMs = Date.now() - matchStart;

    const totalMs = Date.now() - pipelineStartTime;
    const timings: PipelineTimings = {
      modelLoadMs,
      detectMs,
      classifyMs,
      ocrMs,
      matchMs,
      totalMs,
      cold,
    };

    currentStage = 'finished';
    emit({ type: 'stage', stage: currentStage, message: 'Scan finished.' });
    emit({
      type: 'done',
      matches: groupedMatches,
      timings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    emit({
      type: 'error',
      stage: currentStage,
      message,
      recoverable: currentStage === 'loading-model',
    });
  }
}
