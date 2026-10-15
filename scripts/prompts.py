"""
Vocabulary of visible grocery object types for YOLOE prompt embeddings.
Visible packaging / species types only, never SKU or product brand names.
Total prompts count: 42 (within 35–50 required range).
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
    # Packaged (26 classes)
    "milk jug",
    "milk carton",
    "cereal box",
    "oatmeal canister",
    "oats box",
    "yogurt tub",
    "yogurt cup",
    "egg carton",
    "bread bag",
    "pasta box",
    "rice bag",
    "canned food",
    "peanut-butter jar",
    "juice bottle",
    "butter box",
    "cheese bag",
    "frozen-food bag",
    "snack bag",
    "salad bag",
    "coffee bag",
    "soup can",
    "soda can",
    "water bottle",
    "sauce bottle",
    "cookie box",
    "cracker box",
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
