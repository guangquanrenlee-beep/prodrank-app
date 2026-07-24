"use client";
import { useState } from "react";
import Link from "next/link";
export default function VisibilityPage() {
  const [domain, setDomain] = useState(""); const [score, setScore] = useState<any>(null); const [loading, setLoading] = useState(false);
  const run = async () => { setLoading(true); try { const r = await fetch("/api/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: `https://${domain.trim()}`, product_name: domain.trim() }) }); if (r.ok) setScore(await r.json()); } catch {} setLoading(false); };
  return (<main className="min-h-screen max-w-4xl mx-auto px-4 py-10 space-y-6">
    <Link href="/dashboard" className="text-zinc-500 text-sm">← Dashboard</Link>
    <h1 className="text-2xl font-bold">AI Visibility</h1>
    <div className="flex gap-3"><input value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourstore.com" className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /><button onClick={run} disabled={loading} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition">{loading ? "..." : "Check"}</button></div>
    {score && (<div className="space-y-4"><div className="bg-zinc-900 rounded-xl p-8 text-center"><div className="text-6xl font-bold text-emerald-400">{score.ai_visibility_score}</div><div className="text-sm text-zinc-500 mt-2">{score.label}</div><p className="text-zinc-400 text-sm mt-2">{score.recommendation}</p></div>
    <div className="bg-zinc-900 rounded-xl p-6"><h3 className="font-semibold mb-3">Dimensions</h3><div className="space-y-2">{Object.entries(score.breakdown).map(([k,v]:any) => (<div key={k}><div className="flex justify-between text-sm"><span className="text-zinc-400 capitalize">{k.replace(/_/g," ")}</span><span className="text-zinc-500">{v.weight}%</span></div><div className="w-full bg-zinc-800 h-2 rounded-full mt-0.5"><div className={`h-2 rounded-full ${v.score>=70?"bg-emerald-500":v.score>=40?"bg-yellow-500":"bg-red-500"}`} style={{width:Math.max(v.score,5)+"%"}} /></div></div>))}</div></div></div>)}
  </main>);
}
