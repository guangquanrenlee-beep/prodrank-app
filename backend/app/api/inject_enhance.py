"""
Inject Enhancement API — AI generates rich Schema content for inject.js.
Called by inject.js after basic DOM extraction. Returns enhanced JSON-LD blocks.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class EnhanceRequest(BaseModel):
    site: str = ""
    url: str = ""
    product_name: str = ""
    description: str = ""
    price: str = ""
    currency: str = "USD"
    images: list[str] = []
    sku: str = ""
    brand: str = ""
    availability: str = "https://schema.org/InStock"
    rating: Optional[float] = None
    review_count: int = 0
    page_text: str = ""  # first 2000 chars of page text for context


@router.post("/enhance")
async def enhance_schema(req: EnhanceRequest, request: Request):
    """AI-enhance product Schema with FAQ, category, brand story, certifications, comparison."""
    from openai import AsyncOpenAI
    from app.core.config import get_settings
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)
    model = "anthropic/claude-haiku-4.5"

    name = req.product_name or "Product"
    brand = req.brand or "Brand"
    context = req.page_text[:2000] if req.page_text else f"{name} {req.description}"

    prompt = f"""Analyze this product and generate enhanced structured data for AI visibility.

PRODUCT INFO:
  Name: {name}
  Brand: {brand}
  Description: {req.description[:300]}
  Price: {req.price} {req.currency}
  Page Context: {context[:1500]}

Generate a COMPLETE JSON-LD enhancement package. Include ALL of the following:

1. "category": Best guess at Google Product Category (e.g. "Apparel & Accessories > Clothing > Dresses")
2. "aggregateRating": ONLY include if actual rating data is available ({req.rating or 'none'}, {req.review_count} reviews). If no real rating exists, set this to null. NEVER fabricate ratings.
3. "faq": Generate 5-6 SPECIFIC questions a real customer would ask about {name}. Use the product context to make them relevant. Format as array of {{"question":"...","answer":"..."}}
4. "brand_story": Write a 100-word brand story for {brand}. Professional, appealing to customers.
5. "comparison": List 3-4 key points that differentiate {name} from similar products. What makes it special?
6. "certifications": If the page mentions any certifications (organic, fair trade, CE, FDA, etc.), list them. Otherwise return empty array.
7. "shipping_info": Generate realistic shipping details JSON: {{"@type":"OfferShippingDetails","shippingDestination":{{"@type":"DefinedRegion","addressCountry":"US"}},"deliveryTime":{{"@type":"ShippingDeliveryTime","handlingTime":{{"@type":"QuantitativeValue","minValue":1,"maxValue":2,"unitCode":"d"}},"transitTime":{{"@type":"QuantitativeValue","minValue":3,"maxValue":7,"unitCode":"d"}}}}}}

Return ONLY valid JSON (no markdown, no explanation):
{{
  "category": "...",
  "aggregateRating": {{ "ratingValue": "...", "bestRating": "5", "reviewCount": "..." }},
  "faq": [ ... ],
  "brand_story": "...",
  "comparison": [ "point 1", "point 2", "point 3" ],
  "certifications": [ ... ],
  "shipping_info": {{ ... }}
}}"""

    try:
        resp = await client.chat.completions.create(
            model=model, messages=[{"role": "user", "content": prompt}],
            temperature=0.7, max_tokens=1500, timeout=30.0,
        )
        import json
        text = resp.choices[0].message.content or ""
        if text.startswith("```"): text = text.split("\n", 1)[1].split("```")[0]
        data = json.loads(text)

        # Build complete enhanced Schema blocks
        product_schema = _build_product_schema(req, data)
        org_schema = _build_org_schema(brand, req.url)
        faq_schema = _build_faq_schema(data.get("faq", []))
        brand_schema = _build_brand_schema(brand, data.get("brand_story", ""), req.url)

        return {
            "status": "enhanced",
            "category": data.get("category", ""),
            "schemas": {
                "product": product_schema,
                "organization": org_schema,
                "faq": faq_schema,
                "brand": brand_schema,
            },
        }
    except Exception as e:
        # Return basic schema as fallback
        return {
            "status": "basic",
            "error": str(e)[:200],
            "schemas": {
                "product": _build_basic_product(req),
                "organization": _build_org_schema(brand, req.url),
                "faq": _build_basic_faq(req.product_name or "this product"),
                "brand": None,
            },
        }


def _build_product_schema(req: EnhanceRequest, ai: dict) -> dict:
    schema: dict = {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": req.product_name,
        "description": req.description or f"{req.product_name} by {req.brand}",
        "image": req.images[:5] if req.images else None,
        "sku": req.sku or None,
        "brand": {"@type": "Brand", "name": req.brand} if req.brand else None,
        "offers": {
            "@type": "Offer",
            "url": req.url,
            "priceCurrency": req.currency,
            "price": req.price or "0",
            "availability": req.availability,
            "itemCondition": "https://schema.org/NewCondition",
            "shippingDetails": ai.get("shipping_info"),
        },
        "category": ai.get("category", ""),
    }
    # ONLY include aggregateRating if the page actually has real rating data
    if req.rating and req.rating > 0:
        schema["aggregateRating"] = {
            "@type": "AggregateRating",
            "ratingValue": str(req.rating),
            "bestRating": "5",
            "reviewCount": str(max(req.review_count, 1)),
        }
    # Clean None values
    return {k: v for k, v in schema.items() if v is not None}


def _build_basic_product(req: EnhanceRequest) -> dict:
    schema: dict = {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": req.product_name,
        "description": req.description or f"{req.product_name} by {req.brand}",
        "image": req.images[:5] if req.images else None,
        "sku": req.sku or None,
        "brand": {"@type": "Brand", "name": req.brand} if req.brand else None,
        "offers": {
            "@type": "Offer",
            "url": req.url,
            "priceCurrency": req.currency,
            "price": req.price or "0",
            "availability": req.availability,
            "itemCondition": "https://schema.org/NewCondition",
        },
    }
    if req.rating and req.rating > 0:
        schema["aggregateRating"] = {"@type": "AggregateRating", "ratingValue": str(req.rating), "bestRating": "5", "reviewCount": str(max(req.review_count, 1))}
    return {k: v for k, v in schema.items() if v is not None}


def _build_org_schema(brand: str, url: str) -> dict:
    org_domain = url.split("//")[-1].split("/")[0] if url else ""
    return {"@context": "https://schema.org/", "@type": "Organization", "name": brand, "url": f"https://{org_domain}" if org_domain else ""}


def _build_faq_schema(faqs: list) -> dict | None:
    if not faqs:
        return None
    return {
        "@context": "https://schema.org/",
        "@type": "FAQPage",
        "mainEntity": [{"@type": "Question", "name": q["question"], "acceptedAnswer": {"@type": "Answer", "text": q["answer"]}} for q in faqs[:6]],
    }


def _build_basic_faq(name: str) -> dict:
    return {
        "@context": "https://schema.org/",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": f"What is the return policy for {name}?", "acceptedAnswer": {"@type": "Answer", "text": "Please visit our Returns page for the complete policy and instructions."}},
            {"@type": "Question", "name": "How long does shipping take?", "acceptedAnswer": {"@type": "Answer", "text": "Standard delivery takes 5-10 business days within the US. International orders may vary."}},
            {"@type": "Question", "name": f"Is {name} available in other sizes or colors?", "acceptedAnswer": {"@type": "Answer", "text": "Please check our store for all available variants."}},
            {"@type": "Question", "name": "How do I contact customer support?", "acceptedAnswer": {"@type": "Answer", "text": "You can reach us via our Contact page. We respond within 24 hours."}},
            {"@type": "Question", "name": f"What size should I order?", "acceptedAnswer": {"@type": "Answer", "text": "Refer to our size chart on the product page for the best fit."}},
        ],
    }


def _build_brand_schema(brand: str, story: str, url: str) -> dict | None:
    if not story:
        return None
    return {"@context": "https://schema.org/", "@type": "Brand", "name": brand, "description": story, "url": url}
