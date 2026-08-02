"""Shopify App API — OAuth + Store Connection + Product Sync.

V1 core chain:
  ① Store Connection — OAuth install/callback, persist store, store-info
  ② Product Sync    — full catalog sync into Supabase
  ⑥ One-click Publish / ⑨ Verification — added in shopify_publish.py
"""

import os
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.shopify_service import ShopifyService, ShopifyStore, admin_api_base

router = APIRouter()

# In production these come from env vars (set in Shopify Partner Dashboard)
SHOPIFY_CLIENT_ID = os.getenv("SHOPIFY_CLIENT_ID", "")
SHOPIFY_CLIENT_SECRET = os.getenv("SHOPIFY_CLIENT_SECRET", "")
APP_URL = os.getenv("APP_URL", "https://api.prodrank.app")

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


@router.get("/install")
async def install_url(shop: str = Query(...)):
    """Get the Shopify OAuth install URL for a shop.

    Returns JSON, not a redirect: the frontend fetches this cross-origin and
    navigates with window.location. A 302 would be followed by fetch() into
    Shopify's domain, which has no CORS headers for us → "Failed to fetch".
    """
    if not SHOPIFY_CLIENT_ID or not SHOPIFY_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Shopify credentials not configured. Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.",
        )
    redirect_uri = f"{APP_URL}/api/shopify/callback"
    url = shopify.build_install_url(shop=shop, redirect_uri=redirect_uri)
    return {"install_url": url}


@router.get("/callback")
async def oauth_callback(
    code: str = Query(...),
    hmac: str = Query(...),
    shop: str = Query(...),
    state: str = Query(...),
    host: str = Query(default=""),
):
    """① Store Connection — handle OAuth callback: exchange code, persist store,
    and fetch store info immediately so the Dashboard has data right away."""
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
        from app.services.db import DB
        DB().save_shopify_store(shop=shop, access_token=access_token, shop_info=shop_info)

        return {
            "shop": shop,
            "access_token": access_token,
            "scopes": token_data.get("scope", "").split(","),
            "store": {
                "name": shop_info.get("name", shop),
                "email": shop_info.get("email", ""),
                "plan": shop_info.get("plan_name", ""),
                "currency": shop_info.get("currency", "USD"),
                "timezone": shop_info.get("timezone", ""),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


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
                f"{admin_api_base(req.shop)}/admin/api/2024-10/products/{req.product_id}.json",
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
