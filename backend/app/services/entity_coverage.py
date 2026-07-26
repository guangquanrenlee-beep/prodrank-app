"""Entity Coverage — category-specific entity detection instead of abstract 5W1H."""
CATEGORY_ENTITIES = {
    "fashion": ["Material","Fit","Season","Audience","Care","Style","Size","Color","Closure","Pocket","Layering"],
    "electronics": ["Battery","Compatibility","Warranty","Specs","Use Case","Brand","Connectivity","Dimensions","Weight"],
    "home": ["Material","Warranty","Installation","Dimensions","Maintenance","Capacity","Power","Noise"],
    "coffee": ["Grind Size","Pressure","Temperature","Capacity","Maintenance","Bean Type","Milk Frothing","Warranty"],
    "beauty": ["Ingredients","Skin Type","Usage","Shelf Life","Allergens","Cruelty Free","SPF","Coverage"],
    "sports": ["Terrain","Skill Level","Material","Weight","Weather","Durability","Waterproof","Breathability"],
    "default": ["Material","Use Case","Audience","Warranty","Maintenance","Compatibility","Weight","Dimensions"],
}

def get_entities(category: str) -> list[str]:
    for key, entities in CATEGORY_ENTITIES.items():
        if key in category.lower(): return entities
    return CATEGORY_ENTITIES["default"]

def check_coverage(category: str, description: str, page_text: str) -> dict:
    """Check which category-specific entities are covered in product content."""
    entities = get_entities(category)
    result = {"category": category, "total": len(entities), "covered": 0, "entities": []}
    text = (description + " " + page_text).lower()
    for entity in entities:
        covered = entity.lower() in text
        if covered: result["covered"] += 1
        result["entities"].append({"name": entity, "covered": covered})
    result["score"] = round(result["covered"] / max(result["total"], 1) * 100)
    return result
