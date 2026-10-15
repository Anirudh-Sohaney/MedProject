#!/usr/bin/env python3
"""
scripts/export_classifier.py

Exports the trained PyTorch MobileNetV3-Large checkpoint to an optimized ONNX model:
- Input shape: [batch_size, 3, 224, 224] with dynamic batch dimension
- Output shape: [batch_size, num_classes] (raw logits)
- Saves to models/product_classifier.onnx and copies to public/models/product_classifier.onnx
- Saves class metadata to models/classes.json and copies to public/models/classes.json and src/data/classes.json
- Verifies numerical equivalence between PyTorch and ONNX Runtime
"""

import sys
_dist = "/root/snap/antigravity-cli/common/local/lib/python3.14/dist-packages"
if _dist not in sys.path:
    sys.path.insert(0, _dist)

import os
import json
import shutil
import numpy as np
import torch
import torch.nn as nn
from torchvision import models
import onnx
import onnxruntime as ort

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MODELS_DIR = os.path.join(PROJECT_ROOT, "models")
PUBLIC_MODELS_DIR = os.path.join(PROJECT_ROOT, "public", "models")
SRC_DATA_DIR = os.path.join(PROJECT_ROOT, "src", "data")
DATASET_DIR = os.path.join(PROJECT_ROOT, "dataset")

CHECKPOINT_PATH = os.path.join(MODELS_DIR, "best_mobilenet_v3.pt")
ONNX_EXPORT_PATH = os.path.join(MODELS_DIR, "product_classifier.onnx")
PUBLIC_ONNX_PATH = os.path.join(PUBLIC_MODELS_DIR, "product_classifier.onnx")

CLASSES_SRC = os.path.join(DATASET_DIR, "classes.json")
CLASSES_EXPORT_PATH = os.path.join(MODELS_DIR, "classes.json")
PUBLIC_CLASSES_PATH = os.path.join(PUBLIC_MODELS_DIR, "classes.json")
SRC_CLASSES_PATH = os.path.join(SRC_DATA_DIR, "classes.json")

os.makedirs(PUBLIC_MODELS_DIR, exist_ok=True)
os.makedirs(SRC_DATA_DIR, exist_ok=True)


def load_pytorch_model(checkpoint_path):
    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    num_classes = checkpoint["num_classes"]
    class_to_idx = checkpoint["class_to_idx"]

    model = models.mobilenet_v3_large(weights=None)
    in_features = model.classifier[0].in_features
    model.classifier = nn.Sequential(
        nn.Linear(in_features, 1024),
        nn.Hardswish(),
        nn.Dropout(p=0.3),
        nn.Linear(1024, num_classes)
    )
    model.load_state_dict(checkpoint["state_dict"])
    model.eval()
    return model, class_to_idx, num_classes


def main():
    print("=" * 60)
    print("Exporting MobileNetV3-Large to ONNX")
    print("=" * 60)

    model, class_to_idx, num_classes = load_pytorch_model(CHECKPOINT_PATH)
    idx_to_class = {v: k for k, v in class_to_idx.items()}
    ordered_classes = [idx_to_class[i] for i in range(num_classes)]

    print(f"Loaded checkpoint with {num_classes} classes.")

    # Prepare dummy input for ONNX tracing
    dummy_input = torch.randn(1, 3, 224, 224, dtype=torch.float32)

    # Export to ONNX
    print(f"Exporting ONNX to {ONNX_EXPORT_PATH}...")
    torch.onnx.export(
        model,
        dummy_input,
        ONNX_EXPORT_PATH,
        export_params=True,
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={
            "input": {0: "batch_size"},
            "output": {0: "batch_size"}
        }
    )

    # Verify ONNX model integrity
    onnx_model = onnx.load(ONNX_EXPORT_PATH)
    onnx.checker.check_model(onnx_model)
    onnx_size_mb = os.path.getsize(ONNX_EXPORT_PATH) / (1024 * 1024)
    print(f"ONNX model valid! Size: {onnx_size_mb:.2f} MB")

    # Verify numerical consistency with PyTorch
    print("Verifying numerical consistency between PyTorch and ONNX Runtime...")
    ort_session = ort.InferenceSession(ONNX_EXPORT_PATH, providers=["CPUExecutionProvider"])
    
    test_batch = np.random.randn(2, 3, 224, 224).astype(np.float32)
    with torch.no_grad():
        pt_out = model(torch.from_numpy(test_batch)).numpy()
    ort_out = ort_session.run(None, {"input": test_batch})[0]

    max_diff = np.max(np.abs(pt_out - ort_out))
    print(f"Max absolute difference between PyTorch and ONNX Runtime: {max_diff:.6f}")
    assert max_diff < 1e-4, f"Numerical discrepancy too large: {max_diff}"
    print("Numerical verification PASSED ✅")

    # Copy ONNX to public/models/
    shutil.copy2(ONNX_EXPORT_PATH, PUBLIC_ONNX_PATH)
    print(f"Copied ONNX to {PUBLIC_ONNX_PATH}")

    # Build and export classes.json
    with open(CLASSES_SRC, "r", encoding="utf-8") as f:
        meta_data = json.load(f)

    meta_by_id = {c["id"]: c for c in meta_data["classes"]}
    exported_classes_list = []
    for idx, cid in enumerate(ordered_classes):
        info = meta_by_id.get(cid, {})
        exported_classes_list.append({
            "index": idx,
            "id": cid,
            "label": info.get("label", cid),
            "brand": info.get("brand"),
            "ingredient": info.get("ingredient", ""),
            "category": info.get("category", "grocery"),
            "variety": info.get("variety", ""),
        })

    classes_export_data = {
        "version": "1.0.0",
        "model_name": "product_classifier.onnx",
        "num_classes": num_classes,
        "input_size": 224,
        "mean": [0.485, 0.456, 0.406],
        "std": [0.229, 0.224, 0.225],
        "classes": exported_classes_list,
        "class_to_idx": class_to_idx,
    }

    for target in [CLASSES_EXPORT_PATH, PUBLIC_CLASSES_PATH, SRC_CLASSES_PATH]:
        with open(target, "w", encoding="utf-8") as f:
            json.dump(classes_export_data, f, indent=2)
        print(f"Saved classes metadata to {target}")

    print("=" * 60)
    print("Classifier Export Successfully Completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()
