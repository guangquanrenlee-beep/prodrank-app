"""
External API Integrations — WooCommerce, YouTube, Google Search Console.
Each integration provides: auth setup → data fetch → normalized output → ready for AI analysis.
"""

import hashlib
import hmac
import time
from dataclasses import dataclass, field
from urllib.parse import urlencode, urljoin

import httpx
from openai import AsyncOpenAI

from app.core.config import get_settings


# ═══════════════════════════════════════════
#  WooCommerce REST API
# ═══════════════════════════════════════════

@dataclass
class WooProduct:
    id: int
    name: str
    description: str = ""
    price: str = ""
    currency: str = "USD"
    sku: str = ""
    barcode: str = ""
    brand: str = ""
    images: list[str] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    stock_status: str = "instock"
    permalink: str = ""


class WooCommerceClient:
    """Sync products from WooCommerce stores via REST API."""

    def __init__(self, store_url: str, consumer_key: str, consumer_secret: str):
        self.store_url = store_url.rstrip("/")
        self.key = consumer_key
        self.secret = consumer_secret
        self.base = f"{self.store_url}/wp-json/wc/v3"

    def _auth_params(self) -> str:
        """Generate WooCommerce OAuth 1.0a query string params."""
        params = {
            "oauth_consumer_key": self.key,
            "oauth_nonce": hashlib.sha256(str(time.time()).encode()).hexdigest()[:12],
            "oauth_signature_method": "HMAC-SHA256",
            "oauth_timestamp": str(int(time.time())),
        }
        # WooCommerce uses query-string OAuth 1.0a (one-legged)
        return urlencode(params)

    async def get_products(self, page: int = 1, per_page: int = 50) -> list[WooProduct]:
        """Fetch products from WooCommerce store."""
        params = f"{self._auth_params()}&page={page}&per_page={per_page}"
        url = f"{self.base}/products?{params}"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

        return [self._parse_product(p) for p in data]

    async def get_all_products(self) -> list[WooProduct]:
        """Fetch all products (paginated)."""
        products = []
        page = 1
        while True:
            batch = await self.get_products(page=page)
            if not batch:
                break
            products.extend(batch)
            if len(batch) < 50:
                break
            page += 1
        return products

    def _parse_product(self, p: dict) -> WooProduct:
        images = [img.get("src", "") for img in p.get("images", [])[:5]]

        # Categories
        cats = [c.get("name", "") for c in p.get("categories", [])]

        # Brand (from attributes or Yoast)
        brand = ""
        for attr in p.get("attributes", []):
            if "brand" in attr.get("name", "").lower():
                brand = ", ".join(attr.get("options", []))

        return WooProduct(
            id=p["id"],
            name=p.get("name", ""),
            description=p.get("description", "") or p.get("short_description", ""),
            price=p.get("price", ""),
            sku=p.get("sku", ""),
            barcode=p.get("barcode", ""),
            brand=brand,
            images=images,
            categories=cats,
            stock_status=p.get("stock_status", "instock"),
            permalink=p.get("permalink", ""),
        )


# ═══════════════════════════════════════════
#  YouTube Data API v3
# ═══════════════════════════════════════════

@dataclass
class YouTubeVideo:
    video_id: str
    title: str
    channel: str
    views: int = 0
    likes: int = 0
    comment_count: int = 0
    published_at: str = ""
    url: str = ""


class YouTubeClient:
    """Search product review videos on YouTube."""

    def __init__(self, api_key: str):
        self.key = api_key
        self.base = "https://www.googleapis.com/youtube/v3"

    async def search_reviews(self, query: str, max_results: int = 10) -> list[YouTubeVideo]:
        """Search for product review/tutorial videos."""
        url = (
            f"{self.base}/search?"
            f"part=snippet&q={query}&type=video&maxResults={max_results}"
            f"&relevanceLanguage=en&key={self.key}"
        )
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

        video_ids = [item["id"]["videoId"] for item in data.get("items", [])]
        if not video_ids:
            return []

        # Get stats for these videos
        stats_url = (
            f"{self.base}/videos?"
            f"part=statistics,snippet&id={','.join(video_ids)}&key={self.key}"
        )
        stats_resp = await client.get(stats_url)
        stats_resp.raise_for_status()
        stats_data = stats_resp.json()

        videos = []
        for item in stats_data.get("items", []):
            snip = item.get("snippet", {})
            stats = item.get("statistics", {})
            vid = item["id"]
            videos.append(YouTubeVideo(
                video_id=vid,
                title=snip.get("title", ""),
                channel=snip.get("channelTitle", ""),
                views=int(stats.get("viewCount", 0)),
                likes=int(stats.get("likeCount", 0)),
                comment_count=int(stats.get("commentCount", 0)),
                published_at=snip.get("publishedAt", ""),
                url=f"https://youtube.com/watch?v={vid}",
            ))

        return videos


# ═══════════════════════════════════════════
#  Google Search Console API
# ═══════════════════════════════════════════

@dataclass
class SearchQuery:
    query: str
    clicks: int = 0
    impressions: int = 0
    ctr: float = 0.0
    position: float = 0.0


class SearchConsoleClient:
    """Fetch search query data from Google Search Console.
    Uses OAuth 2.0 access token obtained from Google Cloud Console."""

    def __init__(self, access_token: str, site_url: str):
        self.token = access_token
        self.site_url = site_url.rstrip("/")
        self.base = "https://www.googleapis.com/webmasters/v3"

    async def get_queries(
        self, days: int = 30, limit: int = 50
    ) -> list[SearchQuery]:
        """Get top search queries for a site (last N days)."""
        from datetime import datetime, timedelta, timezone

        end = datetime.now(timezone.utc).date()
        start = end - timedelta(days=days)

        url = f"{self.base}/sites/{self.site_url}/searchAnalytics/query"
        body = {
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "dimensions": ["query"],
            "rowLimit": limit,
        }

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                url,
                json=body,
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        queries = []
        for row in data.get("rows", []):
            queries.append(SearchQuery(
                query=row.get("keys", [""])[0],
                clicks=row.get("clicks", 0),
                impressions=row.get("impressions", 0),
                ctr=row.get("ctr", 0.0),
                position=row.get("position", 0.0),
            ))

        return queries
