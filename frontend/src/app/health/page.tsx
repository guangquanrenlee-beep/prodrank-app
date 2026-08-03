"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export default function HealthPage() {
  return <Suspense fallback={<main className="min-h-screen flex items-center justify-center bg-zinc-950"><p className="text-zinc-400">Loading…</p></main>}><HealthContent /></Suspense>;
}

function HealthContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [shop, setShop] = useState(searchParams.get("domain") || "");
  const [trend, setTrend] = useState<any[]>([]);
  const [delta, setDelta] = useState<number | null>(null);
  const [summary, setSummary] = useState("");
  const [alerts, setAlerts] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [sites, setSites] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase.from("sites").select("id,domain,platform").eq("user_id", user.id).limit(50);
        if (data) setSites(data);
      } catch {}
    })();
  }, [user]);

  const load = async (s: string) => {
    if (!s) return;
    try {
      const r = await fetch(`/api/health-check?domain=${encodeURIComponent(s)}`);
      if (r.ok) {
        const d = await r.json();
        setTrend(d.trend || []); setDelta(d.delta ?? null); setSummary(d.summary || "");
      }
      const a = await fetch(`/api/alerts?domain=${encodeURIComponent(s)}`);
      if (a.ok) setAlerts((await a.json()).alerts || []);
    } catch {}
  };

  useEffect(() => { load(shop); }, [shop]);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      await fetch("/api/health-check/run", { method: "POST", headers: sess.session?.access_token ? { Authorization: `Bearer ${sess.session.access_token}` } : {} });
      if (shop) load(shop);
    } finally { setRunning(false); }
  };

  const sc = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-amber-400" : "text-red-400";

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
            <h1 className="text-3xl font-bold mt-1">🩺 Daily Health Check</h1>
            <p className="text-zinc-500 text-sm mt-1">Daily regression detection — theme updates, gutted descriptions, lost Schema/FAQ. No AI, ~zero cost.</p>
          </div>
          <button onClick={runNow} disabled={running} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">
            {running ? "Running…" : "▶ Run now"}
          </button>
        </div>

        {/* Store selector */}
        <div className="flex gap-2 flex-wrap">
          {sites.map((s: any) => (
            <button key={s.id} onClick={() => setShop(s.domain)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition ${shop === s.domain ? "bg-emerald-900/40 border border-emerald-700 text-emerald-300" : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800"}`}>
              {s.domain}
            </button>
          ))}
        </div>

        {/* Trend */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Score trend — {shop || "select a store"}</h2>
            <span className={`text-sm font-bold ${(delta ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {delta === null ? "" : delta >= 0 ? `▲ +${delta}` : `▼ ${delta}`}
            </span>
          </div>
          {trend.length > 0 ? (
            <>
              <div className="flex items-end gap-2 h-40 mb-4">
                {trend.map((h: any) => (
                  <div key={h.date} className="flex-1 flex flex-col items-center gap-1">
                    <span className={`text-[10px] ${sc(h.score)}`}>{h.score}</span>
                    <div className={`w-full rounded-t ${sc(h.score)} bg-current opacity-80`} style={{ height: `${Math.max(6, h.score)}%` }} />
                    <span className="text-[10px] text-zinc-600">{h.date.slice(5)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-500">Today: {summary}</p>
            </>
          ) : (
            <p className="text-sm text-zinc-600">No snapshots yet — run the check above (or it runs automatically daily at ~2am).</p>
          )}
        </div>

        {/* Alerts */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">⚠️ Alerts</h2>
          {alerts.length > 0 ? (
            <div className="space-y-2">
              {alerts.map((a: any) => (
                <div key={a.id} className={`text-sm rounded-lg px-4 py-3 ${a.severity === "critical" ? "bg-red-900/20 border border-red-800/40 text-red-300" : a.severity === "warning" ? "bg-amber-900/20 border border-amber-800/40 text-amber-300" : "bg-zinc-800/50 text-zinc-400"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span>{a.severity === "critical" ? "🔴" : a.severity === "warning" ? "🟡" : "🔵"} {a.message}</span>
                    <span className="flex items-center gap-2">
                      {a.details?.action?.studio_url && <Link href={a.details.action.studio_url} className="text-emerald-400 hover:text-emerald-300">Fix →</Link>}
                      <span className="text-[10px] text-zinc-600 whitespace-nowrap">{(a.created_at || "").slice(0, 16).replace("T", " ")}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-600">No alerts. All quiet.</p>
          )}
        </div>
      </div>
    </main>
  );
}
