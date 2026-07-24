"use client";
import { useState } from "react";
import Link from "next/link";
export default function MonitoringPage() {
  const [keyword, setKeyword] = useState(""); const [brand, setBrand] = useState("");
  const [results, setResults] = useState<any>(null); const [loading, setLoading] = useState(false);
  const run = async () => { setLoading(true); try { const r = await fetch("/api/rank/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_name: brand, keyword, brand }) }); if (r.ok) setResults(await r.json()); } catch {} setLoading(false); };
  return (<main className="min-h-screen max-w-4xl mx-auto px-4 py-10 space-y-6">
    <Link href="/dashboard" className="text-zinc-500 text-sm">← Dashboard</Link>
    <h1 className="text-2xl font-bold">AI Ranking Monitor</h1>
    <p className="text-zinc-400 text-sm">Track your brand across 4 AI agents in real-time.</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Brand or product name" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /><input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Keyword (e.g. best winter jacket)" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
    <button onClick={run} disabled={loading} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition">{loading ? "Querying 4 AI agents..." : "Check Now"}</button>
    {results && (<div className="grid grid-cols-2 gap-4">{results.results.map((r:any) => (<div key={r.ai_agent} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"><div className="flex justify-between"><span className="font-medium capitalize text-zinc-200">{r.ai_agent}</span><span className={r.rank ? "text-emerald-400 text-sm font-bold" : "text-red-400 text-sm"}>Rank #{r.rank || "—"}</span></div>{r.description && <p className="text-xs text-zinc-400 mt-1">{r.description.slice(0,100)}</p>}</div>))}</div>)}
  </main>);
}
