<?php
/**
 * ProdRank Schema — server-side JSON-LD output via wp_head.
 *
 * ⑤ Schema Renderer:
 *   - Product: prefers the full AI schema stored by the SaaS in
 *     `_prodrank_schema` post meta; falls back to live generation from
 *     WooCommerce data so pages always have valid structured data.
 *   - FAQPage: reads `_prodrank_faq` questions (shared with the visible FAQ
 *     shortcode); JSON-LD always outputs regardless of rendering rules.
 *   - Organization + WebSite: generated site-wide.
 * Compatible with Yoast SEO and Rank Math (multiple JSON-LD blocks are valid).
 */

if (!defined('ABSPATH')) {
    exit;
}

class ProdRank_Schema {

    public function __construct() {
        add_action('wp_head', [$this, 'output_schema'], 1);
        add_action('init', [$this, 'compatibility_init'], 99);
    }

    // ── Output ──

    public function output_schema(): void {
        $this->print_json_ld($this->generate_organization_schema(), 'Organization');

        // WebSite + SearchAction (site-wide)
        $this->print_json_ld([
            '@context' => 'https://schema.org/',
            '@type'    => 'WebSite',
            'name'     => get_bloginfo('name'),
            'url'      => home_url('/'),
            'potentialAction' => [
                '@type' => 'SearchAction',
                'target' => home_url('/?s={search_term_string}'),
                'query-input' => 'required name=search_term_string',
            ],
        ], 'WebSite');

        if (function_exists('is_product') && is_product()) {
            // ⑤ Product — prefer SaaS-generated full schema
            $schema = $this->get_product_schema();
            if ($schema) {
                $this->print_json_ld($schema, 'Product');
            }
            // FAQPage — from AI FAQ post meta (always output for AI engines)
            $faq = $this->get_faq_jsonld();
            if ($faq) {
                $this->print_json_ld($faq, 'FAQPage');
            }
        }
    }

    /**
     * @return array|null Full Product schema (SaaS meta first, live fallback)
     */
    private function get_product_schema(): ?array {
        global $post;
        if ($post) {
            $saved = ProdRank_Content::get_content($post->ID, 'schema');
            if (is_array($saved) && !empty($saved['@type'])) {
                return $saved;
            }
        }
        return $this->generate_product_schema();
    }

    private function get_faq_jsonld(): ?array {
        global $post;
        if (!$post) {
            return null;
        }
        $faq = ProdRank_Content::get_content($post->ID, 'faq');
        $questions = is_array($faq) ? ($faq['questions'] ?? []) : [];
        if (!$questions) {
            return null;
        }
        $main = [];
        foreach ($questions as $qa) {
            $q = $qa['question'] ?? '';
            $a = $qa['answer'] ?? '';
            if ($q && $a) {
                $main[] = [
                    '@type' => 'Question',
                    'name'  => $q,
                    'acceptedAnswer' => ['@type' => 'Answer', 'text' => $a],
                ];
            }
        }
        if (!$main) {
            return null;
        }
        return ['@context' => 'https://schema.org/', '@type' => 'FAQPage', 'mainEntity' => $main];
    }

    // ── Live fallback generation ──

    private function generate_organization_schema(): array {
        $site_name = get_bloginfo('name');
        $site_url  = home_url('/');
        $schema = [
            '@context'    => 'https://schema.org/',
            '@type'       => 'Organization',
            'name'        => $site_name,
            'url'         => $site_url,
            'description' => get_bloginfo('description') ?: $site_name,
        ];
        $custom_logo_id = get_theme_mod('custom_logo');
        if ($custom_logo_id) {
            $logo_url = wp_get_attachment_image_url($custom_logo_id, 'full');
            if ($logo_url) {
                $schema['logo'] = $logo_url;
            }
        }
        return $schema;
    }

    private function generate_product_schema(): ?array {
        global $product;
        if (!$product instanceof WC_Product) {
            return null;
        }
        $product_id = $product->get_id();
        $images = [];
        $main_image_id = $product->get_image_id();
        if ($main_image_id) {
            $images[] = wp_get_attachment_url($main_image_id);
        }
        foreach ($product->get_gallery_image_ids() as $gallery_id) {
            $images[] = wp_get_attachment_url($gallery_id);
        }

        $brand_name = '';
        $brand_terms = get_the_terms($product_id, 'product_brand');
        if (!$brand_terms || is_wp_error($brand_terms)) {
            $brand_terms = get_the_terms($product_id, 'brand');
        }
        if ($brand_terms && !is_wp_error($brand_terms)) {
            $brand_name = $brand_terms[0]->name;
        }

        $sale_price = $product->get_sale_price();
        $offer = [
            '@type'         => 'Offer',
            'url'           => get_permalink($product_id),
            'priceCurrency' => get_woocommerce_currency(),
            'price'         => $sale_price ?: $product->get_regular_price(),
            'availability'  => $product->is_in_stock() ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            'itemCondition' => 'https://schema.org/NewCondition',
            'shippingDetails' => [
                '@type' => 'OfferShippingDetails',
                'shippingDestination' => ['@type' => 'DefinedRegion', 'addressCountry' => 'US'],
            ],
            'hasMerchantReturnPolicy' => [
                '@type' => 'MerchantReturnPolicy',
                'applicableCountry' => 'US',
                'returnPolicyCategory' => 'https://schema.org/MerchantReturnFiniteReturnWindow',
                'merchantReturnDays' => 30,
                'returnMethod' => 'https://schema.org/ReturnByMail',
                'returnFees' => 'https://schema.org/FreeReturn',
            ],
        ];

        $schema = [
            '@context'    => 'https://schema.org/',
            '@type'       => 'Product',
            'name'        => $product->get_name(),
            'description' => wp_strip_all_tags($product->get_description()) ?: wp_strip_all_tags($product->get_short_description()),
            'image'       => $images ?: null,
            'sku'         => $product->get_sku() ?: null,
            'gtin13'      => $product->get_meta('_barcode') ?: null,
            'brand'       => ['@type' => 'Brand', 'name' => $brand_name ?: get_bloginfo('name')],
            'offers'      => $offer,
        ];

        // AggregateRating ONLY from real review data — never fabricated
        if ($product->get_review_count() > 0) {
            $schema['aggregateRating'] = [
                '@type'       => 'AggregateRating',
                'ratingValue' => round($product->get_average_rating(), 1),
                'reviewCount' => $product->get_review_count(),
            ];
        }

        $schema = array_filter($schema, fn($v) => $v !== null);
        return $schema;
    }

    // ── Output helper ──

    private function print_json_ld(array $schema, string $type): void {
        if (empty($schema)) {
            return;
        }
        echo "\n<!-- ProdRank: {$type} Schema -->\n";
        echo '<script type="application/ld+json">' . "\n";
        echo wp_json_encode($schema, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
        echo '</script>' . "\n\n";
    }

    // ── Yoast / Rank Math compatibility ──

    public function compatibility_init(): void {
        // is_plugin_active() lives in wp-admin/includes/plugin.php, which is NOT
        // loaded on frontend requests — load it here to avoid fatal errors.
        if (!function_exists('is_plugin_active')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        // Multiple JSON-LD blocks per page is valid and recommended by Google;
        // our output coexists with Yoast/Rank Math without conflict.
    }
}

new ProdRank_Schema();
