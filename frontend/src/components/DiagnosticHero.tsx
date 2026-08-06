"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Homepage hero diagnostic — three-tier AI-readiness scan.
 * ok → full score + gaps | partial → robots blocks some AI crawlers |
 * blocked → Cloudflare (the diagnosis itself: AI crawlers likely blocked too)
 */
export default function DiagnosticHero() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanningStep, setScanningStep] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const SCAN_STEPS = [
    "Crawling your storefront…",
    "Reading structured data (JSON-LD)…",
    "Checking AI crawler access (robots.txt)…",
    "Measuring content depth…",
    "Scoring your AI Recommendation Readiness…",
  ];

  const runScan = async () => {
    if (!url.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    setScanningStep(0);
    const stepTimer = setInterval(() => {
      setScanningStep(s => Math.min(s + 1, SCAN_STEPS.length - 1));
    }, 1200);
    try {
      const r = await fetch("/api/readiness/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d) setResult(d);
      else setError(d?.detail || d?.message || `Scan failed (HTTP ${r.status})`);
    } catch {
      setError("Network error — please try again.");
    }
    clearInterval(stepTimer);
    setLoading(false);
  };

  const statusColor = (status: string) =>
    status === "ok" ? "text-emerald-400" : status === "partial" ? "text-amber-400" : "text-red-400";

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && runScan()}
          placeholder="yourstore.com — or a product page URL"
          className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          onClick={runScan}
          disabled={loading || !url.trim()}
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition text-sm whitespace-nowrap"
        >
          {loading ? "Scanning…" : "Run free scan"}
        </button>
      </div>
      <p className="text-[11px] text-zinc-600 mt-1.5 text-left">No signup · no credit card · takes ~10 seconds · 5 scans per 10 minutes</p>

      {/* Loading progress */}
      {loading && (
        <div className="mt-5 bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-left space-y-2">
          {SCAN_STEPS.map((s, i) => (
            <div key={s} className={`flex items-center gap-2 text-xs ${i <= scanningStep ? "text-zinc-300" : "text-zinc-600"}`}>
              <span className={i < scanningStep ? "text-emerald-400" : i === scanningStep ? "text-emerald-400 animate-pulse" : ""}>
                {i < scanningStep ? "✓" : i === scanningStep ? "▸" : "·"}
              </span>
              {s}
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="mt-5 bg-red-950/30 border border-red-900/60 rounded-xl p-4 text-left text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Result panel */}
      {result && !loading && (
        <div className="mt-5 bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-left">
          {/* Blocked: Cloudflare — the diagnosis itself */}
          {result.status === "blocked" && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-red-400 text-lg">🛡️</span>
                <h3 className="font-semibold text-red-400">AI crawlers likely blocked</h3>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">{result.message}</p>
              {result.ai_bots_blocked && result.ai_bots_blocked.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {result.ai_bots_blocked.map((b: string) => (
                    <span key={b} className="text-[10px] bg-red-950/50 border border-red-900/50 px-2 py-0.5 rounded-full text-red-300">
                      {b} blocked
                    </span>
                  ))}
                </div>
              )}
              {result.robots_readable && (
                <p className="text-xs text-zinc-500 mt-2">robots.txt was readable — AI crawler verdicts above are real.</p>
              )}
              <Link
                href="/integrations"
                className="inline-block mt-4 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition"
              >
                Connect your store for the deep audit →
              </Link>
            </div>
          )}

          {/* Partial: readable but robots blocks some AI crawlers */}
          {result.status === "partial" && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-amber-400 text-lg">⚠️</span>
                <h3 className="font-semibold text-amber-400">Readable — but AI crawlers are blocked</h3>
              </div>
              <p className="text-sm text-zinc-300">{result.message}</p>
              {result.gaps?.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-xs text-zinc-400">
                  {result.gaps.slice(0, 5).map((g: string, i: number) => (
                    <li key={i} className="flex gap-2"><span className="text-red-400">✕</span>{g}</li>
                  ))}
                </ul>
              )}
              <Link
                href="/integrations"
                className="inline-block mt-4 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition"
              >
                Fix crawler access with the full audit →
              </Link>
            </div>
          )}

          {/* OK: full readiness score */}
          {result.status === "ok" && (
            <div>
              <div className="flex items-center gap-4">
                <div className={`text-5xl font-bold ${statusColor(result.status)}`}>{result.score}</div>
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">AI Recommendation Readiness</div>
                  <div className="text-sm font-medium text-zinc-200">{result.label}</div>
                </div>
              </div>

              {result.signals && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5">
                    <div className={result.signals.product_schema ? "text-emerald-400" : "text-red-400"}>
                      {result.signals.product_schema ? "✓" : "✕"} Product schema
                    </div>
                    <div className="text-zinc-600 mt-0.5">{result.signals.schema_fields}/8 key fields</div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5">
                    <div className={result.signals.org_schema ? "text-emerald-400" : "text-red-400"}>
                      {result.signals.org_schema ? "✓" : "✕"} Organization schema
                    </div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5">
                    <div className={result.signals.faq ? "text-emerald-400" : "text-red-400"}>
                      {result.signals.faq ? "✓" : "✕"} FAQ content
                    </div>
                  </div>
                </div>
              )}

              {result.gaps?.length > 0 && (
                <ul className="mt-4 space-y-1.5 text-xs text-zinc-400">
                  {result.gaps.slice(0, 5).map((g: string, i: number) => (
                    <li key={i} className="flex gap-2"><span className="text-red-400">✕</span>{g}</li>
                  ))}
                </ul>
              )}

              <div className="flex gap-3 mt-5">
                <Link
                  href="/login"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition"
                >
                  Get the full audit & fixes →
                </Link>
                <Link href="/pricing" className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-lg transition">
                  See pricing
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
