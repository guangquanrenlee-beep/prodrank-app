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

// Modules, not features: auto-running jobs (health check, alerts, weekly
// report, competitor/citation watch) live inside these modules — never as
// their own menu items. Pages removed from the nav still exist at their URLs.
const NAV = [
  { label: "Dashboard", href: "/dashboard", icon: "📊" },
  { label: "Products", href: "/products", icon: "📦" },
  { label: "AI Optimization", href: "/studio", icon: "🎯" },
  { label: "Knowledge Coverage", href: "/knowledge-coverage", icon: "🧠" },
  { label: "Monitoring", href: "/monitoring", icon: "📈" },
  { label: "Competitors", href: "/competitors", icon: "⚔️" },
  { label: "Citation Intelligence", href: "/cite", icon: "📰" },
  { label: "Verification", href: "/verify", icon: "✅" },
  { label: "Reports", href: "/reports", icon: "📄" },
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
function getGreeting() { const h = new Date().getHours(); return h < 12 ? GREETINGS[0] : h < 18 ? GREETINGS[1] : GREETINGS[2]; }

const PILLAR_INFO: Record<string, { icon: string; desc: string; lowWhy: string; midWhy: string; evidenceKeys: string[] }> = {
  discover: { icon: "🔍", desc: "Can AI find your products?", lowWhy: "AI cannot discover your products. Missing Product Schema means search engines and AI agents don't know your products exist.", midWhy: "AI can partially find your products. Some Schema fields are missing — complete them for full visibility.", evidenceKeys: ["No Product Schema", "Missing brand/price/shipping", "No structured data"] },
  understand: { icon: "🧠", desc: "Does AI understand them?", lowWhy: "Product descriptions are incomplete. AI needs detailed content — materials, audience, use cases, comparisons — to understand what you sell.", midWhy: "AI understands some products but coverage gaps remain. Add FAQ and detailed descriptions.", evidenceKeys: ["Short descriptions", "Missing FAQ", "No H1 tags", "No alt text"] },
  trust: { icon: "🛡️", desc: "Does AI believe in them?", lowWhy: "AI cannot verify your brand. Without reviews, citations, and external mentions, AI sees your products as unverified.", midWhy: "AI has partial trust. More reviews, citations, and brand mentions will strengthen your position.", evidenceKeys: ["No Review Schema", "No external reviews", "No Reddit/YouTube mentions", "Weak brand entity"] },
  recommend: { icon: "🚀", desc: "Will AI recommend them?", lowWhy: "AI confidence is low. Until Discover, Understand, and Trust scores improve, AI will recommend competitors over you.", midWhy: "Some AI agents recommend you. Fix remaining gaps to increase recommendation frequency.", evidenceKeys: ["Not mentioned by AI agents", "Competitors outrank you", "Low recommendation rate"] },
};

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [domain, setDomain] = useState("");
  const [cms, setCms] = useState<CMSData | null>(null);
  const [score, setScore] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sites, setSites] = useState<any[]>([]);
  const [healthTrend, setHealthTrend] = useState<any[]>([]);
  const [healthDelta, setHealthDelta] = useState<number | null>(null);
  const [healthSummary, setHealthSummary] = useState("");
  const [healthAlerts, setHealthAlerts] = useState<any[]>([]);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [compDomain, setCompDomain] = useState("");
  const [compAdding, setCompAdding] = useState(false);
  const [weeklySending, setWeeklySending] = useState(false);
  const [weeklyStatus, setWeeklyStatus] = useState("");
  const [citationDist, setCitationDist] = useState<any[]>([]);
  const [insight, setInsight] = useState<any>(null);

  const handleAddCompetitor = async () => {
    if (!domain || !compDomain.trim()) return;
    setCompAdding(true);
    try {
      const r = await fetch("/api/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop: domain, domain: compDomain.trim() }) });
      if (r.ok) { setCompDomain(""); loadCompetitors(domain); }
    } finally { setCompAdding(false); }
  };

  const loadCompetitors = async (shop: string) => {
    try {
      const r = await fetch(`/api/competitors?shop=${encodeURIComponent(shop)}`);
      if (r.ok) setCompetitors((await r.json()).competitors || []);
    } catch {}
  };

  const loadCitations = async () => {
    try {
      const r = await fetch(`/api/citations/trend?days=30`);
      if (r.ok) setCitationDist((await r.json()).distribution || []);
    } catch {}
  };

  const loadInsight = async (shop: string) => {
    try {
      const r = await fetch(`/api/insights?shop=${encodeURIComponent(shop)}`);
      if (r.ok) setInsight((await r.json()).insight || null);
    } catch {}
  };

  const handleWeeklyReport = async () => {
    if (!domain || !user?.email) { setWeeklyStatus("Need a store + account email"); return; }
    setWeeklySending(true); setWeeklyStatus("");
    try {
      const r = await fetch("/api/reports/weekly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop: domain, email: user.email }) });
      const d = await r.json();
      setWeeklyStatus(d.status || "done");
    } catch { setWeeklyStatus("failed"); }
    finally { setWeeklySending(false); }
  };
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [scoreHistory, setScoreHistory] = useState<{date:string;score:number}[]>([]);
  const [scoreTrend, setScoreTrend] = useState<"up"|"down"|"flat">("flat");
  const [scoreChange, setScoreChange] = useState(0);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [aiSummary, setAiSummary] = useState<any>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [whyLoading, setWhyLoading] = useState(false);

  // ── AI Recommendation Test (Test Engine + Insight Engine) ──
  const [aiTest, setAiTest] = useState<any>(null);
  const [aiInsight, setAiInsight] = useState<any>(null);
  const [aiTestLoading, setAiTestLoading] = useState(false);
  const [aiInsightLoading, setAiInsightLoading] = useState(false);
  const [applyStatus, setApplyStatus] = useState<string>("");
  const [applying, setApplying] = useState(false);
  const [retestResult, setRetestResult] = useState<any>(null);
  const [retesting, setRetesting] = useState(false);
  const [testModels, setTestModels] = useState<string[]>(["deepseek"]);
  const [trends, setTrends] = useState<any>(null);
  const [trendGaps, setTrendGaps] = useState<any[]>([]);
  const [rateTrend, setRateTrend] = useState<any[]>([]);
  const [compareInput, setCompareInput] = useState("");
  const [compareResult, setCompareResult] = useState<any>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [trendGrowth, setTrendGrowth] = useState<any>(null);

  const siteIdForDomain = () => sites.find((s: any) => s.domain === domain)?.id || "";

  const loadAiInsight = async () => {
    const sid = siteIdForDomain();
    if (!sid) return;
    setAiInsightLoading(true);
    try {
      const r = await fetch(`/api/insights/why?site_id=${encodeURIComponent(sid)}&domain=${encodeURIComponent(domain || "")}`);
      if (r.ok) setAiInsight(await r.json());
    } catch {}
    setAiInsightLoading(false);
  };

  const runAiTest = async (queryCount: number) => {
    const sid = siteIdForDomain();
    if (!sid || !domain) return;
    setAiTestLoading(true);
    try {
      const brand = domain.split(".")[0] || "Store";
      const r = await fetch("/api/test/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: sid, brand_name: brand, category: "", query_count: queryCount, models: testModels }),
      });
      if (r.ok) {
        setAiTest(await r.json());
        loadAiInsight();  // refresh the evidence after a test round
      }
    } catch {}
    setAiTestLoading(false);
  };

  const applyFix = async (factor: string) => {
    const sid = siteIdForDomain();
    if (!sid) return;
    setApplying(true); setApplyStatus("");
    try {
      const r = await fetch("/api/action/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: sid, domain: domain || "", factors: [factor] }),
      });
      const d = await r.json();
      if (r.ok) {
        setApplyStatus(`Generated & published on ${d.applied || 0} products${d.failed ? `, ${d.failed} failed` : ""}`);
        loadAiInsight();
      } else {
        setApplyStatus(typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail || "Fix failed"));
      }
    } catch { setApplyStatus("Network error"); }
    setApplying(false);
  };

  const retest = async () => {
    const sid = siteIdForDomain();
    if (!sid) return;
    setRetesting(true); setRetestResult(null);
    try {
      const r = await fetch("/api/action/retest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: sid, domain: domain || "", query_count: 50 }),
      });
      if (r.ok) {
        setRetestResult(await r.json());
        loadAiInsight();
      }
    } catch {}
    setRetesting(false);
  };

  const runCompare = async () => {
    const sid = siteIdForDomain();
    if (!sid || !compareInput.trim()) return;
    setCompareLoading(true); setCompareResult(null);
    try {
      const competitors = compareInput.split(",").map(s => s.trim()).filter(Boolean);
      const r = await fetch("/api/test/compare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: sid, domain: domain || "", brand_name: (domain || "").split(".")[0] || "Store", competitors, query_count: 30, models: ["deepseek"] }),
      });
      if (r.ok) setCompareResult(await r.json());
    } catch {}
    setCompareLoading(false);
  };

  const loadTrends = async () => {
    try {
      const sid = siteIdForDomain();
      const [hotR, gapsR] = await Promise.all([
        fetch("/api/trends/hot?top_n=12"),
        sid ? fetch(`/api/trends/gaps?site_id=${encodeURIComponent(sid)}`) : Promise.resolve(null),
      ]);
      if (hotR.ok) setTrends(await hotR.json());
      if (gapsR && gapsR.ok) setTrendGaps((await gapsR.json()).gaps || []);
      if (sid) {
        const tr = await fetch(`/api/test/trend?site_id=${encodeURIComponent(sid)}&days=30`);
        if (tr.ok) setRateTrend((await tr.json()).series || []);
      }
      const tg = await fetch("/api/trends/trend?days=30&top_n=8");
      if (tg.ok) setTrendGrowth(await tg.json());
    } catch {}
  };

  // Auto-load the insight analysis + trends once a site is selected
  useEffect(() => {
    if (sites.length > 0 && domain) {
      loadAiInsight();
      loadTrends();
    }
  }, [sites, domain]);

  useEffect(() => {
    if (user) {
      loadSites(user.id);
      const key = `prodrank_last_domain_${user.id}`;
      const last = localStorage.getItem(key);
      if (last && !domain) setDomain(last);
    }
  }, [user]);

  useEffect(() => {
    if (!domain || !score) return;
    const clean = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
    fetch(`/api/score/history?domain=${encodeURIComponent(clean)}&days=30`)
      .then(r => r.json()).then(d => {
        if (d.snapshots?.length > 0) { setScoreHistory(d.snapshots); setScoreTrend(d.trend || "flat"); setScoreChange(d.change || 0); }
        const newAlerts: string[] = [];
        if (score?.breakdown) for (const [key, val] of Object.entries(score.breakdown)) { if (val.score < 20) newAlerts.push(`${val.label || key} critically low at ${val.score}/100`); }
        setAlerts(newAlerts);
      }).catch(() => {});
  }, [domain, score]);

  useEffect(() => {
    if (score) fetchAiSummary();
  }, [score]);

  const fetchAiSummary = async () => {
    if (!score) return;
    const b = score.breakdown || {};
    try {
      const res = await fetch("/api/dashboard/ai-summary", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: score.ai_visibility_score, discover: b.discover?.score || 0, understand: b.understand?.score || 0, trust: b.trust?.score || 0, recommend: b.recommend?.score || 0, domain, product_count: sites.length || 1 }),
      });
      if (res.ok) setAiSummary(await res.json());
    } catch {}
  };

  const fetchWhyAnalysis = async () => {
    setWhyLoading(true);
    try {
      const b = score?.breakdown || {};
      const res = await fetch("/api/dashboard/ai-summary", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: score?.ai_visibility_score || 0, discover: b.discover?.score || 0, understand: b.understand?.score || 0, trust: b.trust?.score || 0, recommend: b.recommend?.score || 0, domain, product_count: sites.length || 1 }),
      });
      if (res.ok) setAiSummary(await res.json());
      setShowWhy(true);
    } catch {}
    setWhyLoading(false);
  };

  const hasBreakdown = score && Object.keys(score.breakdown || {}).length > 0;

  const loadSites = async (uid: string) => {
    const { data } = await supabase.from("sites").select("*").eq("user_id", uid).order("updated_at", { ascending: false });
    if (data && data.length > 0) {
      setSites(data);
      const last = data[0];
      setDomain(last.domain);
      setCms({ domain: last.domain, platform: last.platform || "unknown", confidence: last.platform_confidence || 0, recommended_action: "Previously analyzed.", auth_method: last.auth_method || "plugin" });
      if (last.score_data) setScore(last.score_data as ScoreData);
      else if (last.ai_visibility_score) setScore({ ai_visibility_score: last.ai_visibility_score, label: last.ai_visibility_score >= 60 ? "Good" : "Poor", breakdown: {}, recommendation: "" });
      loadHealth(last.domain);
      loadCompetitors(last.domain);
      loadCitations();
      loadInsight(last.domain);
    }
  };

  /** Switch the active store — reloads everything for the picked site. */
  const switchSite = (store: any) => {
    setDomain(store.domain);
    setCms({ domain: store.domain, platform: store.platform || "unknown", confidence: store.platform_confidence || 0, recommended_action: "Previously analyzed.", auth_method: store.auth_method || "plugin" });
    if (store.score_data) setScore(store.score_data as ScoreData);
    else if (store.ai_visibility_score) setScore({ ai_visibility_score: store.ai_visibility_score, label: store.ai_visibility_score >= 60 ? "Good" : "Poor", breakdown: {}, recommendation: "" });
    else setScore(null);
    localStorage.setItem(`prodrank_last_domain_${user!.id}`, store.domain);
    loadHealth(store.domain);
    loadCompetitors(store.domain);
    loadCitations();
    loadInsight(store.domain);
  };

  /** Health Check trend + alerts for the active store. */
  const loadHealth = async (shop: string) => {
    try {
      const r = await fetch(`/api/health-check?domain=${encodeURIComponent(shop)}`);
      if (r.ok) {
        const d = await r.json();
        setHealthTrend(d.trend || []);
        setHealthDelta(d.delta ?? null);
        setHealthSummary(d.summary || "");
      }
      const a = await fetch(`/api/alerts?domain=${encodeURIComponent(shop)}`);
      if (a.ok) setHealthAlerts((await a.json()).alerts || []);
    } catch { /* health feed is best-effort */ }
  };

  const saveScoreToDB = async (cleanDomain: string, sd: ScoreData) => {
    const enriched = { ...sd, analyzed_at: new Date().toISOString() };
    await supabase.from("sites").update({ ai_visibility_score: sd.ai_visibility_score, score_data: enriched, updated_at: new Date().toISOString() }).eq("user_id", user!.id).eq("domain", cleanDomain);
  };

  const handleAnalyze = useCallback(async (e?: React.FormEvent, targetDomain?: string) => {
    if (e) e.preventDefault();
    const d = (targetDomain || domain).trim();
    if (!d || !user) return;
    setLoading(true); setError(""); setCms(null); setScore(null); setAiSummary(null);
    try {
      const cleanDomain = d.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
      const cmsRes = await fetch("/api/cms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: cleanDomain }) });
      const cmsData = await cmsRes.json();
      setCms(cmsData);

      // Store limit check — dedupe by normalized domain (re-adding a store
      // with/without scheme or trailing slash must never inflate the count,
      // and failed-connection leftovers must not count either).
      const norm = (d: string) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      const alreadyBound = sites.some((s: any) => norm(s.domain) === norm(cleanDomain));
      if (!alreadyBound) {
        const { data: siteRows } = await supabase.from("sites").select("domain").eq("user_id", user.id);
        const distinct = new Set((siteRows || []).map((r: any) => norm(r.domain)));
        const { data: subs } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).limit(1);
        const plan = (subs?.[0]?.plan as string) || "free";
        const LIMITS: Record<string, number> = { free: 1, pro: 1, growth: 3, agency: 10, unlimited: 999 };
        if (distinct.size >= (LIMITS[plan] ?? 1)) {
          setError(`Store limit reached (${distinct.size}/${LIMITS[plan]}) on your ${plan} plan. Upgrade to Growth to add more stores.`);
          setLoading(false);
          return;
        }
      }

      await supabase.from("sites").upsert({ user_id: user.id, domain: cleanDomain, platform: cmsData.platform, platform_confidence: cmsData.confidence, auth_method: cmsData.auth_method, updated_at: new Date().toISOString() }, { onConflict: "user_id,domain" });
      const scoreRes = await fetch("/api/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: `https://${cleanDomain}`, product_name: cleanDomain }) });
      if (scoreRes.ok) {
        const sd: ScoreData = await scoreRes.json();
        setScore(sd); setDomain(cleanDomain);
        localStorage.setItem(`prodrank_last_domain_${user.id}`, cleanDomain);
        await saveScoreToDB(cleanDomain, sd);
        await loadSites(user.id);
      }
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  }, [domain, user]);

  const handleRefresh = async () => { setAiSummary(null); await handleAnalyze(undefined, domain); };

  if (authLoading) return <main className="min-h-screen flex items-center justify-center bg-zinc-950"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full" /></main>;
  if (!user) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to see your dashboard</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div></main>;

  const sc = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-amber-400" : "text-red-400";
  const scFill = (s: number) => s >= 70 ? "#10b981" : s >= 40 ? "#f59e0b" : "#ef4444";
  const lastAnalyzed = score?.analyzed_at || null;
  const hasNoSites = sites.length === 0;
  const breakdown = score?.breakdown || {};
  const pillars = ["discover", "understand", "trust", "recommend"];

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-56" : "w-14"} bg-zinc-900 border-r border-zinc-800 shrink-0 transition-all duration-200 flex flex-col`}>
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          {sidebarOpen && <Link href="/" className="font-bold text-emerald-400 text-lg">ProdRank</Link>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-zinc-500 hover:text-zinc-300 text-xs">{sidebarOpen ? "◀" : "▶"}</button>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {NAV.map(item => (
            <Link key={item.href} href={item.href} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition">
              <span>{item.icon}</span>{sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
          <Link href="/install" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300 transition">
            <span>🔌</span>{sidebarOpen && <span>Install Store</span>}
          </Link>
        </nav>
        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-center gap-2 text-sm text-zinc-400"><span className="w-2 h-2 rounded-full bg-emerald-500" />{user.email?.split("@")[0]}</div>
          <button onClick={() => supabase.auth.signOut()} className="text-xs text-zinc-500 hover:text-zinc-300 mt-1">Sign out</button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

          {/* HEADER */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-zinc-300">{getGreeting()}, {user.email?.split("@")[0]}</h1>
              {domain && <span className="text-xs text-zinc-600">{domain} {lastAnalyzed ? `· Analyzed ${timeAgo(lastAnalyzed)}` : ""}</span>}
            </div>
            <div className="flex gap-2">
              <input type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourdomain.com" className="w-44 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              <button onClick={handleRefresh} disabled={loading} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-xs rounded-lg">{loading ? "..." : "Analyze"}</button>
            </div>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}

          {/* NEW USER */}
          {hasNoSites && !score && (
            <div className="bg-emerald-900/10 border border-emerald-800 rounded-2xl p-16 text-center space-y-4">
              <div className="text-5xl">🤖</div>
              <h2 className="text-2xl font-bold text-white">The Operating System for AI Shopping Visibility</h2>
              <p className="text-zinc-400 max-w-md mx-auto">Understand why AI doesn't recommend your products — and fix it.</p>
              <div className="flex gap-3 justify-center pt-2">
                <input type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourstore.com" className="w-56 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm" />
                <button onClick={(e) => handleAnalyze(e as any)} disabled={loading || !domain.trim()} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-sm">{loading ? "Analyzing…" : "Analyze My Store"}</button>
              </div>
            </div>
          )}

          {/* NO SCORE */}
          {!hasNoSites && !score && !loading && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center text-zinc-500">Select a site or enter a new domain above.</div>
          )}

          {/* LOADING */}
          {loading && <div className="text-center py-20"><div className="animate-spin h-8 w-8 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"/><p className="text-zinc-400 text-sm">Scanning {domain}…</p></div>}

          {/* ══════════ SCORE LOADED ══════════ */}
          {score && (
            <>
              {/* ── ROW 1: AI Shopping Score + Why ── */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center relative">
                <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">AI Shopping Score</div>
                <div className="flex items-center justify-center gap-4">
                  <div className={`text-8xl font-bold tracking-tight ${sc(score.ai_visibility_score)}`}>{score.ai_visibility_score}</div>
                  <div className="text-left">
                    <div className="text-xs text-zinc-500">/100</div>
                    <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${score.ai_visibility_score >= 60 ? "bg-emerald-900/30 text-emerald-400" : score.ai_visibility_score >= 40 ? "bg-amber-900/30 text-amber-400" : "bg-red-900/30 text-red-400"}`}>{score.label}</div>
                    {scoreChange !== 0 && <div className={`text-xs mt-1 ${scoreChange > 0 ? "text-emerald-400" : "text-red-400"}`}>{scoreChange > 0 ? `↑ +${scoreChange} this week` : `↓ ${scoreChange} this week`}</div>}
                  </div>
                </div>
                <button onClick={fetchWhyAnalysis} disabled={whyLoading} className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg transition">
                  {whyLoading ? "Analyzing…" : "🤔 Why?"}
                </button>
              </div>

              {/* ── AI RECOMMENDATION TEST (Test Engine + Insight Engine) ── */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                  <div>
                    <h2 className="font-semibold text-white">🧠 AI Recommendation Test</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">Ask an AI shopping assistant real shopper questions — measure your recommendation rate & find evidence-backed gaps</p>
                    <p className="text-[10px] text-zinc-600 mt-1">AI awareness updates over 4–12 weeks as search indexes and model knowledge refresh — short-term swings are normal. Track the trend, not single rounds.</p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <select
                      value={testModels[0]}
                      onChange={e => setTestModels(e.target.value === "deepseek" ? ["deepseek"] : ["chatgpt", "gemini", "claude", "grok"])}
                      className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs focus:outline-none"
                    >
                      <option value="deepseek">DeepSeek (fast & cheap)</option>
                      <option value="all4">All 4 models (real AI)</option>
                    </select>
                    <button onClick={() => runAiTest(30)} disabled={aiTestLoading} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 text-white text-xs rounded-lg transition">
                      {aiTestLoading ? "Testing…" : "Run 30 queries"}
                    </button>
                    <button onClick={() => runAiTest(100)} disabled={aiTestLoading} className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:bg-zinc-700 text-white text-xs rounded-lg transition">
                      Run 100
                    </button>
                  </div>
                </div>

                {/* Recommendation rate cards */}
                {aiTest ? (
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-center">
                      <div className={`text-3xl font-bold ${aiTest.recommendation_rate >= 25 ? "text-emerald-400" : aiTest.recommendation_rate > 0 ? "text-amber-400" : "text-red-400"}`}>{aiTest.recommendation_rate}%</div>
                      <div className="text-xs text-zinc-500 mt-1">Recommendation Rate</div>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-center">
                      <div className="text-3xl font-bold text-zinc-300">{aiTest.total_queries}</div>
                      <div className="text-xs text-zinc-500 mt-1">Queries Tested</div>
                    </div>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-center">
                      <div className="text-3xl font-bold text-zinc-300">{aiTest.by_model?.deepseek?.recommended || 0}</div>
                      <div className="text-xs text-zinc-500 mt-1">Times Recommended</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-600 mb-4">No test run yet — hit Run to start (30 queries ≈ {"<$0.01"})</p>
                )}

                {rateTrend.length > 1 && (
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-zinc-400 mb-1.5">Recommendation rate trend (daily)</h3>
                    <div className="flex items-end gap-1 h-16">
                      {rateTrend.map((p: any) => (
                        <div key={p.date} className="flex-1 flex flex-col items-center justify-end" title={`${p.date}: ${p.rate_pct}% (${p.queries} queries)`}>
                          <div className="w-full bg-purple-600/70 rounded-t" style={{ height: `${Math.max(4, p.rate_pct)}%`, minHeight: "2px" }} />
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-zinc-600 mt-1">Last {rateTrend.length} day(s) with test data — each bar is that day&apos;s recommendation rate.</p>
                  </div>
                )}

                {/* Competitor comparison */}
                <div className="border-t border-zinc-800 pt-4 mt-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <h3 className="text-sm font-semibold text-zinc-300">⚔️ vs Competitors</h3>
                    <input
                      value={compareInput}
                      onChange={e => setCompareInput(e.target.value)}
                      placeholder="Nike, Uniqlo, Adidas"
                      className="flex-1 min-w-40 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs placeholder:text-zinc-600 focus:outline-none"
                    />
                    <button onClick={runCompare} disabled={compareLoading || !compareInput.trim()}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 text-white text-xs rounded-lg transition">
                      {compareLoading ? "Comparing…" : "Compare →"}
                    </button>
                  </div>
                  {compareResult?.comparison?.length > 0 && (
                    <div className="space-y-1.5">
                      {compareResult.comparison.map((row: any) => (
                        <div key={row.brand} className="flex items-center gap-2 text-xs">
                          <span className="w-24 truncate text-zinc-300">{row.brand}</span>
                          <div className="flex-1 bg-zinc-800 rounded-full h-3 overflow-hidden">
                            <div className={`h-full rounded-full ${row.brand === compareResult.comparison[0].brand ? "bg-purple-500" : "bg-zinc-600"}`}
                                 style={{ width: `${Math.max(2, row.rate_pct)}%` }} />
                          </div>
                          <span className="w-14 text-right text-zinc-400">{row.rate_pct}%</span>
                          <span className="text-[10px] text-zinc-600">{row.mentioned_queries}/{compareResult.total_queries}</span>
                        </div>
                      ))}
                      <p className="text-[10px] text-zinc-600">Same {compareResult.total_queries} questions asked once — mentions counted per brand. Your brand highlighted purple.</p>
                    </div>
                  )}
                </div>

                {/* Insight factors */}
                <div className="border-t border-zinc-800 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-zinc-300">Why not recommended (evidence)</h3>
                    <button onClick={loadAiInsight} disabled={aiInsightLoading} className="text-xs text-purple-400 hover:text-purple-300">
                      {aiInsightLoading ? "…" : "Refresh analysis"}
                    </button>
                  </div>
                  {aiInsight?.factors?.length > 0 ? (
                    <div className="space-y-2">
                      {aiInsight.summary && <p className="text-xs text-zinc-400 mb-2">{aiInsight.summary}</p>}
                      {aiInsight.factors.map((f: any) => (
                        <div key={f.factor} className={`border rounded-lg p-3 ${f.severity === "high" ? "border-red-900/60 bg-red-950/20" : f.severity === "medium" ? "border-amber-900/60 bg-amber-950/20" : "border-zinc-800 bg-zinc-950/50"}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${f.severity === "high" ? "bg-red-900/40 text-red-300" : f.severity === "medium" ? "bg-amber-900/40 text-amber-300" : "bg-zinc-800 text-zinc-400"}`}>
                              {f.severity.toUpperCase()}
                            </span>
                            <span className="text-sm font-medium text-zinc-200">{f.label}</span>
                            {(f.factor === "faq" || f.factor === "knowledge") && (
                              <button
                                onClick={() => applyFix(f.factor)}
                                disabled={applying}
                                className="ml-auto text-[10px] px-2 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white rounded-md transition"
                              >
                                {applying ? "…" : "⚡ Fix →"}
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-zinc-400 mt-1.5">{f.evidence}</p>
                          {f.action && <p className="text-xs text-emerald-400/80 mt-1.5">→ {f.action}</p>}
                        </div>
                      ))}
                      {applyStatus && (
                        <p className="text-xs text-emerald-400 mt-2">
                          {applyStatus} — content changes are verifiable on the page now; the AI recommendation impact builds over weeks.
                        </p>
                      )}

                      {/* Retest (before/after) */}
                      <div className="mt-4 flex items-center gap-3 flex-wrap">
                        <button onClick={retest} disabled={retesting} className="text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 text-white rounded-lg transition">
                          {retesting ? "Retesting…" : "🔄 Retest after fixes"}
                        </button>
                        <span className="text-[10px] text-zinc-600">Fixes take weeks to show up in AI knowledge — retest in ~2 weeks for a meaningful comparison.</span>
                        {retestResult && (
                          <div className={`text-xs font-medium ${retestResult.delta > 0 ? "text-emerald-400" : retestResult.delta < 0 ? "text-red-400" : "text-zinc-400"}`}>
                            {retestResult.before_rate}% → {retestResult.after_rate}%
                            {retestResult.delta !== 0 && ` (${retestResult.delta > 0 ? "+" : ""}${retestResult.delta}%)`}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-600">{aiInsightLoading ? "Analyzing…" : "Auto-analyzes when a site is connected"}</p>
                  )}
                </div>
              </div>

              {/* ── AI SHOPPING TRENDS ── */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-white">📈 AI Shopping Trends</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">What shoppers ask about most — and what your products are missing</p>
                  </div>
                  <button onClick={loadTrends} className="text-xs text-purple-400 hover:text-purple-300">Refresh</button>
                </div>

                {trends?.attributes?.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-zinc-400 mb-2">Hot attributes shoppers ask about</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {trends.attributes.map((a: any) => (
                        <span key={a.attribute} className="text-[10px] bg-zinc-800 px-2 py-1 rounded-full text-zinc-300">
                          {a.attribute} <span className="text-purple-400">{a.count}×</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {trendGrowth?.has_data && trendGrowth.trends?.length > 0 && (
                  <div className="mb-4 border-t border-zinc-800 pt-4">
                    <h3 className="text-xs font-semibold text-zinc-400 mb-2">30-day growth (what&apos;s rising)</h3>
                    <div className="space-y-1.5">
                      {trendGrowth.trends.filter((t: any) => t.growth_pct !== null).slice(0, 6).map((t: any) => (
                        <div key={t.attribute} className="flex items-center gap-2 text-xs">
                          <span className="w-28 truncate text-zinc-300">{t.attribute}</span>
                          <div className="flex-1 bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, Math.max(2, (t.growth_pct || 0) / 2))}%` }} />
                          </div>
                          <span className={`w-14 text-right font-medium ${(t.growth_pct || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {t.growth_pct > 0 ? "+" : ""}{t.growth_pct}%
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-zinc-600 mt-1">Growth vs the previous {trendGrowth.series?.length || 30} day(s) of snapshot data.</p>
                  </div>
                )}

                {trendGaps.length > 0 && (
                  <div className="border-t border-zinc-800 pt-4">
                    <h3 className="text-xs font-semibold text-zinc-400 mb-2">⚠ Your products don&apos;t mention these</h3>
                    <div className="space-y-2">
                      {trendGaps.slice(0, 6).map((g: any) => (
                        <div key={g.attribute} className="flex items-start gap-2 text-xs">
                          <span className="text-amber-400 mt-0.5">⚠</span>
                          <div>
                            <span className="text-zinc-300 font-medium">{g.attribute}</span>
                            <span className="text-zinc-500"> — {g.advice}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(!trends?.attributes?.length && trendGaps.length === 0) && (
                  <p className="text-xs text-zinc-600">No trend data yet — it builds up as the question library grows.</p>
                )}
              </div>

              {/* WHY MODAL */}
              {showWhy && aiSummary && (
                <div className="bg-zinc-900 border border-emerald-800/50 rounded-2xl p-8 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-emerald-400 text-lg">🔬 AI Analysis</h3>
                    <button onClick={() => setShowWhy(false)} className="text-zinc-500 hover:text-white text-sm">✕</button>
                  </div>
                  <p className="text-zinc-300 leading-relaxed">{aiSummary.why_explanation || aiSummary.summary}</p>
                  {aiSummary.simulation && <div className="bg-zinc-800/50 rounded-xl p-4 text-sm text-zinc-400"><span className="text-zinc-500">💡 Simulation:</span> {aiSummary.simulation}</div>}
                  <div className="grid grid-cols-3 gap-3 text-center text-xs">
                    <div className="bg-zinc-800/30 rounded-lg p-3"><div className="text-zinc-500">Current</div><div className="text-red-400 font-bold text-lg">{aiSummary.estimated_potential?.current || score.ai_visibility_score}</div></div>
                    <div className="bg-zinc-800/30 rounded-lg p-3"><div className="text-zinc-500">After Fix</div><div className="text-emerald-400 font-bold text-lg">{aiSummary.estimated_potential?.after_fix || "?"}</div></div>
                    <div className="bg-emerald-900/20 rounded-lg p-3"><div className="text-zinc-500">Potential Gain</div><div className="text-emerald-400 font-bold text-lg">+{aiSummary.estimated_potential?.gain || "?"}</div></div>
                  </div>
                </div>
              )}

              {/* ── ROW 2: AI Summary ── */}
              {aiSummary && (
                <div className="bg-gradient-to-r from-emerald-900/10 to-zinc-900 border border-emerald-800/30 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-3"><span className="text-emerald-400 text-sm">⭐</span><span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Today's AI Summary</span></div>
                  <p className="text-zinc-300 text-sm leading-relaxed">{aiSummary.summary}</p>
                  <p className="text-emerald-400 text-sm font-medium mt-2">→ {aiSummary.cta}</p>
                </div>
              )}

              {/* ── ROW 3: Four Pillars ── */}
              <div className="grid grid-cols-4 gap-3">
                {hasBreakdown && pillars.map(key => {
                  const val = breakdown[key] || { score: 0 };
                  const info = PILLAR_INFO[key] || { icon: "•", desc: "", lowWhy: "", midWhy: "", evidenceKeys: [] };
                  const isLow = val.score < 40;
                  const isMid = val.score >= 40 && val.score < 70;
                  return (
                    <div key={key} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-center group">
                      {/* Circular progress */}
                      <div className="relative w-16 h-16 mx-auto mb-2">
                        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#27272a" strokeWidth="3" />
                          <circle cx="18" cy="18" r="15.5" fill="none" stroke={scFill(val.score)} strokeWidth="3"
                            strokeDasharray={`${val.score * 0.97} 100`} strokeLinecap="round" />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className={`text-lg font-bold ${sc(val.score)}`}>{val.score}</span>
                        </div>
                      </div>
                      <div className="text-xs font-semibold text-zinc-200">{info.icon} {val.label || key}</div>
                      <div className="text-xs text-zinc-500 mt-1 leading-relaxed">{isLow ? info.lowWhy : isMid ? info.midWhy : info.desc}</div>
                      {isLow && (
                        <div className="mt-2 space-y-0.5">
                          {info.evidenceKeys.map((e, i) => <div key={i} className="text-xs text-red-400/70">✗ {e}</div>)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── ROW 4: Top Opportunities ── */}
              {aiSummary?.top_opportunities?.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-4"><span className="text-amber-400">⭐</span><h3 className="font-semibold">Top Opportunities</h3></div>
                  <div className="space-y-2">
                    {aiSummary.top_opportunities.slice(0, 4).map((opp: any, i: number) => {
                      const stars = opp.impact === "High" ? "★★★★★" : opp.impact === "Medium" ? "★★★★" : "★★★";
                      return (
                        <div key={i} className="flex items-center justify-between bg-zinc-800/30 rounded-xl p-4 hover:bg-zinc-800/50 transition">
                          <div className="flex items-center gap-3">
                            <span className="text-amber-400 text-sm w-16 flex-shrink-0">{stars}</span>
                            <div>
                              <div className="text-sm font-medium text-zinc-200">{opp.title}</div>
                              <div className="text-xs text-zinc-500">{opp.action}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-right flex-shrink-0">
                            <span className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded-full font-medium">{opp.expected_gain}</span>
                            <span className="text-xs text-zinc-500">{opp.time}</span>
                            <Link href="/products" className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition whitespace-nowrap">Fix →</Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── ROW 4.5: Health Check + Alerts ── */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">🩺 Daily Health Check</h3>
                    <Link href="/health" className="text-xs text-emerald-400 hover:text-emerald-300">Details →</Link>
                  </div>
                  {healthTrend.length > 0 ? (
                    <>
                      <div className="flex items-end gap-1.5 h-16 mb-3">
                        {healthTrend.map((h: any) => (
                          <div key={h.date} title={`${h.date}: ${h.score}`}
                               className={`flex-1 rounded-t ${sc(h.score)} bg-current opacity-80`}
                               style={{ height: `${Math.max(8, (h.score || 0))}%` }} />
                        ))}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400">Score <strong className={sc(healthTrend[healthTrend.length - 1]?.score || 0)}>{healthTrend[healthTrend.length - 1]?.score ?? "—"}</strong></span>
                        <span className={`text-xs font-bold ${(healthDelta || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {healthDelta === null ? "" : healthDelta >= 0 ? `▲ +${healthDelta}` : `▼ ${healthDelta}`}
                        </span>
                      </div>
                      {healthSummary && <p className="text-xs text-zinc-500 mt-2">{healthSummary}</p>}
                    </>
                  ) : (
                    <p className="text-sm text-zinc-600">No snapshots yet — the daily check runs at ~2am (or visit /health to run it now).</p>
                  )}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">⚠️ Alerts</h3>
                    <Link href="/health" className="text-xs text-emerald-400 hover:text-emerald-300">All →</Link>
                  </div>
                  {healthAlerts.length > 0 ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {healthAlerts.slice(0, 6).map((a: any) => {
                        const act = a.details?.action;
                        return (
                          <div key={a.id} className={`text-xs rounded-lg px-3 py-2 ${a.severity === "critical" ? "bg-red-900/20 border border-red-800/40 text-red-300" : a.severity === "warning" ? "bg-amber-900/20 border border-amber-800/40 text-amber-300" : "bg-zinc-800/50 text-zinc-400"}`}>
                            <div className="flex items-center justify-between gap-2">
                              <span>{a.severity === "critical" ? "🔴" : a.severity === "warning" ? "🟡" : "🔵"} {a.message}</span>
                              {act?.studio_url && <Link href={act.studio_url} className="text-emerald-400 hover:text-emerald-300 whitespace-nowrap shrink-0">Fix →</Link>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-600">No alerts. All quiet.</p>
                  )}
                </div>
              </div>

              {/* ── ROW 4.6: AI Insights — daily one-call briefing ── */}
              {insight && (
                <div className="bg-gradient-to-r from-emerald-900/20 to-zinc-900 border border-emerald-800/40 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm text-emerald-300">🤖 AI Insights <span className="text-[10px] text-zinc-600 font-normal">· {insight.date}</span></h3>
                    <span className="text-[10px] text-zinc-600">daily briefing</span>
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed">{insight.content}</p>
                </div>
              )}

              {/* ── ROW 4.7: Competitor Watch + Weekly Report ── */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">⚔️ Competitor Watch</h3>
                    <Link href="/competitors" className="text-xs text-emerald-400 hover:text-emerald-300">Details →</Link>
                  </div>
                  <div className="flex gap-2 mb-3">
                    <input value={compDomain} onChange={e => setCompDomain(e.target.value)} placeholder="nike.com"
                           className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs placeholder:text-zinc-600 focus:outline-none" />
                    <button onClick={handleAddCompetitor} disabled={compAdding || !compDomain.trim()}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-xs font-medium rounded-lg transition">
                      {compAdding ? "…" : "Watch"}
                    </button>
                  </div>
                  {competitors.length > 0 ? (
                    <div className="space-y-2">
                      {competitors.map((c: any) => (
                        <div key={c.id} className="flex items-center justify-between text-xs">
                          <span className="text-zinc-300">🌐 {c.name || c.domain}</span>
                          <span className="text-zinc-600">{c.pages ? `${c.pages} pages · ${c.last_snapshot || ""}` : "not snapshotted yet"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-600">Watch competitors to see their FAQ/Schema/price changes daily.</p>
                  )}
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <h3 className="font-semibold text-sm mb-3">📰 Citation Trend</h3>
                  <p className="text-xs text-zinc-500 mb-3">Which sources AI agents cite when recommending products (30 days).</p>
                  {citationDist.length > 0 ? (
                    <div className="space-y-1.5">
                      {citationDist.slice(0, 6).map((c: any) => (
                        <div key={c.domain} className="flex items-center gap-2 text-xs">
                          <span className="w-32 truncate text-zinc-400">{c.domain}</span>
                          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(100, c.pct * 3)}%` }} />
                          </div>
                          <span className="text-zinc-500 w-10 text-right">{c.pct}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-600">Collecting… daily real-model queries build the distribution.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <h3 className="font-semibold text-sm mb-3">📧 Weekly Report</h3>
                  <p className="text-xs text-zinc-500 mb-3">Monday mornings you get an email: content generated, alerts, citations, health trend — SQL aggregates + AI polish.</p>
                  <button onClick={handleWeeklyReport} disabled={weeklySending}
                          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 text-white text-xs font-medium rounded-lg transition">
                    {weeklySending ? "Sending…" : "Send test report now"}
                  </button>
                  {weeklyStatus && <p className={`text-xs mt-2 ${weeklyStatus.includes("sent") ? "text-emerald-400" : "text-amber-400"}`}>{weeklyStatus}</p>}
                </div>
              </div>

              {/* ── ROW 4.5: Connected Stores ── */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm">🏬 Connected Stores</h3>
                  <span className="text-xs text-zinc-500">{sites.length} store{sites.length !== 1 ? "s" : ""} · click to switch</span>
                </div>
                {sites.length === 0 ? (
                  <div className="text-xs text-zinc-600 py-3">No stores connected yet — analyze a domain above to add your first store.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {sites.map((s: any) => (
                      <button
                        key={s.id}
                        onClick={() => switchSite(s)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition ${s.domain === domain ? "border-emerald-600 bg-emerald-500/10" : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"}`}
                      >
                        <span className="text-lg">{s.platform === "shopify" ? "🛒" : s.platform === "woocommerce" || s.platform === "wordpress" ? "📝" : "🌐"}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-zinc-200 truncate">{s.domain}</span>
                          <span className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-zinc-600">{s.platform || "unknown"}</span>
                            {s.access_token ? <span className="text-[10px] text-emerald-400">● connected</span> : <span className="text-[10px] text-zinc-600">○ unbound</span>}
                          </span>
                        </span>
                        <span className={`text-sm font-bold ${sc(s.ai_visibility_score || 0)}`}>{s.ai_visibility_score ?? "—"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── ROW 5: Products Summary + Trend ── */}
              <div className="grid grid-cols-2 gap-4">
                {/* Products summary */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-sm">📦 Products</h3>
                    <span className="text-xs text-zinc-500">{sites.length} site{sites.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: "Analyzed", value: sites.length, color: "bg-emerald-500" },
                      { label: "Need Attention", value: (score?.ai_visibility_score || 0) < 40 ? 1 : 0, color: "bg-amber-500" },
                      { label: "Critical", value: (score?.ai_visibility_score || 0) < 20 ? 1 : 0, color: "bg-red-500" },
                    ].map((s, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${s.color}`} />
                        <span className="text-sm text-zinc-300 flex-1">{s.label}</span>
                        <span className="text-sm font-bold text-zinc-400">{s.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-zinc-800">
                    {scoreHistory.length >= 2 ? (
                      <div className="flex items-end gap-1 h-10">
                        {scoreHistory.slice(-14).map((s, i) => {
                          const maxS = Math.max(...scoreHistory.map(x => x.score), 1);
                          const h = Math.max(4, (s.score / maxS) * 40);
                          return <div key={i} className="flex-1 bg-emerald-500/50 rounded-t-sm" style={{ height: `${h}px` }} title={`${s.date}: ${s.score}`} />;
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-600 text-center py-2">Run Analyze to see trend</div>
                    )}
                    <div className="text-xs text-zinc-500 mt-2 text-center">
                      {scoreTrend === "up" ? `↑ Improving (+${scoreChange} pts)` : scoreTrend === "down" ? `↓ Declining (${scoreChange} pts)` : "→ Steady"}
                    </div>
                  </div>
                </div>

                {/* Competitor changes */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <h3 className="font-semibold text-sm mb-4">⚔️ Competitor Watch</h3>
                  <CompetitorMini domain={domain} />
                </div>
              </div>

              {/* ── ROW 6: Critical Issues ── */}
              {aiSummary?.critical_issues?.length > 0 && (
                <div className="bg-zinc-900 border border-red-800/30 rounded-2xl p-6">
                  <h3 className="font-semibold text-sm text-red-400 mb-3">⚠️ Critical AI Issues</h3>
                  <div className="space-y-2">
                    {aiSummary.critical_issues.map((issue: string, i: number) => {
                      const stars = issue.includes("critically") ? "★★★★★" : issue.includes("low") ? "★★★★" : "★★★";
                      return (
                        <div key={i} className="flex items-start gap-3 bg-red-900/5 border border-red-800/20 rounded-xl px-4 py-3">
                          <span className="text-red-400 text-sm flex-shrink-0 mt-0.5">{stars}</span>
                          <span className="text-sm text-zinc-300">{issue}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── ROW 7: Optimization Progress ── */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">📊 Optimization Overview</h3>
                </div>
                <div className="grid grid-cols-3 gap-6 text-center">
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">Current Score</div>
                    <div className={`text-2xl font-bold ${sc(score.ai_visibility_score)}`}>{score.ai_visibility_score}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">Potential After Fix</div>
                    <div className="text-2xl font-bold text-emerald-400">{aiSummary?.estimated_potential?.after_fix || (score.ai_visibility_score + 25)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">Estimated Gain</div>
                    <div className="text-2xl font-bold text-emerald-400">+{aiSummary?.estimated_potential?.gain || 25}</div>
                  </div>
                </div>
                <div className="mt-4 w-full bg-zinc-800 rounded-full h-2">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.max(5, score.ai_visibility_score)}%` }} />
                </div>
                <div className="flex justify-between text-xs text-zinc-600 mt-1"><span>0</span><span>100</span></div>
              </div>

              {/* ── BOTTOM: Trend + Actions ── */}
              <div className="flex gap-3 justify-center">
                <Link href="/actions" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition">⚡ Action Center</Link>
                <Link href="/products" className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm rounded-lg transition">📦 Products</Link>
                <Link href="/compare" className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm rounded-lg transition">⚔️ Compare vs Competitors</Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function CompetitorMini({ domain }: { domain: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!domain || loaded) return;
    const clean = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
    fetch("/api/score/competitors/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: clean, name: clean }) })
      .then(r => r.json()).then(d => { if (d.results?.length >= 2) setData(d.results); }).catch(() => {}).finally(() => setLoaded(true));
  }, [domain]);
  if (!loaded) return <div className="text-xs text-zinc-500">Loading competitor data…</div>;
  if (data.length < 2) return <div className="text-xs text-zinc-600">Competitor data will load on next Analyze</div>;
  const others = data.filter((c: any) => !c.is_you && !c.error);
  const you = data.find((c: any) => c.is_you);
  return (
    <div className="space-y-2">
      {others.slice(0, 4).map((c: any, i: number) => (
        <div key={i} className="flex items-center justify-between text-xs">
          <span className="text-zinc-300">{c.name}</span>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">{c.estimated_score} pts</span>
            {c.has_software_schema ? <span className="text-emerald-500 text-xs">+Schema</span> : <span className="text-red-500 text-xs">-Schema</span>}
          </div>
        </div>
      ))}
      {you && others.length > 0 && (
        <div className="text-xs text-emerald-400 mt-2 pt-2 border-t border-zinc-800">
          {you.estimated_score >= (others[0]?.estimated_score || 0) ? "🎉 You're leading" : `📉 Behind ${others[0].name} by ${(others[0].estimated_score || 0) - (you.estimated_score || 0)} pts`}
        </div>
      )}
    </div>
  );
}
