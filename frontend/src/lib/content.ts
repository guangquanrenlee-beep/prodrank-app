export const FEATURES = [
  { slug: "schema-validator", title: "AI Schema Validator", desc: "Check if AI agents can read your product data. 12-field JSON-LD audit.", icon: "🔍" },
  { slug: "faq-schema", title: "FAQ Schema Generator", desc: "Auto-generate FAQPage Schema that AI agents quote in recommendations.", icon: "❓" },
  { slug: "ai-product-analysis", title: "AI Product Understanding", desc: "See how ChatGPT, Gemini, Claude interpret your products.", icon: "🧠" },
  { slug: "citation-tracker", title: "AI Citation Tracker", desc: "Track which sources AI agents cite when recommending products.", icon: "📰" },
  { slug: "recommendation-monitor", title: "AI Recommendation Monitor", desc: "Daily tracking of your product rank across 4 AI agents.", icon: "📡" },
  { slug: "knowledge-gap", title: "Knowledge Gap Detector", desc: "Find what AI agents know about your category that your site is missing.", icon: "🕳️" },
  { slug: "product-ai-score", title: "Product AI Score", desc: "One composite number: how visible is your product to AI agents?", icon: "📊" },
  { slug: "competitor-analysis", title: "Competitor AI Analysis", desc: "Side-by-side comparison of your Schema and AI visibility vs competitors.", icon: "⚔️" },
  { slug: "question-coverage", title: "Question Coverage Checker", desc: "See which shopper questions AI answers that your site doesn't cover.", icon: "✅" },
  { slug: "optimization-center", title: "One-Click Optimization", desc: "Auto-generate everything AI agents need to recommend your products.", icon: "🔧" },
  { slug: "verification", title: "Optimization Impact", desc: "Before/After snapshots proving your fixes improved AI visibility.", icon: "📸" },
  { slug: "opportunity-radar", title: "Opportunity Radar", desc: "Which of your 5000 SKUs will give the biggest AI visibility boost?", icon: "🎯" },
  { slug: "ai-playground", title: "AI Shopping Playground", desc: "Ask ChatGPT/Gemini/Claude about your products and see what they say.", icon: "🎮" },
  { slug: "ai-timeline", title: "AI Memory Timeline", desc: "Watch how AI recommendations for your brand change over time.", icon: "📅" },
];

export const TOOLS = [
  { slug: "schema-validator", title: "Free Schema Validator", desc: "Paste a URL, see if AI agents can read your product.", icon: "🔍", endpoint: "/api/audit/product" },
  { slug: "ai-score-checker", title: "Free AI Score Checker", desc: "Enter your domain, get an AI Visibility Score instantly.", icon: "📊", endpoint: "/api/calculate" },
  { slug: "faq-generator", title: "Free FAQ Generator", desc: "Generate FAQ Schema for any product page.", icon: "❓", endpoint: "/api/optimize/fixes" },
  { slug: "jsonld-generator", title: "Free JSON-LD Generator", desc: "Generate complete Product Schema JSON-LD.", icon: "📝", endpoint: "/api/optimize/fixes/from-data" },
  { slug: "description-analyzer", title: "Product Description Analyzer", desc: "Check if your product description gives AI enough context.", icon: "📄", endpoint: "/api/intel/full" },
  { slug: "citation-checker", title: "AI Citation Checker", desc: "Find out which sources AI agents trust in your category.", icon: "📰", endpoint: "/api/cite/report" },
];

export const COMPARISONS = [
  { tool: "ahrefs", name: "Ahrefs", desc: "Ahrefs is for Google SEO. ProdRank is for AI Shopping visibility." },
  { tool: "semrush", name: "Semrush", desc: "Semrush tracks Google SERPs. ProdRank tracks ChatGPT, Gemini, Claude, and Grok." },
  { tool: "profound", name: "Profound", desc: "Both track AI visibility. ProdRank adds Schema injection, competitor tracking, and Citation Intelligence." },
  { tool: "peec-ai", name: "Peec AI", desc: "Peec focuses on AI-generated product descriptions. ProdRank covers full AI visibility stack." },
  { tool: "rankscale", name: "Rankscale", desc: "Rankscale optimizes for search engines. ProdRank optimizes for AI shopping agents." },
];

export const INDUSTRIES = [
  { slug: "fashion", title: "Fashion", desc: "Schema + FAQ for clothing, shoes, accessories brands.", keywords: "winter jackets, sneakers, dresses" },
  { slug: "electronics", title: "Electronics", desc: "Headphones, laptops, speakers — make AI recommend your tech.", keywords: "headphones, laptops, smartwatch" },
  { slug: "coffee", title: "Coffee & Espresso", desc: "Espresso machines, grinders, beans — get cited by CoffeeGeek and Wirecutter.", keywords: "espresso machine, coffee grinder, coffee beans" },
  { slug: "beauty", title: "Beauty & Skincare", desc: "Makeup, skincare, haircare — AI agent visibility for beauty brands.", keywords: "moisturizer, serum, foundation" },
  { slug: "mattress", title: "Mattress & Bedding", desc: "Mattress brands — high-ticket products where AI recommendations matter.", keywords: "mattress, pillow, sheets" },
  { slug: "pet", title: "Pet Supplies", desc: "Pet food, toys, accessories — 70% of pet owners research online before buying.", keywords: "dog food, cat litter, pet bed" },
];

export const SOLUTIONS = [
  { slug: "shopify", title: "Shopify Stores", desc: "1.8M+ Shopify stores need AI visibility. Install our App — one click, all products optimized." },
  { slug: "woocommerce", title: "WooCommerce Shops", desc: "WooCommerce REST API sync. Upload our Plugin — all products get Schema." },
  { slug: "amazon-sellers", title: "Amazon Sellers", desc: "Optimize your Amazon listings for AI agent recommendations." },
  { slug: "dtc-brands", title: "DTC Brands", desc: "Direct-to-consumer brands need AI visibility more than anyone. No marketplace to fall back on." },
  { slug: "luxury", title: "Luxury Brands", desc: "High-end products where detailed AI recommendations drive purchase decisions." },
];
