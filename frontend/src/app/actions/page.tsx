"use client";
import { useState } from "react";
import Link from "next/link";

interface Action { what_to_do: string; how_to_do_it: string; auto_fixable: boolean; severity: string; effort: string; impact: string; if_cannot_fix: string; }
type Tier = "auto" | "guided" | "monitor";

export default function ActionCenterPage() {
  const [domain, setDomain] = useState(""); const [actions, setActions] = useState<Action[]>([]); const [loading, setLoading] = useState(false);

  const scan = async () => {
    if (!domain.trim()) return; setLoading(true);
    try { const r = await fetch("/api/next-steps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: `https://${domain.trim()}`, product_name: domain.trim() }) }); if (r.ok) { const d = await r.json(); setActions(d.action_plan || []); } } catch {}
    setLoading(false);
  };

  const getTier = (a: Action): Tier => a.auto_fixable ? "auto" : a.severity === "critical" && !a.auto_fixable ? "guided" : "monitor";

  const tiers: { key: Tier; label: string; color: string; bg: string; border: string; desc: string; icon: string; }[] = [
    { key: "auto", label: "Auto Fix", color: "text-emerald-400", bg: "bg-emerald-900/20", border: "border-emerald-800", desc: "One click. Done.", icon: "🟢" },
    { key: "guided", label: "Guided Action", color: "text-amber-400", bg: "bg-amber-900/20", border: "border-amber-800", desc: "We show you how. You execute.", icon: "🟡" },
    { key: "monitor", label: "Monitor Only", color: "text-zinc-400", bg: "bg-zinc-800/30", border: "border-zinc-700", desc: "We track. You watch.", icon: "⚪" },
  ];

  const grouped: Record<Tier, Action[]> = { auto: [], guided: [], monitor: [] };
  actions.forEach(a => { const t = getTier(a); grouped[t].push(a); });

  return (<main className="min-h-screen max-w-5xl mx-auto px-4 py-10 space-y-8">
    <div className="flex items-center justify-between">
      <div><Link href="/dashboard" className="text-zinc-500 text-sm">← Dashboard</Link><h1 className="text-3xl font-bold mt-1">Action Center</h1><p className="text-zinc-400 text-sm mt-1">What to fix now. What needs effort. What to watch.</p></div>
    </div>
    <div className="flex gap-3"><input value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourstore.com" className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" /><button onClick={scan} disabled={loading} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">{loading ? "Scanning..." : "Analyze"}</button></div>

    {actions.length > 0 && (<div className="space-y-8">
      {tiers.map(tier => { const items = grouped[tier.key]; if (!items.length) return null;
        return (<section key={tier.key} className={`${tier.bg} border ${tier.border} rounded-2xl p-6`}>
          <div className="flex items-center gap-2 mb-4"><span className="text-xl">{tier.icon}</span><h2 className={`text-lg font-semibold ${tier.color}`}>{tier.label}</h2><span className="text-xs text-zinc-500 ml-2">{tier.desc}</span></div>
          <div className="space-y-3">
            {items.map((a, i) => (<div key={i} className="bg-zinc-900/60 rounded-lg p-4 flex items-start justify-between gap-4">
              <div className="flex-1"><div className="text-sm font-medium text-zinc-200">{a.what_to_do}</div><div className="text-xs text-zinc-500 mt-1">{a.how_to_do_it.slice(0, 150)}{a.how_to_do_it.length > 150 ? "..." : ""}</div><div className="flex items-center gap-3 mt-2"><span className="text-xs text-zinc-600">⏱ {a.effort}</span><span className="text-xs text-zinc-600">📈 {a.impact.slice(0, 60)}</span></div></div>
              <div className="shrink-0 flex flex-col items-end gap-2">
                {tier.key === "auto" && <Link href="/optimize" className="text-xs px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition">Fix Now</Link>}
                {tier.key === "guided" && a.if_cannot_fix && <div className="text-xs text-amber-400 bg-amber-900/30 px-2 py-1 rounded">💡 View Guide</div>}
                {tier.key === "monitor" && <Link href="/monitoring" className="text-xs px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition">Monitor</Link>}
              </div>
            </div>))}
          </div>
        </section>);
      })}
    </div>)}
    {!loading && actions.length === 0 && <div className="text-center py-16 text-zinc-500">Enter your domain to see your action plan.</div>}
  </main>);
}
