"""
Custom API Platform — connect any standalone store via a standard REST protocol.

The store exposes:
  POST /api/prodrank/connect           — validate token, return store info
  GET  /api/prodrank/products           — list products
  GET  /api/prodrank/products/{id}      — product detail
  PUT  /api/prodrank/products/{id}/content  — receive AI content

Auth: X-API-Token header (same as WordPress plugin pattern).
"""

import json
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from app.services.db import DB
from app.services.shopify_ai import ShopifyAIService

router = APIRouter()
db = DB()
ai = ShopifyAIService()

DEFAULT_FIELDS = ["description", "faq", "pros", "comparison", "use_cases", "buying_guide", "specification", "ai_summary"]


class CustomConnectRequest(BaseModel):
    domain: str
    api_token: str


class CustomResolveUrlRequest(BaseModel):
    url: str


class CustomGenerateRequest(BaseModel):
    shop: str
    product_id: str
    overwrite_description: bool = False
    skip_fields: list[str] = []
    force_fields: list[str] = []


class CustomPublishRequest(BaseModel):
    shop: str
    product_id: str
    fields: list[str] | None = None
    overwrite_description: bool = False


class CustomVerifyRequest(BaseModel):
    shop: str
    product_id: str
    fields: list[str] | None = None


# ── Auth helpers (same pattern as woocommerce_publish) ──

def _user_id_from_auth(authorization: str) -> str | None:
    """Resolve Supabase user id from an Authorization: Bearer <jwt> header."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        user = db.client.auth.get_user(token)
        return user.user.id if user and user.user else None
    except Exception:
        return None


def _user_id_from_email(email: str) -> str | None:
    """Resolve Supabase user id from email (X-User-Email header — the frontend
    fetch interceptor sends it on every /api/* call when logged in)."""
    if not email:
        return None
    try:
        users = db.client.auth.admin.list_users()
        for u in (users.users if hasattr(users, "users") else users):
            if (u.email or "").lower() == email.lower():
                return u.id
    except Exception:
        pass
    return None


def _resolve_user_id(request: Request) -> str | None:
    """User id from either Authorization Bearer or X-User-Email."""
    uid = _user_id_from_auth(request.headers.get("Authorization", ""))
    if uid:
        return uid
    return _user_id_from_email(request.headers.get("X-User-Email", ""))


def _require_owner(site: dict, user_id: str | None) -> None:
    """Claim-or-verify store ownership.

    Unbound stores (user_id NULL — legacy direct-API connects) are claimed by
    the first authenticated user touching them. A store bound to another
    account is rejected. Unauthenticated callers are rejected outright.
    """
    if not user_id:
        raise HTTPException(401, "Login required — connect your store from Settings or pass Authorization")
    if site.get("user_id") and site["user_id"] != user_id:
        raise HTTPException(403, "This store belongs to another account")
    if not site.get("user_id"):
        try:
            db.client.table("sites").update({"user_id": user_id}).eq("id", site["id"]).execute()
        except Exception:
            pass  # best-effort claim; the operation itself still proceeds


def _get_site(domain: str) -> dict:
    """Full site row for a connected custom store."""
    site = db.client.table("sites").select("id,user_id,access_token,shopify_shop").eq("domain", domain).eq("platform", "custom").limit(1).execute().data
    if not site or not site[0].get("access_token"):
        raise HTTPException(404, f"No connected custom store for {domain}")
    return site[0]


def _get_token_and_url(domain: str) -> tuple[str, str]:
    """Get the API token and base URL for a connected custom store."""
    site = _get_site(domain)
    token = site["access_token"]
    base_url = site.get("shopify_shop", f"http://{domain}")
    return token, base_url


@router.post("/connect")
async def connect_custom_store(req: CustomConnectRequest, authorization: str = Header(default="")):
    """Verify a custom store's API and save the connection.

    Binds the store to the authenticated account (Authorization: Bearer
    Supabase JWT) so plan quotas + store limits apply. Without a token the
    store is stored unbound — later operations claim it for the first
    authenticated user (see _require_owner).
    """
    domain = req.domain.strip().lower()
    token = req.api_token.strip()
    user_id = _user_id_from_auth(authorization)

    # Call the store's /api/prodrank/connect endpoint to verify
    store_url = f"http://{domain}" if not domain.startswith("http") else domain
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.post(
                f"{store_url}/api/prodrank/connect",
                headers={"X-API-Token": token},
            )
            if resp.status_code != 200:
                raise HTTPException(400, f"Store rejected connection: HTTP {resp.status_code}")
            store_info = resp.json()
    except httpx.ConnectError:
        # Try HTTPS
        if not store_url.startswith("https"):
            try:
                store_url_https = store_url.replace("http://", "https://")
                async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                    resp = await client.post(
                        f"{store_url_https}/api/prodrank/connect",
                        headers={"X-API-Token": token},
                    )
                    if resp.status_code != 200:
                        raise HTTPException(400, f"Store rejected connection: HTTP {resp.status_code}")
                    store_info = resp.json()
                    store_url = store_url_https
            except Exception:
                raise HTTPException(400, f"Cannot connect to store at {domain}. Make sure the store is running.")
        else:
            raise HTTPException(400, f"Cannot connect to store at {domain}")
    except Exception as e:
        raise HTTPException(400, f"Connection failed: {e}")

    # Save site — bound to the authenticated account when present.
    fields = {
        "platform": "custom",
        "platform_confidence": 100,
        "auth_method": "api_token",
        "access_token": token,
        "shopify_shop": store_url,  # reuse for base URL
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if user_id:
        from app.services.usage import check_site_limit
        allowed, detail, _current, _limit = check_site_limit(user_id)
        if not allowed:
            raise HTTPException(status_code=403, detail=detail)
        fields["user_id"] = user_id
        # upsert on (user_id, domain); clean up any leftover unbound rows
        db.client.table("sites").upsert({"domain": domain, **fields}, on_conflict="user_id,domain").execute()
        db.client.table("sites").delete().eq("domain", domain).is_("user_id", None).execute()
    else:
        existing = db.client.table("sites").select("id").eq("domain", domain).eq("platform", "custom").limit(1).execute().data
        if existing:
            db.client.table("sites").update(fields).eq("id", existing[0]["id"]).execute()
        else:
            db.client.table("sites").insert({"domain": domain, **fields}).execute()

    # Get the site id for product sync
    site_data = existing or db.client.table("sites").select("id").eq("domain", domain).eq("platform", "custom").limit(1).execute().data

    # Sync products
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            prod_resp = await client.get(
                f"{store_url}/api/prodrank/products",
                headers={"X-API-Token": token},
            )
            if prod_resp.status_code == 200:
                products_data = prod_resp.json()
                store_products = products_data.get("products", [])
                if store_products and site_data:
                    # Save products to DB
                    now_iso = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
                    rows = [{
                        "site_id": site_data[0]["id"],
                        "title": p.get("title", ""),
                        "url": p.get("url", ""),
                        "description": (p.get("description") or "")[:500],
                        "price": str(p.get("price", "")),
                        "sku": p.get("sku", ""),
                        "brand": p.get("brand", ""),
                        "product_type": p.get("product_type", ""),
                        "category": p.get("category", ""),
                        "images": p.get("images", []),
                        "variants": p.get("variants", []),
                        "schema_fields": p.get("schema_fields", 0),
                        "updated_at": now_iso,
                    } for p in store_products]
                    db.save_products_batch(site_data[0]["id"], rows)
    except Exception:
        pass  # Non-critical: products can be synced later

    return {
        "status": "connected",
        "domain": domain,
        "platform": "custom",
        "store_name": store_info.get("store", domain),
        "product_count": store_info.get("product_count", 0),
    }


@router.post("/resolve-url")
async def resolve_custom_product(req: CustomResolveUrlRequest, request: Request):
    """Resolve a product URL from a custom store.
    Requires login + store ownership (prevents probing other stores)."""
    from urllib.parse import urlparse

    url = req.url.strip()
    if not url.startswith("http"):
        url = f"https://{url}"
    parsed = urlparse(url)
    domain = parsed.netloc or parsed.path.split("/")[0]
    domain = domain.replace("www.", "").lower()

    # Find the site
    site_data = db.client.table("sites").select("id,user_id,access_token,shopify_shop").eq("domain", domain).eq("platform", "custom").limit(1).execute().data
    if not site_data:
        raise HTTPException(404, f"No custom store connected for {domain}")
    _require_owner(site_data[0], _resolve_user_id(request))

    site = site_data[0]
    token = site.get("access_token", "")
    base_url = site.get("shopify_shop", f"http://{domain}")

    # Try to find the product by slug in the URL
    slug = parsed.path.strip("/").split("/")[-1]

    product = {"url": url, "title": "", "description": "", "price": "", "sku": "", "brand": "", "images": [], "id": slug}

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(
                f"{base_url}/api/prodrank/products/{slug}",
                headers={"X-API-Token": token},
            )
            if resp.status_code == 200:
                p = resp.json()
                product = {
                    "url": url,
                    "title": p.get("title", slug),
                    "description": p.get("description", ""),
                    "price": str(p.get("price", "")),
                    "sku": p.get("sku", ""),
                    "brand": p.get("brand", ""),
                    "images": p.get("images", []),
                    "id": p.get("id", slug),
                    "product_type": p.get("product_type", ""),
                    "tags": p.get("tags", []),
                }
    except Exception:
        # Fall back to basic URL parse
        pass

    return {
        "domain": domain,
        "product": product,
        "has_token": bool(token),
        "_platform": "custom",
    }


@router.post("/publish/generate")
async def generate_content(req: CustomGenerateRequest, request: Request):
    """Generate AI content for a custom store product.
    Requires login + store ownership (spend endpoint)."""
    _require_owner(_get_site(req.shop), _resolve_user_id(request))
    token, base_url = _get_token_and_url(req.shop)

    # Fetch full product data
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        resp = await client.get(
            f"{base_url}/api/prodrank/products/{req.product_id}",
            headers={"X-API-Token": token},
        )
        if resp.status_code != 200:
            raise HTTPException(404, f"Product not found: {req.product_id}")
        product = resp.json()

    # Generate fields
    fields = [f for f in DEFAULT_FIELDS if f not in req.skip_fields]
    force = set(req.force_fields or [])
    result = {}
    for field in fields:
        try:
            gen = await ai.generate_field(
                category="", product=product, field=field,
                force_regenerate=(field in force),
            )
            result[field] = gen.get("content") or gen
        except Exception as e:
            result[field] = {"error": str(e)}

    # Save draft
    shopify_id = product.get("id", req.product_id)
    for field in fields:
        content = result.get(field)
        if content:
            db.save_content_draft(
                shop=req.shop,
                shopify_product_id=str(shopify_id),
                field=field,
                content=content,
                status="draft",
            )

    # Count usage
    current = db.get_monthly_generations(req.shop, datetime.now(timezone.utc).strftime("%Y-%m"))
    return {
        "fields": result,
        "generations_used": current + 1,
        "generations_remaining": max(0, 3 - current - 1),
        "product_id": product.get("id"),
    }


@router.post("/publish")
async def publish_content(req: CustomPublishRequest, request: Request):
    """Push generated content to the custom store.
    Requires login + store ownership."""
    _require_owner(_get_site(req.shop), _resolve_user_id(request))
    token, base_url = _get_token_and_url(req.shop)

    # Get latest drafts
    drafts = db.get_latest_drafts(req.shop, req.product_id, req.fields)
    if not drafts:
        raise HTTPException(400, "No drafts to publish. Generate content first.")

    # Push to store
    body = {}
    for field, draft in drafts.items():
        body[field] = draft.get("content")

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.put(
            f"{base_url}/api/prodrank/products/{req.product_id}/content",
            headers={"X-API-Token": token, "Content-Type": "application/json"},
            json=body,
        )
        if resp.status_code != 200:
            detail = resp.text[:300]
            raise HTTPException(400, f"Store rejected publish: HTTP {resp.status_code} — {detail}")
        result = resp.json()

    # Mark drafts as published
    draft_ids = [d.get("id") for d in drafts.values() if d.get("id")]
    if draft_ids:
        db.mark_drafts_published([str(did) for did in draft_ids])

    return {
        "status": "published",
        "fields": list(drafts.keys()),
        "store_response": result,
    }


@router.post("/verify")
async def verify_content(req: CustomVerifyRequest, request: Request):
    """Verify content was published to the custom store.
    Requires login + store ownership."""
    _require_owner(_get_site(req.shop), _resolve_user_id(request))
    token, base_url = _get_token_and_url(req.shop)

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        resp = await client.get(
            f"{base_url}/api/prodrank/products/{req.product_id}/verify",
            headers={"X-API-Token": token},
        )
        if resp.status_code == 200:
            return resp.json()
        # Fallback: just check the product page
        resp2 = await client.get(f"{base_url}/api/prodrank/products/{req.product_id}", headers={"X-API-Token": token})
        if resp2.status_code == 200:
            p = resp2.json()
            return {
                "product_id": req.product_id,
                "has_prodrank_content": bool(p.get("prodrank_content")),
                "schema_present": p.get("schema_fields", 0) > 0,
                "verified": True,
            }

    return {"product_id": req.product_id, "has_prodrank_content": False, "verified": False}


@router.get("/drafts")
async def get_drafts(shop: str, product_id: str, request: Request):
    """Get version history for a product. Requires login + store ownership."""
    _require_owner(_get_site(shop), _resolve_user_id(request))
    drafts = db.get_latest_drafts(shop, product_id)
    return {
        "history": {
            field: [draft] if draft else []
            for field, draft in (drafts or {}).items()
        }
    }
