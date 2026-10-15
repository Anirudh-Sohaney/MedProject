import { describe, it, expect } from 'vitest';
import { computeIoU, nmsDedupeDetections } from '@/inference/detector';
import { Detection } from '@/types/contracts';

describe('Detector NMS & Pure Helpers', () => {
  it('computes exact IoU for overlapping and disjoint boxes', () => {
    const boxA = { x1: 0, y1: 0, x2: 2, y2: 2 }; // area 4
    const boxB = { x1: 1, y1: 1, x2: 3, y2: 3 }; // area 4, overlap [1,1,2,2] area 1, union 4+4-1=7
    expect(computeIoU(boxA, boxB)).toBeCloseTo(1 / 7);

    const boxC = { x1: 10, y1: 10, x2: 12, y2: 12 };
    expect(computeIoU(boxA, boxC)).toBe(0);

    // Identical boxes
    expect(computeIoU(boxA, boxA)).toBe(1.0);
  });

  it('discards detections with score below 0.20 threshold', () => {
    const raw: Detection[] = [
      {
        id: 'det_low',
        box: { x1: 0, y1: 0, x2: 0.5, y2: 0.5 },
        boxFull: { x1: 0, y1: 0, x2: 200, y2: 200 },
        classId: 0,
        className: 'apple',
        score: 0.15,
        isProduce: true,
      },
      {
        id: 'det_ok',
        box: { x1: 0, y1: 0, x2: 0.5, y2: 0.5 },
        boxFull: { x1: 0, y1: 0, x2: 200, y2: 200 },
        classId: 0,
        className: 'apple',
        score: 0.25,
        isProduce: true,
      },
    ];

    const { detections } = nmsDedupeDetections(raw);
    expect(detections).toHaveLength(1);
    expect(detections[0].id).toBe('det_ok');
  });

  it('limits to top 20 detections and records omitted count', () => {
    const raw: Detection[] = Array.from({ length: 25 }, (_, i) => ({
      id: `det_${i}`,
      box: { x1: i * 0.03, y1: 0, x2: i * 0.03 + 0.02, y2: 0.5 },
      boxFull: { x1: i * 30, y1: 0, x2: i * 30 + 20, y2: 500 },
      classId: 0,
      className: 'apple',
      score: 0.5 + i * 0.01,
      isProduce: true,
    }));

    const { detections, omitted } = nmsDedupeDetections(raw, 0.7, 20);
    expect(detections).toHaveLength(20);
    expect(omitted).toBe(5);
  });
});
