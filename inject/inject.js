/**
 * ProdRank — Universal Schema Injection
 * v1.0 — One line, all platforms.
 *
 * Usage: <script async src="https://api.prodrank.app/api/inject.js" data-site="yoursite.com"></script>
 *
 * Auto-detects product pages, extracts data from DOM,
 * generates complete JSON-LD Product + FAQPage Schema,
 * and injects into <head>. Never duplicates existing Schema.
 */
(function () {
  "use strict";

  const SCRIPT = document.currentScript;
  const SITE = (SCRIPT && SCRIPT.dataset.site) || location.hostname;
  const API = (SCRIPT && SCRIPT.dataset.api) || "https://api.prodrank.app/api";
  const DEBUG = SCRIPT && SCRIPT.dataset.debug === "true";

  function log(...args) {
    if (DEBUG) console.log("[ProdRank]", ...args);
  }

  // ═══ 1. Detect if this is a product page ═══

  function isProductPage() {
    const path = location.pathname.toLowerCase();
    const patterns = [
      "/product/", "/products/", "/item/", "/p/", "/shop/", "/goods/",
      "/catalog/", "/store/", "/collection/", "/detail/", "/listing/",
    ];
    if (patterns.some((p) => path.includes(p))) return true;

    // Check for product-specific meta tags (Open Graph product)
    if (document.querySelector('meta[property="og:type"][content="product"]')) return true;
    if (document.querySelector('meta[property="product:price:amount"]')) return true;

    // Has price element + not a category page (multiple products)
    const priceEls = document.querySelectorAll(
      '[class*="price"], [id*="price"], [data-price], [itemprop="price"], .product-price, .single-price'
    );
    const productCards = document.querySelectorAll(
      '[class*="product-card"], [class*="product-item"], .product, [data-product-id]'
    );
    // If there's exactly 1 price and not many product cards, it's a product page
    if (priceEls.length > 0 && productCards.length <= 1) return true;

    return false;
  }

  // ═══ 2. Extract product data from DOM ═══

  function extractProductData() {
    const data = {
      name: "",
      description: "",
      price: "",
      currency: "USD",
      images: [],
      sku: "",
      brand: "",
      availability: "https://schema.org/InStock",
      aggregateRating: null,
      reviewCount: 0,
    };

    // Name: <title>, og:title, h1
    data.name =
      document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content") ||
      document.querySelector("h1")?.textContent?.trim() ||
      document.title ||
      "";

    // Description: meta[name=description], og:description
    data.description =
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content") ||
      document
        .querySelector('meta[property="og:description"]')
        ?.getAttribute("content") ||
      (document.querySelector("h1 + p")?.textContent?.trim() || "").substring(
        0,
        500
      );

    // Price: product:price:amount, og:price:amount, .price, [itemprop=price]
    const priceSelectors = [
      'meta[property="product:price:amount"]',
      'meta[property="og:price:amount"]',
      '[itemprop="price"]',
      '[data-price]',
      '.price [class*="amount"]',
      '[class*="product-price"]',
      '[class*="price"] [class*="current"]',
    ];
    for (const sel of priceSelectors) {
      const el = document.querySelector(sel);
      let raw = el?.getAttribute("content") || el?.textContent?.trim() || "";
      raw = raw.replace(/[^0-9.,]/g, "").replace(",", ".");
      const price = parseFloat(raw);
      if (price && price > 0) {
        data.price = String(price);
        break;
      }
    }

    // Currency
    data.currency =
      document
        .querySelector('meta[property="product:price:currency"]')
        ?.getAttribute("content") ||
      document
        .querySelector('meta[property="og:price:currency"]')
        ?.getAttribute("content") ||
      "USD";

    // Images: og:image, swatch images, product gallery
    const ogImages = document.querySelectorAll(
      'meta[property="og:image"]'
    );
    ogImages.forEach((img) => {
      const src = img.getAttribute("content");
      if (src) data.images.push(src);
    });
    if (data.images.length === 0) {
      document
        .querySelectorAll(
          '[class*="product"] img, [class*="gallery"] img, [class*="carousel"] img, [data-zoom] img'
        )
        .forEach((img) => {
          if (img.src && !img.src.includes("icon") && !img.src.includes("logo")) {
            data.images.push(img.src);
          }
        });
    }

    // SKU: data-sku, meta, text
    const skuEl =
      document.querySelector("[data-sku]") ||
      document.querySelector("[itemprop=sku]") ||
      document.querySelector("meta[property='product:retailer_item_id']");
    data.sku =
      skuEl?.getAttribute("content") ||
      skuEl?.getAttribute("data-sku") ||
      skuEl?.textContent?.trim() ||
      "";

    // Brand: structured data, og:brand, site name, vendor
    data.brand =
      document
        .querySelector('meta[property="og:brand"]')
        ?.getAttribute("content") ||
      document
        .querySelector('script[type="application/ld+json"]')
        ?.textContent?.match(/"brand"\s*:\s*"([^"]+)"/)?.[1] ||
      SITE.replace("www.", "").split(".")[0];

    // Availability: check for "out of stock" text
    const outOfStock =
      document.body.textContent?.toLowerCase().includes("out of stock") ||
      document.body.textContent?.toLowerCase().includes("sold out") ||
      document.querySelector('[class*="sold-out"]') ||
      document.querySelector('[class*="out-of-stock"]');
    data.availability = outOfStock
      ? "https://schema.org/OutOfStock"
      : "https://schema.org/InStock";

    // Ratings
    const ratingEl =
      document.querySelector("[itemprop=aggregateRating]") ||
      document.querySelector('[class*="rating"] [class*="score"]') ||
      document.querySelector('[data-rating]');
    if (ratingEl) {
      const ratingValue = parseFloat(
        ratingEl.getAttribute("data-rating") ||
          ratingEl.textContent?.match(/([\d.]+)/)?.[1] ||
          ""
      );
      if (ratingValue) data.aggregateRating = ratingValue;

      const reviewCount = parseInt(
        ratingEl.getAttribute("data-review-count") ||
          ratingEl.textContent?.match(/(\d+)\s*reviews?/)?.[1] ||
          "0"
      );
      if (reviewCount) data.reviewCount = reviewCount;
    }

    log("Extracted:", data);
    return data;
  }

  // ═══ 3. Generate JSON-LD Schema ═══

  function generateProductSchema(data) {
    const schema = {
      "@context": "https://schema.org/",
      "@type": "Product",
      name: data.name || document.title,
      description: data.description || "",
      image: data.images.slice(0, 5),
      sku: data.sku || undefined,
      brand: {
        "@type": "Brand",
        name: data.brand || SITE,
      },
      offers: {
        "@type": "Offer",
        url: location.href,
        priceCurrency: data.currency,
        price: data.price || "0",
        availability: data.availability,
        itemCondition: "https://schema.org/NewCondition",
        shippingDetails: {
          "@type": "OfferShippingDetails",
          shippingDestination: {
            "@type": "DefinedRegion",
            addressCountry: "US",
          },
        },
      },
    };

    if (data.aggregateRating) {
      schema.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: String(data.aggregateRating),
        reviewCount: String(data.reviewCount || 1),
      };
    }

    // Clean undefined values
    Object.keys(schema).forEach((k) => {
      if (schema[k] === undefined) delete schema[k];
    });

    return schema;
  }

  function generateFAQSchema(data) {
    const questions = [
      { q: `What is the return policy for ${data.name || "this product"}?`, a: "Please visit our Returns & Refunds page for the complete return policy and instructions." },
      { q: "How long does shipping take?", a: "Shipping times vary by destination. Standard delivery typically takes 5-10 business days within the US. International orders may take longer." },
      { q: `Is ${data.name || "this product"} available in other sizes or colors?`, a: "Please check our store for all available variants, including sizes, colors, and styles." },
      { q: "How do I contact customer support?", a: "You can reach our support team via our Contact page. We typically respond within 24 hours." },
      { q: `What size should I order?`, a: "Refer to our size chart on the product page for the best fit." },
    ];
    return { "@context": "https://schema.org/", "@type": "FAQPage", mainEntity: questions.map(q=>({ "@type":"Question","name":q.q,"acceptedAnswer":{"@type":"Answer","text":q.a} })) };
  }

  function generateOrganizationSchema() {
    return { "@context": "https://schema.org/", "@type": "Organization", name: SITE, url: location.origin };
  }

  // ═══ 4. Inject into <head> ═══
  function injectSchema(schema, id) {
    if (!schema) return;
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    const script = document.createElement("script");
    script.id = id; script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
    log(`Injected: ${id}`);
  }

  function hasExistingProductSchema() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try { const data=JSON.parse(s.textContent); const type=data["@type"]||(Array.isArray(data)&&data[0]?.["@type"]); if(type==="Product"||(Array.isArray(data)&&data.some(d=>d["@type"]==="Product")))return true; } catch(e){}
    }
    return false;
  }

  function sendAuditPing(data) {
    try {
      navigator.sendBeacon(API + "/ping", JSON.stringify({ site:SITE, url:location.href, has_schema:hasExistingProductSchema(), product_name:data.name, price:data.price, timestamp:new Date().toISOString() }));
    } catch(e){}
  }

  // ═══ AI Enhancement ═══
  async function fetchEnhancements(data) {
    try {
      const pageText = (document.body?.textContent || "").slice(0, 2000);
      const res = await fetch(API + "/inject/enhance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: SITE, url: location.href, product_name: data.name, description: data.description,
          price: data.price, currency: data.currency, images: data.images.slice(0,3),
          sku: data.sku, brand: data.brand, availability: data.availability,
          rating: data.aggregateRating || null, review_count: data.reviewCount || 0, page_text: pageText,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.status === "enhanced" && result.schemas) return result.schemas;
      }
    } catch(e) { log("AI enhancement skipped:", e.message); }
    return null;
  }

  // ═══ Main ═══
  async function main() {
    if (!isProductPage()) { log("Not a product page"); return; }

    const data = extractProductData();

    if (hasExistingProductSchema()) {
      log("Existing Schema found, skipping. Sending ping...");
      sendAuditPing(data);
      return;
    }

    log("Product page detected. Extracting data...");

    // Try AI enhancement first
    const enhanced = await fetchEnhancements(data);

    if (enhanced) {
      log("AI-enhanced schemas received!");
      injectSchema(enhanced.organization, "prodrank-org");
      injectSchema(enhanced.product, "prodrank-product");
      injectSchema(enhanced.faq, "prodrank-faq");
      injectSchema(enhanced.brand, "prodrank-brand");
    } else {
      log("Using basic auto-generated schemas");
      injectSchema(generateOrganizationSchema(), "prodrank-org");
      injectSchema(generateProductSchema(data), "prodrank-product");
      injectSchema(generateFAQSchema(data), "prodrank-faq");
    }

    sendAuditPing(data);
    log("Done!");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
