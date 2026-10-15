import { Detection, OcrResult, Product, ProductMatch } from '@/types/contracts';
import { estimateConfidence } from './confidence';
import { matchesTokenOrPhrase, scoreTokenOverlap } from './normalize';

function titleCase(str: string): string {
  return str
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Matches a single detection (and optional OCR crop result) against the catalog.
 * Strict deterministic hierarchy: exact -> brand generic -> parent category -> Unidentified item.
 */
export function matchDetection(
  det: Detection,
  ocr: OcrResult | null,
  catalog: Product[]
): ProductMatch {
  const normClassName = det.className.toLowerCase().trim();
  const candidates = catalog.filter((p) =>
    p.detectorClasses.some((dc) => dc.toLowerCase() === normClassName)
  );

  // 1. Unknown detector class or no catalog candidates
  if (candidates.length === 0) {
    if (det.isProduce) {
      const speciesName = titleCase(det.className);
      const conf = estimateConfidence({
        detection: det.score,
        ocrMatch: 0,
        candidateMargin: 0.5,
        isProduce: true,
      });
      return {
        detectionId: det.id,
        displayName: speciesName,
        productId: null,
        brand: null,
        variant: null,
        category: 'produce',
        ingredient: `100% ${speciesName.toLowerCase()}`,
        confidence: conf,
        detectorScore: det.score,
        ocrMatch: 0,
        candidateMargin: 0.5,
        cropThumbUrl: '',
        status: 'identified',
        box: det.box,
      };
    }

    return {
      detectionId: det.id,
      displayName: 'Unidentified item',
      productId: null,
      brand: null,
      variant: null,
      category: null,
      ingredient: null,
      confidence: Math.round(det.score * 40), // low confidence for unmapped
      detectorScore: det.score,
      ocrMatch: 0,
      candidateMargin: 0,
      cropThumbUrl: '',
      status: 'unknown',
      box: det.box,
    };
  }

  // 2. Produce (Species only, ignore brand, renormalize confidence)
  if (det.isProduce) {
    const parent = candidates[0].parentName || titleCase(det.className);
    let displayName = parent;
    let chosenProduct: Product | null = null;
    let margin = 0.8;

    // Check if OCR has variant evidence (e.g. "organic")
    if (ocr && ocr.tokens.length > 0) {
      for (const cand of candidates) {
        if (cand.variantTokens.length > 0) {
          const allVariantsMatch = cand.variantTokens.every(
            (vt) => matchesTokenOrPhrase(vt, ocr.tokens, 0.8).matched
          );
          if (allVariantsMatch) {
            displayName = cand.name;
            chosenProduct = cand;
            margin = 1.0;
            break;
          }
        }
      }
    }

    const conf = estimateConfidence({
      detection: det.score,
      ocrMatch: 0,
      candidateMargin: margin,
      isProduce: true,
    });

    return {
      detectionId: det.id,
      displayName,
      productId: chosenProduct ? chosenProduct.id : candidates[0].id,
      brand: null, // Brand strictly null for produce
      variant: chosenProduct && chosenProduct.variantTokens.length ? chosenProduct.variantTokens.join(', ') : null,
      category: 'produce',
      ingredient: chosenProduct?.ingredientName || candidates[0].ingredientName || `100% ${parent.toLowerCase()}`,
      confidence: conf,
      detectorScore: det.score,
      ocrMatch: 0,
      candidateMargin: margin,
      cropThumbUrl: '',
      status: 'identified',
      box: det.box,
    };
  }

  // 3. Packaged items: OCR is null or empty -> classifier generic only
  const fallbackParent = candidates[0].parentName || titleCase(det.className);

  if (!ocr || !ocr.tokens.length) {
    const conf = estimateConfidence({
      detection: det.score,
      ocrMatch: 0,
      candidateMargin: 0,
      isProduce: false,
    });

    return {
      detectionId: det.id,
      displayName: fallbackParent,
      productId: null,
      brand: null,
      variant: null,
      category: candidates[0].category,
      ingredient: null,
      confidence: conf,
      detectorScore: det.score,
      ocrMatch: 0,
      candidateMargin: 0,
      cropThumbUrl: '',
      status: 'identified',
      box: det.box,
    };
  }

  // 4. Packaged items with OCR tokens: evaluate evidence for brand & variants
  interface ScoredCandidate {
    product: Product;
    brandSupported: boolean;
    brandScore: number;
    matchedVariants: string[];
    tokenScore: number;
  }

  const scored: ScoredCandidate[] = candidates.map((cand) => {
    // Brand verification
    let brandSupported = false;
    let brandScore = 0;
    if (cand.brand) {
      const match = matchesTokenOrPhrase(cand.brand, ocr.tokens, 0.75);
      brandSupported = match.matched;
      brandScore = match.score;
    }

    // Variant verification
    const matchedVariants: string[] = [];
    for (const vt of cand.variantTokens) {
      const match = matchesTokenOrPhrase(vt, ocr.tokens, 0.75);
      if (match.matched) {
        matchedVariants.push(vt);
      }
    }

    // Overall token overlap
    const searchTargets = [
      ...cand.aliases,
      cand.name,
      ...(cand.brand ? [cand.brand] : []),
      ...cand.variantTokens,
    ];
    const tokenScore = scoreTokenOverlap(ocr.tokens, searchTargets);

    return {
      product: cand,
      brandSupported,
      brandScore,
      matchedVariants,
      tokenScore,
    };
  });

  // Sort candidates by token score and matched evidence
  scored.sort((a, b) => {
    if (b.brandSupported !== a.brandSupported) return b.brandSupported ? 1 : -1;
    if (b.matchedVariants.length !== a.matchedVariants.length) {
      return b.matchedVariants.length - a.matchedVariants.length;
    }
    return b.tokenScore - a.tokenScore;
  });

  const best = scored[0];
  const second = scored[1];
  const candidateMargin = second ? Math.max(0, best.tokenScore - second.tokenScore) : 1.0;

  // Check for variant conflicts (e.g., both "whole" and "2%" present, or top candidates have opposing variants)
  let hasConflict = false;
  if (
    second &&
    best.brandSupported &&
    second.brandSupported &&
    best.matchedVariants.length > 0 &&
    second.matchedVariants.length > 0 &&
    best.product.parentName === second.product.parentName
  ) {
    const setA = new Set(best.product.variantTokens);
    const setB = new Set(second.product.variantTokens);
    const disjoint = ![...setA].some((x) => setB.has(x));
    if (disjoint && Math.abs(best.tokenScore - second.tokenScore) < 0.2) {
      hasConflict = true;
    }
  }

  // Hierarchy Resolution:
  // 1. Conflict between candidate variants -> resolve to brand generic or shared parent
  if (hasConflict) {
    const parentDisplay = best.brandSupported
      ? `${best.product.brand} ${best.product.parentName}`
      : best.product.parentName;

    // Conflicting OCR reduces effective ocrMatch
    const penalizedOcrMatch = Math.max(0, best.tokenScore * 0.5);
    const conf = estimateConfidence({
      detection: det.score,
      ocrMatch: penalizedOcrMatch,
      candidateMargin: 0,
      isProduce: false,
    });

    return {
      detectionId: det.id,
      displayName: parentDisplay,
      productId: null,
      brand: best.brandSupported ? best.product.brand : null,
      variant: null,
      category: best.product.category,
      ingredient: null,
      confidence: conf,
      detectorScore: det.score,
      ocrMatch: penalizedOcrMatch,
      candidateMargin: 0,
      cropThumbUrl: '',
      status: 'identified',
      box: det.box,
    };
  }

  // 2. Exact match: Brand is supported AND discriminating variant evidence is confirmed
  const requiredVariants = best.product.variantTokens;
  const variantEvidenceConfirmed =
    requiredVariants.length === 0 || best.matchedVariants.length > 0;

  if (best.brandSupported && variantEvidenceConfirmed) {
    const conf = estimateConfidence({
      detection: det.score,
      ocrMatch: best.tokenScore,
      candidateMargin,
      isProduce: false,
    });

    return {
      detectionId: det.id,
      displayName: best.product.name,
      productId: best.product.id,
      brand: best.product.brand,
      variant: best.matchedVariants.length ? best.matchedVariants.join(', ') : null,
      category: best.product.category,
      ingredient: best.product.ingredientName,
      confidence: conf,
      detectorScore: det.score,
      ocrMatch: best.tokenScore,
      candidateMargin,
      cropThumbUrl: '',
      status: 'identified',
      box: det.box,
    };
  }

  // 3. Brand supported, but variant ambiguous -> Brand generic ("Great Value Milk")
  if (best.brandSupported) {
    const brandGenericName = `${best.product.brand} ${best.product.parentName}`;
    const conf = estimateConfidence({
      detection: det.score,
      ocrMatch: Math.max(best.brandScore, best.tokenScore * 0.7),
      candidateMargin: candidateMargin * 0.8,
      isProduce: false,
    });

    return {
      detectionId: det.id,
      displayName: brandGenericName,
      productId: null,
      brand: best.product.brand,
      variant: null,
      category: best.product.category,
      ingredient: null,
      confidence: conf,
      detectorScore: det.score,
      ocrMatch: Math.max(best.brandScore, best.tokenScore * 0.7),
      candidateMargin: candidateMargin * 0.8,
      cropThumbUrl: '',
      status: 'identified',
      box: det.box,
    };
  }

  // 4. No brand verified -> parent category only ("Milk", "Oats", etc.)
  const categoryOnlyName = best.product.parentName;
  const conf = estimateConfidence({
    detection: det.score,
    ocrMatch: best.tokenScore * 0.5,
    candidateMargin: 0.2,
    isProduce: false,
  });

  return {
    detectionId: det.id,
    displayName: categoryOnlyName,
    productId: null,
    brand: null,
    variant: null,
    category: best.product.category,
    ingredient: null,
    confidence: conf,
    detectorScore: det.score,
    ocrMatch: best.tokenScore * 0.5,
    candidateMargin: 0.2,
    cropThumbUrl: '',
    status: 'identified',
    box: det.box,
  };
}

/**
 * Groups matches by final displayName, sum distinct counts, and retains max confidence.
 */
export function groupMatches(matches: ProductMatch[]): ProductMatch[] {
  const groups = new Map<string, ProductMatch[]>();

  for (const m of matches) {
    const key = `${m.displayName}::${m.brand || ''}`;
    const existing = groups.get(key) || [];
    existing.push(m);
    groups.set(key, existing);
  }

  const result: ProductMatch[] = [];

  for (const [, items] of groups) {
    // Sort by confidence desc
    items.sort((a, b) => b.confidence - a.confidence);
    const primary = items[0];

    result.push({
      ...primary,
      count: items.length,
    });
  }

  // Sort final display cards by confidence descending
  return result.sort((a, b) => b.confidence - a.confidence);
}
