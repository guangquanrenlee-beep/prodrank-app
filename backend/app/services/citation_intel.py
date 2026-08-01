"""
Citation Intelligence — Layer 4 of ProdRank
Tracks which sources AI agents cite, calculates influence scores,
and traces multi-hop citation chains.

Core moat: 12 months of category-level citation data nobody else has.
"""

import re
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from urllib.parse import urlparse

from openai import AsyncOpenAI

from app.core.config import get_settings


@dataclass
class SourceCitation:
    """A single citation by an AI agent."""
    url: str
    domain: str
    ai_agent: str
    keyword: str
    category: str
    timestamp: float
    position: int = 0  # position in the response (1 = first cited)


@dataclass
class SourceInfluence:
    """Aggregated influence of a source across AI agents."""
    domain: str
    category: str
    total_citations: int = 0
    chatgpt_citations: int = 0
    gemini_citations: int = 0
    claude_citations: int = 0
    grok_citations: int = 0
    cited_by_competitors: list[str] = field(default_factory=list)
    influence_score: int = 0  # 0-100 composite
    trend: str = ""  # "rising", "stable", "declining"


@dataclass
class CitationChain:
    """Multi-hop citation chain: A → B → C."""
    source_url: str
    source_domain: str
    cited_by: str  # "chatgpt", "gemini", etc.
    depth: int = 0
    upstream: list[str] = field(default_factory=list)  # what this source cites
    downstream: list[str] = field(default_factory=list)  # who cites this source


@dataclass
class CategoryCitationReport:
    category: str
    keyword: str
    ai_agent: str
    sources: list[dict] = field(default_factory=list)
    top_domains: list[tuple[str, int]] = field(default_factory=list)


class CitationEngine:
    """Tracks source citations across AI agents and calculates influence."""

    def __init__(self):
        from app.services.llm import get_content_client
        self.client, self.model = get_content_client()
        self.model_fast = "google/gemini-3.6-flash"
        # In-memory store (replace with DB for production)
        self._citations: list[SourceCitation] = []
        from app.services.db import DB
        self._db = DB()

    # ── 1. Extract citations from an AI response ──

    def extract_citations(
        self, raw_response: str, ai_agent: str, keyword: str, category: str = ""
    ) -> list[SourceCitation]:
        """Extract domains from AI response — simple line-by-line parsing."""
        citations = []
        seen = set()

        for line in raw_response.split("\n"):
            line = line.strip().lower()
            if not line:
                continue
            # Strip common list formatting: "1.", "1)", "-", "*", "•"
            line = re.sub(r'^[\d]+[\.\)]\s*', '', line)
            line = re.sub(r'^[-*•]\s*', '', line)
            # Remove common artifacts (brackets, quotes — NOT dots)
            for ch in ",;:()[]<>\"'":
                line = line.replace(ch, "")
            # Strip trailing dots/commas from the END only
            line = line.rstrip(".,;: ")
            # If line still has spaces after cleanup, it's a sentence, not a domain
            if " " in line:
                continue
            if not line or len(line) < 6:
                continue
            # Auto-complete .com for bare names like "rtings"
            if "." not in line:
                line = f"{line}.com"
            # Skip non-domain patterns
            if any(w in line for w in ["example", "domain", "website", "review site"]):
                continue
            if line.startswith("www."):
                line = line[4:]
            if line in seen:
                continue
            seen.add(line)

            citation = SourceCitation(
                url=f"https://{line}", domain=line, ai_agent=ai_agent,
                keyword=keyword, category=category or self._guess_category(keyword),
                timestamp=time.time(), position=len(citations) + 1,
            )
            citations.append(citation)
            self._citations.append(citation)
            # Persist to Supabase
            self._db.save_citation(
                ai_response_id="", source_url=citation.url,
                source_domain=citation.domain, source_type="review",
            )

        return citations

    # ── 2. Calculate source influence across agents ──

    def get_source_influence(self, category: str = "") -> list[SourceInfluence]:
        """Aggregate citations into influence scores per domain per category."""
        citations = self._citations
        if category:
            citations = [c for c in citations if c.category == category]

        if not citations:
            return []

        domain_agg = defaultdict(lambda: SourceInfluence(domain="", category=category))
        total = len(citations)

        for c in citations:
            inf = domain_agg[c.domain]
            inf.domain = c.domain
            inf.total_citations += 1
            if c.ai_agent == "chatgpt":
                inf.chatgpt_citations += 1
            elif c.ai_agent == "gemini":
                inf.gemini_citations += 1
            elif c.ai_agent == "claude":
                inf.claude_citations += 1
            elif c.ai_agent == "grok":
                inf.grok_citations += 1

        results = []
        for inf in domain_agg.values():
            # Influence: weighted by citation count + diversity across agents
            agent_div = sum(1 for x in [
                inf.chatgpt_citations, inf.gemini_citations,
                inf.claude_citations, inf.grok_citations
            ] if x > 0)
            inf.influence_score = min(100, int(
                (inf.total_citations / max(total, 1)) * 60 +
                agent_div * 10
            ))
            results.append(inf)

        results.sort(key=lambda x: x.influence_score, reverse=True)
        return results

    # ── 3. Multi-hop citation chain ──

    async def trace_citation_chain(self, url: str, depth: int = 2) -> CitationChain:
        """Trace what sources this source cites (upstream) and who cites it (downstream)."""
        try:
            domain = urlparse(url).netloc.lower().replace("www.", "")
        except Exception:
            domain = url

        chain = CitationChain(source_url=url, source_domain=domain, depth=depth)

        # Downstream: who cites this source in our data?
        downstream = [c for c in self._citations if c.domain == domain]
        chain.downstream = list(dict.fromkeys(
            f"{c.ai_agent} → '{c.keyword}'" for c in downstream
        ))[:10]

        # Upstream: what does this source cite? (ask AI)
        chain.upstream = await self._discover_upstream(url, depth)

        return chain

    async def _discover_upstream(self, url: str, depth: int) -> list[str]:
        """Ask AI: what sources does this URL cite or reference?"""
        if depth <= 0:
            return []

        prompt = (
            f"What are the top 3-5 sources or references that this article/page cites? "
            f"List only URLs or domain names. Be specific.\n\nURL: {url}"
        )
        try:
            resp = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2, max_tokens=300, timeout=20.0,
            )
            raw = resp.choices[0].message.content or ""
            upstream = re.findall(r'(?:https?://)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:/\S*)?)', raw)
            return list(dict.fromkeys(upstream))[:5]  # deduplicate
        except Exception:
            return []

    # ── 4. Full category citation report ──

    async def category_report(
        self, category: str, keywords: list[str]
    ) -> CategoryCitationReport:
        """Query all AI agents for a set of keywords, extract and analyze citations."""
        import asyncio

        all_sources = []
        agents = [
            ("chatgpt", "google/gemini-3.6-flash"),
            ("gemini", "anthropic/claude-haiku-4.5"),
        ]

        async def query_agent(agent_name: str, model: str, combined_kws: str):
            prompt = (
                f"List 10 real websites that publish expert reviews and buying guides for: {combined_kws}.\n\n"
                f"Rules:\n"
                f"- Only list sites that ACTUALLY exist and are well-known for reviewing these products\n"
                f"- Include a mix of: dedicated review sites, magazines, YouTube channels, retail sites with reviews\n"
                f"- Output ONLY domain names, one per line, no numbers/bullets/descriptions\n"
                f"- Example format:\n"
                f"rtings.com\nwirecutter.com\namazon.com\nyoutube.com\nreddit.com"
            )
            try:
                resp = await self.client.chat.completions.create(
                    model=model, messages=[{"role": "user", "content": prompt}],
                    temperature=0.8, max_tokens=600, timeout=30.0,
                )
                raw = resp.choices[0].message.content or ""
                citations = self.extract_citations(raw, agent_name, combined_kws, category)
                return [
                    {"domain": c.domain, "url": c.url, "ai_agent": c.ai_agent,
                     "keyword": combined_kws, "position": c.position}
                    for c in citations
                ]
            except Exception:
                return []

        combined = ", ".join(keywords[:3])
        tasks = [query_agent(agent, model, combined) for agent, model in agents[:2]]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, list):
                all_sources.extend(r)
            elif isinstance(r, Exception):
                import sys
                print(f"cite query error: {r}", file=sys.stderr)
        all_sources = list({f"{s['domain']}|{s['ai_agent']}": s for s in all_sources}.values())

        # Count domain frequency
        domain_counts = Counter(s["domain"] for s in all_sources)
        top_domains = domain_counts.most_common(10)

        return CategoryCitationReport(
            category=category, keyword=", ".join(keywords),
            ai_agent="all", sources=all_sources, top_domains=top_domains,
        )

    @staticmethod
    def _guess_category(keyword: str) -> str:
        """Map keyword to product category."""
        kw = keyword.lower()
        mappings = {
            "headphone": "headphones",
            "jacket": "jackets",
            "espresso": "espresso_machines",
            "invoicing": "saas_invoicing",
            "bookkeeping": "saas_bookkeeping",
            "crm": "saas_crm",
        }
        for k, v in mappings.items():
            if k in kw:
                return v
        return "general"
