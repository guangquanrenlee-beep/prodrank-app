"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

interface EntityProfile {
  ai_agent: string;
  is_understood: boolean;
  pros: string[];
  cons: string[];
  best_for: string[];
  worst_for: string[];
  price_perception: string;
  brand_perception: string;
  differentiation: string;
}

interface TaxonomyNode {
  category: string;
  subcategories: string[];
  attributes: string[];
}

export default function KnowledgeGraphPage() {
  const { user, loading: authLoading } = useAuth();
  const [productName, setProductName] = useState("");
  const [brand, setBrand] = useState("");
  const [profiles, setProfiles] = useState<EntityProfile[] | null>(null);
  const [taxonomy, setTaxonomy] = useState<TaxonomyNode[] | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load taxonomy on mount
  useEffect(() => {
    fetch("/api/entity-taxonomy")
      .then(r => r.json())
      .then(d => {
        const list = d?.taxonomy;
        if (Array.isArray(list) && list.length > 0) setTaxonomy(list);
      })
      .catch(() => {});
  }, []);

  const analyzeEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) return;
    setLoading(true); setError("");
    try {
      // 1. Get entity profile from AI agents
      const entityRes = await fetch("/api/rec/entity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_name: productName.trim(), brand: brand.trim() }),
      });
      if (!entityRes.ok) throw new Error(await entityRes.text());
      const entityData = await entityRes.json();
      setProfiles(entityData.profiles || []);
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  };

  const agentColor = (agent: string) =>
    agent.toLowerCase().includes("chatgpt") ? "border-emerald-800 bg-emerald-900/20" :
    agent.toLowerCase().includes("gemini") ? "border-blue-800 bg-blue-900/20" : "border-zinc-700 bg-zinc-800/50";

  const agentLabel = (agent: string) =>
    agent.toLowerCase().includes("chatgpt") ? "text-emerald-400" :
    agent.toLowerCase().includes("gemini") ? "text-blue-400" : "text-zinc-400";

  if (authLoading) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full" /></main>;
  if (!user) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to access</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div></main>;

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      <aside className="w-56 bg-zinc-900 border-r border-zinc-800 shrink-0 flex flex-col p-4">
        <Link href="/dashboard" className="font-bold text-emerald-400 text-lg mb-6">ProdRank</Link>
        <nav className="flex-1 space-y-1">
          {[
            { label: "Dashboard", href: "/dashboard", icon: "📊" },
            { label: "Knowledge Graph", href: "/knowledge-graph", icon: "🧠", active: true },
          ].map(item => (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${(item as any).active ? "bg-emerald-900/30 text-emerald-400" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"}`}>
              <span>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
          <div>
            <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
            <h1 className="text-3xl font-bold mt-1">🧠 Knowledge Graph</h1>
            <p className="text-zinc-400 text-sm mt-1">See exactly what AI agents know about your product — and what they don't.</p>
          </div>

          {/* Entity Taxonomy Browser */}
          {taxonomy && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="font-semibold mb-3">📂 Entity Taxonomy</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                <button onClick={() => setSelectedCategory("")} className={`text-xs px-3 py-1 rounded-full transition ${!selectedCategory ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>All</button>
                {taxonomy.map(t => (
                  <button key={t.category} onClick={() => setSelectedCategory(t.category)} className={`text-xs px-3 py-1 rounded-full transition ${selectedCategory === t.category ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>{t.category}</button>
                ))}
              </div>
              {(selectedCategory ? taxonomy.filter(t => t.category === selectedCategory) : taxonomy).map(t => (
                <div key={t.category} className="border border-zinc-800 rounded-lg p-4 mb-3">
                  <div className="font-medium text-zinc-200 mb-2">{t.category}</div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {t.subcategories.map(s => (
                      <span key={s} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded">{s}</span>
                    ))}
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-1.5">Attributes AI agents look for:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {t.attributes.map(a => (
                        <span key={a} className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-1 rounded border border-emerald-800/50">{a}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Entity Profile Input */}
          <form onSubmit={analyzeEntity} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Product Name *</label>
                <input value={productName} onChange={e => setProductName(e.target.value)} placeholder="e.g. Patagonia Down Sweater Hoody" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Brand (optional)</label>
                <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Patagonia" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <button type="submit" disabled={loading || !productName.trim()} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition">
              {loading ? "Analyzing..." : "🔍 Analyze Entity"}
            </button>
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </form>

          {/* Entity Profiles */}
          {profiles && profiles.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {profiles.map((p, i) => (
                <div key={i} className={`border rounded-xl p-6 ${agentColor(p.ai_agent)}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xl">{p.ai_agent.toLowerCase().includes("chatgpt") ? "🤖" : "🔮"}</span>
                    <h3 className={`font-semibold text-lg ${agentLabel(p.ai_agent)}`}>{p.ai_agent}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_understood ? "bg-emerald-900/50 text-emerald-400" : "bg-red-900/50 text-red-400"}`}>
                      {p.is_understood ? "✓ Understood" : "✗ Not fully understood"}
                    </span>
                  </div>

                  <div className="space-y-4">
                    {p.pros?.length > 0 && (
                      <div>
                        <div className="text-xs text-zinc-500 mb-1.5 font-medium">✅ Pros</div>
                        <div className="flex flex-wrap gap-1">
                          {p.pros.map((pro, j) => <span key={j} className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-1 rounded border border-emerald-800/50">{pro}</span>)}
                        </div>
                      </div>
                    )}
                    {p.cons?.length > 0 && (
                      <div>
                        <div className="text-xs text-zinc-500 mb-1.5 font-medium">❌ Cons</div>
                        <div className="flex flex-wrap gap-1">
                          {p.cons.map((con, j) => <span key={j} className="text-xs bg-red-900/30 text-red-400 px-2 py-1 rounded border border-red-800/50">{con}</span>)}
                        </div>
                      </div>
                    )}
                    {p.best_for?.length > 0 && (
                      <div>
                        <div className="text-xs text-zinc-500 mb-1.5 font-medium">🎯 Best For</div>
                        <div className="flex flex-wrap gap-1">
                          {p.best_for.map((bf, j) => <span key={j} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded">{bf}</span>)}
                        </div>
                      </div>
                    )}
                    {p.worst_for?.length > 0 && (
                      <div>
                        <div className="text-xs text-zinc-500 mb-1.5 font-medium">⚠️ Worst For</div>
                        <div className="flex flex-wrap gap-1">
                          {p.worst_for.map((wf, j) => <span key={j} className="text-xs bg-zinc-800 text-zinc-500 px-2 py-1 rounded">{wf}</span>)}
                        </div>
                      </div>
                    )}
                    {p.price_perception && (
                      <div>
                        <div className="text-xs text-zinc-500 mb-0.5 font-medium">💰 Price Perception</div>
                        <div className="text-sm text-zinc-300">{p.price_perception}</div>
                      </div>
                    )}
                    {p.brand_perception && (
                      <div>
                        <div className="text-xs text-zinc-500 mb-0.5 font-medium">🏷️ Brand Perception</div>
                        <div className="text-sm text-zinc-300">{p.brand_perception}</div>
                      </div>
                    )}
                    {p.differentiation && (
                      <div>
                        <div className="text-xs text-zinc-500 mb-0.5 font-medium">🔬 Differentiation</div>
                        <div className="text-sm text-zinc-300">{p.differentiation}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
