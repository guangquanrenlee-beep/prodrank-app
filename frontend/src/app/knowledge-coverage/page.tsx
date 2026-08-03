"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export default function KnowledgeCoveragePage() {
  return <Suspense fallback={<main className="min-h-screen flex items-center justify-center bg-zinc-950"><p className="text-zinc-400">Loading…</p></main>}><CoverageContent /></Suspense>;
}

function CoverageContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [shop, setShop] = useState(searchParams.get("domain") || "");
  const [sites, setSites] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase.from("sites").select("id,domain").eq("user_id", user.id).limit(50);
        if (data) { setSites(data); if (!shop && data[0]) setShop(data[0].domain); }
      } catch {}
    })();
  }, [user]);

  useEffect(() => { if (shop) load(shop); }, [shop]);

  const load = async (s: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/knowledge/coverage?shop=${encodeURIComponent(s)}`);
      if (r.ok) setProducts((await r.json()).products || []);
    } catch {}
    finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <div>
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
          <h1 className="text-3xl font-bold mt-1">🧠 Knowledge Coverage</h1>
          <p className="text-zinc-500 text-sm mt-1">Which products have AI-generated content, and which still have gaps — jump straight into AI Studio to fill them.</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {sites.map((s: any) => (
            <button key={s.id} onClick={() => setShop(s.domain)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition ${shop === s.domain ? "bg-emerald-900/40 border border-emerald-700 text-emerald-300" : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800"}`}>
              {s.domain}
            </button>
          ))}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                <th className="p-3 font-medium">Product</th>
                <th className="p-3 font-medium">Generated fields</th>
                <th className="p-3 font-medium text-right">Coverage</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p: any) => (
                <tr key={p.product_id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="p-3 text-zinc-300">{p.title || p.product_id}</td>
                  <td className="p-3 text-xs text-zinc-500">{p.generated_fields.length > 0 ? p.generated_fields.join(", ") : "—"}</td>
                  <td className="p-3 text-right">
                    <span className={`text-xs font-bold ${p.field_count >= 8 ? "text-emerald-400" : p.field_count >= 3 ? "text-amber-400" : "text-red-400"}`}>
                      {p.field_count} fields
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    {p.url ? (
                      <Link href={`/studio?url=${encodeURIComponent(p.url)}`} className="text-xs text-emerald-400 hover:text-emerald-300">Optimize →</Link>
                    ) : <span className="text-xs text-zinc-700">—</span>}
                  </td>
                </tr>
              ))}
              {products.length === 0 && !loading && (
                <tr><td colSpan={4} className="p-6 text-center text-sm text-zinc-600">No products yet — sync your store or {shop ? "pick a store above" : "select a store"}.</td></tr>
              )}
            </tbody>
          </table>
          {loading && <p className="p-4 text-center text-sm text-zinc-500">Loading…</p>}
        </div>
      </div>
    </main>
  );
}
