"""
CMS Detection Engine — auto-detect platform and route to correct auth method.
Analyzes HTTP headers, HTML markers, and known API endpoints to identify:
  Shopify, WooCommerce, WordPress, BigCommerce, Magento, Custom.
"""

import re
from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup


@dataclass
class CMSResult:
    domain: str
    platform: str  # "shopify", "woocommerce", "wordpress", "bigcommerce", "magento", "custom"
    confidence: int  # 0-100
    markers: list[str]
    auth_method: str  # "oauth", "rest_api", "plugin", "csv_upload"
    recommended_action: str


class CMSDetector:
    """Detect ecommerce platform from a domain."""

    async def detect(self, domain: str) -> CMSResult:
        """Analyze a domain and return platform + recommended auth method."""
        domain = domain.strip().lower()
        domain = re.sub(r"^https?://", "", domain)
        domain = re.sub(r"^www\.", "", domain)
        domain = domain.split("/")[0]

        url = f"https://{domain}"
        markers = []
        confidence = 0

        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
                resp = await client.get(url, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36",
                    "Accept": "text/html",
                })
                html = resp.text
                headers = resp.headers
        except Exception:
            return CMSResult(
                domain=domain, platform="custom", confidence=0,
                markers=["unreachable"], auth_method="csv_upload",
                recommended_action="Upload your product CSV or install inject.js on your site.",
            )

        soup = BeautifulSoup(html, "lxml")

        # ── Shopify detection ──
        shopify_markers = []
        if "myshopify.com" in html.lower() or "cdn.shopify.com" in html.lower():
            shopify_markers.append("Shopify CDN detected")
        if soup.find("link", href=re.compile(r"cdn\.shopify\.com")):
            shopify_markers.append("Shopify asset CDN")
        if "shopify" in headers.get("server", "").lower():
            shopify_markers.append("Shopify server header")
        if "shopify" in headers.get("x-powered-by", "").lower():
            shopify_markers.append("Shopify X-Powered-By")
        if soup.find("script", src=re.compile(r"shopify\.com")):
            shopify_markers.append("Shopify JS script")
        # /products.json — Shopify's unique API endpoint
        # 200 = confirmed Shopify, 429 = rate-limited but endpoint exists = confirmed Shopify
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=5) as c:
                r = await c.get(f"https://{domain}/products.json?limit=1", headers={
                    "Accept": "application/json",
                })
                if r.status_code == 200:
                    shopify_markers.append("Shopify /products.json accessible")
                elif r.status_code == 429:
                    shopify_markers.append("Shopify /products.json rate-limited (endpoint confirmed)")
        except Exception:
            pass

        if len(shopify_markers) >= 1:  # /products.json alone is proof enough
            markers = shopify_markers
            confidence = 95
            return CMSResult(
                domain=domain, platform="shopify", confidence=confidence,
                markers=markers, auth_method="oauth",
                recommended_action="Connect your Shopify store via OAuth — one click. No code changes needed.",
            )

        # ── WooCommerce detection ──
        woo_markers = []
        if "/wp-content/" in html or "/wp-includes/" in html:
            woo_markers.append("WordPress detected")
        if "woocommerce" in html.lower():
            woo_markers.append("WooCommerce reference")
        if soup.find("link", href=re.compile(r"woocommerce")):
            woo_markers.append("WooCommerce CSS")
        if soup.find("script", src=re.compile(r"woocommerce")):
            woo_markers.append("WooCommerce JS")
        if soup.find("body", class_=re.compile(r"woocommerce")):
            woo_markers.append("WooCommerce body class")
        # Check for WooCommerce REST API
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=5) as client:
                api_resp = await client.get(f"https://{domain}/wp-json/wc/v3/")
                if api_resp.status_code in (200, 401):
                    woo_markers.append("WooCommerce REST API accessible")
        except Exception:
            pass

        if len(woo_markers) >= 2:
            markers = woo_markers
            confidence = 90
            return CMSResult(
                domain=domain, platform="woocommerce", confidence=confidence,
                markers=markers, auth_method="rest_api",
                recommended_action="Install the ProdRank WordPress plugin (1 click) or enter your WooCommerce REST API keys for direct access.",
            )

        # ── WordPress (non-WooCommerce) ──
        wp_markers = []
        if "/wp-content/" in html or "/wp-includes/" in html:
            wp_markers.append("WordPress detected")
        if soup.find("meta", attrs={"name": "generator"}, content=re.compile(r"WordPress")):
            wp_markers.append("WordPress generator meta")
        if soup.find("link", href=re.compile(r"wp-content")):
            wp_markers.append("WordPress content links")

        if wp_markers:
            markers = wp_markers
            confidence = 80
            return CMSResult(
                domain=domain, platform="wordpress", confidence=confidence,
                markers=markers, auth_method="plugin",
                recommended_action="Install the ProdRank WordPress plugin for automatic Schema injection.",
            )

        # ── BigCommerce ──
        if "bigcommerce" in html.lower() or "cdn.bigcommerce.com" in html.lower():
            markers.append("BigCommerce detected")
            confidence = 85
            return CMSResult(
                domain=domain, platform="bigcommerce", confidence=confidence,
                markers=markers, auth_method="csv_upload",
                recommended_action="Export your products as CSV from BigCommerce and upload here for instant Schema generation.",
            )

        # ── Magento ── (strict: require magento references, not just "mage/" which matches too broadly)
        is_magento = False
        if "magento" in html.lower():
            is_magento = True
        if "mage/" in html.lower() and ("magento" in html.lower() or "/skin/frontend/" in html.lower()):
            is_magento = True
        if "x-magento" in str(headers).lower():
            is_magento = True
        if is_magento:
            markers.append("Magento detected")
            confidence = 85
            return CMSResult(
                domain=domain, platform="magento", confidence=confidence,
                markers=markers, auth_method="csv_upload",
                recommended_action="Export your catalog as CSV from Magento admin and upload here.",
            )

        # ── Cloudflare: only mark as Shopify if Shopify markers also found ──
        cf_detected = (
            "cf-ray" in headers
            or "cloudflare" in str(headers).lower()
            or "Just a moment" in html[:500]
            or soup.find("script", src=re.compile(r"cloudflare"))
        )
        if cf_detected and shopify_markers:
            markers = shopify_markers + ["Cloudflare detected"]
            return CMSResult(
                domain=domain, platform="shopify", confidence=80,
                markers=markers, auth_method="oauth",
                recommended_action="Shopify store detected (behind Cloudflare). Connect via OAuth for instant product sync.",
            )
        elif cf_detected and not any([shopify_markers, wp_markers, woo_markers]):
            markers = ["Cloudflare detected — cannot determine CMS"]
            return CMSResult(
                domain=domain, platform="unknown", confidence=20,
                markers=markers, auth_method="csv_upload",
                recommended_action="Your site is behind Cloudflare. We can't auto-detect your platform. If this is a Shopify store, connect via OAuth. Otherwise, upload your product CSV.",
            )

        # ── Custom / Unknown ──
        return CMSResult(
            domain=domain, platform="custom", confidence=30,
            markers=["No known CMS detected"],
            auth_method="csv_upload",
            recommended_action="Upload your product CSV for instant Schema generation, or install our one-line inject.js script on your site.",
        )
