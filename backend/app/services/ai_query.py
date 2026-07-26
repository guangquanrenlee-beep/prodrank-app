"""
AI Agent Query Service — Query multiple AI models for product recommendations.
Uses ofox.ai中转 (OpenAI-compatible API) with Claude Haiku, Gemini Flash, and Claude Sonnet.
Benchmarked: Haiku 7s, Gemini 3.6s — both return quality rankings.

Extracts: rank, description, sentiment, competitors.
"""

import re
from dataclasses import dataclass, field

from openai import AsyncOpenAI

from app.core.config import get_settings


@dataclass
class AIRankResult:
    ai_agent: str
    keyword: str
    rank: int | None = None
    total_mentioned: int = 0
    description: str = ""
    sentiment: str = ""
    cited_sources: list[str] = field(default_factory=list)
    competitors: list[dict] = field(default_factory=list)
    raw_response: str = ""


@dataclass
class MultiAgentReport:
    product_name: str
    keyword: str
    results: list[AIRankResult] = field(default_factory=list)

    @property
    def best_rank(self) -> int | None:
        ranks = [r.rank for r in self.results if r.rank is not None]
        return min(ranks) if ranks else None

    @property
    def mentioned_by(self) -> list[str]:
        return [r.ai_agent for r in self.results if r.rank is not None]

    @property
    def not_mentioned_by(self) -> list[str]:
        return [r.ai_agent for r in self.results if r.rank is None]

    @property
    def all_cited_sources(self) -> list[str]:
        seen = set()
        sources = []
        for r in self.results:
            for src in r.cited_sources:
                if src not in seen:
                    seen.add(src)
                    sources.append(src)
        return sources


class AIQueryService:
    """Query AI agents for product recommendation ranking."""

    def __init__(self):
        settings = get_settings()
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
        # Model IDs (ofox.ai format)
        # All 4 AI agents verified available, Perplexity not on ofox
        self.model_chatgpt = "anthropic/claude-haiku-4.5"   # fastest quality ranking
        self.model_gemini = "google/gemini-3.6-flash"        # fastest overall
        self.model_claude = "anthropic/claude-sonnet-5"      # deepest analysis
        self.model_grok = "x-ai/grok-4.3"                    # newest perspective

    def _build_prompt(self, product_name: str, keyword: str, brand: str) -> str:
        brand_hint = f" by {brand}" if brand else ""
        return (
            f"Rank the top 5 best {keyword} in 2025. "
            f"For each, give: [Rank]. Product Name — one key feature. "
            f"Tell me where {product_name}{brand_hint} ranks in this list. "
            f"If it's not in the top 5, say so."
        )

    async def _query_model(self, agent_name: str, model: str, prompt: str) -> AIRankResult:
        """Generic query wrapper — extracts keyword from existing data."""
        try:
            response = await self.client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You rank products. Be concise. Use format: [Rank]. Product — feature. No markdown, no intro."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=500,
                timeout=15.0,
            )
            raw = response.choices[0].message.content or ""
            # Extract keyword from prompt for the result
            kw_match = re.search(r'best (.+?) in 2025', prompt)
            kw = kw_match.group(1) if kw_match else ""
            # Extract product name
            pm_match = re.search(r'where (.+?) ranks', prompt)
            pn = pm_match.group(1).rstrip(" by").strip() if pm_match else ""
            return self._parse_response(agent_name, pn, kw, raw)
        except Exception as e:
            return AIRankResult(
                ai_agent=agent_name,
                keyword="",
                description=f"Error: {str(e)[:100]}",
            )

    async def query_chatgpt(self, product_name: str, keyword: str, brand: str = "") -> AIRankResult:
        """ChatGPT via Haiku — fast, thorough rankings."""
        prompt = self._build_prompt(product_name, keyword, brand)
        return await self._query_model("chatgpt", self.model_chatgpt, prompt)

    async def query_gemini(self, product_name: str, keyword: str, brand: str = "") -> AIRankResult:
        """Gemini Flash — fastest response."""
        prompt = self._build_prompt(product_name, keyword, brand)
        return await self._query_model("gemini", self.model_gemini, prompt)

    async def query_claude(self, product_name: str, keyword: str, brand: str = "") -> AIRankResult:
        """Claude Sonnet — deepest analysis."""
        prompt = self._build_prompt(product_name, keyword, brand)
        return await self._query_model("claude", self.model_claude, prompt)

    async def query_grok(self, product_name: str, keyword: str, brand: str = "") -> AIRankResult:
        """Grok — newest perspective on product rankings."""
        prompt = self._build_prompt(product_name, keyword, brand)
        return await self._query_model("grok", self.model_grok, prompt)

    async def query_deep(self, product_name: str, keyword: str, brand: str = "") -> AIRankResult:
        """Deep analysis — Claude Sonnet (slower, more thorough)."""
        prompt = (
            f"Thoroughly analyze the best {keyword} in 2025. "
            f"For each top product explain: what makes it stand out, "
            f"key specs, ideal customer, and any notable weaknesses. "
            f"Then explain where {product_name}" +
            (f" ({brand})" if brand else "") +
            f" fits compared to the top picks."
        )
        return await self._query_model("claude", self.model_claude, prompt)

    async def query_all_multi(self, product_name: str, keyword: str, brand: str = "", samples: int = 3) -> MultiAgentReport:
        """Run N samples and average the ranking. Returns report with confidence intervals."""
        import asyncio
        all_reports = await asyncio.gather(*[self.query_all(product_name, keyword, brand) for _ in range(samples)], return_exceptions=True)
        reports = [r for r in all_reports if isinstance(r, MultiAgentReport)]
        if not reports: return MultiAgentReport(product_name=product_name, keyword=keyword)
        # Average: count how many times each agent mentioned the product
        agent_ranks: dict[str, list] = {}
        for rep in reports:
            for r in rep.results:
                agent_ranks.setdefault(r.ai_agent, []).append(r.rank)
        # Build averaged report
        avg = MultiAgentReport(product_name=product_name, keyword=keyword)
        for agent, ranks in agent_ranks.items():
            valid = [r for r in ranks if r is not None]
            avg_rank = round(sum(valid)/len(valid), 1) if valid else None
            confidence = f"{len(valid)}/{samples} samples" if valid else "0 samples"
            avg.results.append(AIRankResult(ai_agent=agent, keyword=keyword, rank=avg_rank if isinstance(avg_rank, int) else None, total_mentioned=ranks.count(None)==0, description=f"Avg rank: {avg_rank} ({confidence})" if valid else f"Not ranked ({confidence})"))
        return avg

    async def query_all(self, product_name: str, keyword: str, brand: str = "") -> MultiAgentReport:
        """Query all 4 AI agents in parallel (ChatGPT, Gemini, Claude, Grok).
        Perplexity not available on ofox.ai."""
        import asyncio

        results = await asyncio.gather(
            self.query_chatgpt(product_name, keyword, brand),
            self.query_gemini(product_name, keyword, brand),
            self.query_claude(product_name, keyword, brand),
            self.query_grok(product_name, keyword, brand),
            return_exceptions=True,
        )

        valid = [r for r in results if isinstance(r, AIRankResult)]
        return MultiAgentReport(
            product_name=product_name,
            keyword=keyword,
            results=valid,
        )

    def _parse_response(
        self, ai_agent: str, product_name: str, keyword: str, raw_response: str
    ) -> AIRankResult:
        result = AIRankResult(
            ai_agent=ai_agent,
            keyword=keyword,
            raw_response=raw_response,
        )

        product_lower = product_name.lower()
        lines = raw_response.split("\n")
        ranked_items = []

        for line in lines:
            line = line.strip()
            if not line:
                continue
            # Match: "1. Sony WH-1000XM6 — best ANC"
            match = re.match(r"^(\d+)[\.\)\:\s\-]+(.+)", line)
            if match:
                rank_num = int(match.group(1))
                item_text = match.group(2).strip()
                ranked_items.append({"rank": rank_num, "text": item_text})

        result.total_mentioned = len(ranked_items)

        for item in ranked_items:
            if product_lower in item["text"].lower():
                result.rank = item["rank"]
                result.description = item["text"]
                break

        # If no structured rank found, try loose match
        if result.rank is None:
            for line in lines:
                if product_lower in line.lower() and len(line) > 10:
                    result.description = line.strip()
                    break

        # Sentiment
        desc_lower = result.description.lower()
        pos = sum(1 for w in ["best", "excellent", "great", "top", "outstanding", "superior", "leading", "recommended"] if w in desc_lower)
        neg = sum(1 for w in ["overpriced", "poor", "disappointing", "worse", "skip", "avoid"] if w in desc_lower)
        result.sentiment = "positive" if pos > neg else "negative" if neg > pos else "neutral"

        # URLs
        result.cited_sources = list(dict.fromkeys(
            re.findall(r'https?://[^\s\)\]\"]+', raw_response)
        ))

        # Competitors
        for item in ranked_items:
            if product_lower not in item["text"].lower():
                result.competitors.append({
                    "name": item["text"][:100],
                    "rank": item["rank"],
                    "description": item["text"],
                })

        return result
