"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

interface Opportunity {
  product_name: string;
  search_volume_score: number;
  ai_coverage_score: number;
  competition_score: number;
  roi_score: number;
  recommended_action: string;
}

export default function OpportunityRadarPage() {
  const { user, loading: authLoading } = useAuth();
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [productsText, setProductsText] = useState("");
  const [opportunities, setOpportunities] = useState<Opportunity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const scanOpportunities = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productsText.trim()) return;
    setLoading(true); setError("");
    try {
      const productList = productsText
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .map(name => ({ name, search_volume: 50 + Math.floor(Math.random() * 50), ai_mentioned: Math.random() > 0.5, competition: Math.floor(Math.random() * 10) + 1 }));

      const res = await fetch("/api/rec/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brand.trim(), category: category.trim(), products: productList }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setOpportunities(data.opportunities || []);
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  };

  const scoreColor = (s: number) => s >= 80 ? "text-emerald-400" : s >= 50 ? "text-yellow-400" : "text-red-400";
  const scoreBg = (s: number) => s >= 80 ? "bg-emerald-500" : s >= 50 ? "bg-yellow-500" : "bg-red-500";
  const starRating = (s: number) => {
    const stars = Math.round(s / 20);
    return "★".repeat(Math.max(1, stars)) + "☆".repeat(Math.max(0, 5 - stars));
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
            { label: "Opportunity Radar", href: "/opportunities", icon: "🎯", active: true },
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
            <h1 className="text-3xl font-bold mt-1">🎯 Opportunity Radar</h1>
            <p className="text-zinc-400 text-sm mt-1">Which SKUs will give you the biggest AI visibility boost? Ranked by ROI.</p>
          </div>

          <form onSubmit={scanOpportunities} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Brand</label>
                <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Nike" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Category</label>
                <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. running shoes" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Products * <span className="text-zinc-600">(one per line)</span></label>
              <textarea
                value={productsText}
                onChange={e => setProductsText(e.target.value)}
                placeholder={`Air Zoom Pegasus 40\nRevolution 7\nInvincible 3\nVaporfly 3\nStreakfly\nWinflo 11`}
                rows={6}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm resize-y"
              />
            </div>
            <button type="submit" disabled={loading || !productsText.trim()} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition">
              {loading ? "🔍 Scanning opportunities..." : "🎯 Scan Opportunities"}
            </button>
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </form>

          {opportunities && opportunities.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Top Opportunities ({opportunities.length} SKUs)</h3>
                <span className="text-xs text-zinc-500">Sorted by ROI potential</span>
              </div>

              {opportunities.map((o, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 hover:border-emerald-700 rounded-xl p-5 transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-zinc-600 font-mono">#{i + 1}</span>
                        <h4 className="font-semibold text-zinc-200">{o.product_name}</h4>
                        <span className="text-xs text-yellow-400">{starRating(o.roi_score)}</span>
                      </div>
                      {o.recommended_action && (
                        <p className="text-sm text-zinc-400">{o.recommended_action}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-center">
                        <div className={`text-lg font-bold ${scoreColor(o.roi_score)}`}>{o.roi_score}</div>
                        <div className="text-[10px] text-zinc-500">ROI</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1"><span className="text-zinc-500">Search Volume</span><span className="text-zinc-400">{o.search_volume_score}/100</span></div>
                      <div className="w-full bg-zinc-800 rounded-full h-1.5"><div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.max(o.search_volume_score, 5)}%` }} /></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1"><span className="text-zinc-500">AI Coverage</span><span className="text-zinc-400">{o.ai_coverage_score}/100</span></div>
                      <div className="w-full bg-zinc-800 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${scoreBg(o.ai_coverage_score)}`} style={{ width: `${Math.max(o.ai_coverage_score, 5)}%` }} /></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1"><span className="text-zinc-500">Competition</span><span className="text-zinc-400">{o.competition_score}/100</span></div>
                      <div className="w-full bg-zinc-800 rounded-full h-1.5"><div className="h-1.5 rounded-full bg-purple-500" style={{ width: `${Math.max(o.competition_score, 5)}%` }} /></div>
                    </div>
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
