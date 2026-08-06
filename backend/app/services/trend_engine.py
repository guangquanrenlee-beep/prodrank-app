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

    # ── Trend-driven auto alerts ──

    async def check_trend_alerts(self, window_days: int = 7, min_growth: float = 30.0) -> dict:
        """Weekly task: compare the last N days of attribute frequencies against
        the N days before them. Attributes growing fastest are checked against
        every site's product content — missing ones raise an alert.

        This is the 'AI Shopping Trend' flywheel: what shoppers ask about is
        shifting, and merchants learn which content to add BEFORE their
        competitors do.
        """
        rows = (self.db.client.table("trend_snapshots")
                .select("snapshot_date,attributes")
                .order("snapshot_date", desc=True)
                .limit(window_days * 3).execute().data or [])
        if len(rows) < window_days:
            return {"checked": False, "message": f"Not enough snapshots yet ({len(rows)}/{window_days}) — trends need time to accumulate.", "alerts": []}

        series = sorted(rows, key=lambda r: r["snapshot_date"])
        recent = series[-window_days:]
        prev = series[:-window_days][-window_days:] if len(series) > window_days else []

        def aggregate(chunk: list[dict]) -> Counter:
            c: Counter = Counter()
            for r in chunk:
                c.update(r.get("attributes") or {})
            return c

        rec_counts = aggregate(recent)
        prev_counts = aggregate(prev)
        if not prev_counts:
            return {"checked": False, "message": "No previous window to compare", "alerts": []}

        # Growing attributes (prev > 0 so growth is meaningful)
        growing = []
        for attr, prev_c in prev_counts.items():
            rec_c = rec_counts.get(attr, 0)
            if prev_c >= 3 and rec_c >= prev_c:  # avoid noise from rare attrs
                growth = round((rec_c - prev_c) / prev_c * 100, 1)
                if growth >= min_growth:
                    growing.append({"attribute": attr, "recent": rec_c, "previous": prev_c, "growth_pct": growth})
        growing.sort(key=lambda x: -x["growth_pct"])

        if not growing:
            return {"checked": True, "growing": [], "alerts": []}

        # For each site, alert when its products don't cover a growing attribute
        sites = self.db.client.table("sites").select("id,domain").not_.is_("user_id", None).limit(100).execute().data or []
        alerts = []
        for s in sites:
            products = self.db.client.table("products").select("*").eq("site_id", s["id"]).limit(300).execute().data or []
            texts = [self._product_text(p) for p in products]
            for g in growing:
                if any(g["attribute"] in t for t in texts):
                    continue
                msg = (f"AI Shopping Trend: '{g['attribute']}' questions grew {g['growth_pct']}% in the last "
                       f"{window_days} days ({g['previous']}→{g['recent']} mentions). Your products don't mention it — "
                       f"adding it to descriptions/FAQ could boost AI recommendations.")
                self.db.save_alert(
                    shop=s["domain"], alert_type="trend_opportunity",
                    message=msg, severity="medium",
                )
                alerts.append({"shop": s["domain"], "attribute": g["attribute"], "growth_pct": g["growth_pct"], "message": msg})

        return {"checked": True, "growing": growing, "alerts": alerts}
