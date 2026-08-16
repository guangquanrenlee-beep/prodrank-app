"""
Knowledge Engine — Ingest user-uploaded product materials and extract structured knowledge via AI.

Supports: CSV, PDF (via pdfplumber), images (via OpenAI Vision), YouTube (via transcript + AI summary).
"""

import csv
import io
import json
import re
from typing import Any

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.services.db import DB

ENTITY_TYPES = [
    "material", "audience", "size", "care", "warranty", "use_case",
    "weather", "fit", "style", "comparison", "compatibility",
    "certification", "ingredient", "safety", "feature", "benefit",
    "price_range", "shipping", "return_policy",
]


class KnowledgeEngine:
    """Process uploaded files and extract structured product knowledge."""

    def __init__(self):
        settings = get_settings()
        # Text extraction is a content-type task → DeepSeek (cheap, per user rule).
        # Vision has no DeepSeek equivalent — keep the ofox gpt-4o client only for images.
        from app.services.llm import get_content_client
        self.text_client, self.text_model = get_content_client()
        self.vision_client = AsyncOpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)
        self.vision_model = "openai/gpt-4o"

    # ── CSV Processing ──

    async def process_csv(self, user_id: str, site_id: str, filename: str, content: bytes) -> list[dict]:
        """Parse CSV file and store each row as knowledge entries."""
        text = content.decode("utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        entries = []
        for row in reader:
            for key, value in row.items():
                if value and value.strip():
                    etype = self._classify_column(key.lower())
                    entry = self._save_entry(user_id, site_id, etype, value.strip(), key, "csv", filename)
                    entries.append(entry)
        return entries

    # ── PDF Processing ──

    async def process_pdf(self, user_id: str, site_id: str, filename: str, content: bytes) -> list[dict]:
        """Extract text from PDF and use AI to identify knowledge entities."""
        try:
            import pdfplumber
            text = ""
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                for page in pdf.pages[:10]:  # limit to first 10 pages
                    t = page.extract_text()
                    if t: text += t + "\n"
            if not text.strip():
                return [{"error": "No extractable text found in PDF"}]
            return await self._extract_from_text(user_id, site_id, text, filename, "pdf")
        except ImportError:
            return [{"error": "pdfplumber not installed. Run: pip install pdfplumber"}]
        except Exception as e:
            return [{"error": f"PDF processing failed: {e}"}]

    # ── Image Processing ──

    async def process_image(self, user_id: str, site_id: str, filename: str, content: bytes) -> list[dict]:
        """Use OpenAI Vision to describe product image and extract attributes."""
        import base64
        b64 = base64.b64encode(content).decode()
        prompt = """Analyze this product image. Extract ALL relevant attributes in JSON format:
{
  "product_name": "guessed product name",
  "attributes": [
    {"type": "material", "value": "cotton", "confidence": 0.9},
    {"type": "style", "value": "casual", "confidence": 0.8},
    {"type": "color", "value": "black", "confidence": 0.95}
  ]
}
Only include attributes you can actually see. Confidence = how sure you are (0.0-1.0)."""
        try:
            resp = await self.vision_client.chat.completions.create(
                model=self.vision_model,
                messages=[{"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                ]}],
                max_tokens=800, timeout=30,
            )
            text = resp.choices[0].message.content or ""
            data = json.loads(self._clean_json(text))
            entries = []
            for attr in data.get("attributes", []):
                e = self._save_entry(user_id, site_id, attr.get("type", ""), attr.get("value", ""),
                                     attr.get("type", ""), "image", filename, confidence=attr.get("confidence", 0.5))
                entries.append(e)
            return entries
        except Exception as e:
            return [{"error": f"Image analysis failed: {e}"}]

    # ── YouTube Processing ──

    async def process_youtube(self, user_id: str, site_id: str, video_url: str) -> list[dict]:
        """Fetch YouTube transcript and extract product knowledge via AI."""
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
            # Extract video ID from URL
            match = re.search(r'(?:v=|/)([\w-]{11})', video_url)
            if not match:
                return [{"error": "Invalid YouTube URL"}]
            video_id = match.group(1)
            transcript = YouTubeTranscriptApi.get_transcript(video_id)
            text = " ".join([t["text"] for t in transcript[:100]])  # first ~100 segments
            return await self._extract_from_text(user_id, site_id, text, video_url, "youtube")
        except ImportError:
            return [{"error": "youtube-transcript-api not installed. Run: pip install youtube-transcript-api"}]
        except Exception as e:
            return [{"error": f"YouTube processing failed: {e}"}]

    # ── Core: AI text extraction ──

    async def _extract_from_text(self, user_id: str, site_id: str, text: str,
                                  source: str, source_type: str) -> list[dict]:
        """Use AI to extract structured knowledge from raw text."""
        prompt = f"""Analyze this product text and extract structured knowledge.

Entity types: {", ".join(ENTITY_TYPES)}
For each entity found, return: type, value, confidence (0.0-1.0)

Text to analyze:
{text[:5000]}

Return ONLY valid JSON array: [{{"type":"...","value":"...","confidence":0.X}}, ...]"""
        try:
            resp = await self.text_client.chat.completions.create(
                model=self.text_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2, max_tokens=1000, timeout=25,
            )
            content = resp.choices[0].message.content or ""
            items = json.loads(self._clean_json(content))
            entries = []
            for item in items:
                e = self._save_entry(user_id, site_id, item.get("type", ""), item.get("value", ""),
                                     item.get("type", ""), source_type, source,
                                     confidence=item.get("confidence", 0.5))
                entries.append(e)
            return entries
        except Exception as e:
            return [{"error": f"AI extraction failed: {e}"}]

    # ── Helpers ──

    def _save_entry(self, user_id: str, site_id: str, etype: str, value: str,
                    key: str = "", source_type: str = "manual", source: str = "",
                    confidence: float = 1.0) -> dict:
        """Save knowledge entry to database."""
        if not value or not value.strip():
            return {}
        db = DB()
        try:
            result = db.client.table("knowledge_base").insert({
                "user_id": user_id,
                "site_id": site_id,
                "entity_type": etype[:50] if etype else "general",
                "entity_value": value[:2000],
                "entity_key": key[:200],
                "source_type": source_type,
                "source_url": source or "",
                "source_filename": source if source_type in ("csv", "pdf", "image") else "",
                "confidence": confidence,
                "ai_model": self.text_model,
            }).execute()
            return result.data[0] if result.data else {}
        except Exception as e:
            return {"error": str(e)}

    @staticmethod
    def _classify_column(col: str) -> str:
        """Heuristic: map CSV column names to knowledge entity types."""
        mapping = {
            "material": "material", "fabric": "material", "composition": "material",
            "audience": "audience", "target": "audience", "gender": "audience", "age": "audience",
            "size": "size", "dimensions": "size", "weight": "size",
            "care": "care", "washing": "care", "maintenance": "care",
            "warranty": "warranty", "guarantee": "warranty",
            "price": "price_range", "msrp": "price_range",
            "usage": "use_case", "use": "use_case", "application": "use_case",
            "style": "style", "design": "style",
            "color": "style", "colour": "style",
            "season": "weather", "weather": "weather",
            "feature": "feature", "benefit": "feature", "spec": "feature",
            "certification": "certification", "cert": "certification",
            "brand": "brand", "vendor": "brand",
            "ingredient": "ingredient", "ingredients": "ingredient",
            "sku": "sku", "gtin": "sku", "barcode": "sku",
        }
        for key, etype in mapping.items():
            if key in col:
                return etype
        return col

    @staticmethod
    def _clean_json(text: str) -> str:
        """Strip markdown code fences from AI response."""
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3]
        return text.strip()

    # ── Stats for scoring integration ──

    def get_knowledge_stats(self, user_id: str) -> dict:
        """Return knowledge base stats for Understand Score boost."""
        db = DB()
        count = db.client.table("knowledge_base").select("id", count="exact") \
            .eq("user_id", user_id).eq("status", "active").execute().count or 0
        types = db.client.table("knowledge_base").select("entity_type") \
            .eq("user_id", user_id).eq("status", "active").execute().data or []
        unique_types = len(set(t["entity_type"] for t in types if t.get("entity_type")))
        return {"total_entries": count, "unique_types": unique_types}
