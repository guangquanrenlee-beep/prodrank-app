"""
AI Test Engine — ② of the AI Shopping Intelligence Engine.

Takes a product/site, fetches matching shopping queries from the query
database, asks AI models "as a shopping assistant", records which brands &
products are recommended, and computes the recommendation rate.

Designed for cheap per-run cost: ~50 queries × $0.00001 ≈ $0.0005/run on
DeepSeek flash. Falls back to ofox multi-model when DEEPSEEK_API_KEY is
absent.
"""

import asyncio
import json
import re
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.services.llm import get_content_client

# ── Data classes ──


@dataclass
class QueryResult:
    query_id: str
    query_text: str
    model: str
    answer: str
    recommended: bool
    rank: int | None
    reason: str
    mentioned_brands: list[str] = field(default_factory=list)
    error: str | None = None


@dataclass
class TestRun:
    site_id: str
    product_id: str | None
    category: str
    total_queries: int
    results: list[QueryResult] = field(default_factory=list)

    @property
    def recommendation_rate(self) -> float:
        if not self.total_queries:
            return 0.0
        mentioned = sum(1 for r in self.results if r.recommended)
        return round(mentioned / self.total_queries * 100, 1)

    @property
    def by_model(self) -> dict:
        out: dict = {}
        for r in self.results:
            if r.model not in out:
                out[r.model] = {"total": 0, "recommended": 0, "avg_rank": None}
            out[r.model]["total"] += 1
            if r.recommended:
                out[r.model]["recommended"] += 1
        for m in out:
            out[m]["rate"] = round(out[m]["recommended"] / out[m]["total"] * 100, 1) if out[m]["total"] else 0
        return out

    def to_summary(self) -> dict:
        return {
            "site_id": self.site_id,
            "product_id": self.product_id,
            "category": self.category,
            "total_queries": self.total_queries,
            "recommendation_rate": self.recommendation_rate,
            "by_model": self.by_model,
            "results": [
                {
                    "query": r.query_text[:100],
                    "model": r.model,
                    "recommended": r.recommended,
                    "rank": r.rank,
                    "mentioned_brands": r.mentioned_brands[:5],
                    "answer": r.answer[:200],
                }
                for r in self.results
            ],
        }


# ── Engine ──


class AITestEngine:
    """AI Shopping Intelligence Engine — Test Engine (②)."""

    # Model IDs used when DEEPSEEK_API_KEY is absent (ofox fallback)
    MODEL_MAP = {
        "chatgpt": "anthropic/claude-haiku-4.5",
        "gemini": "google/gemini-3.6-flash",
        "claude": "anthropic/claude-sonnet-5",
        "grok": "x-ai/grok-4.3",
        "deepseek": None,  # resolved from get_content_client()
    }

    def __init__(self):
        self.settings = get_settings()
        # ofox client (used when DeepSeek key is absent for ofox models)
        self._ofox: AsyncOpenAI | None = None

    @property
    def ofox(self) -> AsyncOpenAI:
        if self._ofox is None:
            self._ofox = AsyncOpenAI(
                api_key=self.settings.openai_api_key,
                base_url=self.settings.openai_base_url,
            )
        return self._ofox

    # ── Public API ──

    async def run_test(
        self,
        site_id: str,
        brand_name: str,
        category: str = "",
        product_id: str | None = None,
        query_count: int = 50,
        models: list[str] | None = None,
    ) -> TestRun:
        """Run a full AI recommendation test for a brand/site.

        Args:
            site_id: Supabase sites.id
            brand_name: merchant brand name (e.g. "AltCoord", "Nike")
            category: product category key (e.g. "fashion") — fetched from
                      DB if empty
            product_id: optional product to tag results with
            query_count: how many queries to test (max 200, default 50)
            models: which AI models to query (default: ["deepseek"])
        """
        if models is None:
            models = ["deepseek"]
        query_count = min(query_count, 200)

        # Resolve category if not provided
        if not category:
            category = await self._detect_site_category(site_id)

        # Fetch queries from the Query Engine (①)
        queries = await self._fetch_queries(category, query_count)

        if not queries:
            return TestRun(
                site_id=site_id,
                product_id=product_id,
                category=category,
                total_queries=0,
            )

        # Test each query against each model concurrently (with concurrency cap)
        sem = asyncio.Semaphore(8)  # max 8 concurrent AI calls

        async def test_one(query_row: dict, model: str) -> QueryResult:
            async with sem:
                return await self._test_single_query(
                    query_row=query_row,
                    model=model,
                    brand_name=brand_name,
                )

        tasks = [
            test_one(q, m)
            for q in queries
            for m in models
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)
        valid: list[QueryResult] = []
        for r in results:
            if isinstance(r, QueryResult):
                valid.append(r)
            else:
                valid.append(QueryResult(
                    query_id="", query_text="", model="",
                    answer="", recommended=False, rank=None,
                    reason="", error=str(r)[:200],
                ))

        run = TestRun(
            site_id=site_id,
            product_id=product_id,
            category=category,
            total_queries=len(queries) * len(models),
            results=valid,
        )

        # Persist results to database
        await self._save_results(run)

        return run

    async def get_recommendation_rate(self, site_id: str) -> dict:
        """Return current recommendation rate and history for a site."""
        from app.services.db import DB
        db = DB()
        result = db.client.table("ai_query_results").select("*").eq("site_id", site_id).order("created_at", desc=True).limit(500).execute()
        rows = result.data or []

        if not rows:
            return {"site_id": site_id, "total_tests": 0, "recommendation_rate": 0}

        total = len(rows)
        recommended = sum(1 for r in rows if r.get("recommended"))
        by_model: dict = {}
        for r in rows:
            m = r.get("model", "unknown")
            by_model.setdefault(m, {"total": 0, "recommended": 0})
            by_model[m]["total"] += 1
            if r.get("recommended"):
                by_model[m]["recommended"] += 1

        for m in by_model:
            by_model[m]["rate"] = round(by_model[m]["recommended"] / by_model[m]["total"] * 100, 1)

        return {
            "site_id": site_id,
            "total_tests": total,
            "recommendation_rate": round(recommended / total * 100, 1) if total else 0,
            "by_model": by_model,
            "rows": rows[:20],
        }

    # ── Internal ──

    async def _fetch_queries(self, category: str, limit: int) -> list[dict]:
        """Fetch queries from ai_shopping_queries for a category, shuffled."""
        import random
        from app.services.db import DB
        db = DB()

        # Fetch more than needed so we can shuffle
        data = db.client.table("ai_shopping_queries").select("*").eq("category", category).limit(limit * 3).execute().data or []
        if not data:
            # Fall back to any category
            data = db.client.table("ai_shopping_queries").select("*").limit(limit * 3).execute().data or []

        random.shuffle(data)
        return data[:limit]

    async def _detect_site_category(self, site_id: str) -> str:
        """Guess the category from the site's products."""
        from app.services.db import DB
        db = DB()

        # Check products for product_type
        prods = db.client.table("products").select("product_type,title").eq("site_id", site_id).limit(20).execute().data or []
        if prods:
            from app.services.shopify_ai import ShopifyAIService
            ai = ShopifyAIService()
            # Try to detect from first product
            cat, _ = await ai.detect_category(prods[0])
            if cat != "default":
                return cat

        # Default: fall back to "fashion" (most common)
        return "fashion"

    async def _test_single_query(
        self, query_row: dict, model: str, brand_name: str,
    ) -> QueryResult:
        """Ask one AI model one shopping query, return whether brand_name
        was recommended."""
        query_text = query_row.get("query", "")

        prompt = (
            f"You are a helpful shopping assistant. A user asks:\n\n"
            f'"{query_text}"\n\n'
            f"Please recommend 5 specific products or brands that best match "
            f"this request. For each, give a brief reason why. "
            f"Format: [Rank]. Brand/Product — reason"
        )

        try:
            answer, model_id = await self._call_model(model, prompt)

            # Parse the answer to find mentions of the target brand
            brand_lower = brand_name.lower()
            mentioned_brands = self._extract_brands(answer)
            recommended = any(brand_lower in b.lower() for b in mentioned_brands)

            rank = None
            reason = ""

            if recommended:
                # Find which rank position the brand appears at
                for line in answer.split("\n"):
                    if brand_lower in line.lower():
                        m = re.match(r"(\d+)", line.strip())
                        if m:
                            rank = int(m.group(1))
                        reason = line.strip()[:200]
                        break
                if not reason:
                    reason = answer[:200]
            else:
                reason = f"Brand '{brand_name}' not mentioned in top recommendations"

            return QueryResult(
                query_id=query_row.get("id", ""),
                query_text=query_text,
                model=model,
                answer=answer[:500],
                recommended=recommended,
                rank=rank,
                reason=reason,
                mentioned_brands=mentioned_brands[:5],
            )

        except Exception as e:
            return QueryResult(
                query_id=query_row.get("id", ""),
                query_text=query_text,
                model=model,
                answer="",
                recommended=False,
                rank=None,
                reason="",
                error=str(e)[:200],
            )

    async def _call_model(self, model: str, prompt: str) -> tuple[str, str]:
        """Call an AI model, return (response_text, model_id_used)."""
        if model == "deepseek":
            client, model_id = get_content_client()
        else:
            client = self.ofox
            model_id = self.MODEL_MAP.get(model, model)

        resp = await client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": "You are a shopping assistant. Be concise. Return only the ranked list, no intro or outro."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            # deepseek is verbose — cap it tight (cheap + parser only needs
            # rank/brand lines); the 4 ofox models keep headroom so long
            # answers don't truncate mid-list.
            max_tokens=300 if model == "deepseek" else 400,
        )
        return (resp.choices[0].message.content or "").strip(), model_id

    @staticmethod
    def _extract_brands(text: str) -> list[str]:
        """Extract brand/product names from a ranked recommendation list."""
        brands: list[str] = []
        for line in text.split("\n"):
            line = line.strip()
            m = re.match(r"\d+[\.\)\:\s\-]+(.+?)(?:\s*[—–-]|\s*$)", line)
            if m:
                name = m.group(1).strip()
                if name and len(name) < 80:
                    brands.append(name)
        return brands

    async def _save_results(self, run: TestRun) -> None:
        """Persist test results to ai_query_results table."""
        from app.services.db import DB
        db = DB()
        now = datetime.now(timezone.utc).isoformat()

        # Validate UUIDs before upsert
        pid = None
        if run.product_id:
            try:
                UUID(str(run.product_id))
                pid = run.product_id
            except ValueError:
                pid = None

        rows = []
        for r in run.results:
            if r.error and not r.query_id:
                continue
            qid = None
            if r.query_id:
                try:
                    UUID(str(r.query_id))
                    qid = r.query_id
                except ValueError:
                    pass

            rows.append({
                "query_id": qid,
                "site_id": run.site_id,
                "product_id": pid,
                "model": r.model,
                "answer": r.answer[:2000] if r.answer else "",
                "recommended": r.recommended,
                "rank": r.rank,
                "reason": (r.reason or "")[:500],
                "citation": json.dumps(r.mentioned_brands[:10]),
                "created_at": now,
            })

        if rows:
            # Batch insert in chunks of 50
            for i in range(0, len(rows), 50):
                chunk = rows[i:i + 50]
                try:
                    db.client.table("ai_query_results").insert(chunk).execute()
                except Exception as e:
                    print(f"[TestEngine] insert chunk failed: {e}")
