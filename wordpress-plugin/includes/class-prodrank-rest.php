<?php
/**
 * ProdRank REST API — the SaaS talks to the plugin through these endpoints.
 *
 * Namespace: prodrank/v1
 * Auth:      header `X-ProdRank-Token` must match the plugin's API token
 *            (generated on activation, shown in the admin settings page).
 *
 * Endpoints:
 *   GET  /prodrank/v1/status                plugin health / versions
 *   GET  /prodrank/v1/products              sync source: product list (②)
 *   GET  /prodrank/v1/products/{id}         single product + AI content (⑨ verify)
 *   POST /prodrank/v1/publish               write AI content to post meta (⑥)
 *   POST /prodrank/v1/publish/rollback      restore a previous version (⑦)
 *   GET  /prodrank/v1/products/{id}/history version history (⑦)
 *
 * Content boundaries: docs/product-content-boundaries.md
 *   post_content is only touched when overwrite_description=true (opt-in).
 */

if (!defined('ABSPATH')) {
    exit;
}

class ProdRank_REST {

    const NS = 'prodrank/v1';

    public function __construct() {
        add_action('rest_api_init', [$this, 'register_routes']);
    }

    public function register_routes(): void {
        register_rest_route(self::NS, '/status', [
            'methods'  => 'GET',
            'callback' => [$this, 'status'],
            'permission_callback' => [$this, 'check_token'],
        ]);
        register_rest_route(self::NS, '/products', [
            'methods'  => 'GET',
            'callback' => [$this, 'products'],
            'permission_callback' => [$this, 'check_token'],
            'args' => [
                'limit'  => ['default' => 50, 'sanitize_callback' => 'absint'],
                'offset' => ['default' => 0, 'sanitize_callback' => 'absint'],
            ],
        ]);
        register_rest_route(self::NS, '/products/(?P<id>\d+)', [
            'methods'  => 'GET',
            'callback' => [$this, 'single_product'],
            'permission_callback' => [$this, 'check_token'],
        ]);
        register_rest_route(self::NS, '/products/(?P<id>\d+)/history', [
            'methods'  => 'GET',
            'callback' => [$this, 'history'],
            'permission_callback' => [$this, 'check_token'],
        ]);
        register_rest_route(self::NS, '/publish', [
            'methods'  => 'POST',
            'callback' => [$this, 'publish'],
            'permission_callback' => [$this, 'check_token'],
        ]);
        register_rest_route(self::NS, '/publish/rollback', [
            'methods'  => 'POST',
            'callback' => [$this, 'rollback'],
            'permission_callback' => [$this, 'check_token'],
        ]);
    }

    public function check_token(): bool {
        $token = get_option('prodrank_api_token', '');
        if (!$token) {
            return false;
        }
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        $sent = $headers['X-ProdRank-Token'] ?? ($_SERVER['HTTP_X_PRODRANK_TOKEN'] ?? '');
        return hash_equals($token, (string) $sent);
    }

    // ── Handlers ──

    public function status(): WP_REST_Response {
        return new WP_REST_Response([
            'status'  => 'ok',
            'plugin'  => PRODRANK_VERSION,
            'php'     => PHP_VERSION,
            'woocommerce' => class_exists('WooCommerce') ? WC()->version : null,
            'token_configured' => (bool) get_option('prodrank_api_token'),
        ]);
    }

    public function products(WP_REST_Request $request): WP_REST_Response {
        if (!function_exists('wc_get_products')) {
            return new WP_REST_Response(['error' => 'WooCommerce not active'], 400);
        }
        $limit  = $request->get_param('limit');
        $offset = $request->get_param('offset');
        $items = wc_get_products([
            'limit'   => $limit,
            'offset'  => $offset,
            'status'  => 'publish',
            'return'  => 'objects',
        ]);
        $out = [];
        foreach ($items as $p) {
            $out[] = [
                'id'    => $p->get_id(),
                'title' => $p->get_name(),
                'description' => wp_strip_all_tags($p->get_description()),
                'price' => $p->get_price(),
                'sku'   => $p->get_sku(),
                'brand' => $p->get_attribute('brand') ?: '',
                'type'  => $p->get_type(),
                'in_stock' => $p->is_in_stock(),
                'url'   => get_permalink($p->get_id()),
            ];
        }
        return new WP_REST_Response(['total' => count($out), 'products' => $out]);
    }

    public function single_product(WP_REST_Request $request): WP_REST_Response {
        $id = (int) $request->get_param('id');
        $p = wc_get_product($id);
        if (!$p) {
            return new WP_REST_Response(['error' => 'Product not found'], 404);
        }
        $ai = [];
        foreach (ProdRank_Content::FIELDS as $field) {
            $ai[$field] = ProdRank_Content::get_content($id, $field);
        }
        return new WP_REST_Response([
            'id'          => $id,
            'title'       => $p->get_name(),
            'description' => wp_strip_all_tags($p->get_description()),
            'price'       => $p->get_price(),
            'currency'    => get_woocommerce_currency(),
            'sku'         => $p->get_sku(),
            'brand'       => $p->get_attribute('brand') ?: '',
            'in_stock'    => $p->is_in_stock(),
            'review_count' => $p->get_review_count(),
            'rating'      => $p->get_average_rating() ?: 0,
            'ai_content'  => $ai,
        ]);
    }

    public function history(WP_REST_Request $request): WP_REST_Response {
        $id = (int) $request->get_param('id');
        $out = [];
        foreach (ProdRank_Content::FIELDS as $field) {
            $history = ProdRank_Content::get_history($id, $field);
            if ($history) {
                $out[$field] = $history;
            }
        }
        return new WP_REST_Response(['product_id' => $id, 'history' => $out]);
    }

    /**
     * ⑥ Publish — write AI content into post meta (versioned + provenance).
     * Body: {
     *   product_id: int,
     *   fields: { description: {...}, faq: {...}, ... },
     *   status: "draft"|"published",
     *   overwrite_description: bool,   // opt-in only — touches post_content
     *   provenance: { model, prompt_version, generated_at, ... }
     * }
     */
    public function publish(WP_REST_Request $request): WP_REST_Response {
        $id = (int) $request->get_param('product_id');
        $p = wc_get_product($id);
        if (!$p) {
            return new WP_REST_Response(['error' => 'Product not found'], 404);
        }
        $fields = (array) $request->get_param('fields');
        $status = (string) $request->get_param('status') ?: 'draft';
        $overwrite = (bool) $request->get_param('overwrite_description');
        $provenance = (array) $request->get_param('provenance') ?: [];

        $written = [];
        foreach ($fields as $field => $content) {
            if (!in_array($field, ProdRank_Content::FIELDS, true)) {
                continue;
            }
            $version = ProdRank_Content::save_content($id, $field, $content, $status, $provenance);
            $written[$field] = ['version' => $version, 'status' => $status];
        }

        // ⑥ publish rule: overwrite the original description ONLY on explicit opt-in
        $overwrote = false;
        if ($overwrite && isset($fields['description']['html'])) {
            $html = $fields['description']['html'];
            wp_update_post(['ID' => $id, 'post_content' => wp_kses_post($html)]);
            $overwrote = true;
        }

        return new WP_REST_Response([
            'status' => 'published',
            'product_id' => $id,
            'written' => $written,
            'overwrote_description' => $overwrote,
        ]);
    }

    /**
     * ⑦ Rollback — restore a previous version from history.
     * Body: { product_id: int, field: string, version: int, restore_body?: bool }
     */
    public function rollback(WP_REST_Request $request): WP_REST_Response {
        $id = (int) $request->get_param('product_id');
        $field = (string) $request->get_param('field');
        $version = (int) $request->get_param('version');
        $restore_body = (bool) $request->get_param('restore_body');

        if (!in_array($field, ProdRank_Content::FIELDS, true)) {
            return new WP_REST_Response(['error' => 'Invalid field'], 400);
        }
        $target = null;
        foreach (ProdRank_Content::get_history($id, $field) as $entry) {
            if ((int) $entry['version'] === $version) {
                $target = $entry;
                break;
            }
        }
        if (!$target) {
            return new WP_REST_Response(['error' => "Version {$version} not found for {$field}"], 404);
        }

        $new_version = ProdRank_Content::save_content(
            $id, $field, $target['content'], 'published',
            ['human_edited' => true, 'note' => "rolled back to v{$version}", 'restored_body' => $restore_body]
        );

        $restored_body = false;
        if ($field === 'description' && $restore_body && isset($target['content']['html'])) {
            wp_update_post(['ID' => $id, 'post_content' => wp_kses_post($target['content']['html'])]);
            $restored_body = true;
        }

        return new WP_REST_Response([
            'status' => 'rolled_back',
            'field' => $field,
            'restored_version' => $version,
            'new_version' => $new_version,
            'restored_body' => $restored_body,
        ]);
    }
}

new ProdRank_REST();
