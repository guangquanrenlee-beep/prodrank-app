"""
Trend Engine API — AI Shopping Trends.

GET /api/trends/hot?category=&top_n=    — hot attributes shoppers ask about
GET /api/trends/gaps?site_id=&category= — hot attributes products are missing
GET /api/trends/trend?days=30           — 30-day attribute growth (from snapshots)
POST /api/trends/snapshot               — record today's snapshot (internal)
"""

from fastapi import APIRouter, HTTPException

from app.services.trend_engine import TrendEngine

router = APIRouter()
engine = TrendEngine()


@router.get("/hot")
async def hot_attributes(category: str = "", top_n: int = 15):
    """Hot attributes shoppers ask about, ranked by frequency."""
    return {"attributes": await engine.hot_attributes(category, min(top_n, 50))}


@router.get("/gaps")
async def product_gaps(site_id: str, category: str = ""):
    """Hot attributes the site's products are missing (evidence-backed advice)."""
    if not site_id:
        raise HTTPException(400, "site_id is required")
    return {"gaps": await engine.product_gaps(site_id, category)}


@router.get("/trend")
async def trend(days: int = 30, top_n: int = 10):
    """30-day attribute trend from daily snapshots."""
    return await engine.trend(days=min(days, 90), top_n=min(top_n, 20))


@router.post("/snapshot")
async def snapshot():
    """Record today's attribute-frequency snapshot (called by the scheduler)."""
    return await engine.snapshot()
