"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

const AGENTS = [
  { key: "chatgpt", name: "ChatGPT", color: "text-emerald-400", bg: "bg-emerald-900/20", border: "border-emerald-800", icon: "🤖" },
  { key: "gemini", name: "Gemini", color: "text-blue-400", bg: "bg-blue-900/20", border: "border-blue-800", icon: "🔮" },
  { key: "claude", name: "Claude", color: "text-amber-400", bg: "bg-amber-900/20", border: "border-amber-800", icon: "🧠" },
  { key: "grok", name: "Grok", color: "text-purple-400", bg: "bg-purple-900/20", border: "border-purple-800", icon: "⚡" },
];

export default function PlaygroundPage() {
  const { user, loading: authLoading } = useAuth();
  const [productName, setProductName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [brand, setBrand] = useState("");
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runPlayground = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim() || !keyword.trim()) return;
    setLoading(true); setError(""); setResults(null);
    try {
      const res = await fetch("/api/rank/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_name: productName.trim(), keyword: keyword.trim(), brand: brand.trim() }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      const data = await res.json();
      setResults(data);

      // Save to timeline in localStorage
      if (typeof window !== "undefined") {
        const raw = localStorage.getItem("prodrank_timeline");
        const timeline = raw ? JSON.parse(raw) : [];
        timeline.unshift({
          id: Date.now().toString(),
          date: new Date().toISOString(),
          type: "playground",
          icon: "🧪",
          title: `Playground: ${data.product_name} for "${data.keyword}"`,
          detail: `Ranked by ${data.mentioned_by?.join(", ") || "none"}. Best rank: ${data.best_rank ? "#" + data.best_rank : "Unranked"}`,
          data,
        });
        localStorage.setItem("prodrank_timeline", JSON.stringify(timeline.slice(0, 100)));
      }
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  };

  const findAgentResult = (agentKey: string) => {
    return results?.results?.find((r: any) => r.ai_agent?.toLowerCase().includes(agentKey));
  };

  if (authLoading) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full" /></main>;
  if (!user) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to access</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div></main>;

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      <aside className="w-56 bg-zinc-900 border-r border-zinc-800 shrink-0 flex flex-col p-4">
        <Link href="/dashboard" className="font-bold text-emerald-400 text-lg mb-6">ProdRank</Link>
        <nav className="flex-1 space-y-1">
          {[
            { label: "Dashboard", href: "/dashboard", icon: "📊" },
            { label: "AI Playground", href: "/playground", icon: "🧪", active: true },
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
            <h1 className="text-3xl font-bold mt-1">🧪 AI Playground</h1>
            <p className="text-zinc-400 text-sm mt-1">Ask the same question to 4 AI agents simultaneously and see how they compare.</p>
          </div>

          <form onSubmit={runPlayground} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Product / Brand *</label>
                <input value={productName} onChange={e => setProductName(e.target.value)} placeholder="e.g. Sony WH-1000XM5" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Search Query *</label>
                <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="e.g. best noise cancelling headphones" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Brand (optional)</label>
                <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Sony" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <button type="submit" disabled={loading || !productName.trim() || !keyword.trim()} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition">
              {loading ? "🤖 Asking 4 AI agents..." : "🚀 Run All 4 AI Agents"}
            </button>
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </form>

          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {AGENTS.map(a => (
                <div key={a.key} className={`${a.bg} border ${a.border} rounded-xl p-6 text-center`}>
                  <div className="text-3xl mb-2">{a.icon}</div>
                  <div className={`font-semibold ${a.color}`}>{a.name}</div>
                  <div className="text-sm text-zinc-500 mt-2">Asking...</div>
                  <div className="mt-3 mx-auto w-6 h-6 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />
                </div>
              ))}
            </div>
          )}

          {results && (
            <>
              {/* Summary */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-wrap items-center gap-6">
                <div>
                  <div className="text-xs text-zinc-500">Best Rank</div>
                  <div className="text-2xl font-bold text-emerald-400">{results.best_rank ? `#${results.best_rank}` : "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Mentioned by</div>
                  <div className="text-lg font-semibold text-emerald-400">{results.mentioned_by?.join(", ") || "None"}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Not mentioned by</div>
                  <div className="text-lg font-semibold text-red-400">{results.not_mentioned_by?.join(", ") || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Product</div>
                  <div className="text-lg font-semibold text-zinc-200">{results.product_name}</div>
                </div>
              </div>

              {/* 4-column agent results */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {AGENTS.map(a => {
                  const r = findAgentResult(a.key);
                  return (
                    <div key={a.key} className={`${a.bg} border ${a.border} rounded-xl p-5 flex flex-col`}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl">{a.icon}</span>
                        <span className={`font-semibold ${a.color}`}>{a.name}</span>
                      </div>
                      {r ? (
                        <div className="space-y-3 flex-1">
                          <div>
                            <div className="text-xs text-zinc-500">Rank</div>
                            <div className={`text-xl font-bold ${r.rank ? "text-emerald-400" : "text-red-400"}`}>
                              {r.rank ? `#${r.rank}` : "Not ranked"}
                            </div>
                            {r.total_mentioned && <div className="text-xs text-zinc-500">out of {r.total_mentioned} mentioned</div>}
                          </div>
                          {r.sentiment && (
                            <div>
                              <div className="text-xs text-zinc-500">Sentiment</div>
                              <div className={`text-sm font-medium ${r.sentiment === "positive" ? "text-emerald-400" : r.sentiment === "negative" ? "text-red-400" : "text-zinc-400"}`}>
                                {r.sentiment}
                              </div>
                            </div>
                          )}
                          {r.description && (
                            <div>
                              <div className="text-xs text-zinc-500">Description</div>
                              <p className="text-sm text-zinc-300 leading-relaxed">{r.description.slice(0, 200)}{r.description.length > 200 ? "..." : ""}</p>
                            </div>
                          )}
                          {r.competitors?.length > 0 && (
                            <div>
                              <div className="text-xs text-zinc-500 mb-1">Competitors mentioned</div>
                              <div className="flex flex-wrap gap-1">
                                {r.competitors.slice(0, 5).map((c: string, i: number) => (
                                  <span key={i} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{c}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {r.cited_sources?.length > 0 && (
                            <details>
                              <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">Sources ({r.cited_sources.length})</summary>
                              <div className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                                {r.cited_sources.map((s: string, i: number) => (
                                  <div key={i} className="text-xs text-zinc-600 truncate">{s}</div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-zinc-600 italic flex-1">No data from {a.name}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
