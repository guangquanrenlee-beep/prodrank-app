"""Competitor Watch API — add/manage competitors, snapshot + diff."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.db import DB

router = APIRouter()


class CompetitorAddRequest(BaseModel):
    shop: str
    domain: str
    name: str = ""


class CompetitorSnapshotRequest(BaseModel):
    competitor_id: str


@router.post("/competitors")
async def add_competitor(req: CompetitorAddRequest):
    """Add a competitor to watch (nike.com etc.)."""
    domain = req.domain.strip().lower().replace("https://", "").replace("http://", "").rstrip("/")
    domain = domain.split("/")[0]
    if not domain:
        raise HTTPException(status_code=400, detail="Invalid domain")
    try:
        c = DB().save_competitor(req.shop, domain, req.name.strip())
        return {"status": "added", "competitor": c}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])


@router.get("/competitors")
async def list_competitors(shop: str = Query(...)):
    """List competitors for a store, with latest snapshot date + change count."""
    try:
        db = DB()
        competitors = db.get_competitors(shop)
        out = []
        for c in competitors:
            snaps = db.get_competitor_snapshots(c["id"], limit=2)
            out.append({
                "id": c["id"], "name": c.get("name", ""), "domain": c.get("domain", ""),
                "status": c.get("status", "active"),
                "last_snapshot": snaps[-1]["snapshot_date"] if snaps else None,
                "pages": snaps[-1].get("product_count", 0) if snaps else 0,
            })
        return {"shop": shop, "competitors": out}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])


@router.post("/competitors/snapshot")
async def snapshot(req: CompetitorSnapshotRequest):
    """Crawl + snapshot one competitor now (diff vs yesterday → alerts)."""
    from app.services.competitor_watch import snapshot_competitor
    try:
        db = DB()
        rows = db.client.table("competitors").select("*").eq("id", req.competitor_id).limit(1).execute().data
        if not rows:
            raise HTTPException(status_code=404, detail="Competitor not found")
        return await snapshot_competitor(rows[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])


@router.post("/competitors/run")
async def run_all():
    """Snapshot every active competitor (daily job + manual trigger)."""
    from app.services.competitor_watch import run_competitor_watch
    try:
        return await run_competitor_watch()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])


@router.delete("/competitors/{competitor_id}")
async def remove_competitor(competitor_id: str):
    try:
        DB().delete_competitor(competitor_id)
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])
