"""
Mock Shopify Admin API — local test server for ProdRank's Shopify chain.
Simulates the endpoints Shopify exposes to our SaaS backend:
  /admin/api/2024-10/shop.json              → store info
  /admin/api/2024-10/products.json          → product list / by handle
  /admin/api/2024-10/products/{id}.json     → single product (GET/PUT)
  /admin/api/2024-10/products/{id}/metafields.json → metafield read/write
  /admin/api/2024-10/themes.json            → themes
  /admin/api/2024-10/collections.json       → collections
  /admin/api/2024-10/metafields.json        → shop-level metafields

Usage:
  python mock_shopify.py            # serves on :8443
Then in Supabase sites table: insert a row for a fake store
  domain = "mock-store.myshopify.com", platform = "shopify",
  access_token = "mock_token", auth_method = "oauth"
Then call our SaaS endpoints with shop=mock-store.myshopify.com
(site resolves token from DB; SaaS hits this server — point it at
localhost:8443 via hosts or by setting SHOPIFY_MOCK_BASE env when
testing locally).
"""

import json
import re
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI(title="Mock Shopify Admin API")

# ── In-memory store ──

SHOP = {
    "id": 123456789,
    "name": "Mock Test Store",
    "email": "store@mock.com",
    "domain": "mock-store.myshopify.com",
    "myshopify_domain": "mock-store.myshopify.com",
    "currency": "USD",
    "timezone": "(GMT+08:00) Asia/Shanghai",
    "plan_name": "development",
}

PRODUCTS = [
    {
        "id": 1001,
        "title": "Classic Cotton T-Shirt",
        "handle": "classic-cotton-t-shirt",
        "body_html": "<p>Soft 100% cotton tee, available in 5 colors. Regular fit.</p>",
        "product_type": "Clothing",
        "vendor": "MockBrand",
        "tags": "t-shirt, cotton, casual, unisex",
        "status": "active",
        "images": [{"src": "https://cdn.shopify.com/mock/tshirt.jpg"}],
        "variants": [{"id": 2001, "title": "Default", "sku": "TSH-001", "price": "19.99",
                      "barcode": "1234567890123", "available": True, "inventory_quantity": 42}],
    },
    {
        "id": 1002,
        "title": "Wireless Noise-Cancelling Headphones",
        "handle": "wireless-nc-headphones",
        "body_html": "<p>Over-ear ANC headphones, 30h battery, Bluetooth 5.3, USB-C.</p>",
        "product_type": "Electronics",
        "vendor": "MockBrand",
        "tags": "headphones, bluetooth, anc, audio",
        "status": "active",
        "images": [{"src": "https://cdn.shopify.com/mock/headphones.jpg"}],
        "variants": [{"id": 2002, "title": "Default", "sku": "HPH-002", "price": "129.00",
                      "barcode": "9876543210987", "available": True, "inventory_quantity": 15}],
    },
    {
        "id": 1003,
        "title": "Organic Vitamin C Serum",
        "handle": "organic-vitamin-c-serum",
        "body_html": "<p>20% vitamin C serum with hyaluronic acid. For all skin types.</p>",
        "product_type": "Beauty",
        "vendor": "MockBrand",
        "tags": "skincare, vitamin-c, serum, organic",
        "status": "active",
        "images": [{"src": "https://cdn.shopify.com/mock/serum.jpg"}],
        "variants": [{"id": 2003, "title": "Default", "sku": "SRM-003", "price": "34.50",
                      "barcode": "1112223334445", "available": True, "inventory_quantity": 60}],
    },
    {
        "id": 1004,
        "title": "Stainless Steel French Press Coffee Maker",
        "handle": "french-press-coffee-maker",
        "body_html": "<p>1L stainless steel french press, double-wall insulated.</p>",
        "product_type": "Home & Kitchen",
        "vendor": "MockBrand",
        "tags": "coffee, french-press, kitchen, brewing",
        "status": "active",
        "images": [{"src": "https://cdn.shopify.com/mock/frenchpress.jpg"}],
        "variants": [{"id": 2004, "title": "Default", "sku": "CFP-004", "price": "45.00",
                      "barcode": "5556667778889", "available": True, "inventory_quantity": 8}],
    },
]

# product_id → {"namespace": {"key": value}}
METAFIELDS: dict[int, dict] = {}

THEMES = [
    {"id": 9001, "name": "Dawn", "role": "main", "created_at": "2026-01-01T00:00:00Z"},
]

COLLECTIONS = [
    {"id": 8001, "title": "Apparel", "handle": "apparel"},
    {"id": 8002, "title": "Electronics", "handle": "electronics"},
]

# Shop-level metafields (rendering rules etc.)
SHOP_METAFIELDS: dict[str, dict] = {}

TOKEN_CHECK = "mock_token"


def _check_token(request: Request):
    """Validate X-Shopify-Access-Token."""
    token = request.headers.get("X-Shopify-Access-Token", "")
    return token == TOKEN_CHECK


def _product_by_id(pid: int):
    return next((p for p in PRODUCTS if p["id"] == pid), None)


def _product_by_handle(handle: str):
    return next((p for p in PRODUCTS if p["handle"] == handle), None)


def _clean_product(p: dict) -> dict:
    out = json.loads(json.dumps(p))
    return out


# ── Routes ──

@app.get("/admin/api/2024-10/shop.json")
async def get_shop(request: Request):
    if not _check_token(request):
        return JSONResponse({"errors": "Invalid token"}, status_code=401)
    return {"shop": SHOP}


@app.get("/admin/api/2024-10/products.json")
async def list_products(request: Request, handle: str | None = None, limit: int = 250):
    if not _check_token(request):
        return JSONResponse({"errors": "Invalid token"}, status_code=401)
    if handle:
        p = _product_by_handle(handle)
        return {"products": [_clean_product(p)] if p else []}
    return {"products": [_clean_product(p) for p in PRODUCTS[:limit]]}


@app.get("/admin/api/2024-10/products/{pid}.json")
async def get_product(pid: int, request: Request):
    if not _check_token(request):
        return JSONResponse({"errors": "Invalid token"}, status_code=401)
    p = _product_by_id(pid)
    if not p:
        return JSONResponse({"errors": "Product not found"}, status_code=404)
    return {"product": _clean_product(p)}


@app.put("/admin/api/2024-10/products/{pid}.json")
async def update_product(pid: int, request: Request):
    """Simulate body_html overwrite (⑥ opt-in description overwrite)."""
    if not _check_token(request):
        return JSONResponse({"errors": "Invalid token"}, status_code=401)
    p = _product_by_id(pid)
    if not p:
        return JSONResponse({"errors": "Product not found"}, status_code=404)
    body = await request.json()
    product = body.get("product", {})
    if "body_html" in product:
        p["body_html"] = product["body_html"]
    return {"product": _clean_product(p)}


@app.get("/admin/api/2024-10/products/{pid}/metafields.json")
async def list_product_metafields(pid: int, request: Request, namespace: str | None = None):
    if not _check_token(request):
        return JSONResponse({"errors": "Invalid token"}, status_code=401)
    mfs = METAFIELDS.get(pid, {})
    items = []
    for ns, keys in mfs.items():
        if namespace and ns != namespace:
            continue
        for key, value in keys.items():
            items.append({
                "id": uuid.uuid4().int % (2**63),
                "namespace": ns,
                "key": key,
                "value": json.dumps(value) if isinstance(value, (dict, list)) else str(value),
                "type": "json" if isinstance(value, (dict, list)) else "string",
            })
    return {"metafields": items}


@app.post("/admin/api/2024-10/products/{pid}/metafields.json")
async def create_product_metafield(pid: int, request: Request):
    if not _check_token(request):
        return JSONResponse({"errors": "Invalid token"}, status_code=401)
    body = await request.json()
    mf = body.get("metafield", {})
    ns = mf.get("namespace", "")
    key = mf.get("key", "")
    raw = mf.get("value", "")
    value = raw
    if mf.get("type") == "json":
        try:
            value = json.loads(raw)
        except Exception:
            pass
    METAFIELDS.setdefault(pid, {}).setdefault(ns, {})[key] = value
    return {"metafield": {"id": uuid.uuid4().int % (2**63), "namespace": ns, "key": key, "value": raw, "type": mf.get("type", "json")}}


@app.get("/admin/api/2024-10/themes.json")
async def list_themes(request: Request):
    if not _check_token(request):
        return JSONResponse({"errors": "Invalid token"}, status_code=401)
    return {"themes": THEMES}


@app.get("/admin/api/2024-10/collections.json")
async def list_collections(request: Request):
    if not _check_token(request):
        return JSONResponse({"errors": "Invalid token"}, status_code=401)
    return {"collections": COLLECTIONS}


@app.post("/admin/api/2024-10/metafields.json")
async def create_shop_metafield(request: Request):
    """Shop-level metafields (rendering rules, org schema)."""
    if not _check_token(request):
        return JSONResponse({"errors": "Invalid token"}, status_code=401)
    body = await request.json()
    mf = body.get("metafield", {})
    ns, key = mf.get("namespace", ""), mf.get("key", "")
    raw = mf.get("value", "")
    value = raw
    if mf.get("type") == "json":
        try:
            value = json.loads(raw)
        except Exception:
            pass
    SHOP_METAFIELDS[f"{ns}/{key}"] = value
    return {"metafield": {"id": uuid.uuid4().int % (2**63), "namespace": ns, "key": key, "value": raw, "type": mf.get("type", "json")}}


@app.get("/admin/api/2024-10/webhooks.json")
async def list_webhooks(request: Request):
    if not _check_token(request):
        return JSONResponse({"errors": "Invalid token"}, status_code=401)
    return {"webhooks": []}


# ── Debug endpoints ──

@app.get("/_debug/metafields")
async def debug_metafields():
    return {"product_metafields": METAFIELDS, "shop_metafields": SHOP_METAFIELDS}


@app.get("/_debug/products/{pid}")
async def debug_product(pid: int):
    p = _product_by_id(pid)
    return {"product": p, "metafields": METAFIELDS.get(pid, {})}


if __name__ == "__main__":
    import uvicorn
    print("Mock Shopify Admin API on http://127.0.0.1:8443")
    print("Products:", [(p["id"], p["title"]) for p in PRODUCTS])
    print("Token: mock_token")
    uvicorn.run(app, host="127.0.0.1", port=8443)
