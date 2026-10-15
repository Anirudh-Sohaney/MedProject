# Validation & Delivery — On-Device Grocery Scanner

How correctness, performance, and delivery are verified. No invented metrics; missing fixtures are explicitly `NOT TESTED`.

---

## 1. Test pyramid

| Layer | Runner | Scope |
|-------|--------|-------|
| Unit | Vitest | matcher hierarchy, milk variants, fuzzy/no-OCR, duplicates, adjacent boxes, unknowns, confidence ranking, normalize, NMS helper |
| Integration | Vitest (mocks) | pipeline event order, catalog schema |
| Route smoke | Vitest + Testing Library | `/results` redirect, context reset URL revoke |
| Manual device | iPhone Safari / Chrome Android + desktop Chrome | real ONNX, real OCR, timing |

Commands:
```bash
npm run test        # vitest run
npm run test:watch
npm run build       # tsc + vite build
npm run preview     # local static check before Netlify
```

---

## 2. Unit test matrix (spec → file)

| Spec requirement | Test file | Key assertions |
|------------------|-----------|----------------|
| exact → brand → category hierarchy | `tests/unit/matcher.hierarchy.test.ts` | exact product wins; brand-only → brand+category; no brand → category; no candidate → `Unidentified item`; conflict → shared `parentName` |
| milk variant conflict | `tests/unit/matcher.milk-variant.test.ts` | OCR “Great Value” + “2%” → GV 2% milk; “Great Value” only → GV Milk; no brand → Milk; “whole” vs “2%” both strong → parent `Milk` (no popularity tiebreak) |
| fuzzy / no OCR | `tests/unit/matcher.fuzzy-no-ocr.test.ts` | `ocr=null` → classifier generic only; garbage OCR → generic; near-miss tokens within edit distance → still match aliases; produce never gains brand from noise |
| duplicate counting | `tests/unit/matcher.duplicates.test.ts` | two NMS-distinct boxes same SKU → `×2`; overlapping duplicate same item → `×1`; group by displayName sums correctly |
| adjacent boxes | `tests/unit/matcher.adjacent-boxes.test.ts` | side-by-side items low IoU both kept; same-class high-IoU same-center deduped; different products high IoU not force-merged |
| unknowns | `tests/unit/matcher.unknowns.test.ts` | class absent from catalog → Unidentified + crop thumb; produce uses species not brand; low conf still shown up to top-20 |
| confidence ranking | `tests/unit/confidence.ranking.test.ts` | formula `round(100*(0.65*d+0.25*o+0.10*m))` exact samples; produce renormalized weights; higher ocrMatch sorts above equal detection; all terms clamped |
| normalization | `tests/unit/normalize.test.ts` | `%`/percent, case, punctuation strip, similarity bounds [0,1] |
| NMS/dedupe pure fn | `tests/unit/detector.nms.test.ts` | threshold behaviors independent of model runtime |

Fixtures for unit tests: inline JSON `Detection` / `OcrResult` / `Product` objects — no binary photos required.

---

## 3. Integration tests

### `tests/integration/pipeline.events.test.ts`
Mock `detector.detect` and OCR generator:
- Order: `stage loading/detecting` → `detected` → (`ocr-start` → `ocr-end` → `identified`)* → `done`.
- Omitted count flows through `detected` when >20 raw detections.
- OCR budget exhaustion still reaches `done` (no hang).
- Detector throw → `error` with stage `detecting`, `recoverable: false` → UI retake.
- Model load throw → `error` stage `loading-model`/`downloading-model`, retry path re-enters load.

### `tests/integration/catalog.schema.test.ts`
Against real `src/data/products.json`:
- ≥60 entries (aim 100); produce 15–25; packaged 45–75.
- Required fields non-empty; `detectorClasses ⊆` prompts from meta/prompts mirror.
- Unique `id`; no empty `sourceUrl`.
- Variant tokens present for GV milk 2%/whole and Quaker old fashioned/quick when those products exist.
- License/source notes file or report referenced (optional soft assert).

---

## 4. Photo fixtures (manual eval set)

Directory: `tests/fixtures/` with `manifest.json`.

| Bucket | Count required | Notes |
|--------|----------------|-------|
| `single-item/` | 5 | one clear package or produce on plain surface |
| `mixed-table/` | 5 | 3–10 grocery items, varied brands |
| `occluded-fridge/` | 2 | partial occlusion, dim fridge light |

Rules:
- **Real photos or licensed fixtures only** — never product catalog thumbnails.
- Each manifest entry: `file`, `expected[]` (`displayName`, `minConfidence`), `falsePositivesForbidden[]`, `license`, `notes`, optional `status`.
- If image file absent: `"status": "NOT TESTED"`; automated runner skips without failing CI; summary lists NOT TESTED files.
- Expected labels are hierarchy-aware (e.g. accept `Milk` or `Great Value 2% Milk` per `accept[]` when label partially readable).

### Per-image manual scorecard (fill during verification)

```
Image: tests/fixtures/mixed-table/table-01.jpg
Detected boxes:           7
Correct (expected match): 5
Missed (expected absent): 2   [list: yogurt cup, snack bag]
False positives:          1   [banana → false apple]
Warm detect+match ms:     1420
OCR budget ms:            7980
Device: iPhone 14 Safari 17 / Desktop Chrome 130
```

Aggregate in `docs/VALIDATION-report.md` (create at verification time — do not pre-fill invented numbers).

---

## 5. Runtime / delivery checklist

Must pass before calling the prototype delivered:

- [ ] `npm ci` clean on Node LTS
- [ ] `python scripts/export_model.py` produces ONNX + meta; onnxruntime synthetic forward check passes
- [ ] Detection-only failure path documented; seg fallback boxes verified if used
- [ ] `python scripts/build_catalog.py` ≥60 products; report lists counts + exclusions + licenses
- [ ] `npm run test` green (NOT TESTED fixtures listed, not failed)
- [ ] `npm run build` green; `dist/` contains `models/groceries.onnx`
- [ ] `npm run preview` — `/` and `/results` SPA navigation works; deep link `/results` cold → redirect `/`
- [ ] Mobile viewport 320–430px: no horizontal scroll, no clipped buttons
- [ ] Camera `capture="environment"` works on mobile Safari/Chrome; gallery path works
- [ ] EXIF-rotated photo displays and detects in correct orientation (iOS sample)
- [ ] Model cold download shows progress; airplane-mode failure shows retry
- [ ] OCR worker loads only after detect; produce skips OCR
- [ ] Provisional cards appear before OCR finishes; cards update on identify
- [ ] Grouped counts `×n` match distinct boxes
- [ ] Manual correction and retake work; object URLs revoked on reset (no leak over 5 retakes — heap snapshot optional)
- [ ] Static deploy preview (Netlify deploy preview or `netlify dev` / CI) — SPA redirect OK
- [ ] No `.pt` in `dist/`; no network calls to AI hosts at runtime (only model/OCR asset CDN + same-origin)
- [ ] Warm inference latency recorded; target 1–8 s detect path on tested devices
- [ ] iPhone performance marked verified only if a physical iPhone was used; else **unverified**

---

## 6. Performance measurement protocol

1. **Cold:** hard-reload / clear site data; open Home; time from `startPipeline` to `done` (`timings.cold === true`); record `modelLoadMs`, `detectMs`, `ocrMs`, `totalMs`.
2. **Warm:** immediate second scan without clearing cache; `modelLoadMs` may be null; record detect/total.
3. Repeat ≥3 runs per device; report median and range — never a single flattering number.
4. Record model file size (`ls -lh public/models/groceries.onnx`) and browser/device UA.
5. OCR can push total > detect budget; still report detect-only warm time against 1–8 s target, and note OCR separately.

### Report template (`docs/VALIDATION-report.md`)

```markdown
## Catalog
- Total products: N (produce: A, packaged: B)
- Sources: Walmart samples CSV, Open Food Facts
- Exclusions: …

## Model
- File: groceries.onnx (X.X MB)
- Export mode: detection | segmentation-fallback
- Classes: N prompts

## Timing (device / browser)
| Run | Cold total | Warm detect | Warm total | OCR | Notes |
|-----|------------|-------------|------------|-----|-------|
| 1   |            |             |            |     |       |

## Per-image accuracy
| Image | Detected | Correct | Missed | False positives |
|-------|----------|---------|--------|-----------------|
| ...   |          |         |        |                 |

## Failures / NOT TESTED
- ...

## iPhone
- Verified on: [device] OR Unverified (no physical iPhone in lab)
```

---

## 7. Explicit non-goals for validation

- No hosted-API baseline comparisons (out of stack).
- No mAP/precision suites beyond the fixture scorecard (prototype scope).
- No claim of calibrated probabilities — confidence is labeled estimated/uncalibrated everywhere in UI copy.
- No WebGPU-only timing claims; CPU/WASM path is the supported floor.
