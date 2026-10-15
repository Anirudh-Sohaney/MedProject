/**
 * OCR text normalization, fuzzy token matching, and string distance routines.
 * Shared between OCR engine and product candidate matcher.
 */

/**
 * Normalizes raw OCR text into cleaned searchable tokens.
 * Converts "2%" / "2 percent", strips punctuation, trims whitespace.
 */
export function normalizeOcrText(raw: string): string[] {
  if (!raw || typeof raw !== 'string') return [];

  // Replace common variants & word representations
  const transformed = raw
    .toLowerCase()
    .replace(/\bpercent\b/g, '%')
    .replace(/(\d+)\s*%/g, '$1%')
    .replace(/[%]/g, ' % ') // isolate % so token can be preserved
    .replace(/[^\w\s%]/g, ' ') // strip punctuation except %
    .replace(/\s+/g, ' ')
    .trim();

  const rawTokens = transformed.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];

  for (let i = 0; i < rawTokens.length; i++) {
    const t = rawTokens[i];
    if (t === '%' && i > 0 && /^\d+$/.test(tokens[tokens.length - 1])) {
      tokens[tokens.length - 1] = `${tokens[tokens.length - 1]}%`;
    } else if (t.length > 0) {
      tokens.push(t);
    }
  }

  return tokens;
}

/**
 * Standard Levenshtein distance between two strings.
 */
export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Computes token similarity in [0, 1] accounting for common OCR confusions.
 */
export function tokenSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1.0;

  // Substitute common OCR letter confusions for fuzzy check
  const simplify = (s: string) =>
    s
      .replace(/0/g, 'o')
      .replace(/1/g, 'l')
      .replace(/rn/g, 'm')
      .replace(/vv/g, 'w');

  const s1Sim = simplify(s1);
  const s2Sim = simplify(s2);
  if (s1Sim === s2Sim) return 0.95;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;

  const dist = Math.min(levenshteinDistance(s1, s2), levenshteinDistance(s1Sim, s2Sim));
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Checks whether a target token or phrase exists in candidate OCR tokens.
 * Returns best match similarity in [0, 1].
 */
export function matchesTokenOrPhrase(
  phrase: string,
  ocrTokens: string[],
  minThreshold = 0.8
): { matched: boolean; score: number } {
  const phraseTokens = normalizeOcrText(phrase);
  if (phraseTokens.length === 0) return { matched: false, score: 0 };

  // Single token
  if (phraseTokens.length === 1) {
    const target = phraseTokens[0];
    let best = 0;
    for (const t of ocrTokens) {
      const sim = tokenSimilarity(target, t);
      if (sim > best) best = sim;
    }
    return { matched: best >= minThreshold, score: best };
  }

  // Multi-token phrase: check contiguous window in OCR tokens
  const n = phraseTokens.length;
  let bestPhraseSim = 0;

  for (let i = 0; i <= ocrTokens.length - n; i++) {
    let windowSim = 0;
    for (let j = 0; j < n; j++) {
      windowSim += tokenSimilarity(phraseTokens[j], ocrTokens[i + j]);
    }
    const avgSim = windowSim / n;
    if (avgSim > bestPhraseSim) bestPhraseSim = avgSim;
  }

  return { matched: bestPhraseSim >= minThreshold, score: bestPhraseSim };
}

/**
 * Scores overlap between OCR tokens and a set of candidate product tokens/aliases.
 * Output bounded in [0, 1].
 */
export function scoreTokenOverlap(ocrTokens: string[], candidatePhrases: string[]): number {
  if (!ocrTokens.length || !candidatePhrases.length) return 0;

  let totalWeight = 0;
  let matchedWeight = 0;

  for (const phrase of candidatePhrases) {
    const pTokens = normalizeOcrText(phrase);
    if (!pTokens.length) continue;
    const weight = Math.min(3, pTokens.length);
    totalWeight += weight;

    const { matched, score } = matchesTokenOrPhrase(phrase, ocrTokens);
    if (matched) {
      matchedWeight += score * weight;
    }
  }

  return totalWeight > 0 ? Math.min(1.0, matchedWeight / totalWeight) : 0;
}
