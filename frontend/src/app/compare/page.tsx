"use client";

import { useState } from "react";
import Link from "next/link";

export default function ComparePage() {
  const [url1, setUrl1] = useState("");
  const [url2, setUrl2] = useState("");
  const [url3, setUrl3] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [bestIdx, setBestIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const compare = async () => {
    const urls = [url1, url2, url3].filter(u => u.trim());
    if (urls.length < 2) return;
    setLoading(true);
    try {
      const res = await fetch("/api/audit/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls }) });
      const data = await res.json();
      setResults(data.products || []);
      setBestIdx(data.best_index);
    } catch {}
    setLoading(false);
  };

  return (
    <main className="min-h-screen max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div>
        <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
        <h1 className="text-3xl font-bold mt-1">Competitor Comparison</h1>
        <p className="text-zinc-400 text-sm mt-1">Compare your product pages against competitors side-by-side.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <input value={url1} onChange={e => setUrl1(e.target.value)} placeholder="URL 1 (e.g. your product)" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <input value={url2} onChange={e => setUrl2(e.target.value)} placeholder="URL 2 (competitor)" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <input value={url3} onChange={e => setUrl3(e.target.value)} placeholder="URL 3 (optional)" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <button onClick={compare} disabled={loading || !url1.trim() || !url2.trim()} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">{loading ? "Comparing..." : "Compare"}</button>
      </div>

      {results.length >= 2 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {results.map((p, i) => (
            <div key={i} className={`bg-zinc-900 border rounded-xl p-5 ${i === bestIdx ? "border-emerald-600 ring-1 ring-emerald-600/30" : "border-zinc-800"}`}>
              {i === bestIdx && <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full mb-2 inline-block">🏆 Best</span>}
              <div className="text-sm font-medium text-zinc-200 truncate mb-3">{p.title || p.url?.split("/").pop()}</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-zinc-500">Schema</span><span className={p.field_count >= 8 ? "text-emerald-400" : p.field_count >= 4 ? "text-yellow-400" : "text-red-400"}>{p.field_count || 0}/12</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Content</span><span className={(p.content_quality_score || 0) >= 60 ? "text-emerald-400" : (p.content_quality_score || 0) >= 30 ? "text-yellow-400" : "text-red-400"}>{p.content_quality_score || 0}/100</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Schema?</span><span>{p.has_product_schema ? "✅" : "❌"}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">FAQ?</span><span>{p.has_faq_schema ? "✅" : "❌"}</span></div>
              </div>
              {p.content_issues?.length > 0 && <div className="mt-3 pt-3 border-t border-zinc-800"><div className="text-xs text-zinc-500 mb-1">Issues:</div>{p.content_issues.slice(0, 3).map((iss: string, j: number) => <div key={j} className="text-xs text-red-400">• {iss}</div>)}</div>}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
