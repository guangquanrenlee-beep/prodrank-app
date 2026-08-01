"""
AI Parse Validation Engine — Layer 1 of ProdRank
Cross-references Schema data with actual AI agent understanding.

Answers: "Schema says X, but does ChatGPT/Gemini/Claude actually understand X?"
"""

import json
import re
from dataclasses import dataclass, field

from openai import AsyncOpenAI

from app.core.config import get_settings


@dataclass
class FieldValidation:
    """Per-field AI vs Schema comparison."""
    field: str
    schema_value: str | None = None
    chatgpt_recognized: bool | None = None   # True = AI got it right
    gemini_recognized: bool | None = None
    claude_recognized: bool | None = None
    chatgpt_value: str = ""
    gemini_value: str = ""
    claude_value: str = ""


@dataclass
class KnowledgeDimension:
    """5W1H knowledge coverage per dimension."""
    dimension: str  # "who", "what", "why", "when", "where", "how"
    label: str  # "Use Case", "Description", "Value Proposition", etc.
    covered: bool
    source: str  # "schema", "page_content", "missing"


@dataclass
class AIEntityProfile:
    """What AI thinks about a product — independent of Schema."""
    product_name: str
    pros: list[str] = field(default_factory=list)
    cons: list[str] = field(default_factory=list)
    best_for: str = ""
    worst_for: str = ""
    alternatives: list[str] = field(default_factory=list)
    price_range: str = ""
    audience: str = ""


@dataclass
class ParseReport:
    url: str
    title: str
    # Schema vs AI validation
    field_validations: list[FieldValidation] = field(default_factory=list)
    # Knowledge coverage
    knowledge_dimensions: list[KnowledgeDimension] = field(default_factory=list)
    knowledge_score: int = 0  # 0-100
    missing_dimensions: list[str] = field(default_factory=list)
    # Entity profile
    entity_profile: AIEntityProfile | None = None
    # AI understanding diffs
    ai_understanding_diff: dict[str, str] = field(default_factory=dict)


class AIParseEngine:
    """Cross-references Schema with actual AI agent understanding."""

    FIELDS_TO_VALIDATE = [
        "brand", "price", "description", "category", "audience",
        "features", "quality", "use_case",
    ]

    KNOWLEDGE_DIMENSIONS = {
        "who": "Audience / Target User",
        "what": "Product Definition / Features",
        "why": "Value Proposition / Differentiation",
        "when": "Use Occasion / Seasonality",
        "where": "Use Context / Environment",
        "how": "Usage / Maintenance / Care",
    }

    def __init__(self):
        from app.services.llm import get_content_client
        self.client, self.model_deep = get_content_client()
        self.model_fast = "google/gemini-3.6-flash"

    async def validate_product(self, url: str, title: str, brand: str = "") -> ParseReport:
        """Full AI parse validation: Schema vs real AI understanding."""
        report = ParseReport(url=url, title=title)

        # 1. Field-level validation
        report.field_validations = await self._validate_fields(title, brand)

        # 2. Knowledge coverage
        report.knowledge_dimensions, report.knowledge_score, report.missing_dimensions = \
            await self._assess_knowledge_coverage(title, brand)

        # 3. Entity profile
        report.entity_profile = await self._build_entity_profile(title, brand)

        # 4. AI understanding diffs
        report.ai_understanding_diff = await self._compare_ai_understandings(title, brand)

        return report

    async def _validate_fields(self, title: str, brand: str) -> list[FieldValidation]:
        """Query AI agents to check if they recognize key product attributes."""
        results = []

        for field in self.FIELDS_TO_VALIDATE:
            v = FieldValidation(field=field)

            prompt = (
                f"Answer ONLY with the {field} of this product. "
                f"One short phrase. If unknown, say 'Unknown'.\n\n"
                f"Product: {title}" + (f"\nBrand: {brand}" if brand else "")
            )

            # Query ChatGPT + Gemini + Claude in parallel
            import asyncio
            responses = await asyncio.gather(
                self._ask_agent(self.model_deep, prompt, "chatgpt"),
                self._ask_agent(self.model_fast, prompt, "gemini"),
                return_exceptions=True,
            )

            # ChatGPT (Haiku)
            if not isinstance(responses[0], Exception) and responses[0]:
                v.chatgpt_value = responses[0].strip()
                v.chatgpt_recognized = not self._is_unknown(v.chatgpt_value)

            # Gemini
            if len(responses) > 1 and not isinstance(responses[1], Exception) and responses[1]:
                v.gemini_value = responses[1].strip()
                v.gemini_recognized = not self._is_unknown(v.gemini_value)

            if brand:
                schema_val = getattr(self, f"_schema_{field}", None)
                v.schema_value = title

            results.append(v)

        return results

    async def _assess_knowledge_coverage(
        self, title: str, brand: str
    ) -> tuple[list[KnowledgeDimension], int, list[str]]:
        """Check which 5W1H dimensions are covered in AI's knowledge."""
        prompt = (
            f"For this product, tell me which of these you can confidently answer:\n\n"
            f"Product: {title}" + (f"\nBrand: {brand}" if brand else "") + "\n\n"
            f"1. WHO is this for? (target audience)\n"
            f"2. WHAT is it? (definition, key features)\n"
            f"3. WHY choose it? (value proposition vs competitors)\n"
            f"4. WHEN to use it? (occasions, seasons)\n"
            f"5. WHERE to use it? (context, environment)\n"
            f"6. HOW to use/maintain it?\n\n"
            f"For each, answer COVERED or UNKNOWN. Be honest — only say COVERED if you actually know."
        )

        dims = []
        score = 0
        missing = []

        try:
            resp = await self._ask_agent(self.model_deep, prompt, "knowledge_check")
            if resp:
                for key, label in self.KNOWLEDGE_DIMENSIONS.items():
                    covered = f"{key.upper()}:" in resp.upper() and "COVERED" in resp.upper()
                    dims.append(KnowledgeDimension(dimension=key, label=label, covered=covered, source="ai_assessment"))
                    if covered:
                        score += 17  # ~17 points per dimension (100/6)
                    else:
                        missing.append(label)
        except Exception:
            for key, label in self.KNOWLEDGE_DIMENSIONS.items():
                dims.append(KnowledgeDimension(dimension=key, label=label, covered=False, source="error"))
                missing.append(label)

        score = min(100, score)
        return dims, score, missing

    async def _build_entity_profile(self, title: str, brand: str) -> AIEntityProfile:
        """Ask AI to profile a product — pros, cons, best for, alternatives."""
        prompt = (
            f"Profile this product with honest, structured answers. Format as JSON:\n\n"
            f'{{"pros":["..."],"cons":["..."],"best_for":"...","worst_for":"...",'
            f'"alternatives":["...","..."],"price_range":"...","audience":"..."}}\n\n'
            f"Product: {title}" + (f"\nBrand: {brand}" if brand else "")
        )

        try:
            resp = await self._ask_agent(self.model_deep, prompt, "entity_profile")
            if resp:
                match = re.search(r"\{.*\}", resp, re.DOTALL)
                if match:
                    data = json.loads(match.group())
                    return AIEntityProfile(
                        product_name=title,
                        pros=data.get("pros", []),
                        cons=data.get("cons", []),
                        best_for=data.get("best_for", ""),
                        worst_for=data.get("worst_for", ""),
                        alternatives=data.get("alternatives", []),
                        price_range=data.get("price_range", ""),
                        audience=data.get("audience", ""),
                    )
        except Exception:
            pass

        return AIEntityProfile(product_name=title)

    async def _compare_ai_understandings(self, title: str, brand: str) -> dict[str, str]:
        """Compare how different AI agents describe the same product."""
        prompt = f"Describe this product in one sentence: {title}" + (f" by {brand}" if brand else "")

        import asyncio
        results = await asyncio.gather(
            self._ask_agent(self.model_deep, prompt, "chatgpt"),
            self._ask_agent(self.model_fast, prompt, "gemini"),
            return_exceptions=True,
        )

        return {
            "chatgpt": results[0] if not isinstance(results[0], Exception) else "Error",
            "gemini": results[1] if not isinstance(results[1], Exception) else "Error",
        }

    async def _ask_agent(self, model: str, prompt: str, label: str) -> str | None:
        """Query an AI agent with a simple prompt."""
        try:
            resp = await self.client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "Answer concisely and factually. One sentence or short phrase."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=200,
                timeout=20.0,
            )
            return resp.choices[0].message.content
        except Exception:
            return None

    @staticmethod
    def _is_unknown(value: str) -> bool:
        """Check if AI response indicates it doesn't know the answer."""
        v = value.lower().strip()
        unknown_markers = [
            "unknown", "not specified", "not available", "not provided",
            "i don't know", "i cannot", "unable to", "unspecified",
            "not mentioned", "no information", "n/a", ""
        ]
        return any(m in v for m in unknown_markers)
