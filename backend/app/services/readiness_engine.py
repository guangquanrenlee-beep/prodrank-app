"""
Readiness Engine — three-tier homepage diagnostic.

Scans a store/product URL and returns one of three statuses:
  ok       — page readable: full readiness score + gaps
  partial  — some signals readable, some blocked
  blocked  — Cloudflare-protected: AI crawlers are likely blocked too,
             which is itself the diagnosis (the #1 reason products never
             appear in AI recommendations)

Used by the homepage hero diagnostic (public, rate-limited).
"""

import json
import re

import httpx
from bs4 import BeautifulSoup

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

AI_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended", "PerplexityBot", "Bingbot"]


def _is_cloudflare(resp: httpx.Response, html: str) -> bool:
    server = (resp.headers.get("server") or "").lower()
    if "cloudflare" in server:
        return True
    if resp.headers.get("cf-ray"):
        return True
    # challenge page markers
    markers = ["challenge-platform", "cf-chl", "cf-browser-verification", "__cf_chl"]
    if any(m in html for m in markers):
        return True
    return False


def _check_ai_bots(robots_text: str) -> dict:
    """Which AI crawlers are blocked by robots.txt."""
    verdicts = {}
    if not robots_text:
        return {b: None for b in AI_BOTS}  # None = couldn't read
    lines = robots_text.lower().splitlines()
    disallowed: set[str] = set()
    current_agent: str | None = None
    for line in lines:
        line = line.strip()
        if line.startswith("user-agent:"):
            current_agent = line.split(":", 1)[1].strip()
        elif line.startswith("disallow:") and current_agent:
            if line.split(":", 1)[1].strip() != "":
                disallowed.add(current_agent)
    for bot in AI_BOTS:
        verdicts[bot] = bot.lower() in disallowed
    return verdicts


def _extract_jsonld(html: str) -> list[dict]:
    """Pull inline JSON-LD blocks."""
    out = []
    for m in re.finditer(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html, re.DOTALL | re.IGNORECASE):
        try:
            data = json.loads(m.group(1).strip())
            out.append(data)
        except Exception:
            continue
    return out


def _score_page(html: str, robots: str | None) -> dict:
    """Readable page → readiness score + gap list (0-100)."""
    soup = BeautifulSoup(html, "lxml")

    # Schema signals
    jsonld = _extract_jsonld(html)
    types = set()
    for d in jsonld:
        t = d.get("@type")
        if isinstance(t, list):
            types.update(t)
        elif t:
            types.add(t)
    has_product = "Product" in types
    has_org = "Organization" in types or "WebSite" in types

    # Product schema completeness (when present)
    schema_fields = 0
    for d in jsonld:
        if isinstance(d.get("@type"), str) and d["@type"] == "Product":
            for f in ["name", "description", "image", "offers", "brand", "sku", "aggregateRating", "review"]:
                if d.get(f):
                    schema_fields += 1

    # Content depth
    desc = ""
    m = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
    if m and m.get("content"):
        desc = m["content"]
    body_text = " ".join(t.get_text(" ", strip=True) for t in soup.find_all(["p", "li", "h1", "h2"]))
    words = len(body_text.split())

    # FAQ presence
    has_faq = bool(soup.find("script", string=re.compile(r"FAQPage", re.IGNORECASE)))
    if not has_faq:
        has_faq = bool(soup.find("details")) or bool(re.search(r"faq|frequently asked", body_text[:3000], re.IGNORECASE))

    # Robots verdicts
    bot_verdicts = _check_ai_bots(robots or "")
    bots_blocked = [b for b, blocked in bot_verdicts.items() if blocked]

    # Score (weighted, mirrors the four pillars lightly)
    score = 0
    gaps = []

    if has_product:
        score += 30
        if schema_fields >= 4:
            score += 10
        else:
            gaps.append(f"Product schema incomplete ({schema_fields}/8 key fields) — AI can't confirm what you sell.")
    else:
        gaps.append("No Product schema detected — AI agents can't verify your product exists.")

    if has_org:
        score += 15
    else:
        gaps.append("No Organization/WebSite schema — AI can't attribute your brand.")

    if bots_blocked:
        score += 0
        gaps.append(f"robots.txt blocks AI crawlers: {', '.join(bots_blocked)} — AI can't read your store at all.")
    else:
        score += 15

    if words >= 300:
        score += 20
    elif words >= 100:
        score += 10
        gaps.append(f"Product page is thin ({words} words) — AI needs detail to evaluate you.")
    else:
        gaps.append(f"Very little content ({words} words) — nothing for AI to evaluate.")

    if has_faq:
        score += 10
    else:
        gaps.append("No FAQ / question-answering content — AI has no answers to quote.")

    score = min(score, 100)
    label = "Excellent" if score >= 75 else "Good" if score >= 55 else "Fair" if score >= 35 else "Poor"
    return {
        "score": score,
        "label": label,
        "gaps": gaps[:6],
        "signals": {
            "product_schema": has_product,
            "schema_fields": schema_fields,
            "org_schema": has_org,
            "faq": has_faq,
            "words": words,
            "ai_bots_blocked": bots_blocked,
        },
    }


async def readiness_scan(url: str) -> dict:
    """Three-tier diagnostic for a store/product URL."""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    async with httpx.AsyncClient(timeout=25, follow_redirects=True,
                                 headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"}) as client:
        try:
            resp = await client.get(url)
        except Exception as e:
            return {
                "status": "error",
                "message": f"Could not reach the site ({str(e)[:80]}). Check the URL and try again.",
            }

        html = resp.text if resp.status_code == 200 else ""

        # Cloudflare check first — this IS the diagnosis
        if resp.status_code in (403, 429, 503) or _is_cloudflare(resp, html):
            robots_text = None
            try:
                r = await client.get(f"{resp.url.scheme}://{resp.url.netloc}/robots.txt", timeout=10)
                robots_text = r.text if r.status_code == 200 else None
            except Exception:
                pass
            bot_verdicts = _check_ai_bots(robots_text or "")
            bots_blocked = [b for b, blocked in bot_verdicts.items() if blocked]
            return {
                "status": "blocked",
                "kind": "cloudflare",
                "message": (
                    "Your store is behind Cloudflare bot protection. "
                    "AI crawlers (GPTBot, ClaudeBot, PerplexityBot) are likely blocked the same way — "
                    "this is one of the most common reasons products never appear in AI recommendations."
                ),
                "robots_readable": robots_text is not None,
                "ai_bots_blocked": bots_blocked,
                "fix_hint": "Connect your store for a deep audit: we verify AI crawler access and configure the allow-list.",
            }

        if resp.status_code != 200:
            return {"status": "error", "message": f"Site returned HTTP {resp.status_code}."}

        # Page readable — full scoring
        robots_text = None
        try:
            r = await client.get(f"{resp.url.scheme}://{resp.url.netloc}/robots.txt", timeout=10)
            robots_text = r.text if r.status_code == 200 else None
        except Exception:
            pass

        scored = _score_page(html, robots_text)

        # Partial: readable but some AI bots blocked in robots.txt
        if scored["signals"]["ai_bots_blocked"]:
            return {
                "status": "partial",
                "kind": "robots_blocked",
                "message": ("Your page is readable, but robots.txt blocks some AI crawlers: "
                            + ", ".join(scored["signals"]["ai_bots_blocked"])
                            + ". They can never recommend what they can't read."),
                **scored,
            }

        return {"status": "ok", **scored}
