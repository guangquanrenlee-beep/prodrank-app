"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { TOOLS } from "@/lib/content";
import DiagnosticHero from "@/components/DiagnosticHero";

const FEATURES = [
  { icon: "🔍", title: "Schema Audit", desc: "12-field JSON-LD check across every product page. See exactly what AI crawlers see." },
  { icon: "🏆", title: "AI Ranking", desc: "Track your position across ChatGPT, Gemini, Claude, and Grok for every keyword that matters." },
  { icon: "📰", title: "Citation Tracking", desc: "Discover which sources AI agents cite — and measure their influence on recommendations." },
  { icon: "🔧", title: "Auto-Fix", desc: "One-click Schema generation for Shopify and WooCommerce stores." },
  { icon: "⚔️", title: "Competitor Compare", desc: "Side-by-side analysis of your AI visibility versus up to 3 competitors." },
  { icon: "📡", title: "24/7 Monitoring", desc: "Automated rank tracking with historical trends. Know the moment AI changes its mind." },
];

const USE_CASES = [
  { icon: "🛒", title: "Shopify Stores", desc: "Install our official Shopify App. Schema injection, product sync, and AI ranking in one click." },
  { icon: "🧩", title: "WooCommerce", desc: "Upload our WordPress plugin. Works with any theme and auto-detects your product pages." },
];

const PRICING = [
  { name: "Free", price: "$0", period: "", cta: "Get Started", href: "#", features: ["1 site audit", "3 product audits", "3 AI content generations/mo", "1 keyword AI tracking", "Basic Schema check"], featured: false },
  { name: "Pro", price: "$79", period: "/mo", cta: "Start Free Trial", href: "#", features: ["Unlimited site audits", "50 AI content generations/mo", "Batch template (whole catalog)", "20 keyword AI tracking", "Shopify App & WP plugin", "Schema optimization", "14-day trial"], featured: true },
  { name: "Growth", price: "$199", period: "/mo", cta: "Start Free Trial", href: "#", features: ["Everything in Pro", "200 AI content generations/mo", "100 keyword tracking", "Competitor comparison", "Citation tracking", "Reason Engine", "Entity intelligence"], featured: false },
  { name: "Agency", price: "$499", period: "/mo", cta: "Contact Us", href: "mailto:sales@prodrank.app", features: ["Everything in Growth", "500 AI content generations/mo", "500 keyword tracking", "Multi-brand", "API access", "White-label", "Dedicated support"], featured: false },
];

const FAQS = [
  { q: "What can I do for free?", a: "You get 1 full site audit plus 3 product audits per day — including AI visibility score, Schema check, and basic ranking. No credit card needed." },
  { q: "How do I connect my store?", a: 'Shopify: install our <a href="/integrations" class="text-emerald-400 hover:text-emerald-300 underline">official App</a>. WooCommerce: upload our <a href="/wordpress" class="text-emerald-400 hover:text-emerald-300 underline">plugin</a>. Both inject Schema server-side, so AI agents see it. No developer needed.' },
  { q: "How often do AI recommendations update?", a: "AI agent rankings can shift weekly as models retrain and new content is indexed. Pro and Growth plans include automated daily tracking so you never miss a change." },
  { q: "What if I'm not satisfied?", a: "All paid plans come with a 14-day money-back guarantee. Email support@prodrank.app and we'll refund you — no questions asked." },
  { q: "How is this different from SEO tools?", a: "SEO tools optimize for Google's algorithm. We optimize for AI agents. You can rank #1 on Google and still be invisible to ChatGPT, Gemini, or Claude. We fix that gap." },
  { q: "Do you support other languages?", a: "Our product is optimized for English-language markets. AI agents currently recommend products primarily in English, which is where we focus." },
];

const COMPARISONS = [
  { label: "Google Rank", without: "You know where you rank on Google.", with_: "You know where you rank in ChatGPT, Gemini, Claude, and Grok." },
  { label: "Schema", without: "You hope search engines understand your products.", with_: "12-field JSON-LD audit confirms AI agents read every detail." },
  { label: "Citations", without: "You don't know which sources AI trusts.", with_: "Full citation graph shows who influences AI recommendations in your category." },
  { label: "Fixes", without: "You guess what to improve.", with_: "One-click Schema generation + FAQ injection tailored to your exact gaps." },
  { label: "Monitoring", without: "You check manually when you remember.", with_: "Automated daily tracking with alerts when your rank changes." },
  { label: "Competitors", without: "You don't know if competitors are AI-visible.", with_: "Side-by-side comparison against up to 3 competitors across all AI agents." },
];

export default function HomePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleCTA = (e: React.FormEvent) => {
    e.preventDefault(); if (!domain.trim()) return;
    setLoading(true);
    const d = domain.trim().replace(/^https?:\/\//, "").split("/")[0];
    if (user) localStorage.setItem(`prodrank_last_domain_${user.id}`, d);
    localStorage.setItem("prodrank_last_domain", d);
    router.push(`/analytics?domain=${encodeURIComponent(d)}`);
  };

  return (
    <main className="min-h-screen bg-zinc-950">
      {/* ===== Nav ===== */}
      <nav className="flex items-center justify-between px-4 py-4 max-w-6xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo.svg" alt="ProdRank" className="w-8 h-8" />
          <span className="text-white font-bold text-lg">ProdRank</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="text-zinc-400 hover:text-zinc-200 transition">Pricing</Link>
          {authLoading ? null : user ? (
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-200 transition">
                <span className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">{user.email?.[0].toUpperCase()}</span>
                <span className="hidden sm:inline max-w-[120px] truncate">{user.email?.split("@")[0]}</span>
                <svg className="w-3 h-3 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-lg overflow-hidden z-50">
                  <div className="px-4 py-2 border-b border-zinc-700"><div className="text-xs text-zinc-500 truncate">{user.email}</div></div>
                  <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-700 transition">📊 Dashboard</Link>
                  <Link href="/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-700 transition">⚙️ Settings</Link>
                  <button onClick={() => { supabase.auth.signOut(); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-zinc-700 transition border-t border-zinc-700">🚪 Sign out</button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/login" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition">Sign in</Link>
              <span className="px-4 py-2 bg-zinc-800 text-zinc-600 rounded-lg text-sm cursor-not-allowed select-none" title="Closed beta — new signups temporarily disabled">Get started free</span>
            </>
          )}
        </div>
      </nav>

      {/* ===== Hero ===== */}
      <section className="px-4 py-20 md:py-28 text-center max-w-3xl mx-auto space-y-8">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight text-white">
          Make AI recommend <span className="text-emerald-400">your</span> products
        </h1>
        <p className="text-lg text-zinc-400 max-w-xl mx-auto">
          See if ChatGPT, Gemini, Claude, and Grok can find your store — and fix it when they can&apos;t.
        </p>
        <form onSubmit={handleCTA} className="flex gap-3 max-w-md mx-auto">
          <input type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourstore.com" className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <button type="submit" disabled={loading} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition text-lg">{loading ? "..." : "Analyze Free →"}</button>
        </form>
        <p className="text-xs text-zinc-600">No credit card. Works with Shopify, WooCommerce, and any custom site.</p>

        {/* Live diagnostic (three-tier AI-readiness scan) */}
        <div className="pt-10">
          <DiagnosticHero />
        </div>
      </section>

      {/* ===== Social Proof ===== */}
      <section className="border-t border-zinc-800 py-10">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-3xl font-bold text-emerald-400">500+</div>
            <div className="text-sm text-zinc-500 mt-1">DTC brands monitored</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-emerald-400">10K+</div>
            <div className="text-sm text-zinc-500 mt-1">Products analyzed</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-emerald-400">4</div>
            <div className="text-sm text-zinc-500 mt-1">AI agents tracked — ChatGPT, Gemini, Claude, Grok</div>
          </div>
        </div>
      </section>

      {/* ===== Features ===== */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white">Everything you need to win AI search</h2>
          <p className="text-zinc-400 mt-2">Six engines working together to get your products recommended.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-zinc-900 border border-zinc-800 hover:border-emerald-800 rounded-xl p-6 transition">
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-zinc-200 mb-1">{f.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Use Cases ===== */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white">Works with your platform</h2>
          <p className="text-zinc-400 mt-2">No matter how your store is built, we have an integration for you.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {USE_CASES.map(uc => (
            <div key={uc.title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-center hover:border-zinc-700 transition">
              <div className="text-3xl mb-3">{uc.icon}</div>
              <h3 className="font-semibold text-zinc-200 mb-1">{uc.title}</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">{uc.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Free Tools ===== */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white">Free AI Tools</h2>
          <p className="text-zinc-400 mt-2">6 free tools to check your AI visibility. No sign-up required. 3 uses per day.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOOLS.map(tool => (
            <a key={tool.slug} href={`/tools/${tool.slug}`} className="bg-zinc-900 border border-zinc-800 hover:border-emerald-700 rounded-xl p-5 transition group">
              <div className="text-2xl mb-2">{tool.icon}</div>
              <h3 className="font-semibold text-zinc-200 group-hover:text-emerald-400 transition">{tool.title}</h3>
              <p className="text-xs text-zinc-500 mt-1">{tool.desc}</p>
            </a>
          ))}
        </div>
      </section>

      {/* ===== Pricing ===== */}
      <section className="border-t border-zinc-800 py-20" id="pricing">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white">Simple, transparent pricing</h2>
            <p className="text-zinc-400 mt-2">Start free. Upgrade when you need to know what AI agents really think about your products.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {PRICING.map(tier => (
              <div key={tier.name} className={`rounded-xl p-6 flex flex-col justify-between ${tier.featured ? "bg-emerald-900/20 border-2 border-emerald-600 ring-1 ring-emerald-600/50" : "bg-zinc-900 border border-zinc-800"}`}>
                <div>
                  {tier.featured && <span className="inline-block px-2 py-0.5 bg-emerald-600 text-white text-xs rounded-full mb-3">Most popular</span>}
                  <h3 className="text-lg font-semibold text-zinc-200">{tier.name}</h3>
                  <div className="mt-2 mb-4"><span className="text-3xl font-bold text-white">{tier.price}</span><span className="text-zinc-500 text-sm">{tier.period}</span></div>
                  <ul className="space-y-2 mb-6">
                    {tier.features.map(f => <li key={f} className="text-sm text-zinc-400 flex items-start gap-2"><span className="text-emerald-400 mt-0.5 shrink-0">✓</span>{f}</li>)}
                  </ul>
                </div>
                <span className="block text-center py-2 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-600 cursor-not-allowed select-none" title="Closed beta — signups temporarily disabled">{tier.cta}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-zinc-600 mt-6">Annual billing saves 20%. All paid plans come with 14-day money-back guarantee. <Link href="/refund" className="text-emerald-400 hover:text-emerald-300">Refund Policy</Link>.</p>
        </div>
      </section>

      {/* ===== Comparison ===== */}
      <section className="max-w-5xl mx-auto px-4 pb-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white">Without ProdRank vs With ProdRank</h2>
          <p className="text-zinc-400 mt-2">The gap between guessing and knowing.</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-0 text-sm font-medium bg-zinc-800/50 px-6 py-3 border-b border-zinc-800">
            <div className="col-span-4 text-zinc-400"></div>
            <div className="col-span-4 text-red-400 text-center">❌ Without ProdRank</div>
            <div className="col-span-4 text-emerald-400 text-center">✅ With ProdRank</div>
          </div>
          {COMPARISONS.map((row, i) => (
            <div key={i} className={`grid grid-cols-12 gap-0 px-6 py-4 items-center text-sm ${i % 2 === 0 ? "bg-zinc-900" : "bg-zinc-800/30"}`}>
              <div className="col-span-4 text-zinc-300 font-medium">{row.label}</div>
              <div className="col-span-4 text-zinc-500 text-center px-2">{row.without}</div>
              <div className="col-span-4 text-zinc-200 text-center px-2">{row.with_}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="max-w-3xl mx-auto px-4 pb-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white">Frequently asked questions</h2>
          <p className="text-zinc-400 mt-2">Everything you need to know before you start.</p>
        </div>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left transition hover:bg-zinc-800/50"
              >
                <span className="font-medium text-zinc-200 pr-4">{faq.q}</span>
                <span className={`text-zinc-500 transition-transform shrink-0 ${openFaq === i ? "rotate-45" : ""}`}>＋</span>
              </button>
              {openFaq === i && (
                <div className="px-5 pb-4 text-sm text-zinc-400 leading-relaxed border-t border-zinc-800 pt-3" dangerouslySetInnerHTML={{ __html: faq.a }} />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA Bar ===== */}
      <section className="border-t border-zinc-800 py-16 text-center space-y-4">
        <h2 className="text-3xl font-bold text-white">Ready to be seen by AI?</h2>
        <p className="text-zinc-400">Free for your first 3 products. No credit card.</p>
        <span className="inline-block px-8 py-3 bg-zinc-800 text-zinc-600 rounded-lg font-medium text-lg cursor-not-allowed select-none" title="Closed beta — new signups temporarily disabled">Get started free (Closed Beta)</span>
      </section>
    </main>
  );
}
