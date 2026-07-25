"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FEATURES, TOOLS } from "@/lib/content";

export default function HomePage() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCTA = (e: React.FormEvent) => {
    e.preventDefault(); if (!domain.trim()) return;
    setLoading(true);
    const d = domain.trim().replace(/^https?:\/\//,"").split("/")[0];
    router.push(`/analytics?domain=${encodeURIComponent(d)}`);
  };

  return (
    <main className="min-h-screen bg-zinc-950">
      {/* Nav */}
      <nav className="flex items-center justify-between px-4 py-4 max-w-6xl mx-auto">
        <Link href="/" className="text-emerald-400 font-bold text-lg">ProdRank</Link>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/pricing" className="text-zinc-400 hover:text-zinc-200 transition">Pricing</Link>
          <Link href="/features/schema-validator" className="text-zinc-400 hover:text-zinc-200 transition">Features</Link>
          <Link href="/login" className="text-zinc-400 hover:text-zinc-200 transition">Sign in</Link>
          <Link href="/signup" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition">Sign up free</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-4 py-20 md:py-28 text-center max-w-4xl mx-auto space-y-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-800 bg-emerald-900/20 text-emerald-400 text-xs font-medium">AI Shopping Visibility OS</div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight">Make AI recommend <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">your products</span></h1>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto">ProdRank tells you if ChatGPT, Gemini, Claude, and Grok can find your products — and fixes it when they can&apos;t. One click. Any platform.</p>
        <form onSubmit={handleCTA} className="flex gap-3 max-w-md mx-auto pt-4">
          <input type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourstore.com" className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <button type="submit" disabled={loading} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition text-lg">{loading ? "..." : "Analyze →"}</button>
        </form>
        <div className="flex justify-center gap-6 text-xs text-zinc-600"><span>ChatGPT</span><span>Gemini</span><span>Claude</span><span>Grok</span><span>No code changes</span><span>Free scan</span></div>
      </section>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-4 pb-20 space-y-10">
        <div className="text-center"><h2 className="text-3xl font-bold">Everything you need for AI visibility</h2><p className="text-zinc-400 mt-2">14 products. One platform. Zero complexity.</p></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FEATURES.slice(0, 12).map(f => (
            <Link key={f.slug} href={`/features/${f.slug}`} className="bg-zinc-900 border border-zinc-800 hover:border-emerald-700 rounded-xl p-4 transition group">
              <div className="text-2xl mb-2">{f.icon}</div>
              <div className="text-sm font-medium text-zinc-200 group-hover:text-emerald-400 transition">{f.title}</div>
              <div className="text-xs text-zinc-500 mt-1">{f.desc.slice(0, 60)}...</div>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-zinc-900 py-16 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-3xl font-bold">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[{ step: "1", title: "Enter your domain", desc: "We auto-detect your platform" }, { step: "2", title: "We scan everything", desc: "Schema, content, AI rankings, citations" }, { step: "3", title: "Get your AI Score", desc: "One number. Six dimensions." }, { step: "4", title: "Fix with one click", desc: "Shopify App, inject.js, or CSV" }].map(s => (
              <div key={s.step}><div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold mx-auto mb-3">{s.step}</div><div className="font-medium text-zinc-200">{s.title}</div><div className="text-xs text-zinc-500 mt-1">{s.desc}</div></div>
            ))}
          </div>
        </div>
      </section>

      {/* Free Tools */}
      <section className="max-w-6xl mx-auto px-4 py-16 space-y-8">
        <div className="text-center"><h2 className="text-3xl font-bold">Free AI Shopping tools</h2><p className="text-zinc-400 mt-2">No signup required. Try them now.</p></div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {TOOLS.map(t => (<Link key={t.slug} href={`/tools/${t.slug}`} className="bg-zinc-900 border border-zinc-800 hover:border-emerald-700 rounded-xl p-4 transition"><div className="text-2xl mb-1">{t.icon}</div><div className="text-sm font-medium text-zinc-200">{t.title}</div><div className="text-xs text-zinc-500 mt-1">{t.desc.slice(0, 80)}</div></Link>))}
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-zinc-900 py-16 px-4">
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="text-3xl font-bold text-center">FAQ</h2>
          {[{ q: "Will this slow down my store?", a: "No. Schema is lightweight JSON-LD added to your existing pages. Zero performance impact." }, { q: "Do I need to be technical to use this?", a: "No. Install the Shopify App or paste one line of code. Our dashboard guides you through everything." }, { q: "Does this really improve AI recommendations?", a: "Yes. Structured data is the #1 signal AI agents use to understand products. Without Schema, AI literally cannot 'see' your product details." }, { q: "What platforms do you support?", a: "Shopify, WooCommerce, WordPress, and any custom site via inject.js or CSV upload." }].map((faq,i) => (<div key={i} className="bg-zinc-800/50 rounded-xl p-4"><div className="font-medium text-zinc-200">{faq.q}</div><div className="text-sm text-zinc-400 mt-1">{faq.a}</div></div>))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 text-center space-y-4">
        <h2 className="text-3xl font-bold">Ready to be seen by AI?</h2>
        <p className="text-zinc-400">The first 3 products are free. No credit card.</p>
        <form onSubmit={handleCTA} className="flex gap-3 max-w-md mx-auto pt-2">
          <input type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourstore.com" className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <button type="submit" disabled={loading} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition">{loading ? "..." : "Analyze Free →"}</button>
        </form>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8 px-4 text-center text-xs text-zinc-600 space-y-2">
        <div className="flex justify-center gap-6">
          <Link href="/features/schema-validator">Schema Validator</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/inject-guide">Install inject.js</Link>
          <Link href="/solutions/shopify">Shopify</Link>
          <Link href="/login">Sign in</Link>
        </div>
        <p>ProdRank — AI Commerce Intelligence Platform</p>
      </footer>
    </main>
  );
}
