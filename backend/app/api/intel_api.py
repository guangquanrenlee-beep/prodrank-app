"""Citation Watch + Regression Monitor API (features 5+7)."""

from fastapi import APIRouter, Header, HTTPException, Query

from app.services.db import DB
from app.services.auth import user_id_from_auth

router = APIRouter()


@router.get("/citations/trend")
async def citation_trend(days: int = Query(default=30, ge=1, le=90)):
    """30-day cited-domain distribution: which sources do AI agents cite."""
    try:
        db = DB()
        from datetime import datetime, timedelta, timezone
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        rows = (db.client.table("citations").select("source_domain,cited_at")
                .gte("cited_at", since).limit(2000).execute().data or [])
        counts: dict[str, int] = {}
        total = 0
        for r in rows:
            d = r.get("source_domain") or ""
            if d:
                counts[d] = counts.get(d, 0) + 1
                total += 1
        top = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:12]
        return {
            "total": total,
            "days": days,
            "distribution": [{"domain": d, "count": c, "pct": round(100 * c / total, 1) if total else 0} for d, c in top],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])


@router.post("/citations/run")
async def run_citations(authorization: str = Header(default="")):
    """Manually run the daily citation watch (signed-in users only —
    real-model queries cost money)."""
    if not user_id_from_auth(authorization):
        raise HTTPException(status_code=401, detail="Sign in required")
    from app.services.citation_watch import run_citation_watch
    try:
        return await run_citation_watch()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])


@router.post("/regression/run")
async def run_regression(authorization: str = Header(default="")):
    """Manually run the recommendation-regression scan (signed-in users only)."""
    if not user_id_from_auth(authorization):
        raise HTTPException(status_code=401, detail="Sign in required")
    from app.services.regression_monitor import run_regression_monitor
    try:
        return await run_regression_monitor()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])


# ── AI Insights (daily one-call summary) ──

@router.get("/insights")
async def get_insight(shop: str = Query(...)):
    """Latest AI insight for a store."""
    try:
        rows = (DB().client.table("ai_insights").select("*").eq("shop", shop)
                .order("insight_date", desc=True).limit(1).execute().data or [])
        if not rows:
            return {"shop": shop, "insight": None}
        r = rows[0]
        return {"shop": shop, "insight": {"date": r["insight_date"], "content": r.get("content", "")}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])


@router.post("/insights/generate")
async def generate_insight_now(shop: str = Query(...), authorization: str = Header(default="")):
    """Generate today's insight now (signed-in users only — 1 cheap call)."""
    if not user_id_from_auth(authorization):
        raise HTTPException(status_code=401, detail="Sign in required")
    from app.services.insights import generate_insight
    try:
        return await generate_insight(shop)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])
