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
        # The "gemini" leg keeps its ofox identity — parse reports compare
        # ChatGPT vs Gemini vs Schema, so the model must not drift.
        self.ofox = AsyncOpenAI(api_key=get_settings().openai_api_key, base_url=get_settings().openai_base_url)

    async def validate_product(self, url: str, title: str, brand: str = "",
                               schema_values: dict | None = None,
                               description: str = "",
                               progress_cb=None) -> ParseReport:
        """Full AI parse validation: Schema vs real AI understanding.

        schema_values: field-name → value map from the page's JSON-LD, so the
        "Your Page" column shows what the schema actually says (not the title).
        description: page description/body text — WITHOUT it the agents can
        only guess from the title and every field reads "Not found".
        progress_cb: optional async callback(kind, payload) fired as stages
        complete ("fields" → (done, total); "knowledge"/"entity"/"compare" →
        stage finished). Lets the API expose live progress to the frontend.
        """
        report = ParseReport(url=url, title=title)

        import asyncio

        # All four stages are independent — run them concurrently. Field
        # validation used to serialize 8 field-batches (~32s); with all 16
        # agent calls scheduled under one semaphore it finishes in ~2 batches.
        async def wrap(coro, kind):
            try:
                return await coro
            finally:
                if progress_cb:
                    await progress_cb(kind, None)

        f_task = asyncio.create_task(self._validate_fields(title, brand, schema_values, description, progress_cb))
        k_task = asyncio.create_task(wrap(self._assess_knowledge_coverage(title, brand), "knowledge"))
        e_task = asyncio.create_task(wrap(self._build_entity_profile(title, brand), "entity"))
        c_task = asyncio.create_task(wrap(self._compare_ai_understandings(title, brand), "compare"))

        report.field_validations, kd, report.entity_profile, report.ai_understanding_diff = \
            await asyncio.gather(f_task, k_task, e_task, c_task)
        report.knowledge_dimensions, report.knowledge_score, report.missing_dimensions = kd

        return report

    async def _validate_fields(self, title: str, brand: str,
                               schema_values: dict | None = None,
                               description: str = "",
                               progress_cb=None) -> list[FieldValidation]:
        """Query AI agents to check if they recognize key product attributes.

        All 16 agent calls (8 fields × 2 agents) run concurrently under one
        semaphore; progress_cb receives (done, total) after each response.
        """
        import asyncio

        schema_values = schema_values or {}
        fields = self.FIELDS_TO_VALIDATE
        total = len(fields) * 2
        done = 0
        sem = asyncio.Semaphore(8)
        lock = asyncio.Lock()
        desc_ctx = (description or "").strip()[:1500]

        async def ask(field: str, client, model: str, label: str) -> FieldValidation:
            nonlocal done
            v = FieldValidation(field=field)
            # "Your Page" value: what the JSON-LD actually states for this
            # field. Absent fields stay None → UI shows "—" (honest, not a
            # title placeholder).
            v.schema_value = schema_values.get(field)

            prompt = (
                f"Answer ONLY with the {field} of this product. "
                f"One short phrase. If unknown, say 'Unknown'.\n\n"
                f"Product: {title}" + (f"\nBrand: {brand}" if brand else "") +
                (f"\nPage description: {desc_ctx}" if desc_ctx else "")
            )

            async with sem:
                resp = await self._ask_agent(model, prompt, label, client=client)
            if resp:
                setattr(v, f"{label}_value", resp.strip())
                setattr(v, f"{label}_recognized", not self._is_unknown(resp.strip()))

            async with lock:
                done += 1
                if progress_cb:
                    await progress_cb("fields", (done, total))
            return v

        tasks = [
            asyncio.create_task(ask(f, self.client, self.model_deep, "chatgpt"))
            for f in fields
        ] + [
            asyncio.create_task(ask(f, self.ofox, self.model_fast, "gemini"))
            for f in fields
        ]
        results = await asyncio.gather(*tasks)

        merged = {f: FieldValidation(field=f, schema_value=schema_values.get(f)) for f in fields}
        for r in results:
            m = merged[r.field]
            if r.chatgpt_value:
                m.chatgpt_value, m.chatgpt_recognized = r.chatgpt_value, r.chatgpt_recognized
            if r.gemini_value:
                m.gemini_value, m.gemini_recognized = r.gemini_value, r.gemini_recognized
        return [merged[f] for f in fields]

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
            self._ask_agent(self.model_fast, prompt, "gemini", client=self.ofox),
            return_exceptions=True,
        )

        return {
            "chatgpt": results[0] if not isinstance(results[0], Exception) else "Error",
            "gemini": results[1] if not isinstance(results[1], Exception) else "Error",
        }

    async def _ask_agent(self, model: str, prompt: str, label: str, client=None) -> str | None:
        """Query an AI agent with a simple prompt."""
        try:
            resp = await (client or self.client).chat.completions.create(
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
            "not mentioned", "no information", "n/a",
        ]
        # Note: "" is NOT a marker — `"" in v` is True for every string,
        # which would flag every real answer as unknown.
        return not v or any(m in v for m in unknown_markers)
