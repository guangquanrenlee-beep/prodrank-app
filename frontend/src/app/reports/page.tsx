"use client";
import Link from "next/link";
export default function ReportsPage() {
  return (<main className="min-h-screen max-w-3xl mx-auto px-4 py-10 space-y-6">
    <Link href="/dashboard" className="text-zinc-500 text-sm">← Dashboard</Link>
    <h1 className="text-2xl font-bold">Reports</h1>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[{ title: "AI Visibility Report", desc: "Comprehensive site audit — Schema coverage, knowledge gaps, AI understanding.", href: "/analytics" }, { title: "Competitor Comparison", desc: "Side-by-side Schema + AI ranking comparison with 3 competitors.", href: "/compare" }, { title: "Citation Analysis", desc: "Source influence scores and citation patterns across AI agents.", href: "/cite" }, { title: "Verification History", desc: "Before/After snapshots proving optimization ROI.", href: "/verify" }].map(r => (<Link key={r.href} href={r.href} className="bg-zinc-900 border border-zinc-800 hover:border-emerald-700 rounded-xl p-5 transition"><h3 className="font-medium text-zinc-200">{r.title}</h3><p className="text-sm text-zinc-500 mt-1">{r.desc}</p></Link>))}
    </div>
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-center text-zinc-500 text-sm">Scheduled email reports coming in Phase 2 — weekly AI visibility digests delivered to your inbox.</div>
  </main>);
}
