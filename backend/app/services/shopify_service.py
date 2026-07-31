"""
Shopify App Service — OAuth + Product Schema injection via Admin API.

Flow:
  1. Merchant installs app from Shopify App Store
  2. OAuth handshake → get access token
  3. Fetch product data via Admin API
  4. Run Schema audit (reuse schema_detector)
  5. Generate optimized JSON-LD via AI (if API key configured)
  6. Write optimized Schema back to Shopify metafields
  7. Theme App Extension renders metafields into storefront <head>

Without AI API key: step 5 generates Schema from existing product data only.
With AI API key: step 5 enhances descriptions, generates FAQ, adds missing fields.
"""

import json
import hashlib
import hmac
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx

from app.services.schema_detector import SchemaDetector, ALL_FIELDS


@dataclass
class ShopifyStore:
    shop: str
    access_token: str
    scopes: list[str] = None


class ShopifyService:
    """Handle Shopify OAuth and product Schema injection."""

    def __init__(
        self,
        client_id: str = "",
        client_secret: str = "",
        detector: SchemaDetector | None = None,
    ):
        self.client_id = client_id
        self.client_secret = client_secret
        self.detector = detector or SchemaDetector()

    # ── OAuth ──

    def build_install_url(self, shop: str, redirect_uri: str, scopes: list[str] | None = None) -> str:
        """Build Shopify OAuth install URL."""
        if scopes is None:
            scopes = [
                "read_products",
                "write_products",
                "read_themes",
                "write_themes",
                "read_content",
                "write_content",
            ]
        nonce = hashlib.sha256(str(time.time()).encode()).hexdigest()[:16]
        params = {
            "client_id": self.client_id,
            "scope": ",".join(scopes),
            "redirect_uri": redirect_uri,
            "state": nonce,
        }
        return f"https://{shop}/admin/oauth/authorize?{urlencode(params)}"

    @staticmethod
    def verify_hmac(params: dict[str, str], secret: str) -> bool:
        """Verify Shopify HMAC signature."""
        received = params.pop("hmac", "")
        sorted_params = "&".join(
            f"{k}={v}" for k, v in sorted(params.items())
        )
        computed = hmac.new(
            secret.encode(), sorted_params.encode(), hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(computed, received)

    async def exchange_token(self, shop: str, code: str) -> dict:
        """Exchange OAuth code for permanent access token."""
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"https://{shop}/admin/oauth/access_token",
                json={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "code": code,
                },
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    # ── Product Operations ──

    async def get_products(self, store: ShopifyStore, limit: int = 50) -> list[dict]:
        """Fetch products from Shopify store."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://{store.shop}/admin/api/2024-10/products.json",
                headers={
                    "X-Shopify-Access-Token": store.access_token,
                    "Content-Type": "application/json",
                },
                params={"limit": limit, "status": "active"},
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("products", [])

    def generate_product_schema(self, product: dict) -> dict:
        """
        Generate a complete JSON-LD Product Schema from Shopify product data.
        This is the 'no AI' fallback — still produces valid, complete Schema.
        """
        variant = (product.get("variants") or [{}])[0] if product.get("variants") else {}
        images = [img.get("src", "") for img in (product.get("images") or [])[:5]]

        schema = {
            "@context": "https://schema.org/",
            "@type": "Product",
            "name": product.get("title", ""),
            "description": (product.get("body_html") or "N/A").strip()[:5000],
            "image": images if images else None,
            "sku": variant.get("sku", ""),
            "gtin13": variant.get("barcode", ""),
            "brand": {
                "@type": "Brand",
                "name": product.get("vendor", ""),
            },
            "offers": {
                "@type": "Offer",
                "priceCurrency": "USD",
                "price": variant.get("price", ""),
                "availability": "https://schema.org/InStock"
                if variant.get("inventory_quantity", 0) > 0
                else "https://schema.org/OutOfStock",
                "itemCondition": "https://schema.org/NewCondition",
            },
        }

        # Clean None values
        schema = {k: v for k, v in schema.items() if v is not None}
        return schema

    def generate_faq_schema(self, product: dict) -> list[dict] | None:
        """
        Generate FAQPage Schema questions from product data.
        Without AI, generates basic FAQs from product info.
        With AI, would generate richer, category-aware questions.
        """
        title = product.get("title", "")
        body = (product.get("body_html") or "").strip()
        vendor = product.get("vendor", "")

        faqs = []

        # Basic auto-generated FAQs from product data
        if body:
            # Extract key features for a "what is" question
            brief = body[:300].split(".")[:2]
            if brief:
                faqs.append({
                    "@type": "Question",
                    "name": f"What is the {title}?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": f"The {title} is {'. '.join(brief)}.",
                    },
                })

        # Return policy question (universally helpful)
        faqs.append({
            "@type": "Question",
            "name": "What is the return policy?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "Please visit our Returns & Refunds page for the most up-to-date policy information.",
            },
        })

        # Shipping question
        faqs.append({
            "@type": "Question",
            "name": f"How long does shipping take for the {title}?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "Shipping times vary by location. Please check our Shipping page or contact our support team for a delivery estimate to your area.",
            },
        })

        return faqs[:5]  # Max 5 FAQs

    async def set_product_metafield(
        self,
        store: ShopifyStore,
        product_id: int,
        namespace: str,
        key: str,
        value: Any,
        value_type: str = "json",
    ):
        """Write data to a Shopify product metafield."""
        async with httpx.AsyncClient() as client:
            metafield_payload = {
                "metafield": {
                    "namespace": namespace,
                    "key": key,
                    "value": json.dumps(value) if value_type == "json" else str(value),
                    "type": value_type,
                }
            }
            resp = await client.post(
                f"https://{store.shop}/admin/api/2024-10/products/{product_id}/metafields.json",
                headers={
                    "X-Shopify-Access-Token": store.access_token,
                    "Content-Type": "application/json",
                },
                json=metafield_payload,
                timeout=15,
            )
            resp.raise_for_status()
            return resp.json()

    async def inject_schema_for_product(
        self, store: ShopifyStore, product: dict
    ) -> dict:
        """
        Full pipeline: generate Schema → audit → write to metafields.
        The metafields are then rendered by the Theme App Extension liquid blocks.
        """
        product_id = product["id"]

        # 1. Generate Product Schema
        product_schema = self.generate_product_schema(product)
        await self.set_product_metafield(
            store, product_id, "prodrank", "product_schema", product_schema
        )

        # 2. Generate FAQ Schema
        faq_schema = self.generate_faq_schema(product)
        if faq_schema:
            await self.set_product_metafield(
                store, product_id, "prodrank", "faq_schema", faq_schema
            )

        # 3. Store AI-optimized description (basic fallback = existing description)
        ai_desc = (product.get("body_html") or "").strip()[:5000]
        await self.set_product_metafield(
            store, product_id, "prodrank", "ai_description", ai_desc, "string"
        )

        # 4. Calculate and store audit score
        schema_score = self._calculate_schema_score(product)
        await self.set_product_metafield(
            store, product_id, "prodrank", "audit_score", schema_score, "number_integer"
        )

        return {
            "product_id": product_id,
            "schema_fields_generated": len(product_schema),
            "faq_count": len(faq_schema) if faq_schema else 0,
            "audit_score": schema_score,
        }

    async def inject_schema_for_all_products(self, store: ShopifyStore) -> dict:
        """Bulk injection: generate Schema for all products in the store."""
        products = await self.get_products(store)
        results = []
        for product in products:
            try:
                result = await self.inject_schema_for_product(store, product)
                results.append(result)
            except Exception as e:
                results.append({"product_id": product["id"], "error": str(e)})

        return {
            "total": len(products),
            "success": len([r for r in results if "error" not in r]),
            "errors": len([r for r in results if "error" in r]),
            "details": results,
        }

    async def inject_organization_schema(self, store: ShopifyStore, shop_info: dict) -> dict:
        """Write Organization Schema to shop-level metafield (via first product or custom)."""
        org_schema = {
            "@type": "Organization",
            "name": shop_info.get("name", store.shop),
            "url": f"https://{store.shop}",
            "description": shop_info.get("description", ""),
        }

        # Store as shop-level metafield — use a dedicated approach
        # Shopify doesn't have shop-level metafields, so we store it
        # in a custom collection or via the shop locales.
        # For MVP, we store it in each product's injection point.
        # Later: use metaobject instead.
        async with httpx.AsyncClient() as client:
            # Use shop metaobject for site-wide data (2024-10+ API)
            resp = await client.post(
                f"https://{store.shop}/admin/api/2024-10/metafields.json",
                headers={
                    "X-Shopify-Access-Token": store.access_token,
                    "Content-Type": "application/json",
                },
                json={
                    "metafield": {
                        "namespace": "prodrank",
                        "key": "organization_schema",
                        "value": json.dumps(org_schema),
                        "type": "json",
                        "owner_resource": "shop",
                        "owner_id": shop_info.get("id"),
                    }
                },
                timeout=15,
            )
            resp.raise_for_status()
            return resp.json()

    def _calculate_schema_score(self, product: dict) -> int:
        """Quick audit score from Shopify product data (sans page crawl)."""
        score = 0
        if product.get("title"):
            score += 10
        if product.get("body_html"):
            desc_len = len(product["body_html"].strip())
            if desc_len > 200:
                score += 15
            elif desc_len > 100:
                score += 8
        if product.get("images"):
            score += 10
        if product.get("vendor"):
            score += 10
        variants = product.get("variants") or []
        if variants:
            v = variants[0]
            if v.get("sku"):
                score += 10
            if v.get("barcode"):
                score += 10
            if v.get("price"):
                score += 10
            if v.get("inventory_quantity", 0) > 0:
                score += 5

        return min(score, 100)

    # ── ① Store Connection — store info, themes, collections ──

    async def get_shop_info(self, store: ShopifyStore) -> dict:
        """Fetch store-level info: name, email, plan, timezone, currency."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://{store.shop}/admin/api/2024-10/shop.json",
                headers={"X-Shopify-Access-Token": store.access_token, "Content-Type": "application/json"},
                timeout=15,
            )
            resp.raise_for_status()
            return resp.json().get("shop", {})

    async def get_themes(self, store: ShopifyStore) -> list[dict]:
        """List the store's themes (to detect which one is live)."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://{store.shop}/admin/api/2024-10/themes.json",
                headers={"X-Shopify-Access-Token": store.access_token, "Content-Type": "application/json"},
                timeout=15,
            )
            resp.raise_for_status()
            return resp.json().get("themes", [])

    async def get_collections(self, store: ShopifyStore, limit: int = 250) -> list[dict]:
        """List the store's collections."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://{store.shop}/admin/api/2024-10/collections.json",
                headers={"X-Shopify-Access-Token": store.access_token, "Content-Type": "application/json"},
                params={"limit": limit},
                timeout=15,
            )
            resp.raise_for_status()
            return resp.json().get("collections", [])

    # ── ② Product Sync — full catalog sync with cursor pagination ──

    async def get_all_products(self, store: ShopifyStore) -> list[dict]:
        """Fetch ALL products using Link-header cursor pagination (250/page).
        Handles Shopify's page_info cursor in the Link header automatically."""
        import re

        products: list[dict] = []
        url = f"https://{store.shop}/admin/api/2024-10/products.json?limit=250"
        async with httpx.AsyncClient() as client:
            while url:
                resp = await client.get(
                    url,
                    headers={"X-Shopify-Access-Token": store.access_token, "Content-Type": "application/json"},
                    timeout=30,
                )
                resp.raise_for_status()
                batch = resp.json().get("products", [])
                products.extend(batch)
                link = resp.headers.get("Link", "")
                m = re.search(r'<([^>]+)>;\s*rel="next"', link)
                url = m.group(1) if m and batch else None
        return products

    @staticmethod
    def extract_product_sync_data(product: dict, shop: str) -> dict:
        """Map a Shopify product dict to our Supabase products schema."""
        variants = product.get("variants") or []
        first = variants[0] if variants else {}
        images = [img.get("src", "") for img in (product.get("images") or [])[:5]]
        seo = product.get("seo") or {}
        available = any(v.get("available", False) for v in variants)
        total_inventory = sum(int(v.get("inventory_quantity") or 0) for v in variants)
        return {
            "shopify_id": str(product.get("id", "")),
            "title": product.get("title", ""),
            "description": (product.get("body_html") or "").strip(),
            "price": str(first.get("price", "")),
            "currency": "USD",
            "sku": first.get("sku", ""),
            "gtin": first.get("barcode", ""),
            "brand": product.get("vendor", ""),
            "vendor": product.get("vendor", ""),
            "images": images,
            "url": f"https://{shop}/products/{product.get('handle', '')}" if product.get("handle") else "",
            "in_stock": available,
            "inventory_quantity": total_inventory,
            "seo_title": seo.get("title", ""),
            "meta_description": seo.get("description", ""),
            "product_type": product.get("product_type", ""),
            "tags": [t for t in (product.get("tags", "") or "").split(", ") if t],
            "collections": [],
            "variants": [
                {
                    "id": str(v.get("id", "")), "title": v.get("title", ""),
                    "sku": v.get("sku", ""), "price": v.get("price", ""),
                    "available": v.get("available", False),
                    "inventory_quantity": v.get("inventory_quantity", 0),
                }
                for v in variants
            ],
        }

    # ── ③ AI Content Storage — metafield conventions ──
    # All AI content lives in product metafields under the `prodrank` namespace.
    # Content boundaries (see docs/product-content-boundaries.md):
    #   ✅ Allowed: product description overwrite (only when merchant opts in),
    #      page modules via Theme Blocks (metafield-rendered), JSON-LD via
    #      Liquid render-time output, metafield storage itself.
    #   ❌ Never: About/Blog/Homepage/Landing pages, Collections, nav, theme
    #      source (CSS/HTML/Liquid/JS), images.

    AI_CONTENT_FIELDS = [
        "description", "faq", "pros", "cons", "comparison",
        "use_cases", "buying_guide", "specification", "schema", "ai_summary",
    ]

    async def set_ai_content_metafield(self, store: ShopifyStore, product_id: int, field: str, content) -> dict:
        """Write one AI content field to a product metafield (JSON type)."""
        return await self.set_product_metafield(store, product_id, "prodrank", field, content, "json")

    async def get_product_metafields(self, store: ShopifyStore, product_id: int) -> dict:
        """Read ALL prodrank metafields for a product (used by ⑨ Verification)."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://{store.shop}/admin/api/2024-10/products/{product_id}/metafields.json",
                headers={"X-Shopify-Access-Token": store.access_token, "Content-Type": "application/json"},
                params={"namespace": "prodrank"},
                timeout=15,
            )
            resp.raise_for_status()
            out: dict = {}
            for mf in resp.json().get("metafields", []):
                key = mf.get("key")
                value = mf.get("value")
                if mf.get("type") == "json" and value:
                    try:
                        value = json.loads(value)
                    except Exception:
                        pass
                out[key] = value
            return out

    async def set_rendering_rules(self, store: ShopifyStore, rules: dict) -> dict:
        """Rendering Rules — shop-level metafield controlling which AI sections render.
        Example: {"faq": true, "pros": true, "cons": false, "comparison": true,
                   "use_cases": true, "buying_guide": true, "ai_summary": true,
                   "description": false}
        The schema JSON-LD block is ALWAYS output regardless of these rules.
        (Theme app extensions can only read defined metafields; if the shop-level
        metafield is not readable in Liquid, the block falls back to "render all".)"""
        info = await self.get_shop_info(store)
        shop_id = info.get("id")
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"https://{store.shop}/admin/api/2024-10/metafields.json",
                headers={"X-Shopify-Access-Token": store.access_token, "Content-Type": "application/json"},
                json={"metafield": {
                    "namespace": "prodrank",
                    "key": "rendering_rules",
                    "value": json.dumps(rules),
                    "type": "json",
                    "owner_resource": "shop",
                    "owner_id": shop_id,
                }},
                timeout=15,
            )
            resp.raise_for_status()
            return resp.json()
