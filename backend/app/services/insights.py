"""AI Insights — one cheap DeepSeek call per day summarizes the store's
state (health delta, alerts, citation distribution) into 2-3 actionable
sentences for the dashboard. Not a trend radar — just a daily briefing.
"""

import json
from datetime import date, datetime, timedelta, timezone

from app.services.db import DB


def _collect_signals(shop: str) -> dict:
    """Gather the week's signals (no AI)."""
    db = DB()
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    signals: dict = {}

    try:
        snapshots = db.get_health_snapshots(shop, limit=7)
        signals["health"] = [{"date": s["snapshot_date"], "score": s.get("score", 0)} for s in snapshots]
    except Exception:
        pass

    try:
        alerts = (db.client.table("alerts").select("type,severity,message")
                  .eq("shop", shop).gte("created_at", since).limit(20).execute().data or [])
        signals["alerts"] = [{"type": a.get("type"), "severity": a.get("severity"),
                              "message": a.get("message", "")[:80]} for a in alerts[:10]]
    except Exception:
        pass

    try:
        cites = (db.client.table("citations").select("source_domain")
                 .gte("cited_at", since).limit(500).execute().data or [])
        counts: dict[str, int] = {}
        for c in cites:
            d = c.get("source_domain") or ""
            if d:
                counts[d] = counts.get(d, 0) + 1
        signals["top_cited_domains"] = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:5]
    except Exception:
        pass

    return signals


def _summarize(signals: dict, shop: str) -> str:
    """One DeepSeek call → 2-3 actionable sentences."""
    from app.services.ai_query import AIQueryService
    ai = AIQueryService()
    prompt = (
        f"You are an AI visibility advisor for an e-commerce store ({shop}).\n"
        f"Last 7 days of signals (JSON):\n{json.dumps(signals, ensure_ascii=False, default=str)[:2000]}\n\n"
        "Write 2-3 short, concrete sentences (plain text, no markdown): what looks good, "
        "what regressed, and ONE specific action for this week. Be specific with numbers."
    )
    raw = ai.query_cheap(prompt, max_tokens=300)
    return raw or "No signals yet — data collects automatically."


async def generate_insight(shop: str) -> dict:
    """Generate + store today's insight for a shop (idempotent per day)."""
    db = DB()
    today = date.today().isoformat()
    signals = _collect_signals(shop)
    content = _summarize(signals, shop)
    db.client.table("ai_insights").upsert({
        "shop": shop, "insight_date": today, "content": content,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="shop,insight_date").execute()
    return {"shop": shop, "insight_date": today, "content": content}


async def run_daily_insights() -> dict:
    """Generate today's insight for every store with a bound user (daily)."""
    db = DB()
    sites = db.client.table("sites").select("domain").neq("user_id", None).execute().data or []
    results = {"generated": 0, "items": []}
    for s in sites:
        shop = s.get("domain")
        if not shop:
            continue
        try:
            results["items"].append(await generate_insight(shop))
            results["generated"] += 1
        except Exception as e:
            results["items"].append({"shop": shop, "error": str(e)[:150]})
    return results
