import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import manifestData from '../fixtures/manifest.json';

describe('Photo Fixtures Manifest & Evaluation Protocol', () => {
  it('covers the required suite: 5 single-item, 5 mixed-table, 2 occluded-fridge', () => {
    const singleItems = manifestData.images.filter((img) => img.file.startsWith('single-item/'));
    const mixedTables = manifestData.images.filter((img) => img.file.startsWith('mixed-table/'));
    const occludedFridges = manifestData.images.filter((img) => img.file.startsWith('occluded-fridge/'));

    expect(singleItems.length).toBe(5);
    expect(mixedTables.length).toBe(5);
    expect(occludedFridges.length).toBe(2);
    expect(manifestData.images.length).toBe(12);
  });

  it('marks missing physical fixture files as NOT TESTED without inventing mock detections', () => {
    const fixturesDir = path.resolve(__dirname, '../fixtures');

    let testedCount = 0;
    let notTestedCount = 0;

    for (const item of manifestData.images) {
      const fullPath = path.join(fixturesDir, item.file);
      const exists = fs.existsSync(fullPath);

      if (!exists) {
        expect(item.status).toBe('NOT TESTED');
        notTestedCount++;
      } else {
        testedCount++;
      }

      // Assert each item has non-empty expected display names and valid minConfidence
      for (const exp of item.expected) {
        expect(exp.displayName).toBeDefined();
        expect(exp.minConfidence).toBeGreaterThanOrEqual(20);
        expect(exp.minConfidence).toBeLessThanOrEqual(100);
      }
    }

    expect(notTestedCount + testedCount).toBe(12);
  });
});
