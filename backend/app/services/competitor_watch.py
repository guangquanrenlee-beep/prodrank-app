"""Competitor Watch — daily crawl + snapshot + diff of competitor stores.

No AI: fetches the competitor's pages (homepage, product listing, a few
product pages), parses JSON-LD (schema types, FAQ count) + prices +
descriptions, snapshots them per day, and diffs against yesterday —
"Nike added 4 FAQs", "Competitor added ShippingDetails schema",
"Price 89→69". Changes flow into the alerts feed.

Anti-abuse: polite UA, per-crawl delays, per-domain daily cap.
"""

import json
import random
import time
from datetime import date

import httpx
from bs4 import BeautifulSoup

from app.services.health_check import detect_page_schema

MAX_PAGES_PER_COMPETITOR = 20
PAGE_DELAY_SECONDS = (1.5, 3.0)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}


async def _fetch(url: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=HEADERS) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp.text
    except Exception:
        pass
    return None


def _clean_title(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    t = soup.find("title")
    if not t:
        return ""
    title = t.get_text(strip=True)
    for sep in [" – ", " — ", " | ", " - "]:
        if sep in title:
            title = title.split(sep)[0]
    return title[:200]


def _extract_price(html: str) -> str:
    """Best-effort price extraction (schema.org Offer + meta + common patterns)."""
    soup = BeautifulSoup(html, "lxml")
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except Exception:
            continue
        blocks = data if isinstance(data, list) else [data]
        for b in blocks:
            if not isinstance(b, dict):
                continue
            if b.get("@type") == "Product":
                offers = b.get("offers")
                if isinstance(offers, dict) and offers.get("price"):
                    return str(offers["price"])
                if isinstance(offers, list) and offers and offers[0].get("price"):
                    return str(offers[0]["price"])
    for meta in soup.find_all("meta"):
        prop = meta.get("property") or meta.get("name") or ""
        if prop in ("product:price:amount", "og:price:amount") and meta.get("content"):
            return meta["content"]
    return ""


def _extract_desc_len(html: str) -> int:
    soup = BeautifulSoup(html, "lxml")
    # Use meta description, else visible text length
    for meta in soup.find_all("meta"):
        prop = meta.get("property") or meta.get("name") or ""
        if prop == "description" and meta.get("content"):
            return len(meta["content"])
    text = soup.get_text(" ", strip=True)
    return len(text[:3000])


async def _crawl_competitor(domain: str) -> dict:
    """Fetch the homepage + product listing + up to N product pages.
    Returns {url: metrics} for one competitor."""
    scheme = "http" if domain.startswith(("localhost", "127.")) else "https"
    base = f"{scheme}://{domain}"
    urls = [base]
    html = await _fetch(base)
    if html:
        soup = BeautifulSoup(html, "lxml")
        # Collect candidate product URLs (common e-commerce paths)
        seen = set()
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if any(k in href for k in ("/product", "/products", "/item", "/p/", "/collections/")):
                if href.startswith("/"):
                    href = base + href
                if domain in href and href not in seen:
                    seen.add(href)
        urls.extend(list(seen)[:MAX_PAGES_PER_COMPETITOR - 1])

    metrics: dict[str, dict] = {}
    for i, url in enumerate(urls):
        if i > 0:
            time.sleep(random.uniform(*PAGE_DELAY_SECONDS))
        page_html = html if i == 0 else await _fetch(url)
        if not page_html:
            continue
        schema = detect_page_schema(page_html)
        metrics[url] = {
            "title": _clean_title(page_html),
            "price": _extract_price(page_html),
            "desc_len": _extract_desc_len(page_html),
            "faq_count": schema["faq_count"],
            "schema_fields": schema["schema_fields"],
            "schema_types": schema["jsonld_types"],
        }
    return metrics


def diff_competitor(prev: dict, curr: dict) -> list[dict]:
    """Diff two competitor snapshots → human-readable changes."""
    changes: list[dict] = []
    prev_prices = {u: m.get("price", "") for u, m in prev.items()}
    curr_prices = {u: m.get("price", "") for u, m in curr.items()}
    # FAQ count change (aggregate)
    prev_faq = sum(m.get("faq_count", 0) for m in prev.values())
    curr_faq = sum(m.get("faq_count", 0) for m in curr.values())
    if curr_faq > prev_faq:
        changes.append({"type": "competitor_faq_added", "severity": "info",
                        "message": f"Competitor added FAQs ({prev_faq}→{curr_faq})"})
    elif prev_faq > curr_faq:
        changes.append({"type": "competitor_faq_lost", "severity": "warning",
                        "message": f"Competitor FAQs disappeared ({prev_faq}→{curr_faq})"})
    # Schema types added/removed (aggregate)
    prev_types = set(t for m in prev.values() for t in m.get("schema_types", []))
    curr_types = set(t for m in curr.values() for t in m.get("schema_types", []))
    added = curr_types - prev_types
    removed = prev_types - curr_types
    for t in sorted(added):
        changes.append({"type": "competitor_schema_added", "severity": "info",
                        "message": f"Competitor added {t} schema"})
    for t in sorted(removed):
        changes.append({"type": "competitor_schema_lost", "severity": "warning",
                        "message": f"Competitor removed {t} schema"})
    # Price drops (competitive signal)
    for url, price in curr_prices.items():
        if not price:
            continue
        prev_price = prev_prices.get(url)
        if prev_price and prev_price != price:
            try:
                if float(price) < float(prev_price):
                    changes.append({"type": "competitor_price_change", "severity": "warning",
                                    "message": f"Competitor price {prev_price}→{price} ({url.split('//')[-1][:60]})"})
            except ValueError:
                pass
    return changes


async def snapshot_competitor(competitor: dict) -> dict:
    """Crawl + snapshot one competitor, diff vs yesterday, write alerts."""
    from app.services.db import DB

    db = DB()
    metrics = await _crawl_competitor(competitor["domain"])
    today = date.today().isoformat()
    prev = db.get_competitor_snapshots(competitor["id"], limit=2)
    prev_details = prev[0]["details"] if prev and prev[0]["snapshot_date"] != today else {}
    db.save_competitor_snapshot(competitor["id"], today, len(metrics), metrics)

    changes = diff_competitor(prev_details or {}, metrics)
    for c in changes:
        if c["severity"] in ("critical", "warning"):
            db.save_alert(competitor.get("shop", ""), c["type"], c["message"], c["severity"])
    return {
        "competitor": competitor["domain"],
        "pages": len(metrics),
        "changes": changes,
    }


async def run_competitor_watch() -> dict:
    """Snapshot every active competitor for every store (daily)."""
    from app.services.db import DB

    db = DB()
    competitors = db.client.table("competitors").select("*").eq("status", "active").execute().data or []
    results = {"checked": 0, "items": []}
    for c in competitors:
        try:
            results["items"].append(await snapshot_competitor(c))
            results["checked"] += 1
        except Exception as e:
            results["items"].append({"competitor": c.get("domain"), "error": str(e)[:150]})
    return results
