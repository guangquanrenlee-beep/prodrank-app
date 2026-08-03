"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

interface RankSnap { ai_agent: string; rank: number | null; description: string; sentiment: string; checked_at?: string; }

export default function MonitoringPage() {
  const { user } = useAuth();
  const [keyword, setKeyword] = useState(""); const [brand, setBrand] = useState("");
  const [snapshot, setSnapshot] = useState<any>(null); const [history, setHistory] = useState<Record<string, RankSnap[]>>({});
  const [mentions, setMentions] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMentions, setLoadingMentions] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [healthAlerts, setHealthAlerts] = useState<any[]>([]);

  // Auto-monitoring: daily health, alerts, regression — all on one page.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("sites").select("domain").eq("user_id", user?.id || "").limit(1);
        const shop = data?.[0]?.domain;
        if (!shop) return;
        const r = await fetch(`/api/health-check?domain=${encodeURIComponent(shop)}`);
        if (r.ok) setHealth(await r.json());
        const a = await fetch(`/api/alerts?domain=${encodeURIComponent(shop)}`);
        if (a.ok) setHealthAlerts((await a.json()).alerts || []);
      } catch {}
    })();
  }, [user]);

  const runTrack = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_name: brand, keyword, brand }) });
      if (r.ok) {
        const d = await r.json();
        setSnapshot(d.snapshot);
        // Group history by agent
        const h: Record<string, RankSnap[]> = {};
        (d.history || []).forEach((item: RankSnap) => {
          const a = item.ai_agent;
          if (!h[a]) h[a] = [];
          h[a].push(item);
        });
        setHistory(h);
      }
    } catch {}
    setLoading(false);
  };

  const runMentions = async () => {
    if (!keyword || !brand) return;
    setLoadingMentions(true);
    try {
      const r = await fetch("/api/mentions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_name: brand, keyword, brand }) });
      if (r.ok) setMentions(await r.json());
    } catch {}
    setLoadingMentions(false);
  };

  const rankIcon = (r: number | null, prev: number | null) => {
    if (r === null) return <span className="text-red-400">✗</span>;
    if (prev === null || prev === undefined) return <span className="text-emerald-400">#{r}</span>;
    if (r < prev) return <span className="text-emerald-400">#{r} ↑</span>;
    if (r > prev) return <span className="text-red-400">#{r} ↓</span>;
    return <span className="text-yellow-400">#{r} →</span>;
  };

  const getPrevRank = (agent: string, currentRank: number | null) => {
    const h = history[agent];
    if (!h || h.length < 2) return null;
    return h[1].rank;
  };

  return (
    <main className="min-h-screen max-w-5xl mx-auto px-4 py-10 space-y-6">
      <Link href="/dashboard" className="text-zinc-500 text-sm">← Dashboard</Link>
      <div>
        <h1 className="text-2xl font-bold">📈 Monitoring</h1>
        <p className="text-sm text-zinc-500">AI ranking, daily health, alerts and recommendation regressions — one place.</p>

        {/* Auto-monitoring blocks: health + alerts + regression */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-sm">🩺 Daily Health Check</h2>
              <Link href="/health" className="text-xs text-emerald-400 hover:text-emerald-300">Details →</Link>
            </div>
            {health?.trend?.length > 0 ? (
              <>
                <div className="flex items-end gap-1 h-12 mb-2">
                  {health.trend.slice(-7).map((h: any) => (
                    <div key={h.date} title={`${h.date}: ${h.score}`}
                         className={`flex-1 rounded-t ${h.score >= 70 ? "bg-emerald-500" : h.score >= 40 ? "bg-amber-500" : "bg-red-500"} opacity-80`}
                         style={{ height: `${Math.max(8, h.score)}%` }} />
                  ))}
                </div>
                <div className="text-xs text-zinc-400">Latest <strong>{health.trend[health.trend.length - 1]?.score}</strong>
                  {health.delta !== null && <span className={health.delta >= 0 ? "text-emerald-400" : "text-red-400"}> {health.delta >= 0 ? `▲ +${health.delta}` : `▼ ${health.delta}`}</span>}
                </div>
              </>
            ) : <p className="text-xs text-zinc-600">No snapshots yet — runs daily at ~2am.</p>}
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-sm">⚠️ Alerts & Regressions</h2>
              <Link href="/health" className="text-xs text-emerald-400 hover:text-emerald-300">All →</Link>
            </div>
            {healthAlerts.length > 0 ? (
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {healthAlerts.slice(0, 6).map((a: any) => (
                  <div key={a.id} className={`text-xs rounded-lg px-2.5 py-1.5 ${a.severity === "critical" ? "bg-red-900/20 text-red-300" : a.severity === "warning" ? "bg-amber-900/20 text-amber-300" : "bg-zinc-800/50 text-zinc-400"}`}>
                    {a.severity === "critical" ? "🔴" : a.severity === "warning" ? "🟡" : "🔵"} {a.message}
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-zinc-600">No alerts. All quiet.</p>}
          </div>
        </div>
        <p className="text-zinc-400 text-sm mt-1">Track your brand across 4 AI agents — automatically archived for trend analysis.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Brand / Product Name" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Keyword (e.g. best winter jackets)" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>
      <button onClick={runTrack} disabled={loading || !keyword || !brand} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">
        {loading ? "Querying 4 AI agents & saving history..." : "Track Now & Save"}
      </button>

      <button onClick={runMentions} disabled={loadingMentions || !keyword || !brand} className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">
        {loadingMentions ? "Querying & aggregating..." : "📊 AI Mentions Stats (daily)"}
      </button>

      {/* Daily Mentions */}
      {mentions && (
        <div className="bg-zinc-900 border border-emerald-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-emerald-400">📡 AI Mentions — "{mentions.keyword}"</h3>
            <span className="text-xs text-zinc-500">{mentions.today?.mentioned ? "mentioned today" : "not mentioned today"}</span>
          </div>

          {/* Today summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-zinc-800/50 rounded-lg p-4">
              <div className="text-xs text-zinc-500">Today</div>
              <div className="text-2xl font-bold text-emerald-400">{mentions.today?.mentioned ? "✓ Mentioned" : "✗ Not mentioned"}</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-4">
              <div className="text-xs text-zinc-500">Mentioned by</div>
              <div className="text-xl font-bold capitalize">{mentions.today?.mentioned_agents?.join(", ") || "—"}</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-4">
              <div className="text-xs text-zinc-500">Best rank today</div>
              <div className="text-2xl font-bold">{mentions.today?.best_rank ? `#${mentions.today.best_rank}` : "—"}</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-4">
              <div className="text-xs text-zinc-500">Live best rank</div>
              <div className="text-2xl font-bold">{mentions.live?.best_rank ? `#${mentions.live.best_rank}` : "—"}</div>
            </div>
          </div>

          {/* 14-day trend */}
          <h4 className="text-xs text-zinc-500 uppercase mb-2">Last 14 days</h4>
          <div className="space-y-1">
            {mentions.daily?.map((d: any) => (
              <div key={d.date} className="flex items-center gap-3 text-sm">
                <span className="w-24 text-zinc-500">{d.date.slice(5)}</span>
                <span className={`w-32 font-medium ${d.mentioned ? "text-emerald-400" : "text-zinc-600"}`}>
                  {d.mentioned ? `✓ ${d.mentioned_count} AI · best #${d.best_rank}` : "✗ not mentioned"}
                </span>
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${d.mentioned ? "bg-emerald-500" : "bg-zinc-700"}`}
                    style={{ width: `${Math.min(100, (d.mentioned_count / 4) * 100)}%` }} />
                </div>
              </div>
            ))}
            {!mentions.daily?.length && <p className="text-xs text-zinc-600">No historical data yet — run "Track Now & Save" daily to build the trend.</p>}
          </div>
        </div>
      )}

      {/* Current Snapshot */}
      {snapshot && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Latest Snapshot: "{snapshot.keyword}"</h3>
              <span className="text-xs text-zinc-500">{new Date().toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {snapshot.results.map((r: RankSnap) => {
                const prev = getPrevRank(r.ai_agent, r.rank);
                return (
                  <div key={r.ai_agent} className="bg-zinc-800/50 rounded-lg p-4">
                    <div className="text-sm font-medium capitalize text-zinc-200 mb-1">{r.ai_agent}</div>
                    <div className="text-xl font-bold">{rankIcon(r.rank, prev)}</div>
                    {r.description && <div className="text-xs text-zinc-500 mt-1">{r.description.slice(0, 60)}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* History table */}
          {Object.keys(history).length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="font-semibold mb-4">History</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                    <th className="p-2">Agent</th><th className="p-2">Latest Rank</th><th className="p-2">Prev Rank</th><th className="p-2">Trend</th><th className="p-2">Description</th>
                  </tr></thead>
                  <tbody>
                    {Object.entries(history).map(([agent, records]) => {
                      const latest = records[0];
                      const prev = records.length > 1 ? records[1] : null;
                      const trend = !latest.rank ? "not ranked"
                        : !prev?.rank ? "new"
                        : latest.rank < prev.rank ? "up"
                        : latest.rank > prev.rank ? "down" : "same";
                      const trendColor = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-yellow-400";
                      return (
                        <tr key={agent} className="border-b border-zinc-800 last:border-0">
                          <td className="p-2 capitalize">{agent}</td>
                          <td className="p-2 font-bold">{latest.rank ? `#${latest.rank}` : "—"}</td>
                          <td className="p-2 text-zinc-500">{prev?.rank ? `#${prev.rank}` : "—"}</td>
                          <td className={`p-2 font-medium ${trendColor}`}>{trend === "up" ? "↑ Up" : trend === "down" ? "↓ Down" : trend === "new" ? "✦ New" : "→ Same"}</td>
                          <td className="p-2 text-zinc-500 truncate max-w-[150px]">{latest.description?.slice(0, 60)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-zinc-600 mt-3">Each "Track Now" saves to history. Come back daily to build trend data.</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
