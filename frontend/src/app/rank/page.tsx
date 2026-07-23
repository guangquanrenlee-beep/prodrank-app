"use client";

import { useState } from "react";

interface AgentResult {
  ai_agent: string;
  rank: number | null;
  total_mentioned: number;
  description: string;
  sentiment: string;
  cited_sources: string[];
  competitors: { name: string; rank: number; description: string }[];
}

interface RankReport {
  product_name: string;
  keyword: string;
  best_rank: number | null;
  mentioned_by: string[];
  not_mentioned_by: string[];
  all_cited_sources: string[];
  results: AgentResult[];
}

const AGENT_ICONS: Record<string, string> = {
  chatgpt: "🤖",
  gemini: "🔮",
  claude: "🧠",
  grok: "⚡",
};

const AGENT_COLORS: Record<string, string> = {
  chatgpt: "from-emerald-500 to-green-600",
  gemini: "from-blue-500 to-indigo-600",
  claude: "from-amber-500 to-orange-600",
  grok: "from-violet-500 to-purple-600",
};

export default function RankPage() {
  const [productName, setProductName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [brand, setBrand] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<RankReport | null>(null);
  const [error, setError] = useState("");

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim() || !keyword.trim()) return;

    setLoading(true);
    setError("");
    setReport(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    try {
      const res = await fetch("/api/rank/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_name: productName, keyword, brand }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(await res.text());
      setReport(await res.json());
    } catch (err: any) {
      setError(err.name === "AbortError" ? "Query timed out — the AI agents took too long to respond. Try again." : err.message || "Failed to check ranking");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen max-w-5xl mx-auto px-4 py-12 space-y-8">
      <div>
        <a href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">
          ← Back
        </a>
        <h1 className="text-3xl font-bold mt-2">AI Agent Ranking</h1>
        <p className="text-zinc-400 mt-1">
          See where your product ranks across ChatGPT, Gemini, Claude, and Grok
        </p>
      </div>

      {/* Input form */}
      <form
        onSubmit={handleCheck}
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Product Name *
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Sony WH-1000XM6"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Search Keyword *
            </label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="best noise canceling headphones"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Brand (optional)
            </label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Sony"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading || !productName.trim() || !keyword.trim()}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span>
              Querying 4 AI agents — may take up to 60 seconds...
            </span>
          ) : (
            "Check Ranking"
          )}
        </button>
      </form>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {report && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              label="Best Rank"
              value={report.best_rank ? `#${report.best_rank}` : "—"}
              color={report.best_rank ? "text-emerald-400" : "text-zinc-500"}
            />
            <SummaryCard
              label="Mentioned By"
              value={report.mentioned_by.length.toString()}
              sub={`${report.mentioned_by.join(", ") || "none"}`}
              color={
                report.mentioned_by.length > 0
                  ? "text-emerald-400"
                  : "text-red-400"
              }
            />
            <SummaryCard
              label="Not Mentioned"
              value={report.not_mentioned_by.length.toString()}
              sub={report.not_mentioned_by.join(", ") || "—"}
              color="text-zinc-400"
            />
            <SummaryCard
              label="Cited Sources"
              value={report.all_cited_sources.length.toString()}
              color="text-blue-400"
            />
          </div>

          {/* Per-agent results */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.results.map((r) => (
              <AgentCard key={r.ai_agent} result={r} />
            ))}
          </div>

          {/* Sources */}
          {report.all_cited_sources.length > 0 && (
            <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">
                Sources Cited by AI Agents
              </h3>
              <div className="space-y-1">
                {report.all_cited_sources.map((src, i) => (
                  <a
                    key={i}
                    href={src}
                    target="_blank"
                    rel="noopener"
                    className="block text-sm text-blue-400 hover:text-blue-300 truncate"
                  >
                    {src}
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
      {sub && (
        <div className="text-xs text-zinc-600 mt-0.5 truncate">{sub}</div>
      )}
    </div>
  );
}

function AgentCard({ result: r }: { result: AgentResult }) {
  const icon = AGENT_ICONS[r.ai_agent] || "🤖";
  const gradient = AGENT_COLORS[r.ai_agent] || "from-zinc-500 to-zinc-600";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <span className="font-semibold capitalize">{r.ai_agent}</span>
        </div>
        {r.rank ? (
          <span
            className={`text-sm font-bold bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}
          >
            Rank #{r.rank} of {r.total_mentioned}
          </span>
        ) : (
          <span className="text-sm text-zinc-500">Not ranked</span>
        )}
      </div>

      {/* Description */}
      {r.description && (
        <p className="text-sm text-zinc-300 leading-relaxed">
          {r.description}
        </p>
      )}

      {/* Sentiment */}
      {r.sentiment && (
        <span
          className={`inline-block text-xs px-2 py-0.5 rounded-full ${
            r.sentiment === "positive"
              ? "bg-emerald-900/50 text-emerald-400"
              : r.sentiment === "negative"
              ? "bg-red-900/50 text-red-400"
              : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {r.sentiment}
        </span>
      )}

      {/* Competitors */}
      {r.competitors.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-zinc-500 font-medium">
            Other products mentioned:
          </div>
          {r.competitors.slice(0, 5).map((c, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs text-zinc-400"
            >
              <span className="text-zinc-600 w-5">#{c.rank}</span>
              <span className="truncate">{c.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
