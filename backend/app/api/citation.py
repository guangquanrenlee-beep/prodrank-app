"""Citation Intelligence API — Source influence, citation chains, category reports."""

import re
from collections import Counter

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.citation_intel import CitationEngine
from app.services.schema_detector import SchemaDetector
from app.services.db import DB

router = APIRouter()
engine = CitationEngine()
detector = SchemaDetector()
db = DB()


# ── Tier 2: public industry knowledge — which outlets cover which categories.
#    Static curated list ("industry consensus", not measured data). Each entry:
#    why (what they cover well) + pitch (how to reach them).
INDUSTRY_SOURCES: dict[str, list[dict]] = {
    "electronics": [
        {"domain": "rtings.com", "why": "Instrumented lab testing for TVs, audio, monitors, headphones", "pitch": "Send a review unit — rtings.com/about"},
        {"domain": "wirecutter.com", "why": "Editor-tested buying guides for consumer tech", "pitch": "Editorial review — pitch via wirecutter.com"},
        {"domain": "cnet.com", "why": "Mass-market tech reviews and buying guides", "pitch": "Press contact via cnet.com"},
        {"domain": "tomsguide.com", "why": "Consumer tech reviews with buying guides", "pitch": "tomsguide.com — write-for-us / review submissions"},
        {"domain": "youtube.com", "why": "Tech reviewers (MKBHD-style channels) heavily influence AI recommendations", "pitch": "Reach niche reviewers for a review unit"},
    ],
    "photography": [
        {"domain": "digitalcameraworld.com", "why": "Cameras, lenses and studio lighting gear reviews", "pitch": "Contact via digitalcameraworld.com"},
        {"domain": "photographyblog.com", "why": "Photography gear reviews including studio lighting", "pitch": "Review submissions via photographyblog.com"},
        {"domain": "petapixel.com", "why": "Photography news and gear coverage", "pitch": "Tips/contact via petapixel.com"},
        {"domain": "youtube.com", "why": "Photography creators test lighting gear on camera", "pitch": "Send review units to creators in your niche"},
    ],
    "fashion": [
        {"domain": "gq.com", "why": "Men's style reviews and best-of lists", "pitch": "Editorial contact via gq.com"},
        {"domain": "vogue.com", "why": "Fashion coverage that AI agents quote in recommendations", "pitch": "Press contact via vogue.com"},
        {"domain": "hypebeast.com", "why": "Streetwear and sneaker coverage", "pitch": "hypebeast.com — contact"},
        {"domain": "refinery29.com", "why": "Women's fashion and style coverage", "pitch": "Press contact via refinery29.com"},
        {"domain": "highsnobiety.com", "why": "Streetwear, sneakers and style culture", "pitch": "highsnobiety.com — contact"},
        {"domain": "reddit.com", "why": "Fashion communities (r/malefashionadvice) quoted by AI", "pitch": "Engage authentically in relevant subreddits"},
    ],
    "beauty": [
        {"domain": "byrdie.com", "why": "Skincare and beauty reviews", "pitch": "byrdie.com — contact"},
        {"domain": "allure.com", "why": "Beauty product reviews and Best of Beauty awards", "pitch": "Press contact via allure.com"},
        {"domain": "sephora.com", "why": "Retail reviews that influence AI recommendations", "pitch": "List your product and grow verified reviews"},
        {"domain": "reddit.com", "why": "Skincare communities (r/SkincareAddiction) quoted by AI", "pitch": "Engage authentically in relevant subreddits"},
    ],
    "home": [
        {"domain": "wirecutter.com", "why": "Editor-tested home and kitchen buying guides — lamps, furniture, bedding", "pitch": "Editorial review — pitch via wirecutter.com"},
        {"domain": "thespruce.com", "why": "Practical home reviews: lighting, furniture, decor", "pitch": "thespruce.com — contact"},
        {"domain": "apartmenttherapy.com", "why": "Interior-focused buying guides for furniture and decor", "pitch": "apartmenttherapy.com — contact"},
        {"domain": "wayfair.com", "why": "Retail reviews for furniture and lighting that influence AI", "pitch": "List your product and grow verified reviews"},
        {"domain": "homedepot.com", "why": "Retail reviews with high AI influence (lighting, appliances)", "pitch": "List your product and grow verified reviews"},
        {"domain": "goodhousekeeping.com", "why": "Home and appliance reviews", "pitch": "Press contact via goodhousekeeping.com"},
        {"domain": "reddit.com", "why": "Home communities (r/BuyItForLife, r/furniture) quoted by AI", "pitch": "Engage authentically in relevant subreddits"},
    ],
    "coffee": [
        {"domain": "coffeegeek.com", "why": "Espresso machine and grinder community reviews", "pitch": "coffeegeek.com — community reviews"},
        {"domain": "homegrounds.co", "why": "Coffee gear buying guides", "pitch": "homegrounds.co — contact"},
        {"domain": "wirecutter.com", "why": "Editor-tested coffee gear guides", "pitch": "Editorial review — pitch via wirecutter.com"},
        {"domain": "reddit.com", "why": "Coffee community (r/espresso, r/Coffee) quoted by AI", "pitch": "Engage authentically in relevant subreddits"},
    ],
    "sports": [
        {"domain": "runnersworld.com", "why": "Running and fitness gear reviews", "pitch": "Press contact via runnersworld.com"},
        {"domain": "verywellfit.com", "why": "Fitness equipment reviews and guides", "pitch": "verywellfit.com — contact"},
        {"domain": "youtube.com", "why": "Fitness reviewers influence AI recommendations", "pitch": "Reach niche reviewers for a review unit"},
    ],
    "toys": [
        {"domain": "thetoyinsider.com", "why": "Toy industry news and reviews", "pitch": "thetoyinsider.com — contact"},
        {"domain": "parents.com", "why": "Toy reviews for family buying decisions", "pitch": "parents.com — press contact"},
        {"domain": "wirecutter.com", "why": "Editor-tested toy guides", "pitch": "Editorial review — pitch via wirecutter.com"},
    ],
    "pet": [
        {"domain": "petmd.com", "why": "Pet health and product information quoted by AI", "pitch": "petmd.com — contact"},
        {"domain": "akc.org", "why": "Dog breed and product coverage", "pitch": "akc.org — press contact"},
        {"domain": "chewy.com", "why": "Retail reviews that influence AI recommendations", "pitch": "List your product and grow verified reviews"},
    ],
    "food": [
        {"domain": "seriouseats.com", "why": "Food equipment reviews (cookware, appliances)", "pitch": "seriouseats.com — contact"},
        {"domain": "bonappetit.com", "why": "Food and kitchen coverage", "pitch": "Press contact via bonappetit.com"},
        {"domain": "youtube.com", "why": "Food reviewers influence AI recommendations", "pitch": "Reach niche reviewers for a review unit"},
    ],
    "general": [
        {"domain": "wirecutter.com", "why": "Editor-tested buying guides across categories", "pitch": "Editorial review — pitch via wirecutter.com"},
        {"domain": "consumerreports.org", "why": "Independent testing trusted by AI agents", "pitch": "Submit to their testing program"},
        {"domain": "reddit.com", "why": "Category communities quoted heavily by AI", "pitch": "Engage authentically in relevant subreddits"},
        {"domain": "youtube.com", "why": "Reviewers in your niche influence AI recommendations", "pitch": "Reach niche reviewers for a review unit"},
    ],
}

# Keyword → category for the quick path (no AI call).
CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "photography": ["ring light", "ring-light", "softbox", "studio light", "flash", "camera", "lens", "tripod", "photography", "gimbal", "lighting"],
    "electronics": ["headphone", "speaker", "phone", "laptop", "tablet", "monitor", "keyboard", "mouse", "tv", "television", "audio", "charger", "cable", "usb", "drone", "screen", "projector", "console", "watch", "led"],
    "fashion": ["shirt", "dress", "jacket", "jean", "sneaker", "hoodie", "sweater", "coat", "apparel", "bag", "backpack", "tote", "clothing", "fashion", "shoe", "hat", "scarf", "belt"],
    "beauty": ["makeup", "skincare", "serum", "cream", "lotion", "shampoo", "lipstick", "foundation", "moisturizer", "sunscreen", "perfume", "cosmetic", "beauty", "haircare"],
    "home": ["mattress", "sofa", "air fryer", "blender", "cookware", "kitchen", "vacuum", "furniture", "chair", "desk", "lamp", "pillow", "sheet", "appliance"],
    "coffee": ["espresso", "coffee", "grinder", "french press", "moka"],
    "sports": ["bike", "bicycle", "yoga", "fitness", "gym", "treadmill", "dumbbell", "racket", "running", "workout"],
    "toys": ["toy", "lego", "doll", "puzzle", "playset", "kids"],
    "pet": ["dog", "cat", "pet", "litter", "aquarium"],
    "food": ["snack", "granola", "protein bar", "seasoning", "sauce", "chocolate"],
}


def _match_category(text: str) -> tuple[str, int]:
    """Keyword match against category keywords. Returns (key, confidence 0-100)."""
    t = (text or "").lower()
    best_key, best_score = "general", 0
    for key, words in CATEGORY_KEYWORDS.items():
        score = 0
        for w in words:
            if w in t:
                score += 1
        if score > best_score:
            best_key, best_score = key, score
    if best_score == 0:
        return "general", 0
    confidence = min(90, 40 + best_score * 25)
    return best_key, confidence


class DetectRequest(BaseModel):
    url: str


class SourcesRequest(BaseModel):
    category: str


class InfluenceRequest(BaseModel):
    category: str = ""


class ChainRequest(BaseModel):
    url: str
    depth: int = 2


class ReportRequest(BaseModel):
    category: str
    keywords: list[str] = []


@router.get("/influence")
async def source_influence(category: str = ""):
    """Get source influence scores for a category (or all if empty)."""
    try:
        results = engine.get_source_influence(category)
        return {
            "category": category or "all",
            "total_sources": len(results),
            "sources": [
                {
                    "domain": r.domain,
                    "influence_score": r.influence_score,
                    "total_citations": r.total_citations,
                    "chatgpt_citations": r.chatgpt_citations,
                    "gemini_citations": r.gemini_citations,
                    "claude_citations": r.claude_citations,
                    "grok_citations": r.grok_citations,
                }
                for r in results[:20]
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chain")
async def citation_chain(req: ChainRequest):
    """Trace multi-hop citation chain for a URL."""
    try:
        chain = await engine.trace_citation_chain(req.url, req.depth)
        return {
            "source_url": chain.source_url,
            "source_domain": chain.source_domain,
            "depth": chain.depth,
            "upstream": chain.upstream,
            "downstream": chain.downstream,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/detect")
async def detect_category_from_url(req: DetectRequest):
    """Given a product page URL, identify its category. Crawl the page
    (3-tier stealth fetch), extract title + description, keyword-match
    against known categories, and fall back to an AI classification call.

    Returns the category key + confidence + what it was detected from.
    """
    url = str(req.url)
    if not url.startswith("http"):
        url = f"https://{url}"
    try:
        audit = await detector.audit_product(url)
        title = audit.title or ""
        # Description from schema fields when available
        description = ""
        for f in audit.schema_fields:
            if f.field == "description" and f.value:
                description = f.value
                break
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Crawl failed: {e}")

    haystack = f"{title} {description}"
    key, confidence = _match_category(haystack)

    # AI fallback when keyword match is inconclusive
    if confidence == 0:
        try:
            import asyncio
            from openai import AsyncOpenAI
            from app.core.config import get_settings

            ofox = AsyncOpenAI(
                api_key=get_settings().openai_api_key,
                base_url=get_settings().openai_base_url,
            )
            keys = ", ".join(sorted(INDUSTRY_SOURCES.keys()))
            resp = await ofox.chat.completions.create(
                model="google/gemini-3.6-flash",
                messages=[{
                    "role": "user",
                    "content": (
                        f"Classify this product into exactly one of these categories: {keys}.\n"
                        f"Reply with ONLY the category key, nothing else.\n\n"
                        f"Title: {title}\nDescription: {description[:300]}"
                    ),
                }],
                temperature=0.1, max_tokens=20, timeout=20.0,
            )
            ai_key = (resp.choices[0].message.content or "").strip().lower()
            if ai_key in INDUSTRY_SOURCES:
                key, confidence = ai_key, 55
        except Exception:
            pass  # keep "general" fallback

    label = INDUSTRY_SOURCES.get(key, INDUSTRY_SOURCES["general"])[0]["domain"]
    return {
        "url": url,
        "title": title,
        "category": key,
        "confidence": confidence,
        "detected_from": "schema/title keywords" if confidence >= 40 else "AI classification",
    }


@router.post("/sources")
async def trusted_sources(req: SourcesRequest):
    """Tiered trusted-source list for a category.

    Tier 1 (measured): domains AI agents have actually cited across real
    queries (citations table). Tier 2 (industry): curated outlets for the
    category. Both labeled so users know what they can trust.
    """
    category = (req.category or "").strip().lower() or "general"

    # Tier 1: measured citation history (citations table has no category
    # column — this is global, which we label honestly).
    tier1: list[dict] = []
    try:
        rows = db.client.table("citations").select("source_domain").limit(2000).execute().data or []
        counts = Counter((r.get("source_domain") or "").lower() for r in rows if r.get("source_domain"))
        tier1 = [
            {"domain": d, "count": c}
            for d, c in counts.most_common(20) if "." in d
        ]
    except Exception:
        pass  # no history yet — tier 2 only

    # Tier 2: curated industry knowledge
    tier2 = INDUSTRY_SOURCES.get(category) or INDUSTRY_SOURCES["general"]
    tier2 = [
        {"domain": s["domain"], "why": s["why"], "pitch": s["pitch"]}
        for s in tier2
    ]

    return {
        "category": category,
        "tier1_measured": tier1,
        "tier1_note": "Domains AI agents actually cited in real queries (all categories — we don't track per-category yet)",
        "tier2_industry": tier2,
        "tier2_note": "Industry-consensus review outlets for this category — not measured data",
    }


@router.post("/report")
async def category_report(req: ReportRequest):
    """Generate full citation report for a category across all AI agents."""
    try:
        report = await engine.category_report(req.category, req.keywords)
        return {
            "category": report.category,
            "keyword": report.keyword,
            "total_citations": len(report.sources),
            "top_domains": [
                {"domain": d, "citations": c}
                for d, c in report.top_domains
            ],
            "sources": report.sources,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
