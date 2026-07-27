"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function OptimizePage() { return <Suspense fallback={<div className="p-10 text-zinc-400">Loading...</div>}><OptimizeContent /></Suspense>; }

function OptimizeContent() {
  const params = useSearchParams();
  const urlParam = params.get("url") || params.get("domain") || "";
  const [url, setUrl] = useState(urlParam); const [fixes, setFixes] = useState<any>(null); const [loading, setLoading] = useState(false);
  const run = async () => { setLoading(true); try { const r = await fetch("/api/optimize/fixes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim(), use_ai: false }) }); if (r.ok) setFixes(await r.json()); } catch {} setLoading(false); };
  const pMap: Record<string,string> = { critical: "border-red-500", high: "border-yellow-500", medium: "border-zinc-500" };
  return (<main className="min-h-screen max-w-4xl mx-auto px-4 py-10 space-y-6">
    <Link href="/dashboard" className="text-zinc-500 text-sm">← Dashboard</Link>
    <h1 className="text-2xl font-bold">Optimization Center</h1>
    <div className="space-y-2">
      <div className="flex gap-3"><input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste a product page URL..." className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /><button onClick={run} disabled={loading} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition">{loading ? "..." : "Generate Fixes"}</button></div>
      <p className="text-xs text-zinc-600">Paste a product page URL from your store (e.g. https://yourstore.com/products/blue-jeans). We'll audit its Schema and generate the JSON-LD you need to copy into your site.</p>
    </div>
    {fixes?.fixes && (<div className="space-y-4">{fixes.fixes.map((f:any,i:number) => (<div key={i} className={`bg-zinc-900 border-l-4 rounded-xl p-5 ${pMap[f.priority]||"border-zinc-700"}`}><div className="flex justify-between"><span className="text-sm font-medium text-zinc-200">{f.schema_type}</span><span className={`text-xs px-2 py-0.5 rounded-full ${f.priority==="critical"?"bg-red-900/50 text-red-400":"bg-amber-900/50 text-amber-400"}`}>{f.priority}</span></div><div className="text-xs text-zinc-500 mt-1">{f.note}</div><details className="mt-3"><summary className="text-xs text-emerald-400 cursor-pointer">View JSON-LD</summary><pre className="mt-2 text-xs text-zinc-300 bg-zinc-950 p-3 rounded-lg overflow-x-auto max-h-60">{f.json_ld.slice(0,800)}</pre></details></div>))}</div>)}
  </main>);
}
