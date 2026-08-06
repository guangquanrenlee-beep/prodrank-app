"""
Match Engine — ② of the AI Shopping Intelligence Engine.

Given a product (title/description/category), find the most relevant shopping
questions from ai_shopping_queries via embedding similarity. This is what
makes the Test Engine cost-efficient: instead of asking a product 100 random
questions, ask the ~50 it can actually answer.

Pipeline: product text → embedding → cosine similarity over queries →
top-N ranked list. Embeddings use text-embedding-3-small (1536d) via the
ofox gateway.
"""

import asyncio
import os
from typing import Any

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.services.db import DB

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536

# Fetch more queries than needed so the top-N selection is a true rerank.
_FETCH_LIMIT = 1000


class MatchEngine:
    """Match products to relevant shopping questions."""

    def __init__(self):
        settings = get_settings()
        self._client: AsyncOpenAI | None = None

    @property
    def client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(
                api_key=os.getenv("OPENAI_API_KEY", ""),
                base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            )
        return self._client

    # ── Embedding ──

    async def embed(self, text: str) -> list[float]:
        """Embed a single text (product text or query)."""
        resp = await self.client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text[:8000],  # model context limit
        )
        return resp.data[0].embedding

    async def embed_batch(self, texts: list[str], batch_size: int = 64) -> list[list[float]]:
        """Embed a list of texts in batches."""
        out: list[list[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            resp = await self.client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=[t[:8000] for t in batch],
            )
            # Preserve input order
            ordered = sorted(resp.data, key=lambda d: d.index)
            out.extend(d.embedding for d in ordered)
        return out

    @staticmethod
    def cosine(a: list[float], b: list[float]) -> float:
        """Cosine similarity of two vectors."""
        dot = sum(x * y for x, y in zip(a, b))
        na = sum(x * x for x in a) ** 0.5
        nb = sum(x * x for x in b) ** 0.5
        if not na or not nb:
            return 0.0
        return dot / (na * nb)

    # ── Product → query matching ──

    def product_text(self, product: dict) -> str:
        """Compose a searchable text from a product's fields."""
        parts = [
            product.get("title", ""),
            product.get("category", ""),
            product.get("product_type", ""),
            (product.get("description") or "")[:500],
        ]
        parts += [str(t) for t in (product.get("tags") or [])]
        return " ".join(p for p in parts if p)

    async def match_queries(
        self,
        product: dict,
        top_n: int = 50,
        category: str = "",
        min_score: float = 0.15,
    ) -> list[dict]:
        """Return the top-N most relevant queries for a product.

        Uses in-process cosine over embedded queries (cached in memory) —
        the query library is small (hundreds to a few thousand rows).
        """
        db = DB()

        # Fetch candidate queries (optionally filtered by category)
        q = db.client.table("ai_shopping_queries").select("id,query,category,intent,attributes")
        if category:
            q = q.eq("category", category)
        queries = q.limit(_FETCH_LIMIT).execute().data or []
        if not queries:
            return []

        # Get embeddings — build a cache keyed by (id → vector) if embedding
        # column is populated; otherwise embed on the fly (slow fallback).
        # Prefer the DB column: SELECT id, embedding.
        q2 = db.client.table("ai_shopping_queries").select("id,embedding").limit(_FETCH_LIMIT)
        if category:
            q2 = q2.eq("category", category)
        emb_rows = q2.execute().data or []

        emb_by_id: dict[str, list[float]] = {}
        need_embed: list[dict] = []
        for qr in queries:
            row = next((r for r in emb_rows if r.get("id") == qr.get("id")), None)
            vec = row.get("embedding") if row else None
            if vec:
                # PostgREST returns pgvector as a "[1.2,3.4,...]" string —
                # parse it into floats.
                if isinstance(vec, str):
                    vec = [float(x) for x in vec.strip("[]").split(",") if x.strip()]
                emb_by_id[qr["id"]] = vec
            else:
                need_embed.append(qr)

        # Embed missing queries on the fly (one-time cost per new query)
        if need_embed:
            texts = [q["query"] for q in need_embed]
            try:
                vecs = await self.embed_batch(texts)
                for qr, v in zip(need_embed, vecs):
                    emb_by_id[qr["id"]] = v
                    # Persist so the next match is instant
                    try:
                        db.client.table("ai_shopping_queries").update(
                            {"embedding": v}
                        ).eq("id", qr["id"]).execute()
                    except Exception:
                        pass
            except Exception as e:
                print(f"[match_engine] embed fallback failed: {str(e)[:100]}")

        # Embed the product once
        pvec = await self.embed(self.product_text(product))

        # Score and rank
        scored = []
        for qr in queries:
            qvec = emb_by_id.get(qr["id"])
            if not qvec:
                continue
            score = self.cosine(pvec, qvec)
            if score >= min_score:
                scored.append({
                    "id": qr["id"],
                    "query": qr.get("query", ""),
                    "category": qr.get("category", ""),
                    "intent": qr.get("intent", ""),
                    "attributes": qr.get("attributes", []),
                    "score": round(score, 4),
                })
        scored.sort(key=lambda x: -x["score"])
        return scored[:top_n]
