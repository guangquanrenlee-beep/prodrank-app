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


@router.post("/mentions")
async def mentions_stats(req: MonitorRequest):
    """Daily AI mention statistics for a keyword.
    Returns per-day aggregation: how many AI agents mentioned the product,
    which ones, best rank, over the last N days."""
    ai = AIQueryService()
    db = DB()
    report = await ai.query_all(req.product_name, req.keyword, req.brand)

    # Persist this check too (same as /track)
    for r in report.results:
        db.save_ai_response(
            product_id=req.product_name,
            ai_agent=r.ai_agent, keyword=req.keyword,
            rank=r.rank, total=r.total_mentioned,
            description=r.description, sentiment=r.sentiment,
            raw=r.raw_response,
        )

    history = db.get_ai_history(req.keyword, limit=500)

    # Aggregate by day: how many agents mentioned, which ones, best rank
    # history records carry ai_agent + rank + checked_at
    from datetime import datetime, timedelta
    by_day: dict[str, dict] = {}
    for h in history:
        day = (h.get("checked_at") or "")[:10]
        if not day:
            continue
        agent = h.get("ai_agent", "unknown")
        rank = h.get("rank")
        entry = by_day.setdefault(day, {"checks": 0, "mentioned_agents": set(), "ranks": []})
        entry["checks"] += 1
        if rank is not None:
            entry["mentioned_agents"].add(agent)
            entry["ranks"].append(rank)

    daily = []
    for day in sorted(by_day.keys(), reverse=True)[:14]:
        e = by_day[day]
        ranks = e["ranks"]
        daily.append({
            "date": day,
            "checks": e["checks"],
            "mentioned_count": len(e["mentioned_agents"]),
            "mentioned_agents": sorted(e["mentioned_agents"]),
            "best_rank": min(ranks) if ranks else None,
            "mentioned": bool(ranks),
        })

    return {
        "keyword": req.keyword,
        "product_name": req.product_name,
        "today": daily[0] if daily else {"date": "no data yet", "mentioned_count": 0, "mentioned_agents": [], "mentioned": False},
        "daily": daily,
        "live": {
            "best_rank": report.best_rank,
            "mentioned_by": report.mentioned_by,
            "not_mentioned_by": report.not_mentioned_by,
        },
    }


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
