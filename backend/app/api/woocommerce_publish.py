"""WooCommerce Publish API — SaaS proxy to the WordPress plugin's prodrank/v1 REST endpoints.

Chain (docs/product-content-boundaries.md):
  Dashboard → SaaS generates content (reuses ShopifyAIService + content_drafts)
           → SaaS proxies to the merchant's /wp-json/prodrank/v1/* (token auth)
           → plugin writes _prodrank_* post meta (description overwrite opt-in)
           → shortcodes render, wp_head outputs JSON-LD server-side
           → SaaS verifies via the plugin + a live page crawl

The WordPress plugin holds the source of truth for storage; content_drafts in
Supabase keep the version history + provenance on the SaaS side (⑦ Rollback).
"""

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.services.db import DB
from app.services.shopify_ai import ShopifyAIService, build_schema, CATEGORY_PROMPT_VERSION, MODEL, CATEGORY_RULES
from app.services.knowledge_templates import detect_subcategory, generate_field_list

router = APIRouter()
ai = ShopifyAIService()

DEFAULT_FIELDS = ["description", "faq", "pros", "comparison",
                  "use_cases", "buying_guide", "specification", "ai_summary"]


class WooConnectRequest(BaseModel):
    domain: str
    api_token: str  # the plugin token shown in WooCommerce → ProdRank SEO


class WooResolveUrlRequest(BaseModel):
    url: str  # full product page URL, e.g. https://yourstore.com/product/backpack/


@router.post("/resolve-url")
async def resolve_product_url(req: WooResolveUrlRequest):
    """Resolve a product URL → domain + token + product data.
    Tries: plugin API (if token exists) → page crawl → fallback."""
    url = req.url.strip()
    if not url.startswith("http"):
        url = f"https://{url}"
    from urllib.parse import urlparse
    parsed = urlparse(url)
    domain = parsed.netloc or parsed.path.split("/")[0]
    # Remove www. — keep the port! localhost:8081 must stay intact,
    # and production domains (myshop.com) have no port anyway.
    domain = domain.replace("www.", "").lower()

    # Try to resolve token
    token = ""
    try:
        token = _resolve_token(domain)
    except Exception:
        pass

    product = {"url": url, "title": "", "description": "", "price": "", "sku": "", "brand": "", "images": [], "id": 0}

    # Tier 1: Plugin API (has token, can query accurately)
    if token:
        try:
            # Try to find the product by slug in the URL path
            path_parts = parsed.path.strip("/").split("/")
            slug = path_parts[-1] if path_parts else ""
            # Try common patterns: /product/slug/, /products/slug/, /shop/slug/
            if slug:
                # Plugin doesn't have a by-slug endpoint, so we fetch all and filter
                # But that's slow for large stores. Instead, crawl the page for WP product ID.
                import httpx
                from bs4 import BeautifulSoup
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36"})
                    html = resp.text
                    soup = BeautifulSoup(html, "lxml")
                    # Try to find WooCommerce product ID
                    product_id = None
                    # WooCommerce stores product ID in various places
                    for meta in soup.find_all("meta"):
                        if meta.get("property") == "product:retailer_item_id":
                            product_id = int(meta["content"]) if meta["content"].isdigit() else None
                    # Fallback: try body class for postid
                    if not product_id:
                        body = soup.find("body")
                        if body:
                            classes = body.get("class", [])
                            for c in classes:
                                if c.startswith("postid-"):
                                    try:
                                        product_id = int(c.replace("postid-", ""))
                                    except ValueError:
                                        pass
                            # Another pattern: single-product postid-XXX
                            for c in classes:
                                if c.startswith("page-id-") and "single-product" in classes:
                                    try:
                                        product_id = int(c.replace("page-id-", ""))
                                    except ValueError:
                                        pass

                    # Extract product info from page
                    title = soup.find("title").text.strip() if soup.find("title") else ""
                    # Clean title: remove site name suffix
                    for sep in [" – ", " — ", " | ", " - "]:
                        if sep in title:
                            title = title.split(sep)[0]

                    desc_meta = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
                    description = desc_meta["content"] if desc_meta and desc_meta.get("content") else ""

                    price_meta = soup.find("meta", attrs={"property": "product:price:amount"})
                    price = price_meta["content"] if price_meta and price_meta.get("content") else ""

                    images = []
                    for img in soup.find_all("meta", attrs={"property": "og:image"}):
                        if img.get("content"):
                            images.append(img["content"])

                    product["title"] = title[:200] if title else url.split("/")[-1].replace("-", " ").title()
                    product["description"] = description[:3000]
                    product["price"] = price
                    product["images"] = images[:5]
                    product["id"] = product_id or 0

                    # If we found a product_id, enrich with plugin data
                    if product_id:
                        try:
                            plugin_data = await _plugin_get(domain, f"/products/{product_id}")
                            product["title"] = plugin_data.get("title", product["title"])
                            product["description"] = plugin_data.get("description", product["description"])
                            product["price"] = plugin_data.get("price", product["price"])
                            product["sku"] = plugin_data.get("sku", "")
                            product["brand"] = plugin_data.get("brand", "")
                            product["id"] = product_id
                        except Exception:
                            pass

                    product["found_via"] = "page_crawl"
        except Exception as e:
            product["crawl_error"] = str(e)[:200]

    else:
        # Tier 2: No token — just crawl the page
        try:
            import httpx
            from bs4 import BeautifulSoup
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36"})
                html = resp.text
                soup = BeautifulSoup(html, "lxml")
                title = (soup.find("title") or None) and soup.find("title").text.strip() or url.split("/")[-1].replace("-", " ").title()
                for sep in [" – ", " — ", " | ", " - "]:
                    if sep in title:
                        title = title.split(sep)[0]
                product["title"] = title[:200]
                desc_meta = soup.find("meta", attrs={"name": "description"})
                product["description"] = desc_meta["content"][:3000] if desc_meta and desc_meta.get("content") else ""
                images = [img["content"] for img in soup.find_all("meta", attrs={"property": "og:image"}) if img.get("content")]
                product["images"] = images[:5]
                product["found_via"] = "page_crawl_no_token"
        except Exception as e:
            product["crawl_error"] = str(e)[:200]

    # If no real product_id, use a hash of the URL as a synthetic id
    if not product["id"]:
        product["id"] = abs(hash(url)) % 100000

    return {"status": "ok", "domain": domain, "has_token": bool(token), "product": product}


class WooGenerateRequest(BaseModel):
    domain: str
    product_id: int
    fields: list[str] | None = None  # None = four-layer template decides
    skip_fields: list[str] = []      # fields already on the page (scan) — don't regenerate


class WooPublishRequest(BaseModel):
    domain: str
    product_id: int
    fields: list[str] = DEFAULT_FIELDS
    overwrite_description: bool = False  # opt-in only — touches post_content


class WooVerifyRequest(BaseModel):
    domain: str
    product_id: int
    fields: list[str] | None = None
    check_page: bool = True


class WooSyncRequest(BaseModel):
    domain: str


# ── helpers ──

def _plugin_base(domain: str) -> str:
    """Resolve the plugin REST base URL.
    localhost / 127.x.x.x use http (dev/test),
    everything else uses https (production)."""
    if domain.startswith("localhost") or domain.startswith("127."):
        scheme = "http"
    else:
        scheme = "https"
    return f"{scheme}://{domain}/wp-json/prodrank/v1"


def _resolve_token(domain: str) -> str:
    """Look up the plugin token for a domain from the sites table."""
    data = DB().client.table("sites").select("access_token").eq("domain", domain).eq("platform", "woocommerce").limit(1).execute().data
    if not data or not data[0].get("access_token"):
        raise HTTPException(status_code=401, detail=f"No connection for {domain}. Save the plugin API token first (/api/woocommerce/connect).")
    return data[0]["access_token"]


async def _plugin_headers(domain: str) -> dict:
    return {"X-ProdRank-Token": _resolve_token(domain), "Content-Type": "application/json"}


def _extract_woo_product(p: dict) -> dict:
    """Normalize a plugin product payload into the shared sync shape used by
    ShopifyAIService.generate_fields + build_schema."""
    return {
        "id": str(p.get("id", "")),
        "shopify_id": str(p.get("id", "")),
        "title": p.get("title", ""),
        "description": (p.get("description") or "")[:3000],
        "price": str(p.get("price", "")),
        "currency": p.get("currency", "USD"),
        "sku": p.get("sku", ""),
        "brand": p.get("brand", ""),
        "tags": [],
        "product_type": p.get("type", ""),
        "images": [i for i in (p.get("images") or []) if isinstance(i, str)][:5],
        "url": p.get("url", ""),
        "in_stock": bool(p.get("in_stock", True)),
        "variants": [],
        "aggregate_rating": (
            {"rating_value": p.get("rating", 0), "review_count": p.get("review_count", 0)}
            if p.get("review_count") else None
        ),
    }


# ── Scoring ──
# Two tiers so 1000+ SKU stores stay practical:
#   Quick score  — from the plugin payload only, no page fetch (all rows)
#   Live audit   — real SchemaDetector crawl (stealth tiers), sampled rows
# The Products page shows whichever tier the row got.

def _quick_content_score(p: dict) -> int:
    """Content quality from plugin data alone — a cheap proxy, replaced by
    the real audit score when the row is live-audited."""
    score = 0
    desc = (p.get("description") or "").strip()
    if len(desc) >= 200:
        score += 35
    elif len(desc) >= 100:
        score += 20
    elif desc:
        score += 10
    if p.get("price"):
        score += 15
    if p.get("images"):
        score += 20
    if p.get("review_count") and p.get("rating"):
        score += 10
    if p.get("sku"):
        score += 10
    return min(100, score)


def _quick_ai_score(p: dict) -> int:
    """AI visibility without a crawl: Discover stays 0 (no schema confirmed),
    Understand/Trust carry the payload's real content + review signals."""
    from app.services.ai_score import AIScoringEngine
    desc = (p.get("description") or "").strip()
    s = AIScoringEngine().score_product(
        schema_field_count=0, has_product_schema=False,
        content_quality_score=_quick_content_score(p),
        description_length=len(desc),
        has_aggregate_rating=bool(p.get("review_count")),
        review_count=int(p.get("review_count") or 0),
    )
    return s.overall


def _score_from_audit(audit, p: dict) -> tuple[int, int]:
    """Composite score from a real schema audit (matches the tools' math)."""
    from app.services.ai_score import AIScoringEngine
    s = AIScoringEngine().score_product(
        schema_field_count=audit.field_count,
        max_fields=audit.max_fields,
        has_product_schema=audit.has_product_schema,
        has_faq_schema=audit.has_faq_schema,
        content_quality_score=audit.content_quality_score,
        description_length=len((p.get("description") or "").strip()),
        has_aggregate_rating=bool(p.get("review_count")),
        review_count=int(p.get("review_count") or 0),
    )
    return s.overall, audit.content_quality_score


# httpx does NOT follow redirects by default — merchants often connect via
# www.myshop.com while the site 301s to myshop.com (or vice versa). Follow
# redirects so the www/no-www variant always works.
_HTTP = {"timeout": 25, "follow_redirects": True}

# The plugin's field whitelist (ProdRank_Content::FIELDS) uses 'specification'
# (singular) while the SaaS generation chain stores drafts under
# 'specifications' (plural). Translate at the plugin boundary, or the plugin
# silently skips the field on publish and the spec table never hits the page.
_PLUGIN_FIELD_MAP = {"specifications": "specification"}


def _plugin_field(f: str) -> str:
    return _PLUGIN_FIELD_MAP.get(f, f)


async def _plugin_get(domain: str, path: str, **params):
    async with httpx.AsyncClient(**_HTTP) as client:
        resp = await client.get(f"{_plugin_base(domain)}{path}", headers=await _plugin_headers(domain), params=params)
        resp.raise_for_status()
        return resp.json()


async def _plugin_post(domain: str, path: str, body: dict):
    async with httpx.AsyncClient(**_HTTP) as client:
        resp = await client.post(f"{_plugin_base(domain)}{path}", headers=await _plugin_headers(domain), json=body)
        resp.raise_for_status()
        return resp.json()


def _provenance() -> dict:
    from datetime import datetime, timezone
    return {
        "model": MODEL,
        "prompt_version": CATEGORY_PROMPT_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "human_edited": False,
    }


# ── endpoints ──

def _user_id_from_auth(authorization: str) -> str | None:
    """Resolve the Supabase user id from an Authorization: Bearer <jwt> header.
    None if no/invalid token — the store is then bound to no account (free
    plan) instead of failing, keeping direct-API callers working."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        from app.services.db import DB
        user = DB().client.auth.get_user(token)
        return user.user.id if user and user.user else None
    except Exception:
        return None


@router.post("/connect")
async def connect(req: WooConnectRequest, authorization: str = Header(default="")):
    """Save the plugin API token and verify it works by calling plugin /status.
    Binds the store to the authenticated account (Authorization: Bearer
    Supabase JWT) so plan quotas + store limits apply. Without a token the
    store is stored unbound (free plan)."""
    from app.services.usage import normalize_domain
    domain = normalize_domain(req.domain)
    user_id = _user_id_from_auth(authorization)

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(
                f"{_plugin_base(domain)}/status",
                headers={"X-ProdRank-Token": req.api_token},
            )
            resp.raise_for_status()
            status = resp.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Plugin unreachable or token invalid: {str(e)[:150]}")

    db = DB()
    # Store limits: a genuinely new store (not a re-connect of a store this
    # user already has, compared by normalized domain) counts against the
    # plan's store allowance.
    user_sites = []
    if user_id:
        user_sites = db.client.table("sites").select("id,domain,created_at").eq("user_id", user_id).execute().data
        known = any(normalize_domain(s["domain"]) == domain for s in user_sites)
        if not known:
            from app.services.usage import check_site_limit
            allowed, detail, _current, _limit = check_site_limit(user_id)
            if not allowed:
                raise HTTPException(status_code=403, detail=detail)

    fields = {
        "platform": "woocommerce",
        "platform_confidence": 90,
        "auth_method": "plugin",
        "access_token": req.api_token,
    }
    if user_id:
        fields["user_id"] = user_id
    try:
        if user_id:
            # Idempotent write: reuse the earliest matching row (scheme/www/
            # slash variants included), drop duplicates, remove unbound rows.
            dups = [s for s in user_sites if normalize_domain(s["domain"]) == domain]
            if dups:
                dups.sort(key=lambda s: s["created_at"] or "")
                keep, rest = dups[0]["id"], [s["id"] for s in dups[1:]]
                db.client.table("sites").update(fields).eq("id", keep).execute()
                if rest:
                    db.client.table("sites").delete().in_("id", rest).execute()
            else:
                db.client.table("sites").insert({"domain": domain, **fields}).execute()
            # Remove leftover unbound rows for this domain (NULL user_id)
            db.client.table("sites").delete().eq("domain", domain).is_("user_id", None).execute()
        else:
            existing = db.client.table("sites").select("id").eq("domain", domain).eq("user_id", None).limit(1).execute().data
            if existing:
                db.client.table("sites").update(fields).eq("id", existing[0]["id"]).execute()
            else:
                db.client.table("sites").insert({"domain": domain, **fields}).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save connection: {str(e)[:150]}")

    return {"status": "connected", "domain": domain, "plugin": status, "user_id": user_id or None}


@router.post("/sync")
async def sync(req: WooSyncRequest):
    """② Product Sync (WooCommerce) — pull the product list from the plugin and
    store it in Supabase (paginated until the plugin returns fewer items)."""
    domain = req.domain.strip().lower()
    db = DB()
    sites = db.client.table("sites").select("id").eq("domain", domain).eq("platform", "woocommerce").limit(1).execute().data
    site_id = sites[0]["id"] if sites else ""

    all_products: list[dict] = []
    offset = 0
    limit = 50
    while True:
        batch = await _plugin_get(domain, "/products", limit=limit, offset=offset)
        items = batch.get("products", [])
        if not items:
            break
        all_products.extend(items)
        offset += limit
        if len(items) < limit:
            break

    from datetime import datetime, timezone
    # Two-tier scoring (see helpers above): rows keep their prior real audit
    # data if present; everything else gets a quick score from the payload.
    existing = {r["url"]: r for r in db.client.table("products")
                .select("url,schema_fields,schema_present,content_quality_score,ai_visibility_score")
                .eq("site_id", site_id).execute().data or []}

    rows = []
    for p in all_products:
        row = _extract_woo_product(p)
        prev = existing.get(row.get("url", "")) or {}
        prev_fields = int(prev.get("schema_fields") or 0)
        quick_content = _quick_content_score(p)
        if prev_fields > 0:
            # Prior real audit exists — keep it, don't clobber with a quick score.
            row["schema_fields"] = prev_fields
            row["content_quality_score"] = int(prev.get("content_quality_score") or 0) or quick_content
            row["ai_visibility_score"] = int(prev.get("ai_visibility_score") or 0)
        else:
            row["schema_fields"] = 0
            row["content_quality_score"] = quick_content
            row["ai_visibility_score"] = _quick_ai_score(p)
        rows.append(row)

    db.save_products_batch(site_id, rows)

    # Live audit: real SchemaDetector (3-tier stealth crawl) on a sample.
    # Auditing every SKU doesn't scale to 1000+ product stores — sample
    # evenly across the list so the store view is representative.
    import asyncio
    from app.services.schema_detector import SchemaDetector
    LIVE_AUDIT_MAX = 15
    detector = SchemaDetector()
    url_rows = [r for r in rows if r.get("url")]
    step = max(1, len(url_rows) // LIVE_AUDIT_MAX)
    sample = url_rows[::step][:LIVE_AUDIT_MAX]
    sem = asyncio.Semaphore(4)
    audited = 0

    async def live_audit(row: dict):
        nonlocal audited
        async with sem:
            try:
                return row, await detector.audit_product(row["url"])
            except Exception as e:
                print(f"[sync] live audit failed for {row.get('url')}: {str(e)[:150]}")
                return row, None

    results = await asyncio.gather(*[live_audit(r) for r in sample])
    for row, audit in results:
        if not audit:
            continue
        audited += 1
        ai_score, content_score = _score_from_audit(audit, row)
        try:
            db.client.table("products").update({
                "schema_fields": audit.field_count,
                "schema_present": [f.field for f in audit.schema_fields if f.present],
                "content_quality_score": content_score,
                "ai_visibility_score": ai_score,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("site_id", site_id).eq("url", row["url"]).execute()
        except Exception as e:
            print(f"[sync] audit write failed for {row['url']}: {str(e)[:150]}")

    return {"status": "synced", "domain": domain, "total": len(all_products),
            "quick_scored": len(rows) - audited, "live_audited": audited}


MAX_GENERATIONS = 3

def _is_unlimited(shop: str) -> bool:
    """Owner account bypass — plan 'unlimited' skips per-product caps."""
    from app.services.usage import plan_for_user, _plan_for_shop
    return _plan_for_shop(shop) == "unlimited"


def _layer_of(field: str, knowledge: list[str], decision: list[str], trust: list[str]) -> str:
    if field in knowledge:
        return "knowledge"
    if field in decision:
        return "decision"
    if field in trust:
        return "trust"
    return "knowledge"

@router.post("/publish/generate")
async def generate_content(req: WooGenerateRequest):
    """⑥ Step 1 — AI-generate content fields (draft only, versioned in Supabase).
    Max 3 generations per product. After 3, the merchant must manually edit."""
    try:
        db = DB()
        count = db.count_generations(req.domain, str(req.product_id))
        if not _is_unlimited(req.domain) and count >= MAX_GENERATIONS:
            raise HTTPException(status_code=429, detail=f"Limit reached: {MAX_GENERATIONS} AI generations per product. Please edit your existing draft manually.")

        # Account-level monthly quota (anti-abuse)
        from app.services.usage import check_quota, consume_generation
        allowed, err, used, quota = check_quota(req.domain)
        if not allowed:
            raise HTTPException(status_code=429, detail=err)

        product = await _plugin_get(req.domain, f"/products/{req.product_id}")
        synced = _extract_woo_product(product)

        # Step 1: category + subcategory detection
        category, confidence = await ai.detect_category(synced)
        subcategory = detect_subcategory(synced, category)

        # Step 2: four-layer template drives the field set
        identity_fields, knowledge_fields, decision_fields, trust_fields = generate_field_list(category, subcategory)
        template_fields = knowledge_fields + decision_fields + trust_fields  # identity read from data, not generated
        requested = req.fields if req.fields else template_fields
        filtered_fields = [f for f in requested if f in template_fields and f not in req.skip_fields]

        # Step 3: generate with category context
        generated = await ai.generate_fields(synced, filtered_fields, category=category)
        if "error" in generated:
            raise HTTPException(status_code=500, detail=generated["error"])

        # Missing: requested + template-allowed but NOT generated (data absent — never fabricated)
        missing = [f for f in filtered_fields if f not in generated]
        missing_details = [
            {"field": f, "layer": _layer_of(f, knowledge_fields, decision_fields, trust_fields),
             "reason": "not found in product data — fill manually or skip"}
            for f in missing
        ]

        versions: dict[str, int] = {}
        for field, content in generated.items():
            versions[field] = db.save_content_draft(
                shop=req.domain, shopify_product_id=str(req.product_id), field=field,
                content=content, status="draft", provenance=_provenance(),
            )
        remaining = 9999 if _is_unlimited(req.domain) else MAX_GENERATIONS - db.count_generations(req.domain, str(req.product_id))
        monthly_used = consume_generation(req.domain)
        return {
            "status": "drafted",
            "domain": req.domain,
            "product_id": req.product_id,
            "category": {"key": category, "label": CATEGORY_RULES.get(category, {}).get("label", "General"), "confidence": confidence},
            "subcategory": subcategory,
            "layers": {
                "identity": identity_fields,
                "knowledge": [f for f in knowledge_fields if f in generated],
                "decision": [f for f in decision_fields if f in generated],
                "trust": [f for f in trust_fields if f in generated],
            },
            "generated": list(generated.keys()),
            "skipped": list(set(requested) - set(filtered_fields)),
            "missing": missing_details,
            "versions": versions,
            "preview": generated,
            "generations_used": db.count_generations(req.domain, str(req.product_id)),
            "generations_remaining": max(0, remaining),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/publish")
async def publish(req: WooPublishRequest):
    """⑥ Step 2 — publish latest drafts through the plugin (post meta, versioned).
    Schema is assembled in code; description overwrite is opt-in only."""
    try:
        db = DB()
        drafts = db.get_latest_drafts(req.domain, str(req.product_id), req.fields)
        if not drafts:
            raise HTTPException(status_code=400, detail="No drafts found. Run /publish/generate first.")

        product = await _plugin_get(req.domain, f"/products/{req.product_id}")
        synced = _extract_woo_product(product)
        schema = build_schema(synced, {"name": req.domain, "domain": req.domain})

        fields = {_plugin_field(f): d["content"] for f, d in drafts.items()}
        fields["schema"] = schema  # ⑤ Schema Renderer — code-assembled, never LLM-fabricated

        plugin_resp = await _plugin_post(req.domain, "/publish", {
            "product_id": req.product_id,
            "fields": fields,
            "status": "published",
            "overwrite_description": req.overwrite_description,
            "provenance": _provenance(),
        })
        db.mark_drafts_published([d["id"] for d in drafts.values()])

        verify = await _verify_via_plugin(req.domain, req.product_id, list(fields.keys()))
        return {"status": "published", "domain": req.domain, "plugin": plugin_resp, "verification": verify}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _verify_via_plugin(domain: str, product_id: int, fields: list[str]) -> dict:
    """⑨ — read back AI content through the plugin (post meta is the source of truth)."""
    try:
        product = await _plugin_get(domain, f"/products/{product_id}")
        ai_content = product.get("ai_content", {}) or {}
        per_field = {_plugin_field(f): {"present": bool(ai_content.get(_plugin_field(f)))} for f in fields}
        return {"metafields_ok": all(v["present"] for v in per_field.values()) if per_field else False, "fields": per_field}
    except Exception as e:
        return {"metafields_ok": False, "error": str(e)[:200]}


@router.post("/verify")
async def verify(req: WooVerifyRequest):
    """⑨ Verification — plugin read-back + optional live page crawl for JSON-LD."""
    try:
        result = await _verify_via_plugin(req.domain, req.product_id, req.fields or ["description", "faq", "schema"])

        page_check = {"checked": False, "jsonld_found": False, "html_has_prodrank": False}
        if req.check_page:
            try:
                product = await _plugin_get(req.domain, f"/products/{req.product_id}")
                url = product.get("url", "")
                if url:
                    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
                        resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36"})
                        html = resp.text
                    page_check = {
                        "checked": True,
                        "jsonld_found": html.count("application/ld+json") > 0,
                        "html_has_prodrank": "prodrank" in html.lower(),
                        "schema_blocks": html.count("application/ld+json"),
                    }
            except Exception as e:
                page_check = {"checked": False, "error": str(e)[:200]}

        from datetime import datetime, timezone
        return {
            "status": "verified" if result["metafields_ok"] else "issues_found",
            "metafields": result,
            "page": page_check,
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/drafts")
async def draft_history(domain: str, product_id: int):
    """⑦ Rollback support — version history from Supabase content_drafts."""
    try:
        db = DB()
        fields = db.get_latest_drafts(domain, str(product_id))
        history = {f: db.get_draft_history(domain, str(product_id), f) for f in fields}
        return {"domain": domain, "product_id": product_id, "history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class EditDraftRequest(BaseModel):
    domain: str
    product_id: int
    fields: dict  # { "description": {...}, "faq": {...}, ... }


@router.post("/drafts/edit")
async def save_edited_draft(req: EditDraftRequest):
    """Save manually-edited content as a new draft version.
    Marks provenance.human_edited=true so the audit trail is clear."""
    try:
        db = DB()
        prov = _provenance()
        prov["human_edited"] = True
        prov["note"] = "manually edited by merchant"
        versions: dict[str, int] = {}
        for field, content in req.fields.items():
            if not isinstance(content, dict) or not content:
                continue
            versions[field] = db.save_content_draft(
                shop=req.domain, shopify_product_id=str(req.product_id), field=field,
                content=content, status="draft", provenance=prov,
            )
        return {"status": "saved", "product_id": req.product_id, "versions": versions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/drafts/count")
async def generation_count(domain: str, product_id: int):
    """How many times has this product been generated? (max 3)"""
    try:
        db = DB()
        count = db.count_generations(domain, str(product_id))
        cap = 9999 if _is_unlimited(domain) else MAX_GENERATIONS
        return {"product_id": product_id, "generations_used": count, "generations_remaining": max(0, cap - count)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
