"""Field scanner — pre-generation page scan.

Fetches a product page, extracts the readable content (title, description,
spec tables, FAQ), detects the category, then classifies every knowledge-
template field as found / fuzzy / missing.

This moves the missing mechanism from post-generation fallback to
pre-generation decision: the merchant sees what the page already has and
only generates what's missing or under-specified.
"""

import json

import httpx
from bs4 import BeautifulSoup

from app.services.llm import get_content_client


async def fetch_page_text(url: str) -> dict:
    """Fetch a product page and extract readable text: title, meta
    description, visible body text, spec tables, FAQ blocks."""
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; ProdRankBot/1.0; +https://prodrank.app)",
        "Accept-Language": "en-US,en;q=0.9",
    }
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        html = resp.text
    soup = BeautifulSoup(html, "lxml")

    title = (soup.find("title").get_text(strip=True) if soup.find("title") else "")[:300]
    meta = ""
    m = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
    if m and m.get("content"):
        meta = m["content"][:500]

    # Main content text — description paragraphs, list items, headings, table cells
    text_parts = []
    for tag in soup.find_all(["p", "li", "h1", "h2", "h3", "h4", "td", "th", "dt", "dd"]):
        t = tag.get_text(" ", strip=True)
        if t and len(t) > 3:
            text_parts.append(t)
    body_text = " | ".join(text_parts)[:6000]

    # Spec tables: th/td pairs as "label: value"
    spec_rows = []
    for tr in soup.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
        if len(cells) >= 2 and all(cells[:2]):
            spec_rows.append(": ".join(cells[:2]))
    specs = " | ".join(spec_rows)[:2000]

    # FAQ blocks (FAQPage JSON-LD + visible Q/A)
    faq = []
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except Exception:
            continue
        blocks = data if isinstance(data, list) else [data]
        for d in blocks:
            if isinstance(d, dict) and d.get("@type") == "FAQPage":
                for q in (d.get("mainEntity") or []):
                    a = (q.get("acceptedAnswer") or {}).get("text", "")
                    if q.get("name") and a:
                        faq.append(f"Q: {q['name']} A: {a[:200]}")
    faq_text = " || ".join(faq)[:2000]

    return {
        "url": url,
        "title": title,
        "meta_description": meta,
        "body_text": body_text,
        "specs": specs,
        "faq": faq_text,
    }


def _product_from_page(page: dict) -> dict:
    """Minimal product dict for category detection (title + description)."""
    return {
        "title": page["title"] or "",
        "description": page["body_text"][:1500],
        "product_type": "",
        "tags": [],
        "brand": "",
    }


_STATUS_PROMPT = """You are a product data auditor. A merchant wants to know what
information already exists on their product page before AI generates missing
content. For each field, classify the page's coverage:

- "found": the page states a concrete, specific value (e.g. "600D canvas" for material)
- "fuzzy": the page mentions it vaguely but not concretely (e.g. "durable fabric" for material)
- "missing": not mentioned at all

Never mark "found" for vague claims. If in doubt, mark "fuzzy".
Reply with ONLY a JSON object mapping every listed field to one of
found / fuzzy / missing. No other text."""


async def scan_fields(url: str) -> dict:
    """Full scan: fetch page → detect category → classify template fields."""
    from app.services.knowledge_templates import detect_subcategory, generate_field_list
    from app.services.shopify_ai import ShopifyAIService

    page = await fetch_page_text(url)
    product = _product_from_page(page)

    ai = ShopifyAIService()
    category, confidence = await ai.detect_category(product)
    subcategory = detect_subcategory(product, category)
    _identity, knowledge_fields, decision_fields, trust_fields = generate_field_list(category, subcategory)
    field_list = knowledge_fields + decision_fields + trust_fields

    # LLM classification of each field against the page content
    evidence = " | ".join(filter(None, [page["body_text"][:3000], page["specs"], page["faq"]]))[:4000]
    client, model = get_content_client()
    statuses: dict = {}
    try:
        resp = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _STATUS_PROMPT},
                {"role": "user", "content": (
                    f"Product: {page['title'] or 'unknown'}\n\n"
                    f"Page content:\n{evidence}\n\n"
                    f"Fields to classify:\n{', '.join(field_list)}\n"
                )},
            ],
            temperature=0.1,
            max_tokens=1200,
            timeout=30.0,
            response_format={"type": "json_object"},
        )
        raw = (resp.choices[0].message.content or "").strip()
        # Strip code fences if the model wraps the JSON
        if raw.startswith("```"):
            raw = raw.strip("`").removeprefix("json").strip()
        statuses = json.loads(raw) if raw else {}
    except Exception:
        statuses = {}

    fields = []
    for f in field_list:
        status = statuses.get(f, "missing")
        if status not in ("found", "fuzzy", "missing"):
            status = "missing"
        fields.append({"key": f, "status": status})

    return {
        "url": url,
        "title": page["title"],
        "category": {"key": category, "confidence": confidence},
        "subcategory": subcategory,
        "fields": fields,
        "summary": {
            "found": [f["key"] for f in fields if f["status"] == "found"],
            "fuzzy": [f["key"] for f in fields if f["status"] == "fuzzy"],
            "missing": [f["key"] for f in fields if f["status"] == "missing"],
        },
    }
