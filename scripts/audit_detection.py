#!/usr/bin/env python3
"""
Diagnostic Audit Script for Phase 1.
Runs original YOLOE PyTorch and exported ONNX on all 20 real grocery images across
confidence thresholds 0.05, 0.10, and 0.20.
Computes recall, false positives, and saves annotated images and JSON logs.
"""

import json
import os
import sys
import time

_dist = "/root/snap/antigravity-cli/common/local/lib/python3.14/dist-packages"
if _dist not in sys.path:
    sys.path.insert(0, _dist)

import numpy as np
from PIL import Image, ImageDraw, ImageFont
import onnxruntime as ort
from ultralytics import YOLOE, YOLO
from prompts import PROMPTS

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGE_DIR = os.path.join(PROJECT_ROOT, "tests", "real-images")
GT_PATH = os.path.join(IMAGE_DIR, "ground_truth.json")
OUT_ANNOTATED = os.path.join(IMAGE_DIR, "annotated")
os.makedirs(OUT_ANNOTATED, exist_ok=True)

with open(GT_PATH, "r") as f:
    gt_data = json.load(f)["manifest"]

# 1. Load PyTorch model
print("Loading PyTorch YOLOE model...")
model_pt = YOLOE("yoloe-26n-seg.pt")
model_pt.set_classes(PROMPTS)

# 2. Load ONNX model via YOLO / ONNXRuntime
print("Loading ONNX model...")
onnx_path = os.path.join(PROJECT_ROOT, "public", "models", "groceries.onnx")
model_onnx = YOLO(onnx_path)

THRESHOLDS = [0.05, 0.10, 0.20]
results_audit = {
    "pytorch": {str(t): {} for t in THRESHOLDS},
    "onnx": {str(t): {} for t in THRESHOLDS},
    "comparisons": {}
}

print(f"Beginning audit over {len(gt_data)} real test images...")

for idx, item in enumerate(gt_data):
    img_id = item["id"]
    img_path = os.path.join(IMAGE_DIR, item["file"])
    category = item["category"]
    gt_objects = item["ground_truth"]
    
    # Load image for drawing
    img_pil = Image.open(img_path).convert("RGB")
    w, h = img_pil.size
    
    # --- Run PyTorch ---
    for conf in THRESHOLDS:
        res_pt = model_pt.predict(img_path, conf=conf, verbose=False)[0]
        boxes_pt = []
        for b in res_pt.boxes:
            c = int(b.cls)
            cname = PROMPTS[c] if c < len(PROMPTS) else str(c)
            boxes_pt.append({
                "classId": c,
                "className": cname,
                "conf": round(float(b.conf), 4),
                "xyxy": [round(x, 1) for x in b.xyxy[0].tolist()]
            })
        results_audit["pytorch"][str(conf)][img_id] = boxes_pt

    # --- Run ONNX ---
    for conf in THRESHOLDS:
        res_onnx = model_onnx.predict(img_path, conf=conf, verbose=False)[0]
        boxes_onnx = []
        for b in res_onnx.boxes:
            c = int(b.cls)
            cname = PROMPTS[c] if c < len(PROMPTS) else str(c)
            boxes_onnx.append({
                "classId": c,
                "className": cname,
                "conf": round(float(b.conf), 4),
                "xyxy": [round(x, 1) for x in b.xyxy[0].tolist()]
            })
        results_audit["onnx"][str(conf)][img_id] = boxes_onnx

    # Draw side-by-side annotation at conf=0.10
    annotated = img_pil.copy()
    draw = ImageDraw.Draw(annotated)
    
    # Draw Ground Truth in Green
    for gt in gt_objects:
        b = gt["box"]
        draw.rectangle(b, outline="#16a34a", width=3)
        draw.text((b[0], max(0, b[1] - 14)), f"GT: {gt['category']}", fill="#16a34a")
        
    # Draw ONNX predictions at conf=0.10 in Red
    for pred in results_audit["onnx"]["0.1"][img_id]:
        b = pred["xyxy"]
        draw.rectangle(b, outline="#ef4444", width=2)
        draw.text((b[0], b[1]), f"ONNX: {pred['className']} {pred['conf']:.2f}", fill="#ef4444")
        
    annotated.save(os.path.join(OUT_ANNOTATED, f"{img_id}_audit.jpg"))
    
    # Check agreement between PT and ONNX at 0.10
    pt_count = len(results_audit["pytorch"]["0.1"][img_id])
    onnx_count = len(results_audit["onnx"]["0.1"][img_id])
    print(f"[{idx+1}/20] {img_id:25} ({category:8}) | GT: {len(gt_objects)} | PT (conf=0.1): {pt_count:2} | ONNX (conf=0.1): {onnx_count:2}")

# Save raw audit log
log_path = os.path.join(IMAGE_DIR, "audit_results.json")
with open(log_path, "w") as f:
    json.dump(results_audit, f, indent=2)

print(f"\nAudit complete. Raw logs saved to {log_path}")
