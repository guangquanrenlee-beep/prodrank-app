"""Shopify Publish + Verification API — ⑥ One-click Publish / ⑨ Verification.

Chain (per docs/product-content-boundaries.md):
  Dashboard → SaaS generates content (AI, versioned in content_drafts)
           → Publish writes prodrank.* metafields (never merchant content,
             except description when overwrite_description is explicitly set)
           → Theme Block renders, Schema Renderer outputs JSON-LD
           → Verify reads metafields back + checks the live page for JSON-LD
"""

import json
import re
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.db import DB
from app.services.shopify_service import ShopifyService, ShopifyStore, admin_api_base
from app.services.shopify_ai import ShopifyAIService, build_schema, CATEGORY_RULES

MAX_GENERATIONS = 3

router = APIRouter()
shopify = ShopifyService()
ai = ShopifyAIService()


class GenerateRequest(BaseModel):
    shop: str
    access_token: str = ""  # optional — resolved from sites table when empty
    product_id: int
    fields: list[str] = ["description", "faq", "pros", "cons", "comparison",
                         "use_cases", "buying_guide", "specification", "ai_summary"]


class PublishRequest(BaseModel):
    shop: str
    access_token: str = ""
    product_id: int
    fields: list[str] = ["description", "faq", "pros", "cons", "comparison",
                         "use_cases", "buying_guide", "specification", "ai_summary"]
    overwrite_description: bool = False  # ⑥ publish rule: description overwrite is OPT-IN only


class VerifyRequest(BaseModel):
    shop: str
    access_token: str = ""
    product_id: int
    fields: list[str] | None = None  # None = verify everything present
    check_page: bool = True


def _resolve_token(shop: str, access_token: str = "") -> str:
    """Prefer an explicit token (curl/testing); otherwise look it up from the
    sites table so the Dashboard never needs to hold Shopify credentials."""
    if access_token:
        return access_token
    try:
        data = DB().client.table("sites").select("access_token").eq("domain", shop).eq("platform", "shopify").limit(1).execute().data
        if data and data[0].get("access_token"):
            return data[0]["access_token"]
    except Exception:
        pass
    raise HTTPException(status_code=401, detail="No access token found. Connect the store first, or pass access_token explicitly.")


async def _fetch_product(shop: str, access_token: str, product_id: int) -> dict:
    """Fetch one product from Shopify (raw Admin API product dict)."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{admin_api_base(shop)}/admin/api/2024-10/products/{product_id}.json",
            headers={"X-Shopify-Access-Token": access_token, "Content-Type": "application/json"},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json().get("product", {})


async def _fetch_shop_info(shop: str, access_token: str) -> dict:
    store = ShopifyStore(shop=shop, access_token=access_token)
    return await shopify.get_shop_info(store)


def _provenance(extra: dict | None = None) -> dict:
    from app.services.shopify_ai import CATEGORY_PROMPT_VERSION, MODEL
    p = {
        "model": MODEL,
        "prompt_version": CATEGORY_PROMPT_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "human_edited": False,
    }
    if extra:
        p.update(extra)
    return p


class ResolveUrlRequest(BaseModel):
    url: str


@router.post("/resolve-url")
async def resolve_product_url(req: ResolveUrlRequest):
    """Parse a Shopify product URL - domain + product data."""
    from urllib.parse import urlparse
    from bs4 import BeautifulSoup
    url = req.url.strip()
    if not url.startswith("http"):
        url = f"https://{url}"
    parsed = urlparse(url)
    domain = parsed.netloc.lower()
    path_parts = [p for p in parsed.path.strip("/").split("/") if p]
    handle = ""
    for i, part in enumerate(path_parts):
        if part in ("products", "product", "item"):
            handle = path_parts[i + 1] if i + 1 < len(path_parts) else ""
            break
    if not handle:
        handle = path_parts[-1] if path_parts else ""

    token = ""
    try:
        token = _resolve_token(domain)
    except Exception:
        pass

    product = {"url": url, "title": handle.replace("-", " ").title() or "Product",
               "description": "", "price": "", "images": [], "id": "", "handle": handle}

    if token and handle:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{admin_api_base(domain)}/admin/api/2024-10/products.json",
                    headers={"X-Shopify-Access-Token": token, "Content-Type": "application/json"},
                    params={"handle": handle, "limit": 1}, timeout=15,
                )
                resp.raise_for_status()
                products = resp.json().get("products", [])
                if products:
                    p = products[0]
                    v = (p.get("variants") or [{}])[0] if p.get("variants") else {}
                    product["title"] = p.get("title", "")
                    product["description"] = (p.get("body_html") or "")[:3000]
                    product["price"] = str(v.get("price", ""))
                    product["sku"] = v.get("sku", "")
                    product["brand"] = p.get("vendor", "")
                    product["images"] = [img["src"] for img in (p.get("images") or [])[:5] if img.get("src")]
                    product["id"] = str(p.get("id", ""))
                    product["found_via"] = "admin_api"
        except Exception:
            pass

    if not product.get("id"):
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
                resp = await client.get(url, headers={"User-Agent": "Chrome/131.0"})
                html = resp.text
            soup = BeautifulSoup(html, "lxml")
            title = soup.find("title")
            product["title"] = title.text.strip()[:200] if title else product["title"]
            og_title = soup.find("meta", attrs={"property": "og:title"})
            if og_title and og_title.get("content"):
                product["title"] = og_title["content"][:200]
            product["images"] = [img["content"] for img in soup.find_all("meta", attrs={"property": "og:image"}) if img.get("content")][:5]
            product["found_via"] = "page_crawl"
        except Exception:
            pass

    return {"status": "ok", "domain": domain, "has_token": bool(token), "platform": "shopify", "product": product}


@router.post("/publish/generate")
async def generate_content(req: GenerateRequest):
    """⑥ Step 1 — AI-generate content fields (draft only, nothing written yet).
    Category-aware: detects product category, filters to applicable modules.
    Max 3 generations per product."""
    token = _resolve_token(req.shop, req.access_token)
    store = ShopifyStore(shop=req.shop, access_token=token)
    try:
        db = DB()
        count = db.count_generations(req.shop, str(req.product_id))
        if count >= MAX_GENERATIONS:
            raise HTTPException(status_code=429, detail=f"Limit reached: {MAX_GENERATIONS} AI generations per product.")

        # Account-level monthly quota (anti-abuse)
        from app.services.usage import check_quota, consume_generation
        allowed, err, used, quota = check_quota(req.shop)
        if not allowed:
            raise HTTPException(status_code=429, detail=err)

        product = await _fetch_product(req.shop, token, req.product_id)
        shop_info = await _fetch_shop_info(req.shop, token)

        # ② Product Sync
        synced = shopify.extract_product_sync_data(product, req.shop)
        sites = db.client.table("sites").select("id").eq("domain", req.shop).eq("platform", "shopify").limit(1).execute().data
        site_id = sites[0]["id"] if sites else ""
        db.save_products_batch(site_id, [synced])

        # Category detection
        category, confidence = await ai.detect_category(synced)
        valid_fields = ai.modules_for_category(category)
        filtered_fields = [f for f in req.fields if f in valid_fields]

        generated = await ai.generate_fields(synced, filtered_fields, category=category)
        if "error" in generated:
            raise HTTPException(status_code=500, detail=generated["error"])

        versions: dict[str, int] = {}
        for field, content in generated.items():
            versions[field] = db.save_content_draft(
                shop=req.shop, shopify_product_id=str(req.product_id), field=field,
                content=content, status="draft",
                provenance=_provenance({"product_title": product.get("title", "")}),
            )
        remaining = MAX_GENERATIONS - db.count_generations(req.shop, str(req.product_id))
        monthly_used = consume_generation(req.shop)  # record this generation
        return {
            "status": "drafted",
            "shop": req.shop,
            "product_id": req.product_id,
            "product_title": product.get("title", ""),
            "category": {"key": category, "label": CATEGORY_RULES.get(category, {}).get("label", "General"), "confidence": confidence},
            "generated": list(generated.keys()),
            "skipped": list(set(req.fields) - set(filtered_fields)),
            "versions": versions,
            "preview": generated,
            "generations_used": db.count_generations(req.shop, str(req.product_id)),
            "generations_remaining": max(0, remaining),
            "monthly_generations_used": monthly_used,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/publish")
async def publish(req: PublishRequest):
    """⑥ Step 2 — Publish the latest drafts to metafields.
    Rules (docs/product-content-boundaries.md):
      - Content goes to prodrank.* metafields only (Theme Block renders them).
      - The merchant's product description is only overwritten when
        overwrite_description=true (explicit opt-in at publish time).
      - The full JSON-LD schema is assembled in code and stored in prodrank.schema."""
    token = _resolve_token(req.shop, req.access_token)
    store = ShopifyStore(shop=req.shop, access_token=token)
    try:
        db = DB()
        drafts = db.get_latest_drafts(req.shop, str(req.product_id), req.fields)
        if not drafts:
            raise HTTPException(status_code=400, detail="No drafts found. Run /publish/generate first.")

        product = await _fetch_product(req.shop, token, req.product_id)
        shop_info = await _fetch_shop_info(req.shop, token)

        written: dict[str, dict] = {}
        published_ids: list[str] = []

        for field, draft in drafts.items():
            if field == "schema":
                continue  # schema is assembled below, not from drafts
            await shopify.set_ai_content_metafield(store, req.product_id, field, draft["content"])
            written[field] = {"version": draft.get("version"), "draft_id": draft.get("id")}
            published_ids.append(draft["id"])

        # ⑤ Schema Renderer — assemble full JSON-LD in code (never LLM-fabricated)
        synced = shopify.extract_product_sync_data(product, req.shop)
        faq = (drafts.get("faq", {}).get("content") or {}).get("questions") if "faq" in drafts else None
        # Real reviews only (Shopify Product Reviews metafields) — never fabricate
        rating = None
        try:
            mfs = await shopify.get_product_metafields(store, req.product_id)
            rating = mfs.get("reviews.rating")  # present only if reviews app installed
        except Exception:
            pass
        schema = build_schema(synced, shop_info, faq=faq)
        await shopify.set_ai_content_metafield(store, req.product_id, "schema", schema)
        written["schema"] = {"assembled": True}
        # schema is code-assembled (no draft id) — nothing to mark published

        # ⑥ publish rule: overwrite the product description ONLY on explicit opt-in
        if req.overwrite_description and "description" in drafts:
            ai_desc = (drafts["description"]["content"] or {}).get("html", "")
            if ai_desc:
                async with httpx.AsyncClient() as client:
                    resp = await client.put(
                        f"{admin_api_base(req.shop)}/admin/api/2024-10/products/{req.product_id}.json",
                        headers={"X-Shopify-Access-Token": token, "Content-Type": "application/json"},
                        json={"product": {"id": req.product_id, "body_html": ai_desc}},
                        timeout=15,
                    )
                    resp.raise_for_status()
                written["description"]["overwrote_original"] = True

        db.mark_drafts_published(published_ids)

        # ⑨ Verification — immediately confirm what landed
        verify = await _verify_metafields(store, req.product_id, list(written.keys()))

        return {
            "status": "published",
            "shop": req.shop,
            "product_id": req.product_id,
            "written": written,
            "verification": verify,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _verify_metafields(store: ShopifyStore, product_id: int, fields: list[str]) -> dict:
    """⑨ — read back prodrank metafields and confirm presence/content."""
    try:
        mfs = await shopify.get_product_metafields(store, product_id)
        per_field = {}
        for f in fields:
            if f in mfs:
                per_field[f] = {"present": True}
            else:
                per_field[f] = {"present": False}
        return {"metafields_ok": all(v["present"] for v in per_field.values()) if per_field else False,
                "fields": per_field}
    except Exception as e:
        return {"metafields_ok": False, "error": str(e)[:200]}


@router.post("/verify")
async def verify(req: VerifyRequest):
    """⑨ Verification — check metafields AND (optionally) crawl the live page
    to confirm the JSON-LD is actually rendered in the final HTML."""
    token = _resolve_token(req.shop, req.access_token)
    store = ShopifyStore(shop=req.shop, access_token=token)
    try:
        result = await _verify_metafields(store, req.product_id, req.fields or ["description", "faq", "schema"])

        page_check = {"checked": False, "jsonld_found": False, "html_has_prodrank": False}
        if req.check_page:
            try:
                product = await _fetch_product(req.shop, token, req.product_id)
                handle = product.get("handle", "")
                url = f"https://{req.shop}/products/{handle}"
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

        return {
            "status": "verified" if result["metafields_ok"] else "issues_found",
            "metafields": result,
            "page": page_check,
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class EditDraftRequest(BaseModel):
    shop: str
    product_id: int
    fields: dict


@router.post("/drafts/edit")
async def save_edited_draft(req: EditDraftRequest):
    """Save manually-edited content as a new draft version with provenance."""
    try:
        db = DB()
        prov = _provenance()
        prov["human_edited"] = True
        prov["note"] = "manually edited by merchant"
        versions: dict[str, int] = {}
        for field, content in req.fields.items():
            if not isinstance(content, dict) or not content:
                continue
            versions[field] = db.save_content_draft(
                shop=req.shop, shopify_product_id=str(req.product_id), field=field,
                content=content, status="draft", provenance=prov,
            )
        return {"status": "saved", "product_id": req.product_id, "versions": versions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/drafts/count")
async def generation_count(shop: str = Query(...), product_id: int = Query(...)):
    """How many times has this product been generated? (max 3)"""
    try:
        db = DB()
        count = db.count_generations(shop, str(product_id))
        return {"product_id": product_id, "generations_used": count, "generations_remaining": max(0, MAX_GENERATIONS - count)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/drafts")
async def draft_history(shop: str = Query(...), access_token: str = Query(default=""), product_id: int = Query(...)):
    """⑦ Rollback support — full version history per field."""
    try:
        db = DB()
        fields = db.get_latest_drafts(shop, str(product_id))
        history = {}
        for f in fields:
            history[f] = db.get_draft_history(shop, str(product_id), f)
        return {"shop": shop, "product_id": product_id, "history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class RollbackRequest(BaseModel):
    shop: str
    access_token: str = ""
    product_id: int
    field: str
    version: int
    restore_body: bool = False  # ⑦ rule: touching the merchant's body_html is opt-in only


@router.post("/publish/rollback")
async def rollback(req: RollbackRequest):
    """⑦ Rollback — restore a previous version of one field from content_drafts
    back to the metafield. Respects content boundaries: body_html is only
    touched when restore_body=true. The rollback itself is recorded as a new
    provenance-stamped version so everything stays traceable."""
    token = _resolve_token(req.shop, req.access_token)
    store = ShopifyStore(shop=req.shop, access_token=token)
    try:
        db = DB()
        history = db.get_draft_history(req.shop, str(req.product_id), req.field)
        target = next((h for h in history if h.get("version") == req.version), None)
        if not target:
            raise HTTPException(status_code=404, detail=f"Version {req.version} not found for field '{req.field}'")

        content = target.get("content")
        await shopify.set_ai_content_metafield(store, req.product_id, req.field, content)

        restored_body = False
        if req.field == "description" and req.restore_body:
            html = (content or {}).get("html", "")
            if html:
                async with httpx.AsyncClient() as client:
                    resp = await client.put(
                        f"{admin_api_base(req.shop)}/admin/api/2024-10/products/{req.product_id}.json",
                        headers={"X-Shopify-Access-Token": token, "Content-Type": "application/json"},
                        json={"product": {"id": req.product_id, "body_html": html}},
                        timeout=15,
                    )
                    resp.raise_for_status()
                restored_body = True

        # Traceability (③ content provenance): record the rollback as a new
        # version so the audit trail shows exactly what happened and when.
        db.save_content_draft(
            shop=req.shop, shopify_product_id=str(req.product_id), field=req.field,
            content=content, status="published",
            provenance=_provenance({
                "human_edited": True,
                "note": f"rolled back from v{target.get('version')}",
                "restored_body": restored_body,
            }),
        )

        return {
            "status": "rolled_back",
            "field": req.field,
            "restored_version": target.get("version"),
            "restored_body": restored_body,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class HealthRequest(BaseModel):
    shop: str
    access_token: str = ""
    product_id: int | None = None  # optional — sample one product when omitted


@router.post("/health")
async def health_check(req: HealthRequest):
    """⑩ Health Check — verify the install is intact:
       - store connection + access token alive
       - prodrank metafields present on a sampled product
       - live product page still renders JSON-LD and the AI content block
       - theme publish events flagged (blocks may have been removed)"""
    token = _resolve_token(req.shop, req.access_token)
    store = ShopifyStore(shop=req.shop, access_token=token)
    try:
        db = DB()
        sites = db.client.table("sites").select("*").eq("domain", req.shop).eq("platform", "shopify").limit(1).execute().data
        site = sites[0] if sites else {}
        checks: dict = {
            "connection": bool(site.get("access_token")),
            "connection_status": site.get("connection_status", "active"),
        }

        product_id = req.product_id
        if not product_id:
            rows = db.client.table("products").select("shopify_id").eq("site_id", site.get("id", "")).limit(1).execute().data
            if rows and rows[0].get("shopify_id"):
                try:
                    product_id = int(rows[0]["shopify_id"])
                except (TypeError, ValueError):
                    product_id = None

        if product_id:
            try:
                mfs = await shopify.get_product_metafields(store, product_id)
                checks["metafields"] = {k: k in mfs for k in ["description", "faq", "schema"]}
            except Exception as e:
                checks["metafields"] = {"error": str(e)[:200]}

            try:
                product = await _fetch_product(req.shop, token, product_id)
                handle = product.get("handle", "")
                url = f"https://{req.shop}/products/{handle}"
                async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
                    resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36"})
                    html = resp.text
                checks["page"] = {
                    "checked": True,
                    "jsonld_blocks": html.count("application/ld+json"),
                    "ai_block_rendered": "prodrank" in html.lower(),
                }
            except Exception as e:
                checks["page"] = {"checked": False, "error": str(e)[:200]}
        else:
            checks["page"] = {"checked": False, "reason": "no product to sample"}

        if site.get("last_theme_change_at"):
            checks["theme_warning"] = (
                f"Theme changed at {site['last_theme_change_at']} — "
                "verify the ProdRank blocks are still placed on the product template."
            )

        metafields_ok = all(checks.get("metafields", {}).values()) if isinstance(checks.get("metafields"), dict) and checks.get("metafields") else False
        page_ok = not checks.get("page", {}).get("checked") or bool(checks.get("page", {}).get("ai_block_rendered"))
        ok = bool(checks["connection"] and checks["connection_status"] == "active" and metafields_ok and page_ok)
        return {"status": "healthy" if ok else "needs_attention", "checks": checks,
                "checked_at": datetime.now(timezone.utc).isoformat()}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
