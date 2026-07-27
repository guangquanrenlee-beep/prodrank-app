"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

interface CMSData { domain: string; platform: string; confidence: number; recommended_action: string; auth_method: string; }
interface ScoreData { ai_visibility_score: number; label: string; breakdown: Record<string, { score: number; weight: number }>; recommendation: string; analyzed_at?: string; }

const NAV = [
  { label: "🏠 Home", href: "/", icon: "" },
  { label: "Dashboard", href: "/dashboard", icon: "📊", active: true },
  { label: "Products", href: "/products", icon: "📦" },
  { label: "AI Visibility", href: "/visibility", icon: "👁" },
  { label: "AI Recommendations", href: "/rank", icon: "🏆" },
  { label: "AI Playground", href: "/playground", icon: "🧪" },
  { label: "Knowledge Graph", href: "/knowledge-graph", icon: "🧠" },
  { label: "Citation Intelligence", href: "/cite", icon: "📰" },
  { label: "Competitors", href: "/compare", icon: "⚔️" },
  { label: "Action Center", href: "/actions", icon: "⚡" },
  { label: "Opportunity Radar", href: "/opportunities", icon: "🎯" },
  { label: "Optimization Center", href: "/optimize", icon: "🔧" },
  { label: "Impact", href: "/verify", icon: "📈" },
  { label: "Monitoring", href: "/monitoring", icon: "📡" },
  { label: "AI Timeline", href: "/timeline", icon: "🕐" },
  { label: "Reports", href: "/reports", icon: "📋" },
  { label: "Integrations", href: "/integrations", icon: "🔌" },
  { label: "Free Tools", href: "/tools/schema-validator", icon: "🛠️" },
  { label: "SaaS Schema Audit", href: "/saas-audit", icon: "💻" },
  { label: "SaaS Optimize", href: "/saas-optimize", icon: "🔧" },
  { label: "Settings", href: "/settings", icon: "⚙️" },
];

function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"ecommerce" | "saas">("ecommerce");
  const [domain, setDomain] = useState("");
  const [cms, setCms] = useState<CMSData | null>(null);
  const [score, setScore] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sites, setSites] = useState<any[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [refreshingScore, setRefreshingScore] = useState(false);

  // Load sites on mount + when user changes
  useEffect(() => {
    if (user) {
      loadSites(user.id);
      const key = `prodrank_last_domain_${user.id}`;
      const last = localStorage.getItem(key);
      if (last && !domain) setDomain(last);
      const savedMode = localStorage.getItem("prodrank_dashboard_mode");
      if (savedMode === "saas" || savedMode === "ecommerce") setMode(savedMode);
    }
  }, [user]);

  const isSaaS = mode === "saas";

  const loadSites = async (uid: string) => {
    const { data } = await supabase
      .from("sites")
      .select("*")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false });

    if (data && data.length > 0) {
      setSites(data);
      const last = data[0];
      setDomain(last.domain);
      setCms({
        domain: last.domain,
        platform: last.platform || "unknown",
        confidence: last.platform_confidence || 0,
        recommended_action: "Previously analyzed. Click Refresh to update.",
        auth_method: last.auth_method || "csv_upload",
      });

      // Restore FULL score data from the saved JSONB column
      if (last.score_data) {
        setScore(last.score_data as ScoreData);
      } else if (last.ai_visibility_score) {
        // Legacy fallback: old sites with just a score number, no breakdown
        setScore({
          ai_visibility_score: last.ai_visibility_score,
          label: last.ai_visibility_score >= 60 ? "Good" : "Poor",
          breakdown: {},
          recommendation: "",
        });
      }
    }
  };

  const saveScoreToDB = async (cleanDomain: string, scoreData: ScoreData) => {
    const enriched = { ...scoreData, analyzed_at: new Date().toISOString() };
    await supabase
      .from("sites")
      .update({
        ai_visibility_score: scoreData.ai_visibility_score,
        score_data: enriched,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user!.id)
      .eq("domain", cleanDomain);
  };

  const handleAnalyze = useCallback(async (e?: React.FormEvent, targetDomain?: string) => {
    if (e) e.preventDefault();
    const d = (targetDomain || domain).trim();
    if (!d || !user) return;

    setLoading(true); setError(""); setCms(null); setScore(null);

    try {
      const cleanDomain = d.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];

      // 1. CMS detection
      const cmsRes = await fetch("/api/cms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: cleanDomain }),
      });
      const cmsData = await cmsRes.json();
      setCms(cmsData);

      // 2. Save site record
      await supabase.from("sites").upsert(
        {
          user_id: user.id,
          domain: cleanDomain,
          platform: cmsData.platform,
          platform_confidence: cmsData.confidence,
          auth_method: cmsData.auth_method,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,domain" }
      );

      // 3. Calculate AI score
      const scoreRes = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: `https://${cleanDomain}`, product_name: cleanDomain }),
      });

      if (scoreRes.ok) {
        const sd: ScoreData = await scoreRes.json();
        setScore(sd);
        setDomain(cleanDomain);
        localStorage.setItem(`prodrank_last_domain_${user.id}`, cleanDomain);

        // Save FULL score data including breakdown
        await saveScoreToDB(cleanDomain, sd);
        await loadSites(user.id);
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }, [domain, user]);

  const handleRefresh = async () => {
    setRefreshingScore(true);
    await handleAnalyze(undefined, domain);
    setRefreshingScore(false);
  };

  // ── Auth guards ──

  if (authLoading) return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="flex items-center gap-3 text-zinc-400">
        <svg className="animate-spin h-5 w-5 text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
        <span>Restoring session…</span>
      </div>
    </main>
  );

  if (!user) return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="text-center space-y-4"><p className="text-zinc-400">Sign in to see your dashboard</p><Link href="/login" className="text-emerald-400 hover:text-emerald-300">Sign in →</Link></div>
    </main>
  );

  // ── Helpers ──

  const sc = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-yellow-400" : "text-red-400";
  const sb = (s: number) => s >= 70 ? "bg-emerald-500" : s >= 40 ? "bg-yellow-500" : "bg-red-500";
  const autoCount = score ? Math.max(0, 10 - score.ai_visibility_score / 10) : 0;

  const topOpp = score && Object.keys(score.breakdown).length > 0 ? (() => {
    const dims = Object.entries(score.breakdown) as [string, { score: number; weight: number }][];
    dims.sort((a, b) => a[1].score - b[1].score);
    const worst = dims[0];
    return { name: worst[0].replace(/_/g, " "), score: worst[1].score, gain: Math.round((100 - worst[1].score) * worst[1].weight / 100) };
  })() : null;

  const hasBreakdown = score && Object.keys(score.breakdown).length > 0;
  const lastAnalyzed = score?.analyzed_at || null;
  const hasNoSites = sites.length === 0;

  // ── Render ──

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-56" : "w-14"} bg-zinc-900 border-r border-zinc-800 shrink-0 transition-all duration-200 flex flex-col`}>
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          {sidebarOpen && <Link href="/dashboard" className="font-bold text-emerald-400 text-lg">ProdRank</Link>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-zinc-500 hover:text-zinc-300 text-xs">{sidebarOpen ? "◀" : "▶"}</button>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {NAV.map(item => (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${item.active ? "bg-emerald-900/30 text-emerald-400" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"}`}>
              <span>{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-center gap-2 text-sm text-zinc-400"><span className="w-2 h-2 rounded-full bg-emerald-500" />{user.email?.split("@")[0]}</div>
          <button onClick={() => supabase.auth.signOut()} className="text-xs text-zinc-500 hover:text-zinc-300 mt-1">Sign out</button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">
                {domain ? (
                  <span>{domain} <span className="text-lg font-normal text-zinc-500">Dashboard</span></span>
                ) : (
                  isSaaS ? "AI Visibility Score" : "AI Shopping Index"
                )}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                {domain && (
                  <span className="text-sm text-zinc-400">{isSaaS ? "AI Visibility Score" : "AI Shopping Index"}</span>
                )}
                <span className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded-full">{isSaaS ? "💻 SaaS" : "🛒 Store"}</span>
                {cms && (
                  <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full capitalize">{cms.platform === "unknown" && isSaaS ? "SaaS Site" : cms.platform}</span>
                )}
                {lastAnalyzed && (
                  <span className="text-xs text-zinc-600">Analyzed {timeAgo(lastAnalyzed)}</span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={domain}
                onChange={e => setDomain(e.target.value)}
                placeholder="yourstore.com"
                className="w-52 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={(e) => handleAnalyze(e as any)}
                disabled={loading || !domain.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition"
              >
                {loading ? "..." : "Analyze"}
              </button>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* ===== NEW USER: No sites yet ===== */}
          {hasNoSites && !score && (
            <div className="bg-emerald-900/10 border border-emerald-800 rounded-xl p-10 text-center space-y-4">
              <div className="text-5xl">👋</div>
              <h3 className="text-xl font-semibold text-white">Welcome to ProdRank!</h3>
              <p className="text-zinc-400 text-sm max-w-md mx-auto">
                {isSaaS
                  ? "Enter your SaaS domain above and we'll check if AI agents know about your software. Your site will be saved and ready every time you return."
                  : "Enter your store domain above and we'll check if AI agents can see your products. Your store will be saved and ready every time you return."
                }
              </p>
              <div className="flex justify-center gap-3 pt-2">
                {isSaaS ? (
                  <>
                    <Link href="/inject-guide" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition">Get inject-saas.js →</Link>
                    <Link href="/knowledge-graph" className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-medium rounded-lg transition">Knowledge Graph →</Link>
                  </>
                ) : (
                  <>
                    <Link href="/inject-guide" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition">Quick Start Guide →</Link>
                    <Link href="/pricing" className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-medium rounded-lg transition">See Plans →</Link>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ===== RETURNING USER: Sites list ===== */}
          {sites.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg">{isSaaS ? "Your Sites" : "Your Stores"}</h3>
                <span className="text-xs text-zinc-500">{sites.length} site{sites.length > 1 ? "s" : ""}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sites.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => { setDomain(s.domain); handleAnalyze(undefined, s.domain); }}
                    className={`bg-zinc-800/50 hover:bg-zinc-800 rounded-lg p-4 flex items-center justify-between transition border text-left ${s.domain === domain ? "border-emerald-700 ring-1 ring-emerald-700/50" : "border-transparent"}`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-200">{s.domain}</span>
                        {s.inject_active ? (
                          <span className="text-xs text-emerald-400" title={`Last ping: ${new Date(s.last_ping_at).toLocaleString()}`}>● Active</span>
                        ) : (
                          <span className="text-xs text-zinc-600" title="Inject script not detected. Install inject.js or inject-saas.js.">○ Not tracked</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 capitalize">
                        {(s.platform && s.platform !== "unknown") ? s.platform : (isSaaS ? "SaaS Site" : "Web Store")}
                        {s.score_data?.analyzed_at && <span className="ml-2 text-zinc-600">· {timeAgo(s.score_data.analyzed_at)}</span>}
                        {s.last_ping_at && <span className="ml-2 text-zinc-600">· Ping: {timeAgo(s.last_ping_at)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`text-lg font-bold ${sc(s.ai_visibility_score || 0)}`}>
                        {s.ai_visibility_score ?? "—"}
                      </div>
                      <span className="text-xs text-emerald-400">View →</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ===== Hero Score ===== */}
          {score && (
            <>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center relative">
                {/* Refresh button */}
                <button
                  onClick={handleRefresh}
                  disabled={refreshingScore}
                  className="absolute top-4 right-4 flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs rounded-lg transition"
                >
                  <span className={`${refreshingScore ? "animate-spin" : ""}`}>🔄</span>
                  {refreshingScore ? "Refreshing..." : "Refresh"}
                </button>

                <div className={`text-8xl font-bold tracking-tight ${sc(score.ai_visibility_score || 0)}`}>
                  {score.ai_visibility_score}
                </div>
                <div className="text-sm text-zinc-500 mt-2">AI Visibility Score</div>
                <div className={`inline-flex items-center gap-1 mt-3 px-3 py-1 rounded-full text-xs font-medium ${score.ai_visibility_score >= 60 ? "bg-emerald-900/30 text-emerald-400" : "bg-amber-900/30 text-amber-400"}`}>
                  {score.label}
                </div>
                {lastAnalyzed && (
                  <div className="text-xs text-zinc-600 mt-3">
                    Last analyzed: {new Date(lastAnalyzed).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}
              </div>

              {/* 6 Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="AI Shopping Index" value={score.ai_visibility_score?.toString() || "—"} colorClass={sc(score.ai_visibility_score || 0)} />
                <StatCard label="Knowledge" value={hasBreakdown ? score.breakdown?.knowledge_coverage?.score?.toString() : "—"} colorClass={hasBreakdown ? sc(score.breakdown?.knowledge_coverage?.score || 0) : undefined} />
                <StatCard label="Questions" value={hasBreakdown ? score.breakdown?.question_coverage?.score?.toString() : "—"} colorClass={hasBreakdown ? sc(score.breakdown?.question_coverage?.score || 0) : undefined} />
                <StatCard label="Citations" value={hasBreakdown ? score.breakdown?.citation_authority?.score?.toString() : "—"} colorClass={hasBreakdown ? sc(score.breakdown?.citation_authority?.score || 0) : undefined} />
                <StatCard label="Recommendations" value={hasBreakdown ? score.breakdown?.recommendation_frequency?.score?.toString() : "—"} colorClass={hasBreakdown ? sc(score.breakdown?.recommendation_frequency?.score || 0) : undefined} />
                <StatCard label="Top Opportunity" value={topOpp ? `+${topOpp.gain}pts` : "—"} change={topOpp?.name || ""} colorClass="text-emerald-400" />
              </div>

              {/* Score Breakdown + Recent Changes */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {hasBreakdown && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <h3 className="font-semibold mb-4">Score Breakdown</h3>
                    <div className="space-y-3">
                      {Object.entries(score.breakdown).map(([k, v]) => (
                        <div key={k}>
                          <div className="flex justify-between text-sm mb-1"><span className="text-zinc-400 capitalize">{k.replace(/_/g, " ")}</span><span className={sc(v.score)}>{v.score}/100</span></div>
                          <div className="w-full bg-zinc-800 rounded-full h-2"><div className={`h-2 rounded-full ${sb(v.score)}`} style={{ width: `${Math.max(v.score, 5)}%` }} /></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <h3 className="font-semibold mb-4">Recent AI Changes</h3>
                  <div className="space-y-3 text-sm text-zinc-400">
                    {score.recommendation ? (
                      <div className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">💡</span><span>{score.recommendation} — <Link href={`/actions?domain=${encodeURIComponent(domain)}`} className="text-emerald-400 underline">Fix in Action Center →</Link></span></div>
                    ) : hasBreakdown ? (
                      <div className="flex items-start gap-2"><span className="text-zinc-500 mt-0.5">ℹ</span><span>Run full scan: <Link href={`/analytics?domain=${encodeURIComponent(domain)}`} className="text-emerald-400 underline">Site Analytics →</Link></span></div>
                    ) : (
                      <div className="flex items-start gap-2"><span className="text-zinc-500 mt-0.5">ℹ</span><span>Click <strong>Refresh</strong> to get the latest AI analysis with full breakdown.</span></div>
                    )}
                    {autoCount > 3 && (
                      <div className="flex items-start gap-2"><span className="text-yellow-400 mt-0.5">⚠</span><span>{autoCount} issues found. <Link href={`/actions?domain=${encodeURIComponent(domain)}`} className="text-amber-400 underline">Open Action Center →</Link></span></div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick actions */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {isSaaS ? (
                  <>
                    <QuickAction icon="💻" label="SaaS Schema Audit" href={`/saas-audit`} />
                    <QuickAction icon="🔧" label="Generate Schema" href={`/saas-optimize`} />
                    <QuickAction icon="🏆" label="AI Recommendations" href={`/rank`} />
                    <QuickAction icon="📈" label="Verify Impact" href={`/verify`} />
                  </>
                ) : (
                  <>
                    <QuickAction icon="🔧" label="Auto-Fix Schema" href={`/optimize?url=${encodeURIComponent(`https://${domain}`)}`} />
                    <QuickAction icon="📡" label="Track Rankings" href={`/monitoring`} />
                    <QuickAction icon="⚔️" label="Compare Competitors" href={`/compare`} />
                    <QuickAction icon="📋" label="View Reports" href={`/reports`} />
                  </>
                )}
              </div>
            </>
          )}

          {/* ===== HAS SITES BUT NO SCORE LOADED ===== */}
          {!hasNoSites && !score && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-3">
              <div className="text-3xl">📊</div>
              <p className="text-zinc-300 font-medium">Select a store above or enter a new domain to see your AI Visibility Score.</p>
              <p className="text-sm text-zinc-500">All your stores are saved automatically — your dashboard will be ready every time you return.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, colorClass }: { label: string; value: string; change?: string; colorClass?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="text-xs text-zinc-500 mb-1 truncate">{label}</div>
      <div className={`text-xl font-bold ${colorClass || "text-zinc-200"}`}>{value}</div>
    </div>
  );
}

function QuickAction({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <Link href={href} className="bg-zinc-900 border border-zinc-800 hover:border-emerald-700 rounded-xl p-4 text-center transition">
      <div className="text-xl mb-1">{icon}</div>
      <div className="text-xs font-medium text-zinc-200">{label}</div>
    </Link>
  );
}
