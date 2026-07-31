<?php
/**
 * ProdRank Sync — listen to WooCommerce events and mark products for re-sync.
 *
 * ⑧ WooCommerce equivalent of the Shopify webhook listener:
 *   product updated / created  → mark `_prodrank_sync_pending`
 *   review added               → mark `_prodrank_sync_pending` (rating changed)
 * The SaaS picks these up on its next sync (GET /prodrank/v1/products), so no
 * outbound connection is strictly required. Marked products are surfaced in
 * the admin page.
 */

if (!defined('ABSPATH')) {
    exit;
}

class ProdRank_Sync {

    public function __construct() {
        add_action('save_post_product', [$this, 'mark_pending'], 10, 3);
        add_action('woocommerce_new_review', [$this, 'mark_pending_for_review'], 10, 1);
        add_action('woocommerce_updated_product', [$this, 'mark_pending_for_id'], 10, 1);
    }

    /**
     * @param int     $post_id
     * @param WP_Post $post
     * @param bool    $update
     */
    public function mark_pending(int $post_id, $post, bool $update): void {
        if (!$post || $post->post_type !== 'product') {
            return;
        }
        $this->mark($post_id);
    }

    public function mark_pending_for_id(int $product_id): void {
        $this->mark($product_id);
    }

    public function mark_pending_for_review(int $comment_id): void {
        $post_id = get_comment_meta($comment_id, 'rating', true);
        if ($post_id) {
            $this->mark((int) get_comment($comment_id)->comment_post_ID);
        }
    }

    private function mark(int $product_id): void {
        update_post_meta($product_id, '_prodrank_sync_pending', (int) current_time('timestamp'));
        update_post_meta($product_id, '_prodrank_sync_reason', 'product_changed');
    }

    public static function pending_count(): int {
        global $wpdb;
        return (int) $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE meta_key = '_prodrank_sync_pending'"
        );
    }
}

new ProdRank_Sync();
