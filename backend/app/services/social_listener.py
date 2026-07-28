"""
Social Listening Service — Reddit keyword monitoring and AI response drafting.

Reddit JSON API (free, no auth needed for read-only):
  https://www.reddit.com/search.json?q={query}&sort=new&limit=25&restrict_sr=off&t=week

Rate limit: ~60 req/min. We throttle to 10/min to be safe.
"""

import json
import hashlib
from datetime import datetime, timezone
from typing import Any

import httpx
from openai import AsyncOpenAI

from app.core.config import get_settings
from app.services.db import DB

# ── Constants ──

REDDIT_SEARCH_URL = "https://www.google.com/search"
QUESTION_MARKERS = [
    "recommend", "suggest", "looking for", "best", "which", "what", "how",
    "anyone", "help", "advice", "opinion", "thoughts", "experience",
    "alternative to", "switch from", "replace", "tired of", "frustrated",
    "overpriced", "worth it", "should i", "is it worth",
]
AD_MARKERS = ["[ad]", "[promoted]", "sponsored", "affiliate link", "buy now", "discount code"]


class SocialListener:
    """Monitor Reddit for keyword-matching posts and generate AI response drafts."""

    def __init__(self):
        settings = get_settings()
        self.ai_client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
        self.fast_model = "google/gemini-3.6-flash"
        self.draft_model = "anthropic/claude-haiku-4.5"

    # ── Reddit Search ──

    async def scan_reddit_for_user(self, email: str) -> list[dict]:
        """Scan Reddit for all active keyword sets belonging to a user.
        Returns list of newly discovered posts saved to DB."""
        db = DB()
        user = db.client.rpc("get_user_id_by_email", {"p_email": email}).execute()
        if not user.data:
            return []
        uid = user.data[0]
        user_id = uid.get("id", uid) if isinstance(uid, dict) else str(uid)

        # Get active keyword sets
        keywords_data = db.client.table("social_keywords") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("is_active", True) \
            .execute().data or []

        if not keywords_data:
            return []

        all_posts: list[dict] = []
        seen_ids: set[str] = set()

        for kw_set in keywords_data:
            queries = self._build_queries(kw_set)
            for query in queries:
                try:
                    posts = await self._search_reddit(query)
                    for post in posts:
                        pid = post.get("id", "")
                        if pid and pid not in seen_ids:
                            seen_ids.add(pid)
                            # Match keywords against post
                            matched, mtype = self._match_keywords(post, kw_set)
                            if matched:
                                saved = self._save_post(db, user_id, kw_set["id"], post, matched, mtype)
                                all_posts.append(saved)
                except Exception as e:
                    print(f"[SocialListener] Reddit search failed for '{query}': {e}")
                    continue

        return all_posts

    def _build_queries(self, kw_set: dict) -> list[str]:
        """Build search queries from keyword set. Combines broad industry queries
        with targeted brand/product queries."""
        queries = []
        industry = kw_set.get("industry_keywords", []) or []
        brands = kw_set.get("brand_keywords", []) or []
        products = kw_set.get("product_keywords", []) or []

        # Broad: search each industry keyword
        for kw in industry[:3]:
            queries.append(kw)

        # Targeted: combine industry with question words
        for kw in industry[:2]:
            queries.append(f"{kw} recommendation")
            queries.append(f"best {kw}")

        # Brand: search brand mentions
        for b in brands[:3]:
            queries.append(b)

        # Product: search product-related questions
        for p in products[:3]:
            queries.append(f"{p} tool")
            queries.append(f"best {p}")

        # Deduplicate
        return list(set(queries))[:10]

    async def _search_reddit(self, query: str) -> list[dict]:
        """Search Reddit via Google with site:reddit.com prefix.
        Parses Google SERP to extract Reddit post URLs, then fetches details via Reddit JSON API."""
        posts = []
        search_query = f"site:reddit.com {query}"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"}

        try:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                resp = await client.get(
                    REDDIT_SEARCH_URL,
                    params={"q": search_query, "num": 20, "tbs": "qdr:w"},
                    headers=headers,
                    timeout=15,
                )
                if resp.status_code != 200:
                    return []

                # Extract Reddit URLs from Google SERP
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(resp.text, "lxml")
                reddit_links: set[str] = set()
                for a in soup.select("a[href]"):
                    href = a.get("href", "")
                    if "/r/" in href and "reddit.com" in href:
                        # Clean Google redirect URL
                        if href.startswith("/url?q="):
                            href = href.split("/url?q=")[1].split("&")[0]
                        if "reddit.com/r/" in href and "/comments/" in href:
                            reddit_links.add(href)

                # Fetch post details from Reddit JSON (old.reddit.com still works for .json)
                for url in list(reddit_links)[:15]:
                    try:
                        if "?" in url:
                            json_url = url.split("?")[0] + ".json"
                        else:
                            json_url = url.rstrip("/") + ".json"
                        r = await client.get(
                            json_url,
                            headers={"User-Agent": "Mozilla/5.0"},
                            timeout=10,
                        )
                        if r.status_code == 200:
                            data = r.json()
                            post_data = data[0]["data"]["children"][0]["data"]
                            post_id = post_data.get("id", "")
                            permalink = post_data.get("permalink", "")
                            posts.append({
                                "id": post_id,
                                "title": post_data.get("title", ""),
                                "body": post_data.get("selftext", ""),
                                "url": f"https://www.reddit.com{permalink}",
                                "author": post_data.get("author", ""),
                                "subreddit": post_data.get("subreddit_name_prefixed", ""),
                                "upvotes": post_data.get("ups", 0) or post_data.get("score", 0),
                                "comment_count": post_data.get("num_comments", 0),
                                "posted_at": datetime.fromtimestamp(post_data.get("created_utc", 0), tz=timezone.utc).isoformat(),
                            })
                    except Exception:
                        continue

        except Exception as e:
            print(f"[SocialListener] Google search failed: {e}")

        return posts

    def _match_keywords(self, post: dict, kw_set: dict) -> tuple[list[str], str]:
        """Check which keywords match the post. Returns (matched_list, matched_type)."""
        text = f"{post.get('title', '')} {post.get('body', '')}".lower()
        matched = []
        mtype = ""

        all_kw = []
        for k in kw_set.get("industry_keywords", []) or []:
            all_kw.append(("industry", k))
        for k in kw_set.get("brand_keywords", []) or []:
            all_kw.append(("brand", k))
        for k in kw_set.get("product_keywords", []) or []:
            all_kw.append(("product", k))

        for typ, kw in all_kw:
            if kw.lower() in text:
                matched.append(kw)
                if not mtype:
                    mtype = typ

        return matched, mtype

    @staticmethod
    def _is_question(post: dict) -> bool:
        """Heuristic: detect if a post is asking a question."""
        title = post.get("title", "").lower()
        body = (post.get("body", "") or "").lower()
        text = f"{title} {body}"

        # Question mark
        if "?" in title:
            return True

        # Question words
        for marker in QUESTION_MARKERS:
            if marker in text:
                return True

        return False

    @staticmethod
    def _is_ad(post: dict) -> bool:
        """Heuristic: detect promotional/ad posts to filter out."""
        text = f"{post.get('title', '')} {post.get('body', '')}".lower()
        for marker in AD_MARKERS:
            if marker in text:
                return True
        return False

    def _save_post(self, db: DB, user_id: str, keyword_set_id: str,
                   post: dict, matched: list[str], mtype: str) -> dict:
        """Save a discovered post to social_posts, skipping duplicates."""
        try:
            existing = db.client.table("social_posts") \
                .select("id") \
                .eq("user_id", user_id) \
                .eq("source_post_id", post["id"]) \
                .execute().data
            if existing:
                return {}

            is_q = self._is_question(post)
            is_ad = self._is_ad(post)

            result = db.client.table("social_posts").insert({
                "user_id": user_id,
                "keyword_set_id": keyword_set_id,
                "source": "reddit",
                "source_post_id": post["id"],
                "title": post["title"],
                "body": post.get("body", ""),
                "url": post["url"],
                "author": post.get("author", ""),
                "subreddit": post.get("subreddit", ""),
                "is_question": is_q,
                "is_ad": is_ad,
                "upvotes": post.get("upvotes", 0),
                "comment_count": post.get("comment_count", 0),
                "posted_at": post.get("posted_at"),
                "matched_keywords": matched,
                "matched_type": mtype,
            }).execute()
            return result.data[0] if result.data else {}
        except Exception as e:
            print(f"[SocialListener] Failed to save post: {e}")
            return {}

    # ── AI Draft Generation ──

    async def generate_draft(self, post: dict, style: str = "helpful") -> dict:
        """Generate an AI response draft for a Reddit post."""
        style_prompts = {
            "helpful": "Write as a knowledgeable community member. Be genuinely helpful — answer the question first, mention the product naturally only if relevant. Never sound like an ad.",
            "expert": "Write as an industry expert. Include specific data points or comparisons. Show deep knowledge of the problem space.",
            "promotional": "Write as a satisfied user sharing their experience. Focus on how the product solved your problem. Keep it personal and authentic.",
            "casual": "Write in a friendly, conversational tone. Short paragraphs, emojis OK. Sound like a real person, not corporate.",
        }
        style_instruction = style_prompts.get(style, style_prompts["helpful"])

        prompt = f"""You are helping a user respond to a Reddit post. The user's goal is to be genuinely helpful while naturally introducing their product.

REDDIT POST:
Title: {post.get('title', '')}
Body: {(post.get('body', '') or '')[:500]}
Subreddit: r/{post.get('subreddit', 'unknown')}

WRITING STYLE: {style_instruction}

Write a 150-300 word response. The response should:
1. Directly answer the question or address the concern raised
2. Be authentic — don't sound like a marketing bot
3. Naturally mention the product's value only if genuinely relevant
4. End with an open-ended question to encourage discussion

Return ONLY the response text, no meta-commentary."""
        try:
            resp = await self.ai_client.chat.completions.create(
                model=self.draft_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=600,
                timeout=20.0,
            )
            text = resp.choices[0].message.content.strip()
            return {"text": text, "model": self.draft_model}
        except Exception as e:
            print(f"[SocialListener] AI draft failed: {e}")
            return {"text": "", "error": str(e)}

    # ── Stats ──

    async def get_stats(self, user_id: str) -> dict:
        """Get aggregate social listening stats for a user."""
        db = DB()
        total = db.client.table("social_posts") \
            .select("id", count="exact") \
            .eq("user_id", user_id) \
            .eq("is_ad", False) \
            .execute().count or 0
        pending = db.client.table("social_responses") \
            .select("id", count="exact") \
            .eq("user_id", user_id) \
            .eq("action", "pending") \
            .execute().count or 0
        return {"total_posts": total, "pending": pending}
