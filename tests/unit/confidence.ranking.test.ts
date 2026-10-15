import { describe, it, expect } from 'vitest';
import { estimateConfidence, getConfidenceTier } from '@/inference/confidence';

describe('Confidence Estimation & Ranking', () => {
  it('computes exact values for packaged items', () => {
    // 0.65 * 0.8 + 0.25 * 0.6 + 0.10 * 0.4 = 0.52 + 0.15 + 0.04 = 0.71 -> 71%
    const conf = estimateConfidence({
      detection: 0.8,
      ocrMatch: 0.6,
      candidateMargin: 0.4,
      isProduce: false,
    });
    expect(conf).toBe(71);
  });

  it('renormalizes weights for produce (omits OCR)', () => {
    // d = 0.9, m = 0.5
    // score = (0.65 / 0.75) * 0.9 + (0.10 / 0.75) * 0.5
    // = (0.65 * 0.9 + 0.10 * 0.5) / 0.75 = (0.585 + 0.05) / 0.75 = 0.635 / 0.75 = 0.84666... -> 85%
    const conf = estimateConfidence({
      detection: 0.9,
      ocrMatch: 0.99, // Should be ignored for produce
      candidateMargin: 0.5,
      isProduce: true,
    });
    expect(conf).toBe(85);
  });

  it('ensures higher OCR agreement yields higher confidence given identical detection scores', () => {
    const lowOcr = estimateConfidence({
      detection: 0.8,
      ocrMatch: 0.2,
      candidateMargin: 0.3,
      isProduce: false,
    });
    const highOcr = estimateConfidence({
      detection: 0.8,
      ocrMatch: 0.9,
      candidateMargin: 0.3,
      isProduce: false,
    });
    expect(highOcr).toBeGreaterThan(lowOcr);
  });

  it('clamps all input terms and outputs within [0, 100]', () => {
    const over = estimateConfidence({
      detection: 1.5,
      ocrMatch: 2.0,
      candidateMargin: 5.0,
      isProduce: false,
    });
    expect(over).toBe(100);

    const under = estimateConfidence({
      detection: -0.5,
      ocrMatch: -1.0,
      candidateMargin: -2.0,
      isProduce: false,
    });
    expect(under).toBe(0);
  });

  it('classifies confidence into high, medium, and low qualitative bands', () => {
    expect(getConfidenceTier(80)).toBe('high');
    expect(getConfidenceTier(65)).toBe('medium');
    expect(getConfidenceTier(45)).toBe('low');
  });
});
