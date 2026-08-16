"""
Product Schema Detection Engine — Phase 1 Core
Audits 12 key Schema.org Product fields, FAQPage, AI bot accessibility.
"""

import asyncio
import json
import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup


# ── 12 critical Product Schema fields ──
REQUIRED_FIELDS = ["name", "description", "image"]
RECOMMENDED_FIELDS = [
    "offers", "brand", "aggregateRating", "review",
    "sku", "gtin", "itemCondition", "availability", "shippingDetails",
]
ALL_FIELDS = REQUIRED_FIELDS + RECOMMENDED_FIELDS

# AI bot user-agent tokens to check in robots.txt
AI_BOTS = {
    "GPTBot": "OpenAI/ChatGPT",
    "Claude-Web": "Anthropic/Claude",
    "Google-Extended": "Google/Gemini",
    "PerplexityBot": "Perplexity",
}


@dataclass
class SchemaFieldResult:
    field: str
    present: bool
    value: str | None = None
    note: str = ""


@dataclass
class SiteAuditResult:
    url: str
    total_pages: int = 0
    pages_with_product_schema: int = 0
    pages_with_faq_schema: int = 0
    pages_with_breadcrumb: int = 0
    pages_with_organization: int = 0
    ai_bots_blocked: dict[str, bool] = field(default_factory=dict)
    js_rendering_issues: int = 0
    health_score: int = 0
    top_issues: list[str] = field(default_factory=list)
    sampled_products: list[dict] = field(default_factory=list)
    sampled_pages: int = 0  # how many pages the score counters were computed over


@dataclass
class ProductAuditResult:
    url: str
    title: str = ""
    has_product_schema: bool = False
    has_faq_schema: bool = False
    schema_fields: list[SchemaFieldResult] = field(default_factory=list)
    field_count: int = 0
    max_fields: int = 12
    content_quality_score: int = 0
    content_issues: list[str] = field(default_factory=list)
    ai_understanding_diff: dict[str, str] = field(default_factory=dict)


class SchemaDetector:
    """Detect and audit Schema.org structured data on product pages."""

    def __init__(self, client: httpx.AsyncClient | None = None):
        self._client = client

    async def _fetch(self, url: str) -> str:
        """Fetch a page. Uses sync httpx via thread (more reliable on Windows).

        Tier 1: httpx (fast, works for ~70% of sites)
        Tier 2: CloakBrowser (stealth Chromium, bypasses Cloudflare)
        """
        import asyncio

        try:
            html = await asyncio.to_thread(self._fetch_sync, url)
            if "Just a moment" in html[:500] or "cf-challenge" in html[:1000]:
                return await self._fetch_stealth(url)
            return html
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (403, 401):
                return await self._fetch_stealth(url)
            raise

    @staticmethod
    def _fetch_sync(url: str) -> str:
        """Sync httpx fetch — runs in thread pool."""
        headers = SchemaDetector._browser_headers()
        r = httpx.get(
            url,
            headers={
                "User-Agent": headers["User-Agent"],
                "Accept": headers["Accept"],
                "Accept-Language": headers["Accept-Language"],
            },
            follow_redirects=True,
            timeout=30,
        )
        r.raise_for_status()
        return r.text

    async def _fetch_stealth(self, url: str) -> str:
        """Tier 2: CloakBrowser in a dedicated thread (bypasses Cloudflare)."""
        import asyncio
        from concurrent.futures import ThreadPoolExecutor

        loop = asyncio.get_running_loop()
        with ThreadPoolExecutor(max_workers=1) as pool:
            try:
                html = await asyncio.wait_for(
                    loop.run_in_executor(pool, self._cloakbrowser_fetch, url),
                    timeout=90,
                )
                if html and len(html) > 500:
                    return html
            except asyncio.TimeoutError:
                pass

        # Fallback: Camoufox
        try:
            return await self._fetch_camoufox(url)
        except Exception:
            pass

        raise RuntimeError(f"Stealth fetch failed for {url}")

    @staticmethod
    def _cloakbrowser_fetch(url: str) -> str:
        """Sync fetch via CloakBrowser — called from dedicated thread."""
        import time
        from cloakbrowser import launch

        browser = launch(headless=True)
        try:
            page = browser.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=90000)
            time.sleep(5)
            return page.content()
        finally:
            browser.close()

    async def _fetch_camoufox(self, url: str) -> str:
        """Fallback: Camoufox — patched Firefox with fingerprint spoofing."""
        try:
            from camoufox import Camoufox

            with Camoufox(headless=True) as browser:
                page = browser.new_page()
                page.goto(url, wait_until="networkidle", timeout=45000)
                return page.content()
        except ImportError:
            raise RuntimeError(
                "All fetch strategies failed. Install CloakBrowser (pip install cloakbrowser) "
                "or Camoufox (pip install camoufox && python -m camoufox fetch) "
                "to bypass Cloudflare on protected Shopify stores."
            )

    @staticmethod
    def _browser_headers() -> dict:
        """Generate a randomized browser-like User-Agent."""
        import random
        chrome_versions = ["131.0.0.0", "130.0.0.0", "129.0.0.0"]
        ua = (
            f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            f"AppleWebKit/537.36 (KHTML, like Gecko) "
            f"Chrome/{random.choice(chrome_versions)} Safari/537.36"
        )
        return {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Language": "en-US,en;q=0.9",
        }

    # ── Product-level audit ──

    async def audit_product(self, url: str) -> ProductAuditResult:
        """Full product page audit: Schema + content quality.
        Tries httpx → CloakBrowser → returns actionable fallback if all fail."""
        result = ProductAuditResult(url=url)

        # Tier 1: fast httpx
        try:
            html = await self._fetch(url)
        except Exception:
            # Tier 2: stealth browser
            try:
                html = await self._fetch_stealth(url)
            except Exception as e:
                # All strategies exhausted — give user actionable advice
                domain = urlparse(url).netloc
                result.content_issues = [
                    f"Unable to crawl this page — the site has advanced bot protection.",
                    f"",
                    f"Options to proceed:",
                    f"1. If this is a Shopify store, install the ProdRank App from Shopify App Store.",
                    f"   (WooCommerce stores: install the ProdRank WordPress plugin — it injects Schema",
                    f"   server-side, so AI agents see it even without crawling.)",
                    f"",
                    f"2. Paste the product page HTML directly for manual audit.",
                ]
                result.content_quality_score = 0
                return result

        soup = BeautifulSoup(html, "lxml")
        result = ProductAuditResult(url=url)
        result.title = self._extract_title(soup)

        # 1. Schema.org JSON-LD inspection
        json_ld_scripts = soup.find_all("script", type="application/ld+json")
        product_candidates: list[dict] = []
        faq_found = False

        for script in json_ld_scripts:
            try:
                data = json.loads(script.string)
            except (json.JSONDecodeError, TypeError):
                continue

            # Handle @graph
            t = data.get("@type") if isinstance(data, dict) else None
            if isinstance(t, list):
                t = t[0] if t else None

            # Product/ProductGroup are equivalent for Schema auditing
            if t in ("Product", "ProductGroup"):
                product_candidates.append(data)
            elif isinstance(data, dict) and "@graph" in data:
                for item in data["@graph"]:
                    gt = item.get("@type")
                    if isinstance(gt, list):
                        gt = gt[0] if gt else None
                    if gt in ("Product", "ProductGroup"):
                        product_candidates.append(item)
                    elif gt == "FAQPage":
                        faq_found = True

            if t == "FAQPage":
                faq_found = True

        # Multiple Product blocks can coexist (plugin-injected + theme/SEO
        # plugin @graph). Taking the last one loses richer data — e.g. the
        # theme copy often drops brand or nests price differently, which
        # showed up as "no price" / "no brand" on real stores. Keep the
        # candidate with the most complete schema fields instead.
        AUDIT_FIELDS = ("name", "description", "image", "offers", "brand",
                        "aggregateRating", "review", "sku", "gtin",
                        "itemCondition", "availability", "shippingDetails")
        product_data = max(
            product_candidates,
            key=lambda d: sum(1 for f in AUDIT_FIELDS if d.get(f) is not None),
            default={},
        )

        result.has_product_schema = bool(product_data)
        result.has_faq_schema = faq_found

        # Audit each field
        result.schema_fields = self._audit_schema_fields(product_data, soup)
        result.field_count = sum(1 for f in result.schema_fields if f.present)

        # 2. Content quality (includes schema completeness in score)
        result.content_quality_score, result.content_issues = (
            self._score_content(soup, product_data, result.field_count)
        )

        return result

    def _extract_title(self, soup: BeautifulSoup) -> str:
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            return og_title["content"]
        title_tag = soup.find("title")
        return title_tag.get_text(strip=True) if title_tag else "Unknown"

    def _audit_schema_fields(
        self, product_data: dict, soup: BeautifulSoup
    ) -> list[SchemaFieldResult]:
        results = []

        # name
        has = "name" in product_data
        results.append(SchemaFieldResult(
            field="name", present=has,
            value=product_data.get("name", "")[:100] if has else None,
            note="" if has else "Add '\"name\": \"Product Name\"' to your Product JSON-LD"
        ))

        # description
        has = "description" in product_data
        desc = product_data.get("description", "")
        note = ""
        if has and len(desc) < 100:
            note = "Description too short — expand to 200+ chars in your 'description' field"
        elif not has:
            note = "Add '\"description\": \"...\"' with 200+ chars to your Product JSON-LD"
            # Try meta description fallback
            meta_desc = soup.find("meta", attrs={"name": "description"})
            if meta_desc and meta_desc.get("content"):
                note += " (meta description exists but not in Schema)"
        results.append(SchemaFieldResult(
            field="description", present=has,
            value=desc[:150] if has else None,
            note=note
        ))

        # image
        has = "image" in product_data
        imgs = product_data.get("image", [])
        if isinstance(imgs, str):
            imgs = [imgs]
        alt_ok = all(
            bool(img.find("alt")) if hasattr(img, "find") else True
            for img in soup.find_all("img", src=True)[:5]
        )
        note = "" if has else "Add '\"image\": [\"https://...\"]' with product image URLs to your JSON-LD"
        if has and not alt_ok:
            note = "Images present but may lack alt text"
        results.append(SchemaFieldResult(
            field="image", present=has,
            value=f"{len(imgs)} image(s)" if has else None,
            note=note
        ))

        # offers — handle Product, ProductGroup (hasVariant), and list
        offers = product_data.get("offers", {})
        if isinstance(offers, list):
            offers = offers[0] if offers else {}
        # ProductGroup may nest offers inside hasVariant
        if not offers and "hasVariant" in product_data:
            variants = product_data["hasVariant"]
            if isinstance(variants, list) and variants:
                offers = variants[0].get("offers", {})
                if isinstance(offers, list):
                    offers = offers[0] if offers else {}
        has_offer = bool(offers)
        has_price = has_offer and "price" in offers
        # Google/theme format nests the price inside priceSpecification
        # (UnitPriceSpecification) instead of offers.price — parse that too
        # (seen on WooCommerce @graph output, was misread as "no price").
        if has_offer and not has_price:
            ps = offers.get("priceSpecification")
            if isinstance(ps, list):
                ps = ps[0] if ps else {}
            if isinstance(ps, dict) and ps.get("price"):
                offers = dict(offers, price=ps["price"],
                              priceCurrency=ps.get("priceCurrency", offers.get("priceCurrency", "USD")))
                has_price = True
        note = ""
        if has_price:
            note = f"${offers.get('price')} {offers.get('priceCurrency', '')}"
        elif has_offer:
            note = "Offer present but no price — add '\"price\": \"29.99\"' inside offers"
        else:
            note = "Add '\"offers\": {\"@type\": \"Offer\", \"price\": \"29.99\", \"priceCurrency\": \"USD\"}' to JSON-LD"
        results.append(SchemaFieldResult(
            field="offers", present=has_price, value=note, note=""
        ))

        # brand
        brand = product_data.get("brand", {})
        if isinstance(brand, dict):
            has_brand = "name" in brand
            val = brand.get("name", "")
        elif isinstance(brand, str):
            has_brand = bool(brand)
            val = brand
        else:
            has_brand = False
            val = None
        results.append(SchemaFieldResult(
            field="brand", present=has_brand, value=val,
            note="" if has_brand else "Add '\"brand\": {\"@type\": \"Brand\", \"name\": \"Your Brand\"}' to JSON-LD"
        ))

        # aggregateRating
        agg = product_data.get("aggregateRating", {})
        has_agg = bool(agg) and "ratingValue" in agg
        results.append(SchemaFieldResult(
            field="aggregateRating", present=has_agg,
            value=f"{agg.get('ratingValue')}/5 ({agg.get('reviewCount', '?')} reviews)" if has_agg else None,
            note="" if has_agg else "Add '\"aggregateRating\": {\"ratingValue\": \"4.5\", \"reviewCount\": \"100\"}' to JSON-LD (boosts AI trust)"
        ))

        # review
        reviews = product_data.get("review", [])
        if isinstance(reviews, dict):
            reviews = [reviews]
        has_review = bool(reviews)
        results.append(SchemaFieldResult(
            field="review", present=has_review,
            value=f"{len(reviews)} structured review(s)" if has_review else None,
            note="" if has_review else "Add '\"review\": [{\"@type\": \"Review\", \"reviewBody\": \"...\", \"author\": {...}}]' to JSON-LD"
        ))

        # sku
        has = "sku" in product_data
        results.append(SchemaFieldResult(
            field="sku", present=has,
            value=product_data.get("sku", "") if has else None,
            note="" if has else "Add '\"sku\": \"SKU-12345\"' so AI can identify your exact product variant"
        ))

        # gtin (UPC/EAN)
        has = "gtin" in product_data or "gtin13" in product_data or "gtin12" in product_data
        gtin = product_data.get("gtin") or product_data.get("gtin13") or product_data.get("gtin12", "")
        results.append(SchemaFieldResult(
            field="gtin", present=has,
            value=gtin if has else None,
            note="" if has else "Add '\"gtin\": \"0123456789012\"' (UPC/EAN) so AI can cross-reference your product"
        ))

        # itemCondition
        has = "itemCondition" in product_data
        results.append(SchemaFieldResult(
            field="itemCondition", present=has,
            value=product_data.get("itemCondition", "") if has else None,
            note="" if has else "Add '\"itemCondition\": \"https://schema.org/NewCondition\"' to your JSON-LD"
        ))

        # availability
        has = "availability" in product_data or (has_offer and "availability" in offers)
        val = product_data.get("availability", "") or offers.get("availability", "")
        results.append(SchemaFieldResult(
            field="availability", present=bool(val),
            value=val if val else None,
            note="" if val else "Add '\"availability\": \"https://schema.org/InStock\"' so AI shows stock status"
        ))

        # shippingDetails
        has = "shippingDetails" in product_data or (has_offer and "shippingDetails" in offers)
        results.append(SchemaFieldResult(
            field="shippingDetails", present=has,
            value=None,
            note="" if has else "Add '\"shippingDetails\": {\"shippingRate\": {\"shippingDestination\": {...}}}' to JSON-LD"
        ))

        return results

    def _score_content(
        self, soup: BeautifulSoup, product_data: dict, schema_field_count: int = 0
    ) -> tuple[int, list[str]]:
        # Schema completeness: 40% of total score
        schema_score = min(40, schema_field_count * 40 // 12)
        # Content quality: 60% of total score
        content_score = 30  # baseline

        issues = []

        # Description in Schema
        desc = product_data.get("description", "")
        if len(desc) >= 200:
            content_score += 10
        elif len(desc) >= 100:
            content_score += 5
        else:
            issues.append("Product description too short (<100 chars in Schema) — add a detailed 200+ char description to your JSON-LD")

        # Meta description
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            if len(meta_desc["content"]) >= 120:
                content_score += 5
        else:
            issues.append("Missing meta description — add <meta name='description' content='...'> to your <head>")

        # H1
        h1 = soup.find("h1")
        if h1:
            content_score += 5
        else:
            issues.append("Missing H1 tag — add a clear product title as <h1>")

        # Image alt text
        imgs = soup.find_all("img", src=True)
        imgs_with_alt = sum(1 for img in imgs if img.get("alt"))
        if imgs:
            alt_ratio = imgs_with_alt / len(imgs)
            if alt_ratio > 0.8:
                content_score += 5
            elif alt_ratio > 0.5:
                content_score += 3
            else:
                issues.append(f"Only {imgs_with_alt}/{len(imgs)} images have alt text — add alt='...' to product images")
        else:
            issues.append("No images found on page")

        # FAQ presence
        faq_elements = soup.find_all(class_=re.compile(r'faq|question|accordion', re.I))
        if faq_elements:
            content_score += 5
        else:
            issues.append("No FAQ section — add FAQPage JSON-LD schema to boost AI recommendation rates ~40%")

        # Word count
        text = soup.get_text(separator=" ", strip=True)
        words = len(text.split())
        if words > 500:
            content_score += 5
        elif words < 200:
            issues.append(f"Too little content ({words} words) — AI needs at least 500 words to understand your product")

        return min(schema_score + content_score, 100), issues

    # ── Site-level audit ──

    async def audit_site(
        self, domain: str, platform: str | None = None,
        access_token: str | None = None,
    ) -> SiteAuditResult:
        """Audit an entire site for AI crawlability + Schema coverage.

        Routes on platform so each CMS gets the right strategy:
          - shopify   → /products.json + sitemap + homepage links
          - wordpress → plugin REST API (authenticated — works through
                        Cloudflare / bot protection) → public WooCommerce
                        REST → RankMath sitemap index → homepage links
        When platform / token are omitted, they are resolved from the
        sites table — a connected store is always audited through its
        auth channel, never a blind crawl.
        """
        if not domain.startswith("http"):
            domain = f"https://{domain}"
        parsed = urlparse(domain)
        base = f"{parsed.scheme}://{parsed.netloc}"
        host = parsed.netloc

        if not platform or not access_token:
            resolved = self._resolve_site(host)
            if resolved:
                platform = platform or resolved.get("platform") or None
                access_token = access_token or resolved.get("access_token") or None

        if not platform:
            try:
                from app.services.cms_detector import CMSDetector
                platform = (await CMSDetector().detect(host)).platform
            except Exception:
                platform = None

        if platform == "shopify":
            return await self._audit_shopify(base, host)
        if platform in ("woocommerce", "wordpress"):
            return await self._audit_wordpress(base, host, access_token)
        # custom / unknown / bigcommerce / magento — generic crawl
        return await self._audit_shopify(base, host)

    def _resolve_site(self, host: str) -> dict | None:
        """Look up a connected site (platform + token) from the sites table."""
        try:
            from app.services.db import DB
            from app.services.usage import normalize_domain
            domain = normalize_domain(host)
            rows = (DB().client.table("sites")
                    .select("platform", "access_token", "domain")
                    .eq("domain", domain).limit(5).execute().data or [])
            for r in rows:
                if r.get("platform"):
                    return r
        except Exception:
            pass
        return None

    async def _audit_shopify(self, base: str, host: str) -> SiteAuditResult:
        """Crawl sitemap + Shopify JSON API for fast site-wide Schema coverage."""
        result = SiteAuditResult(url=host)

        # Check robots.txt
        try:
            robots_url = urljoin(base, "/robots.txt")
            robots_content = await self._fetch(robots_url)
            result.ai_bots_blocked = self._check_ai_bots(robots_content)
        except Exception:
            result.ai_bots_blocked = {k: False for k in AI_BOTS}

        # Strategy: Shopify /products.json API
        # If blocked by Cloudflare, fall through to stealth browser
        products = []
        api_url = urljoin(base, "/products.json?limit=250")

        # Try Shopify /products.json. Only a real JSON body counts — an HTML
        # response is a 404/error page, not Cloudflare protection.
        try:
            html = await self._fetch(api_url)
            products = json.loads(html).get("products", [])[:50]
        except (json.JSONDecodeError, TypeError):
            products = []
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403, 429):
                try:
                    html = await self._fetch_stealth(api_url)
                    products = json.loads(html).get("products", [])[:50]
                except Exception:
                    products = []
            else:
                products = []
        except Exception:
            products = []

        # Fallback: sitemap
        if not products:
            try:
                sitemap_url = urljoin(base, "/sitemap.xml")
                try:
                    sitemap = await self._fetch(sitemap_url)
                except Exception:
                    sitemap = await self._fetch_stealth(sitemap_url)
                soup = BeautifulSoup(sitemap, "xml")
                urls = soup.find_all("loc")
                for u in urls[:50]:
                    path = urlparse(u.get_text(strip=True)).path
                    parts = [p for p in path.split("/") if p and p != "products"]
                    if parts:
                        products.append({"title": "", "handle": parts[-1]})
            except Exception:
                # Last resort: stealth browse homepage for product links
                try:
                    home_html = await self._fetch_stealth(base)
                    home_soup = BeautifulSoup(home_html, "lxml")
                    links = home_soup.find_all("a", href=re.compile(r"/products/"))
                    for a in links[:20]:
                        handle = a["href"].split("/products/")[-1].split("?")[0]
                        products.append({"title": "", "handle": handle})
                except Exception:
                    pass

        result.total_pages = max(len(products), 1)

        if not products:
            result.top_issues.append(
                "No products found — if this is your store, connect it in "
                "Integrations to enable instant product reading."
            )
            result.health_score = 0
            return result

        # Sample pages for Schema inspection. Blocked stores (stealth browser)
        # stay at 3; everything else is sampled in full (≤100) — the score must
        # reflect the whole store, not just the newest products.
        if any(result.ai_bots_blocked.values()):
            sample = products[:3]
        elif len(products) <= 100:
            sample = products
        else:
            step = len(products) // 100
            sample = products[::step][:100]  # evenly-spaced, deterministic
        result.sampled_pages = len(sample)
        stealth_used = False

        sem = asyncio.Semaphore(4)  # 4 concurrent fetches — more trips CF rate limits

        async def _sample_one(p: dict) -> tuple[dict | None, bool]:
            handle = p.get("handle", "")
            product_title = p.get("title", "") or handle
            if not handle:
                return None, False
            product_url = urljoin(base, f"/products/{handle}")
            async with sem:
                try:
                    html = await self._fetch(product_url)
                    stealth = False
                except Exception:
                    try:
                        html = await self._fetch_stealth(product_url)
                        stealth = True
                    except Exception:
                        return None, False
            soup = BeautifulSoup(html, "lxml")
            self._count_schemas(soup, result)
            # Extract product data for DB persistence
            title = self._extract_title(soup)
            scripts = soup.find_all("script", type="application/ld+json")
            has_schema = False; fields = 0
            for s in scripts:
                try: data=json.loads(s.string); types=SchemaDetector._extract_types(data)
                except: continue
                if types & {"Product","ProductGroup"}: has_schema=True; fields=len([k for k in data if k not in ("@context","@type")])
            variants = p.get("variants") or []
            entry = {
                "title": title or product_title,
                "url": product_url,
                "description": re.sub(r"<[^>]+>", " ", p.get("body_html") or "")[:3000],
                "price": str(variants[0].get("price", "")) if variants else "",
                "sku": variants[0].get("sku", "") if variants else "",
                "brand": p.get("vendor") or "",
                "has_schema": has_schema,
                "schema_fields": fields,
            }
            return entry, stealth

        # Parallel sampling — serializing 20 page fetches over Cloudflare is slow
        results = await asyncio.gather(*[_sample_one(p) for p in sample], return_exceptions=True)
        for r in results:
            if isinstance(r, Exception) or not r or not r[0]:
                result.js_rendering_issues += 1
            else:
                result.sampled_products.append(r[0])
                if r[1]:
                    stealth_used = True

        if stealth_used and result.total_pages > 3:
            result.top_issues.append(
                f"Bot protection active — sampled {len(sample)}/{result.total_pages} pages. "
                "Connect the store in Integrations for complete audits."
            )

        self._finalize_score(result, len(sample))
        return result

    async def _audit_wordpress(
        self, base: str, host: str, access_token: str | None = None,
    ) -> SiteAuditResult:
        """WordPress / WooCommerce audit.

        Auth channel first: the ProdRank plugin API returns the real product
        list straight from WooCommerce — it works through Cloudflare and bot
        protection because it is an authenticated call, not a crawl. Falls
        back to the public WooCommerce REST API, then the RankMath sitemap
        index, then homepage product links (unconnected stores).
        """
        result = SiteAuditResult(url=host)
        result.ai_bots_blocked = {k: False for k in AI_BOTS}
        try:
            robots_url = urljoin(base, "/robots.txt")
            robots_content = await self._fetch(robots_url)
            result.ai_bots_blocked = self._check_ai_bots(robots_content)
        except Exception:
            pass

        products, channel = await self._collect_wp_products(base, access_token)

        result.total_pages = max(len(products), 1)
        if not products:
            result.top_issues.append(
                "No products found — if this is your store, connect it in "
                "Integrations to enable instant product reading."
            )
            result.health_score = 0
            return result

        if channel != "plugin":
            result.top_issues.append(
                f"Product list read via {channel} — connect the store in "
                "Integrations to audit through the secure plugin channel."
            )
        else:
            result.top_issues.append(
                f"Connected via plugin — all {len(products)} products read "
                "through the authenticated channel."
            )

        # Sample product pages for Schema inspection (parallel — serializing
        # page fetches over Cloudflare is slow). Connected stores are sampled
        # in FULL: the plugin list is authoritative, and first-N-only sampling
        # was biased (WooCommerce lists newest products first — usually the
        # best-optimized ones — inflating the score).
        if any(result.ai_bots_blocked.values()):
            sample = products[:3]
        elif len(products) <= 100:
            sample = products
        else:
            step = len(products) // 100
            sample = products[::step][:100]  # evenly-spaced, deterministic
        result.sampled_pages = len(sample)
        stealth_used = False

        sem = asyncio.Semaphore(4)  # 4 concurrent fetches — more trips CF rate limits

        async def _sample_one(p: dict) -> tuple[dict | None, bool]:
            product_url = p.get("url", "")
            if not product_url:
                return None, False
            async with sem:
                try:
                    html = await self._fetch(product_url)
                    stealth = False
                except Exception:
                    try:
                        html = await self._fetch_stealth(product_url)
                        stealth = True
                    except Exception:
                        return None, False
            soup = BeautifulSoup(html, "lxml")
            self._count_schemas(soup, result)
            title = self._extract_title(soup)
            scripts = soup.find_all("script", type="application/ld+json")
            has_schema = False; fields = 0
            for s in scripts:
                try: data=json.loads(s.string); types=SchemaDetector._extract_types(data)
                except: continue
                if types & {"Product","ProductGroup"}: has_schema=True; fields=len([k for k in data if k not in ("@context","@type")])
            entry = {
                "title": title or p.get("title", ""),
                "url": product_url,
                "description": (p.get("description") or "")[:3000],
                "price": str(p.get("price") or ""),
                "sku": p.get("sku") or "",
                "brand": p.get("brand") or "",
                "has_schema": has_schema,
                "schema_fields": fields,
            }
            return entry, stealth

        results = await asyncio.gather(*[_sample_one(p) for p in sample], return_exceptions=True)
        for r in results:
            if isinstance(r, Exception) or not r or not r[0]:
                result.js_rendering_issues += 1
            else:
                result.sampled_products.append(r[0])
                if r[1]:
                    stealth_used = True

        if stealth_used and result.total_pages > 3:
            result.top_issues.append(
                f"Bot protection active — sampled {len(sample)}/{result.total_pages} pages. "
                "Connect the store in Integrations for complete audits."
            )

        self._finalize_score(result, len(sample))
        return result

    async def _collect_wp_products(
        self, base: str, access_token: str | None,
    ) -> tuple[list[dict], str]:
        """Collect WooCommerce products via the best available channel:
        plugin API → public WooCommerce REST → sitemap → shop archive → homepage."""
        # 1. Plugin API (authenticated — works through bot protection)
        if access_token:
            try:
                products = await self._wp_plugin_products(base, access_token)
                if products:
                    return products, "plugin"
            except Exception as e:
                print(f"[audit] plugin channel failed for {base}: {e}")

        # 2. Public WooCommerce REST API (read endpoints are public by default)
        try:
            ua = SchemaDetector._browser_headers()["User-Agent"]
            async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
                resp = await client.get(
                    urljoin(base, "/wp-json/wc/v3/products"),
                    headers={"User-Agent": ua},
                    params={"per_page": 100, "page": 1},
                )
                if resp.status_code == 200 and "application/json" in resp.headers.get("content-type", ""):
                    data = resp.json()
                    if isinstance(data, list) and data:
                        products = [{
                            "title": p.get("name", ""),
                            "url": p.get("permalink", ""),
                            "description": re.sub(r"<[^>]+>", " ", p.get("description", "") or "")[:3000],
                            "price": str(p.get("price") or ""),
                            "sku": p.get("sku") or "",
                            "brand": "",
                        } for p in data[:300]]
                        return products, "WooCommerce REST API"
        except Exception:
            pass

        # 3. Sitemap index (RankMath / Yoast / WP core) → product URLs
        products: list[dict] = []
        for sitemap_path in ("/sitemap_index.xml", "/sitemap.xml", "/wp-sitemap.xml"):
            try:
                xml = await self._fetch(urljoin(base, sitemap_path))
                soup = BeautifulSoup(xml, "xml")
                sitemap_elems = soup.find_all("sitemap")  # sitemap index form
                locs = []
                if sitemap_elems:
                    locs = [s.find("loc").get_text(strip=True) for s in sitemap_elems if s.find("loc")]
                else:
                    locs = [u.find("loc").get_text(strip=True) for u in soup.find_all("url") if u.find("loc")]
                if not locs:
                    continue

                product_locs = []
                for loc in locs[:200]:
                    if any(k in loc for k in ("/product/", "/products/", "post_type=product")):
                        product_locs.append(loc)

                # Sitemap index → fetch child sitemaps that look like products
                if sitemap_elems:
                    for child in locs[:40]:
                        if any(k in child.lower() for k in ("product", "wc", "woo")):
                            try:
                                child_xml = await self._fetch(child)
                                child_soup = BeautifulSoup(child_xml, "xml")
                                for u in child_soup.find_all("url"):
                                    loc_el = u.find("loc")
                                    if loc_el and "/product/" in loc_el.get_text(strip=True):
                                        product_locs.append(loc_el.get_text(strip=True))
                            except Exception:
                                continue

                seen = set()
                for loc in product_locs[:300]:
                    if loc and loc not in seen:
                        seen.add(loc)
                        products.append({"title": "", "url": loc, "description": "", "price": "", "sku": "", "brand": ""})
                if products:
                    return products, "sitemap"
            except Exception:
                continue

        # 4. Shop archive pages (/shop/, /shop/page/2/, ...)
        try:
            ua = SchemaDetector._browser_headers()["User-Agent"]
            seen = set()
            archive_products = []
            for page_no in range(1, 9):
                url = urljoin(base, "/shop/") if page_no == 1 else urljoin(base, f"/shop/page/{page_no}/")
                async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
                    resp = await client.get(url, headers={"User-Agent": ua})
                if resp.status_code != 200:
                    break
                soup = BeautifulSoup(resp.text, "lxml")
                found_any = False
                for a in soup.find_all("a", href=re.compile(r"/product/")):
                    href = urljoin(base, a["href"].split("?")[0].split("#")[0])
                    if href not in seen:
                        seen.add(href)
                        archive_products.append({
                            "title": a.get_text(strip=True), "url": href,
                            "description": "", "price": "", "sku": "", "brand": "",
                        })
                        found_any = True
                if not found_any:
                    break
            if archive_products:
                return archive_products[:300], "shop archive"
        except Exception:
            pass

        # 5. Homepage product links (last resort)
        try:
            home_html = await self._fetch(base)
            home_soup = BeautifulSoup(home_html, "lxml")
            seen = {p["url"] for p in products}
            for a in home_soup.find_all("a", href=re.compile(r"/(product|products)/")):
                href = urljoin(base, a["href"].split("?")[0])
                if href not in seen:
                    seen.add(href)
                    products.append({"title": a.get_text(strip=True), "url": href, "description": "", "price": "", "sku": "", "brand": ""})
        except Exception:
            pass
        if products:
            return products[:300], "homepage links"
        return [], "none"

    async def _wp_plugin_products(self, base: str, access_token: str) -> list[dict]:
        """Paginate the ProdRank plugin /products endpoint (auth channel)."""
        api = f"{base}/wp-json/prodrank/v1/products"
        headers = {
            "X-ProdRank-Token": access_token,
            "User-Agent": SchemaDetector._browser_headers()["User-Agent"],
        }
        products = []
        offset = 0
        while len(products) < 500:
            async with httpx.AsyncClient(follow_redirects=True, timeout=25) as client:
                resp = await client.get(api, headers=headers, params={"limit": 50, "offset": offset})
                resp.raise_for_status()
                data = resp.json()
            page = data.get("products", []) if isinstance(data, dict) else []
            if not page:
                break
            for p in page:
                products.append({
                    "title": p.get("title", ""),
                    "url": p.get("url", ""),
                    "description": (p.get("description") or "")[:3000],
                    "price": str(p.get("price") or ""),
                    "sku": p.get("sku") or "",
                    "brand": p.get("brand") or "",
                })
            if len(page) < 50:
                break
            offset += len(page)
        return products

    def _finalize_score(self, result: SiteAuditResult, n: int) -> None:
        """Compute health score + top issues from the sampled pages."""
        if n > 0:
            # ratios capped at 1.0 — counters must never exceed the sampled
            # page count, but keep the cap as defense in depth
            cov = min(1.0, result.pages_with_product_schema / n)
            result.health_score = int(
                cov * 50
                + min(1.0, result.pages_with_faq_schema / n) * 20
                + min(1.0, result.pages_with_breadcrumb / n) * 10
                + min(1.0, result.pages_with_organization / n) * 10
                - (result.js_rendering_issues / n) * 10
            )
            result.health_score = max(0, min(100, result.health_score))

        # Top issues
        if result.pages_with_product_schema < n:
            result.top_issues.append(
                f"{n - result.pages_with_product_schema}/{n} sampled pages lack Product Schema"
            )
        if result.pages_with_faq_schema < n * 0.3:
            result.top_issues.append("Less than 30% of pages have FAQPage Schema")
        blocked = [name for name, blocked in result.ai_bots_blocked.items() if blocked]
        if blocked:
            result.top_issues.append(f"AI bots blocked: {', '.join(blocked)}")
        if result.js_rendering_issues > 0:
            result.top_issues.append(f"{result.js_rendering_issues} pages had fetch issues")

    def _check_ai_bots(self, robots_content: str) -> dict[str, bool]:
        blocked = {}
        for token, _name in AI_BOTS.items():
            blocked[token] = any(
                line.strip().startswith(f"User-agent: {token}")
                and "Disallow: /" in robots_content
                for line in robots_content.split("\n")
            )
        return blocked

    def _count_schemas(self, soup: BeautifulSoup, result: SiteAuditResult) -> None:
        """Count Schema types on a page and update SiteAuditResult.

        Counts PAGES, not scripts — a product page often carries several
        JSON-LD blocks (theme Organization, WooCommerce default Product,
        plugin @graph). One page with N Product scripts used to increment
        the counter N times, letting counters exceed the sampled page count
        and inflating the health score past its cap.
        """
        scripts = soup.find_all("script", type="application/ld+json")
        page_types: set[str] = set()
        for script in scripts:
            try:
                data = json.loads(script.string)
            except (json.JSONDecodeError, TypeError):
                continue
            page_types |= self._extract_types(data)
        if page_types & {"Product", "ProductGroup"}:
            result.pages_with_product_schema += 1
        if "FAQPage" in page_types:
            result.pages_with_faq_schema += 1
        if "BreadcrumbList" in page_types:
            result.pages_with_breadcrumb += 1
        if "Organization" in page_types:
            result.pages_with_organization += 1

    @staticmethod
    def _extract_types(data: dict) -> set[str]:
        """Extract all @type values from JSON-LD data."""
        types = set()
        if isinstance(data, dict):
            t = data.get("@type")
            if t:
                if isinstance(t, str):
                    types.add(t)
                elif isinstance(t, list):
                    types.update(t)
            for item in data.get("@graph", []):
                if isinstance(item, dict):
                    gt = item.get("@type")
                    if isinstance(gt, str):
                        types.add(gt)
                    elif isinstance(gt, list):
                        types.update(gt)
        return types
