"""
Source Marketplace Service — Discover sources from Citation Intelligence,
evaluate authority, and generate customized outreach pitches using AI.
"""

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.services.db import DB


class SourceMarketplace:
    """Discover citation sources and generate outreach pitches."""

    def __init__(self):
        settings = get_settings()
        self.ai_client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
        self.fast_model = "google/gemini-3.6-flash"
        self.pitch_model = "anthropic/claude-haiku-4.5"

    # ── Source Discovery ──

    async def discover_sources(self, email: str, category: str = "") -> list[dict]:
        """Find sources that cite competitors but not the user's domain.
        Relies on existing Citation Intelligence data."""
        db = DB()

        # 1. Get user's sites and domains
        user = db.client.rpc("get_user_id_by_email", {"p_email": email}).execute()
        if not user.data:
            return []
        user_id = str(user.data[0]["id"])

        sites = db.client.table("sites") \
            .select("domain,platform") \
            .eq("user_id", user_id) \
            .execute().data or []

        if not sites:
            return []

        user_domain = sites[0]["domain"]
        brand_name = user_domain.split(".")[0].capitalize()

        # 2. Get citation data from Supabase
        citations = db.client.table("citations") \
            .select("source_domain,source_url,ai_agent,category") \
            .limit(500) \
            .execute().data or []

        if not citations:
            return []

        # 3. Aggregate by source domain
        domain_stats: dict[str, dict] = {}
        for c in citations:
            dom = c.get("source_domain", "")
            if not dom or dom == user_domain:
                continue
            if dom not in domain_stats:
                domain_stats[dom] = {
                    "domain": dom,
                    "url": c.get("source_url", f"https://{dom}"),
                    "total": 0,
                    "chatgpt": 0, "gemini": 0, "claude": 0, "grok": 0,
                    "categories": set(),
                }
            domain_stats[dom]["total"] += 1
            agent = c.get("ai_agent", "")
            if agent in domain_stats[dom]:
                domain_stats[dom][agent] += 1
            domain_stats[dom]["categories"].add(c.get("category", ""))

        # 4. Score and sort
        sources = []
        for dom, stats in domain_stats.items():
            if stats["total"] < 2:  # skip one-off citations
                continue

            authority = min(100, stats["total"] * 10)
            cat_str = ", ".join(list(stats["categories"])[:3])

            # Determine trend (simplified: if total > 5 treat as rising)
            trend = "rising" if stats["total"] >= 5 else "stable"

            # Estimate cost based on domain pattern
            cost = "unknown"
            dom_lower = dom.lower()
            if any(kw in dom_lower for kw in ["forbes", "techcrunch", "wsj", "bloomberg", "wired"]):
                cost = "high"
            elif any(kw in dom_lower for kw in ["reddit", "quora", "medium", "dev.to", "stackoverflow"]):
                cost = "low"
            elif any(kw in dom_lower for kw in ["g2", "capterra", "trustpilot", "getapp", "trustradius"]):
                cost = "free"

            sources.append({
                "domain": dom,
                "url": stats["url"],
                "source_type": _classify_source_type(dom),
                "name": dom.replace("www.", "").split(".")[0].capitalize(),
                "description": "",
                "category": cat_str,
                "authority_score": authority,
                "citation_frequency": {
                    "chatgpt": stats["chatgpt"],
                    "gemini": stats["gemini"],
                    "claude": stats["claude"],
                    "grok": stats["grok"],
                },
                "total_citations": stats["total"],
                "cites_competitors": [],
                "trend": trend,
                "estimated_cost": cost,
                "relevance_score": authority,
            })

        sources.sort(key=lambda s: s["total_citations"], reverse=True)

        # 5. Save to marketplace_sources
        saved = []
        for src in sources[:30]:
            try:
                existing = db.client.table("marketplace_sources") \
                    .select("id") \
                    .eq("user_id", user_id) \
                    .eq("domain", src["domain"]) \
                    .execute().data
                if existing:
                    continue

                result = db.client.table("marketplace_sources").insert({
                    "user_id": user_id,
                    "domain": src["domain"],
                    "url": src["url"],
                    "source_type": src["source_type"],
                    "name": src["name"],
                    "description": src["description"],
                    "category": src["category"],
                    "authority_score": src["authority_score"],
                    "citation_frequency": src["citation_frequency"],
                    "total_citations": src["total_citations"],
                    "cites_competitors": src["cites_competitors"],
                    "trend": src["trend"],
                    "estimated_cost": src["estimated_cost"],
                    "relevance_score": src["relevance_score"],
                }).execute()

                if result.data:
                    # Create initial outreach record
                    outreach = db.client.table("marketplace_outreach").insert({
                        "user_id": user_id,
                        "source_id": result.data[0]["id"],
                        "status": "discovered",
                    }).execute()
                    src["id"] = result.data[0]["id"]
                    src["outreach"] = {"status": "discovered"}
                    saved.append(src)
            except Exception as e:
                print(f"[Marketplace] Failed to save source {src['domain']}: {e}")
                continue

        return saved

    # ── Pitch Generation ──

    async def generate_pitch(self, email: str, source_id: str, style: str = "professional") -> dict:
        """Generate a customized outreach pitch for a specific source."""
        db = DB()

        # Load source data
        user = db.client.rpc("get_user_id_by_email", {"p_email": email}).execute()
        if not user.data:
            return {}
        user_id = str(user.data[0]["id"])

        source = db.client.table("marketplace_sources") \
            .select("*") \
            .eq("id", source_id) \
            .execute().data
        if not source:
            return {}
        source = source[0]

        # Get user's brand info
        sites = db.client.table("sites") \
            .select("domain,score_data") \
            .eq("user_id", user_id) \
            .execute().data or []
        user_domain = sites[0]["domain"] if sites else "yourdomain.com"
        brand_name = user_domain.split(".")[0].capitalize()

        style_configs = {
            "professional": {
                "label": "Professional",
                "prompt": "Write a professional, concise outreach email. Formal tone, clear value proposition, respectful. Include a clear call to action.",
            },
            "casual": {
                "label": "Casual",
                "prompt": "Write a friendly, casual outreach message. Conversational tone, short paragraphs. Make it feel like a peer reaching out, not a cold pitch.",
            },
            "value-first": {
                "label": "Value-First",
                "prompt": "Lead with unique value — a specific data point, insight, or exclusive offer. Show what the recipient gains. Business-focused with clear benefits.",
            },
            "partnership": {
                "label": "Partnership",
                "prompt": "Write a partnership proposal. Frame it as a mutually beneficial collaboration. Suggest co-marketing or affiliate opportunities.",
            },
        }

        style_config = style_configs.get(style, style_configs["professional"])

        prompt = f"""You are helping a SaaS company named "{brand_name}" ({user_domain}) reach out to a publication/source for coverage.

SOURCE TO PITCH:
  Name: {source.get('name', source.get('domain', ''))}
  Domain: {source.get('domain', '')}
  Type: {source.get('source_type', 'review')}
  Category: {source.get('category', '')}
  AI Citation Count: {source.get('total_citations', 0)}

YOUR PRODUCT:
  Brand: {brand_name}
  Domain: {user_domain}
  What it does: AI-powered visibility optimization for ecommerce and SaaS — helps products get recommended by ChatGPT, Gemini, and other AI agents.

STYLE: {style_config['prompt']}

Generate a pitch with these sections in JSON format:
{{
  "subject": "Subject line for email",
  "body": "The full pitch message. Keep it 200-350 words. Include why {brand_name} is relevant to their audience, what makes it unique, and a clear call to action.",
  "key_point": "One sentence elevator pitch version"
}}

Return ONLY valid JSON, no other text."""
        try:
            resp = await self.ai_client.chat.completions.create(
                model=self.pitch_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=800,
                timeout=25.0,
            )
            content = resp.choices[0].message.content.strip()
            # Clean markdown code blocks if present
            if content.startswith("```"):
                content = content.split("\n", 1)[1]
                if content.endswith("```"):
                    content = content[:-3]
            pitch_data = json.loads(content)
        except Exception as e:
            print(f"[Marketplace] AI pitch failed: {e}")
            return {"error": str(e)}

        # Save pitch to database
        try:
            # Get or create outreach
            outreach = db.client.table("marketplace_outreach") \
                .select("id") \
                .eq("source_id", source_id) \
                .eq("user_id", user_id) \
                .execute().data

            outreach_id = outreach[0]["id"] if outreach else None

            result = db.client.table("marketplace_pitches").insert({
                "user_id": user_id,
                "source_id": source_id,
                "outreach_id": outreach_id,
                "style": style,
                "pitch_text": pitch_data.get("body", ""),
                "subject_line": pitch_data.get("subject", ""),
                "ai_model": self.pitch_model,
            }).execute()

            pitch_id = result.data[0]["id"] if result.data else ""
            return {
                "pitch_id": pitch_id,
                "source_id": source_id,
                "style": style,
                "subject": pitch_data.get("subject", ""),
                "body": pitch_data.get("body", ""),
                "key_point": pitch_data.get("key_point", ""),
                "model": self.pitch_model,
            }
        except Exception as e:
            print(f"[Marketplace] Failed to save pitch: {e}")
            return {"error": str(e)}


def _classify_source_type(domain: str) -> str:
    """Classify a domain into a source type for the marketplace."""
    d = domain.lower()
    if any(kw in d for kw in ["youtube.com", "youtu.be", "vimeo"]):
        return "youtube"
    if any(kw in d for kw in ["g2.com", "capterra", "trustpilot", "getapp", "trustradius", "producthunt"]):
        return "directory"
    if any(kw in d for kw in ["medium.com", "dev.to", "blog.", "wordpress"]):
        return "blog"
    if any(kw in d for kw in ["reddit.com", "quora.com", "stackexchange", "stackoverflow"]):
        return "forum"
    return "review"
