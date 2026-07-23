"""Recommendation API — Why AI recommends, SKU priorities, Entity Intelligence."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.recommendation_engine import RecommendationEngine

router = APIRouter()
engine = RecommendationEngine()


class ReasonRequest(BaseModel):
    product_name: str
    keyword: str
    brand: str = ""
    competitor: str = ""


class OpportunityRequest(BaseModel):
    brand: str = ""
    category: str = ""
    products: list[dict] = []  # [{name, search_volume, ai_mentioned, competition}]


class EntityRequest(BaseModel):
    product_name: str
    brand: str = ""


@router.post("/reasons")
async def analyze_reasons(req: ReasonRequest):
    """Why does AI recommend (or not) this product for this keyword?"""
    try:
        results = await engine.analyze_reasons(
            product_name=req.product_name,
            keyword=req.keyword,
            brand=req.brand,
            competitor=req.competitor,
        )
        return {
            "product_name": req.product_name,
            "keyword": req.keyword,
            "breakdowns": [
                {
                    "ai_agent": r.ai_agent,
                    "recommended": r.recommended,
                    "reasons": r.reasons,
                    "barriers": r.barriers,
                    "missing_signals": r.missing_signals,
                    "full_explanation": r.full_explanation,
                }
                for r in results
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/opportunities")
async def rank_opportunities(req: OpportunityRequest):
    """Which SKUs should be optimized first? Rank by ROI."""
    try:
        results = await engine.rank_opportunities(
            brand=req.brand,
            products=req.products,
            category=req.category,
        )
        return {
            "category": req.category,
            "total_skus": len(req.products),
            "opportunities": [
                {
                    "product_name": o.product_name,
                    "search_volume_score": o.search_volume_score,
                    "ai_coverage_score": o.ai_coverage_score,
                    "competition_score": o.competition_score,
                    "roi_score": o.roi_score,
                    "recommended_action": o.recommended_action,
                }
                for o in results
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/entity")
async def profile_entity(req: EntityRequest):
    """What does AI think about this product? Pros, cons, positioning."""
    try:
        chatgpt_view, gemini_view = await engine.profile_entity(
            product_name=req.product_name,
            brand=req.brand,
        )
        return {
            "product_name": req.product_name,
            "profiles": [
                {
                    "ai_agent": chatgpt_view.ai_agent,
                    "is_understood": chatgpt_view.is_understood,
                    "pros": chatgpt_view.pros,
                    "cons": chatgpt_view.cons,
                    "best_for": chatgpt_view.best_for,
                    "worst_for": chatgpt_view.worst_for,
                    "price_perception": chatgpt_view.price_perception,
                    "brand_perception": chatgpt_view.brand_perception,
                    "differentiation": chatgpt_view.differentiation,
                },
                {
                    "ai_agent": gemini_view.ai_agent,
                    "is_understood": gemini_view.is_understood,
                    "pros": gemini_view.pros,
                    "cons": gemini_view.cons,
                    "best_for": gemini_view.best_for,
                    "worst_for": gemini_view.worst_for,
                    "price_perception": gemini_view.price_perception,
                    "brand_perception": gemini_view.brand_perception,
                    "differentiation": gemini_view.differentiation,
                },
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
