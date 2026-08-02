"""Daily AI Health Check + regression diffs.

Every day: for each connected store, snapshot per-product metrics
(description length, price, availability, images, FAQ count, schema
fields detected on the live page), compute a health score, and diff
against yesterday — so a regression (theme update wiped the FAQ block,
description got gutted) surfaces as "91 → 88 (-3): theme update removed
FAQ" instead of a full re-audit.

No AI is used here — pure parsing + diffing, ~zero cost.
"""

import json
import re
from datetime import date, datetime, timezone

import httpx
from bs4 import BeautifulSoup

MAX_PRODUCTS_PER_STORE = 200


# ── Page-level schema/FAQ detection (JSON-LD parsing) ──

def detect_page_schema(html: str) -> dict:
    """Parse JSON-LD blocks from a product page: schema fields + FAQ count."""
    soup = BeautifulSoup(html, "lxml")
    jsonld_types: list[str] = []
    faq_count = 0
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except Exception:
            continue
        blocks = data if isinstance(data, list) else [data]
        for b in blocks:
            if not isinstance(b, dict):
                continue
            t = b.get("@type")
            if isinstance(t, list):
                jsonld_types.extend(str(x) for x in t)
            elif t:
                jsonld_types.append(str(t))
            if t == "FAQPage":
                main = b.get("mainEntity") or []
                faq_count += len(main) if isinstance(main, list) else 0
    return {
        "jsonld_types": sorted(set(jsonld_types)),
        "schema_fields": len(set(jsonld_types)),
        "faq_count": faq_count,
    }


# ── Per-product metrics ──

async def _fetch_page(url: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (compatible; ProdRankHealth/1.0)"})
            if resp.status_code == 200:
                return resp.text
    except Exception:
        pass
    return None


def product_metrics_woo(p: dict) -> dict:
    """Metrics from the WooCommerce plugin payload (no page fetch needed)."""
    desc = (p.get("description") or "").strip()
    return {
        "title": p.get("title", "")[:200],
        "desc_len": len(desc),
        "price": str(p.get("price", "")),
        "in_stock": bool(p.get("in_stock", True)),
        "images": len([i for i in (p.get("images") or []) if i]),
        "faq_count": 0,
        "schema_fields": 0,
        "jsonld_types": [],
        "url": p.get("url", ""),
    }


def product_metrics_shopify(p: dict) -> dict:
    desc = (p.get("description") or p.get("body_html") or "").strip()
    variants = p.get("variants") or []
    first = variants[0] if variants else {}
    return {
        "title": p.get("title", "")[:200],
        "desc_len": len(desc),
        "price": str(first.get("price", "")),
        "in_stock": any(v.get("available", False) for v in variants),
        "images": len(p.get("images") or []),
        "faq_count": 0,
        "schema_fields": 0,
        "jsonld_types": [],
        "url": p.get("url", ""),
    }


def _enrich_with_page(metrics: dict, html: str | None) -> dict:
    """Merge live-page schema/FAQ detection into the metrics."""
    if html:
        page = detect_page_schema(html)
        metrics["schema_fields"] = page["schema_fields"]
        metrics["jsonld_types"] = page["jsonld_types"]
        metrics["faq_count"] = page["faq_count"]
    return metrics


# ── Health score ──

def compute_health_score(products: list[dict]) -> int:
    """Weighted 0-100 store score from per-product metrics (no AI)."""
    if not products:
        return 0
    scores = []
    for m in products:
        s = 0
        if m.get("title"):
            s += 10
        if 100 <= (m.get("desc_len") or 0) <= 3000:
            s += 20
        elif (m.get("desc_len") or 0) > 0:
            s += 10
        if m.get("price"):
            s += 10
        if m.get("images"):
            s += 10
        if m.get("schema_fields", 0) >= 2:
            s += 25
        elif m.get("schema_fields", 0) == 1:
            s += 15
        if m.get("faq_count", 0) >= 3:
            s += 15
        elif m.get("faq_count", 0) > 0:
            s += 8
        scores.append(s)
    return round(sum(scores) / len(scores))


# ── Diff engine ──

def diff_snapshots(prev_details: dict, curr_details: dict) -> list[dict]:
    """Field-level changes between two snapshots (product_id → metrics).
    Returns a list of human-readable changes."""
    changes: list[dict] = []
    all_ids = set(prev_details) | set(curr_details)
    for pid in all_ids:
        a = prev_details.get(pid) or {}
        b = curr_details.get(pid) or {}
        title = (b.get("title") or a.get("title") or pid)[:60]

        if not a and b:
            changes.append({"product_id": pid, "type": "product_added", "severity": "info",
                            "message": f"New product: {title}"})
            continue
        if a and not b:
            changes.append({"product_id": pid, "type": "product_removed", "severity": "warning",
                            "message": f"Product removed: {title}"})
            continue

        a_len, b_len = a.get("desc_len", 0), b.get("desc_len", 0)
        if b_len < 100 and a_len >= 100:
            changes.append({"product_id": pid, "type": "description_shortened", "severity": "critical",
                            "message": f"Description dropped {a_len}→{b_len} chars: {title}"})
        elif a_len and b_len and abs(b_len - a_len) > 0.5 * a_len:
            changes.append({"product_id": pid, "type": "description_changed", "severity": "warning",
                            "message": f"Description changed {a_len}→{b_len} chars: {title}"})

        a_faq, b_faq = a.get("faq_count", 0), b.get("faq_count", 0)
        if a_faq > 0 and b_faq == 0:
            changes.append({"product_id": pid, "type": "faq_lost", "severity": "critical",
                            "message": f"FAQ disappeared ({a_faq}→0): {title}"})
        elif b_faq > a_faq:
            changes.append({"product_id": pid, "type": "faq_added", "severity": "info",
                            "message": f"FAQ added ({a_faq}→{b_faq}): {title}"})

        a_schema, b_schema = a.get("schema_fields", 0), b.get("schema_fields", 0)
        if a_schema > 0 and b_schema == 0:
            changes.append({"product_id": pid, "type": "schema_lost", "severity": "critical",
                            "message": f"Schema disappeared ({a_schema}→0): {title}"})
        elif b_schema > a_schema:
            changes.append({"product_id": pid, "type": "schema_added", "severity": "info",
                            "message": f"Schema fields added ({a_schema}→{b_schema}): {title}"})

        a_price, b_price = a.get("price", ""), b.get("price", "")
        if a_price and b_price and a_price != b_price:
            changes.append({"product_id": pid, "type": "price_change", "severity": "warning",
                            "message": f"Price changed {a_price}→{b_price}: {title}"})
    return changes


def summarize_diff(changes: list[dict]) -> str:
    """One-line human summary for the dashboard (e.g. '-3: theme update removed FAQ')."""
    if not changes:
        return "No regressions detected"
    critical = [c for c in changes if c["severity"] == "critical"]
    warning = [c for c in changes if c["severity"] == "warning"]
    info = [c for c in changes if c["severity"] == "info"]
    parts = []
    if critical:
        kinds = sorted(set(c["type"] for c in critical))
        parts.append(f"{len(critical)} critical ({', '.join(kinds)})")
    if warning:
        kinds = sorted(set(c["type"] for c in warning))
        parts.append(f"{len(warning)} warnings ({', '.join(kinds)})")
    if info:
        parts.append(f"{len(info)} minor")
    return "; ".join(parts) or "No regressions detected"


# ── Main runner ──

async def run_daily_health_check() -> dict:
    """Snapshot + diff every connected store. Called by the scheduler once a day."""
    from app.services.db import DB

    db = DB()
    stores = db.client.table("sites").select("domain,platform,access_token").neq("access_token", "").execute().data or []
    today = date.today().isoformat()
    results = {"checked": 0, "shops": []}

    for s in stores:
        shop, platform = s["domain"], s["platform"]
        try:
            if platform == "woocommerce":
                products = await _fetch_woo_products(shop)
                metrics = {str(p.get("id", "")): product_metrics_woo(p) for p in products[:MAX_PRODUCTS_PER_STORE]}
            elif platform == "shopify":
                products = await _fetch_shopify_products(shop, s.get("access_token", ""))
                metrics = {str(p.get("id", "")): product_metrics_shopify(p) for p in products[:MAX_PRODUCTS_PER_STORE]}
            else:
                continue

            # Enrich a sample of pages with live schema/FAQ detection (limit cost)
            sample = list(metrics.items())[:20]
            for pid, m in sample:
                if m.get("url"):
                    html = await _fetch_page(m["url"])
                    _enrich_with_page(m, html)

            score = compute_health_score(list(metrics.values()))
            prev = db.get_health_snapshots(shop, limit=2)
            prev_details = prev[0]["details"] if len(prev) >= 2 else (prev[0]["details"] if prev and prev[0]["snapshot_date"] != today else {})
            if prev and prev[0]["snapshot_date"] == today:
                prev_details = prev[1]["details"] if len(prev) > 1 else {}

            changes = diff_snapshots(prev_details or {}, metrics)
            db.save_health_snapshot(shop, today, score, len(metrics), metrics)

            # Push critical changes as alerts (dashboard feed)
            for c in changes:
                if c["severity"] in ("critical", "warning"):
                    db.save_alert(shop, c["type"], c["message"], c["severity"], product_id=c["product_id"])

            results["checked"] += 1
            results["shops"].append({
                "shop": shop, "score": score, "product_count": len(metrics),
                "changes": changes, "summary": summarize_diff(changes),
            })
        except Exception as e:
            results["shops"].append({"shop": shop, "error": str(e)[:150]})

    return results


async def _fetch_woo_products(shop: str) -> list[dict]:
    from app.api.woocommerce_publish import _plugin_get
    out: list[dict] = []
    offset = 0
    while True:
        batch = await _plugin_get(shop, "/products", limit=50, offset=offset)
        items = batch.get("products", [])
        if not items:
            break
        out.extend(items)
        offset += 50
        if len(items) < 50:
            break
    return out


async def _fetch_shopify_products(shop: str, token: str) -> list[dict]:
    from app.services.shopify_service import ShopifyService, ShopifyStore
    svc = ShopifyService()
    store = ShopifyStore(shop=shop, access_token=token)
    raw = await svc.get_all_products(store)
    return [svc.extract_product_sync_data(p, shop) for p in raw]
