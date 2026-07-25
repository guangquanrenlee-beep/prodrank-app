"""Optimize API — Generate fix-ready JSON-LD Schema from audit or product data."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.core.rate_limit import check_free_limit

from app.services.optimizer import Optimizer
from app.services.schema_detector import SchemaDetector

router = APIRouter()
optimizer = Optimizer()
detector = SchemaDetector()


class OptimizeRequest(BaseModel):
    url: str
    use_ai: bool = True
    brand: str = ""
    price: str = ""
    currency: str = "USD"


class OptimizeFromDataRequest(BaseModel):
    title: str
    description: str = ""
    url: str = ""
    brand: str = ""
    price: str = ""
    sku: str = ""
    barcode: str = ""
    images: list[str] = []
    rating_value: float | None = None
    review_count: int | None = None
    currency: str = "USD"


@router.post("/fixes")
async def generate_fixes(req: OptimizeRequest, request: Request):
    """Generate fix-ready JSON-LD Schema. Free: 3/day."""
    check_free_limit(request)
    # 1. Audit the page to get current data
    audit = await detector.audit_product(req.url)
    title = audit.title or req.url.split("/")[-1]

    # 2. Extract what we can from the audit
    price_from_schema = None
    sku_from_schema = None
    brand_from_schema = req.brand or None
    images = []
    description = ""
    rating = None
    reviews = 0

    for f in audit.schema_fields:
        if f.field == "description" and f.value:
            description = f.value
        if f.field == "price" and f.value:
            price_from_schema = f.value
        if f.field == "sku" and f.value:
            sku_from_schema = f.value
        if f.field == "brand" and f.value:
            brand_from_schema = f.value

    # 3. Generate fixes (with AI enhancement if requested and API key configured)
    try:
        if req.use_ai:
            report = await optimizer.generate_fixes_ai(
                product_url=req.url,
                title=title,
                description=description,
                price=req.price or price_from_schema,
                sku=sku_from_schema,
                brand=brand_from_schema,
                images=images,
                barcode="",
                rating_value=rating,
                review_count=reviews,
                currency=req.currency,
            )
        else:
            report = optimizer.generate_fixes(
                product_url=req.url,
                title=title,
                description=description,
                price=req.price or price_from_schema,
                sku=sku_from_schema,
                brand=brand_from_schema,
                images=images,
                barcode="",
                rating_value=rating,
                review_count=reviews,
                currency=req.currency,
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {e}")

    return {
        "url": report.url,
        "ai_enhanced_description": report.ai_enhanced_description,
        "ai_generated_faq": report.ai_generated_faq,
        "fixes": [
            {
                "schema_type": f.schema_type,
                "priority": f.priority,
                "json_ld": f.json_ld,
                "note": f.note,
            }
            for f in report.fixes
        ],
    }


@router.post("/fixes/from-data")
async def generate_fixes_from_data(req: OptimizeFromDataRequest):
    """Generate Schema fixes from raw product data (no page crawl needed)."""
    report = optimizer.generate_fixes(
        product_url=req.url,
        title=req.title,
        description=req.description,
        price=req.price,
        sku=req.sku,
        brand=req.brand,
        images=req.images,
        barcode=req.barcode,
        rating_value=req.rating_value,
        review_count=req.review_count,
        currency=req.currency,
    )
    return {
        "fixes": [
            {
                "schema_type": f.schema_type,
                "priority": f.priority,
                "json_ld": f.json_ld,
                "note": f.note,
            }
            for f in report.fixes
        ],
    }
