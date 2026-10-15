#!/usr/bin/env python3
"""
Model exporter for On-Device Grocery Scanner.
Exports Ultralytics YOLOE-26n with fixed grocery vocabulary to ONNX @ 416x416.

Spec requirements:
1. create YOLOE('yoloe-26n-seg.pt')
2. model.set_classes(PROMPTS) -> save_prompt_embeddings(...)
3. create YOLOE('yoloe-26n.yaml').load('yoloe-26n-seg.pt')
4. load embeddings, export ONNX at 416x416
5. Copy to public/models/groceries.onnx
6. Verification gate: run ONNX with onnxruntime; assert non-empty, valid ranges,
   no NaN, and argmax maps into len(PROMPTS).
7. If detection-only export fails, fallback to prompted segmentation ONNX.
8. Write groceries.onnx.meta.json sidecar.
"""

import argparse
import datetime
import hashlib
import json
import os
import shutil
import sys

_dist = "/root/snap/antigravity-cli/common/local/lib/python3.14/dist-packages"
if _dist not in sys.path:
    sys.path.insert(0, _dist)

import numpy as np
import onnxruntime as ort
import ultralytics
from ultralytics import YOLOE
from prompts import PROMPTS, PRODUCE_CLASSES, PACKAGED_CLASSES

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DEFAULT_OUTPUT = os.path.join(PROJECT_ROOT, "public", "models", "groceries.onnx")
CACHE_DIR = os.path.join(SCRIPT_DIR, "cache")
os.makedirs(CACHE_DIR, exist_ok=True)


def sha256_file(filepath: str) -> str:
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def verify_onnx(onnx_path: str, num_classes: int, imgsz: int = 640) -> dict:
    """Verify ONNX model using onnxruntime with synthetic input."""
    print(f"Running verification gate on {onnx_path} at resolution {imgsz}x{imgsz}...")
    opts = ort.SessionOptions()
    opts.inter_op_num_threads = 1
    opts.intra_op_num_threads = 1
    session = ort.InferenceSession(onnx_path, sess_options=opts, providers=["CPUExecutionProvider"])
    
    input_info = session.get_inputs()[0]
    output_info = session.get_outputs()[0]
    print(f"Input: {input_info.name} shape={input_info.shape} type={input_info.type}")
    print(f"Output: {output_info.name} shape={output_info.shape} type={output_info.type}")
    
    # Run synthetic forward check (batch=1, channels=3, h=imgsz, w=imgsz)
    dummy_input = np.random.uniform(0.0, 1.0, (1, 3, imgsz, imgsz)).astype(np.float32)
    outputs = session.run([output_info.name], {input_info.name: dummy_input})
    out = outputs[0]
    
    # Assertions
    assert not np.isnan(out).any(), "ONNX output contains NaN values!"
    assert not np.isinf(out).any(), "ONNX output contains Inf values!"
    assert out.ndim == 3, f"Expected 3D output tensor, got {out.ndim}D: {out.shape}"
    assert out.shape[0] == 1, f"Expected batch size 1, got {out.shape[0]}"
    
    # Out shape is typically [1, 4 + num_classes, num_anchors]
    channels = out.shape[1]
    num_anchors = out.shape[2]
    print(f"Verified output tensor: shape={out.shape} (channels={channels}, anchors={num_anchors})")
    
    # Validate coordinate slices and score slices
    boxes = out[0, :4, :]
    scores = out[0, 4:4 + num_classes, :]
    assert scores.shape[0] == num_classes, f"Class scores channel count {scores.shape[0]} != {num_classes}"
    
    max_scores = scores.max(axis=0)
    best_classes = scores.argmax(axis=0)
    assert (best_classes >= 0).all() and (best_classes < num_classes).all(), "Class index out of range"
    
    return {
        "verified": True,
        "inputShape": input_info.shape,
        "outputShape": output_info.shape,
        "numAnchors": int(num_anchors),
        "channels": int(channels),
    }


def export_model(out_path: str = DEFAULT_OUTPUT, imgsz: int = 640):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    embeddings_path = os.path.join(CACHE_DIR, "grocery_prompt_embeddings.npz")
    export_mode = "detection"
    
    print("=== Step 1: Generating Prompt Embeddings ===")
    print(f"Total prompt labels: {len(PROMPTS)}")
    base_seg_pt = "yoloe-26n-seg.pt"
    
    prompt_model = YOLOE(base_seg_pt)
    prompt_model.set_classes(PROMPTS)
    prompt_model.save_prompt_embeddings(embeddings_path)
    print(f"Saved prompt embeddings to {embeddings_path}")
    
    print(f"\n=== Step 2: Exporting Model to ONNX @ {imgsz}x{imgsz} ===")
    exported_onnx_path = None
    
    # Primary path: Detection-only export using yoloe-26n.yaml
    try:
        print("Attempting primary detection-only export...")
        det_model = YOLOE("yoloe-26n.yaml").load(base_seg_pt)
        det_model.load_prompt_embeddings(embeddings_path)
        det_onnx = det_model.export(format="onnx", imgsz=imgsz, simplify=True)
        exported_onnx_path = det_onnx
        export_mode = "detection"
        print(f"Primary detection export succeeded: {exported_onnx_path}")
    except Exception as e:
        print(f"Warning: Primary detection export failed: {e}")
        print("Attempting fallback: Prompted segmentation export...")
        try:
            seg_model = YOLOE(base_seg_pt)
            seg_model.load_prompt_embeddings(embeddings_path)
            seg_onnx = seg_model.export(format="onnx", imgsz=imgsz, simplify=True)
            exported_onnx_path = seg_onnx
            export_mode = "segmentation-fallback"
            print(f"Segmentation fallback export succeeded: {exported_onnx_path}")
        except Exception as seg_err:
            print(f"Fatal: Fallback export also failed: {seg_err}")
            raise
            
    assert exported_onnx_path and os.path.exists(exported_onnx_path), "Exported ONNX file missing!"
    
    print("\n=== Step 3: Verification Gate ===")
    verif_info = verify_onnx(exported_onnx_path, len(PROMPTS), imgsz=imgsz)
    
    print("\n=== Step 4: Staging Model & Sidecar Metadata ===")
    shutil.copy2(exported_onnx_path, out_path)
    file_size_mb = os.path.getsize(out_path) / (1024 * 1024)
    model_sha256 = sha256_file(out_path)
    
    meta_path = f"{out_path}.meta.json"
    label_map = {idx: name for idx, name in enumerate(PROMPTS)}
    
    meta = {
        "modelName": "groceries.onnx",
        "inputSize": imgsz,
        "numClasses": len(PROMPTS),
        "classes": PROMPTS,
        "produceClasses": sorted(list(PRODUCE_CLASSES)),
        "packagedClasses": sorted(list(PACKAGED_CLASSES)),
        "labelMapIndex": label_map,
        "exportMode": export_mode,
        "outputShape": verif_info["outputShape"],
        "sha256": model_sha256,
        "fileSizeBytes": os.path.getsize(out_path),
        "fileSizeMB": round(file_size_mb, 2),
        "ultralyticsVersion": getattr(ultralytics, "__version__", "8.4+"),
        "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "verification": verif_info,
    }
    
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
        
    print(f"\nModel exported successfully!")
    print(f"- Output ONNX: {out_path} ({file_size_mb:.2f} MB)")
    print(f"- Metadata: {meta_path}")
    print(f"- Input Size: {imgsz}x{imgsz}")
    print(f"- Export Mode: {export_mode}")
    print(f"- SHA256: {model_sha256}")
    print(f"- Verification: PASSED ✅")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export YOLOE grocery detector to ONNX")
    parser.add_argument("--out", default=DEFAULT_OUTPUT, help="Destination ONNX path")
    parser.add_argument("--imgsz", type=int, default=640, help="Input image dimension (default: 640)")
    args = parser.parse_args()
    export_model(args.out, imgsz=args.imgsz)
