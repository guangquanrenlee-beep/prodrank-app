"""
Citation Source Marketplace API — Discover sources, manage outreach pipeline,
generate AI pitches, and track follow-ups.

Endpoints:
  POST /discover             — Discover new sources from Citation data
  GET /sources               — List sources with filters
  GET /sources/{id}          — Source detail with outreach + pitches
  POST /sources/{id}/action  — Update outreach status
  POST /sources/{id}/pitch   — Generate AI pitch
  GET /sources/{id}/pitches  — List pitches for a source
  GET /follow-ups            — List overdue follow-ups
  POST /follow-ups/{id}/complete — Mark follow-up complete
  GET /feed-stats            — Stats for dashboard integration
"""

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional

from app.core.rate_limit import check_free_limit
from app.services.db import DB

router = APIRouter()


# ── Models ──

class DiscoverRequest(BaseModel):
    category: str = ""

class SourceActionRequest(BaseModel):
    status: str  # 'interested' | 'contacted' | 'replied' | 'success' | 'declined'
    notes: str = ""

class PitchRequest(BaseModel):
    style: str = "professional"  # 'professional' | 'casual' | 'value-first' | 'partnership'

class FollowUpCompleteRequest(BaseModel):
    notes: str = ""


# ── Helper ──

def _get_user_id(request: Request) -> str | None:
    email = request.headers.get("X-User-Email", "")
    if not email:
        return None
    try:
        db = DB()
        user = db.client.rpc("get_user_id_by_email", {"p_email": email}).execute()
        if user.data:
            uid = user.data[0]
            if isinstance(uid, dict):
                return str(uid.get("id", ""))
            return str(uid)
    except Exception:
        pass
    return None


# ── Source Discovery ──

@router.post("/discover")
async def discover_sources(req: DiscoverRequest, request: Request):
    """Discover sources from Citation Intelligence data.
    Finds sources that AI agents cite — potential places to earn mentions."""
    user_id = _get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    check_free_limit(request)

    from app.services.source_marketplace import SourceMarketplace
    marketplace = SourceMarketplace()
    email = request.headers.get("X-User-Email", "")
    results = await marketplace.discover_sources(email, req.category)
    return {"sources_discovered": len(results), "sources": results}


@router.get("/sources")
async def list_sources(
    request: Request,
    status: str = Query("all"),
    source_type: str = Query(""),
    limit: int = Query(50),
    offset: int = Query(0),
):
    """List marketplace sources with optional filters."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"sources": [], "total": 0}
    db = DB()

    query = db.client.table("marketplace_sources") \
        .select("*", count="exact") \
        .eq("user_id", user_id) \
        .order("relevance_score", desc=True) \
        .limit(limit) \
        .offset(offset)

    if source_type:
        query = query.eq("source_type", source_type)

    result = query.execute()
    sources = result.data or []

    # Enrich with outreach status
    if sources:
        source_ids = [s["id"] for s in sources]
        outreach_data = db.client.table("marketplace_outreach") \
            .select("*") \
            .in_("source_id", source_ids) \
            .execute().data or []
        outreach_map = {o["source_id"]: o for o in outreach_data}

        for s in sources:
            s["outreach"] = outreach_map.get(s["id"])

        # Filter by status
        if status != "all":
            sources = [
                s for s in sources
                if s.get("outreach") and s["outreach"]["status"] == status
            ]

    return {"sources": sources, "total": result.count or 0}


@router.get("/sources/{source_id}")
async def get_source(source_id: str):
    """Get full source detail with outreach and pitches."""
    db = DB()
    source = db.client.table("marketplace_sources").select("*").eq("id", source_id).execute().data
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    outreach = db.client.table("marketplace_outreach") \
        .select("*") \
        .eq("source_id", source_id) \
        .execute().data or []

    pitches = db.client.table("marketplace_pitches") \
        .select("*") \
        .eq("source_id", source_id) \
        .order("created_at", desc=True) \
        .execute().data or []

    return {
        "source": source[0],
        "outreach": outreach[0] if outreach else None,
        "pitches": pitches,
    }


# ── Outreach Actions ──

@router.post("/sources/{source_id}/action")
async def update_source_status(source_id: str, req: SourceActionRequest, request: Request):
    """Update outreach status for a source. Auto-creates follow-up if contacted."""
    user_id = _get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    db = DB()

    existing = db.client.table("marketplace_outreach") \
        .select("id") \
        .eq("source_id", source_id) \
        .eq("user_id", user_id) \
        .execute().data

    data = {"status": req.status, "notes": req.notes, "updated_at": "now()"}
    now_field = {
        "contacted": "contacted_at",
        "replied": "replied_at",
        "success": "success_at",
    }.get(req.status, "")
    if now_field:
        data[now_field] = "now()"

    if existing:
        result = db.client.table("marketplace_outreach") \
            .update(data) \
            .eq("id", existing[0]["id"]) \
            .execute()
        outreach_id = existing[0]["id"]
    else:
        data["user_id"] = user_id
        data["source_id"] = source_id
        result = db.client.table("marketplace_outreach").insert(data).execute()
        outreach_id = result.data[0]["id"] if result.data else ""

    # Auto-create follow-up if contacted
    if req.status == "contacted" and outreach_id:
        existing_fu = db.client.table("marketplace_follow_ups") \
            .select("id") \
            .eq("outreach_id", outreach_id) \
            .eq("completed", False) \
            .execute().data
        if not existing_fu:
            from datetime import datetime, timedelta, timezone
            due = datetime.now(timezone.utc) + timedelta(days=7)
            db.client.table("marketplace_follow_ups").insert({
                "user_id": user_id,
                "outreach_id": outreach_id,
                "due_at": due.isoformat(),
            }).execute()

    return {"outreach": result.data[0] if result.data else None}


# ── Pitch Generation ──

@router.post("/sources/{source_id}/pitch")
async def generate_pitch(source_id: str, req: PitchRequest, request: Request):
    """AI-generate a customized outreach pitch for this source."""
    user_id = _get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    from app.services.source_marketplace import SourceMarketplace
    marketplace = SourceMarketplace()
    email = request.headers.get("X-User-Email", "")
    result = await marketplace.generate_pitch(email, source_id, req.style)
    if not result or result.get("error"):
        raise HTTPException(status_code=500, detail=result.get("error", "Pitch generation failed"))
    return result


@router.get("/sources/{source_id}/pitches")
async def list_pitches(source_id: str):
    """List all generated pitches for a source."""
    db = DB()
    pitches = db.client.table("marketplace_pitches") \
        .select("*") \
        .eq("source_id", source_id) \
        .order("created_at", desc=True) \
        .execute().data or []
    return {"pitches": pitches}


# ── Follow-ups ──

@router.get("/follow-ups")
async def list_follow_ups(request: Request):
    """List sources needing follow-up (7 days past contact, not yet completed)."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"follow_ups": []}
    db = DB()

    # Get all incomplete follow-ups due now or earlier
    due = db.client.table("marketplace_follow_ups") \
        .select("*, marketplace_outreach!inner(source_id)") \
        .eq("user_id", user_id) \
        .eq("completed", False) \
        .lte("due_at", "now()") \
        .execute().data or []

    # Enrich with source info
    enriched = []
    for fu in due:
        outreach = fu.get("marketplace_outreach", {})
        source_id = outreach.get("source_id", "")
        if source_id:
            source = db.client.table("marketplace_sources") \
                .select("domain,name,url") \
                .eq("id", source_id) \
                .execute().data
            if source:
                fu["source"] = source[0]
        enriched.append(fu)

    return {"follow_ups": enriched}


@router.post("/follow-ups/{follow_up_id}/complete")
async def complete_follow_up(follow_up_id: str, req: FollowUpCompleteRequest):
    """Mark a follow-up as completed."""
    db = DB()
    db.client.table("marketplace_follow_ups") \
        .update({"completed": True, "completed_at": "now()", "notes": req.notes}) \
        .eq("id", follow_up_id) \
        .execute()
    return {"completed": True}


# ── Stats ──

@router.get("/feed-stats")
async def get_feed_stats(request: Request):
    """Return marketplace stats for dashboard and score integration."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"stats": {}}
    db = DB()

    discovered = db.client.table("marketplace_sources") \
        .select("id", count="exact") \
        .eq("user_id", user_id) \
        .execute().count or 0

    contacted = db.client.table("marketplace_outreach") \
        .select("id", count="exact") \
        .eq("user_id", user_id) \
        .eq("status", "contacted") \
        .execute().count or 0

    success = db.client.table("marketplace_outreach") \
        .select("id", count="exact") \
        .eq("user_id", user_id) \
        .eq("status", "success") \
        .execute().count or 0

    pending_fu = db.client.table("marketplace_follow_ups") \
        .select("id", count="exact") \
        .eq("user_id", user_id) \
        .eq("completed", False) \
        .execute().count or 0

    return {
        "stats": {
            "discovered": discovered,
            "contacted": contacted,
            "success": success,
            "pending_follow_ups": pending_fu,
        }
    }
