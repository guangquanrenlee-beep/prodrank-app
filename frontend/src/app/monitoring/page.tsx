"use client";
import { useState } from "react";
import Link from "next/link";

interface RankSnap { ai_agent: string; rank: number | null; description: string; sentiment: string; checked_at?: string; }

export default function MonitoringPage() {
  const [keyword, setKeyword] = useState(""); const [brand, setBrand] = useState("");
  const [snapshot, setSnapshot] = useState<any>(null); const [history, setHistory] = useState<Record<string, RankSnap[]>>({});
  const [loading, setLoading] = useState(false);

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
        <h1 className="text-2xl font-bold">AI Ranking Monitor</h1>
        <p className="text-zinc-400 text-sm mt-1">Track your brand across 4 AI agents — automatically archived for trend analysis.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Brand / Product Name" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Keyword (e.g. best winter jackets)" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>
      <button onClick={runTrack} disabled={loading || !keyword || !brand} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">
        {loading ? "Querying 4 AI agents & saving history..." : "Track Now & Save"}
      </button>

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
