"""Integration API endpoints — WooCommerce, YouTube, Google Search Console."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.integrations import (
    WooCommerceClient,
    YouTubeClient,
    SearchConsoleClient,
)

router = APIRouter()

# ═══ WooCommerce ═══

class WooConnectRequest(BaseModel):
    store_url: str
    consumer_key: str
    consumer_secret: str


@router.post("/woocommerce/connect")
async def woocommerce_connect(req: WooConnectRequest):
    """Test WooCommerce connection and return product count."""
    try:
        client = WooCommerceClient(req.store_url, req.consumer_key, req.consumer_secret)
        products = await client.get_products(page=1, per_page=5)
        return {
            "status": "connected",
            "store_url": req.store_url,
            "sample_products": [
                {"id": p.id, "name": p.name, "price": p.price, "sku": p.sku}
                for p in products[:5]
            ],
            "total_sample": len(products),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {e}")


@router.post("/woocommerce/sync")
async def woocommerce_sync(req: WooConnectRequest):
    """Sync all products from a WooCommerce store."""
    try:
        client = WooCommerceClient(req.store_url, req.consumer_key, req.consumer_secret)
        products = await client.get_all_products()
        return {
            "status": "synced",
            "total_products": len(products),
            "products": [
                {
                    "name": p.name, "price": p.price, "sku": p.sku,
                    "brand": p.brand, "categories": p.categories,
                    "stock_status": p.stock_status,
                    "has_images": len(p.images) > 0,
                    "has_description": len(p.description) > 50,
                }
                for p in products[:100]  # return first 100 for preview
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Sync failed: {e}")


# ═══ YouTube ═══

class YouTubeSearchRequest(BaseModel):
    query: str
    max_results: int = 10


@router.post("/youtube/search")
async def youtube_search(req: YouTubeSearchRequest):
    """Search YouTube for product reviews and unboxing videos."""
    import os
    api_key = os.getenv("YOUTUBE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="YOUTUBE_API_KEY not configured")

    try:
        client = YouTubeClient(api_key)
        videos = await client.search_reviews(req.query, req.max_results)
        return {
            "query": req.query,
            "total": len(videos),
            "videos": [
                {
                    "title": v.title, "channel": v.channel,
                    "views": v.views, "likes": v.likes,
                    "comments": v.comment_count, "url": v.url,
                }
                for v in videos
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/youtube/influence")
async def youtube_influence(brand: str = Query(...), category: str = Query(...)):
    """Check YouTube presence for a brand in a category. Returns influence score."""
    import os
    api_key = os.getenv("YOUTUBE_API_KEY", "")
    if not api_key:
        return {"status": "not_configured"}

    try:
        client = YouTubeClient(api_key)
        query = f"{brand} {category} review"
        videos = await client.search_reviews(query, 10)

        total_views = sum(v.views for v in videos)
        influence = min(100, total_views // 1000) if total_views > 0 else 0

        return {
            "brand": brand,
            "category": category,
            "youtube_influence_score": influence,
            "total_videos_found": len(videos),
            "total_views": total_views,
            "top_video": {
                "title": videos[0].title,
                "views": videos[0].views,
                "url": videos[0].url,
            } if videos else None,
        }
    except Exception as e:
        return {"status": "error", "detail": str(e)}


# ═══ Google Search Console ═══

class GSCConnectRequest(BaseModel):
    access_token: str
    site_url: str


@router.post("/searchconsole/connect")
async def gsc_connect(req: GSCConnectRequest):
    """Test Search Console connection and return top queries."""
    try:
        client = SearchConsoleClient(req.access_token, req.site_url)
        queries = await client.get_queries(days=30, limit=20)
        return {
            "status": "connected",
            "site_url": req.site_url,
            "total_queries": len(queries),
            "top_queries": [
                {"query": q.query, "clicks": q.clicks, "impressions": q.impressions, "position": round(q.position, 1)}
                for q in queries[:20]
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {e}")


@router.get("/searchconsole/opportunities")
async def gsc_opportunities(
    access_token: str = Query(...),
    site_url: str = Query(...),
    days: int = Query(default=30),
):
    """Find search opportunities — high impression, low position queries.
    These are keywords where the site appears but doesn't rank high.
    Great candidates for AI optimization."""
    try:
        client = SearchConsoleClient(access_token, site_url)
        queries = await client.get_queries(days=days, limit=100)

        # High impression, low position = opportunity
        opportunities = [
            q for q in queries
            if q.impressions > 50 and q.position > 10
        ]
        opportunities.sort(key=lambda q: q.impressions, reverse=True)

        return {
            "site_url": site_url,
            "total_opportunities": len(opportunities),
            "top_opportunities": [
                {"query": q.query, "impressions": q.impressions,
                 "position": round(q.position, 1),
                 "potential_traffic": int(q.impressions * (0.3 if q.position > 10 else 0.1))}
                for q in opportunities[:20]
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
