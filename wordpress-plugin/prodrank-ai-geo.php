<?php
/**
 * Plugin Name:  ProdRank — Let AI discover and recommend your products.
 * Plugin URI:   https://prodrank.app
 * Description:  GEO (Generative Engine Optimization) for WooCommerce. AI content stored in post meta (never touches your original content), rendered via shortcodes/Gutenberg, JSON-LD Schema output server-side. Compatible with Yoast SEO and Rank Math.
 * Version:      0.2.0
 * Author:       ProdRank
 * Author URI:   https://prodrank.app
 * License:      GPL-2.0+
 * Text Domain:  prodrank-ai-geo
 * Requires PHP: 7.4
 * Requires at least: 6.0
 *
 * Content boundaries: docs/product-content-boundaries.md
 *   ✅ Allowed: description overwrite (opt-in at publish), page modules via
 *      shortcode/Gutenberg (post-meta rendered), JSON-LD via wp_head.
 *   ❌ Never: About/Blog/Homepage/Landing pages, collections, nav, theme
 *      source (CSS/HTML/PHP), images.
 */

if (!defined('ABSPATH')) {
    exit;
}

define('PRODRANK_VERSION', '0.2.0');
define('PRODRANK_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('PRODRANK_PLUGIN_URL', plugin_dir_url(__FILE__));

// Load modules
require_once PRODRANK_PLUGIN_DIR . 'includes/class-prodrank-content.php';
require_once PRODRANK_PLUGIN_DIR . 'includes/class-prodrank-schema.php';
require_once PRODRANK_PLUGIN_DIR . 'includes/class-prodrank-rest.php';
require_once PRODRANK_PLUGIN_DIR . 'includes/class-prodrank-sync.php';
require_once PRODRANK_PLUGIN_DIR . 'includes/class-prodrank-admin.php';

/**
 * Activation — require WooCommerce.
 */
function prodrank_activate(): void {
    if (!class_exists('WooCommerce')) {
        deactivate_plugins(plugin_basename(__FILE__));
        wp_die(
            'ProdRank requires WooCommerce to be installed and active. ' .
            '<a href="' . esc_url(admin_url('plugins.php')) . '">Go back to Plugins</a>'
        );
    }
    // Generate an API token for SaaS→plugin communication on first activation
    if (!get_option('prodrank_api_token')) {
        update_option('prodrank_api_token', wp_generate_password(32, false));
    }
    update_option('prodrank_version', PRODRANK_VERSION);
}
register_activation_hook(__FILE__, 'prodrank_activate');
