#!/usr/bin/env python3
"""
scripts/train_classifier.py

Fine-tunes MobileNetV3-Large on the 52-class grocery dataset.
- Initializes pretrained ImageNet weights
- Replaces classification head for target classes
- Uses class-balanced cross-entropy loss
- Implements two-phase training: head warmup -> backbone fine-tuning
- Applies early stopping and saves best validation checkpoint to models/best_mobilenet_v3.pt
- Records training and validation metrics
"""

import sys
_dist = "/root/snap/antigravity-cli/common/local/lib/python3.14/dist-packages"
if _dist not in sys.path:
    sys.path.insert(0, _dist)

import os
import time
import json
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import datasets, transforms, models

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATASET_DIR = os.path.join(PROJECT_ROOT, "dataset")
TRAIN_DIR = os.path.join(DATASET_DIR, "train")
VAL_DIR = os.path.join(DATASET_DIR, "val")
MODELS_DIR = os.path.join(PROJECT_ROOT, "models")
CLASSES_JSON = os.path.join(DATASET_DIR, "classes.json")
BEST_MODEL_PATH = os.path.join(MODELS_DIR, "best_mobilenet_v3.pt")
METRICS_PATH = os.path.join(MODELS_DIR, "training_metrics.json")

os.makedirs(MODELS_DIR, exist_ok=True)

# Hyperparameters
BATCH_SIZE = 32
HEAD_EPOCHS = 3
FINETUNE_EPOCHS = 7
NUM_WORKERS = 4
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def get_data_loaders():
    # Data Augmentation on train split
    train_transform = transforms.Compose([
        transforms.RandomResizedCrop(224, scale=(0.7, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
        transforms.RandomRotation(15),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    val_transform = transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    train_dataset = datasets.ImageFolder(TRAIN_DIR, transform=train_transform)
    val_dataset = datasets.ImageFolder(VAL_DIR, transform=val_transform)

    train_loader = DataLoader(
        train_dataset,
        batch_size=BATCH_SIZE,
        shuffle=True,
        num_workers=NUM_WORKERS,
        pin_memory=(DEVICE.type == "cuda")
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=NUM_WORKERS,
        pin_memory=(DEVICE.type == "cuda")
    )

    return train_dataset, val_dataset, train_loader, val_loader


def compute_class_weights(dataset, num_classes):
    counts = [0] * num_classes
    for _, label in dataset.samples:
        counts[label] += 1
    # Inverse square root weighting with clipping
    weights = [1.0 / max(1, c ** 0.5) for c in counts]
    total = sum(weights)
    norm_weights = [w / total * num_classes for w in weights]
    return torch.tensor(norm_weights, dtype=torch.float, device=DEVICE)


def build_model(num_classes):
    print("Loading pretrained MobileNetV3-Large (ImageNet)...")
    model = models.mobilenet_v3_large(weights=models.MobileNet_V3_Large_Weights.DEFAULT)
    
    # In features to classifier is 960
    in_features = model.classifier[0].in_features
    model.classifier = nn.Sequential(
        nn.Linear(in_features, 1024),
        nn.Hardswish(),
        nn.Dropout(p=0.3),
        nn.Linear(1024, num_classes)
    )
    return model.to(DEVICE)


def evaluate(model, loader, criterion, num_classes):
    model.eval()
    total_loss = 0.0
    correct_top1 = 0
    correct_top3 = 0
    total_samples = 0

    with torch.no_grad():
        for inputs, targets in loader:
            inputs = inputs.to(DEVICE)
            targets = targets.to(DEVICE)
            outputs = model(inputs)
            loss = criterion(outputs, targets)

            total_loss += loss.item() * inputs.size(0)
            total_samples += inputs.size(0)

            # Top-1
            _, pred1 = outputs.max(1)
            correct_top1 += pred1.eq(targets).sum().item()

            # Top-3
            k = min(3, num_classes)
            _, pred3 = outputs.topk(k, 1, largest=True, sorted=True)
            correct_top3 += pred3.eq(targets.view(-1, 1).expand_as(pred3)).sum().item()

    avg_loss = total_loss / max(1, total_samples)
    top1_acc = (correct_top1 / max(1, total_samples)) * 100.0
    top3_acc = (correct_top3 / max(1, total_samples)) * 100.0
    return avg_loss, top1_acc, top3_acc


def main():
    print("=" * 60)
    print("Training MobileNetV3-Large Classifier on 52 Grocery Classes")
    print(f"Device: {DEVICE}")
    print("=" * 60)

    train_ds, val_ds, train_loader, val_loader = get_data_loaders()
    num_classes = len(train_ds.classes)
    print(f"Dataset loaded: {len(train_ds)} train samples, {len(val_ds)} val samples, {num_classes} classes")

    # Match class index to classes.json
    class_to_idx = train_ds.class_to_idx
    with open(CLASSES_JSON, "r", encoding="utf-8") as f:
        classes_data = json.load(f)
    # Check alignment
    for c in classes_data["classes"]:
        cid = c["id"]
        c["model_class_index"] = class_to_idx.get(cid, -1)
    with open(CLASSES_JSON, "w", encoding="utf-8") as f:
        json.dump(classes_data, f, indent=2)

    model = build_model(num_classes)
    class_weights = compute_class_weights(train_ds, num_classes)
    criterion = nn.CrossEntropyLoss(weight=class_weights)

    # ----------------------------------------------------
    # Stage 1: Freeze backbone, train classifier head
    # ----------------------------------------------------
    print("\n--- Phase 1: Classifier Head Warmup (3 Epochs) ---")
    for param in model.features.parameters():
        param.requires_grad = False
    for param in model.classifier.parameters():
        param.requires_grad = True

    optimizer_head = torch.optim.AdamW(model.classifier.parameters(), lr=1e-3, weight_decay=1e-4)

    metrics_log = []
    best_val_acc = 0.0

    for epoch in range(1, HEAD_EPOCHS + 1):
        t0 = time.time()
        model.train()
        train_loss = 0.0
        train_samples = 0

        for inputs, targets in train_loader:
            inputs = inputs.to(DEVICE)
            targets = targets.to(DEVICE)
            optimizer_head.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer_head.step()

            train_loss += loss.item() * inputs.size(0)
            train_samples += inputs.size(0)

        train_loss /= max(1, train_samples)
        val_loss, val_top1, val_top3 = evaluate(model, val_loader, criterion, num_classes)
        dt = time.time() - t0

        print(f"Epoch {epoch:02d}/{HEAD_EPOCHS:02d} [{dt:.1f}s]: Train Loss={train_loss:.4f} | Val Loss={val_loss:.4f} | Val Top-1={val_top1:.2f}% | Val Top-3={val_top3:.2f}%")

        if val_top1 > best_val_acc:
            best_val_acc = val_top1
            torch.save({
                "epoch": epoch,
                "phase": "head",
                "state_dict": model.state_dict(),
                "val_top1": val_top1,
                "val_top3": val_top3,
                "class_to_idx": class_to_idx,
                "num_classes": num_classes,
            }, BEST_MODEL_PATH)

        metrics_log.append({
            "epoch": epoch,
            "phase": "head",
            "train_loss": train_loss,
            "val_loss": val_loss,
            "val_top1": val_top1,
            "val_top3": val_top3,
        })

    # ----------------------------------------------------
    # Stage 2: Fine-tune backbone top layers + head
    # ----------------------------------------------------
    print("\n--- Phase 2: Backbone Fine-Tuning (7 Epochs) ---")
    # Unfreeze higher-level features (blocks 11 to 16)
    for i, block in enumerate(model.features):
        if i >= 11:
            for p in block.parameters():
                p.requires_grad = True

    params_to_opt = [
        {"params": [p for i, block in enumerate(model.features) if i >= 11 for p in block.parameters()], "lr": 5e-5},
        {"params": model.classifier.parameters(), "lr": 2e-4},
    ]
    optimizer_ft = torch.optim.AdamW(params_to_opt, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer_ft, T_max=FINETUNE_EPOCHS, eta_min=1e-6)

    for epoch in range(1, FINETUNE_EPOCHS + 1):
        t0 = time.time()
        model.train()
        train_loss = 0.0
        train_samples = 0

        for inputs, targets in train_loader:
            inputs = inputs.to(DEVICE)
            targets = targets.to(DEVICE)
            optimizer_ft.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer_ft.step()

            train_loss += loss.item() * inputs.size(0)
            train_samples += inputs.size(0)

        scheduler.step()
        train_loss /= max(1, train_samples)
        val_loss, val_top1, val_top3 = evaluate(model, val_loader, criterion, num_classes)
        dt = time.time() - t0

        print(f"Epoch {epoch+HEAD_EPOCHS:02d}/{HEAD_EPOCHS+FINETUNE_EPOCHS:02d} [{dt:.1f}s]: Train Loss={train_loss:.4f} | Val Loss={val_loss:.4f} | Val Top-1={val_top1:.2f}% | Val Top-3={val_top3:.2f}%")

        if val_top1 > best_val_acc:
            best_val_acc = val_top1
            torch.save({
                "epoch": epoch + HEAD_EPOCHS,
                "phase": "finetune",
                "state_dict": model.state_dict(),
                "val_top1": val_top1,
                "val_top3": val_top3,
                "class_to_idx": class_to_idx,
                "num_classes": num_classes,
            }, BEST_MODEL_PATH)
            print(f"  -> New best checkpoint saved with {val_top1:.2f}% Val Top-1!")

        metrics_log.append({
            "epoch": epoch + HEAD_EPOCHS,
            "phase": "finetune",
            "train_loss": train_loss,
            "val_loss": val_loss,
            "val_top1": val_top1,
            "val_top3": val_top3,
        })

    # Save training metrics
    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "best_val_top1": best_val_acc,
            "epochs": metrics_log,
        }, f, indent=2)

    print("-" * 60)
    print(f"Training Complete! Best Val Top-1 Accuracy: {best_val_acc:.2f}%")
    print(f"Checkpoint saved to {BEST_MODEL_PATH}")
    print(f"Metrics saved to {METRICS_PATH}")
    print("=" * 60)


if __name__ == "__main__":
    main()
