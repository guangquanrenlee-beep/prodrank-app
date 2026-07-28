"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

interface CMSData { domain: string; platform: string; confidence: number; recommended_action: string; auth_method: string; }
interface ScoreData { ai_visibility_score: number; label: string; breakdown: Record<string, { score: number; weight: number }>; recommendation: string; analyzed_at?: string; }

interface ManualTask {
  id: string; label: string; points: number; time: string; link?: string;
  approval?: string; // e.g. "7-14 days for approval"
}

const NAV_ECOMMERCE = [
  { label: "🏠 Home", href: "/", icon: "" },
  { label: "Dashboard", href: "/dashboard", icon: "📊", active: true },
  { label: "Products", href: "/products", icon: "📦" },
  { label: "Knowledge Graph", href: "/knowledge-graph", icon: "🧠" },
  { label: "Citation Intelligence", href: "/cite", icon: "📰" },
  { label: "Competitors", href: "/compare", icon: "⚔️" },
  { label: "Action Center", href: "/actions", icon: "⚡" },
  { label: "Optimization Center", href: "/optimize", icon: "🔧" },
  { label: "Impact", href: "/verify", icon: "📈" },
  { label: "Monitoring", href: "/monitoring", icon: "📡" },
  { label: "Integrations", href: "/integrations", icon: "🔌" },
  { label: "Free Tools", href: "/tools/schema-validator", icon: "🛠️" },
  { label: "Settings", href: "/settings", icon: "⚙️" },
];

const NAV_SAAS = [
  { label: "🏠 Home", href: "/", icon: "" },
  { label: "Dashboard", href: "/dashboard", icon: "📊", active: true },
  { label: "Knowledge Graph", href: "/knowledge-graph", icon: "🧠" },
  { label: "Citation Intelligence", href: "/cite", icon: "📰" },
  { label: "Competitors", href: "/compare", icon: "⚔️" },
  { label: "Monitoring", href: "/monitoring", icon: "📡" },
  { label: "SaaS Optimize", href: "/saas-optimize", icon: "🔧" },
  { label: "Integrations", href: "/integrations", icon: "🔌" },
  { label: "Settings", href: "/settings", icon: "⚙️" },
];

const SAAS_MANUAL_TASKS: ManualTask[] = [
  { id: "g2", label: "List on G2", points: 8, time: "30 min", approval: "7-14 days", link: "https://g2.com" },
  { id: "capterra", label: "List on Capterra", points: 8, time: "20 min", approval: "3-7 days", link: "https://capterra.com" },
  { id: "producthunt", label: "Launch on Product Hunt", points: 5, time: "1 hour", approval: "1-2 days", link: "https://producthunt.com" },
  { id: "comparison", label: "Add comparison page (vs competitors)", points: 10, time: "1-2 hours", link: "/actions" },
  { id: "usecases", label: "Build use case pages", points: 8, time: "2-3 hours", link: "/actions" },
  { id: "pricing", label: "Publish transparent pricing", points: 5, time: "30 min", link: "/actions" },
  { id: "content", label: "Expand site content to 500+ words", points: 8, time: "2 hours", link: "/knowledge-graph" },
  { id: "trustpilot", label: "Create Trustpilot page", points: 2, time: "10 min", approval: "instant, reviews take weeks", link: "https://trustpilot.com" },
  { id: "getapp", label: "Submit to GetApp", points: 2, time: "15 min", approval: "7-14 days", link: "https://getapp.com" },
  { id: "backlinks", label: "Get backlinks from partner blogs", points: 10, time: "ongoing", link: "/cite" },
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
  const [doneTasks, setDoneTasks] = useState<Set<string>>(new Set());
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
      const saved = localStorage.getItem(`prodrank_tasks_${user.id}`);
      if (saved) setDoneTasks(new Set(JSON.parse(saved)));
    }
  }, [user]);

  // Fetch score history when domain or score changes
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
        // Generate alerts from breakdown changes
        const newAlerts: string[] = [];
        if (score?.breakdown && hasBreakdown) {
          const dims = Object.entries(score.breakdown) as [string, {score:number;weight:number}][];
          for (const [key, val] of dims) {
            if (val.score < 20) newAlerts.push(`${key.replace(/_/g, " ")} critically low at ${val.score}/100 — needs immediate attention`);
          }
        }
        if (d.trend === "down") newAlerts.push(`Score trending down over ${d.snapshots.length} days — check what changed`);
        setAlerts(newAlerts);
      })
      .catch(() => {});
  }, [domain, score]);

  const isSaaS = mode === "saas";

  const toggleTask = (id: string) => {
    const next = new Set(doneTasks);
    if (next.has(id)) next.delete(id); else next.add(id);
    setDoneTasks(next);
    localStorage.setItem(`prodrank_tasks_${user!.id}`, JSON.stringify([...next]));
  };

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

  const sc = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-yellow-400" : "text-red-400";
  const sb = (s: number) => s >= 70 ? "bg-emerald-500" : s >= 40 ? "bg-yellow-500" : "bg-red-500";
  const hasBreakdown = score && Object.keys(score.breakdown).length > 0;
  const lastAnalyzed = score?.analyzed_at || null;
  const hasNoSites = sites.length === 0;
  const doneCount = doneTasks.size;
  const totalTasks = isSaaS ? SAAS_MANUAL_TASKS.length : 6;
  const progressPct = Math.round((doneCount / totalTasks) * 100);

  // Build today's priority — lowest scoring dimension
  const dims = hasBreakdown ? (Object.entries(score!.breakdown) as [string, { score: number; weight: number }][]).sort((a, b) => a[1].score - b[1].score) : [];
  const todayDim = dims[0];

  const ACTION_MAP: Record<string, { icon: string; action: string; link: string; desc: string }> = {
    product_completeness: { icon: "🔧", action: "Complete your Schema (Auto-Fix)", link: `/knowledge-graph?domain=${encodeURIComponent(domain)}`, desc: "Click Auto-Fix to fill in all 12 SoftwareApplication schema fields. Instant — no manual work." },
    knowledge_coverage: { icon: "📝", action: "Expand your page content to 500+ words", link: `/knowledge-graph?domain=${encodeURIComponent(domain)}`, desc: "AI needs substance to understand your software. Add detailed feature descriptions, use cases, and integration info." },
    question_coverage: { icon: "❓", action: "Add FAQ content to your site", link: `/knowledge-graph?domain=${encodeURIComponent(domain)}`, desc: "AI shoppers ask about pricing, features, integrations, and how you compare. Your site should answer these." },
    citation_authority: { icon: "📰", action: "Get listed on G2, Capterra, Product Hunt", link: "/cite", desc: "AI agents cite external sources when recommending software. Register on the top 3 directories below." },
    recommendation_frequency: { icon: "📈", action: "Improve overall AI presence", link: "/actions", desc: "This dimension improves as you fix Schema, content, and citations. Keep going — it compounds." },
    external_evidence: { icon: "🌐", action: "Build external validation", link: "/cite", desc: "Get listed on review sites, directories, and partner blogs. AI weights third-party proof heavily." },
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

          {/* ===== HEADER ===== */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{domain || (isSaaS ? "AI Visibility Score" : "AI Shopping Index")}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded-full">{isSaaS ? "💻 SaaS" : "🛒 Store"}</span>
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
                {isSaaS
                  ? "Step 1: Install inject-saas.js on your site (1 line of code). Step 2: Enter your domain above. Step 3: Click Auto-Fix. That's it — we handle the rest."
                  : "Enter your store domain above and we'll check if AI agents can see your products."}
              </p>
              <div className="flex justify-center gap-3 pt-2">
                {isSaaS ? (
                  <>
                    <Link href="/inject-guide" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition">1. Install inject-saas.js →</Link>
                    <span className="px-4 py-2 bg-zinc-700 text-zinc-400 text-sm font-medium rounded-lg">2. Analyze above ↑</span>
                    <span className="px-4 py-2 bg-zinc-700 text-zinc-400 text-sm font-medium rounded-lg">3. Auto-Fix ↓</span>
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

              {/* ===== POST-ANALYZE NEXT STEPS ===== */}
              {isSaaS && scoreHistory.length < 2 && (
                <div className="bg-emerald-900/10 border border-emerald-800 rounded-xl p-5">
                  <h3 className="font-semibold mb-3">✅ First analysis done. Here's what to do next:</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Link href={`/knowledge-graph?domain=${encodeURIComponent(domain)}`}
                      className="bg-emerald-900/20 border border-emerald-800 rounded-lg p-4 hover:border-emerald-600 transition">
                      <div className="text-lg mb-1">🔧</div>
                      <div className="text-sm font-medium text-emerald-400">1. Run Auto-Fix</div>
                      <div className="text-xs text-zinc-400 mt-1">AI fills all 12 SoftwareApplication schema fields — instant, one click.</div>
                    </Link>
                    <button onClick={async () => {
                      const clean = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
                      window.location.href = `/compare?domain=${encodeURIComponent(clean)}`;
                    }}
                      className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 hover:border-blue-600 transition text-left">
                      <div className="text-lg mb-1">⚔️</div>
                      <div className="text-sm font-medium text-blue-400">2. Check Competitors</div>
                      <div className="text-xs text-zinc-400 mt-1">AI auto-detects your top competitors and compares your scores.</div>
                    </button>
                    <div className="bg-zinc-800/30 border border-zinc-700 rounded-lg p-4">
                      <div className="text-lg mb-1">✋</div>
                      <div className="text-sm font-medium text-zinc-300">3. Register on directories</div>
                      <div className="text-xs text-zinc-400 mt-1">G2, Capterra, Product Hunt — the checklist below.</div>
                    </div>
                  </div>
                </div>
              )}

              {/* ===== THIS WEEK SUMMARY ===== */}
              {isSaaS && scoreHistory.length >= 2 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold flex items-center gap-2"><span>📈</span> This Week</h3>
                    <span className="text-xs text-zinc-500">{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-zinc-800/30 rounded-lg p-4">
                      <div className="text-xs text-zinc-500 mb-1">Your Score</div>
                      <div className="flex items-center gap-2">
                        <span className={`text-2xl font-bold ${sc(score.ai_visibility_score)}`}>{score.ai_visibility_score}</span>
                        {scoreChange !== 0 ? (
                          <span className={`text-sm font-medium ${scoreChange > 0 ? "text-emerald-400" : "text-red-400"}`}>{scoreChange > 0 ? `▲ +${scoreChange}` : `▼ ${scoreChange}`}</span>
                        ) : (
                          <span className="text-xs text-zinc-500">No change</span>
                        )}
                      </div>
                    </div>
                    <div className="bg-zinc-800/30 rounded-lg p-4">
                      <div className="text-xs text-zinc-500 mb-1">Biggest Mover</div>
                      {hasBreakdown && dims.length > 0 ? <>
                        <div className="flex items-center gap-2"><span className={`text-2xl font-bold ${sc(dims[0][1].score)}`}>{dims[0][1].score}</span><span className="text-xs text-zinc-400">/100</span></div>
                        <div className="text-xs text-zinc-500 mt-0.5 capitalize">{dims[0][0].replace(/_/g, " ")}</div>
                      </> : <div className="text-zinc-600 text-sm">N/A</div>}
                    </div>
                    <div className="bg-zinc-800/30 rounded-lg p-4">
                      <div className="text-xs text-zinc-500 mb-1">Schema</div>
                      <div className="flex items-center gap-2"><span className="text-emerald-400 font-bold">12/12</span><span className="text-xs text-emerald-400">fields</span></div>
                      <Link href={`/knowledge-graph?domain=${encodeURIComponent(domain)}`} className="text-xs text-emerald-400 hover:underline mt-1 inline-block">Re-check →</Link>
                    </div>
                  </div>
                </div>
              )}

              {/* ===== HERO + PROGRESS ===== */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Score */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center relative">
                  <button onClick={handleRefresh} disabled={refreshingScore} className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 text-zinc-500 hover:text-zinc-300 text-xs rounded-lg transition">
                    <span className={refreshingScore ? "animate-spin" : ""}>🔄</span>
                  </button>
                  <div className={`text-7xl font-bold tracking-tight ${sc(score.ai_visibility_score || 0)}`}>{score.ai_visibility_score}</div>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <span className="text-sm text-zinc-500">AI Visibility Score</span>
                    {scoreHistory.length >= 2 && (
                      <span className={`text-xs font-medium ${scoreTrend === "up" ? "text-emerald-400" : scoreTrend === "down" ? "text-red-400" : "text-zinc-500"}`}>
                        {scoreTrend === "up" ? `▲ +${scoreChange}` : scoreTrend === "down" ? `▼ ${scoreChange}` : "—"}
                      </span>
                    )}
                  </div>
                  <div className={`inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-full text-xs font-medium ${score.ai_visibility_score >= 60 ? "bg-emerald-900/30 text-emerald-400" : "bg-amber-900/30 text-amber-400"}`}>{score.label}</div>
                  {scoreHistory.length >= 2 && (
                    <div className="mt-3 flex items-end justify-center gap-0.5 h-10">
                      {scoreHistory.slice(-14).map((s, i) => {
                        const h = Math.max(4, (s.score / 100) * 40);
                        return <div key={i} className="w-2 bg-emerald-500/60 rounded-t-sm" style={{ height: `${h}px` }} title={`${s.date}: ${s.score}`} />;
                      })}
                    </div>
                  )}
                  {lastAnalyzed && <div className="text-xs text-zinc-600 mt-2">Last analyzed: {new Date(lastAnalyzed).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>}
                </div>

                {/* Progress + Today */}
                <div className="md:col-span-2 space-y-4">
                  {/* Progress Bar */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">📋 Optimization Progress</h3>
                      <span className="text-xs text-zinc-500">{doneCount}/{totalTasks} tasks done</span>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-3">
                      <div className="bg-emerald-500 h-3 rounded-full transition-all" style={{ width: `${Math.max(progressPct, 5)}%` }} />
                    </div>
                    <p className="text-xs text-zinc-500 mt-2">
                      {progressPct < 30 ? "Getting started — tackle the first task below!" :
                       progressPct < 60 ? "Making progress — keep going!" :
                       progressPct < 100 ? "Almost there — finish the remaining tasks!" :
                       "All tasks done! Monitor your score and keep content fresh."}
                    </p>
                  </div>

                  {/* Today's Priority */}
                  {todayDim && (
                    <div className="bg-emerald-900/10 border border-emerald-800 rounded-xl p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-emerald-400 font-medium mb-1">🎯 TODAY'S PRIORITY</div>
                          <div className="text-sm font-semibold text-white">{ACTION_MAP[todayDim[0]]?.action || `Improve ${todayDim[0].replace(/_/g, " ")}`}</div>
                          <div className="text-xs text-zinc-400 mt-1">{ACTION_MAP[todayDim[0]]?.desc}</div>
                        </div>
                        <Link href={ACTION_MAP[todayDim[0]]?.link || "/actions"} className="flex-shrink-0 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition">Fix Now →</Link>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ===== QUICK STATS (3 only) ===== */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Schema Health", val: hasBreakdown ? `${score.breakdown?.product_completeness?.score || "—"}/100` : "—", hint: "Field completeness" },
                  { label: "Citation Authority", val: hasBreakdown ? `${score.breakdown?.citation_authority?.score || "—"}/100` : "—", hint: "External trust" },
                  { label: "Top Gain", val: todayDim ? `+${Math.round((100 - todayDim[1].score) * todayDim[1].weight / 100)}` : "—", hint: todayDim ? todayDim[0].replace(/_/g, " ") : "Analyze first" },
                ].map((s, i) => (
                  <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                    <div className={`text-xl font-bold ${sc(i === 2 ? 100 : (hasBreakdown ? score.breakdown?.[i === 0 ? 'product_completeness' : 'citation_authority']?.score || 0 : 0))}`}>{s.val}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
                    <div className="text-xs text-zinc-600">{s.hint}</div>
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
                              <span className="text-xs text-emerald-400" title={`Last ping: ${new Date(s.last_ping_at).toLocaleString()}`}>● Active</span>
                            ) : (
                              <span className="text-xs text-zinc-600" title="Inject script not detected.">○ Not tracked</span>
                            )}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {(s.platform && s.platform !== "unknown") ? s.platform : (isSaaS ? "SaaS Site" : "Web Store")}
                            {s.score_data?.analyzed_at && <span className="ml-2 text-zinc-600">· {timeAgo(s.score_data.analyzed_at)}</span>}
                            {s.last_ping_at && <span className="ml-2 text-zinc-600">· Ping: {timeAgo(s.last_ping_at)}</span>}
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

              {/* ===== TWO COLUMN: AUTO + MANUAL ===== */}
              {isSaaS && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Auto column */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <h3 className="font-semibold mb-4 flex items-center gap-2"><span className="text-emerald-400">🤖</span> Automatic — Already Working</h3>
                    <div className="space-y-3">
                      {[
                        { label: "Schema injection", status: sites.some(s => s.inject_active) ? "Active" : "Inactive", ok: sites.some(s => s.inject_active) },
                        { label: "Daily score monitoring", status: "Active", ok: true },
                        { label: "SoftwareApplication JSON-LD", status: "Auto-generated", ok: true },
                        { label: "Organization JSON-LD", status: "Auto-generated", ok: true },
                        { label: "FAQPage JSON-LD", status: "Auto-generated", ok: true },
                        { label: "Schema Auto-Fix", status: "Available", ok: true },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-zinc-300">{item.label}</span>
                          <span className={`text-xs ${item.ok ? "text-emerald-400" : "text-zinc-600"}`}>{item.status}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-zinc-600 mt-4 pt-3 border-t border-zinc-800">
                      These run automatically. No action needed — they keep your site visible to AI 24/7.
                    </p>
                  </div>

                  {/* Manual column */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <h3 className="font-semibold mb-4 flex items-center gap-2"><span className="text-amber-400">✋</span> Manual — Needs Your Action</h3>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {SAAS_MANUAL_TASKS.map(task => {
                        const done = doneTasks.has(task.id);
                        return (
                          <div key={task.id} className={`flex items-center gap-3 rounded-lg p-2.5 border transition ${done ? "border-emerald-800/30 bg-emerald-900/5 opacity-60" : "border-zinc-700/50 bg-zinc-800/20 hover:border-zinc-600"}`}>
                            <button onClick={() => toggleTask(task.id)} className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition ${done ? "bg-emerald-500 border-emerald-500" : "border-zinc-600 hover:border-emerald-500"}`}>
                              {done && <span className="text-white text-xs">✓</span>}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm ${done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{task.label}</span>
                                <span className="text-xs bg-emerald-900/50 text-emerald-400 px-1.5 py-0.5 rounded font-medium">+{task.points}</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                                <span>⏱ {task.time}</span>
                                {task.approval && <span className="text-amber-500">⚠ {task.approval}</span>}
                              </div>
                            </div>
                            {task.link && !done && (
                              <a href={task.link} target={task.link.startsWith("http") ? "_blank" : undefined} rel="noopener" className="text-xs text-emerald-400 hover:text-emerald-300 flex-shrink-0">Go →</a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-zinc-600 mt-4 pt-3 border-t border-zinc-800">
                      ⚠ Directories like G2, Capterra, and GetApp take <strong>3-14 days</strong> for approval after submission. Start these early — they're the highest-scoring tasks.
                    </p>
                  </div>
                </div>
              )}

              {/* ===== ALERTS ===== */}
              {isSaaS && alerts.length > 0 && (
                <div className="bg-zinc-900 border border-red-800/50 rounded-xl p-6">
                  <h3 className="font-semibold mb-3 flex items-center gap-2"><span className="text-red-400">🔔</span> Alerts</h3>
                  <div className="space-y-2">
                    {alerts.map((a, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-zinc-300 bg-red-900/10 border border-red-800/30 rounded-lg px-4 py-2.5">
                        <span className="text-red-400 mt-0.5">⚠</span><span>{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ===== COMPETITOR MONITOR ===== */}
              {isSaaS && (
                <CompetitorMonitor domain={domain} />
              )}

              {/* ===== PRIORITY FIXES ===== */}
              {hasBreakdown && dims.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <h3 className="font-semibold mb-1">🎯 Score Breakdown & Fixes</h3>
                  <p className="text-xs text-zinc-500 mb-4">Ranked by impact — lowest scoring dimensions first</p>
                  <div className="space-y-3">
                    {dims.slice(0, 4).map(([key, val]) => {
                      const plan = ACTION_MAP[key] || { icon: "📌", action: `Improve ${key.replace(/_/g, " ")}`, link: "/actions", desc: "This dimension needs attention." };
                      const gain = Math.round((100 - val.score) * val.weight / 100);
                      return (
                        <Link key={key} href={plan.link} className="block rounded-lg p-4 border border-zinc-700 bg-zinc-800/20 hover:border-emerald-600 transition">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{plan.icon}</span>
                              <span className="text-sm font-medium text-zinc-200">{plan.action}</span>
                            </div>
                            <span className="text-xs bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded-full font-medium">+{gain} pts</span>
                          </div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs text-zinc-500 capitalize">{key.replace(/_/g, " ")}:</span>
                            <div className="flex-1 max-w-[80px] bg-zinc-700 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${sb(val.score)}`} style={{ width: `${Math.max(val.score, 5)}%` }} /></div>
                            <span className={`text-xs ${sc(val.score)}`}>{val.score}/100</span>
                          </div>
                          <p className="text-xs text-zinc-500">{plan.desc}</p>
                        </Link>
                      );
                    })}
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: clean, name: clean }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.results?.length >= 2) setCompetitors(d.results);
      })
      .catch(() => {})
      .finally(() => { setLoading(false); setLoaded(true); });
  }, [domain]);

  if (loading) return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center gap-2"><div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" /><span className="text-sm text-zinc-500">Detecting competitors…</span></div>
    </div>
  );

  if (competitors.length < 2) return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h3 className="font-semibold flex items-center gap-2 mb-2"><span className="text-blue-400">⚔️</span> Competitor Monitor</h3>
      <p className="text-xs text-zinc-500">Competitor data will load automatically on your next Analyze.</p>
    </div>
  );

  const you = competitors.find((c: any) => c.is_you);
  const others = competitors.filter((c: any) => !c.is_you && !c.error).sort((a: any, b: any) => (b.estimated_score || 0) - (a.estimated_score || 0));

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2"><span className="text-blue-400">⚔️</span> Competitor Monitor</h3>
        <Link href={`/compare?domain=${encodeURIComponent(domain)}`} className="text-xs text-emerald-400 hover:text-emerald-300">Full comparison →</Link>
      </div>
      <div className="flex items-end gap-2 mb-4">
        {[you, ...others].filter(Boolean).slice(0, 5).map((c: any, i: number) => {
          const h = Math.max(8, ((c.estimated_score || 0) / 100) * 80);
          return (
            <div key={i} className="flex-1 text-center">
              <div className="text-xs font-bold text-zinc-200 mb-1">{c.estimated_score || "—"}</div>
              <div className={`w-full rounded-t-md mx-auto ${c.is_you ? "bg-emerald-500" : "bg-zinc-600"}`} style={{ height: `${h}px`, maxWidth: "40px", margin: "0 auto" }} />
              <div className="text-xs text-zinc-500 mt-1.5 truncate" title={c.name}>{c.is_you ? "You" : c.name?.split(" ")[0]}</div>
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
