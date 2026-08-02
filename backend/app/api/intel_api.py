"""Citation Watch + Regression Monitor API (features 5+7)."""

from fastapi import APIRouter, HTTPException, Query

from app.services.db import DB

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
async def run_citations():
    """Manually run the daily citation watch (real-model queries)."""
    from app.services.citation_watch import run_citation_watch
    try:
        return await run_citation_watch()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])


@router.post("/regression/run")
async def run_regression():
    """Manually run the recommendation-regression scan."""
    from app.services.regression_monitor import run_regression_monitor
    try:
        return await run_regression_monitor()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])
