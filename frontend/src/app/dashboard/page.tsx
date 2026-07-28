"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

interface CMSData { domain: string; platform: string; confidence: number; recommended_action: string; auth_method: string; }
interface ScoreData {
  ai_visibility_score: number; label: string;
  breakdown: Record<string, { score: number; weight: number; label?: string; desc?: string }>;
  recommendation: string; analyzed_at?: string; title?: string;
}

const NAV_ECOMMERCE = [
  { label: "🏠 Home", href: "/", icon: "" },
  { label: "Dashboard", href: "/dashboard", icon: "📊", active: true },
  { label: "Products", href: "/products", icon: "📦" },
  { label: "Knowledge Graph", href: "/knowledge-graph", icon: "🧠" },
  { label: "Knowledge Base", href: "/knowledge-base", icon: "📚" },
  { label: "Citation Intelligence", href: "/cite", icon: "📰" },
  { label: "Competitors", href: "/compare", icon: "⚔️" },
  { label: "Social Listening", href: "/social-listening", icon: "👂" },
  { label: "Source Marketplace", href: "/marketplace", icon: "🏪" },
  { label: "Action Center", href: "/actions", icon: "⚡" },
  { label: "Optimization Center", href: "/optimize", icon: "🔧" },
  { label: "Verification", href: "/verify", icon: "📈" },
  { label: "Monitoring", href: "/monitoring", icon: "📡" },
  { label: "Reports", href: "/reports", icon: "📊" },
  { label: "Integrations", href: "/integrations", icon: "🔌" },
  { label: "Settings", href: "/settings", icon: "⚙️" },
];

const NAV_SAAS = [
  { label: "🏠 Home", href: "/", icon: "" },
  { label: "Dashboard", href: "/dashboard", icon: "📊", active: true },
  { label: "Knowledge Graph", href: "/knowledge-graph", icon: "🧠" },
  { label: "Knowledge Base", href: "/knowledge-base", icon: "📚" },
  { label: "Citation Intelligence", href: "/cite", icon: "📰" },
  { label: "Competitors", href: "/compare", icon: "⚔️" },
  { label: "Social Listening", href: "/social-listening", icon: "👂" },
  { label: "Source Marketplace", href: "/marketplace", icon: "🏪" },
  { label: "Monitoring", href: "/monitoring", icon: "📡" },
  { label: "Reports", href: "/reports", icon: "📊" },
  { label: "Integrations", href: "/integrations", icon: "🔌" },
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

const GREETINGS = ["Good Morning", "Good Afternoon", "Good Evening"];
function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? GREETINGS[0] : h < 18 ? GREETINGS[1] : GREETINGS[2];
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
  const [scoreHistory, setScoreHistory] = useState<{date:string;score:number}[]>([]);
  const [scoreTrend, setScoreTrend] = useState<"up"|"down"|"flat">("flat");
  const [scoreChange, setScoreChange] = useState(0);
  const [alerts, setAlerts] = useState<string[]>([]);

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

  useEffect(() => {
    if (!domain || !score) return;
    const clean = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
    fetch(`/api/score/history?domain=${encodeURIComponent(clean)}&days=30`)
      .then(r => r.json())
      .then(d => {
        if (d.snapshots?.length > 0) {
          setScoreHistory(d.snapshots);
          setScoreTrend(d.trend || "flat");
          setScoreChange(d.change || 0);
        }
        const newAlerts: string[] = [];
        if (score?.breakdown) {
          for (const [key, val] of Object.entries(score.breakdown)) {
            if (val.score < 20) newAlerts.push(`${val.label || key} critically low at ${val.score}/100 — needs immediate attention`);
          }
        }
        if (d.trend === "down") newAlerts.push(`Score trending down over ${d.snapshots.length} days — check what changed`);
        setAlerts(newAlerts);
      })
      .catch(() => {});
  }, [domain, score]);

  const isSaaS = mode === "saas";
  const hasBreakdown = score && Object.keys(score.breakdown || {}).length > 0;

  const loadSites = async (uid: string) => {
    const { data } = await supabase.from("sites").select("*").eq("user_id", uid).order("updated_at", { ascending: false });
    if (data && data.length > 0) {
      setSites(data);
      const last = data[0];
      setDomain(last.domain);
      setCms({ domain: last.domain, platform: last.platform || "unknown", confidence: last.platform_confidence || 0, recommended_action: "Previously analyzed.", auth_method: last.auth_method || "csv_upload" });
      if (last.score_data) { setScore(last.score_data as ScoreData); }
      else if (last.ai_visibility_score) {
        setScore({ ai_visibility_score: last.ai_visibility_score, label: last.ai_visibility_score >= 60 ? "Good" : "Poor", breakdown: {}, recommendation: "" });
      }
    }
  };

  const saveScoreToDB = async (cleanDomain: string, scoreData: ScoreData) => {
    const enriched = { ...scoreData, analyzed_at: new Date().toISOString() };
    await supabase.from("sites").update({ ai_visibility_score: scoreData.ai_visibility_score, score_data: enriched, updated_at: new Date().toISOString() }).eq("user_id", user!.id).eq("domain", cleanDomain);
  };

  const handleAnalyze = useCallback(async (e?: React.FormEvent, targetDomain?: string) => {
    if (e) e.preventDefault();
    const d = (targetDomain || domain).trim();
    if (!d || !user) return;
    setLoading(true); setError(""); setCms(null); setScore(null);
    try {
      const cleanDomain = d.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
      const cmsRes = await fetch("/api/cms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: cleanDomain }) });
      const cmsData = await cmsRes.json();
      setCms(cmsData);
      await supabase.from("sites").upsert({ user_id: user.id, domain: cleanDomain, platform: cmsData.platform, platform_confidence: cmsData.confidence, auth_method: cmsData.auth_method, updated_at: new Date().toISOString() }, { onConflict: "user_id,domain" });
      const scoreRes = await fetch("/api/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: `https://${cleanDomain}`, product_name: cleanDomain }) });
      if (scoreRes.ok) {
        const sd: ScoreData = await scoreRes.json();
        setScore(sd);
        setDomain(cleanDomain);
        localStorage.setItem(`prodrank_last_domain_${user.id}`, cleanDomain);
        await saveScoreToDB(cleanDomain, sd);
        await loadSites(user.id);
      }
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  }, [domain, user]);

  const handleRefresh = async () => { setRefreshingScore(true); await handleAnalyze(undefined, domain); setRefreshingScore(false); };

  if (authLoading) return (<main className="min-h-screen flex items-center justify-center bg-zinc-950"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full" /></main>);
  if (!user) return (<main className="min-h-screen flex items-center justify-center bg-zinc-950"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to see your dashboard</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div></main>);

  const sc = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-amber-400" : "text-red-400";
  const sb = (s: number) => s >= 70 ? "bg-emerald-500" : s >= 40 ? "bg-amber-500" : "bg-red-500";
  const lastAnalyzed = score?.analyzed_at || null;
  const hasNoSites = sites.length === 0;

  // Today's priority: weakest scoring dimension
  const dims = hasBreakdown ? (Object.entries(score!.breakdown) as [string, { score: number; weight: number; label?: string; desc?: string }][]).sort((a, b) => a[1].score - b[1].score) : [];
  const weakest = dims[0];

  const PILLAR_ACTIONS: Record<string, { icon: string; action: string; link: string }> = {
    discover: { icon: "🔍", action: "Fix Schema — Run Auto-Fix", link: `/knowledge-graph?domain=${encodeURIComponent(domain)}` },
    understand: { icon: "🧠", action: "Expand Product Content & Descriptions", link: `/knowledge-graph?domain=${encodeURIComponent(domain)}` },
    trust: { icon: "🛡️", action: "Build Trust — Reviews, Citations, PR", link: "/cite" },
    recommend: { icon: "🚀", action: "Check Competitor Rankings", link: `/compare?domain=${encodeURIComponent(domain)}` },
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-56" : "w-14"} bg-zinc-900 border-r border-zinc-800 shrink-0 transition-all duration-200 flex flex-col`}>
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          {sidebarOpen && <Link href="/dashboard" className="font-bold text-emerald-400 text-lg">ProdRank</Link>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-zinc-500 hover:text-zinc-300 text-xs">{sidebarOpen ? "◀" : "▶"}</button>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {(isSaaS ? NAV_SAAS : NAV_ECOMMERCE).map(item => (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${item.active ? "bg-emerald-900/30 text-emerald-400" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"}`}>
              <span>{item.icon}</span>{sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-center gap-2 text-sm text-zinc-400"><span className="w-2 h-2 rounded-full bg-emerald-500" />{user.email?.split("@")[0]}</div>
          <button onClick={() => supabase.auth.signOut()} className="text-xs text-zinc-500 hover:text-zinc-300 mt-1">Sign out</button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">

          {/* ===== HEADER: Greeting + Domain input ===== */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold">{getGreeting()}, {user.email?.split("@")[0]}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded-full">{isSaaS ? "💻 SaaS" : "🛒 Store"}</span>
                {domain && <span className="text-xs text-zinc-500">{domain}</span>}
                {lastAnalyzed && <span className="text-xs text-zinc-600">Analyzed {timeAgo(lastAnalyzed)}</span>}
              </div>
            </div>
            <div className="flex gap-2">
              <input type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourdomain.com" className="w-48 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <button onClick={(e) => handleAnalyze(e as any)} disabled={loading || !domain.trim()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">{loading ? "..." : "Analyze"}</button>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* ===== NEW USER: No sites ===== */}
          {hasNoSites && !score && (
            <div className="bg-emerald-900/10 border border-emerald-800 rounded-xl p-10 text-center space-y-4">
              <div className="text-4xl">👋</div>
              <h3 className="text-xl font-semibold text-white">Welcome to ProdRank!</h3>
              <p className="text-zinc-400 text-sm max-w-lg mx-auto">
                Enter your store domain above to see your AI Shopping Score. No setup required — we analyze everything automatically.
              </p>
            </div>
          )}

          {/* ===== HAS SITES BUT NO SCORE ===== */}
          {!hasNoSites && !score && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-3">
              <div className="text-3xl">📊</div>
              <p className="text-zinc-300 font-medium">Select a site above or enter a new domain to see your AI Visibility Score.</p>
            </div>
          )}

          {/* ===== SCORE LOADED ===== */}
          {score && (
            <>
              {/* Overal Score Hero */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center relative">
                <button onClick={handleRefresh} disabled={refreshingScore} className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-500 text-xs rounded-lg"><span className={refreshingScore ? "animate-spin" : ""}>🔄</span></button>
                <div className="text-xs text-zinc-500 mb-2">AI Recommendation Readiness</div>
                <div className={`text-8xl font-bold tracking-tight ${sc(score.ai_visibility_score || 0)}`}>{score.ai_visibility_score}</div>
                <div className="flex items-center justify-center gap-2 mt-2">
                  {scoreChange !== 0 ? (
                    <span className={`text-sm font-medium ${scoreChange > 0 ? "text-emerald-400" : "text-red-400"}`}>{scoreChange > 0 ? `▲ +${scoreChange}` : `▼ ${scoreChange}`} from last report</span>
                  ) : (
                    <span className="text-sm text-zinc-500">No change from last report</span>
                  )}
                </div>
                <div className={`inline-flex items-center gap-1 mt-3 px-3 py-1 rounded-full text-xs font-medium ${score.ai_visibility_score >= 60 ? "bg-emerald-900/30 text-emerald-400" : "bg-amber-900/30 text-amber-400"}`}>{score.label}</div>
                {scoreHistory.length >= 2 && (
                  <div className="mt-4 flex items-end justify-center gap-0.5 h-10">
                    {scoreHistory.slice(-14).map((s, i) => { const h = Math.max(4, (s.score / 100) * 40); return <div key={i} className="w-2 bg-emerald-500/60 rounded-t-sm" style={{ height: `${h}px` }} title={`${s.date}: ${s.score}`} />; })}
                  </div>
                )}
              </div>

              {/* Four Pillars */}
              <div className="grid grid-cols-4 gap-3">
                {hasBreakdown && Object.entries(score.breakdown).map(([key, val]) => (
                  <div key={key} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-center">
                    <div className={`text-3xl font-bold ${sc(val.score)}`}>{val.score}</div>
                    <div className="text-xs text-zinc-400 mt-1">{val.label || key}</div>
                    <div className="text-xs text-zinc-600 mt-0.5">{val.desc || ""}</div>
                  </div>
                ))}
              </div>

              {/* Today's Priority — weakest pillar */}
              {weakest && (
                <div className="bg-emerald-900/10 border border-emerald-800 rounded-xl p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-emerald-400 font-medium mb-1">⭐ TODAY'S PRIORITY</div>
                      <div className="text-lg font-semibold text-white">
                        {PILLAR_ACTIONS[weakest[0]]?.action || `Improve ${weakest[1].label || weakest[0]}`}
                      </div>
                      <div className="text-xs text-zinc-400 mt-1">
                        Expected Gain: +{Math.round((100 - weakest[1].score) * 0.25)} pts &nbsp;|&nbsp; Time: ~5 min
                      </div>
                    </div>
                    <Link href={PILLAR_ACTIONS[weakest[0]]?.link || "/knowledge-graph"} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition whitespace-nowrap">
                      Fix Now →
                    </Link>
                  </div>
                  <div className="mt-3 w-full bg-zinc-800 rounded-full h-2">
                    <div className={`h-2 rounded-full ${sb(weakest[1].score)}`} style={{ width: `${Math.max(weakest[1].score, 5)}%` }} />
                  </div>
                </div>
              )}

              {/* Quick stats row */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Products Analyzed", value: sites.length || 1, sub: `${sites.length || 1} site${sites.length !== 1 ? "s" : ""}` },
                  { label: "Schema Health", value: hasBreakdown ? `${score.breakdown?.discover?.score || "—"}/100` : "—", sub: "Discover Score" },
                  { label: "Competitors Tracked", value: "Auto", sub: "Refreshed with each scan" },
                  { label: "Alerts", value: alerts.length, sub: alerts.length > 0 ? `${alerts.length} need attention` : "All clear" },
                ].map((s, i) => (
                  <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                    <div className="text-xl font-bold text-emerald-400">{s.value}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
                    <div className="text-xs text-zinc-600">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* ===== YOUR SITES ===== */}
              {sites.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">{isSaaS ? "Your Sites" : "Your Stores"}</h3>
                    <span className="text-xs text-zinc-500">{sites.length} site{sites.length > 1 ? "s" : ""}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sites.map((s: any) => (
                      <button key={s.id} onClick={() => { setDomain(s.domain); handleAnalyze(undefined, s.domain); }}
                        className={`bg-zinc-800/50 hover:bg-zinc-800 rounded-lg p-4 flex items-center justify-between transition border text-left ${s.domain === domain ? "border-emerald-700 ring-1 ring-emerald-700/50" : "border-transparent"}`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-zinc-200">{s.domain}</span>
                            {s.inject_active ? (
                              <span className="text-xs text-emerald-400">● Active</span>
                            ) : (
                              <span className="text-xs text-zinc-600">○ Not tracked</span>
                            )}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {(s.platform && s.platform !== "unknown") ? s.platform : (isSaaS ? "SaaS Site" : "Web Store")}
                            {s.score_data?.analyzed_at && <span className="ml-2 text-zinc-600">· {timeAgo(s.score_data.analyzed_at)}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`text-lg font-bold ${sc(s.ai_visibility_score || 0)}`}>{s.ai_visibility_score ?? "—"}</div>
                          <span className="text-xs text-emerald-400">View →</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ===== COMPETITOR MONITOR ===== */}
              <CompetitorMonitor domain={domain} />

              {/* ===== ALERTS ===== */}
              {alerts.length > 0 && (
                <div className="bg-zinc-900 border border-red-800/50 rounded-xl p-6">
                  <h3 className="font-semibold mb-3 flex items-center gap-2"><span className="text-red-400">🔔</span> Recent Alerts</h3>
                  <div className="space-y-2">
                    {alerts.slice(0, 5).map((a, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-zinc-300 bg-red-900/10 border border-red-800/30 rounded-lg px-4 py-2.5">
                        <span className="text-red-400 mt-0.5">⚠</span><span>{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===== LATEST OPTIMIZATIONS ===== */}
              {scoreHistory.length >= 3 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <h3 className="font-semibold mb-3">📈 Score Trend</h3>
                  <div className="flex items-end justify-between gap-2 h-20">
                    {scoreHistory.map((s, i) => {
                      const h = Math.max(4, (s.score / 100) * 80);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-xs text-zinc-600">{s.score}</span>
                          <div className="w-full bg-emerald-500/60 rounded-t-sm" style={{ height: `${h}px` }} />
                          <span className="text-xs text-zinc-700">{s.date?.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-xs text-zinc-500 mt-3 text-center">
                    {scoreTrend === "up" ? "Trending up — keep going!" : scoreTrend === "down" ? "Trending down — check what changed" : "Steady — monitor for changes"}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function CompetitorMonitor({ domain }: { domain: string }) {
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!domain || loaded) return;
    const clean = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
    setLoading(true);
    fetch("/api/score/competitors/compare", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: clean, name: clean }),
    })
      .then(r => r.json())
      .then(d => { if (d.results?.length >= 2) setCompetitors(d.results); })
      .catch(() => {})
      .finally(() => { setLoading(false); setLoaded(true); });
  }, [domain]);

  if (loading) return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center gap-2"><div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" /><span className="text-sm text-zinc-500">Detecting competitors…</span></div>
    </div>
  );
  if (competitors.length < 2) return null;

  const you = competitors.find((c: any) => c.is_you);
  const others = competitors.filter((c: any) => !c.is_you && !c.error).sort((a: any, b: any) => (b.estimated_score || 0) - (a.estimated_score || 0));

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">⚔️ Competitor Monitor</h3>
        <Link href={`/compare?domain=${encodeURIComponent(domain)}`} className="text-xs text-emerald-400 hover:text-emerald-300">Full comparison →</Link>
      </div>
      <div className="flex items-end gap-2 mb-3">
        {[you, ...others].filter(Boolean).slice(0, 5).map((c: any, i: number) => {
          const h = Math.max(8, ((c.estimated_score || 0) / 100) * 60);
          return (
            <div key={i} className="flex-1 text-center">
              <div className="text-xs font-bold text-zinc-200 mb-1">{c.estimated_score || "—"}</div>
              <div className={`w-full rounded-t-md mx-auto ${c.is_you ? "bg-emerald-500" : "bg-zinc-600"}`} style={{ height: `${h}px`, maxWidth: "40px", margin: "0 auto" }} />
              <div className="text-xs text-zinc-500 mt-1 truncate" title={c.name}>{c.is_you ? "You" : c.name?.split(" ")[0]}</div>
            </div>
          );
        })}
      </div>
      {others.length > 0 && you && (
        <div className="text-xs text-zinc-500 text-center">
          {you.estimated_score >= (others[0]?.estimated_score || 0)
            ? "🎉 You're leading! Keep going."
            : `📉 ${others[0].name} leads by ${(others[0].estimated_score || 0) - (you.estimated_score || 0)} pts — improve schema + content to catch up.`}
        </div>
      )}
    </div>
  );
}
