"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

const AGENT_COLORS: Record<string, { color: string; icon: string }> = {
  chatgpt: { color: "text-emerald-400", icon: "🤖" },
  gemini: { color: "text-blue-400", icon: "🔮" },
  claude: { color: "text-amber-400", icon: "🧠" },
  grok: { color: "text-purple-400", icon: "⚡" },
};

export default function CitePage() {
  const { user, loading: authLoading } = useAuth();
  const [domain, setDomain] = useState("");
  const [category, setCategory] = useState("");
  const [keywords, setKeywords] = useState("");
  const [data, setData] = useState<any>(null);
  const [influence, setInfluence] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [chainUrl, setChainUrl] = useState("");
  const [chainData, setChainData] = useState<any>(null);
  const [chainLoading, setChainLoading] = useState(false);

  useEffect(() => {
    if (user) {
      const key = `prodrank_last_domain_${user.id}`;
      const last = localStorage.getItem(key);
      if (last) setDomain(last);
    }
  }, [user]);

  const runReport = async () => {
    if (!category.trim()) return;
    setLoading(true);
    try {
      const kws = keywords ? keywords.split(",").map(k => k.trim()).filter(Boolean) : [`best ${category}`];
      const [reportRes, influenceRes] = await Promise.all([
        fetch("/api/cite/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, keywords: kws }) }),
        fetch(`/api/cite/influence?category=${encodeURIComponent(category)}`).then(r => r.json()),
      ]);
      setData(await reportRes.json());
      setInfluence(influenceRes);
      setChainData(null);
    } catch {}
    setLoading(false);
  };

  const traceChain = async () => {
    if (!chainUrl.trim()) return;
    setChainLoading(true);
    try {
      const res = await fetch("/api/cite/chain", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: chainUrl.trim(), depth: 2 }),
      });
      if (res.ok) setChainData(await res.json());
    } catch {}
    setChainLoading(false);
  };

  if (authLoading) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full" /></main>;

  return (
    <main className="min-h-screen max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div>
        <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold mt-1">Citation Intelligence</h1>
          <span className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded-full mt-1">{"🛒 Store"}</span>
        </div>
        <p className="text-zinc-400 text-sm mt-1">
          Track which sources AI agents cite, who they trust, and how influence flows in your category.
        </p>
      </div>

      {/* Search */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-3">
        <div className="flex gap-3">
          <input value={category} onChange={e => setCategory(e.target.value)}
            placeholder={"Category (e.g. headphones)"}
            className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <input value={keywords} onChange={e => setKeywords(e.target.value)}
            placeholder={"Price range or keywords (optional)"}
            className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <button onClick={runReport} disabled={loading || !category.trim()} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">{loading ? "Scanning..." : "Scan"}</button>
        </div>
        <p className="text-xs text-zinc-600">We ask ChatGPT and Gemini which sources they consider authoritative. Results show what AI agents trust in this category.</p>
      </div>

      {/* Source Influence */}
      {influence?.sources?.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">Source Influence — {category}</h3>
            <span className="text-xs text-zinc-500">{influence.total_sources} sources found</span>
          </div>
          <div className="space-y-3">
            {influence.sources.slice(0, 10).map((s: any) => (
              <div key={s.domain} className="bg-zinc-800/30 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-zinc-200">{s.domain}</span>
                    <a href={`https://${s.domain}`} target="_blank" rel="noopener" className="text-xs text-zinc-600 hover:text-zinc-400">↗</a>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-emerald-400">{s.influence_score}</span>
                    <span className="text-xs text-zinc-600">influence</span>
                  </div>
                </div>

                {/* Influence bar */}
                <div className="w-full bg-zinc-800 rounded-full h-2">
                  <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${s.influence_score}%` }} />
                </div>

                {/* Per-agent breakdown */}
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-zinc-500">Cited by:</span>
                  {[
                    { key: "chatgpt_citations", label: "ChatGPT", icon: "🤖" },
                    { key: "gemini_citations", label: "Gemini", icon: "🔮" },
                    { key: "claude_citations", label: "Claude", icon: "🧠" },
                    { key: "grok_citations", label: "Grok", icon: "⚡" },
                  ].map(agent => (
                    <span key={agent.key} className={`flex items-center gap-1 ${s[agent.key] > 0 ? "text-zinc-300" : "text-zinc-600"}`}>
                      {agent.icon} {s[agent.key]}
                    </span>
                  ))}
                  <span className="text-zinc-500 ml-auto">{s.total_citations} total</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Citation Detail — what AI agents actually cited */}
      {data?.sources?.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold text-lg mb-4">AI Citation Log — {data.category}</h3>
          <p className="text-xs text-zinc-500 mb-4">
            When AI agents were asked about <strong>&quot;{data.keyword}&quot;</strong>, they returned these sources in order of mention. Position #1 means the AI cited it first — highest authority.
          </p>
          <div className="space-y-2">
            {data.sources.map((s: any, i: number) => {
              const agentInfo = AGENT_COLORS[s.ai_agent] || { color: "text-zinc-400", icon: "📎" };
              return (
                <div key={i} className="flex items-center gap-3 bg-zinc-800/30 rounded-lg px-4 py-2.5">
                  <span className="text-xs text-zinc-600 font-mono w-8">#{s.position}</span>
                  <span className="text-sm">{agentInfo.icon}</span>
                  <span className={`text-xs font-medium capitalize w-16 ${agentInfo.color}`}>{s.ai_agent}</span>
                  <span className="text-sm text-zinc-200 flex-1">{s.domain}</span>
                  <a href={s.url} target="_blank" rel="noopener" className="text-xs text-zinc-600 hover:text-emerald-400 transition">visit ↗</a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Citation Chain Tracer */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="font-semibold text-lg mb-3">🔗 Trace Citation Chain</h3>
        <p className="text-xs text-zinc-500 mb-3">Enter a source URL to discover what sources IT cites (upstream) and which AI agents cite IT (downstream).</p>
        <div className="flex gap-3 mb-4">
          <input value={chainUrl} onChange={e => setChainUrl(e.target.value)} placeholder="https://rtings.com/headphones/reviews" className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <button onClick={traceChain} disabled={chainLoading || !chainUrl.trim()} className="px-5 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 text-white text-sm font-medium rounded-lg transition">{chainLoading ? "Tracing..." : "Trace"}</button>
        </div>

        {chainData && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-800/30 rounded-lg p-4">
              <div className="text-xs text-zinc-500 mb-2 font-medium">⬆ Upstream — Sources this site cites</div>
              {chainData.upstream?.length > 0 ? (
                <div className="space-y-1">
                  {chainData.upstream.map((u: string, i: number) => (
                    <div key={i} className="text-sm text-zinc-300 truncate">{u}</div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-600">No upstream sources found.</p>
              )}
            </div>
            <div className="bg-zinc-800/30 rounded-lg p-4">
              <div className="text-xs text-zinc-500 mb-2 font-medium">⬇ Downstream — AI agents citing this source</div>
              {chainData.downstream?.length > 0 ? (
                <div className="space-y-1">
                  {chainData.downstream.map((d: string, i: number) => (
                    <div key={i} className="text-sm text-zinc-300">{d}</div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-600">Not cited by AI agents yet. Run a category scan above first.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* No results */ }
      {!loading && !data && !influence && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center space-y-4">
          <div className="text-5xl">📰</div>
          <h3 className="text-lg font-semibold text-zinc-300">Discover who AI trusts in your category</h3>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">Enter a product category and optional price range above. We'll ask ChatGPT and Gemini which review sites and sources they consider authoritative.</p>
        </div>
      )}
    </main>
  );
}
