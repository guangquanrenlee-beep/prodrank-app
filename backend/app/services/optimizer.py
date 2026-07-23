"""
Schema Optimizer — Generates fix-ready JSON-LD code from audit results.
No AI API required for basic fixes. AI enhancement optional (for description + FAQ).
"""

import json
from dataclasses import dataclass, field
from typing import Any


@dataclass
class SchemaFix:
    """A single fix — insert-ready JSON-LD snippet."""
    schema_type: str  # "Product", "FAQPage", "Organization"
    priority: str  # "critical", "recommended", "optional"
    json_ld: str  # pretty-printed JSON-LD ready to paste in <head>
    note: str  # human-readable explanation


@dataclass
class OptimizationReport:
    url: str
    fixes: list[SchemaFix] = field(default_factory=list)
    ai_enhanced_description: str | None = None
    ai_generated_faq: list[dict] | None = None


class Optimizer:
    """Generate fix-ready JSON-LD from audit results."""

    def generate_fixes(
        self,
        product_url: str,
        title: str,
        description: str,
        price: str | None,
        sku: str | None,
        brand: str | None,
        images: list[str] | None,
        barcode: str | None,
        rating_value: float | None,
        review_count: int | None,
        currency: str = "USD",
    ) -> OptimizationReport:
        report = OptimizationReport(url=product_url)

        # ── Product Schema ──
        product = {
            "@context": "https://schema.org/",
            "@type": "Product",
            "name": title,
            "description": description or f"{title} — premium quality product.",
            "image": images or [],
            "sku": sku or "",
            "gtin13": barcode or "",
            "brand": {"@type": "Brand", "name": brand or ""},
            "offers": {
                "@type": "Offer",
                "url": product_url,
                "priceCurrency": currency,
                "price": price or "",
                "availability": "https://schema.org/InStock",
                "itemCondition": "https://schema.org/NewCondition",
                "shippingDetails": {
                    "@type": "OfferShippingDetails",
                    "shippingDestination": {
                        "@type": "DefinedRegion",
                        "addressCountry": "US",
                    },
                },
            },
        }

        if rating_value and review_count:
            product["aggregateRating"] = {
                "@type": "AggregateRating",
                "ratingValue": str(rating_value),
                "reviewCount": str(review_count),
            }

        report.fixes.append(SchemaFix(
            schema_type="Product",
            priority="critical",
            json_ld=json.dumps(product, indent=2, ensure_ascii=False),
            note="Complete Product Schema. Paste inside <head> or use Shopify App for auto-injection.",
        ))

        # ── FAQPage Schema ──
        faq_items = self._generate_fallback_faq(title, description or "")
        faq = {
            "@context": "https://schema.org/",
            "@type": "FAQPage",
            "mainEntity": faq_items,
        }
        report.fixes.append(SchemaFix(
            schema_type="FAQPage",
            priority="recommended",
            json_ld=json.dumps(faq, indent=2, ensure_ascii=False),
            note="FAQPage Schema. Products with FAQ are 40% more likely to be recommended by AI agents.",
        ))
        report.ai_generated_faq = faq_items

        # ── Organization Schema ──
        org = {
            "@context": "https://schema.org/",
            "@type": "Organization",
            "name": brand or title.split()[0],
        }
        report.fixes.append(SchemaFix(
            schema_type="Organization",
            priority="recommended",
            json_ld=json.dumps(org, indent=2, ensure_ascii=False),
            note="Organization Schema. Helps AI agents associate this product with your brand.",
        ))

        return report

    async def generate_fixes_ai(
        self,
        product_url: str,
        title: str,
        description: str,
        price: str | None,
        sku: str | None,
        brand: str | None,
        images: list[str] | None,
        barcode: str | None,
        rating_value: float | None,
        review_count: int | None,
        currency: str = "USD",
        product_data: dict | None = None,
    ) -> OptimizationReport:
        """
        Generate fixes with AI-enhanced description and FAQ.
        Falls back to non-AI version if no API key configured.
        """
        # Start with base fixes
        report = self.generate_fixes(
            product_url, title, description, price, sku, brand,
            images, barcode, rating_value, review_count, currency,
        )

        # Try AI enhancement for description
        try:
            from app.services.ai_query import AIQueryService
            ai = AIQueryService()

            # Use deep model for better descriptions
            enhanced_desc = await self._ai_enhance_description(
                ai, title, description, brand or ""
            )
            if enhanced_desc:
                report.ai_enhanced_description = enhanced_desc
                # Update the Product Schema fix with enhanced description
                for fix in report.fixes:
                    if fix.schema_type == "Product":
                        product_json = json.loads(fix.json_ld)
                        product_json["description"] = enhanced_desc
                        fix.json_ld = json.dumps(product_json, indent=2, ensure_ascii=False)
                        fix.note += " (AI-enhanced description)"

            # AI FAQ generation
            ai_faq = await self._ai_generate_faq(ai, title, description, brand or "")
            if ai_faq:
                report.ai_generated_faq = ai_faq
                faq_schema = {
                    "@context": "https://schema.org/",
                    "@type": "FAQPage",
                    "mainEntity": ai_faq,
                }
                for fix in report.fixes:
                    if fix.schema_type == "FAQPage":
                        fix.json_ld = json.dumps(faq_schema, indent=2, ensure_ascii=False)
                        fix.note += " (AI-generated)"

        except Exception:
            pass  # AI enhancement failed, return base fixes

        return report

    async def _ai_enhance_description(
        self, ai, title: str, description: str, brand: str
    ) -> str | None:
        """Use AI to enhance a product description for better AI agent visibility."""
        prompt = (
            f"Rewrite this product description to be more compelling and SEO-optimized "
            f"while remaining factual. Include key features, use cases, and target audience. "
            f"Keep it under 300 words.\n\n"
            f"Product: {title}\nBrand: {brand}\nCurrent description: {description}"
        )
        try:
            response = await ai.client.chat.completions.create(
                model=ai.model_b,  # Haiku — fast, good enough for rewriting
                messages=[
                    {"role": "system", "content": "You are a product copywriter. Write compelling, factual descriptions that help AI agents understand and recommend products."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
                max_tokens=500,
                timeout=30.0,
            )
            return response.choices[0].message.content or None
        except Exception:
            return None

    async def _ai_generate_faq(
        self, ai, title: str, description: str, brand: str
    ) -> list[dict] | None:
        """Use AI to generate 5 relevant FAQ questions and answers."""
        prompt = (
            f"Generate 5 FAQ questions and answers for this product. "
            f"Cover: shipping, returns, product features, compatibility, and care/maintenance. "
            f"Format as a JSON array: [{{\"@type\":\"Question\",\"name\":\"...\",\"acceptedAnswer\":{{\"@type\":\"Answer\",\"text\":\"...\"}}}}]\n\n"
            f"Product: {title}\nBrand: {brand}\nDescription: {description[:200]}"
        )
        try:
            response = await ai.client.chat.completions.create(
                model=ai.model_b,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=600,
                timeout=30.0,
            )
            raw = response.choices[0].message.content or ""
            # Extract JSON array from response
            import re
            match = re.search(r"\[.*\]", raw, re.DOTALL)
            if match:
                return json.loads(match.group())
        except Exception:
            pass
        return None

    def _generate_fallback_faq(self, title: str, description: str) -> list[dict]:
        """Generate basic FAQ items from product info (no AI needed)."""
        faqs = []

        # Shipping
        faqs.append({
            "@type": "Question",
            "name": f"How long does shipping take for the {title}?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "Shipping times vary by destination. Standard shipping typically arrives within 5-10 business days. Please check our Shipping page for detailed estimates to your area.",
            },
        })

        # Returns
        faqs.append({
            "@type": "Question",
            "name": "What is the return policy?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "We accept returns within 30 days of delivery. Items must be in original condition with tags attached. Please visit our Returns page for the complete policy and to initiate a return.",
            },
        })

        # Product-specific
        if description:
            brief = description[:300].strip()
            faqs.append({
                "@type": "Question",
                "name": f"What makes the {title} special?",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": brief,
                },
            })

        # Care / Maintenance
        faqs.append({
            "@type": "Question",
            "name": "How should I care for this product?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "Please refer to the care instructions included with your product. For best results, follow the manufacturer's guidelines for cleaning and maintenance to ensure longevity.",
            },
        })

        # Sizing / Compatibility
        faqs.append({
            "@type": "Question",
            "name": "Is this product available in other sizes or colors?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "Please check our product page for all available variants including sizes, colors, and styles. New options are added regularly.",
            },
        })

        return faqs
