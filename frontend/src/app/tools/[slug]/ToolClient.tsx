"use client";
import { useState } from "react";
import Link from "next/link";
import { TOOLS } from "@/lib/content";
import Breadcrumbs from "@/components/Breadcrumbs";

export function ToolClient({ tool }: { tool: typeof TOOLS[0] }) {
  const [input, setInput] = useState(""); const [result, setResult] = useState<any>(null); const [loading, setLoading] = useState(false);

  const run = async () => { if (!input.trim()) return; setLoading(true); try { const r = await fetch(tool.endpoint || "", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: input, domain: input, product_name: input }) }); if (r.ok) setResult(await r.json()); } catch {} setLoading(false); };

  return (<main className="min-h-screen max-w-3xl mx-auto px-4 py-10 space-y-6">
    <Breadcrumbs items={[{ label: "Free Tools", href: "/tools" }, { label: tool.title }]} />
    <div className="text-center"><div className="text-5xl mb-3">{tool.icon}</div><h1 className="text-3xl font-bold">{tool.title}</h1><p className="text-zinc-400 mt-2">{tool.desc}</p></div>
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex gap-3">
      <input value={input} onChange={e => setInput(e.target.value)} placeholder="Enter URL or domain..." className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      <button onClick={run} disabled={loading} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition">{loading ? "..." : "Check"}</button>
    </div>
    {result && (<div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
      {result.ai_visibility_score !== undefined ? (
        <div className="text-center"><div className={`text-4xl font-bold ${result.ai_visibility_score>=70?"text-emerald-400":result.ai_visibility_score>=40?"text-yellow-400":"text-red-400"}`}>{result.ai_visibility_score}</div><div className="text-sm text-zinc-500">AI Visibility Score — {result.label}</div></div>
      ) : result.field_count !== undefined ? (
        <div className="text-center"><div className="text-4xl font-bold text-emerald-400">{result.field_count}/{result.max_fields}</div><div className="text-sm text-zinc-500">Schema fields present</div></div>
      ) : result.fixes ? (
        <div className="text-center"><div className="text-4xl font-bold text-emerald-400">{result.fixes.length}</div><div className="text-sm text-zinc-500">Schema fixes generated</div></div>
      ) : result.total_citations ? (
        <div className="text-center"><div className="text-4xl font-bold text-emerald-400">{result.total_citations}</div><div className="text-sm text-zinc-500">Citations found</div></div>
      ) : null}
      <details><summary className="text-xs text-zinc-500 cursor-pointer">View raw response</summary><pre className="text-xs text-zinc-300 overflow-x-auto max-h-60 mt-2">{JSON.stringify(result, null, 2).slice(0, 800)}</pre></details>
    </div>)}
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{TOOLS.map(t => (<Link key={t.slug} href={`/tools/${t.slug}`} className={`bg-zinc-900 border rounded-lg p-3 text-center transition ${t.slug === tool.slug ? "border-emerald-600" : "border-zinc-800 hover:border-zinc-600"}`}><div className="text-xl">{t.icon}</div><div className="text-xs text-zinc-300 mt-1">{t.title}</div></Link>))}</div>
    <div className="text-center"><Link href="/" className="inline-block px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition">Get full ProdRank →</Link></div>
  </main>);
}
