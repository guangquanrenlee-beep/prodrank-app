"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

interface Competitor {
  name: string; domain: string; is_you: boolean;
  has_software_schema?: boolean; has_org_schema?: boolean; has_faq_schema?: boolean;
  schema_fields?: number; word_count?: number; estimated_score?: number;
  error?: string;
}

export default function ComparePage() {
  return <Suspense fallback={<div className="p-10 text-zinc-400">Loading...</div>}><CompareContent /></Suspense>;
}

function CompareContent() {
  const params = useSearchParams();
  const urlParam = params.get("domain") || "";
  const { user, loading: authLoading } = useAuth();
  const [domain, setDomain] = useState(urlParam);
  const [results, setResults] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      if (!domain) {
        const last = localStorage.getItem(`prodrank_last_domain_${user.id}`);
        if (last) setDomain(last);
      }
    }
  }, [user]);

  useEffect(() => {
    if (urlParam && !domain) setDomain(urlParam);
  }, [urlParam]);

  const runCompare = async () => {
    if (!domain.trim()) return;
    setLoading(true); setError("");
    try {
      const clean = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
      const res = await fetch("/api/score/competitors/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: clean, name: clean }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResults(data.results || []);
    } catch (err: any) {
      setError(err.message || "Comparison failed");
    }
    setLoading(false);
  };

  const sc = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-amber-400" : "text-red-400";
  const sb = (s: number) => s >= 70 ? "bg-emerald-500" : s >= 40 ? "bg-amber-500" : "bg-red-500";

  if (authLoading) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full" /></main>;
  if (!user) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to access</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div></main>;

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <div>
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold mt-1">⚔️ Competitor Monitor</h1>
            <span className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded-full mt-1">{"🛒 Store"}</span>
          </div>
          <p className="text-zinc-400 text-sm mt-1">
            Compare your product pages against competitors.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="flex gap-3">
            <input
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="yourdomain.com"
              className="flex-1 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={runCompare}
              disabled={loading || !domain.trim()}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition whitespace-nowrap">
              {loading ? "Analyzing…" : "⚔️ Compare vs Competitors"}
            </button>
          </div>
          <p className="text-xs text-zinc-500">Compare schema completeness, content depth, and estimated AI visibility scores against competitors.</p>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {loading && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-20 text-center">
            <div className="animate-spin h-8 w-8 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-zinc-400">Detecting competitors and analyzing their sites…</p>
          </div>
        )}

        {results.length >= 2 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                  <th className="text-left py-3 px-4 font-medium">Site</th>
                  <th className="text-center py-3 px-3 font-medium">AI Score (est.)</th>
                  <th className="text-center py-3 px-3 font-medium">Schema Fields</th>
                  <th className="text-center py-3 px-3 font-medium">Software?</th>
                  <th className="text-center py-3 px-3 font-medium">Org?</th>
                  <th className="text-center py-3 px-3 font-medium">FAQ?</th>
                  <th className="text-center py-3 px-3 font-medium">Word Count</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className={`border-b border-zinc-800/50 ${r.is_you ? "bg-emerald-900/10" : ""}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-200">{r.name}</span>
                        {r.is_you && <span className="text-xs bg-emerald-900/50 text-emerald-400 px-1.5 py-0.5 rounded">You</span>}
                      </div>
                      <div className="text-xs text-zinc-500">{r.domain}</div>
                      {r.error && <div className="text-xs text-red-400">{r.error}</div>}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`font-bold ${sc(r.estimated_score || 0)}`}>{r.estimated_score ?? "—"}</span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={r.schema_fields ? sc(r.schema_fields * 10) : "text-zinc-600"}>{r.schema_fields ?? "—"}/12</span>
                    </td>
                    <td className="py-3 px-3 text-center">{r.has_software_schema ? "✅" : "❌"}</td>
                    <td className="py-3 px-3 text-center">{r.has_org_schema ? "✅" : "❌"}</td>
                    <td className="py-3 px-3 text-center">{r.has_faq_schema ? "✅" : "❌"}</td>
                    <td className="py-3 px-3 text-center text-zinc-400">{(r.word_count || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Insights */}
        {results.length >= 2 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(() => {
              const you = results.find(r => r.is_you);
              const best = results.filter(r => !r.is_you && !r.error).sort((a, b) => (b.estimated_score || 0) - (a.estimated_score || 0))[0];
              const worst = results.filter(r => !r.error).sort((a, b) => (a.estimated_score || 0) - (b.estimated_score || 0))[0];
              return <>
                {you && best && (
                  <div className="bg-red-900/10 border border-red-800 rounded-xl p-5">
                    <div className="text-xs text-red-400 font-medium mb-1">📉 Gap to Beat</div>
                    <div className="text-lg font-bold text-red-400">{(best.estimated_score || 0) - (you.estimated_score || 0)} pts</div>
                    <div className="text-xs text-zinc-500 mt-1">Behind {best.name} — add schema + content to close the gap</div>
                  </div>
                )}
                <div className="bg-emerald-900/10 border border-emerald-800 rounded-xl p-5">
                  <div className="text-xs text-emerald-400 font-medium mb-1">🎯 Quick Wins</div>
                  <div className="text-sm text-zinc-300">
                    {results.filter(r => !r.has_software_schema).length > 0
                      ? `${results.filter(r => !r.has_software_schema).length} competitors lack SoftwareApplication schema — you're ahead`
                      : "All competitors have schema — improve your content to differentiate"}
                  </div>
                </div>
                <div className="bg-blue-900/10 border border-blue-800 rounded-xl p-5">
                  <div className="text-xs text-blue-400 font-medium mb-1">💡 What to Do</div>
                  <div className="text-xs text-zinc-400">
                    1. Match best schema coverage  2. Add FAQ if competitors have it  3. Write longer, more detailed descriptions
                  </div>
                </div>
              </>;
            })()}
          </div>
        )}
      </div>
    </main>
  );
}
