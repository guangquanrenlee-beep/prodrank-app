"""
Category Knowledge Templates — the four-layer field framework.

Every category defines, per subcategory, which fields AI should generate,
organized in four layers:
  identity   — what the product IS (read from product data, not generated)
  knowledge  — what attributes it HAS (AI-generated from available data)
  decision   — when to recommend it (AI-generated: audience/occasion/compare)
  trust      — why believe it (real reviews + AI-generated FAQ/pros/cons)

AI generation NEVER invents facts: fields whose data is missing are
skipped and reported back as `missing` for the merchant to fill manually.
"""

# Layer → human label
LAYERS = {
    "identity": "Identity",
    "knowledge": "Knowledge",
    "decision": "Decision",
    "trust": "Trust",
}

# Subcategory detection: product_type / keyword → subcategory
SUBCATEGORY_KEYWORDS: dict[str, dict[str, list[str]]] = {
    "fashion": {
        "apparel": ["t-shirt", "shirt", "dress", "jacket", "coat", "hoodie", "sweater", "pant", "jean",
                    "skirt", "top", "blouse", "suit", "shorts", "jumpsuit", "cardigan", "blazer", "sock",
                    "underwear", "swimwear", "leggings", "tank", "polo", "kimono"],
        "footwear": ["shoe", "sneaker", "boot", "sandals", "sandal", "loafer", "heel", "flats", "running shoe",
                     "trainer", "slipper", "mule", "cleats"],
        "bags": ["bag", "backpack", "tote", "purse", "handbag", "clutch", "duffel", "luggage", "suitcase",
                 "wallet", "messenger", "satchel", "crossbody", "shoulder bag"],
        "accessories": ["hat", "cap", "scarf", "belt", "gloves", "sunglasses", "jewelry", "necklace",
                        "bracelet", "earrings", "watch", "tie", "socks", "beanie"],
    },
    "electronics": {
        "audio": ["headphone", "earbud", "speaker", "soundbar", "microphone", "amplifier", "turntable"],
        "computing": ["laptop", "computer", "desktop", "monitor", "keyboard", "mouse", "tablet", "ssd",
                      "ram", "gpu", "cpu", "printer", "webcam"],
        "mobile": ["phone", "smartphone", "tablet", "charger", "power bank", "case", "screen protector"],
        "home_appliance": ["tv", "television", "refrigerator", "washer", "dryer", "air conditioner", "vacuum",
                           "microwave", "dishwasher", "oven", "kettle", "toaster"],
    },
    "beauty": {
        "skincare": ["serum", "moisturizer", "cleanser", "toner", "sunscreen", "spf", "cream", "mask",
                     "eye cream", "retinol", "vitamin c"],
        "makeup": ["lipstick", "foundation", "mascara", "eyeshadow", "blush", "concealer", "powder",
                   "eyeliner", "lip gloss", "bronzer"],
        "haircare": ["shampoo", "conditioner", "hair mask", "hair oil", "styling", "hair serum", "dry shampoo"],
        "fragrance": ["perfume", "cologne", "fragrance", "body spray", "essential oil"],
    },
    "home": {
        "kitchen": ["coffee maker", "air fryer", "blender", "cookware", "pan", "pot", "knife", "cutting board",
                    "espresso", "kettle", "toaster", "mixer", "food processor", "rice cooker"],
        "furniture": ["sofa", "chair", "table", "desk", "bed", "mattress", "shelf", "cabinet", "wardrobe",
                      "dresser", "ottoman", "bench"],
        "decor": ["lamp", "lighting", "rug", "curtain", "mirror", "vase", "candle", "picture frame", "wall art"],
        "storage": ["storage", "organizer", "basket", "container", "shelf", "bin", "rack"],
    },
    "food": {
        "snacks": ["snack", "chip", "cookie", "cracker", "chocolate", "candy", "granola", "nuts"],
        "beverages": ["coffee", "tea", "juice", "soda", "water", "energy drink", "protein shake", "wine", "beer"],
        "pantry": ["pasta", "rice", "sauce", "oil", "spice", "canned", "flour", "sugar", "cereal"],
        "supplements": ["vitamin", "supplement", "protein powder", "creatine", "omega", "probiotic", "mineral"],
    },
    "sports": {
        "running": ["running", "jogging", "marathon", "trail run"],
        "gym": ["gym", "weight", "dumbbell", "barbell", "kettlebell", "bench press", "resistance"],
        "outdoor": ["hiking", "camping", "tent", "backpacking", "climbing", "kayak", "fishing"],
        "cycling": ["bike", "bicycle", "cycling", "helmet", "saddle", "pedal"],
    },
    "pet": {"food": ["food", "treat", "diet"], "supplies": ["toy", "bed", "crate", "leash", "collar", "litter", "grooming"]},
    "furniture": {"indoor": ["sofa", "bed", "chair", "table", "desk"], "outdoor": ["patio", "outdoor", "garden", "deck"]},
    "jewelry": {"fine": ["gold", "silver", "platinum", "diamond"], "fashion": ["costume", "fashion jewelry"]},
    "baby": {"gear": ["stroller", "car seat", "crib", "playpen"], "feeding": ["bottle", "breast pump", "high chair", "sippy"], "toys": ["toy", "plush", "rattle"]},
    "auto": {"parts": ["brake", "filter", "battery", "alternator", "spark plug", "belt"], "accessories": ["floor mat", "cover", "charger", "mount", "light"]},
}

# Identity fields are read from product data (never AI-generated).
# Knowledge/Decision/Trust fields map to generator modules in FIELD_SHAPES.
KNOWLEDGE_TEMPLATES: dict[str, dict] = {
    "fashion": {
        "label": "Fashion & Apparel",
        "subcategories": {
            "apparel": {
                "label": "Apparel",
                "identity": ["product_name", "brand", "category", "gender", "style", "sku"],
                "knowledge": ["description", "material", "fit", "size_guide", "care"],
                "decision": ["target_audience", "occasion", "season", "comparison", "buying_guide"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "footwear": {
                "label": "Footwear",
                "identity": ["product_name", "brand", "category", "gender", "style", "sku"],
                "knowledge": ["description", "material", "fit", "size_guide", "care"],
                "decision": ["target_audience", "occasion", "season", "comparison", "buying_guide"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "bags": {
                "label": "Bags",
                "identity": ["product_name", "brand", "category", "style", "sku"],
                "knowledge": ["description", "material", "specifications", "care"],
                "decision": ["target_audience", "occasion", "comparison", "use_cases", "buying_guide"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "accessories": {
                "label": "Accessories",
                "identity": ["product_name", "brand", "category", "style", "sku"],
                "knowledge": ["description", "material", "specifications", "care"],
                "decision": ["target_audience", "occasion", "comparison", "use_cases"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
        },
        "fallback": {
            "label": "Apparel & Accessories",
            "identity": ["product_name", "brand", "category", "sku"],
            "knowledge": ["description", "material", "fit", "size_guide", "care"],
            "decision": ["target_audience", "occasion", "season", "comparison"],
            "trust": ["faq", "pros", "cons", "ai_summary"],
        },
    },
    "electronics": {
        "label": "Electronics & Gadgets",
        "subcategories": {
            "audio": {
                "label": "Audio",
                "identity": ["product_name", "brand", "model", "series", "sku"],
                "knowledge": ["description", "specifications", "compatibility", "warranty", "package_includes"],
                "decision": ["target_audience", "comparison", "use_cases", "buying_guide"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "computing": {
                "label": "Computing",
                "identity": ["product_name", "brand", "model", "series", "sku"],
                "knowledge": ["description", "specifications", "compatibility", "warranty", "package_includes"],
                "decision": ["target_audience", "comparison", "use_cases", "buying_guide"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "mobile": {
                "label": "Mobile",
                "identity": ["product_name", "brand", "model", "sku"],
                "knowledge": ["description", "specifications", "compatibility", "warranty", "package_includes"],
                "decision": ["target_audience", "comparison", "use_cases"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "home_appliance": {
                "label": "Home Appliances",
                "identity": ["product_name", "brand", "model", "sku"],
                "knowledge": ["description", "specifications", "dimensions", "capacity", "warranty"],
                "decision": ["target_audience", "comparison", "buying_guide"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
        },
        "fallback": {
            "label": "Electronics",
            "identity": ["product_name", "brand", "model", "sku"],
            "knowledge": ["description", "specifications", "compatibility", "warranty"],
            "decision": ["target_audience", "comparison", "use_cases"],
            "trust": ["faq", "pros", "cons", "ai_summary"],
        },
    },
    "beauty": {
        "label": "Beauty & Cosmetics",
        "subcategories": {
            "skincare": {
                "label": "Skincare",
                "identity": ["product_name", "brand", "type", "sku"],
                "knowledge": ["description", "ingredients", "benefits", "how_to_use", "warnings", "certifications"],
                "decision": ["target_audience", "comparison", "buying_guide"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "makeup": {
                "label": "Makeup",
                "identity": ["product_name", "brand", "type", "sku"],
                "knowledge": ["description", "ingredients", "benefits", "how_to_use", "warnings", "certifications"],
                "decision": ["target_audience", "comparison"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "haircare": {
                "label": "Hair Care",
                "identity": ["product_name", "brand", "type", "sku"],
                "knowledge": ["description", "ingredients", "benefits", "how_to_use", "warnings"],
                "decision": ["target_audience", "comparison"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "fragrance": {
                "label": "Fragrance",
                "identity": ["product_name", "brand", "type", "sku"],
                "knowledge": ["description", "ingredients", "benefits", "how_to_use"],
                "decision": ["target_audience", "occasion", "comparison"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
        },
        "fallback": {
            "label": "Beauty",
            "identity": ["product_name", "brand", "type", "sku"],
            "knowledge": ["description", "ingredients", "benefits", "how_to_use", "warnings"],
            "decision": ["target_audience", "comparison"],
            "trust": ["faq", "pros", "cons", "ai_summary"],
        },
    },
    "home": {
        "label": "Home & Kitchen",
        "subcategories": {
            "kitchen": {
                "label": "Kitchen",
                "identity": ["product_name", "brand", "category", "sku"],
                "knowledge": ["description", "specifications", "capacity", "dimensions", "material", "cleaning", "warranty"],
                "decision": ["target_audience", "comparison", "buying_guide"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "furniture": {
                "label": "Furniture",
                "identity": ["product_name", "brand", "category", "sku"],
                "knowledge": ["description", "material", "dimensions", "specifications", "care", "warranty"],
                "decision": ["target_audience", "comparison", "buying_guide"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "decor": {
                "label": "Decor",
                "identity": ["product_name", "brand", "category", "sku"],
                "knowledge": ["description", "material", "dimensions", "care"],
                "decision": ["target_audience", "occasion", "comparison"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "storage": {
                "label": "Storage",
                "identity": ["product_name", "brand", "category", "sku"],
                "knowledge": ["description", "material", "dimensions", "capacity", "care"],
                "decision": ["target_audience", "comparison", "use_cases"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
        },
        "fallback": {
            "label": "Home & Kitchen",
            "identity": ["product_name", "brand", "category", "sku"],
            "knowledge": ["description", "material", "dimensions", "specifications", "care"],
            "decision": ["target_audience", "comparison"],
            "trust": ["faq", "pros", "cons", "ai_summary"],
        },
    },
    "food": {
        "label": "Food & Beverage",
        "subcategories": {
            "snacks": {
                "label": "Snacks",
                "identity": ["product_name", "brand", "sku"],
                "knowledge": ["description", "ingredients", "nutrition", "benefits", "warnings", "storage"],
                "decision": ["target_audience", "comparison"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "beverages": {
                "label": "Beverages",
                "identity": ["product_name", "brand", "sku"],
                "knowledge": ["description", "ingredients", "nutrition", "benefits", "warnings", "storage"],
                "decision": ["target_audience", "comparison"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "pantry": {
                "label": "Pantry",
                "identity": ["product_name", "brand", "sku"],
                "knowledge": ["description", "ingredients", "nutrition", "storage", "certifications"],
                "decision": ["target_audience", "comparison"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "supplements": {
                "label": "Supplements",
                "identity": ["product_name", "brand", "sku"],
                "knowledge": ["description", "ingredients", "benefits", "dosage", "warnings", "storage", "certifications"],
                "decision": ["target_audience", "comparison"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
        },
        "fallback": {
            "label": "Food & Beverage",
            "identity": ["product_name", "brand", "sku"],
            "knowledge": ["description", "ingredients", "nutrition", "storage"],
            "decision": ["target_audience", "comparison"],
            "trust": ["faq", "pros", "cons", "ai_summary"],
        },
    },
    "sports": {
        "label": "Sports & Outdoors",
        "subcategories": {
            "running": {
                "label": "Running",
                "identity": ["product_name", "brand", "activity", "sku"],
                "knowledge": ["description", "material", "specifications", "fit", "care"],
                "decision": ["target_audience", "comparison", "buying_guide"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "gym": {
                "label": "Gym & Fitness",
                "identity": ["product_name", "brand", "activity", "sku"],
                "knowledge": ["description", "material", "specifications", "dimensions", "care"],
                "decision": ["target_audience", "comparison", "buying_guide"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "outdoor": {
                "label": "Outdoor",
                "identity": ["product_name", "brand", "activity", "sku"],
                "knowledge": ["description", "material", "specifications", "dimensions", "care"],
                "decision": ["target_audience", "comparison", "buying_guide"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
            "cycling": {
                "label": "Cycling",
                "identity": ["product_name", "brand", "activity", "sku"],
                "knowledge": ["description", "material", "specifications", "dimensions", "care"],
                "decision": ["target_audience", "comparison", "buying_guide"],
                "trust": ["faq", "pros", "cons", "ai_summary"],
            },
        },
        "fallback": {
            "label": "Sports & Outdoors",
            "identity": ["product_name", "brand", "activity", "sku"],
            "knowledge": ["description", "material", "specifications", "care"],
            "decision": ["target_audience", "comparison"],
            "trust": ["faq", "pros", "cons", "ai_summary"],
        },
    },
    # ── Simple categories (no subcategories — direct field sets) ──
    "pet": {
        "label": "Pet Supplies",
        "fallback": {
            "label": "Pet Supplies",
            "identity": ["product_name", "brand", "pet_type", "sku"],
            "knowledge": ["description", "ingredients", "specifications", "material", "care"],
            "decision": ["target_audience", "comparison", "buying_guide"],
            "trust": ["faq", "pros", "cons", "ai_summary"],
        },
    },
    "furniture": {
        "label": "Furniture",
        "fallback": {
            "label": "Furniture",
            "identity": ["product_name", "brand", "sku"],
            "knowledge": ["description", "material", "dimensions", "specifications", "care", "warranty"],
            "decision": ["target_audience", "comparison", "buying_guide"],
            "trust": ["faq", "pros", "cons", "ai_summary"],
        },
    },
    "jewelry": {
        "label": "Jewelry",
        "fallback": {
            "label": "Jewelry",
            "identity": ["product_name", "brand", "sku"],
            "knowledge": ["description", "material", "specifications", "care"],
            "decision": ["target_audience", "occasion", "comparison"],
            "trust": ["faq", "pros", "cons", "ai_summary"],
        },
    },
    "baby": {
        "label": "Baby Products",
        "fallback": {
            "label": "Baby Products",
            "identity": ["product_name", "brand", "sku"],
            "knowledge": ["description", "material", "specifications", "care", "warnings"],
            "decision": ["target_audience", "comparison"],
            "trust": ["faq", "pros", "cons", "ai_summary"],
        },
    },
    "auto": {
        "label": "Automotive",
        "fallback": {
            "label": "Automotive",
            "identity": ["product_name", "brand", "sku"],
            "knowledge": ["description", "specifications", "compatibility", "dimensions", "warranty", "package_includes"],
            "decision": ["target_audience", "comparison", "buying_guide"],
            "trust": ["faq", "pros", "cons", "ai_summary"],
        },
    },
}


def get_template(category: str, subcategory: str | None = None) -> dict:
    """Resolve the four-layer field set for a category (+subcategory)."""
    tpl = KNOWLEDGE_TEMPLATES.get(category)
    if not tpl:
        return {"label": "General Product", "identity": ["product_name", "brand", "sku"],
                "knowledge": ["description", "specifications"], "decision": ["comparison"],
                "trust": ["faq", "pros", "cons"]}
    if subcategory and subcategory in tpl.get("subcategories", {}):
        return tpl["subcategories"][subcategory]
    return tpl.get("fallback", tpl)


def detect_subcategory(product: dict, category: str) -> str:
    """Three-layer subcategory detection:
    1. product_type exact-ish match  2. keyword match  3. default."""
    ptype = (product.get("product_type") or "").lower()
    text = f"{ptype} {(product.get('title') or '').lower()} {' '.join(product.get('tags') or []).lower()}"

    cat_map = SUBCATEGORY_KEYWORDS.get(category, {})
    if not cat_map:
        return "default"

    # Layer 1: product_type exact match
    for sub, keywords in cat_map.items():
        if ptype and ptype.strip() in [k for k in keywords]:
            return sub

    # Layer 2: keyword containment (first match wins, longest keyword priority)
    best_sub, best_len = "default", 0
    for sub, keywords in cat_map.items():
        for kw in keywords:
            if kw in text and len(kw) > best_len:
                best_sub, best_len = sub, len(kw)
    return best_sub


def generate_field_list(category: str, subcategory: str | None = None) -> tuple[list[str], list[str], list[str], list[str]]:
    """Return (identity, knowledge, decision, trust) field lists for generation."""
    tpl = get_template(category, subcategory)
    return (tpl.get("identity", []), tpl.get("knowledge", []),
            tpl.get("decision", []), tpl.get("trust", []))
