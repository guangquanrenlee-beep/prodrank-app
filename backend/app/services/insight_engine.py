"""
Insight Engine — ④ of the AI Shopping Intelligence Engine.

Answers "why was my product not recommended" with EVIDENCE, not guesses:
compares the product against competitors across observable factors —
Schema coverage, FAQ count, knowledge coverage, reviews, citations.

Every recommendation carries its data basis: "78% of recommended pages in
this round included ShippingDetails schema; yours is missing" — never a bare
"add more FAQ". This is the AI Evidence Engine layer.
"""

import json
from collections import Counter
from datetime import datetime, timezone

from app.services.db import DB
from app.services.knowledge_templates import KNOWLEDGE_TEMPLATES

# Factor metadata: what each factor means + what to do about it
FACTOR_META = {
    "schema": {
        "label": "Schema Coverage",
        "action": "Add structured data the AI can read: ShippingDetails, ReturnPolicy, GTIN, brand, offers.",
    },
    "faq": {
        "label": "FAQ Coverage",
        "action": "Add FAQ content that answers real shopping questions (the question library is your source).",
    },
    "knowledge": {
        "label": "Knowledge Coverage",
        "action": "Fill missing knowledge fields (material, audience, occasion, care, warranty…) from the category template.",
    },
    "reviews": {
        "label": "Reviews & Rating",
        "action": "Collect more reviews — AI agents weigh review count and rating heavily.",
    },
    "citations": {
        "label": "External Citations",
        "action": "Get mentioned in review sites/forums AI cites (Wirecutter, Reddit, YouTube).",
    },
    "recency": {
        "label": "Content Freshness",
        "action": "Refresh descriptions and FAQ regularly — stale pages are ranked lower.",
    },
}


class InsightEngine:
    """Evidence-based 'why not recommended' analysis."""

    def __init__(self):
        self.db = DB()

    # ── Data gathering ──

    def _site_products(self, site_id: str) -> list[dict]:
        return self.db.client.table("products").select("*").eq("site_id", site_id).limit(500).execute().data or []

    def _competitor_snapshots(self) -> list[dict]:
        """Latest snapshot per competitor (any shop — cross-store insight)."""
        rows = (self.db.client.table("competitor_snapshots")
                .select("competitor_id,details,snapshot_date")
                .order("snapshot_date", desc=True)
                .limit(300).execute().data or [])
        seen: dict[str, dict] = {}
        for r in rows:
            cid = r.get("competitor_id")
            if cid and cid not in seen:
                seen[cid] = r
        return list(seen.values())

    def _test_results(self, site_id: str) -> dict:
        """Recommendation rate from the latest AI test round."""
        rows = (self.db.client.table("ai_query_results")
                .select("recommended,model")
                .eq("site_id", site_id)
                .limit(500).execute().data or [])
        if not rows:
            return {"tested": 0, "rate": None}
        rec = sum(1 for r in rows if r.get("recommended"))
        return {"tested": len(rows), "rate": round(rec / len(rows) * 100, 1)}

    def _citations(self) -> list[dict]:
        """Top cited domains from the citation watcher."""
        rows = (self.db.client.table("citations")
                .select("source_domain").limit(500).execute().data or [])
        return Counter(r.get("source_domain", "") for r in rows if r.get("source_domain"))

    def _category_template(self, category: str) -> dict | None:
        """Knowledge template for a category (which fields products should have)."""
        if category in KNOWLEDGE_TEMPLATES:
            return KNOWLEDGE_TEMPLATES[category]
        # match subcategory templates: knowledge_templates keys may differ
        for key, tpl in KNOWLEDGE_TEMPLATES.items():
            if category in key or key in category:
                return tpl
        return None

    # ── Factor builders ──

    def _schema_factor(self, products: list[dict], competitors: list[dict]) -> dict:
        mine = [p for p in products if p.get("schema_fields")]
        avg_mine = round(sum(p["schema_fields"] for p in mine) / len(mine), 1) if mine else 0
        comp_schema = []
        for c in competitors:
            det = c.get("details") or {}
            fs = det.get("schema_fields") or det.get("fields") or 0
            if isinstance(fs, list):
                fs = len(fs)
            comp_schema.append(fs)
        avg_comp = round(sum(comp_schema) / len(comp_schema), 1) if comp_schema else None

        if not mine:
            return self._factor("schema", "high",
                "Your products have no Schema.org structured data detected.")
        if avg_comp is not None and avg_mine < avg_comp:
            return self._factor("schema", "high",
                f"Competitors average {avg_comp} schema fields; your products average {avg_mine}. "
                f"AI agents prefer pages with complete structured data (shipping, returns, GTIN).")
        if avg_comp is not None and avg_mine >= avg_comp:
            return self._factor("schema", "low",
                f"Your schema coverage ({avg_mine} fields) is at or above the competitor average ({avg_comp}).")
        return self._factor("schema", "medium",
            f"Schema fields detected: {avg_mine} per product. No competitor baseline available yet.")

    def _faq_factor(self, products: list[dict], competitors: list[dict]) -> dict:
        def count_faq(p: dict) -> int:
            pc = p.get("prodrank_content") or {}
            if isinstance(pc, str):
                try:
                    pc = json.loads(pc)
                except Exception:
                    pc = {}
            faq = pc.get("faq") or {}
            qs = faq.get("questions") if isinstance(faq, dict) else None
            return len(qs) if qs else 0

        mine = [count_faq(p) for p in products]
        avg_mine = round(sum(mine) / len(mine), 1) if mine else 0
        comp_faqs = []
        for c in competitors:
            det = c.get("details") or {}
            n = det.get("faq_count")
            if n is not None:
                comp_faqs.append(n)
        avg_comp = round(sum(comp_faqs) / len(comp_faqs), 1) if comp_faqs else None

        if avg_mine == 0:
            return self._factor("faq", "high",
                "No FAQ content on your products. In this category, competitors average "
                f"{avg_comp or 'more'} FAQs — FAQ sections are a strong AI-recommendation signal.")
        if avg_comp is not None and avg_mine < avg_comp:
            return self._factor("faq", "medium",
                f"Your products have {avg_mine} FAQs on average vs competitors' {avg_comp}.")
        return self._factor("faq", "low",
            f"FAQ coverage OK ({avg_mine} per product)" + (f", competitors at {avg_comp}" if avg_comp else "") + ".")

    def _knowledge_factor(self, products: list[dict], category: str) -> dict:
        tpl = self._category_template(category)
        if not tpl:
            return self._factor("knowledge", "low", "No category template for this store's products — nothing to compare.")
        subs = tpl.get("subcategories", {})
        expected = set()
        for sub in subs.values():
            expected.update(sub.get("knowledge", []))
            expected.update(sub.get("decision", []))

        missing: Counter = Counter()
        for p in products:
            kf = p.get("knowledge_fields") or {}
            if isinstance(kf, str):
                try:
                    kf = json.loads(kf)
                except Exception:
                    kf = {}
            have = set(kf.keys()) if isinstance(kf, dict) else set()
            for f in expected:
                if f not in have:
                    missing[f] += 1

        if not missing:
            return self._factor("knowledge", "low", "Knowledge fields fully populated.")
        top = missing.most_common(5)
        missing_pct = round(missing.most_common(1)[0][1] / len(products) * 100) if products else 0
        names = ", ".join(f"'{f}'" for f, _ in top)
        return self._factor("knowledge", "high" if missing_pct >= 60 else "medium",
            f"{missing_pct}% of your products are missing knowledge fields AI looks for: {names}. "
            f"These answer 'what is it / who is it for / when to use it' — the core of AI recommendations.")

    def _reviews_factor(self, products: list[dict]) -> dict:
        rated = [p for p in products if p.get("rating")]
        if not rated:
            return self._factor("reviews", "medium",
                "No ratings/reviews on your products. AI agents strongly favor pages with social proof.")
        avg_rating = round(sum(float(p["rating"]) for p in rated) / len(rated), 2)
        total_reviews = sum(int(p.get("review_count") or 0) for p in products)
        if total_reviews < 10:
            return self._factor("reviews", "medium",
                f"Only {total_reviews} reviews total (avg rating {avg_rating}). Under ~50 reviews, AI often "
                f"omits a product even when its specs are good.")
        return self._factor("reviews", "low",
            f"{total_reviews} reviews, avg rating {avg_rating} — decent social proof.")

    def _citation_factor(self, domain: str, citations: Counter) -> dict:
        mine = citations.get(domain, 0)
        total = sum(citations.values())
        top = citations.most_common(5)
        if total == 0:
            return self._factor("citations", "low", "No citation data collected yet — run the citation watcher.")
        if mine == 0:
            names = ", ".join(f"{d} ({n})" for d, n in top)
            return self._factor("citations", "medium",
                f"AI cites {names} but never {domain}. External citations are a strong recommendation signal.")
        return self._factor("citations", "low",
            f"{domain} cited {mine} times in recent AI responses.")

    # ── Assembly ──

    def _factor(self, key: str, severity: str, evidence: str) -> dict:
        meta = FACTOR_META.get(key, {})
        return {
            "factor": key,
            "label": meta.get("label", key),
            "severity": severity,  # high | medium | low
            "evidence": evidence,
            "action": meta.get("action", ""),
        }

    async def why_not_recommended(self, site_id: str, domain: str = "", category: str = "") -> dict:
        """Full evidence-based analysis for a site."""
        products = self._site_products(site_id)
        competitors = self._competitor_snapshots()
        tests = self._test_results(site_id)
        citations = self._citations()

        # Category from products if not given (products lack a category column
        # pre-migration-020; fall back to product_type/title heuristics).
        if not category and products:
            from app.services.shopify_ai import ShopifyAIService
            ai = ShopifyAIService()
            cat, _ = await ai.detect_category(products[0])
            category = cat if cat != "default" else ""

        factors = [
            self._schema_factor(products, competitors),
            self._faq_factor(products, competitors),
            self._knowledge_factor(products, category),
            self._reviews_factor(products),
            self._citation_factor(domain, citations),
        ]
        # Sort: high first, then medium, then low
        order = {"high": 0, "medium": 1, "low": 2}
        factors.sort(key=lambda f: order.get(f["severity"], 3))

        return {
            "site_id": site_id,
            "category": category or "unknown",
            "product_count": len(products),
            "recommendation_rate": tests.get("rate"),
            "tested_queries": tests.get("tested"),
            "factors": factors,
            "summary": self._summary(factors, tests),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    def _summary(self, factors: list[dict], tests: dict) -> str:
        high = [f for f in factors if f["severity"] == "high"]
        medium = [f for f in factors if f["severity"] == "medium"]
        parts = []
        if tests.get("rate") is not None:
            parts.append(f"Your products appear in {tests['rate']}% of AI shopping recommendations.")
        if high:
            names = ", ".join(f["label"] for f in high)
            parts.append(f"Significant gaps: {names}.")
        if medium:
            names = ", ".join(f["label"] for f in medium)
            parts.append(f"Improvement areas: {names}.")
        if not high and not medium:
            parts.append("No major gaps found — your content is competitive.")
        return " ".join(parts)
