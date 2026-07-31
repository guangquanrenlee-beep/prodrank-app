"""
Shopify AI Content Generation — SaaS side of the One-click Publish chain (⑥).

Generates GEO-optimized content for a Shopify product via the ofox.ai gateway,
in the exact content shapes the Theme App Extension renders
(extensions/schema-inject/blocks/ai-content.liquid).

Content boundaries: docs/product-content-boundaries.md
  ✅ description/FAQ/modules via metafield + optional description overwrite
  ❌ never touches merchant pages, collections, nav, theme source, images
"""

import json
from typing import Any

from openai import AsyncOpenAI

from app.core.config import get_settings

# Content shape contract — matches ai-content.liquid render expectations.
# Each key is a prodrank.* metafield; the dict describes the expected JSON shape.
FIELD_SHAPES: dict[str, dict] = {
    "description": {"title": "str", "html": "str"},
    "ai_summary": {"title": "str", "html": "str"},
    "pros": {"title": "str", "items": ["str"]},
    "cons": {"title": "str", "items": ["str"]},
    "faq": {"title": "str", "questions": [{"question": "str", "answer": "str"}]},
    "comparison": {"title": "str", "competitor": "str", "rows": [{"ours": "str", "typical": "str"}]},
    "use_cases": {"title": "str", "items": [{"title": "str", "description": "str"}]},
    "buying_guide": {"title": "str", "steps": [{"title": "str", "detail": "str"}]},
    "specification": {"title": "str", "items": [{"name": "str", "value": "str"}]},
}

PROMPT_VERSION = "v1"
MODEL = "anthropic/claude-haiku-4.5"

# The schema JSON-LD is assembled in code (not by the LLM) for quality control.
# Only visible content (description/faq/...) is LLM-generated.


def build_schema(product: dict, shop_info: dict, faq: list[dict] | None = None) -> dict:
    """⑤ Schema Renderer (SaaS side) — assemble the full JSON-LD from synced data.
    Covers: Product, Offer, AggregateRating (only with real reviews), FAQPage,
    Breadcrumb, MerchantReturnPolicy, ShippingDetails. Website/SearchAction and
    Organization are output by Liquid blocks site-wide."""
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
            "@type": "Offer",
            "url": product_url or None,
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
                "@type": "MerchantReturnPolicy",
                "applicableCountry": "US",
                "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
                "merchantReturnDays": 30,
                "returnMethod": "https://schema.org/ReturnByMail",
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
    # AggregateRating ONLY from real review data — never fabricated
    rating = product.get("aggregate_rating")
    if rating and float(rating.get("rating_value", 0) or 0) > 0:
        schema["aggregateRating"] = {
            "@type": "AggregateRating",
            "ratingValue": str(rating["rating_value"]),
            "bestRating": "5",
            "reviewCount": str(rating.get("review_count", 1)),
        }
    # FAQPage block from AI-generated FAQ (stored separately in prodrank.faq)
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
    """Generate GEO-optimized content fields for a Shopify product."""

    def __init__(self):
        settings = get_settings()
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )

    def _product_context(self, product: dict) -> str:
        variants = product.get("variants") or []
        first = variants[0] if variants else {}
        parts = [
            f"Name: {product.get('title', '')}",
            f"Brand: {product.get('brand') or product.get('vendor') or ''}",
            # WooCommerce products carry price at the top level; Shopify at variant level
            f"Price: {first.get('price', product.get('price', ''))}",
            f"Type: {product.get('product_type', '')}",
            f"Tags: {', '.join(product.get('tags') or [])}",
            f"Description: {(product.get('description') or '')[:1500]}",
        ]
        return "\n".join(parts)

    async def generate_fields(self, product: dict, fields: list[str]) -> dict:
        """Generate the requested content fields in one AI call.
        Returns {field: content} in the exact shapes of FIELD_SHAPES."""
        requested = [f for f in fields if f in FIELD_SHAPES]
        if not requested:
            return {}

        context = self._product_context(product)
        shape_guide = "\n".join(f"- {f}: {json.dumps(FIELD_SHAPES[f], ensure_ascii=False)}" for f in requested)

        prompt = f"""You are a GEO (Generative Engine Optimization) content writer for e-commerce.

PRODUCT DATA:
{context}

Generate these content fields for the product page. Follow the EXACT JSON shapes given.
Write factual, persuasive English marketing copy. Do NOT fabricate specifications,
certifications, or review data that is not in the product data — if unknown, say so
honestly or omit. FAQs must be realistic customer questions with useful answers.

EXPECTED SHAPES:
{shape_guide}

Return ONLY valid JSON (no markdown, no explanation), an object with one key per field:
{{"description": {{...}}, "faq": {{...}}, ...}}"""

        try:
            resp = await self.client.chat.completions.create(
                model=MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.6,
                max_tokens=3000,
                timeout=45.0,
            )
            text = (resp.choices[0].message.content or "").strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].split("```")[0].strip()
            data = json.loads(text)
        except Exception as e:
            return {"error": f"AI generation failed: {str(e)[:200]}"}

        out: dict = {}
        for f in requested:
            value = data.get(f)
            if value is None:
                continue
            if not _validate_shape(value, FIELD_SHAPES[f]):
                # Keep invalid fields out; they can be regenerated individually
                continue
            out[f] = value
        return out
