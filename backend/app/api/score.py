"""AI Shopping Index scoring endpoint + Question Library + Entity Taxonomy data."""

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from app.core.rate_limit import check_free_limit

from app.services.ai_score import AIScoringEngine
from app.services.schema_detector import SchemaDetector
from app.services.ai_query import AIQueryService
from app.services.question_library import QuestionLibrary

router = APIRouter()
engine = AIScoringEngine()
detector = SchemaDetector()
qlib = QuestionLibrary()


class ScoreRequest(BaseModel):
    url: str
    product_name: str = ""
    keyword: str = ""
    brand: str = ""


@router.post("/calculate")
async def calculate_score(req: ScoreRequest, request: Request):
    """Calculate AI Shopping Index. Free: 3/day."""
    check_free_limit(request)
    # 1. Schema audit
    audit = await detector.audit_product(req.url)

    # 2. Rank check (optional — only if keyword provided)
    rank_data = None
    if req.keyword:
        ai = AIQueryService()
        report = await ai.query_chatgpt(req.product_name or audit.title, req.keyword, req.brand)
        rank_data = {
            "mentioned_by": [report.ai_agent] if report.rank else [],
            "all_cited_sources": report.cited_sources,
        }

    # 3. Calculate score
    score = engine.score_product(
        schema_field_count=audit.field_count,
        max_fields=audit.max_fields,
        content_quality_score=audit.content_quality_score,
        ai_mentioned=bool(rank_data and rank_data.get("mentioned_by")),
        total_agents=2,
        citation_count=len(rank_data.get("all_cited_sources", [])) if rank_data else 0,
    )

    result = {
        "url": req.url, "title": audit.title,
        "ai_visibility_score": score.overall,
        "label": score.label,
        "breakdown": {
            "knowledge_coverage": {"score": score.knowledge_coverage, "weight": 25},
            "question_coverage": {"score": score.question_coverage, "weight": 20},
            "citation_authority": {"score": score.citation_authority, "weight": 20},
            "recommendation_frequency": {"score": score.recommendation_frequency, "weight": 15},
            "external_evidence": {"score": score.external_evidence, "weight": 10},
            "product_completeness": {"score": score.product_completeness, "weight": 10},
        },
        "recommendation": score.recommendation,
    }

    # Save snapshot for trend tracking
    try:
        from app.services.db import DB
        db = DB()
        # Normalize domain once
        clean_domain = req.url.replace("https://", "").replace("http://", "").split("/")[0]
        # Find existing site
        sites = db.client.table("sites").select("id,user_id").eq("domain", clean_domain).execute().data
        if sites:
            site = sites[0]
            db.client.table("score_snapshots").insert({
                "site_id": site["id"],
                "user_id": site["user_id"],
                "domain": clean_domain,
                "ai_visibility_score": score.overall,
                "breakdown": result["breakdown"],
                "label": score.label,
                "recommendation": score.recommendation,
            }).execute()
    except Exception:
        pass  # silently skip if snapshots table doesn't exist yet

    return result


@router.get("/entity-taxonomy")
async def entity_taxonomy():
    """Return the Entity Taxonomy seed data for product categories."""
    return {
        "taxonomy": [
            {
                "category": "Fashion",
                "subcategories": ["Jacket", "Hoodie", "Shoes", "Jeans", "Dress", "T-shirt"],
                "attributes": ["Material", "Fit", "Season", "Audience", "Care", "Style", "Size"],
            },
            {
                "category": "Electronics",
                "subcategories": ["Headphones", "Speakers", "Smartwatch", "Laptop", "Phone Case"],
                "attributes": ["Battery", "Compatibility", "Warranty", "Specs", "Use Case", "Brand"],
            },
            {
                "category": "Home & Kitchen",
                "subcategories": ["Coffee Machine", "Blender", "Cookware", "Furniture", "Lighting"],
                "attributes": ["Material", "Warranty", "Installation", "Dimensions", "Maintenance"],
            },
            {
                "category": "Beauty",
                "subcategories": ["Skincare", "Makeup", "Haircare", "Fragrance", "Tools"],
                "attributes": ["Ingredients", "Skin Type", "Usage", "Shelf Life", "Allergens"],
            },
            {
                "category": "Sports",
                "subcategories": ["Running Shoes", "Yoga Mat", "Bike", "Tent", "Weights"],
                "attributes": ["Terrain", "Skill Level", "Material", "Weight", "Weather"],
            },
        ]
    }


@router.get("/question-library")
async def question_library(
    category: str = Query(default=""),
    count: int = Query(default=15),
    action: str = Query(default="get"),  # "get", "generate", "gaps", "stats"
    new_category: str = Query(default=""),
):
    """Self-growing question library. Auto-generates consumer questions for new categories.

    ?category=winter_jackets — get questions for a category
    ?action=generate&new_category=running_shoes — AI-generate questions for a new category
    ?action=gaps&category=headphones — questions with lowest AI coverage (optimization targets)
    ?action=stats — library statistics
    """
    if action == "generate" and new_category:
        qs = await qlib.generate_async(new_category, count)
        return {"category": new_category, "questions": [q.text for q in qs], "total": len(qs)}

    if action == "gaps" and category:
        gaps = qlib.top_gaps(category, count)
        return {"category": category, "gaps": [q.text for q in gaps], "total": len(gaps)}

    if action == "stats":
        return qlib.stats()

    # Default: get questions
    if category:
        qs = qlib.get_or_generate(category, count)
        return {"category": category, "questions": [q.text for q in qs], "total": len(qs)}

    # List all categories
    stats = qlib.stats()
    return {"categories": stats["largest_categories"], **stats}


@router.get("/history")
async def score_history(domain: str = Query(default=""), days: int = Query(default=30)):
    """Get score trend history for a domain. Returns daily snapshots for charting."""
    if not domain:
        return {"snapshots": [], "trend": "flat"}
    try:
        from app.services.db import DB
        db = DB()
        snapshots = db.client.table("score_snapshots") \
            .select("snapshot_date,ai_visibility_score,label") \
            .eq("domain", domain) \
            .gte("snapshot_date", f"now()-{days}d") \
            .order("snapshot_date", desc=False) \
            .limit(days) \
            .execute().data or []

        scores = [s["ai_visibility_score"] for s in snapshots]
        trend = "flat"
        if len(scores) >= 7:
            # 7+ days: use 7-day moving averages for stable trend signal
            first_week_avg = sum(scores[:7]) / 7
            last_week_avg = sum(scores[-7:]) / 7
            diff = last_week_avg - first_week_avg
            trend = "up" if diff > 3 else "down" if diff < -3 else "flat"
        elif len(scores) >= 2:
            # 2-6 days: use simple first-vs-last comparison
            diff = scores[-1] - scores[0]
            trend = "up" if diff > 3 else "down" if diff < -3 else "flat"

        return {
            "domain": domain,
            "snapshots": [{"date": s["snapshot_date"], "score": s["ai_visibility_score"], "label": s.get("label", "")} for s in snapshots],
            "trend": trend,
            "latest": scores[-1] if scores else None,
            "change": scores[-1] - scores[0] if len(scores) >= 2 else 0,
        }
    except Exception:
        return {"snapshots": [], "trend": "flat", "error": "History not available yet"}


class CompetitorRequest(BaseModel):
    domain: str
    name: str = ""

@router.post("/competitors/detect")
async def detect_competitors(req: CompetitorRequest):
    """Use AI to detect real competitors for a SaaS product."""
    from openai import AsyncOpenAI
    from app.core.config import get_settings
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)

    prompt = f"""List the top 5 software competitors of "{req.name or req.domain}". These are tools that customers compare or switch between.
Return a JSON array of objects with: name, domain (just the domain, not full URL), why (one sentence why they compete).
Example: [{{"name":"FreshBooks","domain":"freshbooks.com","why":"Direct competitor in small business invoicing and bookkeeping"}}]
Return ONLY the JSON array, no other text."""

    try:
        resp = await client.chat.completions.create(
            model="google/gemini-3.6-flash",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3, max_tokens=800, timeout=15.0,
        )
        import json
        competitors = json.loads(resp.choices[0].message.content)
        return {"domain": req.domain, "competitors": competitors}
    except Exception:
        return {"domain": req.domain, "competitors": []}

@router.post("/competitors/compare")
async def compare_competitors(req: CompetitorRequest):
    """Compare your site vs competitors on key SaaS metrics."""
    import httpx, json
    from bs4 import BeautifulSoup

    competitors = []
    # First detect competitors
    names = [req.name or req.domain]
    domains_to_check = [req.domain]

    try:
        detect = await detect_competitors(req)
        for c in (detect.get("competitors") or [])[:4]:
            names.append(c.get("name", ""))
            domains_to_check.append(c.get("domain", ""))
    except Exception:
        pass

    results = []
    for i, d in enumerate(domains_to_check):
        try:
            url = f"https://{d}" if not d.startswith("http") else d
            resp = httpx.get(url, headers={"User-Agent": "Mozilla/5.0 (compatible; ProdRank/1.0)"}, follow_redirects=True, timeout=12)
            soup = BeautifulSoup(resp.text, "lxml")
            text = soup.get_text()

            # Check schema
            scripts = soup.find_all("script", type="application/ld+json")
            has_software = False; has_org = False; has_faq = False; field_count = 0
            for s in scripts:
                try:
                    data = json.loads(s.string or "{}")
                    items = data if isinstance(data, list) else [data]
                    if isinstance(data, dict) and "@graph" in data: items = data["@graph"]
                    for item in items:
                        t = item.get("@type", "") if isinstance(item, dict) else ""
                        if t == "SoftwareApplication": has_software = True; field_count = len([k for k in item if k not in ("@context","@type")])
                        elif t == "Organization": has_org = True
                        elif t == "FAQPage": has_faq = True
                except: pass

            # Quick score estimate
            est_score = min(85, (20 if has_software else 0) + (15 if has_org else 0) + (10 if has_faq else 0) +
                           (len(text.split()) // 50 if len(text.split()) > 200 else 0) + (field_count * 3))

            results.append({
                "name": names[i] if i < len(names) else d,
                "domain": d, "is_you": i == 0,
                "has_software_schema": has_software, "has_org_schema": has_org, "has_faq_schema": has_faq,
                "schema_fields": field_count,
                "word_count": len(text.split()),
                "estimated_score": est_score,
            })
        except Exception:
            results.append({"name": names[i] if i < len(names) else d, "domain": d, "is_you": i == 0, "error": "Could not fetch"})

    return {"your_domain": req.domain, "compared_at": __import__("datetime").datetime.now().isoformat(), "results": results}


class AddQuestionsRequest(BaseModel):
    category: str
    questions: list[str]


@router.post("/question-library/add")
async def add_questions(req: AddQuestionsRequest):
    """Add new questions discovered from a user's store to the library."""
    qlib.add_from_site(req.category, req.questions)
    return {"added": len(req.questions), "category": req.category, "total": len(qlib.get_or_generate(req.category))}
