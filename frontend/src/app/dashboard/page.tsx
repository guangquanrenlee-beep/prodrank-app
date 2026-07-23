"use client";

import { useState, useEffect } from "react";

interface ScoreData {
  url: string;
  title: string;
  ai_visibility_score: number;
  label: string;
  breakdown: Record<string, { score: number; weight: number }>;
  recommendation: string;
}

interface CMSData {
  domain: string;
  platform: string;
  confidence: number;
  recommended_action: string;
}

export default function DashboardPage() {
  const [domain, setDomain] = useState("");
  const [cms, setCms] = useState<CMSData | null>(null);
  const [score, setScore] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"domain" | "cms" | "score">("domain");

  const detectAndScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) return;
    setLoading(true);

    // Step 1: CMS detection
    const cmsRes = await fetch("/api/cms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: domain.trim() }),
    });
    const cmsData = await cmsRes.json();
    setCms(cmsData);
    setStep("cms");

    // Step 2: Try to get a score (use homepage as sample)
    try {
      const scoreRes = await fetch("/api/score/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `https://${cmsData.domain}`,
          product_name: cmsData.domain,
          keyword: "",
          brand: cmsData.domain.split(".")[0],
        }),
      });
      if (scoreRes.ok) {
        setScore(await scoreRes.json());
        setStep("score");
      }
    } catch {}

    setLoading(false);
  };

  const ScoreGauge = ({ score }: { score: number }) => {
    const color = score >= 80 ? "emerald" : score >= 60 ? "yellow" : score >= 40 ? "amber" : "red";
    const angle = (score / 100) * 180;
    return (
      <div className="flex flex-col items-center">
        <div className="relative w-32 h-16 overflow-hidden">
          <div className={`w-32 h-32 rounded-full border-8 border-zinc-800 border-b-${color}-500 border-r-${color}-500 border-t-${color}-500 rotate-[225deg]`}
            style={{
              borderBottomColor: score >= 40 ? (score >= 60 ? (score >= 80 ? "#10b981" : "#eab308") : "#f59e0b") : "#ef4444",
              borderRightColor: "transparent",
              borderTopColor: "transparent",
              borderLeftColor: "transparent",
              transform: `rotate(${225 + angle}deg)`,
            }}
          />
        </div>
        <span className={`text-4xl font-bold text-${color}-400`}>{score}</span>
        <span className="text-xs text-zinc-500">/100</span>
      </div>
    );
  };

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-4 py-12 space-y-8">
      <div>
        <a href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Home</a>
        <h1 className="text-3xl font-bold mt-2">AI Visibility Dashboard</h1>
        <p className="text-zinc-400">See how AI agents view your store</p>
      </div>

      {/* Domain input */}
      <form onSubmit={detectAndScore} className="flex gap-3">
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="yourstore.com"
          className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={loading || !domain.trim()}
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition"
        >
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </form>

      {/* CMS Card */}
      {cms && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-lg font-semibold capitalize">{cms.platform.replace("_", " ")}</div>
              <div className="text-sm text-zinc-500">{cms.confidence}% confidence</div>
            </div>
            <span className="px-3 py-1 bg-emerald-900/50 text-emerald-400 text-xs rounded-full">Detected</span>
          </div>
          <p className="text-sm text-zinc-400">{cms.recommended_action}</p>
        </div>
      )}

      {/* AI Score */}
      {score && (
        <div className="space-y-6">
          {/* Hero Score */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <ScoreGauge score={score.ai_visibility_score} />
            <div className="mt-2 text-lg font-semibold text-zinc-200">{score.label}</div>
            <p className="text-sm text-zinc-400 mt-1 max-w-md mx-auto">{score.recommendation}</p>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(score.breakdown).map(([key, val]) => (
              <div key={key} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-500 capitalize">{key.replace(/_/g, " ")}</span>
                  <span className="text-xs text-zinc-600">{val.weight}%</span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${val.score >= 70 ? "bg-emerald-500" : val.score >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                    style={{ width: `${val.score}%` }}
                  />
                </div>
                <div className="text-lg font-bold text-zinc-200 mt-1">{val.score}</div>
              </div>
            ))}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Schema Fields" value={`${score.breakdown.product_completeness.score}/100`} change="" />
            <StatCard label="Knowledge" value={`${score.breakdown.knowledge_coverage.score}/100`} change="" />
            <StatCard label="Citations" value={`${score.breakdown.citation_authority.score}/100`} change="" />
            <StatCard label="AI Recommended" value={score.breakdown.recommendation_frequency.score >= 60 ? "Yes" : "No"} change="" />
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value, change }: { label: string; value: string; change: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-zinc-200">{value}</div>
      {change && <div className="text-xs text-emerald-400 mt-1">{change}</div>}
    </div>
  );
}
