"""
AI Shopping Index — Composite scoring engine.
One number that tells a brand/store owner exactly where they stand.

Weighted composite:
  Knowledge Coverage    25%
  Question Coverage     20%
  Citation Authority    20%
  Recommendation Freq   15%
  External Evidence     10%
  Product Completeness  10%
"""

from dataclasses import dataclass, field


@dataclass
class AIScore:
    overall: int  # 0-100
    knowledge_coverage: int
    question_coverage: int
    citation_authority: int
    recommendation_frequency: int
    external_evidence: int
    product_completeness: int
    label: str  # "Excellent", "Good", "Fair", "Poor"
    recommendation: str


class AIScoringEngine:
    """Calculate the composite AI Shopping Index for a product or site."""

    WEIGHTS = {
        "knowledge_coverage": 0.25,
        "question_coverage": 0.20,
        "citation_authority": 0.20,
        "recommendation_frequency": 0.15,
        "external_evidence": 0.10,
        "product_completeness": 0.10,
    }

    def score_product(
        self,
        schema_field_count: int = 0,
        max_fields: int = 12,
        content_quality_score: int = 0,
        knowledge_score: int = 0,
        question_coverage_pct: int = 0,
        citation_count: int = 0,
        max_citations: int = 10,
        ai_mentioned: bool = False,
        total_agents: int = 4,
        has_external_reviews: bool = False,
    ) -> AIScore:
        """Calculate AI Shopping Index from raw metrics."""

        # Product completeness = Schema + content quality
        schema_score = int((schema_field_count / max(max_fields, 1)) * 100)
        pc = int(schema_score * 0.6 + content_quality_score * 0.4)
        # Baseline: having ANY Schema is a good start
        if schema_field_count > 0 and pc < 40:
            pc = 40

        # Knowledge coverage — default to content score if not measured
        kc = knowledge_score if knowledge_score > 0 else max(pc, 50)

        # Question coverage — default to 30 if not measured (not zero)
        qc = question_coverage_pct if question_coverage_pct > 0 else 30

        # Citation authority
        ca = min(100, max(10, int((citation_count / max(max_citations, 1)) * 100)))

        # Recommendation frequency
        rf = 80 if ai_mentioned else 30

        # External evidence
        ee = 60 if has_external_reviews else 20

        overall = int(
            kc * self.WEIGHTS["knowledge_coverage"] +
            qc * self.WEIGHTS["question_coverage"] +
            ca * self.WEIGHTS["citation_authority"] +
            rf * self.WEIGHTS["recommendation_frequency"] +
            ee * self.WEIGHTS["external_evidence"] +
            pc * self.WEIGHTS["product_completeness"]
        )

        label, recommendation = self._label(overall)
        return AIScore(
            overall=overall, knowledge_coverage=kc, question_coverage=qc,
            citation_authority=ca, recommendation_frequency=rf,
            external_evidence=ee, product_completeness=pc,
            label=label, recommendation=recommendation,
        )

    def score_from_intel(self, intel_report: dict, rank_report: dict | None = None) -> AIScore:
        """Calculate score from a full intelligence report + optional rank report."""
        schema = intel_report.get("schema_audit", {})
        ai_parse = intel_report.get("ai_parse", {})
        kg = intel_report.get("knowledge_gap", {})

        return self.score_product(
            schema_field_count=schema.get("field_count", 0),
            max_fields=schema.get("max_fields", 12),
            content_quality_score=schema.get("content_quality_score", 0),
            knowledge_score=ai_parse.get("knowledge_score", 0) if ai_parse else 0,
            question_coverage_pct=kg.get("coverage_pct", 0) if kg else 0,
            citation_count=len(rank_report.get("all_cited_sources", [])) if rank_report else 0,
            ai_mentioned=bool(rank_report.get("mentioned_by")) if rank_report else False,
        )

    @staticmethod
    def _label(score: int) -> tuple[str, str]:
        if score >= 80:
            return ("Excellent", "Your products are well-understood by AI agents. Focus on expanding to new keywords.")
        elif score >= 60:
            return ("Good", "AI agents recognize your products but coverage gaps remain. Prioritize FAQ and citations.")
        elif score >= 40:
            return ("Fair", "AI agents have partial awareness. Fix Schema gaps and add structured content.")
        else:
            return ("Poor", "AI agents barely see your products. Start with basic Schema injection and FAQ.")
