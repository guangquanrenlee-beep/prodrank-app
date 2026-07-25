import { COMPARISONS } from "@/lib/content";
import Link from "next/link";
import { notFound } from "next/navigation";

export function generateStaticParams() { return COMPARISONS.map(c => ({ tool: c.tool })); }

export default async function ComparePage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const c = COMPARISONS.find(x => x.tool === tool);
  if (!c) notFound();

  return (<main className="min-h-screen max-w-3xl mx-auto px-4 py-16 space-y-8">
    <Link href="/" className="text-zinc-500 text-sm">← Home</Link>
    <div className="space-y-4"><h1 className="text-4xl font-bold">ProdRank vs {c.name}</h1><p className="text-lg text-zinc-400">{c.desc}</p></div>
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
      <h2 className="font-semibold">Why choose ProdRank</h2>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="bg-zinc-800/50 rounded-lg p-3"><div className="font-medium text-zinc-200">AI Agent Tracking</div><div className="text-zinc-500 mt-1">ChatGPT, Gemini, Claude, Grok</div></div>
        <div className="bg-zinc-800/50 rounded-lg p-3"><div className="font-medium text-zinc-200">Auto Schema Injection</div><div className="text-zinc-500 mt-1">Shopify App, WP Plugin, inject.js</div></div>
        <div className="bg-zinc-800/50 rounded-lg p-3"><div className="font-medium text-zinc-200">Citation Intelligence</div><div className="text-zinc-500 mt-1">Source influence scoring</div></div>
        <div className="bg-zinc-800/50 rounded-lg p-3"><div className="font-medium text-zinc-200">4-Agent Ranking</div><div className="text-zinc-500 mt-1">Daily monitoring + history</div></div>
      </div>
    </div>
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h3 className="font-semibold mb-3">Also compare:</h3>
      <div className="flex flex-wrap gap-2">{COMPARISONS.filter(x => x.tool !== tool).map(x => (<Link key={x.tool} href={`/compare-prodrank/${x.tool}`} className="text-sm px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition">ProdRank vs {x.name}</Link>))}</div>
    </div>
    <div className="text-center"><Link href="/" className="inline-block px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition">Try ProdRank free →</Link></div>
  </main>);
}
