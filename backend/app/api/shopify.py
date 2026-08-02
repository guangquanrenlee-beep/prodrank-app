"""Shopify App API — OAuth + Store Connection + Product Sync.

V1 core chain:
  ① Store Connection — OAuth install/callback, persist store, store-info
  ② Product Sync    — full catalog sync into Supabase
  ⑥ One-click Publish / ⑨ Verification — added in shopify_publish.py
"""

import os
import secrets
import time
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.services.shopify_service import ShopifyService, ShopifyStore, admin_api_base, SHOPIFY_API_VERSION

router = APIRouter()

# In production these come from env vars (set in Shopify Partner Dashboard)
SHOPIFY_CLIENT_ID = os.getenv("SHOPIFY_CLIENT_ID", "")
SHOPIFY_CLIENT_SECRET = os.getenv("SHOPIFY_CLIENT_SECRET", "")
APP_URL = os.getenv("APP_URL", "https://api.prodrank.app")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://prodrank.app")

shopify = ShopifyService(
    client_id=SHOPIFY_CLIENT_ID,
    client_secret=SHOPIFY_CLIENT_SECRET,
)


class SyncRequest(BaseModel):
    shop: str
    access_token: str


class SyncProductRequest(BaseModel):
    shop: str
    access_token: str
    product_id: int


def _persist_oauth_state(shop: str, state: str) -> None:
    """Store the OAuth state nonce against the shop (sites table) so the
    callback can validate it (CSRF protection). One install = one nonce."""
    from app.services.db import DB
    db = DB()
    existing = db.client.table("sites").select("id").eq("domain", shop).eq("platform", "shopify").limit(1).execute().data
    now = datetime.now(timezone.utc).isoformat()
    if existing:
        db.client.table("sites").update({"oauth_state": state, "updated_at": now}).eq("id", existing[0]["id"]).execute()
    else:
        db.client.table("sites").insert({
            "domain": shop, "user_id": "", "platform": "shopify",
            "auth_method": "oauth", "oauth_state": state, "updated_at": now,
        }).execute()


@router.get("/install")
async def install_url(shop: str = Query(...)):
    """Get the Shopify OAuth install URL for a shop.

    Returns JSON, not a redirect: the frontend fetches this cross-origin and
    navigates with window.location. A 302 would be followed by fetch() into
    Shopify's domain, which has no CORS headers for us → "Failed to fetch".

    Persists a per-install state nonce that the callback validates before
    exchanging the code.
    """
    if not SHOPIFY_CLIENT_ID or not SHOPIFY_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Shopify credentials not configured. Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.",
        )
    state = secrets.token_urlsafe(32)
    _persist_oauth_state(shop, state)
    redirect_uri = f"{APP_URL}/api/shopify/callback"
    url = shopify.build_install_url(shop=shop, redirect_uri=redirect_uri, state=state)
    return {"install_url": url}


@router.get("/callback")
async def oauth_callback(request: Request):
    """① Store Connection — handle OAuth callback.

    Security (required by Shopify + App Store review):
      1. Verify the HMAC signature over all query params
      2. Reject callbacks older than 1 hour (timestamp check)
      3. Validate the state nonce persisted at /install time (CSRF)
      4. Exchange code → persist store → 302 back to the frontend
    """
    params = dict(request.query_params)
    shop = params.get("shop", "")
    state = params.get("state", "")
    code = params.get("code", "")

    # HMAC over all query params (except hmac/signature), verified first.
    if not shopify.verify_hmac(params.copy(), SHOPIFY_CLIENT_SECRET):
        raise HTTPException(status_code=400, detail="Invalid HMAC signature")

    # Timestamp freshness — reject stale callbacks (replay protection).
    try:
        ts = int(params.get("timestamp", "0"))
        if abs(time.time() - ts) > 3600:
            raise HTTPException(status_code=400, detail="Stale OAuth callback")
    except ValueError:
        raise HTTPException(status_code=400, detail="Missing timestamp")

    # Merchant declined the authorization — bounce them back gracefully.
    if params.get("error") or not code:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=f"{FRONTEND_URL}/settings?shop={quote(shop)}&error=denied", status_code=302)

    # CSRF: state must match the nonce persisted at /install time.
    from app.services.db import DB
    db = DB()
    rows = db.client.table("sites").select("oauth_state").eq("domain", shop).eq("platform", "shopify").limit(1).execute().data
    if not rows or not rows[0].get("oauth_state") or rows[0]["oauth_state"] != state:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")
    db.client.table("sites").update({"oauth_state": ""}).eq("domain", shop).eq("platform", "shopify").execute()

    try:
        token_data = await shopify.exchange_token(shop=shop, code=code)
        access_token = token_data.get("access_token")
        store = ShopifyStore(shop=shop, access_token=access_token)

        # Fetch + persist store info
        shop_info = {}
        try:
            shop_info = await shopify.get_shop_info(store)
        except Exception:
            pass
        db.save_shopify_store(shop=shop, access_token=access_token, shop_info=shop_info)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=f"{FRONTEND_URL}/settings?shop={quote(shop)}&installed=1", status_code=302)


@router.get("/store-info")
async def store_info(shop: str = Query(...), access_token: str = Query(...)):
    """① Store Connection — full store snapshot: shop info, themes, collections."""
    store = ShopifyStore(shop=shop, access_token=access_token)
    try:
        info = await shopify.get_shop_info(store)
        themes = await shopify.get_themes(store)
        collections = await shopify.get_collections(store)
        return {
            "shop": shop,
            "name": info.get("name", ""),
            "email": info.get("email", ""),
            "plan": info.get("plan_name", ""),
            "currency": info.get("currency", ""),
            "timezone": info.get("timezone", ""),
            "domain": info.get("domain", ""),
            "themes": themes,
            "collections": collections,
            "collections_count": len(collections),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync")
async def sync_products(req: SyncRequest):
    """② Product Sync — full sync of ALL products into Supabase (cursor paginated)."""
    from app.services.db import DB

    store = ShopifyStore(shop=req.shop, access_token=req.access_token)
    try:
        products = await shopify.get_all_products(store)
        db = DB()
        sites = db.client.table("sites").select("id").eq("domain", req.shop).eq("platform", "shopify").limit(1).execute().data
        site_id = sites[0]["id"] if sites else ""
        rows = [shopify.extract_product_sync_data(p, req.shop) for p in products]
        db.save_products_batch(site_id, rows)
        return {"status": "synced", "shop": req.shop, "site_id": site_id, "total": len(products)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync/product")
async def sync_single_product(req: SyncProductRequest):
    """② Product Sync — sync a single product (used by Publish before writing content)."""
    from app.services.db import DB

    store = ShopifyStore(shop=req.shop, access_token=req.access_token)
    try:
        async with __import__("httpx").AsyncClient() as client:
            resp = await client.get(
                f"{admin_api_base(req.shop)}/admin/api/{SHOPIFY_API_VERSION}/products/{req.product_id}.json",
                headers={"X-Shopify-Access-Token": req.access_token, "Content-Type": "application/json"},
                timeout=15,
            )
            resp.raise_for_status()
            product = resp.json().get("product", {})
        db = DB()
        sites = db.client.table("sites").select("id").eq("domain", req.shop).eq("platform", "shopify").limit(1).execute().data
        site_id = sites[0]["id"] if sites else ""
        db.save_products_batch(site_id, [shopify.extract_product_sync_data(product, req.shop)])
        return {"status": "synced", "shopify_id": str(product.get("id", "")), "title": product.get("title", "")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
