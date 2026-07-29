"""Dashboard AI — Summary, Why analysis, and opportunity ranking."""

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.services.db import DB

router = APIRouter()


class AIWhyRequest(BaseModel):
    score: int = 0
    discover: int = 0
    understand: int = 0
    trust: int = 0
    recommend: int = 0
    domain: str = ""
    product_count: int = 0


def _get_user_id(request: Request) -> str | None:
    email = request.headers.get("X-User-Email", "")
    if not email:
        return None
    try:
        db = DB()
        user = db.client.rpc("get_user_id_by_email", {"p_email": email}).execute()
        if user.data:
            uid = user.data[0]
            return uid.get("id", uid) if isinstance(uid, dict) else str(uid)
    except Exception:
        pass
    return None


@router.post("/ai-summary")
async def ai_dashboard_summary(req: AIWhyRequest, request: Request):
    """Generate AI-powered dashboard summary and actionable insights."""
    from openai import AsyncOpenAI
    from app.core.config import get_settings
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)

    # Build a rich prompt from the scores
    pillar_details = []
    issues = []
    if req.discover < 40:
        issues.append(f"Discover score critically low at {req.discover} — products are invisible to AI")
        pillar_details.append(f"Discover: {req.discover}/100 — Schema incomplete, structured data missing")
    elif req.discover < 70:
        pillar_details.append(f"Discover: {req.discover}/100 — Some Schema gaps remain")
    else:
        pillar_details.append(f"Discover: {req.discover}/100 — Good schema coverage")

    if req.understand < 40:
        issues.append(f"Understand score low at {req.understand} — AI cannot understand your products")
        pillar_details.append(f"Understand: {req.understand}/100 — Content too thin, missing dimensions")
    elif req.understand < 70:
        pillar_details.append(f"Understand: {req.understand}/100 — Content needs expansion")
    else:
        pillar_details.append(f"Understand: {req.understand}/100 — AI understands your products")

    if req.trust < 40:
        issues.append(f"Trust score critically low at {req.trust} — no external validation")
        pillar_details.append(f"Trust: {req.trust}/100 — No reviews, citations, or brand signals")
    elif req.trust < 70:
        pillar_details.append(f"Trust: {req.trust}/100 — Need more external citations and reviews")
    else:
        pillar_details.append(f"Trust: {req.trust}/100 — Strong trust signals")

    if req.recommend < 40:
        issues.append(f"Recommend score low at {req.recommend} — AI rarely recommends you")
        pillar_details.append(f"Recommend: {req.recommend}/100 — Low AI recommendation rate")
    elif req.recommend < 70:
        pillar_details.append(f"Recommend: {req.recommend}/100 — Some AI agents recommend")
    else:
        pillar_details.append(f"Recommend: {req.recommend}/100 — Frequently recommended by AI")

    prompt = f"""Analyze this ecommerce/SaaS store's AI visibility and write a dashboard summary.

DOMAIN: {req.domain}
PRODUCTS ANALYZED: {req.product_count or 'unknown'}

SCORES:
- Overall: {req.score}/100
- Discover: {req.discover}/100 (Can AI find products?)
- Understand: {req.understand}/100 (Does AI understand them?)
- Trust: {req.trust}/100 (Does AI believe in them?)
- Recommend: {req.recommend}/100 (Will AI recommend them?)

KEY ISSUES: {', '.join(issues) if issues else 'No critical issues'}

Write a helpful, direct summary a store owner would understand. Focus on WHY AI doesn't recommend, not just what scores are.

Return JSON:
{{
  "summary": "2-3 sentence executive summary explaining the main reason AI isn't recommending this store",
  "cta": "One-line call to action telling the owner what to do today",
  "why_explanation": "Detailed analysis of why scores are what they are. Explain the connection between Schema gaps, weak content, no reviews, and poor recommendations.",
  "top_opportunities": [
    {{"title": "...", "impact": "High/Medium/Low", "expected_gain": "+N AI Score", "time": "X min", "action": "specific action to take"}}
  ],
  "estimated_potential": {{"current": {req.score}, "after_fix": "estimate after fixing top 3 issues", "gain": "estimated gain"}},
  "simulation": "If someone asks AI best {req.domain} tool, current: not recommended. After fixing top issues: likely recommended. Explain briefly.",
  "critical_issues": ["list of specific, actionable issues found"]
}}

Return ONLY valid JSON, no other text."""

    try:
        resp = await client.chat.completions.create(
            model="anthropic/claude-haiku-4.5",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=1200,
            timeout=25.0,
        )
        import json
        text = resp.choices[0].message.content or "{}"
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.endswith("```"):
                text = text[:-3]
        return json.loads(text)
    except Exception as e:
        # Graceful fallback without AI
        top_opps = []
        if req.discover < 50:
            top_opps.append({"title": "Fix Product Schema", "impact": "High", "expected_gain": f"+{min(25, (100-req.discover)//2)} AI Score", "time": "5 min", "action": "Go to Knowledge Graph → Auto-Fix"})
        if req.understand < 50:
            top_opps.append({"title": "Expand Product Content", "impact": "High", "expected_gain": "+10 AI Score", "time": "15 min", "action": "Add detailed descriptions + FAQ"})
        if req.trust < 50:
            top_opps.append({"title": "Build Trust Signals", "impact": "High", "expected_gain": "+15 AI Score", "time": "30 min", "action": "Get listed on review sites, get citations"})
        if req.recommend < 50:
            top_opps.append({"title": "Improve AI Recommendation Rate", "impact": "Medium", "expected_gain": "+10 AI Score", "time": "Ongoing", "action": "Fix Schema + Content first, then re-test"})

        est = min(req.score + 25, 95)
        sim = f"If someone asks an AI for {req.domain} products, this store is currently unlikely to be recommended. After fixing the top {len(top_opps)} issues, it has a strong chance of appearing."
        return {
            "summary": f"Your store scored {req.score}/100. {'The biggest issue is that AI cannot find your products due to missing schema.' if req.discover < 50 else 'AI has partial awareness of your products but lacks trust signals.' if req.trust < 50 else 'Your products are on the right track but need more optimization.'}",
            "cta": f"Start with {'Schema Auto-Fix' if req.discover < 50 else 'building trust signals' if req.trust < 50 else 'content optimization'} today.",
            "why_explanation": f"Discover ({req.discover}): {'Schema incomplete' if req.discover < 50 else 'OK'}. Understand ({req.understand}): {'Content too thin' if req.understand < 50 else 'OK'}. Trust ({req.trust}): {'No external validation' if req.trust < 50 else 'OK'}. Recommend ({req.recommend}): {'AI rarely recommends' if req.recommend < 50 else 'OK'}.",
            "top_opportunities": top_opps,
            "estimated_potential": {"current": req.score, "after_fix": est, "gain": est - req.score},
            "simulation": sim,
            "critical_issues": issues if issues else ["No critical issues detected"],
        }
