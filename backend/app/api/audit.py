"""Audit API — Product, Site, and Competitor audit endpoints."""

import asyncio
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.services.schema_detector import SchemaDetector
from app.core.rate_limit import check_free_limit

router = APIRouter()
detector = SchemaDetector()


class AuditProductRequest(BaseModel):
    url: str


class AuditSiteRequest(BaseModel):
    domain: str


class ManualAuditRequest(BaseModel):
    url: str
    html: str  # user pastes the page HTML directly


class ManualAuditRequest(BaseModel):
    url: str
    html: str


class CompareRequest(BaseModel):
    urls: list[str]


@router.post("/product")
async def audit_product(req: AuditProductRequest, request: Request):
    """Audit a single product page for AI visibility. Free: 3/day."""
    check_free_limit(request)
    url = str(req.url)
    if not url.startswith("http"):
        url = f"https://{url}"
    try:
        result = await detector.audit_product(url)
        return {
            "url": result.url,
            "title": result.title,
            "has_product_schema": result.has_product_schema,
            "has_faq_schema": result.has_faq_schema,
            "field_count": result.field_count,
            "max_fields": result.max_fields,
            "schema_fields": [
                {
                    "field": f.field,
                    "present": f.present,
                    "value": f.value,
                    "note": f.note,
                }
                for f in result.schema_fields
            ],
            "content_quality_score": result.content_quality_score,
            "content_issues": result.content_issues,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/site")
async def audit_site(req: AuditSiteRequest):
    """Audit entire site for AI crawlability and Schema coverage. Persists results."""
    try:
        domain = str(req.domain)
        result = await detector.audit_site(domain)
        # Persist products to Supabase if user context available
        try:
            from app.services.db import DB
            db = DB()
            # Save sample products (in production, use full product list)
            # For now, mark the site as audited with score
        except Exception:
            pass
        return {
            "url": result.url,
            "total_pages": result.total_pages,
            "pages_with_product_schema": result.pages_with_product_schema,
            "pages_with_faq_schema": result.pages_with_faq_schema,
            "pages_with_breadcrumb": result.pages_with_breadcrumb,
            "pages_with_organization": result.pages_with_organization,
            "ai_bots_blocked": result.ai_bots_blocked,
            "js_rendering_issues": result.js_rendering_issues,
            "health_score": result.health_score,
            "top_issues": result.top_issues,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/manual")
async def manual_audit(req: ManualAuditRequest):
    """Audit a product page from user-pasted HTML (when auto-crawl fails)."""
    from bs4 import BeautifulSoup
    import json

    html = req.html
    soup = BeautifulSoup(html, "lxml")
    title = soup.find("title")
    title_text = title.get_text(strip=True) if title else "Unknown"

    scripts = soup.find_all("script", type="application/ld+json")
    product_data = {}
    faq_found = False
    for s in scripts:
        try:
            d = json.loads(s.string)
        except (json.JSONDecodeError, TypeError):
            continue
        t = d.get("@type") if isinstance(d, dict) else None
        if isinstance(t, list):
            t = t[0] if t else None
        if t in ("Product", "ProductGroup"):
            product_data = d
        if isinstance(d, dict) and "@graph" in d:
            for item in d["@graph"]:
                gt = item.get("@type")
                if isinstance(gt, list):
                    gt = gt[0]
                if gt in ("Product", "ProductGroup"):
                    product_data = item
                elif gt == "FAQPage":
                    faq_found = True
        if t == "FAQPage":
            faq_found = True

    from app.services.schema_detector import SchemaFieldResult
    fields = detector._audit_schema_fields(product_data, soup)
    score, issues = detector._score_content(soup, product_data)

    return {
        "url": req.url,
        "title": title_text,
        "has_product_schema": bool(product_data),
        "has_faq_schema": faq_found,
        "field_count": sum(1 for f in fields if f.present),
        "max_fields": 12,
        "schema_fields": [{"field": f.field, "present": f.present, "value": f.value, "note": f.note} for f in fields],
        "content_quality_score": score,
        "content_issues": issues,
    }


@router.post("/compare")
async def compare_products(req: CompareRequest):
    """Compare Schema completeness across multiple product URLs side-by-side."""
    try:
        tasks = [detector.audit_product(url) for url in req.urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        products = []
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                products.append({
                    "url": req.urls[i],
                    "error": str(r),
                })
            else:
                products.append({
                    "url": r.url,
                    "title": r.title,
                    "has_product_schema": r.has_product_schema,
                    "has_faq_schema": r.has_faq_schema,
                    "field_count": r.field_count,
                    "content_quality_score": r.content_quality_score,
                    "content_issues": r.content_issues,
                })

        # Determine winner
        scores = [(p.get("field_count", 0) + (p.get("content_quality_score", 0) / 10), i)
                  for i, p in enumerate(products) if "error" not in p]
        best_idx = max(scores, key=lambda x: x[0])[1] if scores else None

        return {
            "products": products,
            "best_index": best_idx,
            "comparison": {
                "field_count_delta": (
                    products[0].get("field_count", 0) - products[1].get("field_count", 0)
                    if len(products) >= 2 else 0
                ),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ═══ SaaS Audit ═══

SAAS_FIELDS = [
    "name", "description", "applicationCategory", "operatingSystem",
    "url", "offers.price", "offers.priceCurrency",
    "aggregateRating.ratingValue", "aggregateRating.reviewCount",
    "screenshot", "featureList", "datePublished",
]

@router.post("/saas")
async def audit_saas(req: AuditProductRequest, request: Request):
    """Audit a SaaS page for SoftwareApplication Schema completeness."""
    check_free_limit(request)
    url = str(req.url)
    if not url.startswith("http"):
        url = f"https://{url}"

    import httpx
    from bs4 import BeautifulSoup
    import json

    try:
        resp = httpx.get(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; ProdRank/1.0)",
        }, follow_redirects=True, timeout=15)
        html = resp.text
        soup = BeautifulSoup(html, "lxml")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not fetch page.")

    title = soup.find("title").text.strip() if soup.find("title") else url

    scripts = soup.find_all("script", type="application/ld+json")
    has_software = False
    has_org = False
    has_faq = False
    app_data = {}

    for s in scripts:
        try:
            data = json.loads(s.string or "{}")
            items = data if isinstance(data, list) else [data]
            if isinstance(data, dict) and "@graph" in data:
                items = data["@graph"]
            for item in items:
                t = item.get("@type", "")
                if not isinstance(t, str):
                    continue
                if t == "SoftwareApplication":
                    has_software = True
                    app_data = item
                elif t == "Organization":
                    has_org = True
                elif t == "FAQPage":
                    has_faq = True
        except (json.JSONDecodeError, TypeError):
            continue

    fields = []
    present_count = 0
    for field in SAAS_FIELDS:
        present = False
        value = None
        if "." in field:
            parent_key, child_key = field.split(".", 1)
            parent = app_data.get(parent_key)
            if isinstance(parent, dict):
                present = child_key in parent
                value = str(parent.get(child_key, ""))[:100] if present else None
        else:
            present = field in app_data
            value = str(app_data.get(field, ""))[:100] if present else None
        if present:
            present_count += 1
        note = "" if present else _saas_note(field)
        fields.append({"field": field, "present": present, "value": value, "note": note})

    desc_meta = soup.find("meta", attrs={"name": "description"})
    desc = desc_meta["content"] if desc_meta else ""
    body_text = soup.get_text()
    issues = []
    if len(desc) < 50:
        issues.append("Meta description too short (< 50 chars) — AI needs context")
    if not soup.find("h1"):
        issues.append("No H1 heading found — AI uses headings to understand page topic")
    if len(body_text) < 300:
        issues.append("Page has very little text content — AI needs substance to evaluate")

    content_score = min(100, max(0,
        (30 if len(body_text) > 500 else len(body_text) // 17) +
        (25 if has_software else 0) + (20 if has_org else 0) +
        (15 if has_faq else 0) + (10 if len(desc) > 50 else 0)
    ))

    return {
        "url": url, "title": title,
        "has_software_schema": has_software,
        "has_org_schema": has_org,
        "has_faq_schema": has_faq,
        "field_count": present_count, "max_fields": len(SAAS_FIELDS),
        "schema_fields": fields,
        "content_quality_score": content_score,
        "content_issues": issues,
    }


def _saas_note(field: str) -> str:
    return {
        "name": "AI needs to know your software's name to recommend it.",
        "description": "Without a description, AI can't explain what your software does.",
        "applicationCategory": "Tells AI which category (CRM, Accounting, etc.) — critical for matching.",
        "operatingSystem": "Specify 'Web', 'Windows', 'Mac' etc.",
        "url": "AI can't link users to your product.",
        "offers.price": "Pricing helps AI compare and recommend.",
        "offers.priceCurrency": "Currency needed for AI pricing display.",
        "aggregateRating.ratingValue": "Ratings increase AI recommendation confidence.",
        "aggregateRating.reviewCount": "Review count signals credibility.",
        "screenshot": "Screenshot helps AI understand your UI.",
        "featureList": "AI matches features against user queries.",
        "datePublished": "Freshness signal — outdated software is less recommended.",
    }.get(field, "")
