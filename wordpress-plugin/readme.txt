=== ProdRank — Let AI discover and recommend your products. ===
Contributors: prodrank
Tags: seo, schema, structured data, json-ld, ai, generative engine optimization, geo, woocommerce
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 0.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

GEO (Generative Engine Optimization) for WooCommerce — make ChatGPT, Gemini, Claude, and Perplexity recommend your products.

== Description ==

ProdRank helps your WooCommerce store get recommended by AI engines. When customers ask ChatGPT, Gemini, Claude, or Perplexity "what's the best product for X?", AI agents cite stores with complete structured data and rich product content.

**What the plugin does:**

* **Server-side JSON-LD output** — Organization, WebSite + SearchAction, Product (12-field), and FAQPage Schema are rendered into the page at request time, so AI crawlers always see them (no JavaScript required).
* **AI content in post meta** — AI-optimized descriptions, FAQs, Pros/Cons, Comparison tables, Buying Guides, and Specifications are stored in post meta (`_prodrank_*`), never in your original product content. Your store stays intact; uninstall the plugin and nothing is lost.
* **Shortcodes** — place AI content anywhere on the product page:
  `[prodrank_description]` `[prodrank_ai_summary]` `[prodrank_pros]` `[prodrank_cons]` `[prodrank_faq]` `[prodrank_comparison]` `[prodrank_use_cases]` `[prodrank_buying_guide]` `[prodrank_specification]`
* **Rendering Rules** — show/hide each AI section from WooCommerce → ProdRank SEO. JSON-LD Schema always outputs regardless of what's visible.
* **SaaS sync via REST API** — connect the ProdRank dashboard (prodrank.app) with an API token; the SaaS generates content, publishes it versioned, and verifies the live page.
* **Versioned + traceable** — every AI change is versioned with provenance (model, prompt version, timestamps). Roll back any field at any time.
* **Yoast SEO & Rank Math compatible** — multiple JSON-LD blocks are valid and recommended by Google.

**Content boundaries:** ProdRank never modifies your theme, navigation, About/Blog/Homepage pages, collections, images, or CSS. Only the product description can be overwritten — and only when you explicitly opt in at publish time.

== Installation ==

1. Upload the `prodrank-ai-seo` folder to `/wp-content/plugins/`, or install through the WordPress plugins screen.
2. Activate the plugin (requires WooCommerce).
3. Go to **WooCommerce → ProdRank SEO** to copy your API token and configure Rendering Rules.
4. Connect the store in your ProdRank dashboard to start generating AI content.

== Frequently Asked Questions ==

= Does this overwrite my product descriptions? =

No — by default all AI content is stored in post meta and rendered via shortcodes. The product description is only overwritten if you explicitly enable it in the dashboard at publish time.

= Does it conflict with Yoast or Rank Math? =

No. ProdRank outputs its own JSON-LD blocks; multiple `application/ld+json` blocks per page are valid HTML and recommended by Google.

= Will AI content break if I change my theme? =

No. The plugin only hooks `wp_head` and renders shortcodes; it never edits theme files.

== Changelog ==

= 0.2.0 =
* Multi-file architecture: content storage (post meta), schema renderer, REST API (prodrank/v1), sync listener, admin settings.
* AI content via shortcodes + rendering rules.
* Versioned publishing with provenance + rollback.

= 0.1.0 =
* Initial release: schema generation (Product, FAQPage, Organization, WebSite), Yoast/Rank Math compatibility, admin coverage stats.

== Upgrade Notice ==

= 0.2.0 =
Architecture refactor. Existing 0.1.0 installations upgrade cleanly; schema output is unchanged.
