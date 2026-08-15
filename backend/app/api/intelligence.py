"""Intelligence API — Combines AI Parse + Knowledge Gap + Entity Profile.

Two modes:
- POST /full  — synchronous complete report (legacy, kept for compatibility)
- POST /start + GET /job/{id} — async job with live progress polling, used by
  the frontend so users see a progress bar instead of a frozen button while
  the ~20-60s AI analysis runs.
"""

import asyncio
import time
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.ai_parser import AIParseEngine
from app.services.knowledge_gap import KnowledgeGapEngine
from app.services.schema_detector import SchemaDetector

router = APIRouter()
parse_engine = AIParseEngine()
gap_engine = KnowledgeGapEngine()
detector = SchemaDetector()

# In-memory job store (single uvicorn worker; jobs expire after 30 min).
JOBS: dict[str, dict] = {}
MAX_JOBS = 200
JOB_TTL = 30 * 60


class IntelligenceRequest(BaseModel):
    url: str
    brand: str = ""
    category: str = ""  # e.g. "winter jackets", "espresso machines"


def _cleanup_jobs():
    now = time.time()
    stale = [jid for jid, j in JOBS.items() if now - j["created"] > JOB_TTL]
    for jid in stale:
        JOBS.pop(jid, None)
    if len(JOBS) > MAX_JOBS:
        for jid in sorted(JOBS, key=lambda j: JOBS[j]["created"])[: len(JOBS) - MAX_JOBS]:
            JOBS.pop(jid, None)


async def _build_report(req: IntelligenceRequest, progress_cb=None) -> dict:
    """Run the full intelligence pipeline; progress_cb(kind, payload) fires
    as stages complete. Kept as a plain function so /full (sync) and the
    /start job runner share the exact same logic."""
    # 1. Schema audit (fast, existing)
    audit = await detector.audit_product(req.url)
    if progress_cb:
        await progress_cb("fetch", None)

    # 2. AI Parse validation (cross-reference Schema with AI understanding)
    # Build the field→value map from the page's JSON-LD so the "Your Page"
    # column shows real schema values, not the product title.
    schema_vals = {f.field: f.value for f in audit.schema_fields if f.value}
    if "offers" in schema_vals and not schema_vals.get("price"):
        # schema audit stores the price inside the offers value ("$49.99 USD")
        schema_vals["price"] = schema_vals["offers"]

    # Page description — the AI agents need the actual body text to judge
    # whether fields are present; without it every field reads "Not found".
    description = ""
    for f in audit.schema_fields:
        if f.field == "description" and f.value:
            description = f.value
            break

    try:
        parse_report = await parse_engine.validate_product(
            url=req.url,
            title=audit.title or req.url,
            brand=req.brand,
            schema_values=schema_vals,
            description=description,
            progress_cb=progress_cb,
        )
    except Exception as e:
        parse_report = None

    # 3. Knowledge Gap detection
    category = req.category or audit.title or req.url.split("/")[-1]

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


@router.post("/full")
async def full_intelligence(req: IntelligenceRequest):
    """Complete AI Commerce Intelligence report (synchronous, legacy)."""
    return await _build_report(req)


@router.post("/start")
async def start_intelligence(req: IntelligenceRequest):
    """Start an async intelligence job; poll GET /job/{id} for progress."""
    _cleanup_jobs()
    job_id = uuid.uuid4().hex[:12]
    JOBS[job_id] = {
        "job_id": job_id,
        "status": "running",
        "stage": "fetch",
        "fields_done": 0,
        "fields_total": 16,
        "pct": 2,
        "result": None,
        "error": None,
        "created": time.time(),
    }
    asyncio.create_task(_run_job(job_id, req))
    return {"job_id": job_id}


async def _run_job(job_id: str, req: IntelligenceRequest):
    job = JOBS.get(job_id)
    if not job:
        return

    async def progress(kind, payload):
        if kind == "fetch":
            job["stage"], job["pct"] = "fields", 10
        elif kind == "fields":
            done, total = payload
            job["fields_done"], job["fields_total"] = done, total
            job["stage"] = "fields"
            job["pct"] = 10 + int(65 * done / max(total, 1))
        elif kind == "knowledge":
            job["stage"] = "knowledge"
            job["pct"] = max(job["pct"], 78)
        elif kind == "entity":
            job["stage"] = "entity"
            job["pct"] = max(job["pct"], 86)
        elif kind == "compare":
            job["stage"] = "compare"
            job["pct"] = max(job["pct"], 93)

    try:
        result = await _build_report(req, progress)
        job["status"], job["stage"], job["pct"], job["result"] = "done", "complete", 100, result
    except Exception as e:
        job["status"], job["stage"], job["error"] = "error", "error", str(e)


@router.get("/job/{job_id}")
async def job_status(job_id: str):
    """Poll a job's live progress; includes the full result once done."""
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return job
