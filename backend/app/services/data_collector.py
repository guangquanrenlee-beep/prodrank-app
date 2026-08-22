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
import random
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

    # ── Protection: cooldown-with-backoff instead of all-day circuit break ──
    # Per-source state so one blocked source doesn't kill the others.
    # A 429/403 now triggers a cooldown window (10m → 20m → 40m → … capped at
    # 2h) instead of disabling the source for the whole day. Successful
    # responses reset the failure counter.

    def __init__(self):
        settings = get_settings()
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
        self.model = "google/gemini-3.6-flash"
        # source -> {requests_today, failures, cooldown_until}
        self._state: dict[str, dict] = {}
        self._daily_caps: dict[str, int] = {
            "google": 300,
            "bing": 300,
            "reddit": 60,
            "youtube": 40,
            "brand_faq": 20,
        }

    def _source_ok(self, source: str) -> bool:
        st = self._state.setdefault(source, {"requests": 0, "failures": 0, "cooldown_until": 0})
        if time.time() < st.get("cooldown_until", 0):
            return False
        return st["requests"] < self._daily_caps.get(source, 100)

    def _count_request(self, source: str):
        self._state.setdefault(source, {"requests": 0, "failures": 0, "cooldown_until": 0})["requests"] += 1

    def _mark_success(self, source: str):
        """Reset failure backoff after a successful response."""
        st = self._state.setdefault(source, {"requests": 0, "failures": 0, "cooldown_until": 0})
        st["failures"] = 0
        st["cooldown_until"] = 0

    def _trip(self, source: str):
        """Rate-limited/blocked → exponential cooldown, then auto-recover."""
        st = self._state.setdefault(source, {"requests": 0, "failures": 0, "cooldown_until": 0})
        st["failures"] += 1
        cool = min(10 * 60 * (2 ** (st["failures"] - 1)), 120 * 60)  # 10m → 20m → 40m → 80m → 120m cap
        st["cooldown_until"] = time.time() + cool
        print(f"[data_collector] {source} rate-limited ({st['failures']}x) — cooling {cool // 60}min, will auto-retry")

    async def _guarded_get(self, client: httpx.AsyncClient, source: str, url: str, **kwargs):
        """GET with circuit breaker + exponential backoff on 429/403."""
        if not self._source_ok(source):
            return None
        self._count_request(source)
        delay = 1.0
        for attempt in range(4):
            try:
                r = await client.get(url, **kwargs)
                if r.status_code in (429, 403):
                    self._trip(source)
                    return None
                return r
            except (httpx.TimeoutException, httpx.TransportError):
                if attempt == 3:
                    return None
                await asyncio.sleep(delay)
                delay *= 2  # 1s → 2s → 4s
        return None

    # ── 1. Google Autocomplete ──

    async def collect_google(self, seeds: list[str]) -> list[RawQuestion]:
        """Google suggest endpoint — returns real user-typed completions.

        Rate-limit friendly: 3 prefixes (not 5), random 1.2-2.5s jitter between
        requests (no bursts), random client param variant. A 429 starts a
        cooldown instead of killing the source for the day.
        """
        out: list[RawQuestion] = []
        prefixes = ["best ", "is ", "how "]  # fewer prefixes → fewer requests
        clients = ["firefox", "chrome", "psy"]
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": UA}) as c:
            for seed in seeds:
                if not self._source_ok("google"):
                    break
                for prefix in prefixes:
                    if not self._source_ok("google"):
                        break
                    r = await self._guarded_get(
                        c, "google",
                        "https://suggestqueries.google.com/complete/search",
                        params={"client": random.choice(clients), "q": prefix + seed, "hl": "en"},
                    )
                    if r is None:
                        break
                    self._mark_success("google")
                    try:
                        data = r.json()
                        for suggestion in data[1]:
                            text = str(suggestion)
                            if QUESTION_RE.search(text) or text.lower().startswith(("best ", "top ", "how ", "is ", "are ")):
                                out.append(RawQuestion(text=text, source="google"))
                    except Exception:
                        continue
                    await asyncio.sleep(random.uniform(1.2, 2.5))  # human-like pacing
        return out

    async def collect_bing(self, seeds: list[str]) -> list[RawQuestion]:
        """Bing autocomplete — much more lenient than Google. Backup source
        when Google is cooling down or blocked."""
        out: list[RawQuestion] = []
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": UA}) as c:
            for seed in seeds:
                if not self._source_ok("bing"):
                    break
                r = await self._guarded_get(
                    c, "bing",
                    "https://api.bing.com/osjson.aspx",
                    params={"query": seed, "market": "en-US"},
                )
                if r is None:
                    break
                self._mark_success("bing")
                try:
                    data = r.json()
                    for suggestion in data[1]:
                        text = str(suggestion)
                        if QUESTION_RE.search(text) or text.lower().startswith(("best ", "top ", "how ", "is ", "are ")):
                            out.append(RawQuestion(text=text, source="bing"))
                except Exception:
                    continue
                await asyncio.sleep(random.uniform(0.8, 1.5))
        return out

    # ── 2. Reddit (official OAuth API) ──

    async def _reddit_token(self) -> str | None:
        """OAuth2 client_credentials — official API, free tier 100 QPM.
        Needs REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET in .env. Returns None
        (→ source skipped) when keys are absent — never fails the collection."""
        import os as _os
        cid = _os.getenv("REDDIT_CLIENT_ID", "").strip()
        secret = _os.getenv("REDDIT_CLIENT_SECRET", "").strip()
        if not cid or not secret:
            print("[data_collector] REDDIT_CLIENT_ID/SECRET not set — skipping reddit")
            return None
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.post(
                    "https://www.reddit.com/api/v1/access_token",
                    data={"grant_type": "client_credentials"},
                    auth=(cid, secret),
                    headers={"User-Agent": "prodrank-collector/1.0 by prodrank"},
                )
                if r.status_code == 200:
                    return r.json().get("access_token")
                print(f"[data_collector] reddit token failed: HTTP {r.status_code}")
        except Exception as e:
            print(f"[data_collector] reddit token error: {str(e)[:100]}")
        return None

    async def collect_reddit(self, subs: list[str], seeds: list[str]) -> list[RawQuestion]:
        """Official oauth.reddit.com search — post titles + selftext sentences.
        Uses the free-tier OAuth API (100 QPM) instead of the anonymous JSON
        endpoint, which has been Cloudflare-blocked since 2023."""
        token = await self._reddit_token()
        if not token:
            return []  # keys missing or token failed — skip quietly

        out: list[RawQuestion] = []
        headers = {
            "User-Agent": "prodrank-collector/1.0 by prodrank",
            "Authorization": f"Bearer {token}",
        }
        async with httpx.AsyncClient(timeout=12, headers=headers, follow_redirects=True) as c:
            for sub in subs:
                for seed in seeds[:3]:  # limit queries per sub to stay under rate limits
                    if not self._source_ok("reddit"):
                        break
                    r = await self._guarded_get(
                        c, "reddit",
                        f"https://oauth.reddit.com/r/{sub}/search",
                        params={"q": seed, "restrict_sr": 1, "sort": "relevance", "limit": 15},
                    )
                    if r is None:
                        break
                    self._mark_success("reddit")
                    try:
                        for post in r.json().get("data", {}).get("children", []):
                            p = post.get("data", {})
                            title = p.get("title", "")
                            if QUESTION_RE.search(title) and 10 < len(title) < 120:
                                out.append(RawQuestion(text=title, source="reddit", url=f"https://reddit.com{p.get('permalink', '')}"))
                    except Exception:
                        continue
                    await asyncio.sleep(1.2)  # be polite to reddit
        return out

    # ── 3. YouTube comments ──

    async def collect_youtube(self, seeds: list[str], api_key: str, max_results: int = 5) -> list[RawQuestion]:
        """Official Data API: search videos → fetch top-level comments."""
        out: list[RawQuestion] = []
        if not api_key:
            return out
        async with httpx.AsyncClient(timeout=12) as c:
            for seed in seeds[:3]:
                if not self._source_ok("youtube"):
                    break
                r = await self._guarded_get(c, "youtube", "https://www.googleapis.com/youtube/v3/search", params={
                    "part": "snippet", "q": seed + " review", "type": "video",
                    "maxResults": max_results, "key": api_key,
                })
                if r is None:
                    break
                try:
                    for item in r.json().get("items", []):
                        video_id = item["id"].get("videoId", "")
                        if not video_id:
                            continue
                        cr = await self._guarded_get(c, "youtube", "https://www.googleapis.com/youtube/v3/commentThreads", params={
                            "part": "snippet", "videoId": video_id, "maxResults": 15, "key": api_key,
                        })
                        if cr is None:
                            break
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
                if not self._source_ok("brand_faq"):
                    break
                r = await self._guarded_get(c, "brand_faq", url)
                if r is None:
                    break
                try:
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

        # Batch 15 (not 30) + a NON-reasoning model. DeepSeek v4-flash is a
        # reasoning model: its reasoning tokens share the max_tokens budget,
        # so on a big batch it thinks until max_tokens runs out and emits
        # NOTHING (finish_reason=length, content=''). deepseek-chat is the
        # non-reasoning model — 1.7s answers, no token-eating. Fallback: ofox
        # gemini flash (what this ran on before, also non-reasoning).
        batch_size = 15
        for i in range(0, len(questions), batch_size):
            batch = questions[i:i + batch_size]
            raw = ""  # init BEFORE try — the except handler references it
            try:
                prompt = (
                    f"Classify each shopper question into exactly one of: {', '.join(dimensions)}.\n"
                    f"Spread the labels across ALL dimensions — only group similar questions together.\n"
                    f"Questions:\n" + "\n".join(f"{j}. {q}" for j, q in enumerate(batch)) +
                    "\nReturn ONLY JSON: {\"0\": \"Size\", \"1\": \"Materials\", ...}"
                )
                import os as _os
                from openai import AsyncOpenAI
                key = _os.getenv("DEEPSEEK_API_KEY", "").strip()
                if key:
                    client = AsyncOpenAI(api_key=key, base_url="https://api.deepseek.com/v1")
                    model = "deepseek-chat"  # non-reasoning: fast, no token-eating
                else:
                    client, model = self.client, self.model  # ofox gemini fallback
                raw = ""
                for attempt in range(2):
                    try:
                        resp = await client.chat.completions.create(
                            model=model,
                            messages=[{"role": "user", "content": prompt}],
                            temperature=0.1, max_tokens=2000, timeout=30.0,
                        )
                        raw = (resp.choices[0].message.content or "").strip()
                        if raw:
                            break
                        print(f"[data_collector] cluster empty response (attempt {attempt + 1}) — retrying")
                        await asyncio.sleep(1)
                    except Exception as e:
                        # Balance exhausted (402) won't recover within this run — abort
                        # clustering instead of retrying every batch twice.
                        if "402" in str(e) or "Insufficient Balance" in str(e):
                            print("[data_collector] cluster aborted: LLM balance exhausted (402)")
                            return clustered
                        if attempt == 1:
                            raise
                        print(f"[data_collector] cluster LLM call failed (retrying): {str(e)[:100]}")
                        await asyncio.sleep(2)
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
        raw += await self.collect_bing(cfg["seeds"])
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
