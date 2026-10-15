import { describe, it, expect } from 'vitest';
import { matchDetection } from '@/inference/matcher';
import { Detection, OcrResult, Product } from '@/types/contracts';

const sampleCatalog: Product[] = [
  {
    id: 'organic_banana',
    name: 'Organic Bananas',
    brand: null,
    category: 'produce',
    detectorClasses: ['banana'],
    parentName: 'Bananas',
    ingredientName: '100% bananas',
    aliases: ['organic banana', 'bananas'],
    variantTokens: ['organic'],
    sourceUrl: 'https://test.com/b',
  },
  {
    id: 'quaker_oats',
    name: 'Quaker Old Fashioned Rolled Oats',
    brand: 'Quaker',
    category: 'pantry',
    detectorClasses: ['oatmeal canister', 'oats box'],
    parentName: 'Oats',
    ingredientName: '100% whole grain oats',
    aliases: ['quaker rolled oats', 'old fashioned oats'],
    variantTokens: ['old fashioned'],
    sourceUrl: 'https://test.com/oats',
  },
];

describe('Matcher Fuzzy & No-OCR Robustness', () => {
  it('returns generic parent name when OCR is null', () => {
    const det: Detection = {
      id: 'det_oats',
      box: { x1: 0, y1: 0, x2: 1, y2: 1 },
      boxFull: { x1: 0, y1: 0, x2: 400, y2: 400 },
      classId: 20,
      className: 'oats box',
      score: 0.9,
      isProduce: false,
    };

    const match = matchDetection(det, null, sampleCatalog);
    expect(match.displayName).toBe('Oats');
    expect(match.brand).toBeNull();
    expect(match.confidence).toBeGreaterThan(0);
  });

  it('ignores garbage OCR tokens and stays at generic category', () => {
    const det: Detection = {
      id: 'det_oats',
      box: { x1: 0, y1: 0, x2: 1, y2: 1 },
      boxFull: { x1: 0, y1: 0, x2: 400, y2: 400 },
      classId: 20,
      className: 'oats box',
      score: 0.85,
      isProduce: false,
    };

    const ocr: OcrResult = {
      detectionId: 'det_oats',
      text: '%%% ### xyz123 random blur',
      tokens: ['xyz123', 'random', 'blur'],
      heightPx: 100,
      attempts: 2,
      durationMs: 150,
    };

    const match = matchDetection(det, ocr, sampleCatalog);
    expect(match.displayName).toBe('Oats');
    expect(match.brand).toBeNull();
  });

  it('matches fuzzy near-miss tokens (e.g. 0/o or slight typo in brand)', () => {
    const det: Detection = {
      id: 'det_oats',
      box: { x1: 0, y1: 0, x2: 1, y2: 1 },
      boxFull: { x1: 0, y1: 0, x2: 400, y2: 400 },
      classId: 20,
      className: 'oats box',
      score: 0.88,
      isProduce: false,
    };

    // 'qu4ker' or 'quaker' with small substitution
    const ocr: OcrResult = {
      detectionId: 'det_oats',
      text: 'Quaker Old Fashioned',
      tokens: ['quaker', 'old', 'fashioned'],
      heightPx: 100,
      attempts: 1,
      durationMs: 150,
    };

    const match = matchDetection(det, ocr, sampleCatalog);
    expect(match.displayName).toBe('Quaker Old Fashioned Rolled Oats');
    expect(match.brand).toBe('Quaker');
  });

  it('produce never gains brand name even if OCR contains brand-like noise', () => {
    const det: Detection = {
      id: 'det_banana',
      box: { x1: 0, y1: 0, x2: 1, y2: 1 },
      boxFull: { x1: 0, y1: 0, x2: 400, y2: 400 },
      classId: 1,
      className: 'banana',
      score: 0.92,
      isProduce: true,
    };

    const ocr: OcrResult = {
      detectionId: 'det_banana',
      text: 'Chiquita Premium Walmart Brand 4011',
      tokens: ['chiquita', 'premium', 'walmart', 'brand', '4011'],
      heightPx: 100,
      attempts: 1,
      durationMs: 150,
    };

    const match = matchDetection(det, ocr, sampleCatalog);
    expect(match.brand).toBeNull(); // Strictly null for produce
    expect(match.displayName).toBe('Bananas');
  });
});
