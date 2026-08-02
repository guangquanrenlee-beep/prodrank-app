"""Shopify Webhook Listener — ⑧ incremental sync + lifecycle events.

Topics handled:
  products/update, products/create   → sync the product into Supabase
  inventory_levels/update            → mark site needs re-sync (recorded)
  themes/publish                     → mark theme changed (health check alert)
  app/uninstalled                    → mark site disconnected, clear token
  customers/data_request             → GDPR: acknowledge (we store no customer data)
  customers/redact                   → GDPR: acknowledge + purge customer data (none stored)
  shop/redact                        → GDPR: delete ALL data for the shop

All webhooks are HMAC-verified (X-Shopify-Hmac-Sha256) before any processing.
Shopify resends webhooks that don't return 2xx, so handlers must be idempotent.
"""

import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Request, Response

from app.services.db import DB
from app.services.shopify_service import admin_api_base, SHOPIFY_API_VERSION

router = APIRouter()

SHOPIFY_CLIENT_SECRET = os.getenv("SHOPIFY_CLIENT_SECRET", "")


async def _verify_hmac(request: Request, raw_body: bytes) -> bool:
    """Verify X-Shopify-Hmac-Sha256 over the RAW request body."""
    received = request.headers.get("X-Shopify-Hmac-Sha256", "")
    if not received or not SHOPIFY_CLIENT_SECRET:
        return False
    digest = hmac.new(
        SHOPIFY_CLIENT_SECRET.encode(), raw_body, hashlib.sha256
    ).digest()
    return hmac.compare_digest(received.encode(), base64.b64encode(digest))


def _shop_from_request(request: Request) -> str:
    return (request.headers.get("X-Shopify-Shop-Domain") or
            request.headers.get("X-Shopify-Domain") or "").lower()


async def _lookup_token(shop: str) -> str:
    try:
        data = DB().client.table("sites").select("access_token").eq("domain", shop).eq("platform", "shopify").limit(1).execute().data
        if data and data[0].get("access_token"):
            return data[0]["access_token"]
    except Exception:
        pass
    return ""


async def _sync_product(shop: str, token: str, product_id) -> None:
    """⑧ products/update|create — re-sync one product into Supabase (idempotent)."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{admin_api_base(shop)}/admin/api/{SHOPIFY_API_VERSION}/products/{product_id}.json",
            headers={"X-Shopify-Access-Token": token, "Content-Type": "application/json"},
            timeout=15,
        )
        if resp.status_code != 200:
            return  # product deleted / token expired — nothing to sync
        product = resp.json().get("product", {})
    from app.services.shopify_service import ShopifyService
    svc = ShopifyService()
    row = svc.extract_product_sync_data(product, shop)
    db = DB()
    sites = db.client.table("sites").select("id").eq("domain", shop).eq("platform", "shopify").limit(1).execute().data
    site_id = sites[0]["id"] if sites else ""
    db.save_products_batch(site_id, [row])


@router.post("/{topic:path}")
async def webhook_listener(topic: str, request: Request):
    """⑧ Webhook endpoint — one route for all topics, verified + dispatched.

    Uses the `:path` converter: real topics contain a slash (products/update,
    customers/data_request, shop/redact, ...) and a plain {topic} segment
    would 404 on them."""
    raw = await request.body()
    if not await _verify_hmac(request, raw):
        return Response(status_code=401, content="Invalid HMAC")

    shop = _shop_from_request(request)
    if not shop:
        return Response(status_code=400, content="Missing shop header")

    db = DB()
    try:
        payload = json.loads(raw)
    except Exception:
        payload = {}
    now = datetime.now(timezone.utc).isoformat()

    if topic in ("products/update", "products/create"):
        product_id = payload.get("id")
        token = await _lookup_token(shop)
        if product_id and token:
            await _sync_product(shop, token, product_id)
        return Response(status_code=200, content="ok")

    if topic == "inventory_levels/update":
        # Full inventory reconciliation is expensive; record the change and
        # let the next full sync pick it up.
        try:
            db.client.table("sites").update({
                "last_synced_at": now, "updated_at": now,
            }).eq("domain", shop).eq("platform", "shopify").execute()
        except Exception:
            pass
        return Response(status_code=200, content="ok")

    if topic == "themes/publish":
        # Theme changed → blocks may have been removed; Health Check re-verifies.
        try:
            db.client.table("sites").update({
                "last_theme_change_at": now, "updated_at": now,
            }).eq("domain", shop).eq("platform", "shopify").execute()
        except Exception:
            pass
        return Response(status_code=200, content="ok")

    if topic == "app/uninstalled":
        # Merchant removed the app — disconnect the store, keep history.
        try:
            db.client.table("sites").update({
                "access_token": "",
                "updated_at": now,
            }).eq("domain", shop).eq("platform", "shopify").execute()
        except Exception:
            pass
        return Response(status_code=200, content="ok")

    # ── GDPR (mandatory for App Store listing) ──

    if topic == "customers/data_request":
        # We do not store customer data (no orders/customer tables), so there
        # is nothing to return. Acknowledge + log for audit.
        print(f"[gdpr] customers/data_request shop={shop}")
        return Response(status_code=200, content="{}")

    if topic == "customers/redact":
        # Same — no customer data stored, nothing to redact.
        print(f"[gdpr] customers/redact shop={shop}")
        return Response(status_code=200, content="ok")

    if topic == "shop/redact":
        # Purge everything for this shop (products, drafts, usage, site row).
        print(f"[gdpr] shop/redact shop={shop}")
        db.delete_shop_data(shop)
        return Response(status_code=200, content="ok")

    # Unknown topic — acknowledge so Shopify stops retrying.
    return Response(status_code=200, content="ok")
