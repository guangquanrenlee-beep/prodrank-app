"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCTA = (e: React.FormEvent) => {
    e.preventDefault(); if (!domain.trim()) return;
    setLoading(true);
    const d = domain.trim().replace(/^https?:\/\//,"").split("/")[0];
    localStorage.setItem("prodrank_last_domain", d);
    router.push(`/analytics?domain=${encodeURIComponent(d)}`);
  };

  return (<main className="min-h-screen bg-zinc-950">
    {/* Nav */}
    <nav className="flex items-center justify-between px-4 py-4 max-w-6xl mx-auto">
      <Link href="/" className="flex items-center gap-2"><img src="/logo.svg" alt="ProdRank" className="w-8 h-8" /><span className="text-white font-bold text-lg">ProdRank</span></Link>
      <div className="flex items-center gap-4 text-sm">
        <Link href="/pricing" className="text-zinc-400 hover:text-zinc-200 transition">Pricing</Link>
        <Link href="/login" className="text-zinc-400 hover:text-zinc-200 transition">Sign in</Link>
        <Link href="/signup" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition">Get started free</Link>
      </div>
    </nav>

    {/* Hero */}
    <section className="px-4 py-24 md:py-32 text-center max-w-3xl mx-auto space-y-8">
      <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight text-white">Make AI recommend your products</h1>
      <p className="text-lg text-zinc-400 max-w-xl mx-auto">See if ChatGPT, Gemini, Claude, and Grok can find your store — and fix it when they can't.</p>
      <form onSubmit={handleCTA} className="flex gap-3 max-w-md mx-auto">
        <input type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourstore.com" className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <button type="submit" disabled={loading} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition text-lg">{loading ? "..." : "Analyze Free →"}</button>
      </form>
      <p className="text-xs text-zinc-600">No credit card. Works with Shopify, WooCommerce, and any custom site.</p>
    </section>

    {/* How it works — 3 steps */}
    <section className="max-w-4xl mx-auto px-4 pb-20">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[{ step:"1", icon:"🔍", title:"Enter your domain", desc:"We auto-detect your platform and scan everything — Schema, content, AI rankings." },
          { step:"2", icon:"📊", title:"See your AI Score", desc:"One number tells you how visible your products are to AI agents." },
          { step:"3", icon:"🔧", title:"Fix with one click", desc:"Install the right tool for your platform — Shopify App, WordPress Plugin, or inject.js." }].map(s => (
          <div key={s.step} className="text-center space-y-3">
            <div className="text-3xl">{s.icon}</div>
            <div><span className="text-xs text-emerald-400 font-bold mr-2">{s.step}</span><span className="font-medium text-zinc-200">{s.title}</span></div>
            <p className="text-sm text-zinc-500">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>

    {/* CTA Bar */}
    <section className="border-t border-zinc-800 py-12 text-center space-y-4">
      <h2 className="text-3xl font-bold text-white">Ready to be seen by AI?</h2>
      <p className="text-zinc-400">Free for your first 3 products. No credit card.</p>
      <Link href="/signup" className="inline-block px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition text-lg">Get started free →</Link>
    </section>
  </main>);
}
