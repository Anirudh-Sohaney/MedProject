# Directory Structure — On-Device Grocery Scanner (Netlify Prototype)

> Exhaustive breakdown of every folder, subfolder, and file, with the exact code responsibilities that must live in each. No placeholder files — every path listed is required by the spec.

---

## Top-level tree

```
grocery-scanner/
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── netlify.toml
├── README.md
├── DIRECTORY.md                  ← this file
├── .gitignore
├── .nvmrc
├── docs/
│   ├── ARCHITECTURE.md
│   └── VALIDATION.md
├── public/
│   ├── favicon.svg
│   └── models/
│       ├── groceries.onnx        ← produced by scripts/export_model.py (not committed if large; fetched/cached)
│       ├── groceries.onnx.meta.json
│       └── .gitkeep
├── scripts/
│   ├── prompts.py
│   ├── export_model.py
│   ├── build_catalog.py
│   └── requirements.txt
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── vite-env.d.ts
│   ├── styles/
│   │   ├── global.css
│   │   └── tokens.css
│   ├── types/
│   │   └── contracts.ts
│   ├── context/
│   │   └── ScanContext.tsx
│   ├── pages/
│   │   ├── Home.tsx
│   │   └── Results.tsx
│   ├── components/
│   │   ├── CameraInput.tsx
│   │   ├── ImageOverlay.tsx
│   │   ├── ProductRow.tsx
│   │   ├── StageBanner.tsx
│   │   ├── ConfidenceBadge.tsx
│   │   ├── UnknownRow.tsx
│   │   └── ErrorBanner.tsx
│   ├── inference/
│   │   ├── detector.ts
│   │   ├── ocr.ts
│   │   ├── matcher.ts
│   │   ├── pipeline.ts
│   │   ├── normalize.ts
│   │   ├── confidence.ts
│   │   └── imageUtils.ts
│   ├── catalog/
│   │   └── loadCatalog.ts
│   └── data/
│       └── products.json         ← produced by scripts/build_catalog.py
└── tests/
    ├── setup.ts
    ├── fixtures/
    │   ├── manifest.json
    │   ├── single-item/
    │   ├── mixed-table/
    │   └── occluded-fridge/
    ├── unit/
    │   ├── matcher.hierarchy.test.ts
    │   ├── matcher.milk-variant.test.ts
    │   ├── matcher.fuzzy-no-ocr.test.ts
    │   ├── matcher.duplicates.test.ts
    │   ├── matcher.adjacent-boxes.test.ts
    │   ├── matcher.unknowns.test.ts
    │   ├── confidence.ranking.test.ts
    │   ├── normalize.test.ts
    │   └── detector.nms.test.ts
    ├── integration/
    │   ├── pipeline.events.test.ts
    │   └── catalog.schema.test.ts
    └── e2e/
        └── smoke.navigation.test.ts   (Vitest + jsdom/route-level; true device E2E is manual — see VALIDATION.md)
```

---

## Root files

### `index.html`
- Vite entry HTML. Single `<div id="root">`.
- Mobile viewport meta: `width=device-width, initial-scale=1, viewport-fit=cover`.
- `<meta name="theme-color" content="#ffffff">`, apple-mobile-web-app-capable optional.
- No inline scripts beyond Vite module entry.

### `package.json`
Dependencies (runtime):
- `react`, `react-dom`, `react-router-dom` (v6+; routes `/` and `/results`)
- `@ultralytics/yolo` — browser YOLO runtime (`YOLO.load`, `model.predict`)
- `tesseract.js` — OCR worker

DevDependencies:
- `vite`, `@vitejs/plugin-react`, `typescript`
- `vitest`, `@vitest/ui` (optional), `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`
- `@types/react`, `@types/react-dom`, `@types/node`

Scripts:
- `dev` — `vite`
- `build` — `tsc -b && vite build`
- `preview` — `vite preview`
- `test` — `vitest run`
- `test:watch` — `vitest`
- `export:model` — `python scripts/export_model.py`
- `build:catalog` — `python scripts/build_catalog.py`

No backend scripts. No postinstall that downloads weights to the phone bundle path without an explicit fetch-at-runtime strategy (model is cached via Cache API / service worker optional; minimum: browser HTTP cache with explicit progress UI).

### `package-lock.json`
- Committed. Produced by `npm install`. Required for Netlify reproducible builds.

### `tsconfig.json` / `tsconfig.node.json`
- Strict mode on. `jsx: react-jsx`. Path alias `@/* → src/*` (used consistently).
- `tsconfig.node.json` covers `vite.config.ts` / `vitest.config.ts`.

### `vite.config.ts`
- React plugin. `base: './'` optional for Netlify subpaths (default `/` fine with SPA redirect).
- Ensure `.onnx` and large binary assets under `public/` are NOT bundled — served as static files.
- Manual chunks optional: separate `tesseract` chunk so home page stays light.

### `vitest.config.ts`
- `environment: 'jsdom'`. `setupFiles: ['tests/setup.ts']`.
- Include pattern: `tests/**/*.test.ts(x)`.
- Alias `@` → `src`.
- CSS handling as needed.

### `netlify.toml`
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```
- SPA redirect for `/results` deep links.
- Optional: `[[headers]]` for `Cache-Control` on `/models/*` and tesseract wasm/lang data (long cache, immutable by content hash if filenames versioned).

### `.gitignore`
- `node_modules/`, `dist/`, `.env*`, Python `__pycache__/`, `*.pt` (no PyTorch weights in repo), large `*.onnx` if policy is fetch-not-commit (decide and document in README; default: commit ONNX if < ~50 MB, else CI artifact).

### `.nvmrc`
- LTS Node version matching Netlify (e.g. `20`).

### `README.md`
- Project overview, stack, local dev, model export, catalog build, test, build, Netlify Git deploy, verification report template (see docs/VALIDATION.md).

---

## `docs/`

### `docs/ARCHITECTURE.md`
- Shared typed contracts (`Detection`, `ProductMatch`, OCR result types).
- Pipeline event model (`detected`, `ocr-start`, `identified`, `done`, `error`).
- Data flow: image → preprocess → detector → NMS/dedupe → OCR budget → matcher hierarchy → confidence → UI events.
- Confidence formula and renormalization for produce.
- Module independence rules (no UI imports from inference; inference pure functions + small side-effect wrappers for model/worker load).
- Model asset strategy (ONNX in `public/models/`, OCR wasm/lang cache).

### `docs/VALIDATION.md`
- Unit test matrix mapped to spec bullets.
- Fixture manifest schema and `NOT TESTED` marking.
- Manual iPhone/Chrome verification protocol, timing measurement (cold/warm), report template fields.

---

## `public/`

### `public/favicon.svg`
- Simple grocery glyph; no binary dependencies.

### `public/models/groceries.onnx`
- **Produced by** `scripts/export_model.py` (YOLOE-26n detection ONNX @ 416×416 with fixed prompt vocabulary; fallback: prompted seg ONNX using boxes only).
- **Never** ships `.pt` / PyTorch weights to the client.
- Loaded at runtime via `YOLO.load('/models/groceries.onnx')` from `src/inference/detector.ts`.
- Download progress + failure + retry surfaced on Home.

### `public/models/groceries.onnx.meta.json`
- Sidecar metadata written by export script:
  - `inputSize: 416`, `classes: [...PROMPTS order...]`, `exportMode: 'detection' | 'segmentation-fallback'`, `ultralyticsVersion`, `createdAt`, `sha256`, `labelMapIndex` (index → class name for ONNX output decoding).
- Read by `detector.ts` to map raw output indices to labels — **single source of truth for class order** must match `scripts/prompts.py` and catalog `detectorClasses`.

---

## `scripts/`

### `scripts/requirements.txt`
```
ultralytics[export-base]>=8.4.142
onnx
onnxruntime
numpy
requests
pandas
```
- Pinned loosely; README documents exact tested versions in verification report.

### `scripts/prompts.py`
- `PROMPTS: list[str]` — **35–50 visible object-type labels**, not SKUs. Canonical list (extendable within range):
  - Produce: `apple`, `banana`, `orange`, `lemon`, `lime`, `avocado`, `tomato`, `potato`, `onion`, `carrot`, `bell pepper`, `cucumber`, `grapes`, `strawberry`, `broccoli`, `lettuce`
  - Packaged: `milk jug`, `milk carton`, `cereal box`, `oatmeal canister`, `oats box`, `yogurt tub`, `yogurt cup`, `egg carton`, `bread bag`, `pasta box`, `rice bag`, `canned food`, `peanut-butter jar`, `juice bottle`, `butter box`, `cheese bag`, `frozen-food bag`, `snack bag`
- Also export `PRODUCE_CLASSES: set[str]` (drives OCR skip + confidence renormalization) and `PACKAGED_CLASSES: set[str]`.
- Docstring: labels are detector-space only; catalog maps them to products via `detectorClasses`.

### `scripts/export_model.py`
- CLI entry: `python scripts/export_model.py [--out public/models/groceries.onnx]`.
- Steps (must match spec exactly):
  1. Import `PROMPTS` from `prompts.py`.
  2. `YOLOE('yoloe-26n-seg.pt')` → `model.set_classes(PROMPTS)` → `save_prompt_embeddings(...)`.
  3. `YOLOE('yoloe-26n.yaml').load('yoloe-26n-seg.pt')` → load embeddings → `export(format='onnx', imgsz=416)`.
  4. Copy exported ONNX to `public/models/groceries.onnx`.
  5. Write `groceries.onnx.meta.json` (class order, sha256, export mode).
  6. **Verification gate:** load ONNX with `onnxruntime`, run a synthetic 416×416 image + one real sample if available; assert output tensor shape/ranges and that argmax indices map into `len(PROMPTS)`. Fail loudly if boxes are empty/NaN.
  7. **Fallback path:** if detection-only export fails, export prompted **segmentation** ONNX and document that runtime uses only the box outputs (`boxes` from seg head); set `exportMode: 'segmentation-fallback'` in meta.
- Downloads `yoloe-26n-seg.pt` via ultralytics hub/auto-download at **build-machine** time only.

### `scripts/build_catalog.py`
- CLI: `python scripts/build_catalog.py [--limit N] [--offline-cache dir]`.
- Sources (build-time only, polite User-Agent, rate-limited):
  1. Walmart sample CSV: `https://github.com/luminati-io/Walmart-dataset-samples` → `walmart-products.csv` (clone or raw fetch).
  2. Open Food Facts API for missing/ingredient enrichment: `https://openfoodfacts.github.io/openfoodfacts-server/api/` (search by name/barcode; respect API etiquette).
- Pipeline:
  - Filter to food categories; drop non-food and misleading image records.
  - Target **≥60 distinct verified entries**, aim **100**: 15–25 produce + 45–75 packaged.
  - Required variant coverage: Great Value whole/2% milk, Quaker Old Fashioned/Quick Oats, cereals, eggs, butter, cheese, pasta, rice, bread, yogurt, peanut butter, canned beans, juices, frozen vegetables; vary brands/packaging.
  - Deduplicate by barcode, else `name+brand` normalized key.
  - Never fabricate SKUs or image URLs — drop records without trustworthy source rows.
- Output `src/data/products.json`: array of
  ```ts
  {
    id: string;                 // stable hash of source key
    name: string;               // display, e.g. "Great Value 2% Reduced Fat Milk"
    brand: string | null;       // null for generic produce
    category: 'produce' | 'dairy' | 'pantry' | 'frozen' | 'bakery' | 'beverage' | 'snack' | 'other';
    detectorClasses: string[];  // subset of PROMPTS, e.g. ["milk jug"]
    parentName: string;         // hierarchy parent, e.g. "Milk" / "Oats"
    ingredientName: string | null; // OFF ingredient summary when available
    aliases: string[];          // OCR-friendly surface forms
    variantTokens: string[];    // ["2%", "reduced fat"], ["old fashioned"], ["quick"]
    sourceUrl: string;          // Walmart row URL or OFF product URL
    image?: string;             // optional; omit rather than mislead
  }
  ```
- Emits `scripts/out/catalog_report.md` (or stdout): category counts, exclusions with reasons, source/license notes (Walmart dataset sample license, OFF ODbL attribution).

---

## `src/` — application

### `src/main.tsx`
- `createRoot`, wrap `<App />` in `<BrowserRouter>` and `<ScanProvider>`.
- Import global CSS only here.

### `src/App.tsx`
- Routes: `/` → `Home`, `/results` → `Results`.
- No other routes. Results guards on context state (redirect to `/` if no scan session).

### `src/vite-env.d.ts`
- Vite client types; declare `*.onnx` not imported as modules (fetched by URL).

### `src/styles/tokens.css`
- CSS variables: spacing, radius, font stack (system), colors for light mobile UI, safe-area insets.

### `src/styles/global.css`
- Reset, viewport constraints (`overflow-x: hidden` on body), touch targets ≥44px, card layout primitives. No horizontal scroll at 320px.

### `src/types/contracts.ts`
**Single shared typed contract module.** All inference ↔ UI types live here; no duplicate interfaces.

```ts
// Detection (post-NMS, pre-OCR)
export interface Detection {
  id: string;
  box: { x1: number; y1: number; x2: number; y2: number }; // normalized 0–1 relative to detector image
  boxFull: { x1: number; y1: number; x2: number; y2: number }; // scaled to full-res OCR image
  classId: number;
  className: string;          // PROMPTS label
  score: number;              // 0–1 detector confidence
  isProduce: boolean;
}

export interface OcrResult {
  detectionId: string;
  text: string;               // raw
  tokens: string[];           // normalized
  heightPx: number;           // crop height on full-res image
  attempts: number;           // preprocessing attempts used
  durationMs: number;
}

export interface ProductCandidate {
  product: Product;
  tokenScore: number;         // 0–1
  variantEvidence: string[];  // matched variant tokens
  brandEvidence: string | null;
}

export interface ProductMatch {
  detectionId: string;
  displayName: string;        // final hierarchy-resolved name or "Unidentified item"
  productId: string | null;
  brand: string | null;
  variant: string | null;
  category: string | null;
  ingredient: string | null;
  confidence: number;         // 0–100 integer (uncalibrated estimate)
  detectorScore: number;
  ocrMatch: number;           // 0–1
  candidateMargin: number;    // 0–1
  cropThumbUrl: string;       // object URL; revoked on cleanup
  status: 'provisional' | 'ocr-pending' | 'identified' | 'unknown';
  count?: number;             // after grouping by final name
  box: Detection['box'];
}

export type PipelineEvent =
  | { type: 'detected'; detections: Detection[]; omitted: number; elapsedMs: number }
  | { type: 'ocr-start'; detectionId: string; index: number; total: number }
  | { type: 'ocr-end'; detectionId: string; result: OcrResult | null }
  | { type: 'identified'; match: ProductMatch }
  | { type: 'stage'; stage: PipelineStage }
  | { type: 'done'; matches: ProductMatch[]; timings: PipelineTimings }
  | { type: 'error'; stage: PipelineStage; message: string; recoverable: boolean };

export type PipelineStage =
  | 'loading-model' | 'downloading-model' | 'detecting' | 'reading-label'
  | 'matching' | 'finished' | 'error';

export interface PipelineTimings {
  modelLoadMs: number | null;   // null on cache hit warm
  detectMs: number;
  ocrMs: number;                // total OCR budget used
  matchMs: number;
  totalMs: number;
  cold: boolean;
}
```

### `src/context/ScanContext.tsx`
- React context holding:
  - `sourceImage: { objectUrl: string; width: number; height: number; detectorCanvas: HTMLCanvasElement | ImageBitmap } | null`
  - `detections`, `matches`, `stage`, `timings`, `error`
  - `omittedCount`
  - Actions: `setSourceFromFile(file: File)`, `startPipeline()`, `retryOcr(detectionId?)`, `reset()`, `manualCorrect(detectionId, productId)`.
- Creates object URLs; **revokes on reset/unmount** and after thumbnails consumed on retake.
- Persist nothing to `localStorage` (photo privacy).
- If `/results` mounts with `sourceImage === null` → `navigate('/', { replace: true })`.

### `src/pages/Home.tsx`
- Minimal heading (“Grocery Scanner”), privacy one-liner (“Photos stay on your device; inference runs in-browser”).
- Model status chip: cold download (progress %) → ready / failed+retry.
- `<CameraInput>` primary: `Take a Picture` (`accept="image/*" capture="environment"`).
- Separate secondary control: gallery upload (same input without `capture`, or second input).
- On file chosen: build detector-sized image + full-res image into context, `navigate('/results')` and kick pipeline.
- EXIF orientation: use `createImageBitmap(file, { imageOrientation: 'from-image' })` with canvas fallback; verify on iOS Safari.
- Downscale detector input to max side 416–640 (match model letterbox); retain full-res for OCR crops.

### `src/pages/Results.tsx`
- Header: stage banner (`StageBanner`), retake, retry (OCR), error region.
- Photo panel: original image + `<ImageOverlay>` boxes scaled to displayed size (resize observer or CSS aspect-ratio box).
- Progressive list: provisional detections append immediately on `detected`; each row updates on `identified`/`ocr-end`.
- Final grouping: same `displayName` → one card with `×count` and merged crops.
- Omitted note: “N lower-confidence items not shown” when `omittedCount > 0`.
- Manual correction: row menu → searchable product list from bundled catalog (filter by detector class first).
- No fake progress: stage transitions only from pipeline events; OCR stage shows `Reading label i/n` only when worker actually processing.

### `src/components/CameraInput.tsx`
- Props: `onFile(file: File): void`, `capture?: boolean`, `label: string`.
- Hidden `<input type="file" accept="image/*">` + large accessible button.
- Optional preview before confirm is out of scope (keep minimal) — immediate handoff.

### `src/components/ImageOverlay.tsx`
- Props: `imageUrl`, `imageNaturalSize`, `detections: { id, box, className, score, highlight? }[]`.
- Absolutely positioned boxes in % coordinates; label chips with class + score.
- Touch-friendly; no scroll-jacking.

### `src/components/ProductRow.tsx`
- Props: `match: ProductMatch`, `onCorrect(id: string): void`, `onRetryOcr(id: string): void`.
- Layout: crop thumbnail (left), name + variant, `×count`, `ConfidenceBadge`, ingredient line (if any), actions.
- States: provisional (skeleton name “Detecting…” / class name), ocr-pending spinner on label, identified, unknown (“Unidentified item” + correct CTA).

### `src/components/StageBanner.tsx`
- Renders current `PipelineStage` with real subtext (e.g. “Reading label 2/4 — 3.1s”).

### `src/components/ConfidenceBadge.tsx`
- Displays integer 0–100 + qualitative band (low <50, medium 50–74, high ≥75). Tooltip/text: “Estimated, not calibrated.”

### `src/components/UnknownRow.tsx`
- Variant of ProductRow for non-matches: class name shown, crop, “Can’t identify — choose product” flow.

### `src/components/ErrorBanner.tsx`
- Model download failure, WASM backend failure, OCR worker crash, image decode failure. Each with retry action and short human message. No stack traces to users.

---

## `src/inference/` — pure-ish modules (no React imports)

### `src/inference/imageUtils.ts`
- `decodeFileToBitmap(file)` with EXIF orientation.
- `downscaleForDetector(bitmap, maxSide=416)` → ImageBitmap/HTMLCanvasElement + scale factors stored for box mapping.
- `cropRegion(fullRes, boxNormalized, padRatio)` → canvas blob/ImageBitmap for OCR.
- `enhanceForOcr(canvas)` → grayscale + contrast stretch + optional threshold variants (ordered attempts list).
- `makeThumb(canvas, maxSide=128)` → data URL or blob for ProductRow.

### `src/inference/detector.ts`
- `loadDetector({ onProgress }): Promise<LoadedDetector>`
  - Fetch `/models/groceries.onnx` + `.meta.json` with progress (Content-Length when available).
  - `YOLO.load(url)`; default backend selection; **never require WebGPU** — CPU/WASM fallback must work.
  - Cache: browser HTTP cache + optional Cache API named `model-v1`; expose `isWarm` for timings.
- `detect(image, { conf: 0.20, iou: 0.55 }): Detection[]`
  - Map model output → `Detection` with meta class names.
  - Drop `score < 0.20`.
  - **NMS/dedupe:** remove overlapping duplicates (IoU threshold e.g. ≥0.7 same class); **never** merge adjacent distinct items (IoU lower or different centers).
  - Sort by score desc; keep top **20** for display; return `omitted` count.
- Document ONNX output parsing for detection vs segmentation-fallback (boxes only).

### `src/inference/ocr.ts`
- Singleton Tesseract worker: `createWorker('eng')` loaded **after** detection starts (lazy).
- `readLabels(detections, fullRes, budget: { maxCrops: 4, maxMs: 8000 }): AsyncGenerator<OcrEvent>`
  - Skip `isProduce`.
  - Rank crops: larger area + sharper (Laplacian variance or simply area × text-likeness heuristic) first.
  - Skip crops with `heightPx < 60` unless first pass desperate.
  - Per crop: try original → enhanced grayscale → threshold; stop at first token yield.
  - Upscale small labels ×2 before OCR.
  - Emit progress for `Reading label i/n`.
  - Enforce wall-clock budget; abandon remaining crops with `null` result (matcher proceeds generic).
- `terminateWorker()` on reset; never block `done` on straggler OCR — pipeline resolves when budget ends.

### `src/inference/normalize.ts`
- `normalizeOcrText(raw): string[]`
  - lowercase, strip punctuation, `%` ↔ `percent`, common OCR confusions (0/O, l/1, rn/m) in token-level fuzzy stage not here.
  - Split tokens; keep alphanumeric + `%`.
- `tokenSimilarity(a, b): number` — normalized edit distance (Levenshtein / max len).
- `scoreTokenOverlap(tokens: string[], candidates: string[]): number` in [0,1].

### `src/inference/matcher.ts`
- `matchDetection(det: Detection, ocr: OcrResult | null, catalog: Product[]): ProductMatch` (confidence fields computed via `confidence.ts`).
- **Filter** catalog by `detectorClasses` contains `det.className` (produce: species only, never brand).
- **Brand rule:** include brand only if brand tokens appear in OCR (fuzzy).
- **Variant rule:** specific variant (e.g. 2%) only if discriminating `variantTokens` present in OCR; else collapse to parent.
- **Hierarchy resolution:**
  1. exact brand+variant+category match → that product
  2. brand+category → brand generic (e.g. “Great Value Milk”)
  3. category only → “Milk”
  4. detector class unreliable / no catalog candidate → `Unidentified item`
  5. conflict between candidates → shared parent (`parentName`), never invent specificity.
- **No popularity ranking** to break ties toward specificity — margin uses score gap of OCR agreement only.
- `groupMatches(matches): ProductMatch[]` — group by final `displayName` (+ brand), sum `count`, keep max confidence, merge box list for overlay highlight.

### `src/inference/confidence.ts`
- `estimateConfidence(parts: { detection: number; ocrMatch: number; candidateMargin: number; isProduce: boolean }): number`
  - Packaged: `round(100 * (0.65*detection + 0.25*ocrMatch + 0.10*margin))`, all terms clamped [0,1].
  - Produce: omit OCR, renormalize weights: `round(100 * (0.65/0.75*detection + 0.10/0.75*margin))` i.e. detection 0.65/0.75, margin 0.10/0.75.
  - Conflicting OCR (multiple strong but incompatible product lines) → reduce effective `ocrMatch` and cap specificity before calling confidence.
- Export pure function for unit tests (ranking stability).

### `src/inference/pipeline.ts`
- Orchestrator: `runPipeline(input: ScanInput, emitter: (e: PipelineEvent) => void, opts): Promise<void>`
- Order:
  1. stage `loading-model` / `downloading-model` (if not warm)
  2. stage `detecting` → `detector.detect` → emit `detected` (with provisional matches stubbed from class names)
  3. stage `reading-label` → async OCR budget, per-crop `ocr-start` / `ocr-end`
  4. each OCR completion → `matchDetection` → emit `identified`
  5. After budget or all done: final `groupMatches` → stage `matching` → `done` with timings (`cold` = model load occurred this session)
  6. Any thrown error → `error` event with stage context; recoverable flag for retry.
- Must not import React. Emits only; UI subscribes.

### `src/catalog/loadCatalog.ts`
- `import catalog from '@/data/products.json'` — typed `Product[]`.
- `getCatalog(): Product[]`, `byDetectorClass(className)`, `searchProducts(q, detectorClass?)` for manual correction UI.
- Validate shape in dev/test (`catalog.schema.test.ts`).

---

## `src/data/products.json`
- Build artifact from `scripts/build_catalog.py`. Committed once generated (or regenerated in CI with cache). Schema as above. ≥60 entries.

---

## `tests/`

### `tests/setup.ts`
- Jest-dom matchers, canvas stubs if needed, fake timers where appropriate (never fake OCR completion in integration without explicit clock).

### `tests/fixtures/manifest.json`
```json
{
  "images": [
    {
      "file": "single-item/great-value-2pct-milk.jpg",
      "expected": [
        { "displayName": "Great Value 2% Milk", "minConfidence": 40 }
      ],
      "falsePositivesForbidden": ["Great Value Whole Milk"],
      "notes": "Front label readable, single jug",
      "license": "CC0 captured by project"
    },
    {
      "file": "mixed-table/table-01.jpg",
      "expected": [ ... 3–10 items ... ],
      "status": "NOT TESTED"
    }
  ],
  "coverage": {
    "singleItem": 5,
    "mixedTable": 5,
    "occludedFridge": 2
  }
}
```
- Rules: **real photos or licensed fixtures only** — never catalog thumbnails. Missing file → test asserts `status: 'NOT TESTED'` and skips (does not fail CI red for missing binary, but reports in summary).

### `tests/unit/matcher.hierarchy.test.ts`
- exact → brand → category resolution order; Unidentified fallback; shared-parent conflict resolution.

### `tests/unit/matcher.milk-variant.test.ts`
- “Great Value” + “2%” OCR → 2% product; “Great Value” only → brand milk; no brand OCR → generic Milk; whole vs 2% conflict → Milk parent.

### `tests/unit/matcher.fuzzy-no-ocr.test.ts`
- OCR null → detector-class generic only; OCR garbage tokens → generic; fuzzy “organi c” → organic variant only if token sim ≥ threshold.

### `tests/unit/matcher.duplicates.test.ts`
- Two boxes same product → count 2; overlapping duplicate boxes same physical item → count 1 after NMS.

### `tests/unit/matcher.adjacent-boxes.test.ts`
- Adjacent milk jugs IoU low → both kept; identical box re-detected → deduped.

### `tests/unit/matcher.unknowns.test.ts`
- Class not in catalog → Unidentified; produce always species name not brand.

### `tests/unit/confidence.ranking.test.ts`
- Weighted formula exact values; produce renormalization; higher OCR agreement ranks above equal detection.

### `tests/unit/normalize.test.ts`
- `%`/percent, case, punctuation, edit-distance similarity bounds.

### `tests/unit/detector.nms.test.ts`
- Pure NMS/dedupe function tests (extract pure helper if model runtime not mockable in jsdom).

### `tests/integration/pipeline.events.test.ts`
- Mock detector + mock OCR generator; assert event order: stage loading → detected → ocr-start → identified → done; error path; omitted count propagated; OCR budget abandonment still emits done.

### `tests/integration/catalog.schema.test.ts`
- Every product has required fields; `detectorClasses ⊆` prompts; ≥60 entries; produce/packaged count bands; no empty `sourceUrl`; duplicate id check.

### `tests/e2e/smoke.navigation.test.ts`
- Route `/results` without state redirects to `/`; context reset revokes object URLs (spy).

---

## Module independence rules (enforced by import boundaries)

| Module | May import | Must not import |
|--------|------------|-----------------|
| `inference/*` | `types/contracts`, `catalog/loadCatalog`, `data/products.json` (matcher only) | React, pages, components |
| `components/*` | React, contracts, other components | `inference/detector` internals (only via pipeline events / context) |
| `pages/*` | components, context, contracts | raw ONNX/tesseract APIs |
| `scripts/*` | Python only | src TS |
| `context/*` | pipeline orchestrator, imageUtils, contracts | page components |

---

## Asset & cache summary

| Asset | Where | Cache strategy |
|-------|-------|----------------|
| `groceries.onnx` | `public/models/` | HTTP immutable + progress UI + retry |
| tesseract eng traineddata + wasm | CDN default or self-host `public/ocr/` | Cache API; load after detection |
| `products.json` | bundled in JS chunk | app build cache |
| Object URLs (photo/crops) | memory | revoke on reset/unmount |

---

## Out of scope (do not add folders for)

- Backend/API routes, auth, databases.
- WebGPU-only code paths as requirement.
- SKU-level catalog (10k products), price APIs, barcode scanner.
- Service worker PWA (optional stretch; not required).
- Committing `.pt` weights or any server inference.
