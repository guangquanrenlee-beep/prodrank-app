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
        return self.client.table("products").upsert({
            "site_id": site_id, "title": title, "url": url,
            "description": description, "price": price, "sku": sku,
            "brand": brand, "schema_fields": schema_fields,
            "content_quality_score": content_score,
            "ai_visibility_score": ai_score,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="site_id,url").execute().data[0] if True else {}

    def get_products(self, site_id: str, limit: int = 50) -> list[dict]:
        return self.client.table("products").select("*").eq("site_id", site_id).limit(limit).execute().data or []

    def get_low_score_products(self, site_id: str, threshold: int = 40) -> list[dict]:
        return self.client.table("products").select("*").eq("site_id", site_id).lt("ai_visibility_score", threshold).execute().data or []

    # ── AI Responses ──

    def save_ai_response(self, product_id: str, ai_agent: str, keyword: str,
                         rank: int | None, total: int = 0, description: str = "",
                         sentiment: str = "", raw: str = "") -> dict:
        if not product_id:
            return {}  # skip if no product record yet
        return self.client.table("ai_responses").insert({
            "product_id": product_id, "ai_agent": ai_agent, "keyword": keyword,
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

    @staticmethod
    def _domain_from_url(url: str) -> str:
        try:
            from urllib.parse import urlparse
            d = urlparse(url).netloc
            return d.replace("www.", "")
        except Exception:
            return url
