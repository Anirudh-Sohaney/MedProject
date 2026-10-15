import { describe, it, expect } from 'vitest';
import { matchDetection } from '@/inference/matcher';
import { Detection, OcrResult, Product } from '@/types/contracts';

const milkCatalog: Product[] = [
  {
    id: 'gv_milk_2pct',
    name: 'Great Value 2% Reduced Fat Milk',
    brand: 'Great Value',
    category: 'dairy',
    detectorClasses: ['milk jug', 'milk carton'],
    parentName: 'Milk',
    ingredientName: null,
    aliases: ['great value 2% milk', '2% reduced fat milk'],
    variantTokens: ['2%', 'reduced fat'],
    sourceUrl: 'https://walmart.com/milk2',
  },
  {
    id: 'gv_milk_whole',
    name: 'Great Value Whole Vitamin D Milk',
    brand: 'Great Value',
    category: 'dairy',
    detectorClasses: ['milk jug', 'milk carton'],
    parentName: 'Milk',
    ingredientName: null,
    aliases: ['great value whole milk', 'whole milk'],
    variantTokens: ['whole', 'vitamin d'],
    sourceUrl: 'https://walmart.com/milkwhole',
  },
];

const jugDetection: Detection = {
  id: 'det_jug',
  box: { x1: 0.1, y1: 0.1, x2: 0.6, y2: 0.9 },
  boxFull: { x1: 100, y1: 100, x2: 600, y2: 900 },
  classId: 16,
  className: 'milk jug',
  score: 0.88,
  isProduce: false,
};

describe('Milk Variant Discrimination & Conflict Handling', () => {
  it('correctly matches 2% milk when discriminating tokens are present', () => {
    const ocr: OcrResult = {
      detectionId: 'det_jug',
      text: 'Great Value 2% Milk',
      tokens: ['great', 'value', '2%', 'milk'],
      heightPx: 120,
      attempts: 1,
      durationMs: 150,
    };

    const match = matchDetection(jugDetection, ocr, milkCatalog);
    expect(match.displayName).toBe('Great Value 2% Reduced Fat Milk');
    expect(match.brand).toBe('Great Value');
    expect(match.variant).toContain('2%');
  });

  it('falls back to brand generic when variant is absent', () => {
    const ocr: OcrResult = {
      detectionId: 'det_jug',
      text: 'Great Value Milk Jug',
      tokens: ['great', 'value', 'milk', 'jug'],
      heightPx: 120,
      attempts: 1,
      durationMs: 150,
    };

    const match = matchDetection(jugDetection, ocr, milkCatalog);
    expect(match.displayName).toBe('Great Value Milk');
    expect(match.brand).toBe('Great Value');
    expect(match.variant).toBeNull();
  });

  it('collapses to parent Milk when whole and 2% tokens conflict on the same label', () => {
    const ocr: OcrResult = {
      detectionId: 'det_jug',
      text: 'Great Value Whole 2% Milk Jug',
      tokens: ['great', 'value', 'whole', '2%', 'milk', 'jug'],
      heightPx: 120,
      attempts: 1,
      durationMs: 180,
    };

    const match = matchDetection(jugDetection, ocr, milkCatalog);
    // Never guess specificity when OCR contradicts itself: collapses to parent or brand generic
    expect(match.displayName).toMatch(/Great Value Milk|Milk/);
    expect(match.variant).toBeNull();
  });

  it('falls back to generic category when no brand tokens appear in OCR', () => {
    const ocr: OcrResult = {
      detectionId: 'det_jug',
      text: 'Fresh Farm Grade A Pasteurized',
      tokens: ['fresh', 'farm', 'grade', 'a', 'pasteurized'],
      heightPx: 120,
      attempts: 1,
      durationMs: 150,
    };

    const match = matchDetection(jugDetection, ocr, milkCatalog);
    expect(match.displayName).toBe('Milk');
    expect(match.brand).toBeNull();
  });
});
