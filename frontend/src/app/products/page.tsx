"use client";

import { useState } from "react";
import Link from "next/link";

export default function ProductsPage() {
  const [urls, setUrls] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const scan = async () => {
    const list = urls.split("\n").map(u => u.trim()).filter(Boolean);
    if (!list.length) return;
    setLoading(true);
    try {
      const res = await fetch("/api/audit/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls: list }) });
      const data = await res.json();
      setResults(data.products || []);
    } catch {}
    setLoading(false);
  };

  const scoreColor = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-yellow-400" : "text-red-400";

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-4 py-10 space-y-8">
      <div>
        <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
        <h1 className="text-3xl font-bold mt-1">Products</h1>
        <p className="text-zinc-400 text-sm mt-1">Paste product URLs — one per line — to compare Schema & AI visibility.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <textarea value={urls} onChange={e => setUrls(e.target.value)} placeholder="https://store.com/products/item1&#10;https://store.com/products/item2&#10;https://store.com/products/item3" rows={5} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm resize-y" />
        <button onClick={scan} disabled={loading || !urls.trim()} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">{loading ? "Scanning..." : "Scan Products"}</button>
      </div>

      {results.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 text-left text-zinc-500 text-xs uppercase">
              <th className="p-3">Product</th><th className="p-3">Schema</th><th className="p-3">Content</th><th className="p-3">Action</th>
            </tr></thead>
            <tbody>
              {results.map((p: any, i: number) => (
                <tr key={i} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/30">
                  <td className="p-3">
                    <div className="text-zinc-200 max-w-xs truncate">{p.title || p.url}</div>
                    <div className="text-xs text-zinc-600 truncate max-w-xs">{p.url}</div>
                  </td>
                  <td className="p-3">
                    <span className={scoreColor((p.field_count || 0) * 8)}>{p.field_count || 0}/12</span>
                    {p.has_product_schema ? <span className="text-xs text-emerald-500 ml-2">✅</span> : <span className="text-xs text-red-500 ml-2">❌</span>}
                  </td>
                  <td className="p-3"><span className={scoreColor(p.content_quality_score || 0)}>{p.content_quality_score || 0}/100</span></td>
                  <td className="p-3">
                    <Link href={`/audit/product?url=${encodeURIComponent(p.url)}`} className="text-xs text-emerald-400 hover:text-emerald-300">Audit →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
