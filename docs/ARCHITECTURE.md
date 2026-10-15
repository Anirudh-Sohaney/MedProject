# Architecture — On-Device Grocery Scanner

Fixed stack, single-page mobile web app, static Netlify deploy. All inference in-browser. No backend, no hosted AI APIs.

---

## 1. High-level data flow

```
[File from camera/gallery]
        │
        ▼
imageUtils.decodeFileToBitmap  ── EXIF orientation (iOS-safe)
        │
        ├──────────────────────────────┐
        ▼                              ▼
downscaleForDetector (≤416)     full-resolution ImageBitmap
        │                              │
        ▼                              │
detector.detect(conf=0.20, iou=0.55)   │
  → drop score<0.20                    │
  → NMS/dedupe (same-class overlap)    │
  → sort by score, top 20 + omitted    │
        │                              │
        ▼                              │
emit 'detected' (provisional UI)       │
        │                              │
        ▼                              ▼
ocr.readLabels (budget: 4 crops / 8s, skip produce)
  → per-crop: original → gray+contrast → threshold; ×2 upscale if short
  → emit ocr-start / ocr-end
        │
        ▼
matcher.matchDetection(det, ocr|null, catalog)
  → filter by detectorClasses
  → brand/variant evidence from OCR tokens only
  → hierarchy: exact → brand → category → Unidentified
        │
        ▼
confidence.estimateConfidence (packaged weights / produce renormalized)
        │
        ▼
emit 'identified' per item; group by final name → ×count
        │
        ▼
emit 'done' with PipelineTimings (cold/warm, modelLoadMs, detectMs, ocrMs, totalMs)
```

OCR never blocks terminal `done` beyond its wall-clock budget. Slow crops abandon with `null`; matcher emits generic classifier-only results.

---

## 2. Shared typed contract (`src/types/contracts.ts`)

All cross-module types are defined once. Inference modules return/emit these types; UI never redefines them.

### 2.1 `Detection`
Post-NMS, pre-OCR. Boxes normalized 0–1 on the detector image; `boxFull` maps the same region onto the full-resolution OCR bitmap using stored scale/letterbox factors.

| Field | Meaning |
|-------|---------|
| `id` | stable per-run id (index or hash) |
| `box` / `boxFull` | `x1,y1,x2,y2` |
| `className` | label from `PROMPTS` order via `groceries.onnx.meta.json` |
| `score` | detector confidence 0–1 |
| `isProduce` | from `PRODUCE_CLASSES` |

### 2.2 `OcrResult`
Tied to its `detectionId` (crop identity). Includes raw text, normalized tokens, crop height (for `<60px` skip rule), attempt count, duration.

### 2.3 `Product` (catalog row)
See DIRECTORY.md / build_catalog.py schema: `id, name, brand, category, detectorClasses, parentName, ingredientName, aliases, variantTokens, sourceUrl, image?`.

### 2.4 `ProductMatch`
UI-facing row: final `displayName`, brand/variant/category/ingredient, `confidence` (0–100 int), component scores, `cropThumbUrl`, `status`, optional `count` after grouping, and the overlay `box`.

### 2.5 `PipelineEvent` / `PipelineStage` / `PipelineTimings`
Event union: `detected | ocr-start | ocr-end | identified | stage | done | error`.

Stages (genuine, event-driven — no synthetic progress):
`loading-model` → `downloading-model` (if cold) → `detecting` → `reading-label` → `matching` → `finished` | `error`.

Timings always record `cold: boolean` (model loaded this session vs Cache/HTTP hit).

---

## 3. Pipeline event protocol

`pipeline.runPipeline(input, emit, opts)` is the only orchestrator. UI (via `ScanContext`) subscribes and applies events immutably.

| Event | When | UI reaction |
|-------|------|-------------|
| `stage: loading-model` / `downloading-model` | before `YOLO.load` | StageBanner + progress % |
| `stage: detecting` | before predict | spinner on photo |
| `detected` | after NMS/top-20 | append provisional cards (class name only), show omitted count |
| `stage: reading-label` | OCR budget start | banner “Reading label …” |
| `ocr-start` / `ocr-end` | per crop | row spinner → may stay provisional if null |
| `identified` | after match+confidence | replace provisional card fields |
| `stage: matching` | grouping pass | brief |
| `done` | budget or all OCR complete | finalize counts, enable retake/retry, show timings |
| `error` | any thrown / load failure | ErrorBanner + retry (recoverable) or retake |

Invariant: at least one `detected` before any `identified`. `done` always emitted unless unrecoverable `error` (then `error` + stage).

---

## 4. Detector contract

- Model: Ultralytics **YOLOE-26n** fixed-vocabulary ONNX, 416×416, file `public/models/groceries.onnx`.
- Runtime: `@ultralytics/yolo` — `YOLO.load('/models/groceries.onnx')`, `model.predict(image, { conf: 0.20, iou: 0.55 })`.
- Backend: default selection with CPU/WASM fallback. **WebGPU never required.**
- Class index → name: from `groceries.onnx.meta.json` (must match `scripts/prompts.py` order). Single source of truth at export time; runtime only reads meta.
- Export modes:
  - Primary: detection ONNX from YOLOE prompt embeddings.
  - Fallback: prompted **segmentation** ONNX; runtime uses box outputs only; meta `exportMode: 'segmentation-fallback'`.
- Client never loads `.pt` weights.

### Dedupe / NMS rules
- Discard `score < 0.20`.
- Remove duplicate overlapping boxes (high IoU, same class, same center region) → one detection.
- **Never** collapse adjacent distinct items (side-by-side jugs/bananas) — different centers / lower IoU threshold boundary tuned in tests.
- Display cap: 20 highest-confidence; expose `omitted` count in UI.

---

## 5. OCR contract

- Library: **tesseract.js**, one reusable `eng` worker, created **after** detection (not on app boot).
- Input: full-resolution crop from `boxFull`, not the 416 detector frame.
- Preprocess ladder per crop (stop at first useful tokens):
  1. native crop
  2. ×2 upscale if height < ~120px effective text height; always ×2 if label height < 60px and desperate pass allowed
  3. grayscale + contrast stretch
  4. binary threshold (Otsu or fixed mid)
- Skip: all `isProduce` classes; crops with height < 60px on first pass if unreadable.
- Ordering: largest / highest-area / sharpest packages first.
- Budget: **4 crops or 8 seconds**, whichever first; remaining crops get `ocr-result: null`.
- Non-blocking: pipeline emits `done` when budget expires even if worker busy; worker terminated on `reset()`.
- Token normalization lives in `normalize.ts` (shared with matcher).

---

## 6. Matcher hierarchy (deterministic)

Input: one `Detection` + optional `OcrResult` + catalog.

```
candidates = catalog.filter(p => p.detectorClasses.includes(det.className))

if candidates empty → Unidentified item

For each candidate compute:
  brandOK  = !p.brand OR fuzzy token match of brand in OCR
  variantHits = p.variantTokens ∩ OCR tokens (fuzzy)
  tokenScore = scoreTokenOverlap(OCR tokens, p.aliases ∪ p.name tokens ∪ variantTokens)

Produce (isProduce):
  → ignore brand entirely; displayName = species (title-case className)
  → still allow organic/variant only with explicit token evidence; else plain species

Packaged:
  specificity ladder (first that has evidence):
    1. brandOK AND all required variant tokens for that SKU  → exact product
    2. brandOK AND variant-ambiguous                         → brand + parent category ("Great Value Milk")
    3. category token match only                             → category ("Milk")
    4. none                                                  → Unidentified item

Conflicts (two high tokenScores, incompatible variants):
  → do not pick winner by popularity; resolve to shared parentName
  → conflicting OCR reduces ocrMatch term (see confidence)

Brand rule: brand text must be visible/matched; catalog popularity never justifies specificity.
Variant rule: discriminating tokens required (e.g. "2%", "whole", "quick", "old fashioned").
```

### Grouping
After all matches: group by `displayName` (+ brand); `count` = distinct boxes (post-NMS); confidence = max of members; overlay can highlight all member boxes.

---

## 7. Confidence model (uncalibrated estimate)

Implemented as pure function `estimateConfidence` in `confidence.ts`.

**Packaged goods** (all terms clamped to [0,1]):

```
confidence = round(100 * (0.65 * detection
                        + 0.25 * ocrMatch
                        + 0.10 * candidateMargin))
```

- `detection`: detector score.
- `ocrMatch`: token overlap / edit-distance agreement in [0,1]; reduced when OCR conflicts across candidates.
- `candidateMargin`: (best − secondBest) tokenScore gap, normalized.

**Produce** (omit OCR, renormalize remaining weights to sum 1):

```
w_det = 0.65 / 0.75
w_mgn = 0.10 / 0.75
confidence = round(100 * (w_det * detection + w_mgn * candidateMargin))
```

Display: integer 0–100 with explicit “Estimated confidence — not calibrated” affordance. Ranking of result list uses this value (and detection score as tiebreak).

---

## 8. Catalog contract

- Bundled `src/data/products.json`; fetched **only** at build time by `scripts/build_catalog.py`.
- Sources: Walmart dataset samples CSV + Open Food Facts API. Respect User-Agent and rate limits. No fabricated SKUs/images.
- Size targets: ≥60 verified entries (aim 100); 15–25 produce; 45–75 packaged with required variant matrix (GV milk 2%/whole, Quaker Old Fashioned/Quick, cereals, eggs, butter, cheese, pasta, rice, bread, yogurt, PB, canned beans, juices, frozen veg — brands varied).
- Dedup: barcode else normalized name+brand. Reject non-food and misleading photos.
- Every row: `sourceUrl` required for provenance; license notes in catalog report.

---

## 9. UI architecture

- Routes: `/` (Home), `/results` (Results) via `react-router-dom`.
- `ScanContext` holds image handles, detections, matches, stage, timings, omitted count; creates/revokes object URLs.
- `/results` without session → redirect `/`.
- Progressive rendering: provisional cards on `detected`; in-place update on `identified`.
- Overlay boxes: percentage coords on a fixed-aspect container matching the photo; resize-safe.
- Mobile constraints: 320–430px width, no horizontal scroll, no clipped controls, ≥44px touch targets.
- Privacy copy on Home: on-device only; no upload of photos to a server.

### Home responsibilities
- Model download/load state + retry.
- Camera input `accept="image/*" capture="environment"` + separate gallery input.
- EXIF-aware decode; detector downscale; retain full-res for OCR.

### Results responsibilities
- Photo + scaled boxes; stage banner with real events.
- Cards: name, ×count, estimated confidence, ingredient, crop thumb.
- Unknowns, manual correction (catalog search), retry OCR, retake, error banner.
- Show timings summary (cold/warm, seconds) after `done` for the required performance report.

---

## 10. Module boundaries

| Layer | Depends on | Forbidden |
|-------|------------|-----------|
| `src/inference/*` | contracts, normalize, catalog types | React, DOM page components |
| `src/catalog/*` | products.json | inference internals |
| `src/components/*` | contracts, styling | direct `YOLO.load` / tesseract worker |
| `src/pages/*` | components, context | raw model APIs |
| `src/context/*` | pipeline, imageUtils | page components (circular) |
| `scripts/*` | Python ecosystem | TS runtime |

Detector, OCR, matcher, pipeline are independently testable; pipeline is the only place that sequences side effects.

---

## 11. Build, deploy, cache

- Vite build → `dist/`; Netlify: `npm run build`, publish `dist`, SPA redirect `/* → /index.html 200`.
- Model + OCR assets: first-visit download with visible progress; HTTP cache + optional Cache API; failure → ErrorBanner + retry.
- `package-lock.json` committed; Node LTS via `.nvmrc`.
- Export/catalog scripts run on dev/CI machines (Python), never on the phone.

---

## 12. Performance measurement contract

Warm target: **1–8 s** inference (detect + match; OCR may extend wall clock but budget-capped).

Record on every verification run (manual or scripted):

| Metric | Source |
|--------|--------|
| modelLoadMs (null if warm cache) | pipeline timings |
| detectMs | pipeline |
| ocrMs / crops processed | pipeline + ocr events |
| totalMs | done event |
| cold vs warm | timings.cold |
| device + browser UA | manual log |
| model file size | file stats |
| catalog count | products.json length |

No invented metrics. Without a physical iPhone, mark iPhone performance **unverified** in the report.
