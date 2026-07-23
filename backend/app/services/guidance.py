"""
Actionable Guidance Engine — for every detected issue, tell the user what to do.
Covers both auto-fixable issues and issues that require manual intervention.
"""

from dataclasses import dataclass, field


@dataclass
class ActionStep:
    issue: str
    severity: str  # "critical", "high", "medium", "low"
    auto_fixable: bool
    what_to_do: str
    how_to_do_it: str  # concrete steps, not vague advice
    effort: str  # "1 minute", "10 minutes", "1 hour", "1+ days"
    impact: str  # what happens if you fix this
    if_cannot_fix: str = ""  # workaround if user can't do this directly


class GuidanceEngine:
    """Generates concrete action plans from audit results."""

    def build_action_plan(self, audit: dict, ai_rank: dict | None = None) -> list[ActionStep]:
        """Build a prioritized action plan from audit + rank data."""
        steps = []

        schema_fields = audit.get("schema_fields", [])
        has_schema = audit.get("has_product_schema", False)
        has_faq = audit.get("has_faq_schema", False)
        content_issues = audit.get("content_issues", [])
        score = audit.get("content_quality_score", 0)

        # ── Schema: missing entirely ──
        if not has_schema:
            steps.append(ActionStep(
                issue="No Product Schema — AI cannot understand your product at all",
                severity="critical",
                auto_fixable=True,
                what_to_do="Generate and install complete Product Schema JSON-LD",
                how_to_do_it=(
                    "Option 1 (instant): If you're on Shopify, install the ProdRank App from the App Store. "
                    "Option 2 (1 line): Add <script async src=\"https://prodrank.app/inject.js\" data-site=\"YOURSITE\"></script> to your site template. "
                    "Option 3 (manual): Go to /api/optimize/fixes — copy the generated JSON-LD — paste into your site's <head> section."
                ),
                effort="1-5 minutes",
                impact="Transforms your product from invisible to fully structured for AI agents. Single biggest improvement you can make.",
                if_cannot_fix="Upload your product CSV to ProdRank. We generate Schema files you can give to your developer.",
            ))

        # ── Schema: missing key fields ──
        missing_fields = [f for f in schema_fields if not f.get("present")]
        if missing_fields:
            field_names = [f["field"] for f in missing_fields[:5]]
            critical_missing = [f for f in field_names if f in ("offers", "description", "image", "brand")]
            if critical_missing:
                steps.append(ActionStep(
                    issue=f"Schema exists but missing critical fields: {', '.join(critical_missing)}",
                    severity="high",
                    auto_fixable=True,
                    what_to_do=f"Add these fields to your Product Schema: {', '.join(critical_missing)}",
                    how_to_do_it=(
                        f"For each missing field: "
                        f"{'price — add the product price in your Schema offers block. ' if 'offers' in critical_missing else ''}"
                        f"{'description — ensure your meta description or product text is in the Schema description field. ' if 'description' in critical_missing else ''}"
                        f"{'image — add at least one product image URL to the Schema image array. ' if 'image' in critical_missing else ''}"
                        f"{'brand — add {\"brand\": {\"@type\": \"Brand\", \"name\": \"YOUR BRAND\"}} to your Schema. ' if 'brand' in critical_missing else ''}"
                        f"Use /api/optimize/fixes to generate the complete corrected JSON-LD."
                    ),
                    effort="5-10 minutes",
                    impact=f"AI agents will see price, brand, and images — directly affecting recommendation decisions.",
                    if_cannot_fix="Install inject.js — it auto-extracts these fields from your page content.",
                ))

        # ── FAQ: missing ──
        if not has_faq:
            steps.append(ActionStep(
                issue="No FAQPage Schema — missing ~40% of AI recommendation signals",
                severity="high",
                auto_fixable=True,
                what_to_do="Add FAQPage Schema with 3-5 product-specific questions",
                how_to_do_it=(
                    "The Shopify App, WordPress Plugin, and inject.js all auto-generate FAQ. "
                    "For manual setup: go to /api/optimize/fixes and copy the FAQPage JSON-LD block. "
                    "AI generates questions like: return policy, shipping time, care instructions, sizing guide."
                ),
                effort="2-5 minutes",
                impact="Products with FAQ are more likely to be recommended by AI agents because they have answers to shopper questions.",
                if_cannot_fix="Manually create a FAQ section on your product page with 3-5 shopper questions. Even plain HTML FAQ helps.",
            ))

        # ── Description too short ──
        if any("too short" in i or "too little" in i for i in content_issues):
            steps.append(ActionStep(
                issue="Product description too short — AI lacks context to recommend",
                severity="high",
                auto_fixable=False,
                what_to_do="Expand your product description to at least 200 words covering features, use cases, and audience",
                how_to_do_it=(
                    "Use our AI description enhancer: POST /api/optimize/fixes with use_ai=true. "
                    "The AI generates a description covering: what the product is, who it's for, "
                    "key features, what makes it different, and care/maintenance tips."
                ),
                effort="5 minutes (AI-assisted)",
                impact="Longer, richer descriptions give AI agents more signals to recommend your product over competitors.",
                if_cannot_fix="Even adding 2-3 bullet points of key features helps. AI picks up on structured lists.",
            ))

        # ── Missing reviews ──
        has_rating = any(
            f.get("field") == "aggregateRating" and f.get("present")
            for f in schema_fields
        )
        if not has_rating and has_schema:
            steps.append(ActionStep(
                issue="No structured reviews — AI favors products with social proof",
                severity="medium",
                auto_fixable=False,
                what_to_do="Collect and mark up customer reviews with AggregateRating Schema",
                how_to_do_it=(
                    "If you have reviews on your site (WooCommerce, Judge.me, Yotpo, etc.), "
                    "our inject.js auto-detects them and adds Schema. "
                    "If you have NO reviews yet: send review request emails to past customers. "
                    "Even 5-10 reviews with structured markup significantly improve AI trust signals."
                ),
                effort="1 hour (to set up review collection)",
                impact="Products with reviews are consistently ranked higher by AI agents. This is one of the strongest recommendation signals.",
                if_cannot_fix="List your product on G2, Trustpilot, or Google Reviews. AI agents cite these platforms even for third-party reviews.",
            ))

        # ── AI rank: not mentioned ──
        if ai_rank and not ai_rank.get("mentioned_by"):
            steps.append(ActionStep(
                issue="Not mentioned by any AI agent for your target keywords",
                severity="critical",
                auto_fixable=False,
                what_to_do="Build external signals: reviews, citations, and backlinks that AI agents reference",
                how_to_do_it=(
                    "1. Get your product reviewed on authoritative sites in your category "
                    "(check /api/cite/report to see which sites AI agents currently trust for your category). "
                    "2. Create content answering the most common shopper questions "
                    "(check /api/question-library for questions AI agents answer). "
                    "3. Ensure your Schema is complete (fix critical issues above first). "
                    "4. List your product on Google Merchant Center and Amazon — AI agents pull from these."
                ),
                effort="1-4 weeks",
                impact="Getting cited by just one authoritative review site in your category can move you from 'unknown' to 'ranked' within weeks.",
                if_cannot_fix="Start with Schema fixes above. Even without external reviews, complete Schema + FAQ significantly improves visibility.",
            ))

        # ── General: low score ──
        if score < 50 and has_schema:
            steps.append(ActionStep(
                issue=f"Low content quality score ({score}/100) — AI has insufficient signals",
                severity="medium",
                auto_fixable=False,
                what_to_do="Improve page content: meta description, image alt text, FAQ section, word count",
                how_to_do_it=(
                    f"Specific issues found: {', '.join(content_issues[:3])}. "
                    "Address each one: add a meta description (60-160 chars), "
                    "add alt text to product images (describes what's in the photo), "
                    "add a FAQ section (even 3 questions helps), "
                    "ensure the page has at least 300 words of content."
                ),
                effort="15-30 minutes",
                impact="Each fixed issue adds 5-15 points to your content quality score, directly improving AI understanding.",
                if_cannot_fix="Focus on the top 1-2 issues. Fixing just the meta description and adding image alt text gives the biggest quick win.",
            ))

        return steps
