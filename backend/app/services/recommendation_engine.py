"""
Recommendation Engine — Layer 3 of ProdRank
Three sub-engines:
  1. Reason Engine: WHY did AI recommend (or not) a product?
  2. Opportunity Engine: Which SKUs should you optimize first?
  3. Entity Intelligence: What does AI think about a product?
"""

import json
import re
from dataclasses import dataclass, field

from openai import AsyncOpenAI

from app.core.config import get_settings


@dataclass
class ReasonBreakdown:
    """Why AI recommended (or didn't) a specific product."""
    product_name: str
    keyword: str
    ai_agent: str
    recommended: bool
    reasons: list[str] = field(default_factory=list)  # why recommended
    barriers: list[str] = field(default_factory=list)  # why NOT recommended
    missing_signals: list[str] = field(default_factory=list)  # what competitor had that you didn't
    full_explanation: str = ""


@dataclass
class OpportunitySKU:
    """A SKU ranked by optimization ROI."""
    product_name: str
    search_volume_score: int  # 0-100
    ai_coverage_score: int    # 0-100 (lower = bigger gap)
    competition_score: int    # 0-100 (lower = less competition)
    roi_score: int            # composite 0-100
    recommended_action: str = ""


@dataclass
class EntityIntel:
    """AI's understanding of a product — pros, cons, positioning."""
    product_name: str
    ai_agent: str
    pros: list[str] = field(default_factory=list)
    cons: list[str] = field(default_factory=list)
    best_for: str = ""
    worst_for: str = ""
    price_perception: str = ""
    brand_perception: str = ""
    differentiation: str = ""  # what AI thinks sets this apart
    is_understood: bool = False  # does AI actually know this product?


class RecommendationEngine:
    """Analyzes AI recommendation patterns to explain WHY and prioritize WHAT."""

    def __init__(self):
        from app.services.llm import get_content_client
        self.client, self.model = get_content_client()
        self.model_fast = "google/gemini-3.6-flash"
        # The "gemini" leg keeps its ofox identity — reason/entity analysis
        # compares agents side by side, so the model must not drift.
        self.ofox = AsyncOpenAI(api_key=get_settings().openai_api_key, base_url=get_settings().openai_base_url)

    # ── 1. Reason Engine ──

    async def analyze_reasons(
        self, product_name: str, keyword: str, brand: str = "", competitor: str = ""
    ) -> list[ReasonBreakdown]:
        """Ask AI: why did you recommend (or not) this product? Get the breakdown."""
        results = []

        agents = [
            ("chatgpt", self.model, self.client),
            ("gemini", self.model_fast, self.ofox),
        ]

        for agent_name, model, client in agents:
            prompt = (
                f"Act as an honest shopping advisor. Explain why you would or would not "
                f"recommend {product_name}" + (f" by {brand}" if brand else "") +
                f" when someone searches for '{keyword}'.\n\n"
                f"Format your answer as JSON:\n"
                f'{{"recommended": true/false, "reasons": ["..."], "barriers": ["..."], '
                f'"missing_signals": ["what competitor has that this product lacks"], '
                f'"full_explanation": "..."}}\n\n'
                f'{"Compare against: " + competitor if competitor else ""}'
            )

            try:
                resp = await client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": "You analyze product recommendations honestly. Output valid JSON only."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.3,
                    max_tokens=600,
                    timeout=30.0,
                )
                raw = resp.choices[0].message.content or ""
                data = self._parse_json(raw)
                results.append(ReasonBreakdown(
                    product_name=product_name,
                    keyword=keyword,
                    ai_agent=agent_name,
                    recommended=data.get("recommended", False),
                    reasons=data.get("reasons", []),
                    barriers=data.get("barriers", []),
                    missing_signals=data.get("missing_signals", []),
                    full_explanation=data.get("full_explanation", raw[:300]),
                ))
            except Exception as e:
                results.append(ReasonBreakdown(
                    product_name=product_name, keyword=keyword,
                    ai_agent=agent_name, recommended=False,
                    full_explanation=f"Error: {e}",
                ))

        return results

    # ── 2. Opportunity Engine ──

    async def rank_opportunities(
        self, brand: str, products: list[dict], category: str
    ) -> list[OpportunitySKU]:
        """
        Given a list of products, rank them by optimization ROI.
        products = [{"name": "...", "search_volume": 5000, "ai_mentioned": False}, ...]
        """
        opportunities = []

        for p in products:
            sv = min(100, (p.get("search_volume", 0) or 0) // 50)  # normalize
            ai_cov = 80 if not p.get("ai_mentioned") else 20  # gap = opportunity
            comp = (p.get("competition", 50) or 50)
            roi = int(sv * 0.4 + ai_cov * 0.35 + (100 - comp) * 0.25)

            action = ""
            if roi >= 70:
                action = "High priority — optimize Schema + FAQ immediately"
            elif roi >= 50:
                action = "Medium priority — add FAQ and structured content"
            else:
                action = "Low priority — AI already covers or search volume too low"

            opportunities.append(OpportunitySKU(
                product_name=p.get("name", "Unknown"),
                search_volume_score=sv,
                ai_coverage_score=100 - ai_cov,
                competition_score=comp,
                roi_score=roi,
                recommended_action=action,
            ))

        opportunities.sort(key=lambda x: x.roi_score, reverse=True)
        return opportunities

    # ── 3. Entity Intelligence ──

    async def profile_entity(
        self, product_name: str, brand: str = ""
    ) -> tuple[EntityIntel, EntityIntel]:
        """Ask two AI agents to independently profile a product. Returns (chatgpt, gemini) views."""
        import asyncio

        prompt = (
            f"Profile {product_name}" + (f" by {brand}" if brand else "") +
            f". Be honest and specific. Output as JSON:\n"
            f'{{"pros":["..."],"cons":["..."],"best_for":"...","worst_for":"...",'
            f'"price_perception":"...","brand_perception":"...","differentiation":"...",'
            f'"is_understood":true/false}}\n\n'
            f'Only set is_understood=true if you have real, specific knowledge of this product.'
        )

        results = await asyncio.gather(
            self._ask_json(self.model, prompt),
            self._ask_json(self.model_fast, prompt, client=self.ofox),
            return_exceptions=True,
        )

        entities = []
        for i, data in enumerate(results):
            agent = ["chatgpt", "gemini"][i]
            if isinstance(data, dict):
                entities.append(EntityIntel(
                    product_name=product_name, ai_agent=agent,
                    pros=data.get("pros", []), cons=data.get("cons", []),
                    best_for=data.get("best_for", ""), worst_for=data.get("worst_for", ""),
                    price_perception=data.get("price_perception", ""),
                    brand_perception=data.get("brand_perception", ""),
                    differentiation=data.get("differentiation", ""),
                    is_understood=data.get("is_understood", False),
                ))
            else:
                entities.append(EntityIntel(
                    product_name=product_name, ai_agent=agent, is_understood=False
                ))

        return tuple(entities)  # (chatgpt, gemini)

    async def _ask_json(self, model: str, prompt: str, client=None) -> dict:
        try:
            resp = await (client or self.client).chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2, max_tokens=500, timeout=30.0,
            )
            return self._parse_json(resp.choices[0].message.content or "")
        except Exception:
            return {}

    @staticmethod
    def _parse_json(raw: str) -> dict:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        return {}
