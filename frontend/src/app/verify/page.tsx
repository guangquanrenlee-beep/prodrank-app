"use client";

import { useState } from "react";
import Link from "next/link";

interface VerifySnapshot { snapshot_id: string; product_name: string; keyword: string; best_rank: number | null; mentioned_by: string[]; not_mentioned_by: string[]; agent_details: { agent: string; rank: number | null; description: string; sentiment: string }[] }

export default function VerifyPage() {
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [brand, setBrand] = useState("");
  const [before, setBefore] = useState<VerifySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stored, setStored] = useState<any[]>([]);

  const loadStored = () => { const raw = localStorage.getItem("prodrank_verifications"); if (raw) setStored(JSON.parse(raw)); };

  const runBefore = async () => {
    if (!keyword) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_name: brand, keyword, brand }) });
      const data = await res.json();
      setBefore(data.snapshot);
      const all = [...stored, data.snapshot];
      localStorage.setItem("prodrank_verifications", JSON.stringify(all));
      setStored(all);
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  };

  const runAfter = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_name: brand, keyword, brand }) });
      const data = await res.json();
      if (before) {
        const delta = (data.snapshot.mentioned_by?.length || 0) - (before.mentioned_by?.length || 0);
        alert(`Verification complete!\nBefore: ${before.mentioned_by?.join(", ") || "none"}\nAfter: ${data.snapshot.mentioned_by?.join(", ") || "none"}\nDelta: ${delta > 0 ? "+" + delta : delta}`);
      }
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  };

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-10 space-y-8">
      <div>
        <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
        <h1 className="text-3xl font-bold mt-1">Verification — Before & After</h1>
        <p className="text-zinc-400 text-sm mt-1">Prove your optimization is working. Run a "before" snapshot, make changes, then run "after".</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Product URL (optional)" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Keyword *" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Brand/Product name *" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div className="flex gap-3">
          <button onClick={runBefore} disabled={loading || !keyword || !brand} className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">{loading ? "Running..." : "📸 Take 'Before' Snapshot"}</button>
          <button onClick={runAfter} disabled={loading || !before || !keyword || !brand} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">{loading ? "Running..." : "✅ Take 'After' Snapshot"}</button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>

      {before && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold mb-3">Before Snapshot: {before.snapshot_id}</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-zinc-500">Keyword:</span> {before.keyword}</div>
            <div><span className="text-zinc-500">Best Rank:</span> {before.best_rank ? `#${before.best_rank}` : "Not ranked"}</div>
            <div><span className="text-zinc-500">Mentioned by:</span> {before.mentioned_by.join(", ") || "none"}</div>
            <div><span className="text-zinc-500">Not mentioned:</span> {before.not_mentioned_by.join(", ") || "all"}</div>
          </div>
          <div className="mt-4 space-y-2">
            {before.agent_details.map(a => (
              <div key={a.agent} className="flex items-center gap-2 text-sm bg-zinc-800/50 rounded-lg px-3 py-2">
                <span className="capitalize text-zinc-300 w-20">{a.agent}</span>
                <span className={a.rank ? "text-emerald-400" : "text-red-400"}>{a.rank ? `#${a.rank}` : "Not ranked"}</span>
                {a.description && <span className="text-zinc-500 truncate">{a.description.slice(0, 80)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {stored.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold mb-3">Previous Snapshots</h3>
          <div className="space-y-2">
            {stored.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-sm bg-zinc-800/30 rounded-lg px-3 py-2">
                <span className="text-zinc-300">{s.product_name} — "{s.keyword}"</span>
                <span className="text-xs text-zinc-500">{s.snapshot_id}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
