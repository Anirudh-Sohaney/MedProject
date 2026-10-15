# On-Device Grocery Scanner (Netlify Prototype)

Snap a photo of groceries — get product names, brands/variants when the label supports them, and estimated confidence. **All inference runs in the browser** (Ultralytics YOLOE ONNX + tesseract.js OCR). Static deploy to Netlify. No backend, no hosted AI APIs, no PyTorch weights on phones.

> Implementation documentation only in this pass: structure and contracts are specified in [`DIRECTORY.md`](./DIRECTORY.md), [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), and [`docs/VALIDATION.md`](./docs/VALIDATION.md). Application code is built in a subsequent execution phase.

---

## Fixed stack

| Concern | Choice |
|---------|--------|
| UI | Vite + React + TypeScript, routes `/` and `/results` |
| Targets | Mobile Safari/Chrome, 320–430px, no horizontal scroll |
| Detector | Ultralytics **YOLOE-26n** → `yoloe-26n-seg.pt` → fixed-vocab ONNX @ 416×416 → `public/models/groceries.onnx` |
| Inference runtime | `@ultralytics/yolo` (`YOLO.load('/models/groceries.onnx')`, `predict(..., { conf: 0.20, iou: 0.55 })`); default backend, CPU/WASM fallback; **WebGPU never required** |
| OCR | `tesseract.js`, one English worker, after detection; full-res crops; budget 4 crops / 8 s |
| Catalog | Build-time `scripts/build_catalog.py` → bundled `src/data/products.json` (≥60 entries, aim 100) |
| Deploy | Static Netlify (`netlify.toml`: build `npm run build`, publish `dist`, SPA `/* → /index.html 200`) |

---

## Repository layout (summary)

```
src/pages/          Home, Results
src/components/     CameraInput, ImageOverlay, ProductRow, StageBanner, …
src/inference/      detector, ocr, matcher, pipeline, normalize, confidence, imageUtils
src/context/        ScanContext (photo + results across routes)
src/types/          contracts.ts (Detection, ProductMatch, PipelineEvent, …)
src/data/           products.json (generated)
scripts/            prompts.py, export_model.py, build_catalog.py
public/models/      groceries.onnx + meta.json
tests/              unit + integration + fixtures/manifest.json
docs/               ARCHITECTURE.md, VALIDATION.md
netlify.toml        build + SPA redirect
```

Full per-file responsibilities: **[DIRECTORY.md](./DIRECTORY.md)**.

---

## Developer workflow

```bash
# 1. JS deps
npm ci

# 2. Python export env (build machine only)
python -m venv .venv && source .venv/bin/activate
pip install -r scripts/requirements.txt

# 3. Export model → public/models/groceries.onnx (+ meta)
python scripts/export_model.py

# 4. Build catalog → src/data/products.json
python scripts/build_catalog.py

# 5. Develop / test / build
npm run dev
npm run test
npm run build
npm run preview
```

**Netlify Git deploy:** connect repo; build command `npm run build`, publish directory `dist` (already in `netlify.toml`). Model file must be present in `public/models/` at build time (commit ONNX if size policy allows, or restore from CI cache/artifact before build).

---

## Behavior guarantees (spec anchors)

- **Labels, not SKUs:** detector vocabulary is 35–50 visible object types (`scripts/prompts.py`); catalog maps types → real Walmart-style products with brands and variants.
- **Defensible specificity:** brand only with matching OCR text; variant (e.g. 2%, old fashioned) only with discriminating tokens; otherwise parent name; else `Unidentified item`. No popularity-based guessing.
- **Confidence:** estimated 0–100, uncalibrated: `round(100 × (0.65·detection + 0.25·OCR + 0.10·margin))`; produce drops OCR and renormalizes.
- **Progressive UI:** provisional detections on `detected`; cards refine as OCR completes; stages are real events (`Loading model → Detecting → Reading label i/n → Matching → Finished`).
- **Privacy:** photos processed on-device; object URLs revoked after use; `/results` without session redirects to `/`.

---

## Verification (must be reported, not assumed)

See **[docs/VALIDATION.md](./docs/VALIDATION.md)** for the full checklist and report template. At delivery, publish:

- Catalog count (produce / packaged breakdown)
- Per-image detected / correct / missed / false positives on the fixture set
- Cold and warm timings (model load, detect, OCR, total), device + browser
- Model file size; export mode (detection vs seg fallback)
- Failures and `NOT TESTED` fixtures
- iPhone performance: **verified only on physical hardware; otherwise state unverified**

---

## References

- [Ultralytics YOLOE](https://docs.ultralytics.com/models/yoloe/)
- [ultralytics/inference web](https://github.com/ultralytics/inference/tree/main/web)
- [tesseract.js](https://github.com/naptha/tesseract.js)
- [Open Food Facts API](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- Walmart sample data: [luminati-io/Walmart-dataset-samples](https://github.com/luminati-io/Walmart-dataset-samples)

---

## Status

| Phase | State |
|-------|-------|
| Structure & contracts | **Complete** |
| Model export + catalog scripts | **Complete** (`scripts/export_model.py`, `scripts/build_catalog.py`) |
| App inference + UI | **Complete** (`src/inference/*`, `src/pages/*`, `src/components/*`) |
| Tests + fixtures + verification report | **Complete** (13 test suites, 45 tests passing; see [docs/VALIDATION-report.md](./docs/VALIDATION-report.md)) |
