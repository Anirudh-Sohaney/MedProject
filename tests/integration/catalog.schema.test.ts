import { describe, it, expect } from 'vitest';
import productsData from '@/data/products.json';
import { Product } from '@/types/contracts';

const products = productsData as Product[];

describe('Catalog Schema & Completeness (Integration)', () => {
  it('contains at least 60 distinct verified entries (aiming 100)', () => {
    expect(products.length).toBeGreaterThanOrEqual(60);
    expect(products.length).toBeLessThanOrEqual(120);
  });

  it('meets target distribution: 15–25 produce and 45–85 packaged groceries', () => {
    const produce = products.filter((p) => p.category === 'produce');
    const packaged = products.filter((p) => p.category !== 'produce');

    expect(produce.length).toBeGreaterThanOrEqual(15);
    expect(produce.length).toBeLessThanOrEqual(25);

    expect(packaged.length).toBeGreaterThanOrEqual(45);
    expect(packaged.length).toBeLessThanOrEqual(85);
  });

  it('ensures each product has valid non-empty fields and unique IDs', () => {
    const ids = new Set<string>();

    for (const p of products) {
      expect(p.id).toBeDefined();
      expect(typeof p.id).toBe('string');
      expect(p.id.length).toBeGreaterThan(0);
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);

      expect(p.name).toBeDefined();
      expect(p.name.length).toBeGreaterThan(2);

      expect(p.parentName).toBeDefined();
      expect(p.parentName.length).toBeGreaterThan(1);

      expect(p.sourceUrl).toBeDefined();
      expect(p.sourceUrl).toMatch(/^https?:\/\//);

      expect(Array.isArray(p.detectorClasses)).toBe(true);
      expect(p.detectorClasses.length).toBeGreaterThan(0);

      expect(Array.isArray(p.aliases)).toBe(true);
      expect(Array.isArray(p.variantTokens)).toBe(true);
    }
  });

  it('verifies presence of required variants (GV milk 2%/whole, Quaker oats old fashioned/quick)', () => {
    const names = products.map((p) => p.name.toLowerCase());

    // Great Value milk variants
    const hasGv2Pct = names.some((n) => n.includes('great value') && n.includes('2%'));
    const hasGvWhole = names.some((n) => n.includes('great value') && n.includes('whole'));
    expect(hasGv2Pct).toBe(true);
    expect(hasGvWhole).toBe(true);

    // Quaker oats variants
    const hasQuakerOldFashioned = names.some(
      (n) => n.includes('quaker') && (n.includes('old fashioned') || n.includes('rolled'))
    );
    const hasQuakerQuick = names.some(
      (n) => n.includes('quaker') && (n.includes('quick') || n.includes('1-minute'))
    );
    expect(hasQuakerOldFashioned).toBe(true);
    expect(hasQuakerQuick).toBe(true);
  });
});
