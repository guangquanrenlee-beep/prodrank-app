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

interface SiteItem {
  id: string; domain: string; ai_visibility_score?: number;
}

export default function ProductsPage() {
  const { user, loading: l } = useAuth();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [siteId, setSiteId] = useState("");
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<"score" | "name">("score");
  const [search, setSearch] = useState("");
  const sc = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-amber-400" : "text-red-400";

  useEffect(() => {
    if (user) {
      supabase.from("sites").select("id,domain").eq("user_id", user.id).order("updated_at", { ascending: false })
        .then(({ data }) => {
          if (data?.length) { setSites(data as SiteItem[]); setSiteId(data[0].id); loadProducts(data[0].id); }
        });
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
              <p className="text-zinc-400 text-sm mt-1">All products ranked by AI visibility score. Fix low-scoring products first.</p>
            </div>
            <div className="flex items-center gap-2">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…" className="w-40 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 text-xs" />
              <select value={sort} onChange={e => setSort(e.target.value as any)} className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs">
                <option value="score">Sort by Score ↑</option>
                <option value="name">Sort by Name</option>
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
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total Products", value: products.length, color: "" },
              { label: "Low Score (<40)", value: low, color: "text-red-400" },
              { label: "Medium (40-69)", value: med, color: "text-amber-400" },
              { label: "High (70+)", value: high, color: "text-emerald-400" },
            ].map((s, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${s.color || "text-zinc-400"}`}>{s.value}</div>
                <div className="text-xs text-zinc-500">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {loading && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-14 text-center">
            <div className="animate-spin h-6 w-6 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
          </div>
        )}

        {!loading && products.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-14 text-center space-y-3">
            <div className="text-4xl">📦</div>
            <h3 className="text-lg font-semibold text-white">No products found</h3>
            <p className="text-zinc-400 text-sm">
              Run a site audit from Dashboard to discover and analyze your products. Each product gets an AI visibility score.
            </p>
            <Link href="/dashboard" className="inline-block px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition">Run Site Audit →</Link>
          </div>
        )}

        {filtered.map(p => {
          const score = p.ai_visibility_score || 0;
          const fields = p.schema_fields || 0;
          return (
            <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-14 text-center">
                  <div className={`text-2xl font-bold ${sc(score)}`}>{score}</div>
                  <div className="text-xs text-zinc-600">AI Score</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-zinc-200 truncate">{p.title || "Untitled Product"}</h3>
                    {p.brand && <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{p.brand}</span>}
                    {p.sku && <span className="text-xs text-zinc-600">SKU: {p.sku}</span>}
                  </div>
                  {p.url && <div className="text-xs text-zinc-600 mt-0.5 truncate">{p.url}</div>}
                  <div className="flex items-center gap-4 mt-2 text-xs">
                    <span className={fields >= 8 ? "text-emerald-400" : fields >= 4 ? "text-amber-400" : "text-red-400"}>Schema: {fields}/12</span>
                    <span className="text-zinc-500">Content: {p.content_quality_score || 0}/100</span>
                    {p.price && <span className="text-zinc-500">{p.price}</span>}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <div className="w-20 bg-zinc-800 rounded-full h-2 mb-1">
                    <div className={`h-2 rounded-full ${score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.max(score, 5)}%` }} />
                  </div>
                  <div className="text-xs text-zinc-500 text-right">Fix →</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
