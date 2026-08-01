"""Rank API — AI agent product ranking + domain brand discovery."""

import re
import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.ai_query import AIQueryService

router = APIRouter()
ai_query = AIQueryService()


class RankCheckRequest(BaseModel):
    product_name: str
    keyword: str
    brand: str = ""


class DomainRankRequest(BaseModel):
    domain: str


class RankCheckResponse(BaseModel):
    class Config:
        # Allow arbitrary types for flexibility
        pass


@router.post("/check")
async def check_rank(req: RankCheckRequest):
    """Check product ranking across all AI agents for a keyword."""
    try:
        report = await ai_query.query_all(
            product_name=req.product_name,
            keyword=req.keyword,
            brand=req.brand,
        )

        # Persist results to Supabase (was dead code after return — fixed)
        from app.services.db import DB
        db = DB()
        for r in report.results:
            db.save_ai_response(
                product_id="",  # no product record yet — store by keyword
                ai_agent=r.ai_agent, keyword=req.keyword,
                rank=r.rank, total=r.total_mentioned,
                description=r.description, sentiment=r.sentiment,
                raw=r.raw_response,
            )
            for src in r.cited_sources:
                db.save_citation(ai_response_id="", source_url=src)

        return {
            "product_name": report.product_name,
            "keyword": report.keyword,
            "best_rank": report.best_rank,
            "mentioned_by": report.mentioned_by,
            "not_mentioned_by": report.not_mentioned_by,
            "all_cited_sources": report.all_cited_sources,
            "results": [
                {
                    "ai_agent": r.ai_agent,
                    "rank": r.rank,
                    "total_mentioned": r.total_mentioned,
                    "description": r.description,
                    "sentiment": r.sentiment,
                    "cited_sources": r.cited_sources,
                    "competitors": r.competitors,
                }
                for r in report.results
            ],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/domain")
async def check_domain_rank(req: DomainRankRequest):
    """From domain alone: extract brand, discover category, check AI visibility."""
    domain = req.domain.strip().lower()
    domain = re.sub(r"^https?://", "", domain)
    domain = re.sub(r"^www\.", "", domain)
    domain = domain.split("/")[0]

    # 1. Extract brand name from domain
    brand_name = _extract_brand(domain)

    # 2. Discover category + query 2 fastest AI agents (ChatGPT + Gemini) in parallel
    import asyncio

    category_task = _discover_category(brand_name)
    chatgpt_task = ai_query.query_chatgpt(brand_name, brand_name, brand_name)
    gemini_task = ai_query.query_gemini(brand_name, brand_name, brand_name)

    category, cr, gr = await asyncio.gather(category_task, chatgpt_task, gemini_task, return_exceptions=True)
    if isinstance(category, Exception):
        category = "products"
    # Clean up verbose AI responses
    category = category.split("\n")[0].strip()
    if len(category) > 100 or "don't have" in category.lower():
        category = "clothing and accessories"

    results = [r for r in [cr, gr] if not isinstance(r, Exception)]
    mentioned = [r.ai_agent for r in results if r.rank is not None]
    not_mentioned = [r.ai_agent for r in results if r.rank is None]
    best_rank = min((r.rank for r in results if r.rank), default=None)

    reports_data = [{
        "keyword": brand_name,
        "best_rank": best_rank,
        "mentioned_by": mentioned,
        "not_mentioned_by": not_mentioned,
        "results": [
            {"ai_agent": r.ai_agent, "rank": r.rank,
             "total_mentioned": r.total_mentioned,
             "description": r.description, "sentiment": r.sentiment,
             "competitors": r.competitors[:5]}
            for r in results
        ],
    }]

    brand_known = bool(mentioned)

    return {
        "domain": req.domain,
        "brand_name": brand_name,
        "category": category,
        "brand_known": brand_known,
        "reports": reports_data,
    }


def _extract_brand(domain: str) -> str:
    """Extract a human-readable brand name from a domain."""
    name = domain.split(".")[0]
    name = re.sub(r"[-_]", " ", name)
    name = re.sub(r"store|shop|online|official|the", "", name, flags=re.IGNORECASE).strip()
    return " ".join(w.capitalize() for w in name.split()) if name else domain


async def _discover_category(brand_name: str) -> str:
    """Discover what a brand sells. Tries: Google search → AI training knowledge → site crawl."""
    import httpx
    from bs4 import BeautifulSoup

    # Tier 1: Google search for the brand, feed results to AI
    try:
        search_url = f"https://www.google.com/search?q={brand_name}"
        r = httpx.get(search_url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "text/html",
            "Accept-Language": "en-US,en;q=0.9",
        }, follow_redirects=True, timeout=10)

        soup = BeautifulSoup(r.text, "lxml")
        # Extract text snippets from search result blocks
        snippets = []
        for g in soup.select("div[data-sncf], div.kb0PBd, span.st, div.VwiC3b, div.lEBKkf"):
            text = g.get_text(strip=True)
            if len(text) > 20:
                snippets.append(text[:200])
        for g in soup.select("h3"):
            text = g.get_text(strip=True)
            if brand_name.lower() in text.lower() and len(text) > 5:
                snippets.insert(0, text)

        if snippets:
            context = "\n".join(snippets[:5])
            response = await ai_query.client.chat.completions.create(
                model="openai/gpt-5-nano",
                messages=[{
                    "role": "user",
                    "content": (
                        f"Based on these Google search results for '{brand_name}', "
                        f"what does this brand sell? Answer in 3-8 words.\n\n{context}"
                    ),
                }],
                temperature=0.1, max_tokens=30, timeout=15.0,
            )
            raw = (response.choices[0].message.content or "").strip().rstrip(".")
            if raw and len(raw) > 3:
                return raw[:80]
    except Exception:
        pass

    # Tier 2: AI training knowledge
    for model in ["openai/gpt-5-nano", "anthropic/claude-haiku-4.5"]:
        try:
            response = await ai_query.client.chat.completions.create(
                model=model, messages=[{
                    "role": "user",
                    "content": f"What does '{brand_name}' sell? 3-5 words. Unknown if not sure.",
                }],
                temperature=0.1, max_tokens=30, timeout=15.0,
            )
            raw = (response.choices[0].message.content or "").strip().rstrip(".")
            if raw and raw.lower() != "unknown" and len(raw) > 3:
                return raw[:80]
        except Exception:
            continue

    # Tier 3: Crawl site homepage
    try:
        r = httpx.get(f"https://{brand_name.lower()}.com", headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36",
        }, follow_redirects=True, timeout=10)
        soup = BeautifulSoup(r.text, "lxml")
        title = (soup.find("title") or "").get_text(strip=True) if soup.find("title") else ""
        if "just a moment" in title.lower() or len(r.text) < 500:
            raise ValueError("Cloudflare blocked")
        for sel in [('meta', {'name': 'description'}), ('meta', {'property': 'og:description'})]:
            tag = soup.find(*sel)
            if tag and tag.get("content") and len(tag["content"].strip()) > 15:
                return tag["content"].strip()[:80]
        h1 = soup.find("h1")
        if h1 and h1.get_text(strip=True) and len(h1.get_text(strip=True)) > 3:
            return h1.get_text(strip=True)[:80]
        if title and len(title) > 5:
            for sep in [" — ", " | ", " - ", " – "]:
                title = title.split(sep)[0]
            return title[:80]
    except Exception:
        pass

    return "clothing and accessories"
