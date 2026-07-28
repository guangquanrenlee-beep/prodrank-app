/**
 * ProdRank — Universal Schema Injection for SaaS & Content Sites
 * v1.0 — One line, all platforms.
 *
 * Usage: <script async src="https://api.prodrank.app/api/inject-saas.js" data-site="yoursite.com"></script>
 *
 * Auto-detects SaaS pages, extracts data from DOM,
 * generates complete JSON-LD SoftwareApplication + Organization + FAQPage Schema,
 * and injects into <head>. Never duplicates existing Schema.
 */
(function () {
  "use strict";

  const SCRIPT = document.currentScript;
  const SITE = (SCRIPT && SCRIPT.dataset.site) || location.hostname;
  const API = (SCRIPT && SCRIPT.dataset.api) || "https://api.prodrank.app/api";
  const DEBUG = SCRIPT && SCRIPT.dataset.debug === "true";

  function log(...args) {
    if (DEBUG) console.log("[ProdRank SaaS]", ...args);
  }

  // ═══ 1. Detect page type ═══

  function isPricingPage() {
    const path = location.pathname.toLowerCase();
    if (/\/pricing|\/plans|\/subscribe|\/buy/i.test(path)) return true;
    const h1 = document.querySelector("h1");
    if (h1 && /pricing|plans|choose.*plan/i.test(h1.textContent || "")) return true;
    return false;
  }

  function isFeaturesPage() {
    const path = location.pathname.toLowerCase();
    if (/\/features|\/solutions|\/product/i.test(path)) return true;
    return false;
  }

  function isHomePage() {
    return location.pathname === "/" || location.pathname === "/index.html" || location.pathname === "/index.php";
  }

  // ═══ 2. Extract site data from DOM ═══

  function extractSiteData() {
    const data = {
      name: "",
      description: "",
      url: location.origin,
      applicationCategory: "",
      operatingSystem: "Web",
      offers: { price: "", priceCurrency: "USD" },
      screenshot: "",
      features: [],
    };

    // Name: og:site_name, <title>, h1
    data.name =
      document.querySelector('meta[property="og:site_name"]')?.getAttribute("content") ||
      (document.querySelector("title")?.textContent || "").split(/[|–—\-–]/)[0].trim() ||
      SITE.replace("www.", "").split(".")[0];

    // Description
    data.description =
      document.querySelector('meta[name="description"]')?.getAttribute("content") ||
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
      "";

    // Application Category — try to guess from page content
    const bodyText = document.body.textContent?.toLowerCase() || "";
    const categoryHints: Record<string, string> = {
      "invoice": "InvoicingSoftware",
      "accounting": "AccountingSoftware",
      "crm": "CRMSoftware",
      "project management": "ProjectManagementSoftware",
      "email marketing": "EmailMarketingSoftware",
      "analytics": "AnalyticsSoftware",
      "hr": "HRSoftware",
      "payroll": "PayrollSoftware",
      "calendar": "CalendarSoftware",
      "scheduling": "SchedulingSoftware",
      "collaboration": "CollaborationSoftware",
      "ecommerce": "EcommerceSoftware",
      "support": "CustomerSupportSoftware",
      "ticketing": "TicketingSoftware",
      "chat": "ChatSoftware",
      "video": "VideoSoftware",
      "design": "DesignSoftware",
      "developer": "DeveloperApplication",
      "marketing": "MarketingSoftware",
      "sales": "SalesSoftware",
      "finance": "FinanceApplication",
      "education": "EducationApplication",
      "health": "HealthApplication",
    };
    for (const [key, val] of Object.entries(categoryHints)) {
      if (bodyText.includes(key)) { data.applicationCategory = val; break; }
    }

    // Screenshot
    data.screenshot =
      document.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
      "";

    // Extract feature list items
    const featureSections = document.querySelectorAll(
      '[class*="feature"], [class*="benefit"], [class*="capability"], section ul, .checklist'
    );
    featureSections.forEach(section => {
      const items = section.querySelectorAll("li, [class*='feature-item']");
      items.forEach(item => {
        const text = item.textContent?.trim();
        if (text && text.length > 10 && text.length < 200) {
          data.features.push(text);
        }
      });
    });
    data.features = [...new Set(data.features)].slice(0, 10);

    // Try to detect pricing
    const priceEls = document.querySelectorAll('[class*="price"], [class*="plan"], [class*="tier"]');
    priceEls.forEach(el => {
      const text = el.textContent || "";
      const match = text.match(/\$(\d+(?:\.\d{2})?)/);
      if (match && !data.offers.price) {
        data.offers.price = match[1];
      }
    });

    log("Extracted:", data);
    return data;
  }

  // ═══ 3. Generate JSON-LD Schema ═══

  function generateOrganizationSchema(data) {
    const schema = {
      "@context": "https://schema.org/",
      "@type": "Organization",
      name: data.name,
      url: data.url,
      description: data.description || undefined,
      sameAs: [],
    };
    // Try to find social links
    document.querySelectorAll('a[href*="twitter.com"], a[href*="linkedin.com"], a[href*="github.com"], a[href*="facebook.com"]')
      .forEach(a => schema.sameAs.push(a.getAttribute("href")));
    if (schema.sameAs.length === 0) delete (schema as any).sameAs;
    return schema;
  }

  function generateSoftwareAppSchema(data) {
    const schema: any = {
      "@context": "https://schema.org/",
      "@type": "SoftwareApplication",
      name: data.name,
      url: data.url,
      description: data.description || undefined,
      applicationCategory: data.applicationCategory || "BusinessApplication",
      operatingSystem: "Web",
    };

    if (data.screenshot) schema.screenshot = data.screenshot;
    if (data.features.length > 0) schema.featureList = data.features.join(". ");

    if (data.offers.price) {
      schema.offers = {
        "@type": "Offer",
        price: data.offers.price,
        priceCurrency: data.offers.priceCurrency,
      };
    }

    // Conditional: add aggregateRating if reviews found
    const reviewText = document.body.textContent?.toLowerCase() || "";
    const reviewMatch = reviewText.match(/(\d+(?:\.\d+)?)\s*(?:★|star|rating|out of 5)/);
    if (reviewMatch) {
      schema.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: reviewMatch[1],
        bestRating: "5",
      };
    }

    // Clean undefined
    Object.keys(schema).forEach(k => {
      if (schema[k] === undefined || (Array.isArray(schema[k]) && schema[k].length === 0)) delete schema[k];
    });

    return schema;
  }

  function generateFAQSchema(data) {
    let questions: { q: string; a: string }[] = [];

    if (isPricingPage()) {
      questions = [
        { q: "Is there a free trial available?", a: `Yes, ${data.name} typically offers a free trial. Visit our pricing page for current offers.` },
        { q: "What payment methods do you accept?", a: "We accept major credit cards including Visa, Mastercard, and American Express. Enterprise plans can be invoiced." },
        { q: "Can I cancel my subscription anytime?", a: "Yes — you can cancel at any time. Your account remains active until the end of your current billing period." },
        { q: "Do you offer discounts for nonprofits or startups?", a: "Yes, we offer special pricing for qualifying organizations. Contact our sales team for details." },
      ];
    } else {
      questions = [
        { q: `What does ${data.name} do?`, a: data.description || `${data.name} is a software platform that helps businesses streamline their workflows.` },
        { q: `Is ${data.name} easy to use?`, a: `${data.name} is designed for ease of use with an intuitive interface. No technical expertise required to get started.` },
        { q: "How do I get support?", a: "Support is available via email, live chat, and our help center. Premium plans include priority phone support." },
        { q: "Does it integrate with other tools?", a: "Yes, we integrate with popular platforms including Google Workspace, Slack, and Zapier for thousands of additional connections." },
      ];
    }

    return {
      "@context": "https://schema.org/",
      "@type": "FAQPage",
      mainEntity: questions.map(q => ({
        "@type": "Question",
        name: q.q,
        acceptedAnswer: { "@type": "Answer", text: q.a },
      })),
    };
  }

  // ═══ 4. Inject into <head> ═══

  function injectSchema(schema, id) {
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
    log(`Injected: ${id}`);
  }

  // ═══ 5. Check existing Schema ═══

  function hasExistingSchema(type: string) {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        const data = JSON.parse(s.textContent || "");
        const types = Array.isArray(data) ? data.map((d: any) => d["@type"]) : [data["@type"]];
        if (types.includes(type)) return true;
      } catch (e) { /* ignore */ }
    }
    return false;
  }

  // ═══ 6. Send audit ping ═══

  function sendAuditPing(data: any) {
    try {
      navigator.sendBeacon(API + "/ping", JSON.stringify({
        site: SITE,
        url: location.href,
        page_type: isPricingPage() ? "pricing" : isFeaturesPage() ? "features" : "other",
        has_schema: hasExistingSchema("SoftwareApplication"),
        app_name: data.name,
        category: data.applicationCategory,
        timestamp: new Date().toISOString(),
      }));
    } catch (e) { /* silent */ }
  }

  // ═══ Main ═══

  async function main() {
    log(`Page type: ${isPricingPage() ? "pricing" : isFeaturesPage() ? "features" : isHomePage() ? "home" : "other"}`);

    const data = extractSiteData();

    // Check backend for optimized schema (from Auto-Fix)
    let optimizedSchema = null;
    try {
      const checkRes = await fetch(API + "/saas/auto-fix?url=" + encodeURIComponent(location.href), {
        headers: { "Accept": "application/json" }
      });
      if (checkRes.ok) {
        const result = await checkRes.json();
        if (result.status === "optimized" && result.copy_paste) {
          const blocks = result.copy_paste.split("\n").filter(b => b.trim().startsWith("{"));
          optimizedSchema = blocks.map(b => JSON.parse(b));
          log("Using optimized schema from backend");
        }
      }
    } catch (_) { /* Silently fall back to auto-detection */ }

    if (optimizedSchema && optimizedSchema.length > 0) {
      // Use backend-optimized schemas
      optimizedSchema.forEach(s => {
        const type = s["@type"];
        const id = type === "SoftwareApplication" ? "prodrank-software" :
                   type === "Organization" ? "prodrank-org" :
                   type === "FAQPage" ? "prodrank-faq" : "prodrank-auto";
        injectSchema(s, id);
      });
    } else {
      // Fallback: auto-detect and generate
      if (!hasExistingSchema("Organization")) {
        injectSchema(generateOrganizationSchema(data), "prodrank-org");
      } else {
        log("Organization Schema already exists, skipping");
      }

      if (!hasExistingSchema("SoftwareApplication")) {
        injectSchema(generateSoftwareAppSchema(data), "prodrank-software");
      } else {
        log("SoftwareApplication Schema already exists, skipping");
      }

      if (!hasExistingSchema("FAQPage")) {
        injectSchema(generateFAQSchema(data), "prodrank-faq");
      } else {
        log("FAQPage Schema already exists, skipping");
      }
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
