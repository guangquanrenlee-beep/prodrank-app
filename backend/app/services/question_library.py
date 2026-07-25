"""
Self-Growing Question Library
Post-launch, every new category encountered → auto-generate consumer questions.
Questions are phrased as what real shoppers ask AI agents — not SEO keywords.

Design principles:
  1. Consumer language: "Is this jacket warm enough for skiing?" not "best winter jacket SEO"
  2. Auto-expanding: new category → AI generates questions → stored → reused
  3. Prioritized: questions with highest search volume / AI coverage gap shown first
  4. Deduplicated: same question across categories → merged
"""

import json
import os
import time
from dataclasses import dataclass, field
from typing import Any

from openai import AsyncOpenAI

from app.core.config import get_settings


@dataclass
class Question:
    text: str
    category: str
    question_type: str  # "comparison", "recommendation", "attribute", "price", "usage", "care"
    search_volume: int = 0
    ai_coverage_pct: int = 0  # % of AI agents that answer this question for this category
    source: str = "auto"  # "seed", "ai-generated", "user-site"
    added_at: float = field(default_factory=time.time)


QUESTION_TYPES = {
    "comparison": "vs, versus, compare, difference, better, or, alternative",
    "recommendation": "best, top, recommend, worth, good, should I buy",
    "attribute": "waterproof, warm, size, weight, material, battery, dimension, feature, spec",
    "price": "price, cost, cheap, expensive, budget, worth, under, over, deal, discount",
    "usage": "how to use, how to wear, how to install, how to set up, how to clean, how to wash",
    "care": "maintenance, care, repair, warranty, return, guarantee, durability, last, lifespan",
}


class QuestionLibrary:
    """Self-growing library of consumer shopping questions for AI agent testing."""

    def __init__(self, storage_path: str = ""):
        settings = get_settings()
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
        self.model = "anthropic/claude-haiku-4.5"
        self._storage = storage_path or os.path.join(
            os.path.dirname(__file__), "..", "..", "data", "question_library.json"
        )
        self._questions: dict[str, list[Question]] = {}
        self._load()

    def _load(self):
        """Load existing question library from disk."""
        try:
            os.makedirs(os.path.dirname(self._storage), exist_ok=True)
            if os.path.exists(self._storage):
                with open(self._storage, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for cat, qs in data.items():
                        self._questions[cat] = [
                            Question(**q) for q in qs
                        ]
        except Exception:
            pass

    def _save(self):
        """Persist to Supabase + local file backup."""
        # Save to Supabase
        try:
            from app.services.db import DB
            db = DB()
            all_qs = []
            for cat, qs in self._questions.items():
                for q in qs:
                    all_qs.append({"text": q.text, "category": q.category, "volume": q.search_volume, "coverage": q.ai_coverage_pct})
            db.save_questions_batch(all_qs)
        except Exception:
            pass
        # Local JSON backup
        try:
            os.makedirs(os.path.dirname(self._storage), exist_ok=True)
            data = {cat: [{"text": q.text, "category": q.category, "question_type": q.question_type, "search_volume": q.search_volume, "ai_coverage_pct": q.ai_coverage_pct, "source": q.source, "added_at": q.added_at} for q in qs] for cat, qs in self._questions.items()}
            with open(self._storage, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception:
            pass

    def get_or_generate(self, category: str, count: int = 15) -> list[Question]:
        """Get questions for a category. If not enough exist, AI-generate more.
        Note: AI generation is async — call from async context to get real questions.
        From sync context, falls back to basic templates."""
        existing = self._questions.get(category, [])

        if len(existing) >= count:
            return existing[:count]

        # Generate basic fallback questions (AI generation needs async, done separately)
        needed = count - len(existing)
        fallback = [
            Question(text=f"best {category}", category=category,
                     question_type="recommendation", source="fallback"),
            Question(text=f"best budget {category}", category=category,
                     question_type="price", source="fallback"),
            Question(text=f"is {category} worth it", category=category,
                     question_type="recommendation", source="fallback"),
            Question(text=f"how to choose a {category}", category=category,
                     question_type="usage", source="fallback"),
        ]
        all_qs = existing + fallback[:needed]
        self._questions[category] = all_qs
        self._save()
        return all_qs

    async def generate_async(self, category: str, count: int = 15) -> list[Question]:
        """AI-generate real consumer shopping questions for a category (async)."""
        prompt = (
            f"Generate {count} real questions that online shoppers would ask an AI assistant "
            f"(like ChatGPT or Perplexity) when shopping for '{category}'.\n\n"
            f"Rules:\n"
            f"- Use natural, conversational language (how real people talk)\n"
            f"- Include at least 3 question types: comparison (X vs Y), recommendation (best X), "
            f"attribute questions (is it waterproof?), price questions, and usage questions\n"
            f"- No SEO keywords — these should sound like a friend asking for advice\n"
            f"- One question per line\n"
            f"- No numbering, no markdown\n\n"
            f"Examples for 'winter jackets':\n"
            f"is this jacket actually warm enough for a Chicago winter\n"
            f"what's the difference between down and synthetic insulation\n"
            f"do I really need a $400 jacket or will a $150 one work\n"
            f"can I wear this skiing and also to work\n"
            f"how long will a good winter jacket last"
        )

        questions = []
        try:
            resp = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.8, max_tokens=500, timeout=30.0,
            )
            raw = resp.choices[0].message.content or ""
            for line in raw.split("\n"):
                line = line.strip().rstrip(".,;")
                if not line or len(line) < 10 or line.startswith("#"):
                    continue
                qtype = self._classify(line)
                questions.append(Question(
                    text=line, category=category,
                    question_type=qtype, source="ai-generated",
                ))
        except Exception:
            pass

        if not questions:
            questions = [
                Question(text=f"best {category}", category=category,
                         question_type="recommendation", source="fallback"),
                Question(text=f"best budget {category}", category=category,
                         question_type="price", source="fallback"),
                Question(text=f"is {category} worth it", category=category,
                         question_type="recommendation", source="fallback"),
                Question(text=f"how to choose a {category}", category=category,
                         question_type="usage", source="fallback"),
            ]

        # Store generated questions
        existing = self._questions.get(category, [])
        self._questions[category] = existing + questions
        self._save()
        return questions[:count]

    def _classify(self, text: str) -> str:
        """Classify a question into a type based on keyword matching."""
        t = text.lower()
        for qtype, keywords in QUESTION_TYPES.items():
            if any(kw in t for kw in keywords.split(", ")):
                return qtype
        return "recommendation"

    def add_from_site(self, category: str, questions: list[str]):
        """Add questions discovered from a user's site/category."""
        existing_texts = {q.text.lower() for q in self._questions.get(category, [])}
        for text in questions:
            if text.lower() not in existing_texts:
                self._questions.setdefault(category, []).append(Question(
                    text=text, category=category,
                    question_type=self._classify(text),
                    source="user-site",
                ))
                existing_texts.add(text.lower())
        self._save()

    def top_gaps(self, category: str, limit: int = 10) -> list[Question]:
        """Return questions with the lowest AI coverage — biggest optimization opportunities."""
        qs = self._questions.get(category, [])
        qs.sort(key=lambda q: q.ai_coverage_pct)
        return qs[:limit]

    def stats(self) -> dict:
        """Library statistics."""
        total = sum(len(v) for v in self._questions.values())
        return {
            "total_questions": total,
            "categories": len(self._questions),
            "by_type": {
                qtype: sum(
                    1 for qs in self._questions.values()
                    for q in qs if q.question_type == qtype
                )
                for qtype in QUESTION_TYPES
            },
            "largest_categories": sorted(
                [(cat, len(qs)) for cat, qs in self._questions.items()],
                key=lambda x: x[1], reverse=True
            )[:10],
        }
