"""AI Shopping Index scoring endpoint + Question Library + Entity Taxonomy data."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

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
async def calculate_score(req: ScoreRequest):
    """Calculate AI Shopping Index for a product page."""
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

    return {
        "url": req.url,
        "title": audit.title,
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


class AddQuestionsRequest(BaseModel):
    category: str
    questions: list[str]


@router.post("/question-library/add")
async def add_questions(req: AddQuestionsRequest):
    """Add new questions discovered from a user's store to the library."""
    qlib.add_from_site(req.category, req.questions)
    return {"added": len(req.questions), "category": req.category, "total": len(qlib.get_or_generate(req.category))}
