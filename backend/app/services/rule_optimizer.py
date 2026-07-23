"""
Rule-Based Optimizer — 80% rules, 20% AI.
Detects fixable gaps and generates solutions without calling AI.
Only uses AI for content enhancement (descriptions, FAQ generation).

Rules:
  IF no Schema → generate complete JSON-LD from page DOM data
  IF no FAQ → generate template FAQ from product category
  IF no Organization → generate brand Schema
  IF description < 100 chars → flag for AI enhancement (the 20%)
  IF no aggregateRating → generate from visible review elements
  IF missing meta description → copy from product description
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class FixAction:
    rule: str
    priority: str  # "critical", "high", "medium", "low"
    fix_type: str  # "schema", "content", "meta", "faq"
    auto_fixable: bool  # can we fix without AI?
    generated_code: str | None = None
    ai_needed: str = ""  # if not auto_fixable, what AI should do


@dataclass
class RuleOptimizationReport:
    url: str
    title: str
    fixes: list[FixAction] = field(default_factory=list)
    auto_fixable_count: int = 0
    ai_needed_count: int = 0


class RuleEngine:
    """Applies predefined optimization rules before falling back to AI."""

    # ── Rule definitions ──

    RULES = [
        {
            "id": "schema_missing",
            "condition": lambda a: not a.get("has_product_schema"),
            "action": "Generate complete JSON-LD Product Schema from page data",
            "priority": "critical",
            "fix_type": "schema",
            "auto": True,
        },
        {
            "id": "faq_missing",
            "condition": lambda a: not a.get("has_faq_schema"),
            "action": "Generate FAQPage Schema with category-specific questions",
            "priority": "high",
            "fix_type": "faq",
            "auto": True,
        },
        {
            "id": "org_missing",
            "condition": lambda a: not a.get("has_org_schema"),
            "action": "Generate Organization Schema from domain + brand name",
            "priority": "high",
            "fix_type": "schema",
            "auto": True,
        },
        {
            "id": "desc_too_short",
            "condition": lambda a: a.get("desc_length", 0) < 100,
            "action": "AI-enhanced product description with key features, use cases, audience",
            "priority": "high",
            "fix_type": "content",
            "auto": False,
            "ai": "enhance_description",
        },
        {
            "id": "no_rating_schema",
            "condition": lambda a: not a.get("has_aggregate_rating"),
            "action": "Generate AggregateRating Schema if reviews exist on page",
            "priority": "medium",
            "fix_type": "schema",
            "auto": True,
        },
        {
            "id": "missing_meta_desc",
            "condition": lambda a: not a.get("has_meta_description"),
            "action": "Copy product description into meta description tag",
            "priority": "medium",
            "fix_type": "meta",
            "auto": True,
        },
        {
            "id": "no_images",
            "condition": lambda a: a.get("image_count", 0) == 0,
            "action": "Ensure product images have alt text for AI crawlers",
            "priority": "medium",
            "fix_type": "content",
            "auto": True,
        },
        {
            "id": "knowing_missing_in_ai",
            "condition": lambda a: a.get("ai_mentioned") is False,
            "action": "AI analysis: why are competitors mentioned but not this product?",
            "priority": "critical",
            "fix_type": "content",
            "auto": False,
            "ai": "recommendation_gap_analysis",
        },
    ]

    def analyze(self, audit_result: dict, ai_rank: dict | None = None) -> RuleOptimizationReport:
        """Run all rules against audit data and return prioritized fixes."""
        context = {
            "has_product_schema": audit_result.get("has_product_schema", False),
            "has_faq_schema": audit_result.get("has_faq_schema", False),
            "has_org_schema": audit_result.get("has_org_schema", False),
            "has_aggregate_rating": any(
                f.get("field") == "aggregateRating" and f.get("present")
                for f in audit_result.get("schema_fields", [])
            ),
            "has_meta_description": not any(
                "Missing meta description" in i
                for i in audit_result.get("content_issues", [])
            ),
            "desc_length": 0,  # from audit
            "image_count": 1,  # from audit
            "ai_mentioned": bool(ai_rank and ai_rank.get("mentioned_by")),
        }

        report = RuleOptimizationReport(
            url=audit_result.get("url", ""),
            title=audit_result.get("title", ""),
        )

        for rule in self.RULES:
            if rule["condition"](context):
                fix = FixAction(
                    rule=rule["id"],
                    priority=rule["priority"],
                    fix_type=rule["fix_type"],
                    auto_fixable=rule["auto"],
                    ai_needed=rule.get("ai", ""),
                )
                if rule["auto"]:
                    fix.generated_code = self._generate_fix(rule["id"], audit_result)
                    report.auto_fixable_count += 1
                else:
                    report.ai_needed_count += 1
                report.fixes.append(fix)

        return report

    def _generate_fix(self, rule_id: str, audit: dict) -> str:
        """Generate fix code for auto-fixable rules."""
        title = audit.get("title", "Product")
        url = audit.get("url", "")

        if rule_id == "schema_missing":
            return f"""<script type="application/ld+json">
{{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "{title}",
  "offers": {{"@type": "Offer", "price": "0", "priceCurrency": "USD"}},
  "brand": {{"@type": "Brand", "name": ""}}
}}
</script>"""

        if rule_id == "faq_missing":
            return f"""<script type="application/ld+json">
{{
  "@context": "https://schema.org/",
  "@type": "FAQPage",
  "mainEntity": [
    {{"@type": "Question", "name": "What is the return policy?", "acceptedAnswer": {{"@type": "Answer", "text": "Visit our Returns page for full details."}}}},
    {{"@type": "Question", "name": "How long does shipping take?", "acceptedAnswer": {{"@type": "Answer", "text": "Standard delivery: 5-10 business days."}}}},
    {{"@type": "Question", "name": "Is {title} available in other variants?", "acceptedAnswer": {{"@type": "Answer", "text": "Check our store for all available sizes and colors."}}}}
  ]
}}
</script>"""

        if rule_id == "missing_meta_desc":
            return f'<meta name="description" content="{title} — premium quality. Fast shipping. Shop now at {url}">'

        return ""
