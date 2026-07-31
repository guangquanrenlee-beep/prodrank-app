"""WooCommerce Publish API — SaaS proxy to the WordPress plugin's prodrank/v1 REST endpoints.

Chain (docs/product-content-boundaries.md):
  Dashboard → SaaS generates content (reuses ShopifyAIService + content_drafts)
           → SaaS proxies to the merchant's /wp-json/prodrank/v1/* (token auth)
           → plugin writes _prodrank_* post meta (description overwrite opt-in)
           → shortcodes render, wp_head outputs JSON-LD server-side
           → SaaS verifies via the plugin + a live page crawl

The WordPress plugin holds the source of truth for storage; content_drafts in
Supabase keep the version history + provenance on the SaaS side (⑦ Rollback).
"""

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.db import DB
from app.services.shopify_ai import ShopifyAIService, build_schema, PROMPT_VERSION, MODEL

router = APIRouter()
ai = ShopifyAIService()

DEFAULT_FIELDS = ["description", "faq", "pros", "cons", "comparison",
                  "use_cases", "buying_guide", "specification", "ai_summary"]


class WooConnectRequest(BaseModel):
    domain: str
    api_token: str  # the plugin token shown in WooCommerce → ProdRank SEO


class WooGenerateRequest(BaseModel):
    domain: str
    product_id: int
    fields: list[str] = DEFAULT_FIELDS


class WooPublishRequest(BaseModel):
    domain: str
    product_id: int
    fields: list[str] = DEFAULT_FIELDS
    overwrite_description: bool = False  # opt-in only — touches post_content


class WooVerifyRequest(BaseModel):
    domain: str
    product_id: int
    fields: list[str] | None = None
    check_page: bool = True


class WooSyncRequest(BaseModel):
    domain: str


# ── helpers ──

def _plugin_base(domain: str) -> str:
    return f"https://{domain}/wp-json/prodrank/v1"


async def _plugin_headers(domain: str) -> dict:
    data = DB().client.table("sites").select("access_token").eq("domain", domain).eq("platform", "woocommerce").limit(1).execute().data
    if not data or not data[0].get("access_token"):
        raise HTTPException(status_code=401, detail=f"No connection for {domain}. Save the plugin API token first (/api/woocommerce/connect).")
    return {"X-ProdRank-Token": data[0]["access_token"], "Content-Type": "application/json"}


def _extract_woo_product(p: dict) -> dict:
    """Normalize a plugin product payload into the shared sync shape used by
    ShopifyAIService.generate_fields + build_schema."""
    return {
        "title": p.get("title", ""),
        "description": (p.get("description") or "")[:3000],
        "price": str(p.get("price", "")),
        "currency": p.get("currency", "USD"),
        "sku": p.get("sku", ""),
        "brand": p.get("brand", ""),
        "tags": [],
        "product_type": p.get("type", ""),
        "images": [i for i in (p.get("images") or []) if isinstance(i, str)][:5],
        "url": p.get("url", ""),
        "in_stock": bool(p.get("in_stock", True)),
        "variants": [],
        "aggregate_rating": (
            {"rating_value": p.get("rating", 0), "review_count": p.get("review_count", 0)}
            if p.get("review_count") else None
        ),
    }


async def _plugin_get(domain: str, path: str, **params):
    async with httpx.AsyncClient(timeout=25) as client:
        resp = await client.get(f"{_plugin_base(domain)}{path}", headers=await _plugin_headers(domain), params=params)
        resp.raise_for_status()
        return resp.json()


async def _plugin_post(domain: str, path: str, body: dict):
    async with httpx.AsyncClient(timeout=25) as client:
        resp = await client.post(f"{_plugin_base(domain)}{path}", headers=await _plugin_headers(domain), json=body)
        resp.raise_for_status()
        return resp.json()


def _provenance() -> dict:
    from datetime import datetime, timezone
    return {
        "model": MODEL,
        "prompt_version": PROMPT_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "human_edited": False,
    }


# ── endpoints ──

@router.post("/connect")
async def connect(req: WooConnectRequest):
    """Save the plugin API token and verify it works by calling plugin /status."""
    domain = req.domain.strip().lower().replace("https://", "").replace("http://", "").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://{domain}/wp-json/prodrank/v1/status",
                headers={"X-ProdRank-Token": req.api_token},
            )
            resp.raise_for_status()
            status = resp.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Plugin unreachable or token invalid: {str(e)[:150]}")

    existing = DB().client.table("sites").select("id").eq("domain", domain).eq("platform", "woocommerce").limit(1).execute().data
    fields = {
        "platform": "woocommerce",
        "platform_confidence": 90,
        "auth_method": "plugin",
        "access_token": req.api_token,
        "connection_status": "active",
    }
    if existing:
        DB().client.table("sites").update(fields).eq("id", existing[0]["id"]).execute()
    else:
        DB().client.table("sites").insert({"domain": domain, "user_id": "", **fields}).execute()

    return {"status": "connected", "domain": domain, "plugin": status}


@router.post("/sync")
async def sync(req: WooSyncRequest):
    """② Product Sync (WooCommerce) — pull the product list from the plugin and
    store it in Supabase (paginated until the plugin returns fewer items)."""
    domain = req.domain.strip().lower()
    db = DB()
    sites = db.client.table("sites").select("id").eq("domain", domain).eq("platform", "woocommerce").limit(1).execute().data
    site_id = sites[0]["id"] if sites else ""

    all_products: list[dict] = []
    offset = 0
    limit = 50
    while True:
        batch = await _plugin_get(domain, "/products", limit=limit, offset=offset)
        items = batch.get("products", [])
        if not items:
            break
        all_products.extend(items)
        offset += limit
        if len(items) < limit:
            break

    rows = [_extract_woo_product(p) for p in all_products]
    db.save_products_batch(site_id, rows)
    return {"status": "synced", "domain": domain, "total": len(all_products)}


@router.post("/publish/generate")
async def generate_content(req: WooGenerateRequest):
    """⑥ Step 1 — AI-generate content fields (draft only, versioned in Supabase)."""
    try:
        product = await _plugin_get(req.domain, f"/products/{req.product_id}")
        synced = _extract_woo_product(product)
        generated = await ai.generate_fields(synced, req.fields)
        if "error" in generated:
            raise HTTPException(status_code=500, detail=generated["error"])

        db = DB()
        versions: dict[str, int] = {}
        for field, content in generated.items():
            versions[field] = db.save_content_draft(
                shop=req.domain, shopify_product_id=str(req.product_id), field=field,
                content=content, status="draft", provenance=_provenance(),
            )
        return {
            "status": "drafted",
            "domain": req.domain,
            "product_id": req.product_id,
            "generated": list(generated.keys()),
            "versions": versions,
            "preview": generated,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/publish")
async def publish(req: WooPublishRequest):
    """⑥ Step 2 — publish latest drafts through the plugin (post meta, versioned).
    Schema is assembled in code; description overwrite is opt-in only."""
    try:
        db = DB()
        drafts = db.get_latest_drafts(req.domain, str(req.product_id), req.fields)
        if not drafts:
            raise HTTPException(status_code=400, detail="No drafts found. Run /publish/generate first.")

        product = await _plugin_get(req.domain, f"/products/{req.product_id}")
        synced = _extract_woo_product(product)
        schema = build_schema(synced, {"name": req.domain, "domain": req.domain})

        fields = {f: d["content"] for f, d in drafts.items()}
        fields["schema"] = schema  # ⑤ Schema Renderer — code-assembled, never LLM-fabricated

        plugin_resp = await _plugin_post(req.domain, "/publish", {
            "product_id": req.product_id,
            "fields": fields,
            "status": "published",
            "overwrite_description": req.overwrite_description,
            "provenance": _provenance(),
        })
        db.mark_drafts_published([d["id"] for d in drafts.values()])

        verify = await _verify_via_plugin(req.domain, req.product_id, list(fields.keys()))
        return {"status": "published", "domain": req.domain, "plugin": plugin_resp, "verification": verify}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _verify_via_plugin(domain: str, product_id: int, fields: list[str]) -> dict:
    """⑨ — read back AI content through the plugin (post meta is the source of truth)."""
    try:
        product = await _plugin_get(domain, f"/products/{product_id}")
        ai_content = product.get("ai_content", {}) or {}
        per_field = {f: {"present": bool(ai_content.get(f))} for f in fields}
        return {"metafields_ok": all(v["present"] for v in per_field.values()) if per_field else False, "fields": per_field}
    except Exception as e:
        return {"metafields_ok": False, "error": str(e)[:200]}


@router.post("/verify")
async def verify(req: WooVerifyRequest):
    """⑨ Verification — plugin read-back + optional live page crawl for JSON-LD."""
    try:
        result = await _verify_via_plugin(req.domain, req.product_id, req.fields or ["description", "faq", "schema"])

        page_check = {"checked": False, "jsonld_found": False, "html_has_prodrank": False}
        if req.check_page:
            try:
                product = await _plugin_get(req.domain, f"/products/{req.product_id}")
                url = product.get("url", "")
                if url:
                    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
                        resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36"})
                        html = resp.text
                    page_check = {
                        "checked": True,
                        "jsonld_found": html.count("application/ld+json") > 0,
                        "html_has_prodrank": "prodrank" in html.lower(),
                        "schema_blocks": html.count("application/ld+json"),
                    }
            except Exception as e:
                page_check = {"checked": False, "error": str(e)[:200]}

        from datetime import datetime, timezone
        return {
            "status": "verified" if result["metafields_ok"] else "issues_found",
            "metafields": result,
            "page": page_check,
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/drafts")
async def draft_history(domain: str, product_id: int):
    """⑦ Rollback support — version history from Supabase content_drafts."""
    try:
        db = DB()
        fields = db.get_latest_drafts(domain, str(product_id))
        history = {f: db.get_draft_history(domain, str(product_id), f) for f in fields}
        return {"domain": domain, "product_id": product_id, "history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
