"use client";
import { useEffect } from "react";
import Link from "next/link";
import Breadcrumbs from "@/components/Breadcrumbs";


const PADDLE_PRICE_IDS = { pro: "pri_pro_placeholder", growth: "pri_growth_placeholder" };

export default function PricingPage() {
  useEffect(() => { const s = document.createElement("script"); s.src = "https://cdn.paddle.com/paddle/v2/paddle.js"; s.async = true; document.body.appendChild(s); }, []);

  const openPaddle = (plan: string) => { if (window.Paddle) { window.Paddle.Checkout.open({ items: [{ priceId: plan === "pro" ? PADDLE_PRICE_IDS.pro : PADDLE_PRICE_IDS.growth, quantity: 1 }] }); } };

  return (<>
    <main className="min-h-screen max-w-6xl mx-auto px-4 py-12 space-y-8">
      <Breadcrumbs items={[{ label: "Pricing" }]} />
      <div className="text-center space-y-4">
        <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Back</Link>
        <h1 className="text-4xl font-bold">Simple, transparent pricing</h1>
        <p className="text-zinc-400 max-w-lg mx-auto">Start free. Upgrade when you need to know what AI agents really think about your products.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { name: "Free", price: "$0", period: "", cta: "Get Started", href: "/signup", features: ["1 store", "3 product audits", "3 AI content generations/mo", "1 keyword AI tracking", "Basic Schema check"], featured: false },
          { name: "Pro", price: "$79", period: "/mo", cta: "Start Free Trial", plan: "pro", features: ["1 store", "Unlimited site audits", "50 AI content generations/mo", "Batch template (whole catalog)", "20 keyword AI tracking", "Shopify App & WP plugin", "Schema optimization", "14-day trial"], featured: true },
          { name: "Growth", price: "$199", period: "/mo", cta: "Start Free Trial", plan: "growth", features: ["Up to 3 stores", "Everything in Pro", "200 AI content generations/mo", "100 keyword tracking", "Competitor comparison", "Citation tracking", "Reason Engine", "Entity intelligence"], featured: false },
          { name: "Agency", price: "$499", period: "/mo", cta: "Contact Us", href: "mailto:sales@prodrank.app", features: ["Up to 10 stores", "Everything in Growth", "500 AI content generations/mo", "500 keyword tracking", "Multi-brand", "API access", "White-label", "Dedicated support"], featured: false },
        ].map(tier => (
          <div key={tier.name} className={`rounded-xl p-6 flex flex-col justify-between ${tier.featured ? "bg-emerald-900/20 border-2 border-emerald-600 ring-1 ring-emerald-600/50" : "bg-zinc-900 border border-zinc-800"}`}>
            <div>{tier.featured && <span className="inline-block px-2 py-0.5 bg-emerald-600 text-white text-xs rounded-full mb-3">Most popular</span>}
              <h3 className="text-lg font-semibold">{tier.name}</h3>
              <div className="mt-2 mb-4"><span className="text-3xl font-bold">{tier.price}</span><span className="text-zinc-500 text-sm">{tier.period}</span></div>
              <ul className="space-y-2 mb-6">{tier.features.map(f => <li key={f} className="text-sm text-zinc-400 flex items-start gap-2"><span className="text-emerald-400 mt-0.5">✓</span>{f}</li>)}</ul>
            </div>
            {tier.href ? (
              <Link href={tier.href} className={`block text-center py-2 rounded-lg text-sm font-medium transition ${tier.featured ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}>{tier.cta}</Link>
            ) : (
              <button onClick={() => openPaddle(tier.plan!)} className={`w-full py-2 rounded-lg text-sm font-medium transition ${tier.featured ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}>{tier.cta}</button>
            )}
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-zinc-600">Annual billing saves 20%. All paid plans come with 14-day money-back guarantee. <a href="/refund" className="text-emerald-400 hover:text-emerald-300">Refund Policy</a>.</p>
    </main>
    
  </>);
}
