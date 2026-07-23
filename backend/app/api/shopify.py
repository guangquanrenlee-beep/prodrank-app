"""Shopify App API — OAuth + Schema injection endpoints."""

import os
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.services.shopify_service import ShopifyService

router = APIRouter()

# In production these come from env vars (set in Shopify Partner Dashboard)
SHOPIFY_CLIENT_ID = os.getenv("SHOPIFY_CLIENT_ID", "")
SHOPIFY_CLIENT_SECRET = os.getenv("SHOPIFY_CLIENT_SECRET", "")
APP_URL = os.getenv("APP_URL", "https://prodrank.app")

shopify = ShopifyService(
    client_id=SHOPIFY_CLIENT_ID,
    client_secret=SHOPIFY_CLIENT_SECRET,
)


class InstallRequest(BaseModel):
    shop: str


class InjectAllRequest(BaseModel):
    shop: str
    access_token: str


@router.get("/install")
async def install_url(shop: str = Query(...)):
    """Get the Shopify OAuth install URL for a shop."""
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
    """Handle Shopify OAuth callback — exchange code for token."""
    try:
        token_data = await shopify.exchange_token(shop=shop, code=code)
        return {
            "shop": shop,
            "access_token": token_data.get("access_token"),
            "scopes": token_data.get("scope", "").split(","),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/inject-all")
async def inject_all_products(req: InjectAllRequest):
    """Generate and inject optimized Schema for all products in a store."""
    from app.services.shopify_service import ShopifyStore

    store = ShopifyStore(shop=req.shop, access_token=req.access_token)
    try:
        result = await shopify.inject_schema_for_all_products(store)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
