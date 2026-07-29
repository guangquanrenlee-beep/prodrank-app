"""
Product Schema Detection Engine — Phase 1 Core
Audits 12 key Schema.org Product fields, FAQPage, AI bot accessibility.
"""

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
                    f"1. Install the ProdRank inject.js on your site (1 line of code)",
                    f"   <script async src=\"https://prodrank.app/inject.js\" data-site=\"{domain}\"></script>",
                    f"   This auto-detects product pages and injects Schema without us needing to crawl.",
                    f"",
                    f"2. If this is a Shopify store, install the ProdRank App from Shopify App Store.",
                    f"",
                    f"3. Paste the product page HTML directly for manual audit.",
                ]
                result.content_quality_score = 0
                return result

        soup = BeautifulSoup(html, "lxml")
        result = ProductAuditResult(url=url)
        result.title = self._extract_title(soup)

        # 1. Schema.org JSON-LD inspection
        json_ld_scripts = soup.find_all("script", type="application/ld+json")
        product_data = {}
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
                product_data = data
            elif isinstance(data, dict) and "@graph" in data:
                for item in data["@graph"]:
                    gt = item.get("@type")
                    if isinstance(gt, list):
                        gt = gt[0] if gt else None
                    if gt in ("Product", "ProductGroup"):
                        product_data = item
                    elif gt == "FAQPage":
                        faq_found = True

            if t == "FAQPage":
                faq_found = True

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

    async def audit_site(self, domain: str) -> SiteAuditResult:
        """Crawl sitemap + Shopify JSON API for fast site-wide Schema coverage."""
        result = SiteAuditResult(url=domain)

        if not domain.startswith("http"):
            domain = f"https://{domain}"
        parsed = urlparse(domain)
        base = f"{parsed.scheme}://{parsed.netloc}"

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

        # Try Shopify /products.json
        try:
            html = await self._fetch(api_url)
            if html.strip().startswith("<"):
                raise ValueError("Cloudflare HTML response")
        except Exception:
            try:
                html = await self._fetch_stealth(api_url)
            except Exception:
                html = ""

        if html and not html.strip().startswith("<"):
            try:
                data = json.loads(html)
                products = data.get("products", [])[:50]
            except json.JSONDecodeError:
                pass

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
            result.top_issues.append("No products found — site may require stealth browser for audit")
            result.health_score = 0
            return result

        # Sample products for Schema check
        # For protected stores (stealth browser), limit to 3 to keep response time sane
        sample = products[:3] if result.ai_bots_blocked else products[:20]
        stealth_used = False

        for p in sample:
            handle = p.get("handle", "")
            product_title = p.get("title", "") or handle
            if handle:
                product_url = urljoin(base, f"/products/{handle}")
                try:
                    html = await self._fetch(product_url)
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
                    result.sampled_products.append({"title": title or product_title, "url": product_url, "has_schema": has_schema, "schema_fields": fields})
                except Exception:
                    try:
                        html = await self._fetch_stealth(product_url)
                        soup = BeautifulSoup(html, "lxml")
                        self._count_schemas(soup, result)
                        title = self._extract_title(soup)
                        result.sampled_products.append({"title": title or product_title, "url": product_url, "has_schema": False, "schema_fields": 0})
                        stealth_used = True
                    except Exception:
                        result.js_rendering_issues += 1

        if stealth_used and result.total_pages > 3:
            result.top_issues.append(
                f"Bot protection active — sampled {len(sample)}/{result.total_pages} pages. "
                "Install ProdRank Shopify App for complete audit."
            )

        # Calculate score
        if len(sample) > 0:
            n = len(sample)
            cov = result.pages_with_product_schema / n
            result.health_score = int(
                cov * 50
                + (result.pages_with_faq_schema / n) * 20
                + (result.pages_with_breadcrumb / n) * 10
                + (result.pages_with_organization / n) * 10
                - (result.js_rendering_issues / n) * 10
            )
            result.health_score = max(0, min(100, result.health_score))

        # Top issues
        if result.pages_with_product_schema < len(sample):
            result.top_issues.append(
                f"{len(sample) - result.pages_with_product_schema}/{len(sample)} sampled pages lack Product Schema"
            )
        if result.pages_with_faq_schema < len(sample) * 0.3:
            result.top_issues.append("Less than 30% of pages have FAQPage Schema")
        blocked = [name for name, blocked in result.ai_bots_blocked.items() if blocked]
        if blocked:
            result.top_issues.append(f"AI bots blocked: {', '.join(blocked)}")
        if result.js_rendering_issues > 0:
            result.top_issues.append(f"{result.js_rendering_issues} pages had fetch issues")

        return result

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
        """Count Schema types on a page and update SiteAuditResult."""
        scripts = soup.find_all("script", type="application/ld+json")
        for script in scripts:
            try:
                data = json.loads(script.string)
            except (json.JSONDecodeError, TypeError):
                continue
            types = self._extract_types(data)
            if types & {"Product", "ProductGroup"}:
                result.pages_with_product_schema += 1
            if "FAQPage" in types:
                result.pages_with_faq_schema += 1
            if "BreadcrumbList" in types:
                result.pages_with_breadcrumb += 1
            if "Organization" in types:
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
