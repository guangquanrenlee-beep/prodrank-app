"""
Readiness API — public homepage diagnostic (three-tier scan).

POST /api/readiness/scan  {url} → ok | partial | blocked | error

Public endpoint (homepage hero). Rate-limited per IP to prevent abuse.
"""

import time

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.services.readiness_engine import readiness_scan

router = APIRouter()

# Simple per-IP rate limit: 5 scans / 10 min (public, no auth)
_LIMITS: dict[str, list[float]] = {}
_WINDOW = 600
_MAX = 5


def _rate_limited(ip: str) -> bool:
    now = time.time()
    hits = [t for t in _LIMITS.get(ip, []) if now - t < _WINDOW]
    _LIMITS[ip] = hits
    if len(hits) >= _MAX:
        return True
    hits.append(now)
    _LIMITS[ip] = hits
    return False


class ReadinessRequest(BaseModel):
    url: str


@router.post("/scan")
async def scan(req: ReadinessRequest, request: Request):
    """Three-tier AI-readiness diagnostic for a store/product URL.

    ok      — page readable, full readiness score + gaps
    partial — readable but robots.txt blocks some AI crawlers
    blocked — Cloudflare-protected (AI crawlers likely blocked too — the diagnosis)
    """
    url = req.url.strip()
    if not url:
        raise HTTPException(400, "url is required")

    ip = request.client.host if request.client else "unknown"
    if _rate_limited(ip):
        raise HTTPException(429, "Too many scans — try again in a few minutes.")

    return await readiness_scan(url)
