"""Automated daily AI rank monitoring — stores history in Supabase."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.ai_query import AIQueryService
from app.services.db import DB

router = APIRouter()


class MonitorRequest(BaseModel):
    product_name: str
    keyword: str
    brand: str = ""


@router.post("/track")
async def track_now(req: MonitorRequest):
    """Run a rank check NOW and persist to Supabase. Returns snapshot + history."""
    ai = AIQueryService()
    db = DB()

    report = await ai.query_all(req.product_name, req.keyword, req.brand)

    saved = []
    for r in report.results:
        rec = db.save_ai_response(
            product_id=req.product_name,
            ai_agent=r.ai_agent,
            keyword=req.keyword,
            rank=r.rank,
            total=r.total_mentioned,
            description=r.description,
            sentiment=r.sentiment,
            raw=r.raw_response,
        )
        if rec:
            saved.append(rec)

    # Fetch history for this keyword
    history = db.get_ai_history(req.keyword, limit=30)

    return {
        "snapshot": {
            "product_name": req.product_name,
            "keyword": req.keyword,
            "best_rank": report.best_rank,
            "mentioned_by": report.mentioned_by,
            "not_mentioned_by": report.not_mentioned_by,
            "results": [{
                "ai_agent": r.ai_agent,
                "rank": r.rank,
                "description": r.description[:100] if r.description else "",
                "sentiment": r.sentiment,
            } for r in report.results],
        },
        "history": history,
    }
