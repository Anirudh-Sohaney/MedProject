import { describe, it, expect } from 'vitest';
import {
  levenshteinDistance,
  matchesTokenOrPhrase,
  normalizeOcrText,
  scoreTokenOverlap,
  tokenSimilarity,
} from '@/inference/normalize';

describe('OCR Normalization and Fuzzy Matching', () => {
  it('converts word percent to % and groups with preceding numbers', () => {
    expect(normalizeOcrText('2 percent milk')).toEqual(['2%', 'milk']);
    expect(normalizeOcrText('Reduced Fat 1 % Milk')).toEqual(['reduced', 'fat', '1%', 'milk']);
    expect(normalizeOcrText('Whole Milk 100% pure')).toEqual(['whole', 'milk', '100%', 'pure']);
  });

  it('strips punctuation and converts to lowercase', () => {
    expect(normalizeOcrText("Campbell's Condensed Soup! (10.75 oz.)")).toEqual([
      'campbell',
      's',
      'condensed',
      'soup',
      '10',
      '75',
      'oz',
    ]);
  });

  it('computes Levenshtein distance accurately', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('milk', 'milk')).toBe(0);
    expect(levenshteinDistance('', 'test')).toBe(4);
  });

  it('handles common OCR confusions in tokenSimilarity', () => {
    // rn -> m
    expect(tokenSimilarity('modem', 'rodem')).toBeGreaterThan(0.7);
    // 0 -> o
    expect(tokenSimilarity('cheeri0s', 'cheerios')).toBeGreaterThanOrEqual(0.9);
    // 1 -> l
    expect(tokenSimilarity('mi1k', 'milk')).toBeGreaterThanOrEqual(0.9);
  });

  it('matches phrases in token arrays', () => {
    const ocrTokens = ['great', 'value', '2%', 'reduced', 'fat', 'milk'];
    expect(matchesTokenOrPhrase('great value', ocrTokens).matched).toBe(true);
    expect(matchesTokenOrPhrase('reduced fat', ocrTokens).matched).toBe(true);
    expect(matchesTokenOrPhrase('whole vitamin d', ocrTokens).matched).toBe(false);
  });

  it('scores token overlap cleanly within [0, 1]', () => {
    const tokens = ['great', 'value', 'whole', 'milk'];
    const score = scoreTokenOverlap(tokens, ['great value whole milk', 'whole milk', 'milk']);
    expect(score).toBeGreaterThan(0.8);
    expect(score).toBeLessThanOrEqual(1.0);

    const zeroScore = scoreTokenOverlap(tokens, ['tropicana orange juice']);
    expect(zeroScore).toBe(0);
  });
});
