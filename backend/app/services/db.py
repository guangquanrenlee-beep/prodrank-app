"""
Supabase Database Service — replaces all in-memory storage.
Every engine reads/writes through this layer.
"""

import os
from datetime import datetime, timezone
from typing import Any

from supabase import create_client, Client

from app.core.config import get_settings


class DB:
    """Singleton database client wrapping Supabase Python SDK."""

    _instance: "DB | None" = None
    client: Client

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            settings = get_settings()
            cls._instance.client = create_client(
                settings.supabase_url,
                settings.supabase_service_key,
            )
        return cls._instance

    # ── Sites ──

    def save_site(self, user_id: str, domain: str, platform: str = "",
                  confidence: int = 0, auth_method: str = "") -> dict:
        return self.client.table("sites").upsert({
            "user_id": user_id, "domain": domain,
            "platform": platform, "platform_confidence": confidence,
            "auth_method": auth_method,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="user_id,domain").execute().data[0] if True else {}

    def save_shopify_store(self, shop: str, access_token: str, shop_info: dict | None = None):
        """① Store Connection — save/update a connected Shopify store after OAuth.
        No user_id yet (OAuth is separate from Supabase Auth); rows are keyed by
        domain and the Dashboard binds them to accounts later."""
        fields = {
            "platform": "shopify",
            "platform_confidence": 95,
            "auth_method": "oauth",
            "access_token": access_token,
            "shopify_shop": shop,
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        existing = self.client.table("sites").select("id").eq("domain", shop).eq("platform", "shopify").limit(1).execute().data
        if existing:
            self.client.table("sites").update(fields).eq("id", existing[0]["id"]).execute()
        else:
            self.client.table("sites").insert({"domain": shop, "user_id": "", **fields}).execute()

    def get_sites(self, user_id: str) -> list[dict]:
        return self.client.table("sites").select("*").eq("user_id", user_id).execute().data or []

    def update_site_score(self, site_id: str, score: int):
        self.client.table("sites").update({
            "ai_visibility_score": score,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", site_id).execute()

    # ── Products ──

    def save_product(self, site_id: str, title: str, url: str = "",
                     description: str = "", price: str = "", sku: str = "",
                     brand: str = "", schema_fields: int = 0,
                     content_score: int = 0, ai_score: int = 0) -> dict:
        if not site_id:
            return {}
        data = self.client.table("products").upsert({
            "site_id": site_id, "title": title, "url": url,
            "description": description, "price": price, "sku": sku,
            "brand": brand, "schema_fields": schema_fields,
            "content_quality_score": content_score,
            "ai_visibility_score": ai_score,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="site_id,url").execute().data
        return data[0] if data else {}

    def save_products_batch(self, site_id: str, products: list[dict]):
        """Batch insert products from site audit or Shopify full sync."""
        if not site_id or not products:
            return
        now = datetime.now(timezone.utc).isoformat()
        rows = [{
            "site_id": site_id, "title": p.get("title", p.get("name", "")),
            "url": p.get("url", ""), "description": p.get("description", ""),
            "price": str(p.get("price", "")), "sku": p.get("sku", ""),
            "brand": p.get("brand", ""), "schema_fields": p.get("schema_fields", 0),
            "content_quality_score": p.get("content_quality_score", 0),
            "ai_visibility_score": p.get("ai_visibility_score", 0),
            "shopify_id": p.get("shopify_id", ""),
            "seo_title": p.get("seo_title", ""),
            "meta_description": p.get("meta_description", ""),
            "product_type": p.get("product_type", ""),
            "tags": p.get("tags", []),
            "collections": p.get("collections", []),
            "variants": p.get("variants", []),
            "inventory_quantity": p.get("inventory_quantity", 0),
            "vendor": p.get("vendor", ""),
            "updated_at": now,
        } for p in products]
        self.client.table("products").upsert(rows, on_conflict="site_id,url").execute()

    def get_products(self, site_id: str, limit: int = 50) -> list[dict]:
        return self.client.table("products").select("*").eq("site_id", site_id).limit(limit).execute().data or []

    def get_low_score_products(self, site_id: str, threshold: int = 40) -> list[dict]:
        return self.client.table("products").select("*").eq("site_id", site_id).lt("ai_visibility_score", threshold).execute().data or []

    # ── AI Responses ──

    def save_ai_response(self, product_id: str, ai_agent: str, keyword: str,
                         rank: int | None, total: int = 0, description: str = "",
                         sentiment: str = "", raw: str = "") -> dict:
        # product_id is a uuid FK — keyword-level checks (brand names etc.)
        # pass a non-uuid string; store as NULL instead of failing/skipping.
        pid = None
        if product_id:
            try:
                import uuid as _uuid
                _uuid.UUID(str(product_id))
                pid = product_id
            except ValueError:
                pid = None
        return self.client.table("ai_responses").insert({
            "product_id": pid, "ai_agent": ai_agent, "keyword": keyword,
            "rank_position": rank, "total_mentioned": total,
            "description": description, "sentiment": sentiment,
            "raw_response": raw,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }).execute().data[0] if True else {}

    def get_ai_history(self, keyword: str, limit: int = 30) -> list[dict]:
        """Get recent AI ranking history for a keyword."""
        data = self.client.table("ai_responses").select("*").eq("keyword", keyword).order("checked_at", desc=True).limit(limit).execute().data or []
        return [{
            "ai_agent": r.get("ai_agent", ""),
            "keyword": r.get("keyword", ""),
            "rank": r.get("rank_position"),
            "description": (r.get("description") or "")[:100],
            "sentiment": r.get("sentiment", ""),
            "checked_at": r.get("checked_at", ""),
        } for r in data]
    # ── Citations ──

    def save_citation(self, ai_response_id: str, source_url: str,
                      source_domain: str = "", source_type: str = "",
                      influence: float = 0.0):
        self.client.table("citations").insert({
            "ai_response_id": ai_response_id, "source_url": source_url,
            "source_domain": source_domain or self._domain_from_url(source_url),
            "source_type": source_type, "influence_weight": influence,
        }).execute()

    def get_top_citations(self, category: str = "", limit: int = 20) -> list[dict]:
        """Group citations by domain, sorted by count."""
        # Simpler: post-processing in Python since Supabase JS doesn't support GROUP BY well
        return self.client.table("citations").select("*").limit(500).execute().data or []

    # ── Verifications ──

    def save_verification(self, product_id: str, before: dict, after: dict = None, delta: int = None) -> dict:
        return self.client.table("verifications").insert({
            "product_id": product_id,
            "snapshot_before": before,
            "snapshot_after": after,
            "delta_score": delta,
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }).execute().data[0] if True else {}

    def get_verifications(self, product_id: str) -> list[dict]:
        return self.client.table("verifications").select("*").eq("product_id", product_id).order("verified_at", desc=True).execute().data or []

    # ── Questions ──

    def save_question(self, category: str, text: str, volume: int = 0, coverage: int = 0):
        self.client.table("questions").upsert({
            "category": category, "question_text": text,
            "search_volume": volume, "ai_coverage_pct": coverage,
        }, on_conflict="category,question_text").execute()

    def get_questions(self, category: str, limit: int = 50) -> list[dict]:
        return self.client.table("questions").select("*").eq("category", category).limit(limit).execute().data or []

    def save_questions_batch(self, questions: list[dict]):
        """Batch save questions to Supabase."""
        if not questions:
            return
        self.client.table("questions").upsert([
            {"category": q["category"], "question_text": q["text"],
             "search_volume": q.get("volume", 0), "ai_coverage_pct": q.get("coverage", 0)}
            for q in questions
        ], on_conflict="category,question_text").execute()

    # ── Verifications ──

    def save_verification(self, product_id: str, before: dict, after: dict = None, delta: int = None) -> dict:
        data = self.client.table("verifications").insert({
            "product_id": product_id,
            "snapshot_before": before,
            "snapshot_after": after,
            "delta_score": delta,
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }).execute().data
        return data[0] if data else {}

    def get_verifications(self, product_id: str) -> list[dict]:
        data = self.client.table("verifications").select("*").eq("product_id", product_id).order("verified_at", desc=True).execute().data
        return data or []

    # ── Subscriptions ──

    def save_subscription(self, user_id: str, plan: str = "free", paddle_id: str = "",
                          status: str = "active") -> dict:
        return self.client.table("subscriptions").upsert({
            "user_id": user_id, "plan": plan,
            "paddle_subscription_id": paddle_id,
            "status": status,
        }, on_conflict="user_id").execute().data[0] if True else {}

    def get_subscription(self, user_id: str) -> dict | None:
        data = self.client.table("subscriptions").select("*").eq("user_id", user_id).execute().data
        return data[0] if data else None

    # ── AI Content Drafts (⑥ publish + ⑦ rollback versioning) ──

    def save_content_draft(self, shop: str, shopify_product_id: str, field: str,
                           content, status: str = "draft", provenance: dict | None = None) -> int:
        """Save a new AI content version. Returns the new version number."""
        rows = (self.client.table("content_drafts")
                .select("version").eq("shop", shop).eq("shopify_product_id", shopify_product_id)
                .eq("field", field).order("version", desc=True).limit(1).execute().data)
        version = (rows[0]["version"] + 1) if rows else 1
        now = datetime.now(timezone.utc).isoformat()
        self.client.table("content_drafts").insert({
            "shop": shop, "shopify_product_id": str(shopify_product_id), "field": field,
            "content": content, "status": status, "version": version,
            "provenance": provenance or {},
            "created_at": now, "updated_at": now,
        }).execute()
        return version

    def get_latest_drafts(self, shop: str, shopify_product_id: str, fields: list[str] | None = None) -> dict:
        """Latest draft per field (version descending, deduped in Python since
        Supabase has no simple group-by for this)."""
        data = (self.client.table("content_drafts")
                .select("*").eq("shop", shop).eq("shopify_product_id", str(shopify_product_id))
                .order("version", desc=True).limit(500).execute().data or [])
        out: dict = {}
        for d in data:
            if fields and d.get("field") not in fields:
                continue
            if d.get("field") not in out:
                out[d["field"]] = d
        return out

    def get_draft_history(self, shop: str, shopify_product_id: str, field: str, limit: int = 20) -> list[dict]:
        """Full version history for one field (⑦ Rollback support)."""
        return (self.client.table("content_drafts")
                .select("*").eq("shop", shop).eq("shopify_product_id", str(shopify_product_id))
                .eq("field", field).order("version", desc=True).limit(limit).execute().data or [])

    def count_generations(self, shop: str, shopify_product_id: str) -> int:
        """Count how many times generate has been called for this product.
        Counts distinct version groups across all fields (one generate call
        creates one version per field with the same version number)."""
        data = self.client.table("content_drafts").select("version").eq("shop", shop).eq("shopify_product_id", str(shopify_product_id)).order("version", desc=True).limit(1).execute().data
        return data[0]["version"] if data else 0

    def mark_drafts_published(self, draft_ids: list[str]):
        """Mark drafts as published after they've been written to metafields."""
        if not draft_ids:
            return
        now = datetime.now(timezone.utc).isoformat()
        self.client.table("content_drafts").update({"status": "published", "updated_at": now}).in_("id", draft_ids).execute()

    @staticmethod
    def _domain_from_url(url: str) -> str:
        try:
            from urllib.parse import urlparse
            d = urlparse(url).netloc
            return d.replace("www.", "")
        except Exception:
            return url
