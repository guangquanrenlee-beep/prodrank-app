"""Email API — Preferences and weekly report triggers."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


class EmailPrefsRequest(BaseModel):
    weekly_report_enabled: bool = True
    competitor_alerts_enabled: bool = True
    score_drop_alerts_enabled: bool = True


@router.get("/preferences")
async def get_email_preferences(request: Request):
    """Get email notification preferences for current user."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"weekly_report_enabled": True, "competitor_alerts_enabled": True, "score_drop_alerts_enabled": True}

    try:
        from app.services.db import DB
        db = DB()
        data = db.client.table("email_preferences").select("*").eq("user_id", user_id).execute().data
        if data:
            p = data[0]
            return {
                "email": p.get("email", ""),
                "weekly_report_enabled": p.get("weekly_report_enabled", True),
                "competitor_alerts_enabled": p.get("competitor_alerts_enabled", True),
                "score_drop_alerts_enabled": p.get("score_drop_alerts_enabled", True),
                "last_sent_at": p.get("last_sent_at"),
            }
    except Exception:
        pass
    return {"weekly_report_enabled": True, "competitor_alerts_enabled": True, "score_drop_alerts_enabled": True}


@router.post("/preferences")
async def update_email_preferences(req: EmailPrefsRequest, request: Request):
    """Update email notification preferences."""
    user_id = _get_user_id(request)
    email = _get_user_email(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    from datetime import datetime, timezone
    try:
        from app.services.db import DB
        db = DB()
        db.client.table("email_preferences").upsert({
            "user_id": user_id,
            "email": email,
            "weekly_report_enabled": req.weekly_report_enabled,
            "competitor_alerts_enabled": req.competitor_alerts_enabled,
            "score_drop_alerts_enabled": req.score_drop_alerts_enabled,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="user_id").execute()
        return {"status": "saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/send-weekly")
async def trigger_weekly_report(request: Request):
    """Manually trigger the weekly report for the current user (test/dev)."""
    user_id = _get_user_id(request)
    email = _get_user_email(request)
    if not user_id or not email:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        from app.services.db import DB
        from app.services.email_service import email_service
        db = DB()

        # Get user's sites
        sites = db.client.table("sites").select("*").eq("user_id", user_id).execute().data or []
        if not sites:
            return {"status": "no_sites", "message": "Analyze at least one site first"}

        site = sites[0]
        domain = site["domain"]
        current_score = site.get("ai_visibility_score", 0)
        score_data = site.get("score_data", {}) or {}
        breakdown = score_data.get("breakdown", {})

        # Get last score for comparison
        snapshots = db.client.table("score_snapshots") \
            .select("ai_visibility_score") \
            .eq("domain", domain) \
            .order("snapshot_date", desc=True) \
            .limit(2) \
            .execute().data or []
        previous_score = snapshots[1]["ai_visibility_score"] if len(snapshots) >= 2 else None

        # Get competitor data (simple version)
        competitors = []
        try:
            import httpx, json
            from bs4 import BeautifulSoup
            # Quick competitor detection via AI
            from app.services.llm import get_content_client
            client, _model = get_content_client()
            resp = await client.chat.completions.create(
                model=_model,
                messages=[{"role": "user", "content": f"List 3 competitors of {domain}. Return JSON array: [{{\"name\":\"...\",\"domain\":\"...\"}}]"}],
                temperature=0.3, max_tokens=400, timeout=10.0,
            )
            comps = json.loads(resp.choices[0].message.content)
            for c in (comps or [])[:3]:
                try:
                    cr = httpx.get(f"https://{c['domain']}", headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=True, timeout=8)
                    soup = BeautifulSoup(cr.text, "lxml")
                    competitors.append({
                        "name": c.get("name", c["domain"]),
                        "domain": c["domain"],
                        "estimated_score": min(80, 10 + len(soup.get_text().split()) // 20),
                        "has_software_schema": "SoftwareApplication" in cr.text,
                    })
                except Exception:
                    competitors.append({"name": c.get("name", c["domain"]), "domain": c["domain"], "estimated_score": 0})
        except Exception:
            pass

        # Build alerts
        alerts = []
        if current_score < 40:
            alerts.append(f"Score critically low at {current_score} — focus on schema and content")
        if breakdown:
            for k, v in breakdown.items():
                s = v.get("score", 0) if isinstance(v, dict) else v
                if s < 20:
                    alerts.append(f"{k.replace('_',' ')} is critically low at {s}/100")

        success = await email_service.send_weekly_report(
            to=email,
            domain=domain,
            current_score=current_score,
            previous_score=previous_score,
            breakdown=breakdown,
            alerts=alerts,
            competitors=competitors,
        )

        if success:
            # Update last_sent_at
            from datetime import datetime, timezone
            db.client.table("email_preferences").update({
                "last_sent_at": datetime.now(timezone.utc).isoformat(),
            }).eq("user_id", user_id).execute()

        return {"status": "sent" if success else "failed", "email": email, "domain": domain, "score": current_score}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _get_user_id(request: Request) -> str | None:
    """Extract user ID from request context (set by middleware or header)."""
    email = request.headers.get("X-User-Email", "")
    if email:
        try:
            from app.services.db import DB
            db = DB()
            # Method 1: Try RPC (requires migration 007)
            data = db.client.rpc("get_user_id_by_email", {"p_email": email}).execute()
            user_id = (data.data or [None])[0]
            if isinstance(user_id, dict):
                user_id = user_id.get("id") or user_id.get("user_id")
            if user_id:
                return str(user_id)
        except Exception:
            pass

        try:
            # Method 2: Try Supabase Auth Admin API (uses service_role key)
            from app.services.db import DB
            db = DB()
            auth_resp = db.client.auth.admin.list_users(page=1, per_page=50)
            if auth_resp and hasattr(auth_resp, 'users'):
                for u in auth_resp.users:
                    if u.email == email:
                        return u.id
        except Exception:
            pass
    return None


def _get_user_email(request: Request) -> str:
    return request.headers.get("X-User-Email", "")
