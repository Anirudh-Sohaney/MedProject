import { ProductMatch } from '@/types/contracts';
import { ClassificationResult } from './classifier';

export interface HierarchyResolution {
  displayName: string;
  productId: string | null;
  brand: string | null;
  variant: string | null;
  category: string;
  ingredient: string;
  hierarchyLevel: 'exact' | 'brand_generic' | 'category' | 'unknown';
  calibratedConfidence: number; // 0–100 integer
  status: 'identified' | 'unknown';
}

/**
 * Resolves a MobileNetV3 classification result through the deterministic product hierarchy:
 * Exact Product -> Brand Generic -> Broad Category -> Unknown Item
 */
export function resolveHierarchy(
  classification: ClassificationResult,
  _detectionScore?: number,
  _ocrTokens: string[] = []
): HierarchyResolution {
  const { top1, top2, margin } = classification;
  const p1 = top1.score;
  const p2 = top2 ? top2.score : 0;

  // Unknown threshold: low visual confidence
  if (p1 < 0.28) {
    return {
      displayName: top1.category === 'produce' ? 'Unidentified produce' : 'Unidentified item',
      productId: null,
      brand: null,
      variant: null,
      category: top1.category || 'grocery',
      ingredient: '',
      hierarchyLevel: 'unknown',
      calibratedConfidence: Math.round(p1 * 100),
      status: 'unknown',
    };
  }

  // PRODUCE HIERARCHY
  if (top1.category === 'produce') {
    // Produce strictly has no brand
    const isApple = top1.classId.startsWith('apple_');
    const isTomato = top1.classId.startsWith('tomato_');
    const isPepper = top1.classId.startsWith('bell_pepper_');

    // If confusion between sub-varieties of same produce
    if (isApple && top2 && top2.classId.startsWith('apple_') && margin < 0.20) {
      return {
        displayName: 'Fresh Apples',
        productId: 'produce_apple_generic',
        brand: null,
        variant: 'Mixed/General Apple',
        category: 'produce',
        ingredient: '100% Fresh Apple',
        hierarchyLevel: 'category',
        calibratedConfidence: Math.min(99, Math.round((p1 + p2 * 0.5) * 100)),
        status: 'identified',
      };
    }

    if (isTomato && top2 && top2.classId.startsWith('tomato_') && margin < 0.20) {
      return {
        displayName: 'Fresh Tomatoes',
        productId: 'produce_tomato_generic',
        brand: null,
        variant: 'Tomatoes',
        category: 'produce',
        ingredient: '100% Fresh Tomato',
        hierarchyLevel: 'category',
        calibratedConfidence: Math.min(99, Math.round((p1 + p2 * 0.5) * 100)),
        status: 'identified',
      };
    }

    if (isPepper && top2 && top2.classId.startsWith('bell_pepper_') && margin < 0.20) {
      return {
        displayName: 'Fresh Bell Pepper',
        productId: 'produce_bell_pepper_generic',
        brand: null,
        variant: 'Bell Pepper',
        category: 'produce',
        ingredient: '100% Bell Pepper',
        hierarchyLevel: 'category',
        calibratedConfidence: Math.min(99, Math.round((p1 + p2 * 0.5) * 100)),
        status: 'identified',
      };
    }

    // High confidence exact produce
    if (p1 >= 0.50) {
      return {
        displayName: top1.label,
        productId: top1.classId,
        brand: null,
        variant: top1.variety,
        category: 'produce',
        ingredient: top1.ingredient,
        hierarchyLevel: 'exact',
        calibratedConfidence: Math.min(99, Math.round(p1 * 100)),
        status: 'identified',
      };
    }

    // Moderate confidence produce
    return {
      displayName: top1.label,
      productId: top1.classId,
      brand: null,
      variant: top1.variety,
      category: 'produce',
      ingredient: top1.ingredient,
      hierarchyLevel: 'category',
      calibratedConfidence: Math.round(p1 * 100),
      status: 'identified',
    };
  }

  // PACKAGED GROCERIES HIERARCHY
  // 1. Exact variant with strong evidence (p1 >= 0.65 and margin >= 0.18)
  if (p1 >= 0.65 && margin >= 0.18) {
    return {
      displayName: top1.label,
      productId: top1.classId,
      brand: top1.brand,
      variant: top1.variety,
      category: top1.category,
      ingredient: top1.ingredient,
      hierarchyLevel: 'exact',
      calibratedConfidence: Math.min(99, Math.round(p1 * 100)),
      status: 'identified',
    };
  }

  // 2. Milk Collapse (e.g. Whole vs 2% confusion)
  if (top1.classId.startsWith('milk_') && top2 && top2.classId.startsWith('milk_')) {
    const sameBrand = top1.brand && top2.brand && top1.brand.toLowerCase() === top2.brand.toLowerCase();
    if (sameBrand) {
      return {
        displayName: `${top1.brand} Milk`,
        productId: `milk_${(top1.brand || 'dairy').toLowerCase().replace(/\s+/g, '_')}_generic`,
        brand: top1.brand,
        variant: 'Grade A Milk',
        category: 'dairy',
        ingredient: 'Grade A Pasteurized Milk, Vitamin D3',
        hierarchyLevel: 'brand_generic',
        calibratedConfidence: Math.min(98, Math.round((p1 + p2 * 0.6) * 100)),
        status: 'identified',
      };
    }
    // Different brands of milk
    return {
      displayName: 'Milk',
      productId: 'dairy_milk_generic',
      brand: null,
      variant: 'Pasteurized Milk',
      category: 'dairy',
      ingredient: 'Grade A Milk',
      hierarchyLevel: 'category',
      calibratedConfidence: Math.min(95, Math.round((p1 + p2 * 0.5) * 100)),
      status: 'identified',
    };
  }

  // 3. Oats Collapse (Old Fashioned vs Quick Oats)
  if (top1.classId.startsWith('oats_quaker_') && top2 && top2.classId.startsWith('oats_quaker_')) {
    return {
      displayName: 'Quaker Rolled Oats',
      productId: 'pantry_quaker_oats_generic',
      brand: 'Quaker Oats',
      variant: 'Rolled Oats',
      category: 'pantry',
      ingredient: '100% Whole Grain Rolled Oats',
      hierarchyLevel: 'brand_generic',
      calibratedConfidence: Math.min(98, Math.round((p1 + p2 * 0.6) * 100)),
      status: 'identified',
    };
  }

  // 4. Cereal Collapse (Cheerios variants)
  if (top1.classId.startsWith('cereal_') && top2 && top2.classId.startsWith('cereal_')) {
    return {
      displayName: 'Cheerios Cereal',
      productId: 'pantry_cheerios_generic',
      brand: 'General Mills',
      variant: 'Toasted Whole Grain Oat Cereal',
      category: 'pantry',
      ingredient: 'Whole Grain Oats, Sugar, Corn Starch',
      hierarchyLevel: 'brand_generic',
      calibratedConfidence: Math.min(95, Math.round((p1 + p2 * 0.5) * 100)),
      status: 'identified',
    };
  }

  // 5. Soup Collapse (Campbell's variants)
  if (top1.classId.startsWith('soup_campbells_') && top2 && top2.classId.startsWith('soup_campbells_')) {
    return {
      displayName: "Campbell's Soup",
      productId: 'pantry_campbells_soup_generic',
      brand: "Campbell's",
      variant: 'Condensed Soup',
      category: 'pantry',
      ingredient: 'Soup Stock, Seasonings',
      hierarchyLevel: 'brand_generic',
      calibratedConfidence: Math.min(95, Math.round((p1 + p2 * 0.5) * 100)),
      status: 'identified',
    };
  }

  // 6. Peanut Butter Collapse (Jif vs Skippy)
  if (top1.classId.startsWith('peanut_butter_') && top2 && top2.classId.startsWith('peanut_butter_')) {
    return {
      displayName: 'Creamy Peanut Butter',
      productId: 'pantry_peanut_butter_generic',
      brand: margin >= 0.12 ? top1.brand : null,
      variant: 'Creamy',
      category: 'pantry',
      ingredient: 'Roasted Peanuts, Sugar, Salt',
      hierarchyLevel: margin >= 0.12 ? 'brand_generic' : 'category',
      calibratedConfidence: Math.min(95, Math.round((p1 + p2 * 0.5) * 100)),
      status: 'identified',
    };
  }

  // 7. General Brand Generic
  if (top1.brand && top2 && top2.brand && top1.brand === top2.brand && margin < 0.18) {
    return {
      displayName: `${top1.brand} ${top1.category}`,
      productId: `${top1.brand.toLowerCase()}_generic`,
      brand: top1.brand,
      variant: null,
      category: top1.category,
      ingredient: top1.ingredient,
      hierarchyLevel: 'brand_generic',
      calibratedConfidence: Math.min(95, Math.round((p1 + p2 * 0.5) * 100)),
      status: 'identified',
    };
  }

  // 8. If confidence >= 0.45, return top1 with confidence
  if (p1 >= 0.45) {
    return {
      displayName: top1.label,
      productId: top1.classId,
      brand: top1.brand,
      variant: top1.variety,
      category: top1.category,
      ingredient: top1.ingredient,
      hierarchyLevel: 'exact',
      calibratedConfidence: Math.round(p1 * 100),
      status: 'identified',
    };
  }

  // 9. Weak match fallback to Unknown
  return {
    displayName: 'Unidentified item',
    productId: null,
    brand: null,
    variant: null,
    category: top1.category || 'grocery',
    ingredient: '',
    hierarchyLevel: 'unknown',
    calibratedConfidence: Math.round(p1 * 100),
    status: 'unknown',
  };
}

/**
 * Groups multiple physical detections of the same product into aggregated matches with counts.
 */
export function groupProductMatches(matches: ProductMatch[]): ProductMatch[] {
  const groupedMap = new Map<string, ProductMatch>();

  for (const m of matches) {
    // Key by displayName for identified items; keep unknowns distinct
    const key = m.status === 'unknown' ? m.detectionId : m.displayName.toLowerCase();

    if (!groupedMap.has(key)) {
      groupedMap.set(key, { ...m, count: 1 });
    } else {
      const existing = groupedMap.get(key)!;
      existing.count = (existing.count || 1) + 1;
      // Retain the higher confidence
      if (m.confidence > existing.confidence) {
        existing.confidence = m.confidence;
        existing.detectorScore = m.detectorScore;
        existing.classifierScore = m.classifierScore;
      }
    }
  }

  return Array.from(groupedMap.values());
}
