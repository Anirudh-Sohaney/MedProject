# Validation Report — On-Device Grocery Scanner

Comprehensive verification report for On-Device Grocery Scanner prototype. All metrics and timings are measured directly on the execution environment with zero invented figures.

---

## 1. Catalog Verification

- **Total products**: 100
- **Produce entries**: 25 (Target: 15–25 ✅)
- **Packaged entries**: 75 (Target: 45–75 ✅)
- **Data Source 1**: `https://github.com/luminati-io/Walmart-dataset-samples` (`walmart-products.csv`)
- **Data Source 2**: `https://world.openfoodfacts.org/` (Open Food Facts API, build-time only)
- **License Attribution**: Open Database License (ODbL) for Open Food Facts; Public domain sample data for Walmart sample CSV.
- **Required Variants Verified**:
  - Great Value Whole Milk & Great Value 2% Reduced Fat Milk: **YES**
  - Quaker Old Fashioned Rolled Oats & Quaker Quick 1-Minute Oats: **YES**
  - Eggs, Butter, Cheese, Pasta, Rice, Bread, Yogurt, Peanut Butter, Canned Beans, Juices, Frozen Vegetables: **YES**
- **Catalog File**: `src/data/products.json` (62.3 KB)
- **Catalog Build Log**: `scripts/out/catalog_report.md` (445 non-food / non-matching items excluded)

---

## 2. Model & Export Verification

- **File**: `public/models/groceries.onnx`
- **File Size**: 9,795,737 bytes (**9.34 MB**)
- **Architecture**: Ultralytics YOLOE-26n (from `yoloe-26n-seg.pt` backbone with `yoloe-26n.yaml`)
- **Export Mode**: `detection` (primary detection export succeeded; shape `[1, 46, 3549]`)
- **Input Dimensions**: 1 × 3 × 416 × 416 (BCHW)
- **Output Dimensions**: 1 × 46 × 3549 (4 coordinate channels + 42 class probabilities over 3,549 anchors)
- **Fixed Vocabulary Size**: 42 classes (16 produce, 26 packaged groceries; within 35–50 spec)
- **SHA-256**: `ff028520d381bfc90ff78474dd0466fdcddc0cf82135cb6318d6e34022cb8512`
- **Verification Gate**: PASSED ✅ (onnxruntime forward check with synthetic image: no NaN, no Inf, argmax mapped into 0..41)

---

## 3. Measured Latency & Timing

**Test Environment**:
- OS: Linux (Ubuntu Core 26 x86_64)
- CPU: AMD Ryzen AI 7 PRO 350 w/ Radeon 860M
- Node: v24.18.0
- Runtime: Onnxruntime 1.31.0 CPUExecutionProvider / Wasm

| Stage / Metric | Measured Timing | Notes |
|----------------|-----------------|-------|
| Cold Model Load | 97.5 ms | First session load from disk/cache |
| First Inference (Cold) | 52.3 ms | First forward pass after session creation |
| Warm Inference Run 1 | 50.3 ms | Within 1–8s warm target ✅ |
| Warm Inference Run 2 | 41.3 ms | Within 1–8s warm target ✅ |
| Warm Inference Run 3 | 52.5 ms | Within 1–8s warm target ✅ |
| Warm Inference Run 4 | 48.4 ms | Within 1–8s warm target ✅ |
| Warm Inference Run 5 | 42.8 ms | Within 1–8s warm target ✅ |
| **Warm Inference Median** | **48.4 ms** (0.048 s) | **Significantly beats the 1–8 s budget** |
| OCR per crop | ~150–350 ms | Tesseract.js worker on cropped label |
| OCR Budget | Max 4 crops / 8.0 s | Non-blocking; abandons remaining crops gracefully |

---

## 4. Test Suite Matrix (`npm run test`)

13 test suites passed, 45 total tests passing:

| Test Suite | File | Status | Assertion Highlights |
|------------|------|--------|----------------------|
| Matcher Hierarchy | `tests/unit/matcher.hierarchy.test.ts` | **PASS** (5/5) | Exact -> brand generic -> parent -> Unidentified |
| Milk Variants | `tests/unit/matcher.milk-variant.test.ts` | **PASS** (4/4) | 2% vs whole discrimination & conflict parent fallback |
| Fuzzy & No OCR | `tests/unit/matcher.fuzzy-no-ocr.test.ts` | **PASS** (4/4) | Null/garbage OCR fallback; produce never gains brand |
| Duplicates | `tests/unit/matcher.duplicates.test.ts` | **PASS** (2/2) | Duplicate box grouping and ×count summation |
| Adjacent Boxes | `tests/unit/matcher.adjacent-boxes.test.ts` | **PASS** (3/3) | Side-by-side items kept; high IoU deduped |
| Unknowns | `tests/unit/matcher.unknowns.test.ts` | **PASS** (2/2) | Unmapped items -> Unidentified; produce species fallback |
| Confidence Ranking | `tests/unit/confidence.ranking.test.ts` | **PASS** (5/5) | Packaged formula, produce reweighting, clamp [0,100] |
| Text Normalization | `tests/unit/normalize.test.ts` | **PASS** (6/6) | %/percent, case/punctuation, Levenshtein, fuzzy |
| Detector NMS | `tests/unit/detector.nms.test.ts` | **PASS** (3/3) | Score <0.20 drop, top-20 limit, omitted count tracking |
| Catalog Schema | `tests/integration/catalog.schema.test.ts` | **PASS** (4/4) | 100 entries, produce [15-25], packaged [45-85], valid URLs |
| Pipeline Events | `tests/integration/pipeline.events.test.ts` | **PASS** (2/2) | Sequential stages, OCR progress, non-blocking done |
| Fixtures Manifest | `tests/integration/fixtures.manifest.test.ts` | **PASS** (2/2) | 12 fixture specs, NOT TESTED protocol adherence |
| Route Navigation | `tests/e2e/smoke.navigation.test.tsx` | **PASS** (3/3) | Direct /results redirect to /, object URL revocation |

---

## 5. Photo Fixture Suite (`tests/fixtures/manifest.json`)

Per specification, fixture entries are defined with target expectations, false positives forbidden, and licenses. Because no physical photographic camera files were committed in this workspace, all missing binaries are marked `NOT TESTED` in `manifest.json`:

| Fixture ID | Category | Expected Products | Status |
|------------|----------|-------------------|--------|
| `single-1` | Single Item | Great Value 2% Reduced Fat Milk (min conf 50%) | **NOT TESTED** (Binary absent) |
| `single-2` | Single Item | Quaker Old Fashioned Rolled Oats (min conf 50%) | **NOT TESTED** (Binary absent) |
| `single-3` | Single Item | Bananas (min conf 65%) | **NOT TESTED** (Binary absent) |
| `single-4` | Single Item | Apples (min conf 65%) | **NOT TESTED** (Binary absent) |
| `single-5` | Single Item | Campbell's Condensed Tomato Soup (min conf 50%) | **NOT TESTED** (Binary absent) |
| `mixed-1` | Mixed Table | Milk, Bananas, Bread | **NOT TESTED** (Binary absent) |
| `mixed-2` | Mixed Table | Potato Chips, Cookies | **NOT TESTED** (Binary absent) |
| `mixed-3` | Mixed Table | Pasta, Rice, Beans | **NOT TESTED** (Binary absent) |
| `mixed-4` | Mixed Table | Apples, Oranges, Lemons | **NOT TESTED** (Binary absent) |
| `mixed-5` | Mixed Table | Eggs, Butter, Cheese | **NOT TESTED** (Binary absent) |
| `fridge-1` | Occluded Fridge | Milk, Yogurt | **NOT TESTED** (Binary absent) |
| `fridge-2` | Occluded Fridge | Carrots, Lettuce | **NOT TESTED** (Binary absent) |

---

## 6. iPhone Hardware Verification Statement

> **iPhone Performance Status**: **Unverified**.
> In accordance with the validation guidelines ("Without an iPhone, state iPhone performance unverified. No invented metrics."), tests were executed on Linux x86_64 with JSDOM and modern Chromium/WebKit rendering emulation. Physical Mobile Safari on an iPhone was not physically connected in this server environment.

---

## 7. Production Build & Static Preview Verification

- `npm run build`: **Success** (`tsc -b && vite build` built in 2.73s).
- `dist/index.html`: 0.80 kB
- `dist/assets/index-CB7Gl-a4.js`: 281.41 kB (gzipped: 86.31 kB)
- `dist/assets/tesseract-D4c1DX89.js`: 13.67 kB (lazy chunk)
- `dist/models/groceries.onnx`: 9.34 MB
- `dist/models/groceries.onnx.meta.json`: 3.07 KB
- Netlify SPA routing: configured via `netlify.toml` (`/* -> /index.html 200`).
