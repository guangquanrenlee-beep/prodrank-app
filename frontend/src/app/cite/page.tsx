"use client";

import { useState } from "react";
import Link from "next/link";

export default function CitePage() {
  const [category, setCategory] = useState("");
  const [keywords, setKeywords] = useState("");
  const [data, setData] = useState<any>(null);
  const [influence, setInfluence] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runReport = async () => {
    if (!category.trim()) return;
    setLoading(true);
    try {
      const kws = keywords ? keywords.split(",").map(k => k.trim()).filter(Boolean) : [`best ${category}`];
      const [reportRes, influenceRes] = await Promise.all([
        fetch("/api/cite/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, keywords: kws }) }),
        fetch(`/api/cite/influence?category=${encodeURIComponent(category)}`).then(r => r.json()),
      ]);
      setData(await reportRes.json());
      setInfluence(influenceRes);
    } catch {}
    setLoading(false);
  };

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 py-10 space-y-8">
      <div>
        <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
        <h1 className="text-3xl font-bold mt-1">Citation Intelligence</h1>
        <p className="text-zinc-400 text-sm mt-1">Which sources do AI agents trust in your category? Who are your competitors cited by?</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex gap-3">
        <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category (e.g. headphones)" className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="Keywords, comma separated" className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <button onClick={runReport} disabled={loading || !category.trim()} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">{loading ? "Scanning..." : "Scan"}</button>
      </div>

      {influence?.sources?.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold mb-4">Source Influence Scores — {category}</h3>
          <div className="space-y-3">
            {influence.sources.slice(0, 10).map((s: any) => (
              <div key={s.domain} className="flex items-center gap-4">
                <span className="text-sm text-zinc-200 w-40 truncate">{s.domain}</span>
                <div className="flex-1 bg-zinc-800 rounded-full h-3"><div className="bg-emerald-500 h-3 rounded-full" style={{ width: `${s.influence_score}%` }} /></div>
                <span className="text-sm font-bold text-emerald-400 w-10 text-right">{s.influence_score}</span>
                <span className="text-xs text-zinc-600 w-20 text-right">{s.total_citations} cites</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data?.top_domains?.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold mb-3">AI Agent Citations</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.top_domains.map((d: any) => (
              <div key={d.domain} className="bg-zinc-800/50 rounded-lg p-3 flex justify-between items-center">
                <span className="text-sm text-zinc-200">{d.domain}</span>
                <span className="text-xs bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded-full">{d.citations} citations</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
