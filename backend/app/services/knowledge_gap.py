"""
Knowledge Gap Engine — Layer 2 of ProdRank
Detects what questions AI answers about a category vs what the product page covers.

Answers: "AI answers 267 questions about winter jackets. Your page covers 83. Here are the 184 you're missing."
"""

import re
from dataclasses import dataclass, field

from openai import AsyncOpenAI

from app.core.config import get_settings


@dataclass
class QuestionGap:
    question: str
    covered: bool
    ai_frequently_answers: bool
    priority: str  # "high", "medium", "low"


@dataclass
class CategoryQuestions:
    category: str
    total_ai_questions: int
    covered_questions: int
    gaps: list[QuestionGap] = field(default_factory=list)
    top_missing: list[str] = field(default_factory=list)


class KnowledgeGapEngine:
    """Detects question coverage gaps between AI answers and product pages."""

    def __init__(self):
        settings = get_settings()
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
        self.model = "google/gemini-3.6-flash"

    async def detect_gaps(
        self, category: str, product_description: str, existing_faq: list[str] | None = None
    ) -> CategoryQuestions:
        """
        Find what questions AI frequently answers about a category,
        and how many of those the product page covers.
        """
        report = CategoryQuestions(category=category, total_ai_questions=0, covered_questions=0)

        # 1. Ask AI: what questions do you most frequently answer about this category?
        questions_prompt = (
            f"List the 15 most common questions shoppers ask about {category}. "
            f"These are questions you (an AI assistant) frequently encounter and answer. "
            f"Output one question per line, no numbering, no markdown."
        )
        ai_questions = await self._ask(questions_prompt)
        if not ai_questions:
            return report

        all_questions = [q.strip() for q in ai_questions.split("\n") if q.strip() and "?" in q]
        report.total_ai_questions = len(all_questions)

        # 2. Check coverage: which of these does the product page answer?
        existing_text = (product_description or "") + " " + " ".join(existing_faq or [])
        for q in all_questions:
            covered = self._check_coverage(q, existing_text)
            priority = self._priority(q)
            report.gaps.append(QuestionGap(
                question=q, covered=covered,
                ai_frequently_answers=True,
                priority=priority,
            ))
            if covered:
                report.covered_questions += 1

        report.top_missing = [g.question for g in report.gaps if not g.covered][:10]

        return report

    async def _ask(self, prompt: str) -> str | None:
        try:
            resp = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=400,
                timeout=20.0,
            )
            return resp.choices[0].message.content
        except Exception:
            return None

    def _check_coverage(self, question: str, page_text: str) -> bool:
        """Simple keyword overlap check for question coverage."""
        keywords = re.findall(r"[a-z]{4,}", question.lower())
        if not keywords:
            return False
        text_lower = page_text.lower()
        matches = sum(1 for kw in keywords if kw in text_lower)
        return matches >= len(keywords) * 0.4

    def _priority(self, question: str) -> str:
        """Assign priority based on question type."""
        q = question.lower()
        if any(w in q for w in ["price", "cost", "cheap", "expensive", "worth"]):
            return "high"
        if any(w in q for w in ["best", "vs", "compare", "alternative", "difference"]):
            return "high"
        if any(w in q for w in ["size", "fit", "material", "waterproof", "wash", "care"]):
            return "medium"
        return "low"
