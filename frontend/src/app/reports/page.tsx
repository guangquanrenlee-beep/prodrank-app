"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

interface WeeklyReport {
  week: string; week_label: string; avg_score: number;
  high: number; low: number; sample_count: number;
  breakdown: Record<string, number>;
}

const sc = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-amber-400" : "text-red-400";

export default function ReportsPage() {
  const { user, loading: l } = useAuth();
  const [tab, setTab] = useState<"weekly" | "history">("weekly");
  const [weekly, setWeekly] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) { loadWeekly(); loadHistory(); } }, [user]);

  const loadWeekly = async () => {
    setLoading(true);
    try { const r = await fetch("/api/reports/weekly"); if (r.ok) setWeekly(await r.json()); } catch {}
    setLoading(false);
  };
  const loadHistory = async () => {
    try { const r = await fetch("/api/reports/history?days=90"); if (r.ok) setHistory(await r.json()); } catch {}
  };
  const handlePrint = () => window.print();

  if (l) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full"/></main>;
  if (!user) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to access</p><Link href="/login" className="text-emerald-400">Sign in</Link></div></main>;

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <div><Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">Dashboard</Link><h1 className="text-3xl font-bold mt-1">Reports</h1><p className="text-zinc-400 text-sm mt-1">Weekly score summaries and historical trends.</p></div>
          <button onClick={handlePrint} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm rounded-lg">Export PDF</button>
        </div>
        <div className="flex gap-2 border-b border-zinc-800 pb-2">
          {(["weekly","history"] as const).map(t => <button key={t} onClick={()=>setTab(t)} className={"px-4 py-2 text-sm rounded-t-lg capitalize "+(tab===t?"bg-zinc-900 text-white border border-zinc-800 border-b-zinc-900":"text-zinc-500")}>{t==="weekly"?"This Week":"History"}</button>)}
        </div>

        {tab==="weekly" && weekly && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
              <div className="text-xs text-zinc-500 mb-2">Weekly AI Report - {weekly.domain}</div>
              <div className={"text-8xl font-bold tracking-tight "+sc(weekly.current_score)}>{weekly.current_score}</div>
              <div className="flex justify-center gap-2 mt-2">{weekly.change!==0?<span className={"text-sm "+(weekly.change>0?"text-emerald-400":"text-red-400")}>{weekly.change>0?"+"+weekly.change:weekly.change} from last week</span>:<span className="text-sm text-zinc-500">No change</span>}</div>
            </div>
            {Object.keys(weekly.breakdown||{}).length>0 && <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6"><h3 className="font-semibold mb-4">Score Breakdown</h3><div className="grid grid-cols-4 gap-3">{Object.entries(weekly.breakdown).map(([k,v]:[string,any])=><div key={k} className="bg-zinc-800/30 rounded-xl p-4 text-center"><div className={"text-2xl font-bold "+sc(v.score)}>{v.score}</div><div className="text-xs text-zinc-500">{v.label||k}</div></div>)}</div></div>}
            {weekly.this_week_snapshots?.length>1 && <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6"><h3 className="font-semibold mb-4">This Week</h3><div className="flex items-end gap-2 h-28">{weekly.this_week_snapshots.map((s:any,i:number)=>{const mx=Math.max(...weekly.this_week_snapshots.map((x:any)=>x.score),1);return <div key={i} className="flex-1 flex flex-col items-center gap-1"><span className="text-xs text-zinc-500">{s.score}</span><div className="w-full bg-emerald-500/60 rounded-t-sm" style={{height:Math.max(8,s.score/mx*100)+"px"}}/><span className="text-xs text-zinc-700">{s.date.slice(5)}</span></div>})}</div></div>}
          </div>
        )}

        {tab==="history" && history && (
          <div className="space-y-6">
            {history.stats && <div className="grid grid-cols-4 gap-3">{[{l:"Total Scans",v:history.stats.total_scans},{l:"Change",v:(history.stats.overall_change||0)>=0?"+"+history.stats.overall_change:""+history.stats.overall_change,c:(history.stats.overall_change||0)>=0?"text-emerald-400":"text-red-400"},{l:"Average",v:history.stats.avg_score},{l:"Best",v:history.stats.best_score,c:"text-emerald-400"}].map((s,i)=><div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center"><div className={"text-2xl font-bold "+(s.c||"text-zinc-400")}>{s.v}</div><div className="text-xs text-zinc-500">{s.l}</div></div>)}</div>}
            {history.snapshots?.length>1 && <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6"><h3 className="font-semibold mb-4">90-Day Trend</h3><div className="flex items-end gap-1 h-32">{history.snapshots.map((s:any,i:number)=>{const mx=Math.max(...history.snapshots.map((x:any)=>x.score),1);return <div key={i} className="flex-1 bg-emerald-500/40 rounded-t-sm" style={{height:Math.max(3,s.score/mx*120)+"px"}} title={s.date+": "+s.score}/>})}</div></div>}
            <h3 className="font-semibold">Weekly Reports ({history.reports?.length||0})</h3>
            {!history.reports?.length?<div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-zinc-500">Not enough data yet.</div>:history.reports.map((r:WeeklyReport)=><div key={r.week} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"><div className="flex justify-between"><div><span className="text-sm font-semibold text-zinc-200">W{r.week.split("W")[1]}</span><span className="text-xs text-zinc-500 ml-3">{r.week_label}</span></div><div className="flex gap-4"><span className="text-xs text-zinc-500">H{r.high}</span><span className="text-xs text-zinc-600">L{r.low}</span><span className={"text-lg font-bold "+sc(r.avg_score)}>{r.avg_score}</span></div></div></div>)}
          </div>
        )}

        {loading && !weekly && <div className="text-center py-10"><div className="animate-spin h-6 w-6 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto"/></div>}
      </div>
    </main>
  );
}
