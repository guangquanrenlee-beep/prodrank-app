"""Weekly Opportunity Report — SQL aggregates + one LLM polish + email.

Almost zero cost: the numbers come straight from existing tables
(content_drafts, alerts, citations, ai_responses, health_snapshots),
one small LLM call turns them into a friendly summary, and Resend
sends the email. Runs Monday morning via the scheduler.
"""

import json
from collections import Counter
from datetime import date, datetime, timedelta, timezone

from app.services.db import DB


def _week_range() -> tuple[str, str]:
    """Last 7 days (rolling) — simple and timezone-safe enough."""
    today = date.today()
    start = (today - timedelta(days=7)).isoformat()
    return start, today.isoformat()


def collect_weekly_stats(shop: str) -> dict:
    """SQL aggregates for the week — no AI, all from existing tables."""
    db = DB()
    start, end = _week_range()
    today = date.today().isoformat()

    stats: dict = {}

    # AI content generated this week (content_drafts created in window)
    drafts = (db.client.table("content_drafts").select("field").eq("shop", shop)
              .gte("created_at", f"{start}T00:00:00").execute().data or [])
    stats["content_generated"] = len(drafts)
    stats["content_by_field"] = {}
    for d in drafts:
        f = d.get("field", "other")
        stats["content_by_field"][f] = stats["content_by_field"].get(f, 0) + 1

    # Alerts this week (by severity)
    alerts = (db.client.table("alerts").select("severity,type").eq("shop", shop)
              .gte("created_at", f"{start}T00:00:00").execute().data or [])
    stats["alerts"] = len(alerts)
    stats["alerts_by_type"] = {}
    for a in alerts:
        t = a.get("type", "other")
        stats["alerts_by_type"][t] = stats["alerts_by_type"].get(t, 0) + 1

    # Citations this week (citations uses cited_at, not created_at)
    stats["citations"] = len(db.client.table("citations").select("id").gte("cited_at", f"{start}T00:00:00").execute().data or [])

    # AI ranking snapshots this week (ai_responses)
    ai = (db.client.table("ai_responses").select("ai_agent,rank_position").eq("keyword", shop)
          .gte("checked_at", f"{start}T00:00:00").execute().data or [])
    stats["rank_checks"] = len(ai)

    # Health score change
    snapshots = db.get_health_snapshots(shop, limit=7)
    stats["health_scores"] = [(s["snapshot_date"], s.get("score", 0)) for s in snapshots]
    stats["health_delta"] = None
    if len(stats["health_scores"]) >= 2:
        stats["health_delta"] = stats["health_scores"][-1][1] - stats["health_scores"][-2][1]

    # AI Recommendation rate this week (ai_query_results — Test Engine rounds)
    site = db.client.table("sites").select("id").eq("domain", shop).limit(1).execute().data
    if site:
        tests = (db.client.table("ai_query_results").select("recommended")
                 .eq("site_id", site[0]["id"])
                 .gte("created_at", f"{start}T00:00:00").execute().data or [])
        stats["recommendation_tests"] = len(tests)
        stats["recommendation_rate"] = None
        if tests:
            rec = sum(1 for t in tests if t.get("recommended"))
            stats["recommendation_rate"] = round(rec / len(tests) * 100, 1)
    else:
        stats["recommendation_tests"] = 0
        stats["recommendation_rate"] = None

    # AI Shopping Trend: hot attributes this week (from trend snapshots)
    snaps = (db.client.table("trend_snapshots").select("snapshot_date,attributes")
             .gte("snapshot_date", f"{start}").order("snapshot_date").limit(30).execute().data or [])
    stats["trend_attributes"] = None
    if snaps:
        attrs: Counter = Counter()
        for s in snaps:
            attrs.update(s.get("attributes") or {})
        top = [{"attribute": a, "count": c} for a, c in attrs.most_common(8)]
        stats["trend_attributes"] = top

    # Fixes published this week (drafts moved to published)
    pubs = (db.client.table("content_drafts").select("field").eq("shop", shop)
            .eq("status", "published")
            .gte("created_at", f"{start}T00:00:00").execute().data or [])
    stats["fixes_published"] = len(pubs)
    stats["fixes_by_field"] = {}
    for d in pubs:
        f = d.get("field", "other")
        stats["fixes_by_field"][f] = stats["fixes_by_field"].get(f, 0) + 1

    return stats


def _polish_with_llm(stats: dict, shop: str) -> str:
    """One LLM call turns the numbers into a friendly weekly summary."""
    from app.services.llm import get_content_client
    client, model = get_content_client()
    prompt = (
        f"You write a short weekly AI-visibility report for an e-commerce store ({shop}).\n"
        f"Last 7 days of data (JSON):\n{json.dumps(stats, ensure_ascii=False)}\n\n"
        "Write 3-5 sentences, plain text, no markdown: what improved, what regressed "
        "(mention alerts), and one concrete suggestion for next week. Be specific with numbers."
    )
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5, max_tokens=400, timeout=30.0,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception:
        return "Your weekly numbers are above — check the dashboard for details."


async def send_weekly_report(shop: str, email: str) -> dict:
    """Build + polish + email the weekly report for one store."""
    stats = collect_weekly_stats(shop)
    summary = _polish_with_llm(stats, shop)
    body = f"""Hi,

Here is your ProdRank weekly AI-visibility report for {shop}.

{summary}

---
This week: {stats['content_generated']} AI content pieces generated · {stats['alerts']} alerts · {stats['citations']} new citations · {stats['rank_checks']} ranking checks · {stats['fixes_published']} fixes published.

AI Recommendation rate: {stats['recommendation_rate'] if stats['recommendation_rate'] is not None else 'no tests run'} ({stats['recommendation_tests']} queries tested).

Hot attributes shoppers asked about: {', '.join(f"{a['attribute']} ({a['count']}×)" for a in (stats['trend_attributes'] or [])) or 'collecting data…'}.

Health score trend: {stats['health_scores']} ({(stats['health_delta'] if stats['health_delta'] is not None else 0):+d} vs last week).

ProdRank — Let AI discover and recommend your products.
"""
    # Send via Resend (existing email service)
    import os
    import httpx
    api_key = os.getenv("RESEND_API_KEY", "")
    if not api_key:
        return {"status": "no_resend_key", "shop": shop, "summary": summary}
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "from": "ProdRank <reports@prodrank.app>",
                "to": [email],
                "subject": f"ProdRank Weekly Report — {shop}",
                "text": body,
            },
        )
    return {"status": "sent" if resp.status_code == 200 else f"resend_error_{resp.status_code}",
            "shop": shop, "summary": summary}


async def run_weekly_reports() -> dict:
    """Send reports for every store with a bound user (Monday morning)."""
    from app.services.db import DB

    db = DB()
    sites = db.client.table("sites").select("domain,user_id").neq("user_id", None).execute().data or []
    results = {"sent": 0, "items": []}
    for s in sites:
        user_id = s.get("user_id")
        if not user_id:
            continue
        try:
            user = db.client.auth.admin.get_user_by_id(user_id)
            email = (user.user.email if user and user.user else "") if hasattr(db.client.auth, "admin") else ""
            if not email:
                continue
            results["items"].append(await send_weekly_report(s["domain"], email))
            results["sent"] += 1
        except Exception as e:
            results["items"].append({"shop": s.get("domain"), "error": str(e)[:150]})
    return results
