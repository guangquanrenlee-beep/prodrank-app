"""
Backfill products.category + knowledge_fields for all sites.

For each product without a category: detect via ShopifyAIService.detect_category
(title/product_type/tags/description keywords) and write it back.

Usage: cd backend && python scripts/backfill_categories.py
"""

import asyncio
import sys

sys.path.insert(0, ".")

from dotenv import load_dotenv

load_dotenv()

from app.services.db import DB
from app.services.shopify_ai import ShopifyAIService


async def main():
    db = DB()
    ai = ShopifyAIService()

    # Products without a category
    rows = db.client.table("products").select("id,site_id,title,product_type,tags,description").eq("category", "").limit(2000).execute().data or []
    print(f"Products without category: {len(rows)}")

    updated = {"fashion": 0, "electronics": 0, "beauty": 0, "home": 0, "food": 0,
               "sports": 0, "pet": 0, "jewelry": 0, "baby": 0, "auto": 0, "generic": 0}
    for i, p in enumerate(rows):
        try:
            cat, conf = await ai.detect_category(p)
            if cat == "default":
                cat = "generic"
            db.client.table("products").update({"category": cat}).eq("id", p["id"]).execute()
            updated[cat] = updated.get(cat, 0) + 1
            if (i + 1) % 25 == 0:
                print(f"  {i + 1}/{len(rows)} ...")
        except Exception as e:
            print(f"  fail {p.get('title', '')[:40]}: {str(e)[:80]}")

    print(f"Done: {dict(updated)}")


if __name__ == "__main__":
    asyncio.run(main())
