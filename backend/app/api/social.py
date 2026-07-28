"""
Social Listening API — Reddit keyword monitoring, post discovery, and AI response drafting.

Endpoints:
  GET/POST /keywords      — Manage keyword sets
  PUT/DELETE /keywords/{id}
  POST /scan              — Trigger Reddit scan
  GET /posts              — List discovered posts
  GET /posts/{id}         — Post detail with response
  POST /posts/{id}/action — Take action (answer/ignore/forward)
  POST /posts/{id}/ai-draft — Generate AI response draft
  POST /posts/{id}/track  — Update tracking data
  GET /stats              — User stats
"""

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional

from app.core.rate_limit import check_free_limit
from app.services.db import DB

router = APIRouter()


# ── Request/Response Models ──

class KeywordSetCreate(BaseModel):
    brand_name: str = ""
    industry_keywords: list[str] = []
    brand_keywords: list[str] = []
    product_keywords: list[str] = []

class KeywordSetUpdate(BaseModel):
    brand_name: Optional[str] = None
    industry_keywords: Optional[list[str]] = None
    brand_keywords: Optional[list[str]] = None
    product_keywords: Optional[list[str]] = None
    is_active: Optional[bool] = None

class PostActionRequest(BaseModel):
    action: str  # 'answered' | 'ignored' | 'forwarded'
    response_text: str = ""
    forwarded_to: str = ""
    notes: str = ""

class AIDraftRequest(BaseModel):
    style: str = "helpful"  # 'helpful' | 'expert' | 'promotional' | 'casual'

class TrackUpdateRequest(BaseModel):
    upvotes: int = 0
    is_best_answer: bool = False
    reply_count: int = 0


# ── Helper ──

def _get_user_id(request: Request) -> str | None:
    email = request.headers.get("X-User-Email", "")
    if not email:
        return None
    try:
        db = DB()
        user = db.client.rpc("get_user_id_by_email", {"email": email}).execute()
        if user.data:
            uid = user.data[0]
            if isinstance(uid, dict):
                return str(uid.get("id", ""))
            return str(uid)
    except Exception:
        pass
    return None


# ── Keyword Management ──

@router.get("/keywords")
async def list_keywords(request: Request):
    """List all keyword sets for the current user."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"keywords": []}
    db = DB()
    data = db.client.table("social_keywords") \
        .select("*") \
        .eq("user_id", user_id) \
        .order("created_at", desc=True) \
        .execute().data or []
    return {"keywords": data}


@router.post("/keywords")
async def create_keywords(req: KeywordSetCreate, request: Request):
    """Create a new keyword set for social listening."""
    user_id = _get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    db = DB()
    result = db.client.table("social_keywords").insert({
        "user_id": user_id,
        "brand_name": req.brand_name,
        "industry_keywords": req.industry_keywords,
        "brand_keywords": req.brand_keywords,
        "product_keywords": req.product_keywords,
    }).execute()
    return {"keyword_set": result.data[0] if result.data else None}


@router.put("/keywords/{keyword_id}")
async def update_keywords(keyword_id: str, req: KeywordSetUpdate, request: Request):
    """Update an existing keyword set."""
    db = DB()
    updates = {}
    if req.brand_name is not None:
        updates["brand_name"] = req.brand_name
    if req.industry_keywords is not None:
        updates["industry_keywords"] = req.industry_keywords
    if req.brand_keywords is not None:
        updates["brand_keywords"] = req.brand_keywords
    if req.product_keywords is not None:
        updates["product_keywords"] = req.product_keywords
    if req.is_active is not None:
        updates["is_active"] = req.is_active
    if not updates:
        return {"keyword_set": None}
    result = db.client.table("social_keywords") \
        .update(updates) \
        .eq("id", keyword_id) \
        .execute()
    return {"keyword_set": result.data[0] if result.data else None}


@router.delete("/keywords/{keyword_id}")
async def delete_keywords(keyword_id: str):
    """Delete a keyword set."""
    db = DB()
    db.client.table("social_keywords").delete().eq("id", keyword_id).execute()
    return {"deleted": True}


# ── Post Discovery ──

@router.post("/scan")
async def trigger_scan(request: Request):
    """Trigger Reddit scan for all active keyword sets of the current user."""
    user_id = _get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    check_free_limit(request)

    from app.services.social_listener import SocialListener
    listener = SocialListener()
    email = request.headers.get("X-User-Email", "")
    results = await listener.scan_reddit_for_user(email)
    return {"scanned": True, "posts_found": len(results), "posts": results[:50]}


@router.get("/posts")
async def list_posts(
    request: Request,
    status: str = Query("all"),
    source: str = Query("reddit"),
    limit: int = Query(50),
    offset: int = Query(0),
):
    """List discovered posts with optional status filter."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"posts": [], "total": 0}
    db = DB()

    query = db.client.table("social_posts") \
        .select("*", count="exact") \
        .eq("user_id", user_id) \
        .eq("source", source) \
        .eq("is_ad", False) \
        .order("posted_at", desc=True) \
        .limit(limit) \
        .offset(offset)

    result = query.execute()
    posts = result.data or []

    # Enrich with response status
    if posts:
        post_ids = [p["id"] for p in posts]
        responses = db.client.table("social_responses") \
            .select("post_id,action,ai_draft,response_text") \
            .in_("post_id", post_ids) \
            .execute().data or []
        resp_map = {r["post_id"]: r for r in responses}

        for p in posts:
            r = resp_map.get(p["id"])
            p["response"] = r

        # Filter by status if needed
        if status == "pending":
            posts = [p for p in posts if not p.get("response") or p["response"]["action"] == "pending"]
        elif status == "answered":
            posts = [p for p in posts if p.get("response") and p["response"]["action"] == "answered"]
        elif status == "ignored":
            posts = [p for p in posts if p.get("response") and p["response"]["action"] == "ignored"]

    return {"posts": posts, "total": result.count or 0}


@router.get("/posts/{post_id}")
async def get_post(post_id: str):
    """Get full post detail with existing response and tracking."""
    db = DB()
    post = db.client.table("social_posts").select("*").eq("id", post_id).execute().data
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    response = db.client.table("social_responses") \
        .select("*") \
        .eq("post_id", post_id) \
        .execute().data or []

    tracking = None
    if response:
        tracking = db.client.table("social_tracking") \
            .select("*") \
            .eq("response_id", response[0]["id"]) \
            .execute().data

    return {
        "post": post[0],
        "response": response[0] if response else None,
        "tracking": tracking[0] if tracking else None,
    }


# ── User Actions ──

@router.post("/posts/{post_id}/action")
async def take_action(post_id: str, req: PostActionRequest, request: Request):
    """Mark action on a post: answered / ignored / forwarded."""
    user_id = _get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    db = DB()

    existing = db.client.table("social_responses") \
        .select("id") \
        .eq("post_id", post_id) \
        .eq("user_id", user_id) \
        .execute().data

    data = {
        "user_id": user_id,
        "post_id": post_id,
        "action": req.action,
        "response_text": req.response_text,
        "forwarded_to": req.forwarded_to,
        "notes": req.notes,
        "updated_at": "now()",
    }

    if existing:
        result = db.client.table("social_responses") \
            .update(data) \
            .eq("id", existing[0]["id"]) \
            .execute()
    else:
        result = db.client.table("social_responses").insert(data).execute()

    return {"response": result.data[0] if result.data else None}


@router.post("/posts/{post_id}/ai-draft")
async def generate_ai_draft(post_id: str, req: AIDraftRequest, request: Request):
    """Generate AI draft response for a Reddit post."""
    user_id = _get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    db = DB()

    post = db.client.table("social_posts").select("*").eq("id", post_id).execute().data
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post_data = post[0]

    from app.services.social_listener import SocialListener
    listener = SocialListener()
    draft = await listener.generate_draft(post_data, req.style)

    if draft.get("error"):
        return {"draft": "", "error": draft["error"]}

    # Save draft to response record
    existing = db.client.table("social_responses") \
        .select("id") \
        .eq("post_id", post_id) \
        .eq("user_id", user_id) \
        .execute().data

    data = {
        "user_id": user_id,
        "post_id": post_id,
        "action": "ai_draft",
        "ai_draft": draft["text"],
        "ai_model_used": draft.get("model", ""),
        "updated_at": "now()",
    }

    if existing:
        result = db.client.table("social_responses") \
            .update(data) \
            .eq("id", existing[0]["id"]) \
            .execute()
    else:
        result = db.client.table("social_responses").insert(data).execute()

    return {
        "draft": draft["text"],
        "model": draft.get("model", ""),
        "response_id": result.data[0]["id"] if result.data else "",
    }


# ── Tracking ──

@router.post("/posts/{post_id}/track")
async def update_tracking(post_id: str, req: TrackUpdateRequest):
    """Update tracking data for a responded post."""
    db = DB()
    response = db.client.table("social_responses") \
        .select("id") \
        .eq("post_id", post_id) \
        .execute().data
    if not response:
        raise HTTPException(status_code=404, detail="No response found for this post")

    existing = db.client.table("social_tracking") \
        .select("id") \
        .eq("response_id", response[0]["id"]) \
        .execute().data

    data = {
        "upvotes": req.upvotes,
        "is_best_answer": req.is_best_answer,
        "reply_count": req.reply_count,
        "updated_at": "now()",
    }

    if existing:
        result = db.client.table("social_tracking") \
            .update(data) \
            .eq("id", existing[0]["id"]) \
            .execute()
    else:
        data["response_id"] = response[0]["id"]
        data["user_id"] = response[0].get("user_id", "")
        result = db.client.table("social_tracking").insert(data).execute()

    return {"tracking": result.data[0] if result.data else None}


# ── Stats ──

@router.get("/stats")
async def get_social_stats(request: Request):
    """Get aggregate social listening stats for the current user."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"stats": {}}
    db = DB()

    total = db.client.table("social_posts") \
        .select("id", count="exact") \
        .eq("user_id", user_id) \
        .eq("is_ad", False) \
        .execute().count or 0

    pending = db.client.table("social_responses") \
        .select("id", count="exact") \
        .eq("user_id", user_id) \
        .eq("action", "pending") \
        .execute().count or 0

    answered = db.client.table("social_responses") \
        .select("id", count="exact") \
        .eq("user_id", user_id) \
        .eq("action", "answered") \
        .execute().count or 0

    ai_drafts = db.client.table("social_responses") \
        .select("id", count="exact") \
        .eq("user_id", user_id) \
        .eq("action", "ai_draft") \
        .execute().count or 0

    keyword_sets = db.client.table("social_keywords") \
        .select("id", count="exact") \
        .eq("user_id", user_id) \
        .execute().count or 0

    return {
        "stats": {
            "total_posts": total,
            "pending": pending,
            "answered": answered,
            "ai_drafts": ai_drafts,
            "keyword_sets": keyword_sets,
        }
    }
