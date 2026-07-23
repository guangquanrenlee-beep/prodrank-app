"""Actionable guidance API — next steps for every detected issue."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.guidance import GuidanceEngine
from app.services.schema_detector import SchemaDetector
from app.services.ai_query import AIQueryService

router = APIRouter()
engine = GuidanceEngine()
detector = SchemaDetector()


class GuidanceRequest(BaseModel):
    url: str
    product_name: str = ""
    keyword: str = ""
    brand: str = ""


@router.post("/next-steps")
async def get_next_steps(req: GuidanceRequest):
    """Get a prioritized action plan for a product page.
    For each issue: what's wrong → severity → can we auto-fix? → concrete steps → effort → impact → workaround."""
    try:
        # 1. Audit
        audit = await detector.audit_product(req.url)

        # 2. Optional rank check
        rank_data = None
        if req.keyword and req.product_name:
            try:
                ai = AIQueryService()
                report = await ai.query_chatgpt(req.product_name, req.keyword, req.brand)
                rank_data = {
                    "mentioned_by": [report.ai_agent] if report.rank else [],
                    "not_mentioned_by": [],
                    "best_rank": report.rank,
                }
            except Exception:
                pass

        # 3. Build action plan
        audit_dict = {
            "has_product_schema": audit.has_product_schema,
            "has_faq_schema": audit.has_faq_schema,
            "schema_fields": [
                {"field": f.field, "present": f.present, "value": f.value, "note": f.note}
                for f in audit.schema_fields
            ],
            "content_issues": audit.content_issues,
            "content_quality_score": audit.content_quality_score,
            "url": audit.url,
            "title": audit.title,
        }

        steps = engine.build_action_plan(audit_dict, rank_data)

        return {
            "url": req.url,
            "title": audit.title,
            "total_issues": len(steps),
            "auto_fixable": len([s for s in steps if s.auto_fixable]),
            "needs_manual_work": len([s for s in steps if not s.auto_fixable]),
            "action_plan": [
                {
                    "issue": s.issue,
                    "severity": s.severity,
                    "auto_fixable": s.auto_fixable,
                    "what_to_do": s.what_to_do,
                    "how_to_do_it": s.how_to_do_it,
                    "effort": s.effort,
                    "impact": s.impact,
                    "if_cannot_fix": s.if_cannot_fix,
                }
                for s in steps
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
