"""Batch template API — optimize whole catalogs cheaply.

Design (anti-abuse + real need):
  1. /groups — pull all products, detect category per product (keyword
     fast-path, AI fallback), return grouped by category.
  2. /generate-template — generate ONE template per category from a
     sample product (1 AI call, consumes 1 monthly generation). Content
     uses {{product_name}} / {{price}} / {{brand}} placeholders.
  3. /apply — substitute placeholders per product and write to every
     product in the category (free: no AI calls, no quota).

Quota cost of a 300-product store ≈ number of categories (3-6), not
products. Editing is still available per product afterwards.
"""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.db import DB
from app.services.shopify_ai import ShopifyAIService, FIELD_SHAPES, ALL_MODULES, CATEGORY_RULES
from app.services.usage import check_quota, consume_generation

router = APIRouter()
ai = ShopifyAIService()

TEMPLATE_FIELDS = ["description", "faq", "pros", "cons", "comparison", "ai_summary"]

PLACEHOLDERS = {
    "product_name": "{{product_name}}",
    "price": "{{price}}",
    "brand": "{{brand}}",
}


class GroupsRequest(BaseModel):
    shop: str          # shopify domain OR woocommerce domain
    platform: str = "woocommerce"  # "shopify" | "woocommerce"


class TemplateRequest(BaseModel):
    shop: str
    platform: str
    category: str
    sample_id: str


class ApplyRequest(BaseModel):
    shop: str
    platform: str
    category: str
    product_ids: list[str] | None = None  # None = all products in category


async def _fetch_products(shop: str, platform: str) -> list[dict]:
    """Fetch all products in the shared sync shape."""
    if platform == "shopify":
        from app.services.shopify_service import ShopifyService, ShopifyStore
        from app.api.shopify_publish import _resolve_token
        svc = ShopifyService()
        token = _resolve_token(shop)
        store = ShopifyStore(shop=shop, access_token=token)
        raw = await svc.get_all_products(store)
        return [svc.extract_product_sync_data(p, shop) for p in raw]
    else:
        from app.api.woocommerce_publish import _plugin_get, _plugin_headers, _extract_woo_product
        all_products = []
        offset = 0
        while True:
            batch = await _plugin_get(shop, "/products", limit=50, offset=offset)
            items = batch.get("products", [])
            if not items:
                break
            all_products.extend(items)
            offset += 50
            if len(items) < 50:
                break
        return [_extract_woo_product(p) for p in all_products]


async def _resolve_product_id(platform: str, product: dict) -> str:
    """Product id for drafts/publish (shopify: str id, woo: int id)."""
    pid = product.get("shopify_id") or product.get("id") or ""
    return str(pid)


@router.post("/groups")
async def groups(req: GroupsRequest):
    """Group all products by detected category."""
    try:
        products = await _fetch_products(req.shop, req.platform)
        groups: dict[str, dict] = {}
        for p in products:
            cat, conf = await ai.detect_category(p)
            g = groups.setdefault(cat, {"category": cat, "label": CATEGORY_RULES.get(cat, {}).get("label", "General"), "products": []})
            g["products"].append({
                "id": await _resolve_product_id(req.platform, p),
                "title": p.get("title", ""),
                "price": p.get("price", ""),
                "brand": p.get("brand", ""),
            })
        return {"shop": req.shop, "platform": req.platform, "total": len(products), "groups": list(groups.values())}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-template")
async def generate_template(req: TemplateRequest):
    """Generate ONE category template from a sample product (1 AI call)."""
    try:
        # Monthly quota check — template generation consumes 1 unit
        allowed, err, used, quota = check_quota(req.shop)
        if not allowed:
            raise HTTPException(status_code=429, detail=err)

        products = await _fetch_products(req.shop, req.platform)
        sample = next((p for p in products if str(p.get("shopify_id") or p.get("id") or "") == str(req.sample_id)), None)
        if not sample:
            raise HTTPException(status_code=404, detail="Sample product not found")

        # Four-layer template decides the field set for this category
        from app.services.knowledge_templates import generate_field_list
        _i, k_fields, d_fields, t_fields = generate_field_list(req.category, None)
        fields = [f for f in (k_fields + d_fields + t_fields) if f in TEMPLATE_FIELDS or f in ("description", "faq", "pros", "cons", "comparison", "ai_summary")]

        # Instruct the model to use placeholders for product-specific values
        generated = await ai.generate_fields(sample, fields, category=req.category, template_mode=True)
        if "error" in generated:
            raise HTTPException(status_code=500, detail=generated["error"])

        # Store template in content_drafts under product_id "template:{category}"
        db = DB()
        versions: dict[str, int] = {}
        for field, content in generated.items():
            versions[field] = db.save_content_draft(
                shop=req.shop, shopify_product_id=f"template:{req.category}", field=field,
                content=content, status="draft",
                provenance={"model": "claude-haiku-4.5", "prompt_version": "template-v1",
                            "generated_at": datetime.now(timezone.utc).isoformat(),
                            "human_edited": False, "template": True, "category": req.category},
            )
        consume_generation(req.shop)

        return {
            "status": "template_drafted",
            "category": req.category,
            "versions": versions,
            "preview": generated,
            "note": "Template uses {{product_name}}, {{price}}, {{brand}} placeholders — substituted per product on apply.",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _detect_category_light(product: dict) -> str:
    cat, _ = await ai.detect_category(product)
    return cat


def _substitute(content, product: dict) -> dict:
    """Replace placeholders in every string field of the content dict."""
    name = product.get("title", "")
    price = str(product.get("price", ""))
    brand = product.get("brand") or product.get("vendor") or ""

    def repl(value):
        if isinstance(value, str):
            return (value.replace("{{product_name}}", name)
                        .replace("{{price}}", price)
                        .replace("{{brand}}", brand))
        if isinstance(value, dict):
            return {k: repl(v) for k, v in value.items()}
        if isinstance(value, list):
            return [repl(v) for v in value]
        return value

    return repl(content)


@router.post("/apply")
async def apply_template(req: ApplyRequest):
    """Apply the category template to products (placeholder substitution, no AI)."""
    try:
        db = DB()
        template = db.get_latest_drafts(req.shop, f"template:{req.category}")
        if not template:
            raise HTTPException(status_code=404, detail=f"No template for category '{req.category}'. Generate one first.")

        products = await _fetch_products(req.shop, req.platform)
        targets = products
        if req.product_ids:
            ids = set(req.product_ids)
            targets = [p for p in products if str(p.get("shopify_id") or p.get("id") or "") in ids]
        else:
            # Default: only products belonging to this category (re-detect cheaply)
            targets = []
            for p in products:
                cat, _ = await ai.detect_category(p)
                if cat == req.category:
                    targets.append(p)

        applied, errors = 0, 0
        for p in targets:
            pid = await _resolve_product_id(req.platform, p)
            try:
                for field, draft in template.items():
                    substituted = _substitute(draft["content"], p)
                    if req.platform == "shopify":
                        from app.services.shopify_service import ShopifyService, ShopifyStore
                        from app.api.shopify_publish import _resolve_token
                        svc = ShopifyService()
                        token = _resolve_token(req.shop)
                        store = ShopifyStore(shop=req.shop, access_token=token)
                        await svc.set_ai_content_metafield(store, int(pid), field, substituted)
                    else:
                        from app.api.woocommerce_publish import _plugin_post
                        await _plugin_post(req.shop, "/publish", {
                            "product_id": int(pid),
                            "fields": {field: substituted},
                            "status": "published",
                            "overwrite_description": False,
                            "provenance": {"template": True, "category": req.category, "applied_at": datetime.now(timezone.utc).isoformat()},
                        })
                    db.save_content_draft(
                        shop=req.shop, shopify_product_id=pid, field=field,
                        content=substituted, status="published",
                        provenance={"template": True, "category": req.category, "applied_at": datetime.now(timezone.utc).isoformat()},
                    )
                applied += 1
            except Exception:
                errors += 1

        return {"status": "applied", "category": req.category, "applied": applied, "errors": errors, "total": len(targets)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
