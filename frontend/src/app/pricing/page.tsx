"use client";

import Link from "next/link";

const TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "",
    cta: "Get Started",
    href: "/",
    features: [
      "1 site audit", "3 product audits",
      "Basic Schema check", "AI visibility quick scan",
    ],
  },
  {
    name: "Pro",
    price: "$79",
    period: "/month",
    cta: "Start Free Trial",
    href: "/signup?plan=pro",
    featured: true,
    features: [
      "Unlimited site audits", "50 product audits/month",
      "20 keyword AI rank tracking", "Shopify App auto-injection",
      "WordPress Plugin", "inject.js for any platform",
      "Schema optimization code gen", "AI Parse validation",
      "Knowledge Gap detection", "14-day free trial",
    ],
  },
  {
    name: "Growth",
    price: "$199",
    period: "/month",
    cta: "Start Free Trial",
    href: "/signup?plan=growth",
    features: [
      "Everything in Pro", "Unlimited product audits",
      "100 keyword tracking", "Competitor comparison",
      "AI rank query page", "Citation source tracking",
      "Reason Engine (why/why not)", "Entity intelligence (pros/cons)",
      "Source influence alerts",
    ],
  },
  {
    name: "Agency",
    price: "$499",
    period: "/month",
    cta: "Contact Sales",
    href: "mailto:sales@prodrank.app",
    features: [
      "Everything in Growth", "500 keyword tracking",
      "Multi-brand management", "API access",
      "White-label reports", "SKU priority ranking",
      "Dedicated support", "Custom integrations",
    ],
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen max-w-6xl mx-auto px-4 py-12 space-y-8">
      <div className="text-center space-y-4">
        <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Back</Link>
        <h1 className="text-4xl font-bold">Simple, transparent pricing</h1>
        <p className="text-zinc-400 max-w-lg mx-auto">
          Start free. Upgrade when you need to know what AI agents really think about your products.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {TIERS.map((tier) => (
          <div
            key={tier.name}
            className={`rounded-xl p-6 flex flex-col justify-between ${
              tier.featured
                ? "bg-emerald-900/20 border-2 border-emerald-600 ring-1 ring-emerald-600/50"
                : "bg-zinc-900 border border-zinc-800"
            }`}
          >
            <div>
              {tier.featured && (
                <span className="inline-block px-2 py-0.5 bg-emerald-600 text-white text-xs rounded-full mb-3">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold">{tier.name}</h3>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-bold">{tier.price}</span>
                <span className="text-zinc-500 text-sm">{tier.period}</span>
              </div>
              <ul className="space-y-2 mb-6">
                {tier.features.map((f) => (
                  <li key={f} className="text-sm text-zinc-400 flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href={tier.href}
              className={`block text-center py-2 rounded-lg text-sm font-medium transition ${
                tier.featured
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              }`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-zinc-600">
        Annual billing saves 20%. All plans include 14-day free trial on Pro and Growth.
        <br />
        Need something custom? <a href="mailto:sales@prodrank.app" className="text-emerald-400 hover:text-emerald-300">Contact us</a>.
      </p>
    </main>
  );
}
