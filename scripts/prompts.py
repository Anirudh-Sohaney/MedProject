"""
Vocabulary of visible grocery object types for YOLOE prompt embeddings.
Visible packaging / species types only, never SKU or product brand names.
Total prompts count: 44 (within 35–50 required range).
"""

import sys
_dist = "/root/snap/antigravity-cli/common/local/lib/python3.14/dist-packages"
if _dist not in sys.path:
    sys.path.insert(0, _dist)

PROMPTS = [
    # Produce (16 classes)
    "apple",
    "banana",
    "orange",
    "lemon",
    "lime",
    "avocado",
    "tomato",
    "potato",
    "onion",
    "carrot",
    "bell pepper",
    "cucumber",
    "grapes",
    "strawberry",
    "broccoli",
    "lettuce",
    # Packaged Groceries (28 classes) - Natural, high-affinity visual nouns
    "milk",
    "milk jug",
    "milk carton",
    "cereal",
    "cereal box",
    "oatmeal",
    "oats box",
    "yogurt",
    "yogurt tub",
    "yogurt cup",
    "eggs",
    "egg carton",
    "bread",
    "bread bag",
    "pasta box",
    "rice bag",
    "canned food",
    "soup can",
    "soda can",
    "peanut butter",
    "peanut butter jar",
    "juice bottle",
    "water bottle",
    "sauce bottle",
    "butter",
    "butter box",
    "cheese",
    "cheese bag",
]

PRODUCE_CLASSES = {
    "apple",
    "banana",
    "orange",
    "lemon",
    "lime",
    "avocado",
    "tomato",
    "potato",
    "onion",
    "carrot",
    "bell pepper",
    "cucumber",
    "grapes",
    "strawberry",
    "broccoli",
    "lettuce",
}

PACKAGED_CLASSES = set(PROMPTS) - PRODUCE_CLASSES

assert len(PROMPTS) == len(set(PROMPTS)), "Duplicate prompt label detected"
assert 35 <= len(PROMPTS) <= 50, f"PROMPTS length {len(PROMPTS)} outside 35-50 range"

if __name__ == "__main__":
    print(f"Total prompts: {len(PROMPTS)}")
    print(f"Produce classes: {len(PRODUCE_CLASSES)}")
    print(f"Packaged classes: {len(PACKAGED_CLASSES)}")
