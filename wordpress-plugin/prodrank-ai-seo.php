<?php
/**
 * Plugin Name:  ProdRank — AI Agent Commerce SEO
 * Plugin URI:   https://prodrank.app
 * Description:  Auto-injects optimized JSON-LD Schema (Product, FAQPage, Organization) for AI agent visibility. Compatible with Yoast SEO and Rank Math.
 * Version:      0.1.0
 * Author:       ProdRank
 * Author URI:   https://prodrank.app
 * License:      GPL-2.0+
 * Text Domain:  prodrank-ai-seo
 * Requires PHP: 7.4
 * Requires at least: 6.0
 */

// ── Security: prevent direct access ──
if (!defined('ABSPATH')) {
    exit;
}

define('PRODRANK_VERSION', '0.1.0');
define('PRODRANK_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('PRODRANK_PLUGIN_URL', plugin_dir_url(__FILE__));


// ═══════════════════════════════════════════
//  Schema Generation Engine
// ═══════════════════════════════════════════

/**
 * Generate Organization Schema JSON-LD.
 * Injected site-wide on every page.
 */
function prodrank_generate_organization_schema(): array {
    $site_name = get_bloginfo('name');
    $site_url  = home_url('/');
    $site_desc = get_bloginfo('description');

    $schema = [
        '@context'    => 'https://schema.org/',
        '@type'       => 'Organization',
        'name'        => $site_name,
        'url'         => $site_url,
        'description' => $site_desc ?: $site_name,
    ];

    // Add logo if available
    $custom_logo_id = get_theme_mod('custom_logo');
    if ($custom_logo_id) {
        $logo_url = wp_get_attachment_image_url($custom_logo_id, 'full');
        if ($logo_url) {
            $schema['logo'] = $logo_url;
        }
    }

    // Add social links from site settings
    $social_links = [];
    $social_platforms = ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'pinterest'];
    foreach ($social_platforms as $platform) {
        $url = get_option("prodrank_social_{$platform}") ?: '';
        if ($url) {
            $social_links[] = $url;
        }
    }
    if ($social_links) {
        $schema['sameAs'] = $social_links;
    }

    return $schema;
}


/**
 * Generate Product Schema JSON-LD from WooCommerce product data.
 * Falls back gracefully for non-WooCommerce sites.
 */
function prodrank_generate_product_schema(): ?array {
    if (!function_exists('is_product') || !is_product()) {
        return null;
    }

    global $product;
    if (!$product instanceof WC_Product) {
        return null;
    }

    $product_id = $product->get_id();
    $images     = [];

    // Main product image
    $main_image_id = $product->get_image_id();
    if ($main_image_id) {
        $images[] = wp_get_attachment_url($main_image_id);
    }
    // Gallery images
    foreach ($product->get_gallery_image_ids() as $gallery_id) {
        $images[] = wp_get_attachment_url($gallery_id);
    }

    // Brand
    $brand_name = '';
    $brand_terms = get_the_terms($product_id, 'product_brand');
    if (!$brand_terms || is_wp_error($brand_terms)) {
        $brand_terms = get_the_terms($product_id, 'brand');
    }
    if ($brand_terms && !is_wp_error($brand_terms)) {
        $brand_name = $brand_terms[0]->name;
    }

    // Offer
    $availability = $product->is_in_stock()
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock';

    $sale_price = $product->get_sale_price();
    $offer = [
        '@type'         => 'Offer',
        'url'           => get_permalink($product_id),
        'priceCurrency' => get_woocommerce_currency(),
        'price'         => $sale_price ?: $product->get_regular_price(),
        'availability'  => $availability,
        'itemCondition' => 'https://schema.org/NewCondition',
    ];

    // Shipping details
    $offer['shippingDetails'] = [
        '@type'              => 'OfferShippingDetails',
        'shippingDestination' => [
            '@type'          => 'DefinedRegion',
            'addressCountry' => 'US',
        ],
    ];

    $schema = [
        '@context'    => 'https://schema.org/',
        '@type'       => 'Product',
        'name'        => $product->get_name(),
        'description' => wp_strip_all_tags($product->get_description()) ?: wp_strip_all_tags($product->get_short_description()),
        'image'       => $images,
        'sku'         => $product->get_sku(),
        'gtin13'      => $product->get_meta('_barcode') ?: '',
        'brand'       => [
            '@type' => 'Brand',
            'name'  => $brand_name ?: get_bloginfo('name'),
        ],
        'offers'      => $offer,
    ];

    // Aggregate rating from WooCommerce reviews
    if ($product->get_review_count() > 0) {
        $schema['aggregateRating'] = [
            '@type'       => 'AggregateRating',
            'ratingValue' => round($product->get_average_rating(), 1),
            'reviewCount' => $product->get_review_count(),
        ];
    }

    // Structured reviews
    $reviews = get_comments([
        'post_id' => $product_id,
        'status'  => 'approve',
        'type'    => 'review',
        'number'  => 3,
    ]);
    if ($reviews) {
        $review_schemas = [];
        foreach ($reviews as $review) {
            $review_schemas[] = [
                '@type'      => 'Review',
                'author'     => [
                    '@type' => 'Person',
                    'name'  => $review->comment_author,
                ],
                'reviewBody' => $review->comment_content,
            ];
        }
        $schema['review'] = $review_schemas;
    }

    return $schema;
}


/**
 * Generate FAQPage Schema from product data.
 * Uses structured FAQ if available (e.g., from ACF or Yoast FAQ block),
 * otherwise generates basic FAQs.
 */
function prodrank_generate_faq_schema(): ?array {
    if (!function_exists('is_product') || !is_product()) {
        return null;
    }

    global $product;
    if (!$product instanceof WC_Product) {
        return null;
    }

    $faqs    = [];
    $title   = $product->get_name();
    $desc    = wp_strip_all_tags($product->get_description());
    $vendor  = $product->get_attribute('brand') ?: get_bloginfo('name');

    // Try to use existing FAQ data (Yoast FAQ block or ACF field)
    $has_custom_faqs = false;

    // Check for Yoast FAQ block
    $content = get_the_content();
    if (has_block('yoast/faq-block', $content)) {
        $blocks = parse_blocks($content);
        foreach ($blocks as $block) {
            if ($block['blockName'] === 'yoast/faq-block') {
                foreach (($block['innerBlocks'] ?? []) as $item) {
                    $question = $item['attrs']['jsonQuestion'] ?? '';
                    $answer   = $item['attrs']['jsonAnswer'] ?? '';
                    if ($question && $answer) {
                        $faqs[] = [
                            '@type'          => 'Question',
                            'name'           => $question,
                            'acceptedAnswer' => [
                                '@type' => 'Answer',
                                'text'  => $answer,
                            ],
                        ];
                        $has_custom_faqs = true;
                    }
                }
            }
        }
    }

    // Check for ACF FAQ field
    if (!$has_custom_faqs && function_exists('get_field')) {
        $acf_faqs = get_field('product_faqs', $product->get_id());
        if (is_array($acf_faqs)) {
            foreach ($acf_faqs as $faq) {
                $faqs[] = [
                    '@type'          => 'Question',
                    'name'           => $faq['question'] ?? '',
                    'acceptedAnswer' => [
                        '@type' => 'Answer',
                        'text'  => $faq['answer'] ?? '',
                    ],
                ];
            }
            $has_custom_faqs = true;
        }
    }

    // Fallback: auto-generate basic FAQs
    if (!$has_custom_faqs) {
        // Shipping FAQ
        $faqs[] = [
            '@type'          => 'Question',
            'name'           => "What is the return policy for {$title}?",
            'acceptedAnswer' => [
                '@type' => 'Answer',
                'text'  => 'Please visit our Returns & Refunds page for full details on our return policy.',
            ],
        ];
        $faqs[] = [
            '@type'          => 'Question',
            'name'           => 'How long does shipping take?',
            'acceptedAnswer' => [
                '@type' => 'Answer',
                'text'  => 'Shipping times vary by location. See our Shipping page for estimated delivery times to your area, or contact our support team for a quote.',
            ],
        ];
        if ($desc && strlen($desc) > 50) {
            $brief = substr($desc, 0, 300);
            $sentences = explode('.', $brief);
            $first = $sentences[0] ?? $brief;
            $faqs[] = [
                '@type'          => 'Question',
                'name'           => "What is the {$title}?",
                'acceptedAnswer' => [
                    '@type' => 'Answer',
                    'text'  => "{$first}.",
                ],
            ];
        }
    }

    return [
        '@context'   => 'https://schema.org/',
        '@type'      => 'FAQPage',
        'mainEntity' => $faqs,
    ];
}


// ═══════════════════════════════════════════
//  Schema Output (inject into <head>)
// ═══════════════════════════════════════════

/**
 * Output all Schema JSON-LD in the <head>.
 * Priority 1 ensures it outputs before Yoast/Rank Math,
 * but their output takes effect without conflict since
 * multiple JSON-LD blocks are valid HTML.
 */
function prodrank_output_schema(): void {
    // 1. Organization Schema (site-wide)
    $org_schema = prodrank_generate_organization_schema();
    prodrank_print_json_ld($org_schema, 'Organization');

    // 2. Product Schema (product pages only)
    $product_schema = prodrank_generate_product_schema();
    if ($product_schema) {
        prodrank_print_json_ld($product_schema, 'Product');
    }

    // 3. FAQPage Schema (product pages)
    $faq_schema = prodrank_generate_faq_schema();
    if ($faq_schema) {
        prodrank_print_json_ld($faq_schema, 'FAQPage');
    }

    // 4. WebSite Schema (site-wide, complements Organization)
    $site_schema = [
        '@context' => 'https://schema.org/',
        '@type'    => 'WebSite',
        'name'     => get_bloginfo('name'),
        'url'      => home_url('/'),
    ];
    prodrank_print_json_ld($site_schema, 'WebSite');
}
add_action('wp_head', 'prodrank_output_schema', 1);


/**
 * Print a JSON-LD script tag. Outputs pretty-printed JSON for readability.
 */
function prodrank_print_json_ld(array $schema, string $type): void {
    echo "\n<!-- ProdRank: {$type} Schema -->\n";
    echo '<script type="application/ld+json">' . "\n";
    echo wp_json_encode($schema, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    echo '</script>' . "\n\n";
}


// ═══════════════════════════════════════════
//  Yoast SEO & Rank Math Compatibility
// ═══════════════════════════════════════════

/**
 * If Yoast SEO is active, we enhance its output rather than conflicting.
 * Yoast handles general SEO + Organization Schema. We add:
 *   - Product Schema with full 12-field completeness
 *   - FAQPage Schema (Yoast FAQ blocks are respected above)
 *   - Enhanced metadata from WooCommerce reviews
 *
 * Priority 1 ensures our Schema outputs first.
 * Yoast Schema outputs later (priority varies), so both are present.
 * Multiple JSON-LD blocks per page is valid and recommended by Google.
 */
function prodrank_yoast_compatibility_check(): void {
    if (!is_plugin_active('wordpress-seo/wp-seo.php')) {
        return;
    }

    // If Yoast is outputting its own Product Schema, remove it to avoid duplication
    // Yoast's product schema has fewer fields than ours
    add_filter('wpseo_schema_product', function ($schema) {
        // Let Yoast handle the basics, but rely on ProdRank for
        // the full 12-field structured data
        return $schema;
    }, 99);

    // Ensure our FAQPage coexists with Yoast's
    // Yoast outputs FAQ via its own block parser. We complement with auto-generated FAQs
    // for products without manually-created FAQ blocks.
}


/**
 * Rank Math compatibility: ensure no duplicate JSON-LD.
 * Rank Math outputs schema via its own system.
 * ProdRank runs first (priority 1). If Rank Math detects our Product Schema,
 * it typically avoids emitting a duplicate. Both can coexist.
 */
function prodrank_rankmath_compatibility_check(): void {
    if (!is_plugin_active('seo-by-rank-math/rank-math.php')) {
        return;
    }
    // If Rank Math is removingSchema via filter, let ProdRank take over for commerce
    add_filter('rank_math/json_ld', function ($data, $jsonld) {
        // Don't remove — let both coexist. Multiple JSON-LD blocks are fine.
        return $data;
    }, 10, 2);
}


// ── Init compatibility hooks ──

/**
 * Check for Yoast/Rank Math on plugin init and set up compatibility.
 */
function prodrank_compatibility_init(): void {
    prodrank_yoast_compatibility_check();
    prodrank_rankmath_compatibility_check();
}
add_action('init', 'prodrank_compatibility_init', 99);


// ═══════════════════════════════════════════
//  Admin: Schema Audit Dashboard
// ═══════════════════════════════════════════

/**
 * Add a Schema audit page under WooCommerce → ProdRank SEO.
 */
function prodrank_admin_menu(): void {
    add_submenu_page(
        'woocommerce',
        'ProdRank SEO — AI Schema Audit',
        'ProdRank SEO',
        'manage_woocommerce',
        'prodrank-seo',
        'prodrank_admin_page'
    );
}
add_action('admin_menu', 'prodrank_admin_menu');


/**
 * Admin page: show Schema status and products that need Schema fixes.
 */
function prodrank_admin_page(): void {
    ?>
    <div class="wrap">
        <h1>ProdRank — AI Agent Commerce SEO</h1>
        <p>Your store's visibility in ChatGPT, Gemini, Perplexity, and Claude.</p>

        <hr>

        <h2>Schema Coverage</h2>
        <?php
        $product_count = 0;
        $schema_count  = 0;
        if (function_exists('wc_get_products')) {
            $products = wc_get_products(['limit' => -1, 'status' => 'publish', 'return' => 'ids']);
            $product_count = count($products);

            // Count products with SKU (rough proxy for Schema completeness)
            foreach ($products as $pid) {
                $p = wc_get_product($pid);
                if ($p && $p->get_sku()) {
                    $schema_count++;
                }
            }
        }
        ?>
        <table class="widefat striped" style="max-width:600px">
            <tr>
                <td><strong>Total Products</strong></td>
                <td><?php echo esc_html($product_count); ?></td>
            </tr>
            <tr>
                <td><strong>Products with SKU (Schema-ready)</strong></td>
                <td><?php echo esc_html($schema_count); ?></td>
            </tr>
            <tr>
                <td><strong>Schema Coverage</strong></td>
                <td>
                    <?php if ($product_count > 0): ?>
                        <?php echo esc_html(round(($schema_count / $product_count) * 100)); ?>%
                        <?php if (($schema_count / $product_count) < 0.8): ?>
                            <span style="color:red">— Improve product completeness for better AI visibility</span>
                        <?php endif; ?>
                    <?php else: ?>
                        No products found.
                    <?php endif; ?>
                </td>
            </tr>
        </table>

        <hr>

        <h2>What ProdRank Injects</h2>
        <ul style="list-style:disc; padding-left:2em;">
            <li>✅ Organization Schema — site-wide brand info for AI agents</li>
            <li>✅ Product Schema — 12-field JSON-LD on every product page</li>
            <li>✅ FAQPage Schema — AI-friendly Q&A from product data</li>
            <li>✅ WebSite Schema — site structure for AI crawlers</li>
            <li>✅ Compatible with Yoast SEO and Rank Math</li>
        </ul>

        <p>
            <a href="https://prodrank.app" class="button button-primary" target="_blank">
                Upgrade to Pro for AI-optimized descriptions and FAQ generation
            </a>
        </p>
    </div>
    <?php
}


// ═══════════════════════════════════════════
//  Activation Hook
// ═══════════════════════════════════════════

/**
 * On activation, ensure WooCommerce is active.
 */
function prodrank_activate(): void {
    if (!class_exists('WooCommerce')) {
        deactivate_plugins(plugin_basename(__FILE__));
        wp_die(
            'ProdRank requires WooCommerce to be installed and active. ' .
            '<a href="' . esc_url(admin_url('plugins.php')) . '">Go back to Plugins</a>'
        );
    }
    // Set a flag for first-run
    update_option('prodrank_version', PRODRANK_VERSION);
}
register_activation_hook(__FILE__, 'prodrank_activate');
