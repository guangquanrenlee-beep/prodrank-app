"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface CMSData { domain: string; platform: string; confidence: number; recommended_action: string; auth_method: string; }
interface ScoreData { ai_visibility_score: number; label: string; breakdown: Record<string, { score: number; weight: number }>; recommendation: string; }

const NAV = [
  { label: "Dashboard", href: "/dashboard", icon: "📊", active: true },
  { label: "Products", href: "/products", icon: "📦" },
  { label: "AI Visibility", href: "/visibility", icon: "👁" },
  { label: "AI Recommendations", href: "/rank", icon: "🏆" },
  { label: "Citation Sources", href: "/cite", icon: "📰" },
  { label: "Competitors", href: "/compare", icon: "⚔️" },
  { label: "Action Center", href: "/actions", icon: "⚡" },
  { label: "Optimization Center", href: "/optimize", icon: "🔧" },
  { label: "Verification", href: "/verify", icon: "📸" },
  { label: "Monitoring", href: "/monitoring", icon: "📡" },
  { label: "Reports", href: "/reports", icon: "📋" },
  { label: "Integrations", href: "/integrations", icon: "🔌" },
  { label: "Settings", href: "/settings", icon: "⚙️" },
];

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [domain, setDomain] = useState("");
  const [cms, setCms] = useState<CMSData | null>(null);
  const [score, setScore] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sites, setSites] = useState<any[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => { supabase.auth.getSession().then(({ data: { session } }) => { setUser(session?.user ?? null); if (session?.user) loadSites(session.user.id); }); }, []);

  const loadSites = async (uid: string) => {
    const { data } = await supabase.from("sites").select("*").eq("user_id", uid).order("updated_at", { ascending: false });
    if (data && data.length > 0) { setSites(data); setDomain(data[0].domain); }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault(); if (!domain.trim() || !user) return;
    setLoading(true); setError(""); setCms(null); setScore(null);
    try {
      const cleanDomain = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
      const cmsRes = await fetch("/api/cms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: cleanDomain }) });
      const cmsData = await cmsRes.json(); setCms(cmsData);
      await supabase.from("sites").upsert({ user_id: user.id, domain: cleanDomain, platform: cmsData.platform, platform_confidence: cmsData.confidence, auth_method: cmsData.auth_method, updated_at: new Date().toISOString() }, { onConflict: "user_id,domain" });
      loadSites(user.id);
      const scoreRes = await fetch("/api/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: `https://${cleanDomain}`, product_name: cleanDomain }) });
      if (scoreRes.ok) {
        const sd = await scoreRes.json(); setScore(sd);
        await supabase.from("sites").update({ ai_visibility_score: sd.ai_visibility_score }).eq("user_id", user.id).eq("domain", cleanDomain);
      }
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  };

  if (!user) return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="text-center space-y-4"><p className="text-zinc-400">Sign in to see your dashboard</p><Link href="/login" className="text-emerald-400 hover:text-emerald-300">Sign in →</Link></div>
    </main>
  );

  const sc = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-yellow-400" : "text-red-400";
  const sb = (s: number) => s >= 70 ? "bg-emerald-500" : s >= 40 ? "bg-yellow-500" : "bg-red-500";
  const autoCount = score ? Math.max(0, 10 - score.ai_visibility_score / 10) : 0;
  const highOpp = score ? Math.max(1, Math.round((100 - score.ai_visibility_score) * 0.3)) : 0;

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-56" : "w-14"} bg-zinc-900 border-r border-zinc-800 shrink-0 transition-all duration-200 flex flex-col`}>
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          {sidebarOpen && <Link href="/" className="font-bold text-emerald-400 text-lg">ProdRank</Link>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-zinc-500 hover:text-zinc-300 text-xs">{sidebarOpen ? "◀" : "▶"}</button>
        </div>
        <nav className="flex-1 p-2 space-y-1">
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
          <div className="flex items-center justify-between">
            <div><h1 className="text-3xl font-bold">AI Shopping Index</h1><p className="text-zinc-400 text-sm mt-1">{domain || "Add a store to get started"}</p></div>
            <form onSubmit={handleAnalyze} className="flex gap-2">
              <input type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourstore.com" className="w-52 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <button type="submit" disabled={loading || !domain.trim()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">{loading ? "..." : "Analyze"}</button>
            </form>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* Hero Score */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
            <div className={`text-8xl font-bold tracking-tight ${sc(score?.ai_visibility_score || 0)}`}>{score?.ai_visibility_score ?? "—"}</div>
            <div className="text-sm text-zinc-500 mt-2">AI Visibility Score</div>
            <div className={`inline-flex items-center gap-1 mt-3 px-3 py-1 rounded-full text-xs font-medium ${(score?.ai_visibility_score || 0) >= 60 ? "bg-emerald-900/30 text-emerald-400" : "bg-amber-900/30 text-amber-400"}`}>
              {score?.label || "Not analyzed yet"}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Knowledge Score" value={score?.breakdown?.knowledge_coverage?.score?.toString() || "—"} change="" />
            <StatCard label="Question Coverage" value={score?.breakdown?.question_coverage?.score?.toString() || "—"} change="" />
            <StatCard label="Need Optimization" value={score ? (autoCount > 0 ? autoCount.toString() : "0") : "—"} change="" />
            <StatCard label="Citation Authority" value={score?.breakdown?.citation_authority?.score?.toString() || "—"} change="" />
          </div>

          {/* Score Breakdown + Recent Changes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {score && (
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
              {score ? (
                <div className="space-y-3 text-sm text-zinc-400">
                  {score.recommendation && <div className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">✓</span><span>{score.recommendation}</span></div>}
                  {autoCount > 3 && <div className="flex items-start gap-2"><span className="text-yellow-400 mt-0.5">⚠</span><span>{autoCount} issues found — check Optimization tab</span></div>}
                  <div className="flex items-start gap-2"><span className="text-zinc-500 mt-0.5">ℹ</span><span>Connect your store to get real-time AI recommendations tracking.</span></div>
                </div>
              ) : (
                <div className="text-zinc-500 text-sm pt-4 text-center">Run your first analysis to see AI changes.</div>
              )}
            </div>
          </div>

          {/* Sites */}
          {sites.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="font-semibold mb-3">Your Sites</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sites.map((s: any) => (
                  <Link key={s.id} href={`/analytics?domain=${encodeURIComponent(s.domain)}`} className="bg-zinc-800/50 hover:bg-zinc-800 rounded-lg p-4 flex items-center justify-between transition">
                    <div><div className="font-medium text-zinc-200">{s.domain}</div><div className="text-xs text-zinc-500 capitalize">{s.platform || "unknown"}</div></div>
                    <div className={`text-lg font-bold ${sc(s.ai_visibility_score || 0)}`}>{s.ai_visibility_score ?? "—"}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* CTA cards */}
          {!score && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <CTACard icon="📲" title="Connect Shopify" desc="OAuth — one click, all products synced." href={`/api/shopify/install?shop=${domain}`} />
              <CTACard icon="📦" title="Upload CSV" desc="Export products from any platform." href="/csv" />
              <CTACard icon="⚡" title="Install inject.js" desc="One line of code — any platform." href="/inject-guide" />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, change }: { label: string; value: string; change: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-zinc-200">{value}</div>
      {change && <div className="text-xs text-emerald-400 mt-1">{change}</div>}
    </div>
  );
}

function CTACard({ icon, title, desc, href }: { icon: string; title: string; desc: string; href: string }) {
  return (
    <Link href={href} className="bg-zinc-900 border border-zinc-800 hover:border-emerald-700 rounded-xl p-5 transition">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-medium text-zinc-200">{title}</div>
      <div className="text-xs text-zinc-500 mt-1">{desc}</div>
    </Link>
  );
}
