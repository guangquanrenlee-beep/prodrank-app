"""
Insight Engine API — evidence-based "why not recommended" analysis.

GET /api/insights/why?site_id=xxx&domain=xxx
"""

from fastapi import APIRouter, HTTPException

from app.services.insight_engine import InsightEngine

router = APIRouter()
engine = InsightEngine()


@router.get("/why")
async def why_not_recommended(site_id: str, domain: str = "", category: str = ""):
    """Analyze why a site's products are (or aren't) being recommended by AI.

    Compares the site against competitors across Schema, FAQ, knowledge
    coverage, reviews and citations — every finding carries its evidence.
    """
    if not site_id:
        raise HTTPException(400, "site_id is required")
    try:
        return await engine.why_not_recommended(site_id, domain=domain, category=category)
    except Exception as e:
        raise HTTPException(500, f"Insight analysis failed: {str(e)[:200]}")
