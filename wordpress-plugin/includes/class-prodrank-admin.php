<?php
/**
 * ProdRank Admin — settings page under WooCommerce → ProdRank SEO.
 *
 * Shows:
 *   - API token (SaaS→plugin REST communication, prodrank/v1)
 *   - Rendering Rules: show/hide each AI section (JSON-LD always outputs)
 *   - Schema coverage statistics
 *   - Products awaiting sync (⑧)
 */

if (!defined('ABSPATH')) {
    exit;
}

class ProdRank_Admin {

    const SECTIONS = [
        'description'   => 'AI Description',
        'ai_summary'    => 'AI Summary',
        'pros'          => 'Pros',
        'cons'          => 'Cons',
        'faq'           => 'FAQ',
        'comparison'    => 'Comparison',
        'use_cases'     => 'Use Cases',
        'buying_guide'  => 'Buying Guide',
        'specification' => 'Specifications',
    ];

    public function __construct() {
        add_action('admin_menu', [$this, 'admin_menu']);
        add_action('admin_init', [$this, 'register_settings']);
    }

    public function admin_menu(): void {
        add_submenu_page(
            'woocommerce',
            'ProdRank SEO — AI Agent Commerce',
            'ProdRank SEO',
            'manage_woocommerce',
            'prodrank-seo',
            [$this, 'admin_page']
        );
    }

    public function register_settings(): void {
        register_setting('prodrank_settings', 'prodrank_rendering_rules', [
            'type' => 'array',
            'default' => [],
            'sanitize_callback' => [$this, 'sanitize_rules'],
        ]);
    }

    public function sanitize_rules($value) {
        $clean = [];
        foreach (self::SECTIONS as $key => $label) {
            $clean[$key] = isset($value[$key]) && $value[$key] ? 1 : 0;
        }
        return $clean;
    }

    public function admin_page(): void {
        $rules = ProdRank_Content::rendering_rules();
        $token = get_option('prodrank_api_token', '');
        $pending = ProdRank_Sync::pending_count();
        ?>
        <div class="wrap">
            <h1>ProdRank — AI Agent Commerce SEO</h1>
            <p>Get ChatGPT, Gemini, Perplexity, and Claude to recommend your product.</p>

            <hr>

            <h2>🔌 SaaS Connection</h2>
            <table class="widefat striped" style="max-width:600px">
                <tr><td><strong>REST API Token</strong></td>
                    <td><code id="prodrank-token" style="user-select:all"><?php echo esc_html($token); ?></code>
                        <p class="description">Give this token to the ProdRank dashboard to connect your store (endpoints: <code>/wp-json/prodrank/v1/*</code>).</p>
                    </td></tr>
                <tr><td><strong>Products awaiting sync</strong></td>
                    <td><?php echo (int) $pending; ?> — changed products the SaaS will pick up on its next sync</td></tr>
            </table>

            <h2>🎛️ Rendering Rules</h2>
            <p class="description">Choose which AI sections show on product pages. Hidden sections stop rendering, but their JSON-LD Schema <strong>always outputs</strong> for AI engines.</p>
            <form method="post" action="options.php">
                <?php settings_fields('prodrank_settings'); ?>
                <table class="widefat striped" style="max-width:600px">
                    <?php foreach (self::SECTIONS as $key => $label): ?>
                        <tr>
                            <td><strong><?php echo esc_html($label); ?></strong></td>
                            <td>
                                <label>
                                    <input type="checkbox" name="prodrank_rendering_rules[<?php echo esc_attr($key); ?>]" value="1"
                                        <?php checked(ProdRank_Content::section_enabled($key)); ?> />
                                    Show on product page
                                </label>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </table>
                <p><button type="submit" class="button button-primary">Save Rendering Rules</button></p>
            </form>

            <hr>

            <h2>Schema Coverage</h2>
            <?php
            $product_count = 0;
            $schema_count  = 0;
            if (function_exists('wc_get_products')) {
                $products = wc_get_products(['limit' => -1, 'status' => 'publish', 'return' => 'ids']);
                $product_count = count($products);
                foreach ($products as $pid) {
                    $p = wc_get_product($pid);
                    if ($p && $p->get_sku()) {
                        $schema_count++;
                    }
                }
            }
            ?>
            <table class="widefat striped" style="max-width:600px">
                <tr><td><strong>Total Products</strong></td><td><?php echo esc_html($product_count); ?></td></tr>
                <tr><td><strong>Products with SKU (Schema-ready)</strong></td><td><?php echo esc_html($schema_count); ?></td></tr>
                <tr><td><strong>Schema Coverage</strong></td>
                    <td>
                        <?php if ($product_count > 0): ?>
                            <?php echo esc_html(round(($schema_count / $product_count) * 100)); ?>%
                            <?php if (($schema_count / $product_count) < 0.8): ?>
                                <span style="color:red">— Improve product completeness for better AI visibility</span>
                            <?php endif; ?>
                        <?php else: ?>
                            No products found.
                        <?php endif; ?>
                    </td></tr>
            </table>

            <hr>

            <h2>What ProdRank Outputs</h2>
            <ul style="list-style:disc; padding-left:2em;">
                <li>✅ Organization + WebSite Schema — site-wide brand info</li>
                <li>✅ Product Schema — full JSON-LD (SaaS-generated, falls back to live generation)</li>
                <li>✅ FAQPage Schema — from AI FAQ post meta</li>
                <li>✅ AI content via shortcodes: <code>[prodrank_faq]</code> <code>[prodrank_pros]</code> <code>[prodrank_cons]</code> <code>[prodrank_comparison]</code> <code>[prodrank_buying_guide]</code> <code>[prodrank_description]</code></li>
                <li>✅ All AI content stored in post meta — never touches your original content</li>
                <li>✅ Compatible with Yoast SEO and Rank Math</li>
            </ul>
        </div>
        <?php
    }
}

new ProdRank_Admin();
