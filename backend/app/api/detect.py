"""CMS Detection + Verification API."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.cms_detector import CMSDetector
from app.services.ai_query import AIQueryService

router = APIRouter()
detector = CMSDetector()


class DetectRequest(BaseModel):
    domain: str


class VerifyRequest(BaseModel):
    product_name: str
    keyword: str
    brand: str = ""


@router.post("/cms")
async def detect_cms(req: DetectRequest):
    """Detect platform from domain and return recommended auth method."""
    try:
        result = await detector.detect(req.domain)
        return {
            "domain": result.domain,
            "platform": result.platform,
            "confidence": result.confidence,
            "markers": result.markers,
            "auth_method": result.auth_method,
            "recommended_action": result.recommended_action,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/verify")
async def verify_optimization(req: VerifyRequest):
    """Run a 'before' AI visibility check. The 'after' check runs later and the delta proves ROI.
    Returns a snapshot ID for later comparison."""
    import time
    import uuid

    ai = AIQueryService()
    report = await ai.query_all(req.product_name, req.keyword, req.brand)

    snapshot = {
        "snapshot_id": str(uuid.uuid4())[:8],
        "timestamp": time.time(),
        "product_name": req.product_name,
        "keyword": req.keyword,
        "brand": req.brand,
        "best_rank": report.best_rank,
        "mentioned_by": report.mentioned_by,
        "not_mentioned_by": report.not_mentioned_by,
        "agent_details": [
            {
                "agent": r.ai_agent,
                "rank": r.rank,
                "description": r.description,
                "sentiment": r.sentiment,
            }
            for r in report.results
        ],
    }

    return {
        "snapshot": snapshot,
        "instruction": (
            "This is your 'before' snapshot. Apply the recommended Schema/FAQ/Content fixes. "
            "Then call this endpoint again in 7 days with the same parameters. "
            "We'll compare the two snapshots and show you exactly what improved."
        ),
    }
