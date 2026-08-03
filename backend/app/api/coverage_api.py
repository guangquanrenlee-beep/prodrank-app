"""Knowledge Coverage API — per-product generated-content coverage.

Aggregates content_drafts per product so the merchant sees, in one table:
which products have generated content, how many fields, and a one-click
path into AI Studio to fill the gaps.
"""

from fastapi import APIRouter, HTTPException, Query

from app.services.db import DB

router = APIRouter()


@router.get("/knowledge/coverage")
async def knowledge_coverage(shop: str = Query(...), limit: int = Query(default=200, ge=1, le=1000)):
    """Product-level knowledge coverage for a store."""
    try:
        db = DB()
        # Site → products
        sites = db.client.table("sites").select("id").eq("domain", shop).limit(1).execute().data
        if not sites:
            return {"shop": shop, "total": 0, "products": []}
        products = (db.client.table("products").select("id,title,url,site_id")
                    .eq("site_id", sites[0]["id"]).limit(limit).execute().data or [])

        # Drafts per product (exclude batch templates)
        drafts = (db.client.table("content_drafts").select("shopify_product_id,field,status")
                  .eq("shop", shop).neq("shopify_product_id", "template:%").limit(5000).execute().data or [])
        by_product: dict[str, set] = {}
        for d in drafts:
            pid = str(d.get("shopify_product_id", ""))
            by_product.setdefault(pid, set()).add(d.get("field", ""))

        out = []
        for p in products:
            pid = str(p.get("id", ""))
            fields = sorted(by_product.get(pid, set()))
            out.append({
                "product_id": pid,
                "title": p.get("title", ""),
                "url": p.get("url", ""),
                "generated_fields": fields,
                "field_count": len(fields),
            })
        return {"shop": shop, "total": len(out), "products": out}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:150])
