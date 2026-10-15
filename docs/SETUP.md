# Grocery Scanner — Setup, Training & Deployment Guide

This document provides complete instructions for replicating the environment, training the MobileNetV3 grocery classifier, exporting models to ONNX, running real-world validation benchmarks, executing test suites, and deploying the static web application to Netlify.

---

## 1. System Architecture Overview

The scanner uses a **two-stage on-device computer vision pipeline** designed for client-side execution in desktop and mobile browsers:

```
[ Input Photo ]
       │
       ▼
[ YOLO11 Detector ] ───▶ Generates candidate grocery bounding boxes (640×640)
       │
       ▼
[ Image Cropper ] ─────▶ Extracts normalized crops for each detection
       │
       ▼
[ MobileNetV3-Large ] ─▶ 52-class batched classification (224×224, Top-1/Top-3 probabilities)
       │
       ▼
[ Hierarchical Match ] ─▶ Exact Variant → Brand Generic → Category Generic → Unknown Fallback
       │
       ▼
[ Duplicate Grouping ] ─▶ Merges identical items with physical quantity multipliers (×2, ×3)
       │
       ▼
[ Results UI ] ────────▶ Two-page responsive workflow (`/` and `/results`) with manual edit affordances
```

**Key Architectural Guarantees:**
- **Zero Cloud AI Dependencies:** Runs entirely client-side via ONNX Runtime Web (WASM / WebGPU). No external APIs, no OpenRouter, no monthly billing, no API keys committed.
- **100% Produce Integrity:** Single-ingredient produce (apples, bananas, carrots, oranges) never hallucinate processed brand names or artificial ingredients.
- **Predictable Hierarchical Fallback:** Ambiguous package variants collapse to parent brands or categories rather than guessing unverified sub-variants.

---

## 2. Prerequisites & Environment Setup

### 2.1 System Requirements
- **Node.js:** v18.0.0 or higher (v20+ recommended)
- **npm:** v9.0.0 or higher
- **Python:** v3.10 or higher
- **Hardware:** CPU with AVX2/SIMD support, or GPU with CUDA / WebGPU support

### 2.2 Python Virtual Environment
Install the machine learning and benchmarking dependencies:

```bash
# From repository root:
python3 -m venv .venv
source .venv/bin/activate

# Install PyTorch, Ultralytics YOLO, ONNX Runtime, and image libraries
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install ultralytics onnx onnxruntime pillow numpy requests
```

### 2.3 Node.js Frontend Dependencies
Install the web application dependencies:

```bash
npm install
```

---

## 3. Dataset Construction

The training dataset combines authentic package photos from **Open Food Facts** and produce photography from the **Grocery Store Dataset**:

```bash
python3 scripts/download_dataset.py
```

### What this script does:
1. Clones Marcus Klasson's `GroceryStoreDataset` (producing 81 classes, produce items, cartons).
2. Queries the Open Food Facts API for authentic high-resolution package images (Cheerios, Oreo, Quaker Oats, Jif, Campbell's, Chobani, Heinz, etc.).
3. Normalizes 52 canonical classes into `dataset/classes.json`.
4. Assembles a partitioned dataset with **strict session-based isolation** to eliminate data leakage:
   - `dataset/train/`: 2,273 authentic images (~70%)
   - `dataset/val/`: 466 authentic images (~15%)
   - `dataset/test/`: 539 authentic images (~15%)
   - `dataset/test/unknown/`: 9 out-of-catalog negative distractors (mugs, laptops, pens) for rejection calibration.

---

## 4. Classifier Training & Evaluation

### 4.1 Training MobileNetV3-Large
Fine-tune a pretrained MobileNetV3-Large model on the 52 canonical grocery classes:

```bash
python3 scripts/train_classifier.py
```

**Training Details:**
- **Pretrained Weights:** `MobileNet_V3_Large_Weights.DEFAULT` (ImageNet-1K).
- **Head Replacement:** Final classifier layer replaced with `Linear(1024, 52)`.
- **Warmup Phase:** 3 epochs training only the head with AdamW (`lr=1e-3`), backbone frozen.
- **Fine-Tuning Phase:** 7 epochs unfreezing top feature blocks 11–16 with `CosineAnnealingLR` (`lr=1e-4` down to `1e-6`).
- **Data Augmentation:** Random resized crops (0.75–1.0 scale), horizontal flips, color jitter, affine rotation (±15°).
- **Validation Metric:** **94.17% Top-1 Accuracy**, **97.67% Top-3 Accuracy**.
- **Checkpoint Output:** `models/best_mobilenet_v3.pt`

### 4.2 Independent Test Evaluation
Run evaluation against the completely held-out test split:

```bash
python3 scripts/evaluate_classifier.py
```

**Evaluation Results:**
- **Test Top-1 Accuracy:** **93.75%**
- **Test Top-3 Accuracy:** **98.99%**
- **Unknown Item Rejection Rate (@ 0.70 confidence threshold):** **66.7%**
- Results logged to `models/classifier_eval_results.json`.

---

## 5. Model Export to ONNX

Export the PyTorch model to an optimized ONNX graph suitable for ONNX Runtime Web:

```bash
python3 scripts/export_classifier.py
```

**Export Specifications:**
- **File:** `public/models/product_classifier.onnx` (15.28 MB)
- **Metadata:** `public/models/classes.json` (52 canonical classes with nutritional labels and brand hierarchies)
- **Opset Version:** 17
- **Dynamic Batch:** Dimension 0 is dynamic (`batch_size`, supporting 1 to 20 crops)
- **Input Dimension:** `[batch_size, 3, 224, 224]` (normalized with ImageNet mean/std)
- **Numerical Parity:** Max absolute difference between PyTorch and ONNXRuntime CPU is **0.000012** (well within the `< 1e-4` precision gate).

---

## 6. Real-World Validation Benchmark

Run the automated validation benchmark across 30 genuine, unaugmented grocery photographs (10 isolated, 10 mixed tabletop hauls, 10 occluded/refrigerator scenes):

```bash
python3 scripts/benchmark_real_images.py
```

### Outputs Generated:
- `models/real_images_benchmark.json`: Raw per-image bounding boxes, confidences, IoU matches, and latencies.
- `docs/ACCURACY_REPORT.md`: Comprehensive Markdown report detailing detection recall, precision, latency breakdowns, and failure mode analyses.

---

## 7. Frontend Verification & Testing

The test suite validates catalog schemas, hierarchical fallback logic, produce rules, duplicate grouping, NMS deduplication, and smoke route navigation:

```bash
# Run Vitest test suite
npm test

# Run type check and production Vite build
npm run build
```

**Current Verification Status:**
- **13 test suites**, **45 unit/integration tests**, **100% passing**.
- Production build emits static assets into `dist/` with WebAssembly binaries (`ort-wasm-simd-threaded.jsep-*.wasm` and `ultralytics_inference_web_bg-*.wasm`).

---

## 8. Deployment to Netlify

The application is architected as a **pure static Single Page Application (SPA)** with zero server-side compute or API backend dependencies.

### 8.1 Configuration (`netlify.toml`)
Ensure the following security and WebAssembly headers are configured in `netlify.toml`:

```toml
[build]
  publish = "dist"
  command = "npm run build"

[[headers]]
  for = "/*"
  [headers.values]
    # Required for SharedArrayBuffer and multi-threaded WASM inference in browser
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "credentialless"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### 8.2 Deployment Steps
1. Push changes to the `main` branch:
   ```bash
   git add -A
   git commit -m "feat: complete dedicated CV pipeline with MobileNetV3 and YOLO11"
   git push origin main
   ```
2. Netlify automatically triggers the build via Git webhook:
   - Runs `npm run build` (`tsc -b && vite build`)
   - Publishes `dist/` containing the compiled React application and `public/models/` ONNX assets.
3. Access the deployed application URL. All inference runs locally in the client's browser engine.
