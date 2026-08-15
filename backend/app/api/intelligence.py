"""Intelligence API — Combines AI Parse + Knowledge Gap + Entity Profile."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.ai_parser import AIParseEngine
from app.services.knowledge_gap import KnowledgeGapEngine
from app.services.schema_detector import SchemaDetector

router = APIRouter()
parse_engine = AIParseEngine()
gap_engine = KnowledgeGapEngine()
detector = SchemaDetector()


class IntelligenceRequest(BaseModel):
    url: str
    brand: str = ""
    category: str = ""  # e.g. "winter jackets", "espresso machines"


@router.post("/full")
async def full_intelligence(req: IntelligenceRequest):
    """Complete AI Commerce Intelligence report for a product page."""
    # 1. Schema audit (fast, existing)
    audit = await detector.audit_product(req.url)

    # 2. AI Parse validation (cross-reference Schema with AI understanding)
    # Build the field→value map from the page's JSON-LD so the "Your Page"
    # column shows real schema values, not the product title.
    schema_vals = {f.field: f.value for f in audit.schema_fields if f.value}
    if "offers" in schema_vals and not schema_vals.get("price"):
        # schema audit stores the price inside the offers value ("$49.99 USD")
        schema_vals["price"] = schema_vals["offers"]
    try:
        parse_report = await parse_engine.validate_product(
            url=req.url,
            title=audit.title or req.url,
            brand=req.brand,
            schema_values=schema_vals,
        )
    except Exception as e:
        parse_report = None

    # 3. Knowledge Gap detection
    category = req.category or audit.title or req.url.split("/")[-1]
    description = ""
    for f in audit.schema_fields:
        if f.field == "description" and f.value:
            description = f.value
            break

    try:
        gap_report = await gap_engine.detect_gaps(category, description)
    except Exception:
        gap_report = None

    return {
        "url": req.url,
        "title": audit.title,
        "schema_audit": {
            "has_product_schema": audit.has_product_schema,
            "has_faq_schema": audit.has_faq_schema,
            "field_count": audit.field_count,
            "max_fields": audit.max_fields,
            "schema_fields": [
                {"field": f.field, "present": f.present, "value": f.value, "note": f.note}
                for f in audit.schema_fields
            ],
            "content_issues": audit.content_issues,
            "content_quality_score": audit.content_quality_score,
        },
        "ai_parse": {
            "field_validations": [
                {
                    "field": fv.field,
                    "schema_value": fv.schema_value,
                    "chatgpt_recognized": fv.chatgpt_recognized,
                    "chatgpt_value": fv.chatgpt_value,
                    "gemini_recognized": fv.gemini_recognized,
                    "gemini_value": fv.gemini_value,
                }
                for fv in (parse_report.field_validations if parse_report else [])
            ],
            "knowledge_dimensions": [
                {"dimension": kd.dimension, "label": kd.label, "covered": kd.covered}
                for kd in (parse_report.knowledge_dimensions if parse_report else [])
            ],
            "knowledge_score": parse_report.knowledge_score if parse_report else 0,
            "missing_dimensions": parse_report.missing_dimensions if parse_report else [],
            "entity_profile": {
                "pros": parse_report.entity_profile.pros,
                "cons": parse_report.entity_profile.cons,
                "best_for": parse_report.entity_profile.best_for,
                "worst_for": parse_report.entity_profile.worst_for,
                "alternatives": parse_report.entity_profile.alternatives,
                "price_range": parse_report.entity_profile.price_range,
                "audience": parse_report.entity_profile.audience,
            } if parse_report and parse_report.entity_profile else None,
            "ai_understanding": parse_report.ai_understanding_diff if parse_report else {},
        } if parse_report else None,
        "knowledge_gap": {
            "category": gap_report.category,
            "total_ai_questions": gap_report.total_ai_questions,
            "covered_questions": gap_report.covered_questions,
            "coverage_pct": (
                round(gap_report.covered_questions / gap_report.total_ai_questions * 100)
                if gap_report and gap_report.total_ai_questions > 0 else 0
            ),
            "top_missing": gap_report.top_missing if gap_report else [],
            "gaps": [
                {"question": g.question, "covered": g.covered, "priority": g.priority}
                for g in (gap_report.gaps if gap_report else [])
            ],
        } if gap_report else None,
    }
