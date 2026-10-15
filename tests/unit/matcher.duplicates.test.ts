import { describe, it, expect } from 'vitest';
import { groupMatches } from '@/inference/matcher';
import { ProductMatch } from '@/types/contracts';

describe('Matcher Duplicate Grouping and Counting', () => {
  it('groups multiple distinct boxes of the same product into one card with accurate count', () => {
    const matches: ProductMatch[] = [
      {
        detectionId: 'det_1',
        displayName: 'Great Value 2% Reduced Fat Milk',
        productId: 'gv_milk_2',
        brand: 'Great Value',
        variant: '2%',
        category: 'dairy',
        ingredient: null,
        confidence: 82,
        detectorScore: 0.85,
        ocrMatch: 0.8,
        candidateMargin: 0.5,
        cropThumbUrl: 'thumb1',
        status: 'identified',
        box: { x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.8 },
      },
      {
        detectionId: 'det_2',
        displayName: 'Great Value 2% Reduced Fat Milk',
        productId: 'gv_milk_2',
        brand: 'Great Value',
        variant: '2%',
        category: 'dairy',
        ingredient: null,
        confidence: 89,
        detectorScore: 0.91,
        ocrMatch: 0.85,
        candidateMargin: 0.6,
        cropThumbUrl: 'thumb2',
        status: 'identified',
        box: { x1: 0.5, y1: 0.1, x2: 0.85, y2: 0.8 },
      },
    ];

    const grouped = groupMatches(matches);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].count).toBe(2);
    expect(grouped[0].confidence).toBe(89); // retains highest confidence
    expect(grouped[0].displayName).toBe('Great Value 2% Reduced Fat Milk');
  });

  it('preserves distinct products as separate cards', () => {
    const matches: ProductMatch[] = [
      {
        detectionId: 'det_apple',
        displayName: 'Apples',
        productId: 'prod_apple',
        brand: null,
        variant: null,
        category: 'produce',
        ingredient: null,
        confidence: 90,
        detectorScore: 0.9,
        ocrMatch: 0,
        candidateMargin: 0.8,
        cropThumbUrl: 'thumb_a',
        status: 'identified',
        box: { x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.3 },
      },
      {
        detectionId: 'det_banana',
        displayName: 'Bananas',
        productId: 'prod_banana',
        brand: null,
        variant: null,
        category: 'produce',
        ingredient: null,
        confidence: 95,
        detectorScore: 0.95,
        ocrMatch: 0,
        candidateMargin: 0.8,
        cropThumbUrl: 'thumb_b',
        status: 'identified',
        box: { x1: 0.4, y1: 0.1, x2: 0.7, y2: 0.4 },
      },
    ];

    const grouped = groupMatches(matches);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].displayName).toBe('Bananas'); // sorted by confidence desc (95 > 90)
    expect(grouped[1].displayName).toBe('Apples');
    expect(grouped[0].count).toBe(1);
    expect(grouped[1].count).toBe(1);
  });
});
