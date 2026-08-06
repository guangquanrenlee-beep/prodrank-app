"""
Trend Engine — AI Shopping Trend analysis.

What shoppers ask about, ranked by frequency across the question library,
plus which hot attributes the merchant's products are MISSING (evidence-
backed content suggestions). A daily snapshot of attribute frequencies is
persisted to trend_snapshots so real 30-day trends accumulate over time.
"""

import json
from collections import Counter
from datetime import datetime, timezone

from app.services.db import DB


class TrendEngine:
    def __init__(self):
        self.db = DB()

    # ── Attribute aggregation ──

    def _query_attributes(self, category: str = "") -> Counter:
        """Aggregate attributes mentioned across the question library."""
        q = self.db.client.table("ai_shopping_queries").select("attributes,category")
        if category:
            q = q.eq("category", category)
        rows = q.limit(3000).execute().data or []
        counter: Counter = Counter()
        for r in rows:
            attrs = r.get("attributes") or []
            if isinstance(attrs, str):
                try:
                    attrs = json.loads(attrs)
                except Exception:
                    attrs = []
            for a in attrs:
                if isinstance(a, str):
                    counter[a.strip().lower()] += 1
        return counter

    def _product_text(self, p: dict) -> str:
        return " ".join(str(x) for x in [
            p.get("title", ""), p.get("description", ""),
            p.get("product_type", ""), p.get("category", ""),
        ]).lower()

    # ── Public API ──

    async def hot_attributes(self, category: str = "", top_n: int = 15) -> list[dict]:
        """Hot attributes shoppers ask about, ranked by frequency."""
        counter = self._query_attributes(category)
        total = sum(counter.values()) or 1
        return [
            {"attribute": attr, "count": cnt, "share_pct": round(cnt / total * 100, 1)}
            for attr, cnt in counter.most_common(top_n)
        ]

    async def product_gaps(self, site_id: str, category: str = "") -> list[dict]:
        """Hot attributes the site's products DON'T cover (content gap advice)."""
        products = self.db.client.table("products").select("*").eq("site_id", site_id).limit(500).execute().data or []
        if not products:
            return []
        hot = await self.hot_attributes(category, top_n=25)
        if not hot:
            return []

        # A product "covers" an attribute if any product text mentions it
        # (substring match on multi-word attributes).
        texts = [self._product_text(p) for p in products]
        gaps = []
        for h in hot:
            attr = h["attribute"]
            if any(attr in t for t in texts):
                continue
            gaps.append({
                "attribute": attr,
                "count": h["count"],
                "share_pct": h["share_pct"],
                "advice": f"Shoppers ask about '{attr}' in {h['share_pct']}% of queries — your product content doesn't mention it.",
            })
        return gaps

    async def snapshot(self) -> dict:
        """Persist today's attribute frequency for trend accumulation."""
        counter = self._query_attributes()
        if not counter:
            return {"snapshot_date": None, "attributes": 0}
        today = datetime.now(timezone.utc).date().isoformat()
        payload = dict(counter.most_common(100))
        self.db.client.table("trend_snapshots").upsert(
            {"snapshot_date": today, "attributes": payload},
            on_conflict="snapshot_date",
        ).execute()
        return {"snapshot_date": today, "attributes": len(payload)}

    async def trend(self, days: int = 30, top_n: int = 10) -> dict:
        """30-day attribute trend from daily snapshots (empty until snapshots accumulate)."""
        rows = (self.db.client.table("trend_snapshots")
                .select("snapshot_date,attributes")
                .order("snapshot_date", desc=True)
                .limit(days).execute().data or [])
        if not rows:
            return {"has_data": False, "message": "No trend data yet — snapshots accumulate daily.", "series": []}

        series = sorted(rows, key=lambda r: r["snapshot_date"])
        attrs = set()
        for r in series:
            attrs.update((r.get("attributes") or {}).keys())
        top = [a for a, _ in Counter(
            {a: sum(r.get("attributes", {}).get(a, 0) for r in series) for a in attrs}
        ).most_common(top_n)]

        out = []
        for a in top:
            points = []
            prev = None
            for r in series:
                v = (r.get("attributes") or {}).get(a, 0)
                points.append({"date": r["snapshot_date"], "count": v})
                prev = v
            growth = None
            if len(points) >= 2:
                first = points[0]["count"]
                last = points[-1]["count"]
                if first:
                    growth = round((last - first) / first * 100, 1)
            out.append({"attribute": a, "growth_pct": growth, "points": points})
        out.sort(key=lambda x: -(x["growth_pct"] or 0))
        return {"has_data": True, "series": series, "trends": out}
