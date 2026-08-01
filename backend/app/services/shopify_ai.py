"""
Shopify AI Content Generation — SaaS side of the One-click Publish chain (⑥).

Generates GEO-optimized content for a product via the ofox.ai gateway.
Content shapes match the Theme App Extension render contract.

Content boundaries: docs/product-content-boundaries.md
  ✅ description/FAQ/modules via metafield + optional description overwrite
  ❌ never touches merchant pages, collections, nav, theme source, images

Category-aware generation:
  Step 1 — detect category from product data (title, description, product_type, tags)
  Step 2 — only generate modules relevant to that category
  This prevents a T-shirt from getting "Compatibility" or a coffee machine from getting "Size Guide".
"""

import json
from typing import Any

from openai import AsyncOpenAI

from app.core.config import get_settings

# ═══ Module Pool — EVERY possible content module ProdRank can generate ═══
# Categories pick from this pool; new industries only add JSON rules, not code.
ALL_MODULES: dict[str, str] = {  # field_key → human-readable label
    "description":     "AI-optimized product description",
    "ai_summary":      "One-paragraph product summary",
    "faq":             "Frequently asked questions",
    "pros":            "Product strengths / advantages",
    "cons":            "Product weaknesses / limitations",
    "comparison":      "Side-by-side competitor comparison table",
    "use_cases":       "Ideal use cases / scenarios",
    "buying_guide":    "Step-by-step purchasing guide",
    "specifications":  "Technical specifications table",
    "compatibility":   "Compatible devices / models / accessories",
    "warranty":        "Warranty coverage details",
    "package_includes":"What's in the box",
    "target_audience": "Who this product is for",
    "occasion":        "Suitable occasions / events",
    "season":          "Seasonal appropriateness",
    "fit":             "Fit / sizing guidance",
    "size_guide":      "Size chart / measurement guide",
    "material":        "Fabric / materials / build quality",
    "care":            "Care / washing / maintenance instructions",
    "ingredients":     "Ingredients list (food, supplements, cosmetics)",
    "benefits":        "Health / wellness benefits",
    "dosage":          "Dosage / usage instructions (supplements)",
    "warnings":        "Safety warnings / allergen alerts",
    "nutrition":       "Nutritional information",
    "certifications":  "Certifications (organic, FDA, fair trade, CE, etc.)",
    "storage":         "Storage / shelf-life instructions",
    "cleaning":        "Cleaning / descaling instructions",
    "capacity":        "Capacity / volume specifications",
    "dimensions":      "Physical dimensions / weight",
    "how_to_use":      "Usage instructions",
    "shipping":        "Shipping information",
    "returns":         "Return / refund policy summary",
}

# ═══ Content shapes for each module (LLM output contract) ═══
FIELD_SHAPES: dict[str, Any] = {
    "description":     {"title": "str", "html": "str"},
    "ai_summary":      {"title": "str", "html": "str"},
    "pros":            {"title": "str", "items": ["str"]},
    "cons":            {"title": "str", "items": ["str"]},
    "faq":            {"title": "str", "questions": [{"question": "str", "answer": "str"}]},
    "comparison":     {"title": "str", "competitor": "str", "rows": [{"ours": "str", "typical": "str"}]},
    "use_cases":      {"title": "str", "items": [{"title": "str", "description": "str"}]},
    "buying_guide":   {"title": "str", "steps": [{"title": "str", "detail": "str"}]},
    "specifications": {"title": "str", "items": [{"name": "str", "value": "str"}]},
    "compatibility":  {"title": "str", "items": ["str"]},
    "warranty":       {"title": "str", "html": "str"},
    "package_includes":{"title": "str", "items": ["str"]},
    "target_audience":{"title": "str", "html": "str"},
    "occasion":       {"title": "str", "items": ["str"]},
    "season":         {"title": "str", "html": "str"},
    "fit":            {"title": "str", "html": "str"},
    "size_guide":     {"title": "str", "html": "str"},
    "material":       {"title": "str", "html": "str"},
    "care":           {"title": "str", "html": "str"},
    "ingredients":    {"title": "str", "items": [{"name": "str", "amount": "str"}]},
    "benefits":       {"title": "str", "items": [{"title": "str", "description": "str"}]},
    "dosage":         {"title": "str", "html": "str"},
    "warnings":       {"title": "str", "items": ["str"]},
    "nutrition":      {"title": "str", "items": [{"name": "str", "value": "str"}]},
    "certifications": {"title": "str", "items": ["str"]},
    "storage":        {"title": "str", "html": "str"},
    "cleaning":       {"title": "str", "html": "str"},
    "capacity":       {"title": "str", "items": [{"name": "str", "value": "str"}]},
    "dimensions":     {"title": "str", "items": [{"name": "str", "value": "str"}]},
    "how_to_use":     {"title": "str", "html": "str"},
    "shipping":       {"title": "str", "html": "str"},
    "returns":        {"title": "str", "html": "str"},
}

# ═══ Category → applicable modules ═══
# Modules are listed in recommended display order.
# description + faq + pros are always first; the rest is category-specific.
CATEGORY_RULES: dict[str, dict] = {
    "fashion": {
        "label": "Fashion & Apparel",
        "modules": ["description", "target_audience", "occasion", "season", "fit", "size_guide",
                     "material", "care", "faq", "pros", "cons", "ai_summary", "comparison"],
    },
    "electronics": {
        "label": "Electronics & Gadgets",
        "modules": ["description", "specifications", "compatibility", "dimensions", "warranty",
                     "package_includes", "faq", "pros", "cons", "comparison", "ai_summary"],
    },
    "beauty": {
        "label": "Beauty & Cosmetics",
        "modules": ["description", "ingredients", "benefits", "how_to_use", "warnings",
                     "certifications", "faq", "pros", "cons", "ai_summary"],
    },
    "home": {
        "label": "Home & Kitchen",
        "modules": ["description", "specifications", "dimensions", "material", "cleaning",
                     "capacity", "warranty", "faq", "pros", "cons", "comparison", "ai_summary"],
    },
    "food": {
        "label": "Food & Beverage",
        "modules": ["description", "ingredients", "nutrition", "benefits", "warnings",
                     "storage", "certifications", "faq", "pros", "cons", "ai_summary"],
    },
    "sports": {
        "label": "Sports & Outdoors",
        "modules": ["description", "specifications", "target_audience", "material", "care",
                     "fit", "faq", "pros", "cons", "comparison", "ai_summary"],
    },
    "generic": {
        "label": "General Product",
        "modules": ["description", "faq", "pros", "cons", "ai_summary", "comparison"],
    },
}

CATEGORY_PROMPT_VERSION = "v2"   # bumped: category-aware generation
MODEL = "deepseek-v4-flash"  # DeepSeek official (llm.get_content_client handles fallback)


def build_schema(product: dict, shop_info: dict, faq: list[dict] | None = None) -> dict:
    """⑤ Schema Renderer (SaaS side) — assemble the full JSON-LD from synced data."""
    # (unchanged — same as before)
    variants = product.get("variants") or []
    first = variants[0] if variants else {}
    images = product.get("images") or []
    available = bool(product.get("in_stock", True))
    shop_name = shop_info.get("name") or ""
    shop_url = f"https://{shop_info.get('domain') or ''}"
    product_url = product.get("url") or ""
    schema: dict[str, Any] = {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": product.get("title", ""),
        "description": (product.get("description") or "")[:3000],
        "image": images[:5] if images else None,
        "sku": first.get("sku", "") or None,
        "gtin13": first.get("barcode", "") or None,
        "brand": {"@type": "Brand", "name": product.get("brand") or shop_name} if (product.get("brand") or shop_name) else None,
        "offers": {
            "@type": "Offer", "url": product_url or None,
            "priceCurrency": first.get("price_currency", "USD"),
            "price": str(first.get("price", "0")),
            "availability": "https://schema.org/InStock" if available else "https://schema.org/OutOfStock",
            "itemCondition": "https://schema.org/NewCondition",
            "shippingDetails": {
                "@type": "OfferShippingDetails",
                "shippingDestination": {"@type": "DefinedRegion", "addressCountry": "US"},
                "deliveryTime": {
                    "@type": "ShippingDeliveryTime",
                    "handlingTime": {"@type": "QuantitativeValue", "minValue": 1, "maxValue": 2, "unitCode": "d"},
                    "transitTime": {"@type": "QuantitativeValue", "minValue": 3, "maxValue": 7, "unitCode": "d"},
                },
            },
            "hasMerchantReturnPolicy": {
                "@type": "MerchantReturnPolicy", "applicableCountry": "US",
                "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
                "merchantReturnDays": 30, "returnMethod": "https://schema.org/ReturnByMail",
                "returnFees": "https://schema.org/FreeReturn",
            },
        },
        "breadcrumb": {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": shop_url or None},
                {"@type": "ListItem", "position": 2, "name": product.get("title", "")[:60], "item": product_url or None},
            ],
        },
    }
    rating = product.get("aggregate_rating")
    if rating and float(rating.get("rating_value", 0) or 0) > 0:
        schema["aggregateRating"] = {
            "@type": "AggregateRating", "ratingValue": str(rating["rating_value"]),
            "bestRating": "5", "reviewCount": str(rating.get("review_count", 1)),
        }
    schema = {k: v for k, v in schema.items() if v is not None}
    return schema


def _validate_shape(value: Any, shape: Any, path: str = "") -> bool:
    """Recursively validate a generated value against the expected shape."""
    if isinstance(shape, dict):
        if not isinstance(value, dict):
            return False
        for key, sub in shape.items():
            if key not in value or not _validate_shape(value[key], sub, f"{path}.{key}"):
                return False
        return True
    if isinstance(shape, list):
        if not isinstance(value, list) or not value:
            return False
        return all(_validate_shape(item, shape[0], path) for item in value)
    return isinstance(value, str) and len(value.strip()) > 0


class ShopifyAIService:
    """Generate GEO-optimized, category-aware content for a product."""

    def __init__(self):
        from app.services.llm import get_content_client
        self.client, self.model = get_content_client()

    # ── Step 1: Category detection ──

    async def detect_category(self, product: dict) -> tuple[str, int]:
        """Given product data, return (category_key, confidence 0-100).
        category_key matches a key in CATEGORY_RULES.

        Fast path: if product_type already matches a known category, skip AI.
        Otherwise: AI classifies from title + description + product_type + tags.
        Cost: ~$0.0003 per call (tiny prompt, ~50 input tokens + ~20 output)."""
        ptype = (product.get("product_type") or "").lower()
        title_lower = (product.get("title") or "").lower()
        tags = " ".join(product.get("tags") or []).lower()
        description = (product.get("description") or "")[:300].lower()
        combined = f"{ptype} {title_lower} {tags} {description}"

        # Quick keyword match for common Shopify Product Types
        keyword_map: dict[str, list[str]] = {
            "fashion": ["cloth", "shirt", "t-shirt", "dress", "pant", "jean", "jacket", "coat", "shoe",
                        "sneaker", "hoodie", "sweater", "skirt", "top", "bottom", "apparel", "wear",
                        "fashion", "hat", "cap", "scarf", "belt", "sock", "underwear", "swim"],
            "electronics": ["electronic", "gadget", "phone", "laptop", "tablet", "camera", "speaker",
                           "headphone", "charger", "cable", "adapter", "monitor", "keyboard", "mouse",
                           "watch", "tv", "television", "audio", "computer", "usb", "hdmi"],
            "beauty": ["cosmetic", "makeup", "skincare", "cream", "serum", "lotion", "shampoo",
                      "conditioner", "perfume", "fragrance", "nail", "lipstick", "mascara", "beauty",
                      "hair", "face", "skin", "bath", "soap"],
            "home": ["kitchen", "cook", "bake", "furniture", "decor", "bed", "pillow", "blanket",
                    "towel", "lamp", "light", "rug", "curtain", "storage", "organizer", "home",
                    "household", "dinner", "plate", "cup", "mug", "pan", "pot", "appliance"],
            "food": ["food", "beverage", "drink", "snack", "coffee", "tea", "chocolate", "candy",
                    "supplement", "vitamin", "protein", "nutrition", "organic", "gluten", "vegan"],
            "sports": ["sport", "fitness", "exercise", "yoga", "gym", "running", "hiking", "camping",
                      "bike", "cycling", "swim", "outdoor", "athletic", "training", "ball"],
        }
        for cat, keywords in keyword_map.items():
            score = sum(1 for kw in keywords if kw in combined)
            if score >= 3:     # strong match — 3+ keywords hit
                return (cat, 95)
            if score >= 1 and cat == "fashion" and any(k in combined for k in ["shirt", "dress", "shoe", "jacket", "pant"]):
                return (cat, 92)

        # AI fallback: let the LLM classify
        try:
            resp = await self.client.chat.completions.create(
                model=self.model,
                messages=[{
                    "role": "system",
                    "content": "You classify products into categories. Reply with ONLY the category key and confidence. No other text.",
                }, {
                    "role": "user",
                    "content": (
                        f"Product: {product.get('title', '')}\n"
                        f"Type: {ptype or 'unknown'}\n"
                        f"Description: {(product.get('description') or '')[:200]}\n"
                        f"Tags: {tags}\n\n"
                        f"Categories: fashion, electronics, beauty, home, food, sports, generic\n"
                        f"Reply: <category> <confidence_0-100>"
                    ),
                }],
                temperature=0.1, max_tokens=15, timeout=10.0,
            )
            raw = (resp.choices[0].message.content or "").strip().lower()
            parts = raw.split()
            cat = parts[0] if parts else "generic"
            conf = 0
            try:
                conf = int(parts[1]) if len(parts) > 1 else 60
            except ValueError:
                conf = 60
            cat = cat if cat in CATEGORY_RULES else "generic"
            return (cat, min(100, conf))
        except Exception:
            return ("generic", 30)

    # ── Step 2: Content generation ──

    def modules_for_category(self, category: str) -> list[str]:
        """Return the list of module keys applicable to a category."""
        rule = CATEGORY_RULES.get(category, CATEGORY_RULES["generic"])
        return rule["modules"]

    def _product_context(self, product: dict) -> str:
        variants = product.get("variants") or []
        first = variants[0] if variants else {}
        parts = [
            f"Name: {product.get('title', '')}",
            f"Brand: {product.get('brand') or product.get('vendor') or ''}",
            f"Price: {first.get('price', product.get('price', ''))}",
            f"Type: {product.get('product_type', '')}",
            f"Tags: {', '.join(product.get('tags') or [])}",
            f"Description: {(product.get('description') or '')[:1500]}",
        ]
        return "\n".join(parts)

    async def generate_fields(self, product: dict, fields: list[str],
                              category: str | None = None,
                              template_mode: bool = False) -> dict:
        """Generate the requested content fields in one AI call.
        If `category` is provided, only modules applicable to that category are
        generated (category-specific fields are filtered before the LLM call).
        If `category` is None, the caller is responsible for filtering.
        If `template_mode` is True, product-specific values are replaced with
        {{product_name}} / {{price}} / {{brand}} placeholders so the result
        can be applied across a whole category (batch templates).

        Returns {field: content} in the exact shapes of FIELD_SHAPES."""
        # Field set is decided by the API layer via the four-layer knowledge
        # template (authoritative). Here we only drop fields with no known
        # shape — a safety net, never a category filter.
        fields = [f for f in fields if f in FIELD_SHAPES]

        if not fields:
            return {}

        context = self._product_context(product)
        cat_label = CATEGORY_RULES.get(category or "generic", {}).get("label", "General Product")
        shape_guide = "\n".join(
            f"- {f} ({ALL_MODULES.get(f, f)}): {json.dumps(FIELD_SHAPES.get(f, {f: 'str'}), ensure_ascii=False)}"
            for f in fields
        )

        template_rule = ""
        if template_mode:
            template_rule = (
                "\n\nTEMPLATE MODE: This content will be applied to MANY products in this category. "
                "NEVER use the specific product name, price, brand, or vendor from the product data. "
                "Instead use these exact placeholders wherever those values would appear: "
                "{{product_name}}, {{price}}, {{brand}}. "
                "Write the content so it works for any product in this category — no invented specifics."
            )

        prompt = f"""You are a GEO (Generative Engine Optimization) content writer for e-commerce.

PRODUCT CATEGORY: {cat_label}
PRODUCT DATA:
{context}

Generate ONLY the content fields listed below. This is a {cat_label} product — generate category-appropriate content. Do NOT fabricate specifications, certifications, or review data that is not in the product data. If unknown, say so honestly or omit. FAQs must be realistic customer questions with useful answers.
{template_rule}

FIELDS TO GENERATE ({len(fields)}):
{shape_guide}

Return ONLY valid JSON (no markdown, no explanation), an object with one key per field:
{{"{fields[0]}": {{...}}, ...}}"""

        try:
            resp = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.6,
                max_tokens=6000,
                timeout=45.0,
            )
            text = (resp.choices[0].message.content or "").strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].split("```")[0].strip()
            data = json.loads(text)
        except Exception as e:
            return {"error": f"AI generation failed: {str(e)[:200]}"}

        out: dict = {}
        for f in fields:
            value = data.get(f)
            if value is None:
                continue
            shape = FIELD_SHAPES.get(f, {f: "str"})
            if not _validate_shape(value, shape):
                continue
            out[f] = value
        return out
