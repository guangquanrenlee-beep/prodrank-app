"""
Action Engine API — close the loop: Insight Engine finds the gap,
Action Engine generates + publishes the fix, then re-test.

POST /api/action/apply   — generate & publish content for insight gaps
POST /api/action/retest  — re-run the recommendation test (before/after)
"""

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.services.db import DB
from app.services.shopify_ai import ShopifyAIService

router = APIRouter()
db = DB()
ai = ShopifyAIService()

# Insight factor → content fields to generate (schema/reviews/citations are
# external behaviors and are excluded with a message instead)
FACTOR_FIELDS = {
    "faq": ["faq"],
    "knowledge": ["specification", "use_cases", "buying_guide"],
    "schema": [],  # handled via structured data, not body content
}

FACTOR_SKIP_MSG = {
    "schema": "Schema injection needs store-side support (plugin/theme) — content-level fixes auto-applied.",
    "reviews": "Reviews are earned externally — no auto-fix possible.",
    "citations": "Citations come from third-party coverage — no auto-fix possible.",
    "recency": "Refresh content manually when needed.",
}


class ApplyFixesRequest(BaseModel):
    site_id: str
    domain: str = ""
    factors: list[str]  # e.g. ["faq", "knowledge"]


def _require_login(request: Request) -> str | None:
    """Resolve the current user from Authorization or X-User-Email (best effort)."""
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        try:
            u = db.client.auth.get_user(auth.split(" ", 1)[1].strip())
            return u.user.id if u and u.user else None
        except Exception:
            pass
    email = request.headers.get("X-User-Email", "")
    if email:
        try:
            users = db.client.auth.admin.list_users()
            for u in (users.users if hasattr(users, "users") else users):
                if (u.email or "").lower() == email.lower():
                    return u.id
        except Exception:
            pass
    return None


def _check_owner(site: dict, user_id: str | None):
    if not user_id:
        raise HTTPException(401, "Login required")
    if site.get("user_id") and site["user_id"] != user_id:
        raise HTTPException(403, "This store belongs to another account")


@router.post("/apply")
async def apply_fixes(req: ApplyFixesRequest, request: Request):
    """Generate + publish content for the gaps the Insight Engine found.

    Factors map to content fields: faq → FAQ, knowledge → specification /
    use_cases / buying_guide. Each product in the store gets the missing
    fields generated and pushed to the store's API.
    """
    user_id = _require_login(request)

    # Resolve the site
    site = db.client.table("sites").select("id,user_id,domain,platform,access_token,shopify_shop").eq("id", req.site_id).limit(1).execute().data
    if not site:
        raise HTTPException(404, "Site not found")
    site = site[0]
    _check_owner(site, user_id)

    # Which fields to generate
    fields = []
    skipped: dict[str, str] = {}
    for f in req.factors:
        fs = FACTOR_FIELDS.get(f)
        if fs is None:
            skipped[f] = "Unknown factor"
        elif not fs:
            skipped[f] = FACTOR_SKIP_MSG.get(f, "No auto-fix available")
        else:
            fields += fs
    fields = list(dict.fromkeys(fields))  # dedupe, keep order
    if not fields:
        return {"applied": [], "skipped": skipped, "message": "No content-level fixes requested"}

    # Products for this site
    products = db.client.table("products").select("*").eq("site_id", site["id"]).limit(100).execute().data or []
    if not products:
        return {"applied": [], "skipped": skipped, "message": "No products synced for this store"}

    platform = site.get("platform", "")
    results = []
    for p in products:
        try:
            gen = await ai.generate_fields(product=p, fields=fields)
            if not gen:
                results.append({"product": p.get("title"), "status": "skipped", "reason": "no fields generated"})
                continue

            # Push to the store
            if platform == "custom":
                pushed = await _push_custom(site, p, gen)
            elif platform in ("woocommerce", "wordpress"):
                pushed = await _push_woo(site, p, gen)
            else:
                pushed = {"status": "skipped", "reason": f"unsupported platform {platform}"}

            results.append({"product": p.get("title"), "status": pushed.get("status", "?"), "fields": list(gen.keys()), **pushed})
        except Exception as e:
            results.append({"product": p.get("title"), "status": "error", "reason": str(e)[:150]})

    return {
        "applied": sum(1 for r in results if r.get("status") == "published"),
        "failed": sum(1 for r in results if r.get("status") == "error"),
        "skipped": skipped,
        "results": results,
    }


async def _push_custom(site: dict, product: dict, content: dict) -> dict:
    """Push generated content to a custom API store (BaiHuoZhan protocol)."""
    base_url = site.get("shopify_shop", f"http://{site['domain']}")
    token = site.get("access_token", "")
    pid = product.get("shopify_id") or product.get("url", "").rstrip("/").split("/")[-1] or product.get("title")
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.put(
                f"{base_url}/api/prodrank/products/{pid}/content",
                headers={"X-API-Token": token, "Content-Type": "application/json"},
                json=content,
            )
            if resp.status_code == 200:
                return {"status": "published"}
            return {"status": "failed", "reason": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"status": "failed", "reason": str(e)[:100]}


async def _push_woo(site: dict, product: dict, content: dict) -> dict:
    """Push generated content to a WooCommerce store (plugin API)."""
    # Reuse the WooCommerce publish flow via the plugin's content endpoint
    from app.services.db import DB as _DB
    plugin_url = f"http://{site['domain']}/wp-json/prodrank/v1"
    token = site.get("access_token", "")
    pid = product.get("shopify_id") or product.get("url", "").rstrip("/").split("/")[-1]
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.post(
                f"{plugin_url}/content",
                headers={"X-ProdRank-Token": token, "Content-Type": "application/json"},
                json={"product_id": pid, "content": content},
            )
            if resp.status_code == 200:
                return {"status": "published"}
            return {"status": "failed", "reason": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"status": "failed", "reason": str(e)[:100]}


class RetestRequest(BaseModel):
    site_id: str
    domain: str = ""
    brand_name: str = ""
    query_count: int = 50


@router.post("/retest")
async def retest(req: RetestRequest, request: Request):
    """Re-run the recommendation test after fixes and compare with the
    previous round (before/after)."""
    user_id = _require_login(request)
    site = db.client.table("sites").select("id,user_id,domain").eq("id", req.site_id).limit(1).execute().data
    if not site:
        raise HTTPException(404, "Site not found")
    _check_owner(site[0], user_id)

    from app.services.ai_test_engine import AITestEngine
    engine = AITestEngine()
    before = await engine.get_recommendation_rate(req.site_id)
    before_rate = before.get("recommendation_rate", 0)

    run = await engine.run_test(
        site_id=req.site_id,
        brand_name=req.brand_name or req.domain.split(".")[0] or "Store",
        category="",
        query_count=min(req.query_count, 200),
    )
    after_rate = run.recommendation_rate
    return {
        "before_rate": before_rate,
        "after_rate": after_rate,
        "delta": round(after_rate - before_rate, 1),
        "tested_queries": run.total_queries,
    }
