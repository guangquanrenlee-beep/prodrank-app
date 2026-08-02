"""Citation Watch — which domains do AI agents actually cite when
recommending products?

Daily: ask the real models (ChatGPT≈claude-haiku, Gemini≈gemini-flash via
ofox — model identity matters here, ~20 calls/day ≈ $0.05) "recommend top
products, cite sources", extract cited domains, accumulate counts. The
30-day distribution (Wirecutter 38%, Reddit 22%...) is the moat — it tells
merchants which sources to get mentioned on.

Keywords come from the real-question library (questions table), so the
crawl follows what shoppers actually ask.
"""

import re
from datetime import date

from app.services.ai_query import AIQueryService
from app.services.db import DB

MAX_KEYWORDS_PER_DAY = 10


def _extract_domains(text: str) -> list[str]:
    """Pull bare domains from AI response text (URLs, parens, source: style)."""
    domains: list[str] = []
    for m in re.finditer(r"https?://([a-zA-Z0-9.-]+\.[a-z]{2,})", text):
        domains.append(m.group(1).lower().replace("www.", ""))
    for m in re.finditer(r"[\"'(]([a-zA-Z0-9-]+\.[a-z]{2,})[\"')]", text):
        domains.append(m.group(1).lower().replace("www.", ""))
    for m in re.finditer(r"source[s]?[:\s]+([a-zA-Z0-9-]+\.[a-z]{2,})", text, re.IGNORECASE):
        domains.append(m.group(1).lower().replace("www.", ""))
    return list(dict.fromkeys(domains))  # dedupe, keep order


def _pick_keywords(db: DB) -> list[str]:
    """Keywords from the real-question library (what shoppers actually ask)."""
    try:
        qs = db.client.table("questions").select("question_text").limit(400).execute().data or []
        out: list[str] = []
        seen = set()
        for q in qs:
            t = (q.get("question_text") or "").strip()
            if t and t not in seen and len(t) < 80:
                seen.add(t)
                out.append(t)
            if len(out) >= MAX_KEYWORDS_PER_DAY:
                break
        if out:
            return out
    except Exception:
        pass
    return ["best winter jacket", "best running shoes", "best backpack",
            "best headphones", "best coffee maker", "best yoga mat",
            "best skincare serum", "best mechanical keyboard", "best camping tent",
            "best suitcase"]


async def run_citation_watch() -> dict:
    """Ask the real models for recommendations with citations, extract
    domains, store citation rows. ~20 real-model calls per day."""
    db = DB()
    ai = AIQueryService()
    keywords = _pick_keywords(db)
    results = {"asked": 0, "citations": 0, "domains": {}, "errors": 0}

    citation_prompt = (
        "Recommend the top 5 best {kw}. For each recommendation, CITE the "
        "source where you learned about it (e.g. wirecutter.com, reddit.com, "
        "youtube.com, consumerreports.org). Format: "
        "Product — reason — (source: domain.com)."
    )

    # Circuit breaker: ofox can be slow/unstable from some networks. Probe
    # once; if it fails, the whole run falls back to DeepSeek (model identity
    # is secondary to having the data at all). Reset per run.
    ofox_ok = True
    probe = await ai._query_model("chatgpt", ai.model_chatgpt, citation_prompt.format(kw=keywords[0]))
    if (probe.description or "").startswith("Error"):
        ofox_ok = False
        results["errors"] += 1  # the probe itself

    for kw in keywords:
        for agent, model in (("chatgpt", ai.model_chatgpt), ("gemini", ai.model_gemini)):
            text = ""
            if ofox_ok:
                try:
                    result = await ai._query_model(agent, model, citation_prompt.format(kw=kw))
                    text = result.description or ""
                except Exception:
                    pass
            if not text or text.startswith("Error"):
                try:
                    text = await ai.query_cheap(citation_prompt.format(kw=kw), max_tokens=600)
                except Exception:
                    pass
            domains = _extract_domains(text)
            if not domains:
                results["errors"] += 1
                continue
            for d in set(domains):
                db.save_citation(ai_response_id="", source_url=f"https://{d}",
                                 source_domain=d, source_type="ai_recommendation", influence=1.0)
                results["citations"] += 1
                results["domains"][d] = results["domains"].get(d, 0) + 1
            results["asked"] += 1

    return results
