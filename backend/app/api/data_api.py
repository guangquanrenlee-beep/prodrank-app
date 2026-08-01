"""Data collection API — manual trigger + query collected questions."""

import os

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.data_collector import DataCollector
from app.services.db import DB

router = APIRouter()
collector = DataCollector()


class CollectRequest(BaseModel):
    category: str  # fashion | electronics | beauty | home


@router.post("/collect")
async def collect(req: CollectRequest):
    """Trigger a collection run for a category (Google/Reddit/YouTube/FAQ → cluster → save)."""
    try:
        result = await collector.collect_category(
            req.category,
            youtube_key=os.getenv("YOUTUBE_API_KEY", ""),
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/questions")
async def get_questions(category: str = Query(...), dimension: str = Query(default="")):
    """Query collected questions. category=fashion or fashion:Size."""
    try:
        db = DB()
        cat = category
        if dimension:
            cat = f"{category}:{dimension}"
        data = db.get_questions(cat, limit=200)
        return {"category": cat, "total": len(data), "questions": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dimensions")
async def get_dimensions(category: str = Query(...)):
    """Aggregate collected questions per dimension for a category."""
    try:
        from app.services.data_collector import CATEGORY_CONFIG
        cfg = CATEGORY_CONFIG.get(category, {})
        dims = cfg.get("dimensions", [])
        db = DB()
        out = []
        for d in dims:
            data = db.get_questions(f"{category}:{d}", limit=200)
            if data:
                out.append({"dimension": d, "count": len(data)})
        return {"category": category, "dimensions": out}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
