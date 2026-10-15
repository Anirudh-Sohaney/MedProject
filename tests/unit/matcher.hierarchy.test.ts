import { describe, it, expect } from 'vitest';
import { matchDetection } from '@/inference/matcher';
import { Detection, OcrResult, Product } from '@/types/contracts';

const mockCatalog: Product[] = [
  {
    id: 'gv_milk_2',
    name: 'Great Value 2% Reduced Fat Milk',
    brand: 'Great Value',
    category: 'dairy',
    detectorClasses: ['milk jug', 'milk carton'],
    parentName: 'Milk',
    ingredientName: 'Reduced fat milk, Vitamin A palmitate, Vitamin D3',
    aliases: ['great value 2% milk', '2% milk', 'great value milk'],
    variantTokens: ['2%', 'reduced fat'],
    sourceUrl: 'https://walmart.com/test1',
  },
  {
    id: 'gv_milk_whole',
    name: 'Great Value Whole Vitamin D Milk',
    brand: 'Great Value',
    category: 'dairy',
    detectorClasses: ['milk jug', 'milk carton'],
    parentName: 'Milk',
    ingredientName: 'Whole milk, Vitamin D3',
    aliases: ['great value whole milk', 'whole milk', 'vitamin d milk'],
    variantTokens: ['whole', 'vitamin d'],
    sourceUrl: 'https://walmart.com/test2',
  },
];

const baseDetection: Detection = {
  id: 'det_1',
  box: { x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.8 },
  boxFull: { x1: 100, y1: 100, x2: 500, y2: 800 },
  classId: 16,
  className: 'milk jug',
  score: 0.85,
  isProduce: false,
};

describe('Matcher Hierarchy Resolution', () => {
  it('resolves exact product when both brand and variant are present in OCR', () => {
    const ocr: OcrResult = {
      detectionId: 'det_1',
      text: 'Great Value 2% Reduced Fat Milk',
      tokens: ['great', 'value', '2%', 'reduced', 'fat', 'milk'],
      heightPx: 140,
      attempts: 1,
      durationMs: 250,
    };

    const match = matchDetection(baseDetection, ocr, mockCatalog);
    expect(match.displayName).toBe('Great Value 2% Reduced Fat Milk');
    expect(match.brand).toBe('Great Value');
    expect(match.variant).toBe('2%, reduced fat');
    expect(match.productId).toBe('gv_milk_2');
    expect(match.confidence).toBeGreaterThanOrEqual(70);
  });

  it('resolves brand generic when brand is present but variant is missing', () => {
    const ocr: OcrResult = {
      detectionId: 'det_1',
      text: 'Great Value Grade A Milk',
      tokens: ['great', 'value', 'grade', 'a', 'milk'],
      heightPx: 140,
      attempts: 1,
      durationMs: 200,
    };

    const match = matchDetection(baseDetection, ocr, mockCatalog);
    expect(match.displayName).toBe('Great Value Milk');
    expect(match.brand).toBe('Great Value');
    expect(match.variant).toBeNull();
    expect(match.productId).toBeNull();
  });

  it('resolves category parent name when no brand matches in OCR', () => {
    const ocr: OcrResult = {
      detectionId: 'det_1',
      text: 'Pasteurized Homogenized Dairy Milk',
      tokens: ['pasteurized', 'homogenized', 'dairy', 'milk'],
      heightPx: 140,
      attempts: 1,
      durationMs: 210,
    };

    const match = matchDetection(baseDetection, ocr, mockCatalog);
    expect(match.displayName).toBe('Milk');
    expect(match.brand).toBeNull();
    expect(match.variant).toBeNull();
  });

  it('falls back to category parent name when OCR is null', () => {
    const match = matchDetection(baseDetection, null, mockCatalog);
    expect(match.displayName).toBe('Milk');
    expect(match.brand).toBeNull();
    expect(match.variant).toBeNull();
  });

  it('returns Unidentified item when detector class has no candidates in catalog', () => {
    const unmappedDet: Detection = {
      ...baseDetection,
      className: 'unknown_spaceship_carton',
      classId: 999,
    };

    const match = matchDetection(unmappedDet, null, mockCatalog);
    expect(match.displayName).toBe('Unidentified item');
    expect(match.status).toBe('unknown');
  });
});
