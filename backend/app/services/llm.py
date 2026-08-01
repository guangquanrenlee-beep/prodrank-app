"""Unified LLM client factory.

Content generation (descriptions, FAQ, pros/cons, parsing, question
library, etc.) runs on DeepSeek V4-flash via the official API when
DEEPSEEK_API_KEY is configured — ~60-75% cheaper than the ofox
gateway. Falls back to the ofox gateway when the key is absent.

Rank tracking keeps its 4-model setup (ChatGPT/Gemini/Claude/Grok)
and vision stays on gpt-4o — neither is affected here.
"""

import os

from openai import AsyncOpenAI

from app.core.config import get_settings

DEEPSEEK_BASE = "https://api.deepseek.com/v1"
CONTENT_MODEL = "deepseek-v4-flash"           # official API id (no vendor prefix)
OFOX_CONTENT_MODEL = "deepseek/deepseek-v4-flash"  # ofox gateway id


def get_content_client() -> tuple[AsyncOpenAI, str]:
    """(client, model_id) for content generation — DeepSeek official first,
    ofox gateway as fallback (transparent via env)."""
    settings = get_settings()
    key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if key:
        return AsyncOpenAI(api_key=key, base_url=DEEPSEEK_BASE), CONTENT_MODEL
    return (
        AsyncOpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url),
        OFOX_CONTENT_MODEL,
    )
