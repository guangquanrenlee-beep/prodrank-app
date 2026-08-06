"""
Test Engine API — run AI recommendation tests & retrieve results.

POST /api/test/run       — run a new test (by site_id)
POST /api/test/run-by-domain — run by domain (auto-resolves site_id)
GET  /api/test/results   — get results for a site
POST /api/test/verify    — re-test after optimization (compare before/after)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.ai_test_engine import AITestEngine
from app.services.db import DB

router = APIRouter()
engine = AITestEngine()


class TestRunRequest(BaseModel):
    site_id: str = ""
    domain: str = ""
    brand_name: str
    category: str = ""
    product_id: str | None = None
    query_count: int = 50
    models: list[str] | None = None  # default: ["deepseek"]


class TestVerifyRequest(BaseModel):
    site_id: str = ""
    domain: str = ""
    brand_name: str
    category: str = ""
    product_id: str | None = None
    query_count: int = 50
    models: list[str] | None = None


def _resolve_site_id(site_id: str, domain: str) -> str:
    """Return a valid site_id from either site_id or domain."""
    if site_id:
        return site_id
    if domain:
        db = DB()
        rows = db.client.table("sites").select("id").eq("domain", domain).limit(1).execute().data
        if rows:
            return rows[0]["id"]
    raise HTTPException(400, "Provide site_id or a registered domain")


def _guess_brand(domain: str) -> str:
    """Quick brand guess from domain: 'altcoord.com' → 'AltCoord'."""
    host = domain.replace("http://", "").replace("https://", "").split(":")[0].split("/")[0]
    parts = host.split(".")
    if parts[0] in ("www", "shop", "store", "m"):
        parts = parts[1:]
    return parts[0].capitalize() if parts else host


@router.post("/run")
async def run_test(req: TestRunRequest):
    """Run a full AI recommendation test.

    Provide either site_id or domain (auto-resolves).
    brand_name is auto-guessed from domain if empty.
    query_count: 10-200, default 50.
    models: ["deepseek"] (fast/cheap) or ["chatgpt","gemini","claude"].
    """
    if req.query_count < 10 or req.query_count > 200:
        raise HTTPException(400, "query_count must be between 10 and 200")

    site_id = _resolve_site_id(req.site_id, req.domain)
    brand = req.brand_name or _guess_brand(req.domain or "")

    try:
        run = await engine.run_test(
            site_id=site_id,
            brand_name=brand,
            category=req.category,
            product_id=req.product_id,
            query_count=req.query_count,
            models=req.models,
        )
        return run.to_summary()
    except Exception as e:
        raise HTTPException(500, f"Test failed: {e}")


@router.post("/run-by-domain")
async def run_test_by_domain(req: TestRunRequest):
    """Convenience: run a test by domain. Same as /run but domain-first."""
    return await run_test(req)


@router.get("/results")
async def get_results(site_id: str = "", domain: str = ""):
    """Get historical test results and current recommendation rate."""
    site_id = _resolve_site_id(site_id, domain)
    try:
        return await engine.get_recommendation_rate(site_id)
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/trend")
async def get_test_trend(site_id: str = "", domain: str = "", days: int = 30):
    """Daily recommendation-rate series (for trend lines — single test rounds
    are noisy; the 30-day moving view shows the real direction)."""
    site_id = _resolve_site_id(site_id, domain)
    try:
        from datetime import datetime, timedelta, timezone
        from collections import defaultdict

        db = DB()
        cutoff = (datetime.now(timezone.utc) - timedelta(days=min(days, 90))).isoformat()
        rows = (db.client.table("ai_query_results")
                .select("recommended,created_at")
                .eq("site_id", site_id)
                .gte("created_at", cutoff)
                .limit(5000).execute().data or [])

        daily: dict[str, dict] = defaultdict(lambda: {"total": 0, "recommended": 0})
        for r in rows:
            day = (r.get("created_at") or "")[:10]
            if not day:
                continue
            daily[day]["total"] += 1
            if r.get("recommended"):
                daily[day]["recommended"] += 1

        series = []
        for day in sorted(daily.keys()):
            d = daily[day]
            series.append({
                "date": day,
                "queries": d["total"],
                "rate_pct": round(d["recommended"] / d["total"] * 100, 1) if d["total"] else 0,
            })
        return {"site_id": site_id, "days": len(series), "series": series}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/verify")
async def verify_optimization(req: TestVerifyRequest):
    """Run a fresh test and compare with previous results.

    Call this after publishing optimizations (FAQs, Schema, descriptions).
    Returns before/after comparison with delta.
    """
    site_id = _resolve_site_id(req.site_id, req.domain)
    brand = req.brand_name or _guess_brand(req.domain or "")

    try:
        before = await engine.get_recommendation_rate(site_id)
        before_rate = before.get("recommendation_rate", 0)

        run = await engine.run_test(
            site_id=site_id,
            brand_name=brand,
            category=req.category,
            product_id=req.product_id,
            query_count=req.query_count,
            models=req.models,
        )
        after_rate = run.recommendation_rate

        return {
            "site_id": site_id,
            "before_rate": before_rate,
            "after_rate": after_rate,
            "delta": round(after_rate - before_rate, 1),
            "run": run.to_summary(),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


class TestCompareRequest(BaseModel):
    site_id: str = ""
    domain: str = ""
    brand_name: str
    competitors: list[str]  # brand names to compare against, e.g. ["Nike", "Uniqlo"]
    category: str = ""
    query_count: int = 50
    models: list[str] | None = None


@router.post("/compare")
async def compare_with_competitors(req: TestCompareRequest):
    """Same batch of shopping queries, ask once, count how often each brand
    gets mentioned. Your recommendation rate vs each competitor's — a
    head-to-head visibility comparison on identical questions.
    """
    site_id = _resolve_site_id(req.site_id, req.domain)
    brand = req.brand_name or _guess_brand(req.domain or "")

    run = await engine.run_test(
        site_id=site_id,
        brand_name=brand,
        category=req.category,
        query_count=min(req.query_count, 200),
        models=req.models,
    )

    # Count mentions of every brand across the same answers
    from collections import Counter
    mentions: Counter = Counter()
    for r in run.results:
        for b in r.mentioned_brands:
            mentions[b.lower()] += 1

    def brand_stats(name: str) -> dict:
        name_l = name.lower()
        # exact or fuzzy: brand is mentioned if any mentioned brand contains it
        hits = sum(1 for r in run.results if any(name_l in m.lower() for m in r.mentioned_brands))
        return {
            "brand": name,
            "mentioned_queries": hits,
            "rate_pct": round(hits / run.total_queries * 100, 1) if run.total_queries else 0,
        }

    comparison = [brand_stats(brand)] + [brand_stats(c) for c in req.competitors]
    comparison.sort(key=lambda x: -x["rate_pct"])

    return {
        "site_id": site_id,
        "total_queries": run.total_queries,
        "models": req.models or ["deepseek"],
        "comparison": comparison,
        "top_mentioned_brands": [{"brand": b, "count": c} for b, c in mentions.most_common(10)],
    }
