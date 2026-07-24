"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface SiteAudit { url: string; total_pages: number; health_score: number; pages_with_product_schema: number; pages_with_faq_schema: number; pages_with_breadcrumb: number; pages_with_organization: number; top_issues: string[]; ai_bots_blocked: Record<string, boolean>; }
interface ScoreData { ai_visibility_score: number; label: string; breakdown: Record<string, { score: number; weight: number }>; recommendation: string; }
interface StepItem { severity: string; issue: string; what_to_do: string; how_to_do_it: string; auto_fixable: boolean; effort: string; impact: string; if_cannot_fix: string; }
interface CmsResult { domain: string; platform: string; confidence: number; recommended_action: string; auth_method: string; }

type Tab = "overview" | "audit" | "fix";

function AnalyticsContent() {
  const params = useSearchParams();
  const domain = params.get("domain") || "";
  const [tab, setTab] = useState<Tab>("overview");

  const [siteAudit, setSiteAudit] = useState<SiteAudit | null>(null);
  const [score, setScore] = useState<ScoreData | null>(null);
  const [steps, setSteps] = useState<StepItem[]>([]);
  const [cms, setCms] = useState<CmsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stepsLoading, setStepsLoading] = useState(true);

  useEffect(() => {
    if (!domain) return;
    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
    runAll(cleanDomain);
  }, [domain]);

  const runAll = async (domain: string) => {
    setLoading(true); setError("");
    try {
      const [cmsRes, siteRes, scoreRes] = await Promise.all([
        fetch("/api/cms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain }) }),
        fetch("/api/audit/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain }) }),
        fetch("/api/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: `https://${domain}`, product_name: domain, brand: domain.split(".")[0] }) }),
      ]);
      if (cmsRes.ok) setCms(await cmsRes.json());
      if (siteRes.ok) setSiteAudit(await siteRes.json());
      if (scoreRes.ok) setScore(await scoreRes.json());
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);

    // Fetch next steps separately (needs product info)
    setStepsLoading(true);
    try {
      const stepsRes = await fetch("/api/next-steps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: `https://${domain}`, product_name: domain, brand: domain.split(".")[0] }) });
      if (stepsRes.ok) { const d = await stepsRes.json(); setSteps(d.action_plan || []); }
    } catch {}
    setStepsLoading(false);
  };

  if (loading) return <main className="min-h-screen flex items-center justify-center"><div className="text-zinc-400 animate-pulse text-lg">Scanning {domain || "..."} — full analysis in progress...</div></main>;

  const scoreColor = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-yellow-400" : "text-red-400";

  return (
    <main className="min-h-screen max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div>
        <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Home</Link>
        <h1 className="text-3xl font-bold mt-1">{domain}</h1>
        {cms && <div className="flex items-center gap-2 mt-1"><span className={`px-2 py-0.5 rounded text-xs font-medium ${cms.platform === "shopify" ? "bg-emerald-900/50 text-emerald-400" : "bg-zinc-800 text-zinc-400"}`}>{cms.platform.toUpperCase()}</span><span className="text-xs text-zinc-500">{cms.recommended_action}</span></div>}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-800 pb-2">
        {(["overview","audit","fix"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
            {t === "overview" ? "Overview" : t === "audit" ? "Site Audit" : "Action Plan"}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="AI Visibility Score" value={score?.ai_visibility_score ?? "—"} sub={score?.label} />
            <StatCard label="Site Health" value={siteAudit?.health_score ?? "—"} sub={siteAudit ? `${siteAudit.pages_with_product_schema}/${siteAudit.total_pages} products with Schema` : ""} />
            <StatCard label="Auto-Fixable Issues" value={`${steps.filter(s => s.auto_fixable).length}`} sub={`${steps.length} total issues found`} />
          </div>

          {score && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="font-semibold mb-4">Score Breakdown</h3>
              <div className="space-y-3">
                {Object.entries(score.breakdown).map(([k, v]) => (
                  <div key={k}>
                    <div className="flex justify-between text-sm mb-1"><span className="text-zinc-400 capitalize">{k.replace(/_/g, " ")}</span><span className={scoreColor(v.score)}>{v.score}/100</span></div>
                    <div className="w-full bg-zinc-800 rounded-full h-2"><div className={`h-2 rounded-full ${v.score >= 70 ? "bg-emerald-500" : v.score >= 40 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${Math.max(v.score, 5)}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AUDIT */}
      {tab === "audit" && siteAudit && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Product Schema", count: siteAudit.pages_with_product_schema, total: siteAudit.total_pages },
              { label: "FAQ Schema", count: siteAudit.pages_with_faq_schema, total: siteAudit.total_pages },
              { label: "Breadcrumb", count: siteAudit.pages_with_breadcrumb ?? siteAudit.total_pages, total: siteAudit.total_pages },
              { label: "Organization", count: siteAudit.pages_with_organization ?? siteAudit.total_pages, total: siteAudit.total_pages }
            ].map(({ label, count, total }) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${pct >= 80 ? "text-emerald-400" : pct >= 40 ? "text-yellow-400" : "text-red-400"}`}>{pct}%</div>
                <div className="text-xs text-zinc-500 mt-1">{label}</div>
                <div className="text-xs text-zinc-600">{count}/{total} pages</div>
              </div>;
            })}
          </div>

          {siteAudit.top_issues.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="font-semibold mb-3">Issues Found</h3>
              <ul className="space-y-1">
                {siteAudit.top_issues.map((issue, i) => <li key={i} className="text-sm text-red-400 flex gap-2"><span>🔴</span>{issue}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* FIX */}
      {tab === "fix" && (
        <div className="space-y-6">
          {stepsLoading ? <div className="text-zinc-400">Loading action plan...</div> : steps.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-500">{steps.filter(s => s.auto_fixable).length} of {steps.length} issues can be fixed automatically</p>
              {steps.map((s, i) => (
                <div key={i} className={`bg-zinc-900 border rounded-xl p-5 ${s.severity === "critical" ? "border-red-800" : s.severity === "high" ? "border-yellow-800" : "border-zinc-800"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-zinc-200">{i + 1}. {s.what_to_do}</div>
                      <div className="text-xs text-zinc-500 mt-1">{s.how_to_do_it.slice(0, 200)}</div>
                      <div className="text-xs text-zinc-600 mt-2">Impact: {s.impact}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.auto_fixable ? "bg-emerald-900/50 text-emerald-400" : "bg-amber-900/50 text-amber-400"}`}>{s.auto_fixable ? "Auto-Fix" : "Manual"}</span>
                      <span className="text-xs text-zinc-600">{s.effort}</span>
                    </div>
                  </div>
                  {s.auto_fixable && (
                    <div className="mt-3 flex gap-2">
                      <button onClick={async () => { try { const r = await fetch("/api/optimize/fixes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: `https://${domain}`, use_ai: true }) }); if (r.ok) alert("Schema generated! Check console for the code."); } catch {} }} className="px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition">
                        Generate Fix →
                      </button>
                    </div>
                  )}
                  {!s.auto_fixable && s.if_cannot_fix && (
                    <div className="mt-2 text-xs text-amber-400">💡 Workaround: {s.if_cannot_fix}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-zinc-400 text-center py-10">Run a site scan first to see your action plan.</div>
          )}
        </div>
      )}

      {/* Bottom CTA */}
      <div className="flex gap-4 pt-4 border-t border-zinc-800">
        {cms?.auth_method === "oauth" && <a href={`/api/shopify/install?shop=${domain}`} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition">Connect Shopify App →</a>}
        <Link href="/inject-guide" className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-medium rounded-lg transition">Install inject.js →</Link>
        <Link href={`/rank/domain?domain=${encodeURIComponent(domain)}`} className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-medium rounded-lg transition">Check AI Rankings →</Link>
      </div>
    </main>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-center">
      <div className="text-3xl font-bold text-emerald-400">{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function AnalyticsPage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-zinc-400">Loading...</div>}><AnalyticsContent /></Suspense>;
}
