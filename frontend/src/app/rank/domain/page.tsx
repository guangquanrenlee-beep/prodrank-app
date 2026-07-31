"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface AgentResult {
  ai_agent: string;
  rank: number | null;
  total_mentioned: number;
  description: string;
  sentiment: string;
  competitors: { name: string; rank: number; description: string }[];
}

interface KeywordReport {
  keyword: string;
  best_rank: number | null;
  mentioned_by: string[];
  not_mentioned_by: string[];
  results: AgentResult[];
}

interface DomainReport {
  domain: string;
  brand_name: string;
  category: string;
  brand_known: boolean;
  reports: KeywordReport[];
}

function DomainRankContent() {
  const params = useSearchParams();
  const domain = params.get("domain") || "";
  const [data, setData] = useState<DomainReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!domain) return;
    fetch("/api/rank/domain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    })
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [domain]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-zinc-400 animate-pulse text-lg">
            Discovering {domain}...
          </div>
          <p className="text-sm text-zinc-600">
            Asking AI agents what they know about this brand
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 py-12 space-y-8">
      <div>
        <a href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Back</a>
        <h1 className="text-3xl font-bold mt-2">{data.brand_name}</h1>
        <p className="text-zinc-400">
          {data.brand_known
            ? `Known for: ${data.category}`
            : `AI agents don't recognize this brand yet`}
        </p>
      </div>

      {/* Brand status banner */}
      <div className={`rounded-xl p-6 text-center ${data.brand_known ? "bg-emerald-900/20 border border-emerald-800" : "bg-amber-900/20 border border-amber-800"}`}>
        <div className="text-4xl mb-2">{data.brand_known ? "✅" : "⚠️"}</div>
        <div className="text-xl font-bold text-zinc-100">
          {data.brand_known
            ? "AI agents know your brand"
            : "Not found in AI training data"}
        </div>
        <p className="text-sm text-zinc-400 mt-1">
          {data.brand_known
            ? `${data.brand_name} is recognized as: ${data.category}`
            : `${data.brand_name} was not found in base AI model knowledge (tested without web search).`}
        </p>
        <p className="text-xs text-zinc-500 mt-2 max-w-md mx-auto">
          {data.brand_known
            ? ""
            : "This tests what AI models know from training data. ChatGPT, Perplexity and Gemini with web search may still find your brand online. A low score here means you lack structured data signals — fix that and web-searching AIs will recommend you more often."}
        </p>
      </div>

      {/* Keyword reports */}
      {data.reports.map((report, i) => (
        <section key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-2">
            &ldquo;{report.keyword}&rdquo;
          </h3>
          <div className="flex items-center gap-4 mb-4 text-sm">
            {report.best_rank ? (
              <span className="text-emerald-400 font-medium">Best rank: #{report.best_rank}</span>
            ) : (
              <span className="text-red-400 font-medium">Not ranked</span>
            )}
            <span className="text-zinc-500">
              Mentioned by: {report.mentioned_by.length > 0 ? report.mentioned_by.join(", ") : "none"}
            </span>
          </div>

          {/* Per-agent results */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {report.results.map((r) => (
              <div key={r.ai_agent} className="bg-zinc-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium capitalize text-zinc-300">{r.ai_agent}</span>
                  {r.rank ? (
                    <span className="text-xs text-emerald-400">#{r.rank} of {r.total_mentioned}</span>
                  ) : (
                    <span className="text-xs text-zinc-500">Not ranked</span>
                  )}
                </div>
                {r.description && (
                  <p className="text-xs text-zinc-400">{r.description}</p>
                )}
              </div>
            ))}
          </div>

          {/* Competitors */}
          {report.results[0]?.competitors.length > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-800">
              <p className="text-xs text-zinc-500 mb-1">AI mentions these brands instead:</p>
              <div className="flex flex-wrap gap-1">
                {report.results[0].competitors.map((c, j) => (
                  <span key={j} className="text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-400">
                    #{c.rank} {c.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      ))}

      {/* CTA */}
      {!data.brand_known && (
        <div className="bg-emerald-900/20 border border-emerald-800 rounded-xl p-6 text-center">
          <p className="text-lg font-semibold text-emerald-400 mb-2">Improve your AI training data signals</p>
          <p className="text-sm text-zinc-300 mb-4">
            While web-searching AIs (ChatGPT with search, Perplexity) may already find your brand, adding structured Schema and FAQ data improves how ALL AI models understand and recommend your products.
          </p>
          <div className="flex justify-center gap-4">
            <a href="/api/shopify/install?shop=yourstore.myshopify.com" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition">Install for Shopify</a>
            <Link href="/wordpress" className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium rounded-lg transition">Install for WordPress</Link>
          </div>
        </div>
      )}
    </main>
  );
}

export default function DomainRankPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-zinc-400">Loading...</div>}>
      <DomainRankContent />
    </Suspense>
  );
}
