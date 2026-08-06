"""
Match Engine API — match products to the most relevant shopping questions.

POST /api/match/product   — match a product (by site product id or raw fields)
GET  /api/match/stats     — embedding coverage stats
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.db import DB
from app.services.match_engine import MatchEngine

router = APIRouter()
engine = MatchEngine()


class MatchProductRequest(BaseModel):
    product_id: str = ""
    site_id: str = ""
    category: str = ""
    top_n: int = 50
    min_score: float = 0.15


@router.post("/product")
async def match_product(req: MatchProductRequest):
    """Match a product to relevant shopping questions.

    Provide product_id + site_id (fetched from DB) OR raw fields below.
    """
    product = None
    if req.product_id and req.site_id:
        rows = db_client().table("products").select("*").eq("id", req.product_id).eq("site_id", req.site_id).limit(1).execute().data
        if rows:
            product = rows[0]
    if not product:
        raise HTTPException(404, "Product not found — pass product_id + site_id")

    matches = await engine.match_queries(
        product=product,
        top_n=req.top_n,
        category=req.category or product.get("category", ""),
        min_score=req.min_score,
    )
    return {
        "product": {"title": product.get("title"), "category": product.get("category")},
        "matched": len(matches),
        "queries": matches,
    }


@router.get("/stats")
async def match_stats():
    """Embedding coverage stats for the query library."""
    db = DB()
    total = db.client.table("ai_shopping_queries").select("id", count="exact").execute()
    embedded = db.client.table("ai_shopping_queries").select("id").not_.is_("embedding", None).execute().data or []
    return {
        "total_queries": total.count,
        "embedded": len(embedded),
        "coverage_pct": round(len(embedded) / total.count * 100, 1) if total.count else 0,
    }


def db_client():
    return DB()
