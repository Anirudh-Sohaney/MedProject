/**
 * Confidence estimation module for grocery detections.
 * Pure mathematical scoring function, uncalibrated, bounded in [0, 100].
 */

export interface ConfidenceInputs {
  detection: number; // 0–1 detector score
  ocrMatch: number; // 0–1 OCR token agreement
  candidateMargin: number; // 0–1 score gap between top and second-best candidate
  isProduce: boolean;
}

/**
 * Calculates estimated confidence (0–100 integer).
 * Packaged: round(100 * (0.65 * detection + 0.25 * ocrMatch + 0.10 * candidateMargin))
 * Produce: renormalizes weights without OCR: (0.65 / 0.75) * detection + (0.10 / 0.75) * candidateMargin
 */
export function estimateConfidence(inputs: ConfidenceInputs): number {
  const d = Math.max(0, Math.min(1, inputs.detection));
  const m = Math.max(0, Math.min(1, inputs.candidateMargin));
  const o = Math.max(0, Math.min(1, inputs.ocrMatch));

  if (inputs.isProduce) {
    const wDet = 0.65 / 0.75;
    const wMgn = 0.10 / 0.75;
    const score = wDet * d + wMgn * m;
    return Math.max(0, Math.min(100, Math.round(100 * score)));
  }

  const score = 0.65 * d + 0.25 * o + 0.10 * m;
  return Math.max(0, Math.min(100, Math.round(100 * score)));
}

/**
 * Maps integer confidence to qualitative level for mobile UI presentation.
 */
export function getConfidenceTier(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 75) return 'high';
  if (confidence >= 50) return 'medium';
  return 'low';
}
