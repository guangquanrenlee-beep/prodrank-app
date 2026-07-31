/**
 * ProdRank AI Content — Gutenberg block (dynamic block, PHP render_callback).
 * Editor UI: field picker (FAQ / Pros / Cons / Comparison / Buying Guide /
 * AI Summary / Description). Rendering is server-side from post meta.
 *
 * Note: this file is the plain source; the plugin ships with the un-bundled
 * version so no build step is required. WordPress auto-registers it via
 * "editorScript" in block.json.
 */
(function (wp) {
  const { registerBlockType } = wp.blocks;
  const { InspectorControls } = wp.blockEditor;
  const { PanelBody, SelectControl } = wp.components;
  const { __ } = wp.i18n;
  const el = wp.element.createElement;

  const FIELDS = [
    { value: "description", label: __("AI Description", "prodrank-ai-seo") },
    { value: "ai_summary", label: __("AI Summary", "prodrank-ai-seo") },
    { value: "pros", label: __("Pros", "prodrank-ai-seo") },
    { value: "cons", label: __("Cons", "prodrank-ai-seo") },
    { value: "faq", label: __("FAQ", "prodrank-ai-seo") },
    { value: "comparison", label: __("Comparison", "prodrank-ai-seo") },
    { value: "use_cases", label: __("Use Cases", "prodrank-ai-seo") },
    { value: "buying_guide", label: __("Buying Guide", "prodrank-ai-seo") },
    { value: "specification", label: __("Specifications", "prodrank-ai-seo") },
  ];

  registerBlockType("prodrank/ai-content", {
    title: __("ProdRank AI Content", "prodrank-ai-seo"),
    icon: "format-quote",
    category: "embed",
    attributes: { field: { type: "string", default: "faq" } },
    edit: function (props) {
      const { attributes, setAttributes } = props;
      const field = FIELDS.find((f) => f.value === attributes.field);
      return el("div", { className: props.className },
        el("div", {
          style: {
            border: "1px dashed #0ea5e9",
            borderRadius: 6,
            padding: 12,
            color: "#334155",
            fontSize: 13,
          },
        }, "⚡ " + (field ? field.label : attributes.field) + " — " + __("rendered on the product page from ProdRank post meta", "prodrank-ai-seo")),
        el(InspectorControls, null,
          el(PanelBody, { title: __("ProdRank Settings", "prodrank-ai-seo") },
            el(SelectControl, {
              label: __("Section", "prodrank-ai-seo"),
              value: attributes.field,
              options: FIELDS,
              onChange: function (value) { setAttributes({ field: value }); },
            })
          )
        )
      );
    },
    save: function () {
      // Dynamic block — nothing saved; PHP render_callback outputs the HTML.
      return null;
    },
  });
})(window.wp);
