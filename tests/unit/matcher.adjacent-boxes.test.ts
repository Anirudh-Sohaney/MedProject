import { describe, it, expect } from 'vitest';
import { nmsDedupeDetections } from '@/inference/detector';
import { Detection } from '@/types/contracts';

describe('Adjacent Boxes and Overlap Deduplication', () => {
  it('keeps both adjacent side-by-side distinct items of the same class (low IoU)', () => {
    // Two milk jugs side by side: box1 = [0.1, 0.1, 0.45, 0.8], box2 = [0.46, 0.1, 0.85, 0.8]
    const raw: Detection[] = [
      {
        id: 'jug_left',
        box: { x1: 0.1, y1: 0.1, x2: 0.45, y2: 0.8 },
        boxFull: { x1: 100, y1: 100, x2: 450, y2: 800 },
        classId: 16,
        className: 'milk jug',
        score: 0.88,
        isProduce: false,
      },
      {
        id: 'jug_right',
        box: { x1: 0.46, y1: 0.1, x2: 0.85, y2: 0.8 },
        boxFull: { x1: 460, y1: 100, x2: 850, y2: 800 },
        classId: 16,
        className: 'milk jug',
        score: 0.84,
        isProduce: false,
      },
    ];

    const { detections, omitted } = nmsDedupeDetections(raw, 0.65, 20);
    expect(detections).toHaveLength(2);
    expect(omitted).toBe(0);
    expect(detections.map((d) => d.id)).toContain('jug_left');
    expect(detections.map((d) => d.id)).toContain('jug_right');
  });

  it('deduplicates highly overlapping duplicate boxes for the same item', () => {
    // Duplicate detection on virtually the same box (IoU > 0.85)
    const raw: Detection[] = [
      {
        id: 'jug_primary',
        box: { x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.8 },
        boxFull: { x1: 100, y1: 100, x2: 500, y2: 800 },
        classId: 16,
        className: 'milk jug',
        score: 0.89,
        isProduce: false,
      },
      {
        id: 'jug_jittered_duplicate',
        box: { x1: 0.11, y1: 0.09, x2: 0.51, y2: 0.81 },
        boxFull: { x1: 110, y1: 90, x2: 510, y2: 810 },
        classId: 16,
        className: 'milk jug',
        score: 0.72,
        isProduce: false,
      },
    ];

    const { detections } = nmsDedupeDetections(raw, 0.65, 20);
    expect(detections).toHaveLength(1);
    expect(detections[0].id).toBe('jug_primary'); // keeps higher score
  });

  it('does NOT deduplicate overlapping boxes if they belong to different classes', () => {
    // E.g. an apple resting inside or in front of a cereal box
    const raw: Detection[] = [
      {
        id: 'cereal',
        box: { x1: 0.1, y1: 0.1, x2: 0.6, y2: 0.9 },
        boxFull: { x1: 100, y1: 100, x2: 600, y2: 900 },
        classId: 18,
        className: 'cereal box',
        score: 0.9,
        isProduce: false,
      },
      {
        id: 'apple',
        box: { x1: 0.2, y1: 0.4, x2: 0.5, y2: 0.85 },
        boxFull: { x1: 200, y1: 400, x2: 500, y2: 850 },
        classId: 0,
        className: 'apple',
        score: 0.85,
        isProduce: true,
      },
    ];

    const { detections } = nmsDedupeDetections(raw, 0.65, 20);
    expect(detections).toHaveLength(2);
  });
});
