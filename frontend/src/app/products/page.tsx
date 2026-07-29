"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

interface ProductItem {
  id: string; title: string; url: string; description: string;
  schema_fields: number; content_quality_score: number; ai_visibility_score: number;
  price?: string; brand?: string; sku?: string;
}

interface SiteItem { id: string; domain: string; ai_visibility_score?: number; }

export default function ProductsPage() {
  const { user, loading: l } = useAuth();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [siteId, setSiteId] = useState("");
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<"score" | "name">("score");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const sc = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-amber-400" : "text-red-400";

  useEffect(() => {
    if (user) {
      supabase.from("sites").select("id,domain").eq("user_id", user.id).order("updated_at", { ascending: false })
        .then(({ data }) => { if (data?.length) { setSites(data as SiteItem[]); setSiteId(data[0].id); loadProducts(data[0].id); } });
    }
  }, [user]);

  const loadProducts = async (sid: string) => {
    setLoading(true);
    const { data } = await supabase.from("products").select("*").eq("site_id", sid).order("ai_visibility_score", { ascending: true });
    setProducts((data as ProductItem[]) || []);
    setLoading(false);
  };

  const filtered = products
    .filter(p => !search || (p.title || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sort === "score" ? (a.ai_visibility_score || 0) - (b.ai_visibility_score || 0) : (a.title || "").localeCompare(b.title || ""));

  const low = products.filter(p => (p.ai_visibility_score || 0) < 40).length;
  const med = products.filter(p => (p.ai_visibility_score || 0) >= 40 && (p.ai_visibility_score || 0) < 70).length;
  const high = products.filter(p => (p.ai_visibility_score || 0) >= 70).length;
  const progress = products.length > 0 ? Math.round((high / products.length) * 100) : 0;

  if (l) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full" /></main>;
  if (!user) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to access</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div></main>;

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div>
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mt-1">📦 Products</h1>
              <p className="text-zinc-400 text-sm mt-1">Scan all products, see their AI visibility score, and fix the lowest-scoring ones first.</p>
            </div>
            <div className="flex items-center gap-2">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="w-36 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 text-xs" />
              <select value={sort} onChange={e => setSort(e.target.value as any)} className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs">
                <option value="score">Lowest First</option><option value="name">By Name</option>
              </select>
            </div>
          </div>
        </div>

        {sites.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {sites.map(s => (
              <button key={s.id} onClick={() => { setSiteId(s.id); loadProducts(s.id); }}
                className={`text-xs px-3 py-1.5 rounded-full border ${s.id === siteId ? "border-emerald-500 bg-emerald-900/20 text-emerald-400" : "border-zinc-700 text-zinc-400 hover:text-zinc-200"}`}>{s.domain}</button>
            ))}
          </div>
        )}

        {products.length > 0 && (
          <>
            {/* Progress overview */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="grid grid-cols-3 gap-4 text-center mb-4">
                <div><div className="text-3xl font-bold text-red-400">{low}</div><div className="text-xs text-zinc-500">⚠️ Critical (&lt;40)</div><div className="text-xs text-zinc-600 mt-0.5">AI can't see these</div></div>
                <div><div className="text-3xl font-bold text-amber-400">{med}</div><div className="text-xs text-zinc-500">📋 Needs Work (40-69)</div><div className="text-xs text-zinc-600 mt-0.5">Partially visible</div></div>
                <div><div className="text-3xl font-bold text-emerald-400">{high}</div><div className="text-xs text-zinc-500">✅ Healthy (70+)</div><div className="text-xs text-zinc-600 mt-0.5">AI recommends these</div></div>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-3 mb-1">
                <div className="bg-emerald-500 h-3 rounded-full transition-all" style={{ width: `${Math.max(5, progress)}%` }} />
              </div>
              <div className="flex justify-between text-xs text-zinc-600"><span>{products.length} total products</span><span>{progress}% healthy</span></div>
            </div>

            {/* Products list */}
            {filtered.map(p => {
              const score = p.ai_visibility_score || 0;
              const fields = p.schema_fields || 0;
              const isExpanded = expanded.has(p.id);
              const missingFields = ["name","description","image","offers","brand","aggregateRating","review","sku","gtin","itemCondition","availability","shippingDetails"].slice(fields);
              return (
                <div key={p.id} className={`bg-zinc-900 border rounded-xl p-5 transition ${score < 40 ? "border-red-800/30 hover:border-red-700/50" : score < 70 ? "border-amber-800/20 hover:border-amber-700/40" : "border-emerald-800/20 hover:border-emerald-700/40"}`}>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-14 text-center">
                      <div className={`text-2xl font-bold ${sc(score)}`}>{score}</div>
                      <div className="text-xs text-zinc-600">AI Score</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-zinc-200 truncate">{p.title || "Untitled Product"}</h3>
                      {p.brand && <span className="text-xs text-zinc-500">{p.brand}{p.price ? ` · ${p.price}` : ""}</span>}
                      <div className="flex items-center gap-4 mt-1.5 text-xs">
                        <span className={fields >= 8 ? "text-emerald-400" : fields >= 4 ? "text-amber-400" : "text-red-400"}>Schema: {fields}/12</span>
                        <span className="text-zinc-500">Content: {p.content_quality_score || 0}/100</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0 text-right">
                      {p.url ? (
                        <Link href={`/knowledge-graph?domain=${encodeURIComponent(p.url)}`}
                          className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition whitespace-nowrap">
                          🔧 Auto-Fix →
                        </Link>
                      ) : (
                        <Link href={`/knowledge-graph?domain=${encodeURIComponent(p.title||"")}`}
                          className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition whitespace-nowrap">
                          🔧 Analyze →
                        </Link>
                      )}
                      <button onClick={() => { const n = new Set(expanded); n.has(p.id) ? n.delete(p.id) : n.add(p.id); setExpanded(n); }}
                        className="text-xs text-zinc-500 hover:text-zinc-300">{isExpanded ? "▲ Hide" : "▼ Details"}</button>
                    </div>
                  </div>
                  {/* Expanded details */}
                  {isExpanded && missingFields.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-zinc-800">
                      <div className="text-xs text-zinc-500 mb-1">Missing schema fields:</div>
                      <div className="flex flex-wrap gap-1">
                        {missingFields.map(f => <span key={f} className="text-xs bg-red-900/20 text-red-400/80 px-2 py-0.5 rounded">{f}</span>)}
                      </div>
                      <p className="text-xs text-zinc-600 mt-2">Click <span className="text-emerald-400">Auto-Fix</span> to go to Knowledge Graph and fix these.</p>
                    </div>
                  )}
                  {isExpanded && missingFields.length === 0 && (
                    <div className="mt-3 pt-3 border-t border-zinc-800 text-xs text-emerald-400">✅ All 12 schema fields complete!</div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {loading && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-14 text-center">
            <div className="animate-spin h-6 w-6 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
          </div>
        )}

        {!loading && products.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-14 text-center space-y-4">
            <div className="text-4xl">📦</div>
            <h3 className="text-lg font-semibold text-white">No products scanned yet</h3>
            <p className="text-zinc-400 text-sm max-w-md mx-auto">
              Go to Knowledge Graph, enter your store domain, and run a bulk scan. All products will appear here with their AI visibility scores.
            </p>
            <Link href="/knowledge-graph" className="inline-block px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition">🧠 Go to Knowledge Graph →</Link>
          </div>
        )}
      </div>
    </main>
  );
}
