"""AI Recommendation Regression Monitor — "we lost the recommendation, why?"

Scans ai_responses history for products that WERE recommended by an AI
agent and are no longer. For each regression it collects evidence:
  - own store changes (health snapshot diffs: FAQ/schema/description)
  - competitor changes (competitor snapshot diffs: reviews, schema, price)
then one DeepSeek call (cheap) ranks the likely reasons by star weight.
The result lands in the alerts feed (type=recommendation_lost).

Runs daily via the scheduler — cheap because regressions are rare.
"""

import json
from datetime import date, datetime, timedelta, timezone

from app.services.ai_query import AIQueryService
from app.services.db import DB

LOOKBACK_DAYS = 30


def _find_regressions(db: DB) -> list[dict]:
    """Find keyword+agent combos that HAD a rank in the last 30 days and
    most recently came back empty (rank is None)."""
    since = (datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).isoformat()
    rows = (db.client.table("ai_responses").select("keyword,ai_agent,rank_position,checked_at")
            .gte("checked_at", since).order("checked_at", desc=True).limit(2000).execute().data or [])
    latest: dict[tuple, dict] = {}
    for r in rows:
        key = (r.get("keyword", ""), r.get("ai_agent", ""))
        if key not in latest:
            latest[key] = r
    regressions = []
    for (kw, agent), r in latest.items():
        if r.get("rank_position") is None and kw and agent:
            regressions.append({"keyword": kw, "agent": agent, "last_seen": r.get("checked_at", "")})
    return regressions[:10]  # cap per run


def _evidence_for(db: DB, shop: str, keyword: str) -> dict:
    """Collect what changed recently: own health diffs + competitor diffs."""
    evidence: dict = {"shop": shop, "keyword": keyword, "own": [], "competitors": []}
    try:
        snapshots = db.get_health_snapshots(shop, limit=2)
        if len(snapshots) >= 2:
            from app.services.health_check import diff_snapshots
            changes = diff_snapshots(snapshots[-2].get("details") or {}, snapshots[-1].get("details") or {})
            evidence["own"] = [c for c in changes if c["severity"] in ("critical", "warning")][:6]
    except Exception:
        pass
    try:
        comps = db.get_competitors(shop)
        for c in comps[:3]:
            snaps = db.get_competitor_snapshots(c["id"], limit=2)
            if len(snaps) >= 2:
                from app.services.competitor_watch import diff_competitor
                changes = diff_competitor(snaps[-2].get("details") or {}, snaps[-1].get("details") or {})
                evidence["competitors"].append({"domain": c.get("domain"), "changes": changes[:5]})
    except Exception:
        pass
    return evidence


def _attribute(evidence: dict) -> list[dict]:
    """One cheap DeepSeek call ranks the likely reasons by star weight."""
    ai = AIQueryService()
    prompt = (
        "A merchant's product stopped being recommended by an AI agent.\n\n"
        f"Evidence of what changed recently:\n{json.dumps(evidence, ensure_ascii=False, default=str)[:2500]}\n\n"
        "Return ONLY a JSON array, each item: "
        '{"reason": "short concrete cause", "stars": 1-5}. '
        "Rank by likelihood (5 = most likely). Max 5 items. No other text."
    )
    raw = ai.query_cheap(prompt, max_tokens=600)
    try:
        start, end = raw.find("["), raw.rfind("]")
        if start != -1 and end > start:
            data = json.loads(raw[start:end + 1])
            return [{"reason": str(d.get("reason", "")), "stars": min(5, max(1, int(d.get("stars", 3))))}
                    for d in data if d.get("reason")][:5]
    except Exception:
        pass
    return [{"reason": "Unknown — insufficient data", "stars": 1}]


async def run_regression_monitor() -> dict:
    """Scan for lost recommendations → attribute → alerts."""
    db = DB()
    regressions = _find_regressions(db)
    results = {"found": len(regressions), "analysed": 0, "items": []}

    for reg in regressions:
        try:
            # Which shop owns this keyword? (ai_responses aren't shop-bound;
            # resolve via the most recently active store with content)
            shops = db.client.table("sites").select("domain").neq("access_token", "").limit(5).execute().data or []
            shop = shops[0]["domain"] if shops else ""
            evidence = _evidence_for(db, shop, reg["keyword"])
            reasons = _attribute(evidence)
            db.save_alert(
                shop, "recommendation_lost", "warning",
                f"AI recommendation lost: '{reg['keyword']}' no longer mentioned by {reg['agent']}",
                details={"reasons": reasons, "last_seen": reg["last_seen"], "evidence": evidence},
            )
            results["analysed"] += 1
            results["items"].append({"keyword": reg["keyword"], "agent": reg["agent"], "reasons": reasons})
        except Exception as e:
            results["items"].append({"keyword": reg.get("keyword"), "error": str(e)[:150]})

    return results
