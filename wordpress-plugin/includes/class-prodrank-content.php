<?php
/**
 * ProdRank AI Content — post-meta storage + Shortcode rendering.
 *
 * ③ AI Content Storage: every AI field lives in post meta (`_prodrank_*`),
 * NEVER in post_content — so the merchant's original description is untouched
 * and the plugin can be removed without losing or corrupting store content.
 *
 * Content shapes mirror the Shopify Liquid contract
 * (extensions/schema-inject/blocks/ai-content.liquid):
 *   description:    {title, html}
 *   ai_summary:     {title, html}
 *   pros:           {title, items: []}
 *   faq:            {title, questions: [{question, answer}]}
 *   comparison:     {title, competitor, rows: [{ours, typical}]}
 *   use_cases:      {title, items: [{title, description}]}
 *   buying_guide:   {title, steps: [{title, detail}]}
 *   specification:  {title, items: [{name, value}]}
 *   schema:         complete JSON-LD (assembled by the SaaS, never LLM-fabricated)
 */

if (!defined('ABSPATH')) {
    exit;
}

class ProdRank_Content {

    const META_PREFIX = '_prodrank_';

    const FIELDS = [
        'description', 'faq', 'pros', 'comparison',
        'use_cases', 'buying_guide', 'specification', 'schema', 'ai_summary',
    ];

    const SHORTCODES = [
        'description'   => 'prodrank_description',
        'ai_summary'    => 'prodrank_ai_summary',
        'pros'          => 'prodrank_pros',
        'faq'           => 'prodrank_faq',
        'comparison'    => 'prodrank_comparison',
        'use_cases'     => 'prodrank_use_cases',
        'buying_guide'  => 'prodrank_buying_guide',
        'specification' => 'prodrank_specification',
    ];

    public function __construct() {
        add_action('init', [$this, 'register_shortcodes']);
        add_action('init', [$this, 'register_gutenberg_block']);
    }

    /**
     * Gutenberg dynamic block — register from block.json with a PHP
     * render_callback (no build step needed; editor UI ships un-bundled).
     */
    public function register_gutenberg_block(): void {
        register_block_type(PRODRANK_PLUGIN_DIR . 'assets/blocks/ai-content', [
            'render_callback' => function ($attributes) {
                $field = isset($attributes['field']) ? sanitize_key($attributes['field']) : 'faq';
                if (!in_array($field, self::FIELDS, true)) {
                    return '';
                }
                return $this->render_field($field);
            },
        ]);
    }

    public function register_shortcodes(): void {
        foreach (self::SHORTCODES as $field => $tag) {
            add_shortcode($tag, function ($atts, $content = null) use ($field) {
                return $this->render_field($field, $atts);
            });
        }
    }

    // ── Storage ──

    public static function meta_key(string $field): string {
        return self::META_PREFIX . $field;
    }

    public static function get_content(int $product_id, string $field) {
        return get_post_meta($product_id, self::meta_key($field), true);
    }

    /**
     * Save AI content with versioning + provenance.
     * Version history is stored in `_prodrank_{field}_history` so merchants can
     * roll back (⑦); the current version stays in `_prodrank_{field}`.
     *
     * @return int new version number
     */
    public static function save_content(int $product_id, string $field, $content,
                                        string $status = 'draft', array $provenance = []): int {
        $version = (int) get_post_meta($product_id, self::meta_key($field) . '_version', true);
        $version = $version ? $version + 1 : 1;

        update_post_meta($product_id, self::meta_key($field), $content);
        update_post_meta($product_id, self::meta_key($field) . '_version', $version);
        update_post_meta($product_id, self::meta_key($field) . '_status', $status);
        update_post_meta($product_id, self::meta_key($field) . '_provenance', $provenance);

        // Append to history (keep last 20 versions)
        $history = get_post_meta($product_id, self::meta_key($field) . '_history', true);
        if (!is_array($history)) {
            $history = [];
        }
        $history[] = [
            'version'   => $version,
            'status'    => $status,
            'content'   => $content,
            'provenance'=> $provenance,
            'saved_at'  => current_time('mysql'),
        ];
        $history = array_slice($history, -20);
        update_post_meta($product_id, self::meta_key($field) . '_history', $history);

        return $version;
    }

    public static function get_history(int $product_id, string $field): array {
        $history = get_post_meta($product_id, self::meta_key($field) . '_history', true);
        return is_array($history) ? $history : [];
    }

    public static function get_status(int $product_id, string $field): string {
        return (string) get_post_meta($product_id, self::meta_key($field) . '_status', true);
    }

    // ── Rendering rules (per-section show/hide) ──

    public static function rendering_rules(): array {
        $rules = get_option('prodrank_rendering_rules', []);
        return is_array($rules) ? $rules : [];
    }

    public static function section_enabled(string $field): bool {
        $rules = self::rendering_rules();
        if (isset($rules[$field])) {
            return (bool) $rules[$field];
        }
        // Defaults: consumer-facing blocks show; description and summary are
        // hidden unless the merchant opts in (description only replaces the
        // native one via explicit publish-time opt-in).
        $hidden = ['description', 'ai_summary'];
        return !in_array($field, $hidden, true);
    }

    // ── Rendering ──

    public function render_field(string $field, array $atts = []): string {
        global $post;
        if (!$post || !function_exists('is_product') || !is_product()) {
            return '';
        }
        if (!self::section_enabled($field)) {
            return '';
        }
        $content = self::get_content($post->ID, $field);
        if (empty($content)) {
            return '';
        }

        $method = 'render_' . $field;
        if (method_exists($this, $method)) {
            return $this->$method($content);
        }
        return '';
    }

    private function render_description($c): string {
        $html = isset($c['html']) ? $c['html'] : '';
        if (!$html) return '';
        $title = esc_html($c['title'] ?? __('Product Overview', 'prodrank-ai-seo'));
        return '<div class="prodrank-section" data-prodrank="description">'
            . '<h2>' . $title . '</h2>' . wp_kses_post($html) . '</div>';
    }

    private function render_ai_summary($c): string {
        return $this->render_description($c);
    }

    private function render_pros($c): string {
        $items = $c['items'] ?? [];
        if (!$items) return '';
        $title = esc_html($c['title'] ?? __('Pros', 'prodrank-ai-seo'));
        $lis = '';
        foreach ($items as $item) {
            $lis .= '<li>' . esc_html($item) . '</li>';
        }
        return '<div class="prodrank-section" data-prodrank="pros"><h2>' . $title . '</h2><ul>' . $lis . '</ul></div>';
    }

    private function render_faq($c): string {
        $questions = $c['questions'] ?? [];
        if (!$questions) return '';
        $title = esc_html($c['title'] ?? __('FAQ', 'prodrank-ai-seo'));
        $out = '<div class="prodrank-section" data-prodrank="faq"><h2>' . $title . '</h2>';
        foreach ($questions as $qa) {
            $q = esc_html($qa['question'] ?? '');
            $a = wp_kses_post($qa['answer'] ?? '');
            if ($q && $a) {
                $out .= '<details class="prodrank-faq-item"><summary>' . $q . '</summary><p>' . $a . '</p></details>';
            }
        }
        return $out . '</div>';
    }

    private function render_comparison($c): string {
        $rows = $c['rows'] ?? [];
        if (!$rows) return '';
        global $post;
        $title = esc_html($c['title'] ?? __('How it compares', 'prodrank-ai-seo'));
        $competitor = esc_html($c['competitor'] ?? __('Typical competitor', 'prodrank-ai-seo'));
        $product_name = $post ? esc_html(get_the_title($post)) : __('This product', 'prodrank-ai-seo');
        $out = '<div class="prodrank-section" data-prodrank="comparison"><h2>' . $title . '</h2>'
            . '<table class="prodrank-comparison"><thead><tr><th>' . $product_name . '</th><th>' . $competitor . '</th></tr></thead><tbody>';
        foreach ($rows as $row) {
            $out .= '<tr><td>' . wp_kses_post($row['ours'] ?? '') . '</td><td>' . wp_kses_post($row['typical'] ?? '') . '</td></tr>';
        }
        return $out . '</tbody></table></div>';
    }

    private function render_use_cases($c): string {
        $items = $c['items'] ?? [];
        if (!$items) return '';
        $title = esc_html($c['title'] ?? __('Use cases', 'prodrank-ai-seo'));
        $out = '<div class="prodrank-section" data-prodrank="use_cases"><h2>' . $title . '</h2>';
        foreach ($items as $uc) {
            $out .= '<div class="prodrank-use-case"><h3>' . esc_html($uc['title'] ?? '') . '</h3><p>' . wp_kses_post($uc['description'] ?? '') . '</p></div>';
        }
        return $out . '</div>';
    }

    private function render_buying_guide($c): string {
        $steps = $c['steps'] ?? [];
        if (!$steps) return '';
        $title = esc_html($c['title'] ?? __('Buying guide', 'prodrank-ai-seo'));
        $out = '<div class="prodrank-section" data-prodrank="buying_guide"><h2>' . $title . '</h2><ol>';
        foreach ($steps as $step) {
            $out .= '<li><strong>' . esc_html($step['title'] ?? '') . '</strong> — ' . wp_kses_post($step['detail'] ?? '') . '</li>';
        }
        return $out . '</ol></div>';
    }

    private function render_specification($c): string {
        $items = $c['items'] ?? [];
        if (!$items) return '';
        $title = esc_html($c['title'] ?? __('Specifications', 'prodrank-ai-seo'));
        $out = '<div class="prodrank-section" data-prodrank="specification"><h2>' . $title . '</h2><table class="prodrank-specs">';
        foreach ($items as $spec) {
            $out .= '<tr><th>' . esc_html($spec['name'] ?? '') . '</th><td>' . wp_kses_post($spec['value'] ?? '') . '</td></tr>';
        }
        return $out . '</table></div>';
    }
}

new ProdRank_Content();
