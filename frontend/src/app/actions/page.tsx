"use client";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function ActionsPage() { return <Suspense fallback={<div className="min-h-screen p-10 text-zinc-400">Loading...</div>}><ActionCenter /></Suspense>; }

function ActionCenter() {
  const params = useSearchParams();
  const urlDomain = params.get("domain") || "";
  const [domain, setDomain] = useState(urlDomain);
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const scanDomain = async (d: string) => { if (!d.trim()) return; setLoading(true); try { const r = await fetch("/api/next-steps", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({url:`https://${d}`,product_name:d}) }); if(r.ok){const dd=await r.json(); setActions(dd.action_plan||[]);} } catch {} setLoading(false); };
  useEffect(() => { if (urlDomain) scanDomain(urlDomain); }, [urlDomain]);

  const tiers = [
    { key:"auto", label:"Auto Fix", color:"text-emerald-400", bg:"bg-emerald-900/20", border:"border-emerald-800", desc:"One click. Done.", icon:"🟢" },
    { key:"guided", label:"Guided Action", color:"text-amber-400", bg:"bg-amber-900/20", border:"border-amber-800", desc:"We show you how.", icon:"🟡" },
    { key:"monitor", label:"Monitor Only", color:"text-zinc-400", bg:"bg-zinc-800/30", border:"border-zinc-700", desc:"We track.", icon:"⚪" },
  ];
  const grouped: any = { auto:[], guided:[], monitor:[] };
  actions.forEach((a:any) => { grouped[a.auto_fixable?"auto":a.severity==="critical"?"guided":"monitor"].push(a); });

  return (<main className="min-h-screen max-w-5xl mx-auto px-4 py-10 space-y-8">
    <div><Link href="/dashboard" className="text-zinc-500 text-sm">← Dashboard</Link><h1 className="text-3xl font-bold mt-1">Action Center</h1></div>
    <div className="flex gap-3"><input value={domain} onChange={e=>setDomain(e.target.value)} placeholder="yourstore.com" className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" /><button onClick={()=>scanDomain(domain)} disabled={loading} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">{loading?"Scanning...":"Analyze"}</button></div>
    {actions.length>0&&<div className="space-y-8">{tiers.map(t=>{const items=grouped[t.key];if(!items.length)return null;return(<section key={t.key} className={`${t.bg} border ${t.border} rounded-2xl p-6`}><div className="flex items-center gap-2 mb-4"><span className="text-xl">{t.icon}</span><h2 className={`text-lg font-semibold ${t.color}`}>{t.label}</h2></div><div className="space-y-3">{items.map((a:any,i:number)=>(<div key={i} className="bg-zinc-900/60 rounded-lg p-4 flex items-start justify-between"><div className="flex-1"><div className="text-sm font-medium text-zinc-200">{a.what_to_do}</div><div className="text-xs text-zinc-500 mt-1">{a.how_to_do_it?.slice(0,150)}</div></div><div className="shrink-0">{t.key==="auto"?<Link href="/optimize" className="text-xs px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition">Fix Now</Link>:t.key==="guided"?<span className="text-xs text-amber-400">💡 View Guide</span>:<Link href="/monitoring" className="text-xs px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition">Monitor</Link>}</div></div>))}</div></section>)})}</div>}
    {!loading&&actions.length===0&&<div className="text-center py-16 text-zinc-500">Enter your domain or <Link href="/dashboard" className="text-emerald-400 underline">go to Dashboard</Link></div>}</main>);
}
