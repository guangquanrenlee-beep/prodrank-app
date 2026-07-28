"""
AI Shopping Index — Composite scoring engine.
Four-pillar model aligned with AI recommendation pipeline:

  Discover   — Can AI find your products?     (Schema + structured data)
  Understand — Does AI understand them?       (Knowledge + content quality)
  Trust      — Does AI believe in them?       (Reviews + citations + brand)
  Recommend  — Will AI actually recommend?    (Multi-agent recommendation rate)

Overall Score = weighted average of four pillars (25% each).
"""

from dataclasses import dataclass


@dataclass
class AIScore:
    overall: int  # 0-100
    discover: int
    understand: int
    trust: int
    recommend: int
    label: str
    recommendation: str


class AIScoringEngine:
    """Calculate AI Shopping Index from raw metrics."""

    def score_product(
        self,
        # Discover inputs
        schema_field_count: int = 0,
        max_fields: int = 12,
        has_product_schema: bool = False,
        has_faq_schema: bool = False,
        has_org_schema: bool = False,
        has_breadcrumb: bool = False,
        content_quality_score: int = 0,
        # Understand inputs
        knowledge_score: int = 0,
        knowledge_dimensions_covered: int = 0,
        knowledge_dimensions_total: int = 0,
        question_coverage_pct: int = 0,
        description_length: int = 0,
        # Trust inputs
        citation_count: int = 0,
        max_citations: int = 10,
        has_reviews: bool = False,
        review_count: int = 0,
        has_aggregate_rating: bool = False,
        reddit_mentions: int = 0,
        youtube_mentions: int = 0,
        media_mentions: int = 0,
        # Recommend inputs
        ai_mentioned: bool = False,
        agents_mentioned: int = 0,
        total_agents: int = 4,
        rank_position: int | None = None,
        competitor_count: int = 0,
    ) -> AIScore:
        """Calculate AI Shopping Index from raw metrics.

        Each pillar is 0-100. Overall = average of four.
        """

        # ── DISCOVER (25%) ── Can AI find your products?
        # Schema completeness is the primary signal
        schema_score = int((schema_field_count / max(max_fields, 1)) * 100)
        # Having Schema at all is a strong baseline
        if has_product_schema and schema_score < 40:
            schema_score = 40
        # Bonus for supporting schemas
        bonus = 0
        if has_faq_schema: bonus += 10
        if has_breadcrumb: bonus += 5
        if has_org_schema: bonus += 5
        discover = min(100, schema_score + bonus)

        # ── UNDERSTAND (25%) ── Does AI correctly understand your products?
        # Combines knowledge coverage + content quality
        if knowledge_dimensions_total > 0:
            knowledge_dim_score = int((knowledge_dimensions_covered / knowledge_dimensions_total) * 100)
        else:
            knowledge_dim_score = max(30, content_quality_score)

        if question_coverage_pct > 0:
            qc_score = question_coverage_pct
        else:
            qc_score = 30  # baseline for unmeasured

        content_score = content_quality_score if content_quality_score > 0 else (
            40 if description_length >= 200 else 30
        )
        understand = int(knowledge_dim_score * 0.4 + qc_score * 0.3 + content_score * 0.3)
        understand = max(20, min(100, understand))

        # ── TRUST (25%) ── Does AI believe in your products?
        # Citations + reviews + external mentions
        citation_score = min(100, max(5, int((citation_count / max(max_citations, 1)) * 100)))
        review_score = 0
        if has_aggregate_rating and review_count > 0:
            review_score = min(80, 50 + review_count * 2)
        elif has_reviews:
            review_score = 30
        else:
            review_score = 10  # no reviews at all

        # Social/media mentions
        social_score = min(50, reddit_mentions * 3 + youtube_mentions * 2 + media_mentions * 5)
        trust = int(citation_score * 0.40 + review_score * 0.35 + social_score * 0.25)
        trust = max(5, min(100, trust))

        # ── RECOMMEND (25%) ── Will AI actually recommend?
        if ai_mentioned and agents_mentioned > 0:
            mention_rate = agents_mentioned / max(total_agents, 1)
            if mention_rate >= 0.75:
                base = 80
            elif mention_rate >= 0.5:
                base = 65
            elif mention_rate >= 0.25:
                base = 50
            else:
                base = 40
            # Rank boost
            if rank_position and rank_position <= 3:
                base = min(100, base + 10)
        else:
            base = 25  # not mentioned by any AI

        # Competitor density penalty: more competitors = harder to stand out
        if competitor_count > 0:
            base = max(15, base - min(10, competitor_count * 2))

        recommend = base

        # ── OVERALL ──
        overall = int((discover + understand + trust + recommend) / 4)
        label, recommendation = self._label(overall, discover, understand, trust, recommend)

        return AIScore(
            overall=overall,
            discover=discover,
            understand=understand,
            trust=trust,
            recommend=recommend,
            label=label,
            recommendation=recommendation,
        )

    def score_from_intel(self, intel_report: dict, rank_report: dict | None = None) -> AIScore:
        """Calculate score from a full intelligence report + optional rank report."""
        schema = intel_report.get("schema_audit", {})
        ai_parse = intel_report.get("ai_parse", {})
        kg = intel_report.get("knowledge_gap", {})

        dimensions = ai_parse.get("knowledge_dimensions", []) if ai_parse else []
        dims_covered = sum(1 for d in dimensions if d.get("covered"))

        return self.score_product(
            schema_field_count=schema.get("field_count", 0),
            max_fields=schema.get("max_fields", 12),
            has_product_schema=schema.get("has_product_schema", False),
            has_faq_schema=schema.get("has_faq_schema", False),
            content_quality_score=schema.get("content_quality_score", 0),
            knowledge_score=ai_parse.get("knowledge_score", 0) if ai_parse else 0,
            knowledge_dimensions_covered=dims_covered,
            knowledge_dimensions_total=len(dimensions),
            question_coverage_pct=kg.get("coverage_pct", 0) if kg else 0,
            citation_count=len(rank_report.get("all_cited_sources", [])) if rank_report else 0,
            ai_mentioned=bool(rank_report.get("mentioned_by")) if rank_report else False,
            agents_mentioned=len(rank_report.get("mentioned_by", [])) if rank_report else 0,
        )

    @staticmethod
    def _label(overall: int, discover: int, understand: int, trust: int, recommend: int) -> tuple[str, str]:
        # Find the weakest pillar for targeted advice
        pillars = {"Discover": discover, "Understand": understand, "Trust": trust, "Recommend": recommend}
        weakest = min(pillars, key=pillars.get)

        if overall >= 80:
            return ("Excellent", f"AI agents know and recommend your products. Focus: maintain {weakest} score and expand to new keywords.")
        elif overall >= 60:
            return ("Good", f"AI agents recognize your products but {weakest} is holding you back. Prioritize {weakest} improvements.")
        elif overall >= 40:
            return ("Fair", f"AI agents have partial awareness. {weakest} critically low — fix Schema gaps and add structured content.")
        else:
            return ("Poor", "AI agents barely see your products. Start with Discover improvements: Schema injection and FAQ.")
