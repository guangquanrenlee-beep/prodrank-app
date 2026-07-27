"use client";

import { useState } from "react";
import Link from "next/link";

interface AgentDetail { agent: string; rank: number | null; description: string; sentiment: string }
interface VerifySnapshot { snapshot_id: string; product_name: string; keyword: string; best_rank: number | null; mentioned_by: string[]; not_mentioned_by: string[]; agent_details: AgentDetail[] }

export default function VerifyPage() {
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [brand, setBrand] = useState("");
  const [before, setBefore] = useState<VerifySnapshot | null>(null);
  const [after, setAfter] = useState<VerifySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stored, setStored] = useState<VerifySnapshot[]>([]);

  const loadStored = () => { const raw = localStorage.getItem("prodrank_verifications"); if (raw) setStored(JSON.parse(raw)); };

  const runSnapshot = async (label: "before" | "after") => {
    if (!keyword || !brand) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_name: brand, keyword, brand }),
      });
      const data = await res.json();
      const snap = data.snapshot as VerifySnapshot;

      if (label === "before") {
        setBefore(snap);
        setAfter(null);
      } else {
        setAfter(snap);
      }

      const all = [...stored.filter(s => s.snapshot_id !== snap.snapshot_id), snap];
      localStorage.setItem("prodrank_verifications", JSON.stringify(all));
      setStored(all);
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  };

  const delta = (before && after)
    ? (after.mentioned_by?.length || 0) - (before.mentioned_by?.length || 0)
    : null;

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 py-10 space-y-8">
      <div>
        <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
        <h1 className="text-3xl font-bold mt-1">Impact — Before & After</h1>
        <p className="text-zinc-400 text-sm mt-1">Prove your optimization is working. Run a &quot;before&quot; snapshot, make changes, then run &quot;after&quot;.</p>
      </div>

      {/* Input */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Product URL (optional)" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Search keyword *" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Brand / Product name *" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div className="flex gap-3">
          <button onClick={() => runSnapshot("before")} disabled={loading || !keyword || !brand}
            className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">
            {loading ? "Running..." : "📸 Take 'Before' Snapshot"}
          </button>
          <button onClick={() => runSnapshot("after")} disabled={loading || !before || !keyword || !brand}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">
            {loading ? "Running..." : "✅ Take 'After' Snapshot"}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>

      {/* Before + After comparison */}
      {before && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Before */}
          <SnapshotCard title="Before" snapshot={before} borderColor="border-amber-800" bgColor="bg-amber-900/10" />

          {/* After or waiting */}
          {after ? (
            <SnapshotCard title="After" snapshot={after} borderColor="border-emerald-800" bgColor="bg-emerald-900/10" />
          ) : (
            <div className="border border-zinc-800 bg-zinc-900/50 rounded-xl p-8 flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="text-4xl">⏳</div>
                <p className="text-zinc-500 text-sm">Make your changes, then click<br/><strong>&quot;Take &apos;After&apos; Snapshot&quot;</strong></p>
                <p className="text-xs text-zinc-600">Tip: Go to <Link href="/optimize" className="text-emerald-400 underline">Optimization Center</Link> to fix Schema issues first.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delta summary */}
      {delta !== null && before && after && (
        <div className={`rounded-xl p-6 text-center ${delta > 0 ? "bg-emerald-900/20 border border-emerald-800" : delta === 0 ? "bg-zinc-900 border border-zinc-800" : "bg-red-900/20 border border-red-800"}`}>
          <div className="text-4xl font-bold mb-2">
            {delta > 0 ? `📈 +${delta}` : delta === 0 ? "➡ 0" : `📉 ${delta}`}
          </div>
          <div className="text-sm text-zinc-400">
            {delta > 0
              ? `AI agents that now mention your product: ${after.mentioned_by.join(", ") || "none"}`
              : delta === 0
                ? "No change in AI mentions. Try optimizing Schema or adding FAQ."
                : "Fewer AI agents mentioned your product. Check if competitors updated their Schema."}
          </div>

          {/* Agent-by-agent comparison */}
          <div className="mt-6 space-y-2">
            {before.agent_details.map(beforeAgent => {
              const afterAgent = after.agent_details.find(a => a.agent === beforeAgent.agent);
              return (
                <div key={beforeAgent.agent} className="flex items-center gap-3 text-sm bg-zinc-800/30 rounded-lg px-4 py-2">
                  <span className="capitalize text-zinc-300 w-20">{beforeAgent.agent}</span>
                  <span className={beforeAgent.rank ? "text-amber-400" : "text-red-400"}>
                    {beforeAgent.rank ? `#${beforeAgent.rank}` : "—"}
                  </span>
                  <span className="text-zinc-600">→</span>
                  <span className={afterAgent?.rank ? "text-emerald-400" : "text-red-400"}>
                    {afterAgent?.rank ? `#${afterAgent.rank}` : "—"}
                  </span>
                  {afterAgent?.rank && beforeAgent.rank && afterAgent.rank < beforeAgent.rank && (
                    <span className="text-xs text-emerald-400">↑ improved</span>
                  )}
                  {afterAgent?.rank && beforeAgent.rank && afterAgent.rank > beforeAgent.rank && (
                    <span className="text-xs text-red-400">↓ dropped</span>
                  )}
                  {afterAgent?.rank && !beforeAgent.rank && (
                    <span className="text-xs text-emerald-400">🆕 new!</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick tip when no before yet */}
      {!before && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center space-y-3">
          <div className="text-4xl">📸</div>
          <h3 className="text-lg font-semibold text-zinc-300">How to prove your fix worked</h3>
          <ol className="text-sm text-zinc-500 space-y-1 max-w-md mx-auto text-left list-decimal pl-5">
            <li>Fill in your product name and target keyword above</li>
            <li>Click <strong>Take &apos;Before&apos; Snapshot</strong> — this records your current AI visibility</li>
            <li>Go to <Link href="/optimize" className="text-emerald-400 underline">Optimization Center</Link> and fix your Schema</li>
            <li>Wait 1-7 days for AI agents to re-index your page</li>
            <li>Come back here, click <strong>Take &apos;After&apos; Snapshot</strong> — see the improvement</li>
          </ol>
        </div>
      )}

      {/* History */}
      {stored.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold mb-3">Snapshot History ({stored.length})</h3>
          <div className="space-y-1">
            {stored.slice(0, 10).reverse().map((s, i) => (
              <div key={i} className="flex items-center justify-between text-sm bg-zinc-800/30 rounded-lg px-3 py-2">
                <span className="text-zinc-300">{s.product_name} — &quot;{s.keyword}&quot;</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">Mentioned: {s.mentioned_by.join(", ") || "none"}</span>
                  {s.best_rank && <span className="text-xs text-emerald-400">Best: #{s.best_rank}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function SnapshotCard({ title, snapshot, borderColor, bgColor }: {
  title: string;
  snapshot: VerifySnapshot;
  borderColor: string;
  bgColor: string;
}) {
  return (
    <div className={`border rounded-xl p-6 ${borderColor} ${bgColor}`}>
      <div className="flex items-center gap-2 mb-4">
        <div className={`text-xs px-2 py-0.5 rounded-full font-medium ${title === "Before" ? "bg-amber-900/50 text-amber-400" : "bg-emerald-900/50 text-emerald-400"}`}>
          {title}
        </div>
        <span className="text-xs text-zinc-600">{snapshot.snapshot_id}</span>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-zinc-500 text-xs">Keyword</span><div className="text-zinc-200">{snapshot.keyword}</div></div>
          <div><span className="text-zinc-500 text-xs">Best Rank</span><div className={snapshot.best_rank ? "text-emerald-400 font-bold" : "text-red-400"}>{snapshot.best_rank ? `#${snapshot.best_rank}` : "Not ranked"}</div></div>
          <div><span className="text-zinc-500 text-xs">Mentioned by</span><div className="text-emerald-400">{snapshot.mentioned_by.join(", ") || "—"}</div></div>
          <div><span className="text-zinc-500 text-xs">Not mentioned</span><div className="text-red-400">{snapshot.not_mentioned_by.join(", ") || "—"}</div></div>
        </div>

        <div className="border-t border-zinc-800 pt-3 space-y-1.5">
          {snapshot.agent_details.map(a => (
            <div key={a.agent} className="flex items-center gap-2 text-sm">
              <span className="capitalize text-zinc-400 w-16 text-xs">{a.agent}</span>
              <span className={a.rank ? "text-emerald-400 text-xs" : "text-red-400 text-xs"}>{a.rank ? `#${a.rank}` : "—"}</span>
              {a.sentiment && <span className={`text-xs px-1.5 py-0.5 rounded ${a.sentiment === "positive" ? "bg-emerald-900/50 text-emerald-400" : a.sentiment === "negative" ? "bg-red-900/50 text-red-400" : "bg-zinc-800 text-zinc-500"}`}>{a.sentiment}</span>}
              {a.description && <span className="text-xs text-zinc-600 truncate flex-1">{a.description.slice(0, 60)}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
