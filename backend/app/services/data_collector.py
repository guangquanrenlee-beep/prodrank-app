"""
Real Question Collector — gathers actual shopper questions from public sources.

Sources (tier 1 — stable, automatable):
  1. Google Autocomplete (public suggest endpoint)
  2. Reddit (legacy JSON search endpoint, rate-limited)
  3. YouTube Data API (official, YOUTUBE_API_KEY)
  4. Brand FAQ pages (direct crawl)

Pipeline: collect raw → extract questions → LLM cluster into category
dimensions (Size / Materials / Occasion / ...) → persist to `questions`
table (already exists: category, question_text, search_volume, ai_coverage_pct).

The collected library feeds back into AI content generation (FAQ / keywords)
and the knowledge graph — the data flywheel's raw material.

NOTE: Google/Reddit/YouTube are unreachable from mainland China — this runs
on the production VPS (overseas). Local testing may fail on network.
"""

import asyncio
import json
import re
import time
from dataclasses import dataclass, field
from urllib.parse import quote_plus

import httpx
from openai import AsyncOpenAI

from app.core.config import get_settings
from app.services.db import DB

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

# ── Category seed config ──
# Seeds drive Google Suggest + Reddit search. Each category lists:
#   seeds: base queries to expand
#   subs: subreddits to search
#   dimensions: clustering target labels
CATEGORY_CONFIG: dict[str, dict] = {
    "fashion": {
        "seeds": ["best t-shirt", "best jeans", "best winter jacket", "best running shoes",
                  "best sweater", "best dress", "best denim", "best linen shirt"],
        "subs": ["malefashionadvice", "femalefashionadvice", "streetwear", "frugalmalefashion"],
        "dimensions": ["Size", "Materials", "Occasion", "Shipping", "Returns", "Comparison", "Style", "Durability"],
    },
    "electronics": {
        "seeds": ["best noise cancelling headphones", "best laptop", "best smartphone",
                  "best earbuds", "best monitor", "best mechanical keyboard"],
        "subs": ["BuyItForLife", "headphones", "suggestalaptop", "buildapc"],
        "dimensions": ["Battery", "Compatibility", "Warranty", "Specs", "Price", "Comparison", "Quality", "Shipping"],
    },
    "beauty": {
        "seeds": ["best vitamin c serum", "best moisturizer", "best sunscreen",
                  "best lipstick", "best shampoo", "best foundation"],
        "subs": ["SkincareAddiction", "MakeupAddiction", "beauty"],
        "dimensions": ["Ingredients", "Skin Type", "Usage", "Shelf Life", "Allergens", "Cruelty-Free", "Price", "Results"],
    },
    "home": {
        "seeds": ["best coffee maker", "best air fryer", "best mattress", "best sofa",
                  "best blender", "best cookware set"],
        "subs": ["Coffee", "BuyItForLife", "HomeImprovement"],
        "dimensions": ["Material", "Warranty", "Installation", "Dimensions", "Maintenance", "Energy", "Price", "Durability"],
    },
}

QUESTION_RE = re.compile(
    r"(?i)\b(what|how|why|which|when|where|is|are|can|do|does|should|best|worth|vs|difference)\b"
)


@dataclass
class RawQuestion:
    text: str
    source: str  # google | reddit | youtube | brand_faq
    url: str = ""


class DataCollector:
    """Collect raw questions from public sources."""

    def __init__(self):
        settings = get_settings()
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
        self.model = "google/gemini-3.6-flash"

    # ── 1. Google Autocomplete ──

    async def collect_google(self, seeds: list[str]) -> list[RawQuestion]:
        """Google suggest endpoint — returns real user-typed completions."""
        out: list[RawQuestion] = []
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": UA}) as c:
            for seed in seeds:
                try:
                    # Suggest prefix variants to widen coverage
                    for prefix in ["best ", "best cheap ", "are ", "is ", "how "]:
                        r = await c.get(
                            "https://suggestqueries.google.com/complete/search",
                            params={"client": "firefox", "q": prefix + seed},
                        )
                        if r.status_code != 200:
                            continue
                        data = r.json()
                        for suggestion in data[1]:
                            text = str(suggestion)
                            if QUESTION_RE.search(text) or text.lower().startswith(("best ", "top ", "how ", "is ", "are ")):
                                out.append(RawQuestion(text=text, source="google"))
                except Exception:
                    continue
        return out

    # ── 2. Reddit ──

    async def collect_reddit(self, subs: list[str], seeds: list[str]) -> list[RawQuestion]:
        """Legacy reddit JSON search — post titles + selftext sentences."""
        out: list[RawQuestion] = []
        async with httpx.AsyncClient(timeout=12, headers={"User-Agent": "prodrank-collector/1.0"}, follow_redirects=True) as c:
            for sub in subs:
                for seed in seeds[:3]:  # limit queries per sub to stay under rate limits
                    try:
                        r = await c.get(
                            f"https://www.reddit.com/r/{sub}/search.json",
                            params={"q": seed, "restrict_sr": 1, "sort": "relevance", "limit": 15},
                        )
                        if r.status_code != 200:
                            continue
                        for post in r.json().get("data", {}).get("children", []):
                            p = post.get("data", {})
                            title = p.get("title", "")
                            if QUESTION_RE.search(title) and 10 < len(title) < 120:
                                out.append(RawQuestion(text=title, source="reddit", url=f"https://reddit.com{p.get('permalink', '')}"))
                    except Exception:
                        continue
                    time.sleep(1.2)  # be polite to reddit
        return out

    # ── 3. YouTube comments ──

    async def collect_youtube(self, seeds: list[str], api_key: str, max_results: int = 5) -> list[RawQuestion]:
        """Official Data API: search videos → fetch top-level comments."""
        out: list[RawQuestion] = []
        if not api_key:
            return out
        async with httpx.AsyncClient(timeout=12) as c:
            for seed in seeds[:3]:
                try:
                    r = await c.get("https://www.googleapis.com/youtube/v3/search", params={
                        "part": "snippet", "q": seed + " review", "type": "video",
                        "maxResults": max_results, "key": api_key,
                    })
                    if r.status_code != 200:
                        continue
                    for item in r.json().get("items", []):
                        video_id = item["id"].get("videoId", "")
                        if not video_id:
                            continue
                        cr = await c.get("https://www.googleapis.com/youtube/v3/commentThreads", params={
                            "part": "snippet", "videoId": video_id, "maxResults": 15, "key": api_key,
                        })
                        if cr.status_code != 200:
                            continue
                        for thread in cr.json().get("items", []):
                            text = thread["snippet"]["topLevelComment"]["snippet"]["textDisplay"]
                            text = re.sub(r"<[^>]+>", "", text).strip()
                            if QUESTION_RE.search(text) and 8 < len(text) < 200:
                                out.append(RawQuestion(text=text, source="youtube",
                                                       url=f"https://youtube.com/watch?v={video_id}"))
                except Exception:
                    continue
        return out

    # ── 4. Brand FAQ pages ──

    BRAND_FAQS: list[str] = [
        "https://www2.hm.com/en_us/customer-service/faq.html",
        "https://www.nike.com/help/a/faq",
        "https://www.uniqlo.com/us/en/faq",
    ]

    async def collect_brand_faq(self, urls: list[str] | None = None) -> list[RawQuestion]:
        """Crawl brand FAQ pages, extract Q&A pairs."""
        out: list[RawQuestion] = []
        async with httpx.AsyncClient(timeout=12, headers={"User-Agent": UA}, follow_redirects=True) as c:
            for url in urls or self.BRAND_FAQS:
                try:
                    r = await c.get(url)
                    if r.status_code != 200:
                        continue
                    text = re.sub(r"<[^>]+>", " ", r.text)
                    text = re.sub(r"\s+", " ", text)
                    # FAQ pages often have Q...A pairs; extract question-like sentences
                    for m in re.finditer(r"(?i)([^.!?]*\?)(?:\s*([^.!?]{10,200}[.!]))?", text):
                        q = m.group(1).strip()
                        if 8 < len(q) < 150 and not q.startswith(("http", "www")):
                            out.append(RawQuestion(text=q, source="brand_faq", url=url))
                except Exception:
                    continue
        return out

    # ── Question extraction from free text ──

    @staticmethod
    def is_question(text: str) -> bool:
        t = text.strip()
        if len(t) < 8 or len(t) > 250:
            return False
        words = t.lower().split()
        # Noise: "best best t shirt" — duplicate-word suggestions
        if len(set(words)) < 2:
            return False
        # Noise: consecutive duplicate words ("best best", "good good")
        if re.search(r"\b(\w+)\s+\1\b", t.lower()):
            return False
        if "?" in t:
            return True
        return bool(QUESTION_RE.match(t)) or t.lower().startswith(("best ", "top ", "worth "))

    # ── AI clustering ──

    async def cluster(self, questions: list[str], dimensions: list[str], category: str) -> dict[str, list[str]]:
        """Cluster raw questions into category dimensions via LLM.
        Batch of up to 60 questions per call → JSON {question: dimension}."""
        clustered: dict[str, list[str]] = {d: [] for d in dimensions}
        if not questions:
            return clustered

        batch_size = 30
        for i in range(0, len(questions), batch_size):
            batch = questions[i:i + batch_size]
            try:
                prompt = (
                    f"Classify each shopper question into exactly one of: {', '.join(dimensions)}.\n"
                    f"Spread the labels across ALL dimensions — only group similar questions together.\n"
                    f"Questions:\n" + "\n".join(f"{j}. {q}" for j, q in enumerate(batch)) +
                    "\nReturn ONLY JSON: {\"0\": \"Size\", \"1\": \"Materials\", ...}"
                )
                resp = await self.client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.1, max_tokens=3000, timeout=45.0,
                )
                raw = (resp.choices[0].message.content or "").strip()
                if raw.startswith("```"):
                    raw = raw.split("\n", 1)[1].split("```")[0].strip()
                try:
                    mapping = json.loads(raw)
                except json.JSONDecodeError:
                    # Truncated JSON — try closing the object, else salvage complete pairs
                    fixed = raw.rstrip()
                    if fixed and not fixed.endswith("}"):
                        fixed += "}"
                    try:
                        mapping = json.loads(fixed)
                    except json.JSONDecodeError:
                        pairs = re.findall(r'"(\d+)":\s*"([^"]+)"', fixed)
                        mapping = {k: v for k, v in pairs}
                for idx, dim in mapping.items():
                    try:
                        qi = int(idx)
                        if 0 <= qi < len(batch) and dim in clustered:
                            clustered[dim].append(batch[qi])
                    except (ValueError, KeyError):
                        continue
            except Exception as e:
                print(f"[data_collector] cluster batch failed: {str(e)[:200]} raw={raw[:150]!r}")
                continue
        return clustered

    # ── Orchestrator ──

    async def collect_category(self, category: str, youtube_key: str = "", limit: int = 1500) -> dict:
        cfg = CATEGORY_CONFIG.get(category)
        if not cfg:
            return {"error": f"Unknown category: {category}"}

        raw: list[RawQuestion] = []
        raw += await self.collect_google(cfg["seeds"])
        raw += await self.collect_reddit(cfg["subs"], cfg["seeds"])
        raw += await self.collect_youtube(cfg["seeds"], youtube_key)
        raw += await self.collect_brand_faq()

        # Dedup + question filter
        seen: set[str] = set()
        unique: list[str] = []
        for q in raw:
            t = q.text.strip().lower()
            if t in seen or not self.is_question(q.text):
                continue
            seen.add(t)
            unique.append(q.text.strip())

        unique = unique[:limit]

        # Cluster
        clustered = await self.cluster(unique, cfg["dimensions"], category)

        # Persist to questions table
        db = DB()
        total = 0
        for dim, qs in clustered.items():
            for q in qs:
                db.save_question(category=f"{category}:{dim}", text=q)
                total += 1

        return {
            "category": category,
            "collected_raw": len(raw),
            "unique_questions": len(unique),
            "clustered": {k: len(v) for k, v in clustered.items()},
            "saved": total,
        }
