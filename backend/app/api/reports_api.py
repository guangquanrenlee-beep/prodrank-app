"""
Reports API — Weekly/daily report generation from score snapshots.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query, Request
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


def _parse_date(date_str: str):
    try:
        s = str(date_str).replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except Exception:
        return datetime.now(timezone.utc)


@router.get("/history")
async def report_history(request: Request, days: int = Query(default=90)):
    try:
        user_id = _get_user_id(request)
        if not user_id:
            return {"reports": [], "stats": {}}

        db = DB()
        sites = db.client.table("sites").select("domain,id").eq("user_id", user_id).execute().data or []
        if not sites:
            return {"reports": [], "stats": {}}

        domain = sites[0]["domain"]

        from_date = (datetime.now(timezone.utc) - __import__('datetime').timedelta(days=days)).strftime("%Y-%m-%d")
        raw = db.client.table("score_snapshots") \
            .select("snapshot_date,ai_visibility_score") \
            .eq("domain", domain) \
            .gte("snapshot_date", from_date) \
            .order("snapshot_date", desc=False) \
            .execute().data or []

        # Group by ISO week
        weeks: dict[str, list] = {}
        for s in raw:
            d = _parse_date(s.get("snapshot_date", ""))
            wk = d.strftime("%Y-W%W")
            if wk not in weeks:
                weeks[wk] = []
            weeks[wk].append(s)

        reports = []
        for wk in sorted(weeks.keys(), reverse=True):
            entries = weeks[wk]
            scores = [e["ai_visibility_score"] for e in entries]
            reports.append({
                "week": wk,
                "week_label": f"{entries[0]['snapshot_date']} to {entries[-1]['snapshot_date']}",
                "avg_score": round(sum(scores) / len(scores)),
                "high": max(scores),
                "low": min(scores),
                "sample_count": len(entries),
            })

        all_scores = [s["ai_visibility_score"] for s in raw]
        return {
            "domain": domain,
            "reports": reports,
            "snapshots": [{"date": s["snapshot_date"], "score": s["ai_visibility_score"]} for s in raw],
            "stats": {
                "total_scans": len(raw),
                "current_score": all_scores[-1] if all_scores else 0,
                "overall_change": all_scores[-1] - all_scores[0] if len(all_scores) >= 2 else 0,
                "avg_score": round(sum(all_scores) / len(all_scores)) if all_scores else 0,
                "best_score": max(all_scores) if all_scores else 0,
            },
        }
    except Exception as e:
        return {"reports": [], "stats": {}, "error": str(e)}


@router.get("/weekly")
async def weekly_report(request: Request):
    try:
        user_id = _get_user_id(request)
        if not user_id:
            return {"error": "Unauthorized"}

        db = DB()
        sites = db.client.table("sites").select("domain,id,score_data").eq("user_id", user_id).execute().data or []
        if not sites:
            return {"error": "No sites found"}

        domain = sites[0]["domain"]
        score_data = sites[0].get("score_data") or {}
        current_score = score_data.get("ai_visibility_score", 0) if isinstance(score_data, dict) else 0
        breakdown = score_data.get("breakdown", {}) if isinstance(score_data, dict) else {}

        # Last week avg
        week_ago = (datetime.now(timezone.utc) - __import__('datetime').timedelta(days=7)).strftime("%Y-%m-%d")
        two_weeks_ago = (datetime.now(timezone.utc) - __import__('datetime').timedelta(days=14)).strftime("%Y-%m-%d")
        last_week = db.client.table("score_snapshots") \
            .select("ai_visibility_score") \
            .eq("domain", domain) \
            .gte("snapshot_date", two_weeks_ago) \
            .lte("snapshot_date", week_ago) \
            .execute().data or []
        prev_avg = round(sum(s["ai_visibility_score"] for s in last_week) / len(last_week)) if last_week else None

        # This week
        this_week = db.client.table("score_snapshots") \
            .select("snapshot_date,ai_visibility_score") \
            .eq("domain", domain) \
            .gte("snapshot_date", week_ago) \
            .order("snapshot_date", desc=False) \
            .execute().data or []

        return {
            "domain": domain,
            "current_score": current_score,
            "previous_avg": prev_avg,
            "change": current_score - prev_avg if prev_avg else 0,
            "breakdown": breakdown,
            "this_week_snapshots": [{"date": s["snapshot_date"], "score": s["ai_visibility_score"]} for s in this_week],
            "competitors": [],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        return {"error": str(e)}


# ── Weekly Opportunity Report (feature 3) — SQL aggregates + LLM polish + email ──

class WeeklyReportRequest(BaseModel):
    shop: str
    email: str


@router.post("/reports/weekly")
async def weekly_report(req: WeeklyReportRequest):
    """Build + email the weekly report for one store (manual trigger/test)."""
    from app.services.weekly_report import send_weekly_report
    try:
        return await send_weekly_report(req.shop, req.email.strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])


@router.get("/reports/weekly/preview")
async def weekly_preview(shop: str = Query(...)):
    """Preview the weekly numbers without sending (debug)."""
    from app.services.weekly_report import collect_weekly_stats
    try:
        return {"shop": shop, "stats": collect_weekly_stats(shop)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])
