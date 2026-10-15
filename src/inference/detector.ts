import { YOLO, Results as YoloResults } from '@ultralytics/yolo';
import { BoxCoords, Detection } from '@/types/contracts';

export interface DetectorMetadata {
  modelName: string;
  inputSize: number;
  classes?: string[] | number;
  produceClasses?: string[];
  labelMapIndex?: Record<string, string>;
  exportMode?: string;
}

export const COCO_CLASSES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
  'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
  'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
  'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop',
  'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
  'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier',
  'toothbrush'
];

export interface LoadedDetector {
  predict: (
    canvas: HTMLCanvasElement,
    fullWidth: number,
    fullHeight: number
  ) => Promise<{ detections: Detection[]; omitted: number }>;
  metadata: DetectorMetadata;
  isWarm: boolean;
}

export const PRODUCE_SET = new Set([
  'apple',
  'banana',
  'orange',
  'lemon',
  'lime',
  'avocado',
  'tomato',
  'potato',
  'onion',
  'carrot',
  'bell pepper',
  'cucumber',
  'grapes',
  'strawberry',
  'broccoli',
  'lettuce',
]);

/**
 * Calculates Intersection over Union (IoU) of two boxes in normalized coordinates.
 */
export function computeIoU(a: BoxCoords, b: BoxCoords): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

/**
 * Pure NMS / Dedupe function.
 * Removes duplicate overlapping boxes (same class, IoU >= iouThreshold),
 * but preserves adjacent distinct items (even of same class).
 */
export function nmsDedupeDetections(
  raw: Detection[],
  iouThreshold = 0.65,
  maxDetections = 20
): { detections: Detection[]; omitted: number } {
  // Discard scores < 0.15
  const valid = raw.filter((d) => d.score >= 0.15);
  valid.sort((a, b) => b.score - a.score);

  const kept: Detection[] = [];

  for (const candidate of valid) {
    let duplicate = false;
    for (const existing of kept) {
      // Deduplicate only if same class AND high IoU overlap
      if (candidate.className === existing.className) {
        const iou = computeIoU(candidate.box, existing.box);
        if (iou >= iouThreshold) {
          duplicate = true;
          break;
        }
      }
    }
    if (!duplicate) {
      kept.push(candidate);
    }
  }

  const finalDetections = kept.slice(0, maxDetections);
  const omitted = Math.max(0, kept.length - maxDetections);

  return {
    detections: finalDetections,
    omitted,
  };
}

let cachedDetector: LoadedDetector | null = null;

/**
 * Loads the YOLO grocery detector ONNX model and sidecar metadata.
 * Uses default backend selection with automatic CPU/WASM fallback (never requires WebGPU).
 */
export async function loadDetector(options?: {
  onProgress?: (percent: number) => void;
  modelUrl?: string;
  metaUrl?: string;
}): Promise<LoadedDetector> {
  if (cachedDetector) {
    return { ...cachedDetector, isWarm: true };
  }

  const modelUrl = options?.modelUrl || '/models/grocery_detector.onnx';
  const metaUrl = options?.metaUrl || '/models/grocery_detector.onnx.meta.json';

  // 1. Fetch metadata sidecar
  let meta: DetectorMetadata;
  try {
    const metaResp = await fetch(metaUrl);
    if (!metaResp.ok) throw new Error(`HTTP ${metaResp.status} fetching model metadata`);
    meta = await metaResp.json();
    if (!meta.labelMapIndex) {
      meta.labelMapIndex = {};
    }
  } catch (err) {
    console.warn('Metadata fetch failed, using built-in defaults:', err);
    meta = {
      modelName: 'grocery_detector.onnx',
      inputSize: 640,
      classes: COCO_CLASSES,
      produceClasses: Array.from(PRODUCE_SET),
      labelMapIndex: {},
      exportMode: 'detection',
    };
  }

  // 2. Fetch model with progress if onProgress provided
  if (options?.onProgress) {
    try {
      const resp = await fetch(modelUrl);
      const contentLength = resp.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;

      if (resp.body && total > 0) {
        const reader = resp.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          loaded += value.byteLength;
          options.onProgress(Math.min(100, Math.round((loaded / total) * 100)));
        }
      } else {
        options.onProgress(100);
      }
    } catch (e) {
      console.warn('Progress fetch warning:', e);
    }
  }

  // 3. Initialize Ultralytics YOLO runtime with auto device (WebGPU or CPU/wasm)
  const yolo = await YOLO.load(modelUrl, {
    device: 'auto',
  });

  const predict = async (
    canvas: HTMLCanvasElement,
    fullWidth: number,
    fullHeight: number
  ): Promise<{ detections: Detection[]; omitted: number }> => {
    // Run prediction at conf: 0.20, iou: 0.55
    const results: YoloResults = await yolo.predict(canvas, {
      conf: 0.20,
      iou: 0.55,
    });

    const rawDetections: Detection[] = [];
    const boxes = results.boxes || [];

    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      // b.x1, b.y1, b.x2, b.y2 in canvas pixel space
      const cw = canvas.width || 416;
      const ch = canvas.height || 416;

      const normBox: BoxCoords = {
        x1: Math.max(0, Math.min(1, b.x1 / cw)),
        y1: Math.max(0, Math.min(1, b.y1 / ch)),
        x2: Math.max(0, Math.min(1, b.x2 / cw)),
        y2: Math.max(0, Math.min(1, b.y2 / ch)),
      };

      const fullBox: BoxCoords = {
        x1: Math.round(normBox.x1 * fullWidth),
        y1: Math.round(normBox.y1 * fullHeight),
        x2: Math.round(normBox.x2 * fullWidth),
        y2: Math.round(normBox.y2 * fullHeight),
      };

      // Get label name from meta or results safely
      const className =
        b.name ||
        (Array.isArray(meta.classes) ? meta.classes[b.cls] : undefined) ||
        meta.labelMapIndex?.[String(b.cls)] ||
        COCO_CLASSES[b.cls] ||
        `item_${b.cls}`;

      const isProduce = PRODUCE_SET.has(className.toLowerCase());

      rawDetections.push({
        id: `det_${i}_${Date.now()}`,
        box: normBox,
        boxFull: fullBox,
        classId: b.cls,
        className,
        score: b.conf,
        isProduce,
      });
    }

    // Apply NMS and limit to top 20
    return nmsDedupeDetections(rawDetections, 0.65, 20);
  };

  cachedDetector = {
    predict,
    metadata: meta,
    isWarm: false,
  };

  return cachedDetector;
}
