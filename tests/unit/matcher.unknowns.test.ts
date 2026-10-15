import { describe, it, expect } from 'vitest';
import { matchDetection } from '@/inference/matcher';
import { Detection, Product } from '@/types/contracts';

const emptyCatalog: Product[] = [];

describe('Matcher Unknowns and Species Fallback', () => {
  it('outputs Unidentified item when packaged item class is unknown to catalog', () => {
    const det: Detection = {
      id: 'det_exotic',
      box: { x1: 0.2, y1: 0.2, x2: 0.8, y2: 0.8 },
      boxFull: { x1: 200, y1: 200, x2: 800, y2: 800 },
      classId: 99,
      className: 'exotic_import_container',
      score: 0.65,
      isProduce: false,
    };

    const match = matchDetection(det, null, emptyCatalog);
    expect(match.displayName).toBe('Unidentified item');
    expect(match.status).toBe('unknown');
    expect(match.productId).toBeNull();
  });

  it('produce without catalog entries still outputs species name, never brand', () => {
    const det: Detection = {
      id: 'det_apple',
      box: { x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5 },
      boxFull: { x1: 100, y1: 100, x2: 500, y2: 500 },
      classId: 0,
      className: 'apple',
      score: 0.78,
      isProduce: true,
    };

    const match = matchDetection(det, null, emptyCatalog);
    expect(match.displayName).toBe('Apple');
    expect(match.brand).toBeNull();
    expect(match.category).toBe('produce');
    expect(match.status).toBe('identified');
  });
});
