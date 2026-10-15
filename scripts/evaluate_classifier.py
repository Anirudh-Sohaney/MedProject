#!/usr/bin/env python3
"""
scripts/evaluate_classifier.py

Evaluates the trained MobileNetV3-Large checkpoint on the held-out test split:
- Measures Top-1 and Top-3 accuracy on untouched test images
- Generates a per-class confusion analysis
- Evaluates out-of-catalog false positives on dataset/test/unknown/
- Saves evaluation report to models/evaluation_results.json
"""

import sys
_dist = "/root/snap/antigravity-cli/common/local/lib/python3.14/dist-packages"
if _dist not in sys.path:
    sys.path.insert(0, _dist)

import os
import glob
import json
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import datasets, transforms, models
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATASET_DIR = os.path.join(PROJECT_ROOT, "dataset")
TEST_DIR = os.path.join(DATASET_DIR, "test")
UNKNOWN_DIR = os.path.join(TEST_DIR, "unknown")
MODELS_DIR = os.path.join(PROJECT_ROOT, "models")
BEST_MODEL_PATH = os.path.join(MODELS_DIR, "best_mobilenet_v3.pt")
CLASSES_JSON = os.path.join(DATASET_DIR, "classes.json")
EVAL_RESULTS_PATH = os.path.join(MODELS_DIR, "evaluation_results.json")

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def load_model(checkpoint_path):
    checkpoint = torch.load(checkpoint_path, map_location=DEVICE)
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
    model.to(DEVICE)
    model.eval()
    return model, class_to_idx, num_classes


def main():
    print("=" * 60)
    print("Evaluating MobileNetV3-Large on Held-Out Test Split")
    print("=" * 60)

    model, class_to_idx, num_classes = load_model(BEST_MODEL_PATH)
    idx_to_class = {v: k for k, v in class_to_idx.items()}

    with open(CLASSES_JSON, "r", encoding="utf-8") as f:
        classes_meta = json.load(f)["classes"]
    meta_lookup = {c["id"]: c for c in classes_meta}

    val_transform = transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    # We evaluate on each class folder in TEST_DIR (excluding unknown)
    test_folders = [d for d in os.listdir(TEST_DIR) if d != "unknown" and os.path.isdir(os.path.join(TEST_DIR, d))]
    
    total_samples = 0
    correct_top1 = 0
    correct_top3 = 0

    per_class_results = {}
    confusion_pairs = []

    with torch.no_grad():
        for class_name in sorted(test_folders):
            class_dir = os.path.join(TEST_DIR, class_name)
            img_files = glob.glob(os.path.join(class_dir, "*.*"))
            if not img_files:
                continue

            target_idx = class_to_idx.get(class_name)
            if target_idx is None:
                continue

            c_total = len(img_files)
            c_top1 = 0
            c_top3 = 0

            for img_path in img_files:
                try:
                    with Image.open(img_path).convert("RGB") as img:
                        tensor = val_transform(img).unsqueeze(0).to(DEVICE)
                        outputs = model(tensor)
                        probs = torch.softmax(outputs, dim=1)[0]
                        topk_probs, topk_indices = torch.topk(probs, k=min(3, num_classes))
                        topk_indices = topk_indices.cpu().numpy()
                        topk_probs = topk_probs.cpu().numpy()

                        pred1 = topk_indices[0]
                        conf1 = float(topk_probs[0])

                        if pred1 == target_idx:
                            c_top1 += 1
                        else:
                            confusion_pairs.append({
                                "ground_truth": class_name,
                                "predicted": idx_to_class[pred1],
                                "confidence": round(conf1, 3),
                                "file": os.path.basename(img_path)
                            })

                        if target_idx in topk_indices[:3]:
                            c_top3 += 1

                except Exception as e:
                    print(f"Error reading {img_path}: {e}")

            per_class_results[class_name] = {
                "total": c_total,
                "top1_correct": c_top1,
                "top1_acc": round(c_top1 / c_total * 100.0, 1),
                "top3_correct": c_top3,
                "top3_acc": round(c_top3 / c_total * 100.0, 1),
            }

            total_samples += c_total
            correct_top1 += c_top1
            correct_top3 += c_top3

    overall_top1 = (correct_top1 / max(1, total_samples)) * 100.0
    overall_top3 = (correct_top3 / max(1, total_samples)) * 100.0

    # ------------------------------------------------------------------
    # Unknown / Out-of-catalog False Positive Evaluation
    # ------------------------------------------------------------------
    unknown_results = []
    unknown_fps_high_conf = 0
    if os.path.exists(UNKNOWN_DIR):
        unknown_files = glob.glob(os.path.join(UNKNOWN_DIR, "*.*"))
        with torch.no_grad():
            for uf in unknown_files:
                try:
                    with Image.open(uf).convert("RGB") as img:
                        tensor = val_transform(img).unsqueeze(0).to(DEVICE)
                        outputs = model(tensor)
                        probs = torch.softmax(outputs, dim=1)[0]
                        top_conf, top_idx = torch.topk(probs, 1)
                        top_conf = float(top_conf[0])
                        top_class = idx_to_class[int(top_idx[0])]

                        # If confidence >= 0.70, it counts as a high-confidence false positive
                        is_fp = top_conf >= 0.70
                        if is_fp:
                            unknown_fps_high_conf += 1

                        unknown_results.append({
                            "file": os.path.basename(uf),
                            "top_predicted_class": top_class,
                            "confidence": round(top_conf, 3),
                            "rejected_at_threshold_0_60": (top_conf < 0.60),
                            "rejected_at_threshold_0_70": (top_conf < 0.70),
                        })
                except Exception as e:
                    pass

    unknown_count = len(unknown_results)
    unknown_rejection_rate = ((unknown_count - unknown_fps_high_conf) / max(1, unknown_count)) * 100.0

    print(f"\n--- TEST SET RESULTS ({total_samples} samples across {len(per_class_results)} classes) ---")
    print(f"Overall Test Top-1 Accuracy: {overall_top1:.2f}%")
    print(f"Overall Test Top-3 Accuracy: {overall_top3:.2f}%")
    print(f"Out-of-Catalog Unknown Rejection Rate (@0.70): {unknown_rejection_rate:.1f}% ({unknown_count - unknown_fps_high_conf}/{unknown_count})")

    print("\n--- Per-Class Summary (Sample of 15 classes) ---")
    for cname in list(per_class_results.keys())[:15]:
        res = per_class_results[cname]
        print(f"  {cname:30s}: Top-1={res['top1_acc']:5.1f}% ({res['top1_correct']}/{res['total']}) | Top-3={res['top3_acc']:5.1f}%")

    if confusion_pairs:
        print(f"\n--- Top Confusion Examples (Total mismatches: {len(confusion_pairs)}) ---")
        for cp in confusion_pairs[:8]:
            print(f"  GT: {cp['ground_truth']} -> Pred: {cp['predicted']} (Conf: {cp['confidence']}) [{cp['file']}]")

    # Save to JSON
    report = {
        "evaluation_summary": {
            "total_test_samples": total_samples,
            "top1_accuracy": round(overall_top1, 2),
            "top3_accuracy": round(overall_top3, 2),
            "unknown_samples_count": unknown_count,
            "unknown_rejection_rate_at_0_70": round(unknown_rejection_rate, 2),
            "unknown_high_confidence_fp_count": unknown_fps_high_conf,
        },
        "per_class": per_class_results,
        "confusion_cases": confusion_pairs,
        "unknown_evaluations": unknown_results,
    }

    with open(EVAL_RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"\nFull evaluation results saved to {EVAL_RESULTS_PATH}")
    print("=" * 60)


if __name__ == "__main__":
    main()
