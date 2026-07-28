"""
Knowledge Base API — Upload product materials and extract structured knowledge via AI.
Supports CSV, PDF, images, YouTube links.
"""

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional

from app.core.rate_limit import check_free_limit
from app.services.db import DB

router = APIRouter()


class YouTubeRequest(BaseModel):
    url: str
    site_id: str = ""


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


@router.post("/upload")
async def upload_knowledge(
    request: Request,
    file: UploadFile = File(None),
    youtube_url: str = Form(default=""),
    site_id: str = Form(default=""),
):
    """Upload a file (CSV/PDF/image) or YouTube link for AI knowledge extraction."""
    user_id = _get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    check_free_limit(request)

    from app.services.knowledge_engine import KnowledgeEngine
    engine = KnowledgeEngine()

    # Auto-detect site if not provided
    if not site_id:
        db = DB()
        sites = db.client.table("sites").select("id").eq("user_id", user_id).limit(1).execute().data
        if sites:
            site_id = sites[0]["id"]

    results = []

    # YouTube link
    if youtube_url:
        results = await engine.process_youtube(user_id, site_id, youtube_url)
        return {"processed": True, "source_type": "youtube", "entries": len(results), "results": results}

    # File upload
    if file:
        filename = file.filename or "upload"
        content = await file.read()

        if filename.lower().endswith(".csv"):
            results = await engine.process_csv(user_id, site_id, filename, content)
        elif filename.lower().endswith(".pdf"):
            results = await engine.process_pdf(user_id, site_id, filename, content)
        elif filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
            results = await engine.process_image(user_id, site_id, filename, content)
        else:
            # Treat as text
            text = content.decode("utf-8", errors="replace")
            from app.services.knowledge_engine import KnowledgeEngine
            results = await engine._extract_from_text(user_id, site_id, text, filename, "file")

        return {"processed": True, "source_type": filename.split(".")[-1], "filename": filename, "entries": len(results), "results": results}

    raise HTTPException(status_code=400, detail="No file or YouTube URL provided")


@router.post("/youtube")
async def add_youtube(req: YouTubeRequest, request: Request):
    """Add YouTube video for knowledge extraction."""
    user_id = _get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    check_free_limit(request)

    from app.services.knowledge_engine import KnowledgeEngine
    engine = KnowledgeEngine()

    sid = req.site_id
    if not sid:
        db = DB()
        sites = db.client.table("sites").select("id").eq("user_id", user_id).limit(1).execute().data
        if sites:
            sid = sites[0]["id"]

    results = await engine.process_youtube(user_id, sid, req.url)
    return {"processed": True, "source_type": "youtube", "entries": len(results), "results": results}


@router.get("/entries")
async def list_entries(request: Request, site_id: str = "", limit: int = 100):
    """List knowledge base entries for the current user."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"entries": [], "stats": {}}
    db = DB()

    query = db.client.table("knowledge_base").select("*").eq("user_id", user_id).eq("status", "active").order("created_at", desc=True).limit(limit)
    if site_id:
        query = query.eq("site_id", site_id)
    data = query.execute().data or []

    # Stats
    types = set(e.get("entity_type", "") for e in data)
    by_source: dict[str, int] = {}
    for e in data:
        s = e.get("source_type", "unknown")
        by_source[s] = by_source.get(s, 0) + 1

    return {
        "entries": data,
        "stats": {
            "total": len(data),
            "unique_types": len(types),
            "by_source": by_source,
        },
    }


@router.delete("/entries/{entry_id}")
async def delete_entry(entry_id: str):
    """Soft-delete a knowledge entry."""
    db = DB()
    db.client.table("knowledge_base").update({"status": "deleted", "updated_at": "now()"}).eq("id", entry_id).execute()
    return {"deleted": True}


@router.get("/stats")
async def get_knowledge_stats(request: Request):
    """Get knowledge base stats for scoring integration."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"stats": {"total_entries": 0, "unique_types": 0}}
    from app.services.knowledge_engine import KnowledgeEngine
    engine = KnowledgeEngine()
    return {"stats": engine.get_knowledge_stats(user_id)}
