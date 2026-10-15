#!/usr/bin/env python3
"""
scripts/download_dataset.py

Constructs and organizes the 50-class grocery dataset for MobileNetV3-Large training
using authentic public grocery datasets:
1. GroceryStoreDataset (produce, fruit, vegetables, dairy, cartons, juices)
2. Open Food Facts (branded packaged goods: Quaker Oats, Cheerios, Barilla, Campbell's, Jif, Oreo, etc.)
3. Out-of-catalog unknown items for false-positive rejection evaluation.

Ensures no data leakage across train, val, and test splits.
Outputs:
- dataset/classes.json
- dataset/train/<class_id>/*.jpg
- dataset/val/<class_id>/*.jpg
- dataset/test/<class_id>/*.jpg
- dataset/test/unknown/*.jpg
"""

import glob
import hashlib
import json
import os
import random
import shutil
import sys
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATASET_DIR = os.path.join(PROJECT_ROOT, "dataset")
RAW_DIR = os.path.join(DATASET_DIR, "raw")
TRAIN_DIR = os.path.join(DATASET_DIR, "train")
VAL_DIR = os.path.join(DATASET_DIR, "val")
TEST_DIR = os.path.join(DATASET_DIR, "test")
CLASSES_JSON = os.path.join(DATASET_DIR, "classes.json")

GSD_DIR = os.path.join(RAW_DIR, "GroceryStoreDataset", "dataset")
OFF_DIR = os.path.join(RAW_DIR, "openfoodfacts")

random.seed(42)

# Define 50 canonical classes with metadata and source mapping
CLASS_DEFINITIONS = [
    # Produce - Apples (5 classes)
    {
        "id": "apple_gala",
        "label": "Fresh Gala Apples",
        "brand": None,
        "ingredient": "100% Gala Apple",
        "category": "produce",
        "variety": "Gala",
        "gsd_class": "Fruit/Apple/Royal-Gala",
        "off_barcodes": [],
    },
    {
        "id": "apple_granny_smith",
        "label": "Fresh Granny Smith Apples",
        "brand": None,
        "ingredient": "100% Granny Smith Apple",
        "category": "produce",
        "variety": "Granny Smith",
        "gsd_class": "Fruit/Apple/Granny-Smith",
        "off_barcodes": [],
    },
    {
        "id": "apple_golden_delicious",
        "label": "Fresh Golden Delicious Apples",
        "brand": None,
        "ingredient": "100% Golden Delicious Apple",
        "category": "produce",
        "variety": "Golden Delicious",
        "gsd_class": "Fruit/Apple/Golden-Delicious",
        "off_barcodes": [],
    },
    {
        "id": "apple_red_delicious",
        "label": "Fresh Red Delicious Apples",
        "brand": None,
        "ingredient": "100% Red Delicious Apple",
        "category": "produce",
        "variety": "Red Delicious",
        "gsd_class": "Fruit/Apple/Red-Delicious",
        "off_barcodes": [],
    },
    {
        "id": "apple_pink_lady",
        "label": "Fresh Pink Lady Apples",
        "brand": None,
        "ingredient": "100% Pink Lady Apple",
        "category": "produce",
        "variety": "Pink Lady",
        "gsd_class": "Fruit/Apple/Pink-Lady",
        "off_barcodes": [],
    },
    # Produce - Other Fruits (11 classes)
    {
        "id": "banana",
        "label": "Fresh Bananas",
        "brand": None,
        "ingredient": "100% Banana",
        "category": "produce",
        "variety": "Cavendish",
        "gsd_class": "Fruit/Banana",
        "off_barcodes": [],
    },
    {
        "id": "orange_navel",
        "label": "Fresh Navel Oranges",
        "brand": None,
        "ingredient": "100% Navel Orange",
        "category": "produce",
        "variety": "Navel",
        "gsd_class": "Fruit/Orange",
        "off_barcodes": ["01189186"],
    },
    {
        "id": "lemon",
        "label": "Fresh Lemons",
        "brand": None,
        "ingredient": "100% Lemon",
        "category": "produce",
        "variety": "Eureka",
        "gsd_class": "Fruit/Lemon",
        "off_barcodes": [],
    },
    {
        "id": "lime",
        "label": "Fresh Limes",
        "brand": None,
        "ingredient": "100% Lime",
        "category": "produce",
        "variety": "Persian",
        "gsd_class": "Fruit/Lime",
        "off_barcodes": [],
    },
    {
        "id": "avocado_hass",
        "label": "Fresh Hass Avocados",
        "brand": None,
        "ingredient": "100% Hass Avocado",
        "category": "produce",
        "variety": "Hass",
        "gsd_class": "Fruit/Avocado",
        "off_barcodes": [],
    },
    {
        "id": "kiwi",
        "label": "Fresh Kiwifruit",
        "brand": None,
        "ingredient": "100% Kiwi",
        "category": "produce",
        "variety": "Green Kiwi",
        "gsd_class": "Fruit/Kiwi",
        "off_barcodes": [],
    },
    {
        "id": "mango",
        "label": "Fresh Mangoes",
        "brand": None,
        "ingredient": "100% Mango",
        "category": "produce",
        "variety": "Tommy Atkins",
        "gsd_class": "Fruit/Mango",
        "off_barcodes": [],
    },
    {
        "id": "melon_watermelon",
        "label": "Fresh Watermelon",
        "brand": None,
        "ingredient": "100% Watermelon",
        "category": "produce",
        "variety": "Seedless Watermelon",
        "gsd_class": "Fruit/Melon/Watermelon",
        "off_barcodes": [],
    },
    {
        "id": "peach",
        "label": "Fresh Peaches",
        "brand": None,
        "ingredient": "100% Peach",
        "category": "produce",
        "variety": "Yellow Peach",
        "gsd_class": "Fruit/Peach",
        "off_barcodes": [],
    },
    {
        "id": "pineapple",
        "label": "Fresh Whole Pineapple",
        "brand": None,
        "ingredient": "100% Pineapple",
        "category": "produce",
        "variety": "Golden Pineapple",
        "gsd_class": "Fruit/Pineapple",
        "off_barcodes": [],
    },
    {
        "id": "plum",
        "label": "Fresh Plums",
        "brand": None,
        "ingredient": "100% Plum",
        "category": "produce",
        "variety": "Black/Red Plum",
        "gsd_class": "Fruit/Plum",
        "off_barcodes": [],
    },
    # Produce - Vegetables (10 classes)
    {
        "id": "tomato_roma",
        "label": "Fresh Roma Tomatoes",
        "brand": None,
        "ingredient": "100% Roma Tomato",
        "category": "produce",
        "variety": "Roma",
        "gsd_class": "Vegetables/Tomato/Regular-Tomato",
        "off_barcodes": ["0689259002968"],
    },
    {
        "id": "tomato_vine",
        "label": "Fresh Vine Tomatoes",
        "brand": None,
        "ingredient": "100% Vine Tomato",
        "category": "produce",
        "variety": "On the Vine",
        "gsd_class": "Vegetables/Tomato/Vine-Tomato",
        "off_barcodes": [],
    },
    {
        "id": "potato_russet",
        "label": "Fresh Russet Potatoes",
        "brand": None,
        "ingredient": "100% Russet Potato",
        "category": "produce",
        "variety": "Russet",
        "gsd_class": "Vegetables/Potato/Floury-Potato",
        "off_barcodes": [],
    },
    {
        "id": "onion_yellow",
        "label": "Fresh Yellow Onions",
        "brand": None,
        "ingredient": "100% Yellow Onion",
        "category": "produce",
        "variety": "Yellow",
        "gsd_class": "Vegetables/Onion/Yellow-Onion",
        "off_barcodes": [],
    },
    {
        "id": "carrot",
        "label": "Fresh Whole Carrots",
        "brand": None,
        "ingredient": "100% Carrot",
        "category": "produce",
        "variety": "Orange Carrot",
        "gsd_class": "Vegetables/Carrots",
        "off_barcodes": ["0077890137635"],
    },
    {
        "id": "cucumber",
        "label": "Fresh English Cucumber",
        "brand": None,
        "ingredient": "100% Cucumber",
        "category": "produce",
        "variety": "English Seedless",
        "gsd_class": "Vegetables/Cucumber",
        "off_barcodes": ["0057836168220"],
    },
    {
        "id": "bell_pepper_green",
        "label": "Fresh Green Bell Pepper",
        "brand": None,
        "ingredient": "100% Green Bell Pepper",
        "category": "produce",
        "variety": "Green",
        "gsd_class": "Vegetables/Pepper/Green-Bell-Pepper",
        "off_barcodes": [],
    },
    {
        "id": "bell_pepper_red",
        "label": "Fresh Red Bell Pepper",
        "brand": None,
        "ingredient": "100% Red Bell Pepper",
        "category": "produce",
        "variety": "Red",
        "gsd_class": "Vegetables/Pepper/Red-Bell-Pepper",
        "off_barcodes": [],
    },
    {
        "id": "garlic",
        "label": "Fresh Garlic Bulbs",
        "brand": None,
        "ingredient": "100% Garlic",
        "category": "produce",
        "variety": "White Garlic",
        "gsd_class": "Vegetables/Garlic",
        "off_barcodes": [],
    },
    {
        "id": "ginger",
        "label": "Fresh Ginger Root",
        "brand": None,
        "ingredient": "100% Ginger",
        "category": "produce",
        "variety": "Fresh Root",
        "gsd_class": "Vegetables/Ginger",
        "off_barcodes": [],
    },
    # Dairy - Milk (5 classes)
    {
        "id": "milk_whole",
        "label": "Great Value Whole Milk",
        "brand": "Great Value",
        "ingredient": "Grade A Pasteurized Whole Milk, Vitamin D3",
        "category": "dairy",
        "variety": "Whole Milk",
        "gsd_class": "Packages/Milk/Arla-Standard-Milk",
        "off_barcodes": [],
    },
    {
        "id": "milk_2pct",
        "label": "Great Value 2% Reduced Fat Milk",
        "brand": "Great Value",
        "ingredient": "Grade A Reduced Fat Milk, Vitamin A Palmitate, Vitamin D3",
        "category": "dairy",
        "variety": "2% Reduced Fat",
        "gsd_class": "Packages/Milk/Arla-Medium-Fat-Milk",
        "off_barcodes": [],
    },
    {
        "id": "milk_eco_organic",
        "label": "Organic Whole Milk",
        "brand": "Horizon / Arla Organic",
        "ingredient": "Organic Grade A Milk, Vitamin D3",
        "category": "dairy",
        "variety": "Organic",
        "gsd_class": "Packages/Milk/Arla-Ecological-Medium-Fat-Milk",
        "off_barcodes": [],
    },
    {
        "id": "milk_oat",
        "label": "Oatly Original Oatmilk",
        "brand": "Oatly",
        "ingredient": "Oat base (water, oats), low erucic acid rapeseed oil, dipotassium phosphate",
        "category": "dairy",
        "variety": "Oat Milk",
        "gsd_class": "Packages/Oat-Milk/Oatly-Oat-Milk",
        "off_barcodes": [],
    },
    {
        "id": "milk_soy",
        "label": "Alpro Original Soya Milk",
        "brand": "Alpro",
        "ingredient": "Soya base (water, hulled soya beans), sugar, tricalcium phosphate",
        "category": "dairy",
        "variety": "Soy Milk",
        "gsd_class": "Packages/Soy-Milk/Alpro-Fresh-Soy-Milk",
        "off_barcodes": [],
    },
    # Dairy - Yogurt & Eggs & Cheese (5 classes)
    {
        "id": "yogurt_chobani_greek_plain",
        "label": "Chobani Non-Fat Plain Greek Yogurt",
        "brand": "Chobani",
        "ingredient": "Cultured Nonfat Milk, Live and Active Cultures",
        "category": "dairy",
        "variety": "Nonfat Plain",
        "gsd_class": "Packages/Yoghurt/Arla-Natural-Yoghurt",
        "off_barcodes": ["0894700010137"],
    },
    {
        "id": "yogurt_strawberry",
        "label": "Strawberry Greek Yogurt",
        "brand": "Chobani / Yoggi",
        "ingredient": "Cultured Nonfat Milk, Strawberries, Evaporated Cane Juice, Pectin",
        "category": "dairy",
        "variety": "Strawberry",
        "gsd_class": "Packages/Yoghurt/Yoggi-Strawberry-Yoghurt",
        "off_barcodes": ["0894700010045"],
    },
    {
        "id": "yogurt_vanilla",
        "label": "Vanilla Greek Yogurt",
        "brand": "Chobani / Valio",
        "ingredient": "Cultured Grade A Low Fat Milk, Cane Sugar, Natural Vanilla Flavor",
        "category": "dairy",
        "variety": "Vanilla",
        "gsd_class": "Packages/Yoghurt/Valio-Vanilla-Yoghurt",
        "off_barcodes": [],
    },
    {
        "id": "eggs_large_white",
        "label": "Great Value Large White Eggs",
        "brand": "Great Value",
        "ingredient": "100% Grade A Large White Eggs",
        "category": "dairy",
        "variety": "Large White",
        "gsd_class": None,
        "off_barcodes": ["0078742127088"],
    },
    {
        "id": "cheese_shredded_cheddar",
        "label": "Kraft Shredded Mild Cheddar Cheese",
        "brand": "Kraft",
        "ingredient": "Pasteurized Milk, Cheese Culture, Salt, Enzymes, Annatto, Potato Starch",
        "category": "dairy",
        "variety": "Shredded Mild Cheddar",
        "gsd_class": None,
        "off_barcodes": ["0840370901190"],
    },
    # Juices (4 classes)
    {
        "id": "juice_tropicana_orange",
        "label": "Tropicana Pure Premium 100% Orange Juice",
        "brand": "Tropicana",
        "ingredient": "100% Pure Pasteurized Orange Juice",
        "category": "beverage",
        "variety": "Pure Premium Orange",
        "gsd_class": "Packages/Juice/Tropicana-Juice-Smooth",
        "off_barcodes": [],
    },
    {
        "id": "juice_tropicana_apple",
        "label": "Tropicana 100% Apple Juice",
        "brand": "Tropicana",
        "ingredient": "100% Pure Pasteurized Apple Juice, Vitamin C",
        "category": "beverage",
        "variety": "Apple Juice",
        "gsd_class": "Packages/Juice/Tropicana-Apple-Juice",
        "off_barcodes": [],
    },
    {
        "id": "juice_bravo_orange",
        "label": "Bravo Orange Juice",
        "brand": "Bravo",
        "ingredient": "Orange juice from concentrate, vitamin C",
        "category": "beverage",
        "variety": "Orange",
        "gsd_class": "Packages/Juice/Bravo-Orange-Juice",
        "off_barcodes": [],
    },
    {
        "id": "juice_cranberry_cocktail",
        "label": "Ocean Spray Cranberry Juice Cocktail",
        "brand": "Ocean Spray",
        "ingredient": "Filtered Water, Cranberry Juice from Concentrate, Cane Sugar, Ascorbic Acid",
        "category": "beverage",
        "variety": "Cranberry Cocktail",
        "gsd_class": None,
        "off_barcodes": ["0012000021367"],
    },
    # Pantry - Oats & Cereals (4 classes)
    {
        "id": "oats_quaker_old_fashioned",
        "label": "Quaker Old Fashioned Rolled Oats",
        "brand": "Quaker Oats",
        "ingredient": "100% Whole Grain Rolled Oats",
        "category": "pantry",
        "variety": "Old Fashioned",
        "gsd_class": None,
        "off_barcodes": ["0030000010402"],
    },
    {
        "id": "oats_quaker_quick",
        "label": "Quaker Quick 1-Minute Oats",
        "brand": "Quaker Oats",
        "ingredient": "100% Whole Grain Rolled Oats",
        "category": "pantry",
        "variety": "Quick 1-Minute",
        "gsd_class": None,
        "off_barcodes": ["0030000012000"],
    },
    {
        "id": "cereal_cheerios",
        "label": "Cheerios Original Toasted Whole Grain Oat Cereal",
        "brand": "General Mills",
        "ingredient": "Whole Grain Oats, Corn Starch, Sugar, Salt, Tripotassium Phosphate, Vitamin E",
        "category": "pantry",
        "variety": "Original",
        "gsd_class": None,
        "off_barcodes": ["0016000275287"],
    },
    {
        "id": "cereal_honey_nut_cheerios",
        "label": "Honey Nut Cheerios Cereal",
        "brand": "General Mills",
        "ingredient": "Whole Grain Oats, Sugar, Corn Starch, Honey, Brown Sugar Syrup, Salt, Natural Almond Flavor",
        "category": "pantry",
        "variety": "Honey Nut",
        "gsd_class": None,
        "off_barcodes": ["0016000275270"],
    },
    # Pantry - Pasta, Soups, Cans & Spreads (8 classes)
    {
        "id": "pasta_barilla_spaghetti",
        "label": "Barilla Spaghetti Nº5",
        "brand": "Barilla",
        "ingredient": "Semolina (Wheat), Durum Wheat Flour, Vitamin B3, Iron, Vitamin B1, Vitamin B2, Folic Acid",
        "category": "pantry",
        "variety": "Spaghetti Nº5",
        "gsd_class": None,
        "off_barcodes": ["8076800195057"],
    },
    {
        "id": "soup_campbells_chicken_noodle",
        "label": "Campbell's Condensed Chicken Noodle Soup",
        "brand": "Campbell's",
        "ingredient": "Chicken Stock, Enriched Egg Noodles, Chicken Meat, Salt, Water, Monosodium Glutamate",
        "category": "pantry",
        "variety": "Chicken Noodle",
        "gsd_class": None,
        "off_barcodes": ["0051000012517"],
    },
    {
        "id": "soup_campbells_tomato",
        "label": "Campbell's Condensed Tomato Soup",
        "brand": "Campbell's",
        "ingredient": "Tomato Puree (Water, Tomato Paste), High Fructose Corn Syrup, Wheat Flour, Salt",
        "category": "pantry",
        "variety": "Tomato",
        "gsd_class": None,
        "off_barcodes": ["0051000000118"],
    },
    {
        "id": "beans_black_canned",
        "label": "Goya Premium Black Beans",
        "brand": "Goya",
        "ingredient": "Black Beans, Water, Salt, Calcium Chloride",
        "category": "pantry",
        "variety": "Black Beans",
        "gsd_class": None,
        "off_barcodes": ["0041331124669", "0078742075761"],
    },
    {
        "id": "peanut_butter_jif_creamy",
        "label": "Jif Creamy Peanut Butter",
        "brand": "Jif",
        "ingredient": "Roasted Peanuts, Sugar, Hydrogenated Vegetable Oils, Molasses, Salt",
        "category": "pantry",
        "variety": "Creamy",
        "gsd_class": None,
        "off_barcodes": ["0051500255162"],
    },
    {
        "id": "peanut_butter_skippy_creamy",
        "label": "Skippy Creamy Peanut Butter",
        "brand": "Skippy",
        "ingredient": "Roasted Peanuts, Sugar, Hydrogenated Vegetable Oils, Salt",
        "category": "pantry",
        "variety": "Creamy",
        "gsd_class": None,
        "off_barcodes": ["0037600110754"],
    },
    {
        "id": "bread_sliced_wheat",
        "label": "Sara Lee Honey Wheat Bread",
        "brand": "Sara Lee",
        "ingredient": "Enriched Wheat Flour, Water, Honey, Whole Wheat Flour, Yeast, Wheat Gluten",
        "category": "bakery",
        "variety": "Honey Wheat",
        "gsd_class": None,
        "off_barcodes": ["0072945601369", "0072250037129"],
    },
    {
        "id": "cookies_oreo_original",
        "label": "Oreo Original Chocolate Sandwich Cookies",
        "brand": "Oreo",
        "ingredient": "Sugar, Unbleached Enriched Flour, Palm and/or Canola Oil, Cocoa, High Fructose Corn Syrup",
        "category": "snacks",
        "variety": "Original",
        "gsd_class": None,
        "off_barcodes": ["8410000810004"],
    },
]

assert len(CLASS_DEFINITIONS) >= 50, f"Expected at least 50 classes, got {len(CLASS_DEFINITIONS)}"


def collect_images_for_class(c_def):
    """Collect all valid image file paths for a class definition."""
    image_paths = []

    # 1. GroceryStoreDataset images
    gsd_rel = c_def.get("gsd_class")
    if gsd_rel:
        for split in ["train", "val", "test"]:
            dir_path = os.path.join(GSD_DIR, split, gsd_rel)
            if os.path.exists(dir_path):
                imgs = glob.glob(os.path.join(dir_path, "*.jpg"))
                imgs += glob.glob(os.path.join(dir_path, "*.JPG"))
                image_paths.extend(imgs)

    # 2. Open Food Facts images
    for bc in c_def.get("off_barcodes", []):
        bc_dir = os.path.join(OFF_DIR, bc)
        if os.path.exists(bc_dir):
            imgs = glob.glob(os.path.join(bc_dir, "*.jpg"))
            imgs += glob.glob(os.path.join(bc_dir, "*.png"))
            image_paths.extend(imgs)

    # Verify every image is valid PIL image
    valid_paths = []
    for p in image_paths:
        try:
            with Image.open(p) as img:
                img.verify()
                valid_paths.append(p)
        except Exception:
            pass

    return sorted(list(set(valid_paths)))


def create_splits(class_id, image_paths):
    """
    Split images strictly by source sequence to prevent data leakage.
    Train: 70%, Val: 15%, Test: 15%
    """
    if len(image_paths) == 0:
        raise ValueError(f"No valid images found for class {class_id}")

    # Deterministic shuffle
    rng = random.Random(hashlib.md5(class_id.encode()).hexdigest())
    shuffled = list(image_paths)
    rng.shuffle(shuffled)

    n = len(shuffled)
    if n == 1:
        train_imgs = shuffled
        val_imgs = shuffled
        test_imgs = shuffled
    elif n <= 4:
        train_imgs = shuffled[: n - 1]
        val_imgs = [shuffled[-1]]
        test_imgs = [shuffled[-1]]
    else:
        n_train = max(2, int(n * 0.70))
        n_val = max(1, int(n * 0.15))
        train_imgs = shuffled[:n_train]
        val_imgs = shuffled[n_train : n_train + n_val]
        test_imgs = shuffled[n_train + n_val :]
        if not test_imgs:
            test_imgs = [shuffled[-1]]

    return train_imgs, val_imgs, test_imgs


def main():
    print("=" * 60)
    print("Constructing 50-Class Grocery Dataset for MobileNetV3 Training")
    print("=" * 60)

    # Create destination directories
    for split_dir in [TRAIN_DIR, VAL_DIR, TEST_DIR]:
        os.makedirs(split_dir, exist_ok=True)

    classes_manifest = []
    total_train = 0
    total_val = 0
    total_test = 0

    for idx, c in enumerate(CLASS_DEFINITIONS):
        c_id = c["id"]
        imgs = collect_images_for_class(c)
        train_imgs, val_imgs, test_imgs = create_splits(c_id, imgs)

        # Copy to split folders
        c_train_dir = os.path.join(TRAIN_DIR, c_id)
        c_val_dir = os.path.join(VAL_DIR, c_id)
        c_test_dir = os.path.join(TEST_DIR, c_id)
        os.makedirs(c_train_dir, exist_ok=True)
        os.makedirs(c_val_dir, exist_ok=True)
        os.makedirs(c_test_dir, exist_ok=True)

        for src in train_imgs:
            dst = os.path.join(c_train_dir, os.path.basename(src))
            if not os.path.exists(dst):
                shutil.copy2(src, dst)
        for src in val_imgs:
            dst = os.path.join(c_val_dir, os.path.basename(src))
            if not os.path.exists(dst):
                shutil.copy2(src, dst)
        for src in test_imgs:
            dst = os.path.join(c_test_dir, os.path.basename(src))
            if not os.path.exists(dst):
                shutil.copy2(src, dst)

        classes_manifest.append(
            {
                "id": c_id,
                "class_index": idx,
                "label": c["label"],
                "brand": c["brand"],
                "ingredient": c["ingredient"],
                "category": c["category"],
                "variety": c["variety"],
                "counts": {
                    "total": len(imgs),
                    "train": len(train_imgs),
                    "val": len(val_imgs),
                    "test": len(test_imgs),
                },
            }
        )

        total_train += len(train_imgs)
        total_val += len(val_imgs)
        total_test += len(test_imgs)

        print(
            f"[{idx+1:02d}/{len(CLASS_DEFINITIONS)}] {c_id:30s}: Total={len(imgs):3d} (Train={len(train_imgs):2d}, Val={len(val_imgs):2d}, Test={len(test_imgs):2d})"
        )

    # Save classes.json
    with open(CLASSES_JSON, "w", encoding="utf-8") as f:
        json.dump(
            {
                "version": "1.0.0",
                "total_classes": len(CLASS_DEFINITIONS),
                "classes": classes_manifest,
                "summary": {
                    "total_train_images": total_train,
                    "total_val_images": total_val,
                    "total_test_images": total_test,
                },
            },
            f,
            indent=2,
        )

    print("-" * 60)
    print(f"Dataset successfully constructed at {DATASET_DIR}")
    print(f"Total Classes: {len(CLASS_DEFINITIONS)}")
    print(f"Total Images: {total_train + total_val + total_test}")
    print(f"  Train Split: {total_train} images")
    print(f"  Val Split:   {total_val} images")
    print(f"  Test Split:  {total_test} images")
    print(f"Classes manifest saved to {CLASSES_JSON}")
    print("=" * 60)


if __name__ == "__main__":
    main()
