"""
Reports API — Weekly/daily report generation from score snapshots.
"""

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from app.services.db import DB

router = APIRouter()


def _get_user_id(request: Request) -> str | None:
    email = request.headers.get("X-User-Email", "")
    if not email:
        return None
    try:
        db = DB()
        user = db.client.rpc("get_user_id_by_email", {"p_email": email}).execute()
        if user.data:
            uid = user.data[0]
            return uid.get("id", uid) if isinstance(uid, dict) else str(uid)
    except Exception:
        pass
    return None


@router.get("/history")
async def report_history(request: Request, days: int = Query(default=90)):
    """Get score history aggregated by week for reports page."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"reports": [], "stats": {}}

    db = DB()
    sites = db.client.table("sites").select("domain,id").eq("user_id", user_id).execute().data or []
    if not sites:
        return {"reports": [], "stats": {}}

    domain = sites[0]["domain"]
    site_id = sites[0]["id"]

    snapshots = db.client.table("score_snapshots") \
        .select("snapshot_date,ai_visibility_score,label,breakdown") \
        .eq("domain", domain) \
        .gte("snapshot_date", f"now()-{days}d") \
        .order("snapshot_date", desc=False) \
        .execute().data or []

    # Group by ISO week
    weeks: dict[str, list[dict]] = {}
    for s in snapshots:
        try:
            date_str = str(s.get("snapshot_date", ""))
            if not date_str:
                continue
            date_str = date_str.replace("Z", "+00:00").replace("T", " ")
            d = datetime.fromisoformat(date_str)
        except (ValueError, TypeError):
            try:
                d = datetime.strptime(date_str[:10], "%Y-%m-%d")
            except Exception:
                continue
        wk = d.strftime("%Y-W%W")
        if wk not in weeks:
            weeks[wk] = []
        weeks[wk].append(s)

    reports = []
    for wk in sorted(weeks.keys(), reverse=True):
        entries = weeks[wk]
        scores = [e["ai_visibility_score"] for e in entries]
        avg = round(sum(scores) / len(scores))
        high = max(scores)
        low = min(scores)
        first_date = entries[0]["snapshot_date"]
        last_date = entries[-1]["snapshot_date"]
        # Get breakdown averages
        breakdowns = [e.get("breakdown", {}) for e in entries if e.get("breakdown")]
        avg_breakdown: dict = {}
        if breakdowns:
            for key in breakdowns[0]:
                vals = [b[key]["score"] for b in breakdowns if key in b and "score" in b[key]]
                if vals:
                    avg_breakdown[key] = round(sum(vals) / len(vals))
        reports.append({
            "week": wk,
            "week_label": f"{first_date} to {last_date}",
            "avg_score": avg,
            "high": high,
            "low": low,
            "sample_count": len(entries),
            "breakdown": avg_breakdown,
        })

    # Stats
    if snapshots:
        all_scores = [s["ai_visibility_score"] for s in snapshots]
        first_score = snapshots[0]["ai_visibility_score"]
        last_score = snapshots[-1]["ai_visibility_score"]
    else:
        all_scores = []
        first_score = 0
        last_score = 0

    return {
        "domain": domain,
        "reports": reports,
        "snapshots": [{"date": s["snapshot_date"], "score": s["ai_visibility_score"]} for s in snapshots],
        "stats": {
            "total_scans": len(snapshots),
            "current_score": last_score,
            "overall_change": last_score - first_score if snapshots else 0,
            "avg_score": round(sum(all_scores) / len(all_scores)) if all_scores else 0,
            "best_score": max(all_scores) if all_scores else 0,
            "data_from": snapshots[0]["snapshot_date"] if snapshots else "",
            "data_to": snapshots[-1]["snapshot_date"] if snapshots else "",
        },
    }


@router.get("/weekly")
async def weekly_report(request: Request):
    """Generate current week's report summary."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"error": "Unauthorized"}

    db = DB()
    sites = db.client.table("sites").select("domain,id,score_data").eq("user_id", user_id).execute().data or []
    if not sites:
        return {"error": "No sites found"}

    domain = sites[0]["domain"]
    score_data = sites[0].get("score_data") or {}
    current_score = score_data.get("ai_visibility_score", 0) if score_data else sites[0].get("ai_visibility_score", 0)
    breakdown = score_data.get("breakdown", {})

    # Get last week's average for comparison
    last_week = db.client.table("score_snapshots") \
        .select("ai_visibility_score") \
        .eq("domain", domain) \
        .gte("snapshot_date", "now()-14d") \
        .lte("snapshot_date", "now()-7d") \
        .execute().data or []
    prev_avg = round(sum(s["ai_visibility_score"] for s in last_week) / len(last_week)) if last_week else None

    # Top improvements this week
    this_week = db.client.table("score_snapshots") \
        .select("snapshot_date,ai_visibility_score") \
        .eq("domain", domain) \
        .gte("snapshot_date", "now()-7d") \
        .order("snapshot_date", desc=False) \
        .execute().data or []

    # Competitors (simple)
    competitors = []
    try:
        comp_data = db.client.table("competitors").select("*").eq("site_id", sites[0]["id"]).limit(5).execute().data
        if comp_data:
            competitors = [{"name": c.get("name", ""), "domain": c.get("domain", ""), "score": c.get("estimated_score", 0)} for c in comp_data]
    except Exception:
        pass

    return {
        "domain": domain,
        "current_score": current_score,
        "previous_avg": prev_avg,
        "change": current_score - prev_avg if prev_avg else 0,
        "breakdown": breakdown,
        "this_week_snapshots": [{"date": s["snapshot_date"], "score": s["ai_visibility_score"]} for s in this_week],
        "competitors": competitors,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
