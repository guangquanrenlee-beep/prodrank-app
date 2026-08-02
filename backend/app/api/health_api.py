"""Health Check API — daily snapshots, regression diffs, alerts feed."""

from fastapi import APIRouter, Header, HTTPException, Query

from app.services.db import DB
from app.services.auth import user_id_from_auth

router = APIRouter()


@router.get("/health-check")
async def health_check(domain: str = Query(...), days: int = Query(default=14, ge=1, le=60)):
    """Recent daily health snapshots for a store (score trend + diffs)."""
    try:
        db = DB()
        snapshots = db.get_health_snapshots(domain, limit=days)
        trend = [{"date": s["snapshot_date"], "score": s.get("score", 0),
                  "product_count": s.get("product_count", 0)} for s in snapshots]
        delta = None
        summary = "No data yet"
        if len(trend) >= 2:
            delta = trend[-1]["score"] - trend[-2]["score"]
        latest = snapshots[-1] if snapshots else None
        if latest and len(snapshots) >= 2:
            prev = snapshots[-2]
            from app.services.health_check import diff_snapshots, summarize_diff
            changes = diff_snapshots(prev.get("details") or {}, latest.get("details") or {})
            summary = summarize_diff(changes)
        return {"domain": domain, "trend": trend, "delta": delta, "summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])


@router.get("/alerts")
async def alerts(domain: str = Query(...), limit: int = Query(default=20, ge=1, le=50)):
    """Recent alerts for a store (event-driven warnings)."""
    try:
        return {"domain": domain, "alerts": DB().get_alerts(domain, limit)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])


@router.post("/health-check/run")
async def run_now(authorization: str = Header(default="")):
    """Manually trigger the daily health check (signed-in users only —
    it crawls every connected store, so anonymous triggers are a cost risk)."""
    if not user_id_from_auth(authorization):
        raise HTTPException(status_code=401, detail="Sign in required")
    from app.services.health_check import run_daily_health_check
    try:
        return await run_daily_health_check()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])
