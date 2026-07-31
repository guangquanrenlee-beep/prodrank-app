"""
Actionable Guidance Engine — includes Impact, Difficulty, Expected Gain scoring.
"""
from dataclasses import dataclass, field

@dataclass
class ActionStep:
    issue: str
    severity: str
    auto_fixable: bool
    what_to_do: str
    how_to_do_it: str
    effort: str
    impact: str
    impact_stars: str = ""
    difficulty: str = ""
    expected_gain: str = ""
    if_cannot_fix: str = ""

class GuidanceEngine:
    def build_action_plan(self, audit: dict, ai_rank: dict | None = None) -> list[ActionStep]:
        steps = []
        schema_fields = audit.get("schema_fields", [])
        has_schema = audit.get("has_product_schema", False)
        has_faq = audit.get("has_faq_schema", False)
        content_issues = audit.get("content_issues", [])
        score = audit.get("content_quality_score", 0)

        if not has_schema:
            steps.append(ActionStep(
                issue="No Product Schema — AI cannot understand your product at all",
                severity="critical", auto_fixable=True, impact_stars="5/5", difficulty="Easy", expected_gain="High",
                what_to_do="Generate and install complete Product Schema JSON-LD",
                how_to_do_it="Option 1 (instant): If on Shopify, install ProdRank App. Option 2 (WooCommerce): install the ProdRank WordPress plugin. Option 3 (manual): Copy JSON-LD from /api/optimize/fixes.",
                effort="1-5 minutes", impact="Transforms your product from invisible to fully structured for AI. Single biggest improvement."))

        missing_fields = [f for f in schema_fields if not f.get("present")]
        if missing_fields:
            field_names = [f["field"] for f in missing_fields[:5]]
            critical_missing = [f for f in field_names if f in ("offers", "description", "image", "brand")]
            if critical_missing:
                steps.append(ActionStep(
                    issue=f"Schema missing critical fields: {', '.join(critical_missing)}",
                    severity="high", auto_fixable=True, impact_stars="4/5", difficulty="Easy", expected_gain="High",
                    what_to_do=f"Add: {', '.join(critical_missing)}",
                    how_to_do_it="Use /api/optimize/fixes to generate corrected JSON-LD. Or install the Shopify App / WordPress Plugin, which auto-extracts these fields.",
                    effort="5-10 minutes", impact="AI agents will see price, brand, and images — directly affecting recommendations."))

        if not has_faq:
            steps.append(ActionStep(
                issue="No FAQPage Schema — missing AI recommendation signals",
                severity="high", auto_fixable=True, impact_stars="4/5", difficulty="Easy", expected_gain="High",
                what_to_do="Add FAQPage Schema with 3-5 product-specific questions",
                how_to_do_it="Shopify App and WordPress Plugin both auto-generate FAQ. For manual: copy FAQPage JSON-LD from /api/optimize/fixes.",
                effort="2-5 minutes", impact="Products with FAQ are more likely to be cited by AI agents in Q&A scenarios."))

        if any("too short" in i or "too little" in i for i in content_issues):
            steps.append(ActionStep(
                issue="Product description too short — AI lacks context to recommend",
                severity="high", auto_fixable=False, impact_stars="4/5", difficulty="Easy", expected_gain="High",
                what_to_do="Expand product description to 200+ words covering features, use cases, audience",
                how_to_do_it="Use AI description enhancer: POST /api/optimize/fixes with use_ai=true.",
                effort="5 minutes (AI-assisted)", impact="Richer descriptions give AI more signals to recommend your product over competitors."))

        has_rating = any(f.get("field") == "aggregateRating" and f.get("present") for f in schema_fields)
        if not has_rating and has_schema:
            steps.append(ActionStep(
                issue="No structured reviews — AI favors products with social proof",
                severity="medium", auto_fixable=False, impact_stars="5/5", difficulty="Hard", expected_gain="High",
                what_to_do="Collect and mark up customer reviews with AggregateRating Schema",
                how_to_do_it="If you have reviews (WooCommerce, Judge.me, Yotpo): the Shopify App / WordPress Plugin auto-detects them. If no reviews: send review request emails. Even 5-10 structured reviews help.",
                effort="1 hour", impact="Products with reviews are consistently ranked higher by AI agents.",
                if_cannot_fix="List on G2, Trustpilot, or Google Reviews — AI agents cite these platforms even for third-party reviews."))

        if ai_rank and not ai_rank.get("mentioned_by"):
            steps.append(ActionStep(
                issue="Not mentioned by any AI agent for your target keywords",
                severity="critical", auto_fixable=False, impact_stars="5/5", difficulty="Hard", expected_gain="High",
                what_to_do="Build external signals: reviews, citations, backlinks that AI agents reference",
                how_to_do_it="1. Get reviewed on authoritative category sites (check /api/cite/report). 2. Create FAQ content answering shopper questions. 3. Ensure Schema is complete. 4. List on Google Merchant Center.",
                effort="1-4 weeks", impact="Getting cited by one authoritative review site can move you from unknown to ranked within weeks.",
                if_cannot_fix="Start with Schema + FAQ fixes. Even without external reviews, complete structured data improves visibility."))

        if score < 50 and has_schema:
            steps.append(ActionStep(
                issue=f"Low content quality ({score}/100) — AI has insufficient signals",
                severity="medium", auto_fixable=False, impact_stars="3/5", difficulty="Easy", expected_gain="Medium",
                what_to_do="Fix meta description, image alt text, FAQ section, word count",
                how_to_do_it=f"Issues found: {', '.join(content_issues[:3])}. Fix each: add meta description, alt text to images, FAQ section, ensure 300+ words.",
                effort="15-30 minutes", impact="Each fixed issue adds 5-15 points to content quality score.",
                if_cannot_fix="Fix top 1-2 issues first. Meta description + image alt text give the biggest quick win."))

        return steps
