"""Scan API — page pre-scan: what info already exists before generation."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.field_scanner import scan_fields

router = APIRouter()


class ScanRequest(BaseModel):
    url: str


@router.post("/scan")
async def scan(req: ScanRequest):
    """Fetch a product page and classify knowledge-template fields:
    found / fuzzy / missing. The merchant reviews this list and only
    generates the missing + fuzzy fields (skip_fields on generate)."""
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        return await scan_fields(url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Scan failed: {str(e)[:150]}")
