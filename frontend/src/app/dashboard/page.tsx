"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface CMSData { domain: string; platform: string; confidence: number; recommended_action: string; }
interface ScoreData { ai_visibility_score: number; label: string; breakdown: Record<string, { score: number; weight: number }>; recommendation: string; }

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [domain, setDomain] = useState("");
  const [cms, setCms] = useState<CMSData | null>(null);
  const [score, setScore] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sites, setSites] = useState<any[]>([]);

  useEffect(() => { supabase.auth.getSession().then(({ data: { session } }) => { setUser(session?.user ?? null); if (session?.user) loadSites(session.user.id); }); }, []);

  const loadSites = async (uid: string) => {
    const { data } = await supabase.from("sites").select("*").eq("user_id", uid).order("created_at", { ascending: false });
    if (data) setSites(data);
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault(); if (!domain.trim() || !user) return;
    setLoading(true); setCms(null); setScore(null);
    try {
      const cmsRes = await fetch("/api/cms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: domain.trim() }) });
      const cmsData = await cmsRes.json();
      setCms(cmsData);
      const cleanDomain = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
      await supabase.from("sites").upsert({ user_id: user.id, domain: cleanDomain, platform: cmsData.platform, platform_confidence: cmsData.confidence, auth_method: cmsData.auth_method, updated_at: new Date().toISOString() }, { onConflict: "user_id,domain" });
      loadSites(user.id);
      try {
        const scoreRes = await fetch("/api/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: `https://${cleanDomain}`, product_name: cleanDomain }) });
        if (scoreRes.ok) { const sd = await scoreRes.json(); setScore(sd); await supabase.from("sites").update({ ai_visibility_score: sd.ai_visibility_score }).eq("user_id", user.id).eq("domain", cleanDomain); }
      } catch {}
    } catch {}
    setLoading(false);
  };

  if (!user) return <main className="min-h-screen flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to see your dashboard</p><Link href="/login" className="text-emerald-400 hover:text-emerald-300">Sign in →</Link></div></main>;

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-4 py-12 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Home</Link>
          <h1 className="text-3xl font-bold mt-2">Dashboard</h1>
          <p className="text-zinc-400 text-sm">{user.email}</p>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg transition">Sign out</button>
      </div>

      <form onSubmit={handleAnalyze} className="flex gap-3">
        <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Add a store domain..." className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <button type="submit" disabled={loading || !domain.trim()} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition">{loading ? "Analyzing..." : "Analyze"}</button>
      </form>

      {cms && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <span className="text-sm font-semibold capitalize">{cms.platform.replace("_", " ")}</span>
          <span className="text-xs text-zinc-500 ml-2">({cms.confidence}% confidence)</span>
          <p className="text-sm text-zinc-400 mt-1">{cms.recommended_action}</p>
        </div>
      )}

      {score && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <div className={`text-6xl font-bold ${score.ai_visibility_score >= 60 ? "text-emerald-400" : score.ai_visibility_score >= 40 ? "text-yellow-400" : "text-red-400"}`}>{score.ai_visibility_score}</div>
            <div className="text-sm text-zinc-500 mt-1">AI Visibility Score</div>
            <div className="text-lg font-semibold mt-2">{score.label}</div>
            <p className="text-sm text-zinc-400 mt-1">{score.recommendation}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-3">
            {Object.entries(score.breakdown).map(([key, val]) => (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1"><span className="text-zinc-400 capitalize">{key.replace(/_/g, " ")}</span><span className="text-zinc-500">{val.weight}%</span></div>
                <div className="w-full bg-zinc-800 rounded-full h-2"><div className={`h-2 rounded-full ${val.score >= 70 ? "bg-emerald-500" : val.score >= 40 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${val.score}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sites.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold mb-3">Your Sites</h3>
          <div className="space-y-2">
            {sites.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                <div><span className="text-zinc-200">{s.domain}</span><span className="text-xs text-zinc-500 ml-2 capitalize">{s.platform || "unknown"}</span></div>
                <span className={`text-sm font-bold ${(s.ai_visibility_score || 0) >= 60 ? "text-emerald-400" : "text-zinc-500"}`}>{s.ai_visibility_score ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
