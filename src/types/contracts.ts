/**
 * Shared Typed Contracts — Single source of truth for on-device inference and UI.
 * Pure interfaces: no dependencies on React or DOM elements where possible.
 */

export interface BoxCoords {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Detection {
  id: string;
  box: BoxCoords; // normalized 0–1 relative to detector canvas
  boxFull: BoxCoords; // pixel coordinates scaled to full-res OCR image
  classId: number;
  className: string; // PROMPTS label
  score: number; // 0–1 detector confidence
  isProduce: boolean;
}

export interface OcrResult {
  detectionId: string;
  text: string; // raw OCR string
  tokens: string[]; // normalized lowercase tokens
  heightPx: number; // crop height on full-res image
  attempts: number; // count of preprocessing attempts used
  durationMs: number;
}

export interface Product {
  id: string;
  name: string;
  brand: string | null;
  category: 'produce' | 'dairy' | 'pantry' | 'frozen' | 'bakery' | 'beverage' | 'snack' | 'other';
  detectorClasses: string[];
  parentName: string;
  ingredientName: string | null;
  aliases: string[];
  variantTokens: string[];
  sourceUrl: string;
  image?: string;
}

export interface ProductCandidate {
  product: Product;
  tokenScore: number; // 0–1 token overlap / similarity
  variantEvidence: string[]; // matched variant tokens
  brandEvidence: string | null;
}

export interface ProductMatch {
  detectionId: string;
  displayName: string; // hierarchy-resolved display name or "Unidentified item"
  productId: string | null;
  brand: string | null;
  variant: string | null;
  category: string | null;
  ingredient: string | null;
  confidence: number; // 0–100 integer estimated confidence
  detectorScore: number; // 0–1
  ocrMatch: number; // 0–1
  candidateMargin: number; // 0–1
  cropThumbUrl: string; // object URL or data URL
  status: 'provisional' | 'ocr-pending' | 'identified' | 'unknown';
  count?: number; // distinct physical boxes after grouping
  box: BoxCoords;
}

export type PipelineStage =
  | 'loading-model'
  | 'downloading-model'
  | 'detecting'
  | 'reading-label'
  | 'matching'
  | 'finished'
  | 'error';

export interface PipelineTimings {
  modelLoadMs: number | null; // null on warm cache hit
  detectMs: number;
  ocrMs: number; // total OCR budget used
  matchMs: number;
  totalMs: number;
  cold: boolean;
}

export type PipelineEvent =
  | { type: 'stage'; stage: PipelineStage; message?: string; progress?: number }
  | { type: 'detected'; detections: Detection[]; omitted: number; elapsedMs: number }
  | { type: 'ocr-start'; detectionId: string; index: number; total: number }
  | { type: 'ocr-end'; detectionId: string; result: OcrResult | null }
  | { type: 'identified'; match: ProductMatch }
  | { type: 'done'; matches: ProductMatch[]; timings: PipelineTimings }
  | { type: 'error'; stage: PipelineStage; message: string; recoverable: boolean };

export interface ScanInput {
  detectorCanvas: HTMLCanvasElement;
  fullResCanvas: HTMLCanvasElement;
  objectUrl: string;
  width: number;
  height: number;
}
