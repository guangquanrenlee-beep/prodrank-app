"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

interface ActionItem {
  id: string; title: string; impact: number; difficulty: string;
  time: string; cat: string; ev: string; link: string; pts: number;
}

function genActions(domain: string, score: any): ActionItem[] {
  const b = score?.breakdown || {};
  const d = b.discover?.score || 0;
  const u = b.understand?.score || 0;
  const t = b.trust?.score || 0;
  const r = b.recommend?.score || 0;
  return [
    {id:"schema",title:"Add Missing Schema Fields",impact:d<50?5:d<70?4:d<90?2:1,difficulty:"Easy",time:"5 min",cat:"Discover",ev:Math.max(0,12-Math.round(d*12/100))+" schema fields missing — AI cannot find your products",link:`/products?scan=${encodeURIComponent(domain)}`,pts:Math.round((100-d)*0.25)},
    {id:"faq",title:"Add FAQPage Schema",impact:u<50?5:u<70?4:2,difficulty:"Easy",time:"5 min",cat:"Understand",ev:"Products without FAQ score 40% lower on AI recommendations",link:`/products?scan=${encodeURIComponent(domain)}`,pts:9},
    {id:"desc",title:"Improve Product Descriptions",impact:u<50?4:u<70?3:1,difficulty:"Easy",time:"10 min",cat:"Understand",ev:"Short descriptions (<200 chars) — AI cannot understand product details",link:`/products?scan=${encodeURIComponent(domain)}`,pts:7},
    {id:"reviews",title:"Collect More Product Reviews",impact:t<40?5:t<60?4:2,difficulty:"Hard",time:"Ongoing",cat:"Trust",ev:"Few or no reviews — AI heavily weights review count and quality",link:"/cite",pts:Math.round((100-t)*0.25)},
    {id:"cite",title:"Get Listed on Review Sites",impact:t<50?4:t<70?3:1,difficulty:"Medium",time:"30 min",cat:"Trust",ev:"Low citation count — competitors cited more often. Check Citation Intelligence.",link:"/cite",pts:Math.round((100-t)*0.15)},
    {id:"comp",title:"Check Competitor Rankings",impact:r<50?4:2,difficulty:"Easy",time:"2 min",cat:"Recommend",ev:"Low AI recommendation rate — competitors may be outranking you",link:`/compare?domain=${encodeURIComponent(domain)}`,pts:Math.round((100-r)*0.20)},
    {id:"img",title:"Add Alt Text to Product Images",impact:d<60?3:1,difficulty:"Easy",time:"15 min",cat:"Discover",ev:"Images without alt text — AI cannot see your products without descriptions",link:"/actions",pts:3},
    {id:"h1",title:"Fix H1 Tags on Product Pages",impact:u<60?3:1,difficulty:"Easy",time:"10 min",cat:"Understand",ev:"Missing or duplicate H1 tags — AI uses headings to understand structure",link:"/products",pts:4},
    {id:"brand",title:"Strengthen Brand Entity",impact:t<50?3:1,difficulty:"Medium",time:"1 hour",cat:"Trust",ev:"Weak brand entity — build Wikipedia, Crunchbase, LinkedIn for AI trust signals",link:"/cite",pts:6},
  ].sort((a,b)=>b.impact-a.impact);
}

export default function ActionCenterPage() {
  const { user, loading: l } = useAuth();
  const [domain, setDomain] = useState("");
  const [score, setScore] = useState<any>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      const s = localStorage.getItem("pa_" + user.id);
      if (s) setDone(new Set(JSON.parse(s)));
      supabase.from("sites").select("*").eq("user_id", user.id).order("updated_at", {ascending:false}).limit(1)
        .then(({ data }) => { if (data?.[0]) { setDomain(data[0].domain); if (data[0].score_data) setScore(data[0].score_data); } });
    }
  }, [user]);

  const toggle = (id: string) => {
    const n = new Set(done);
    n.has(id) ? n.delete(id) : n.add(id);
    setDone(n);
    localStorage.setItem("pa_" + user!.id, JSON.stringify(Array.from(n)));
  };

  const actions = score ? genActions(domain, score) : [];
  const dc = actions.filter(a => done.has(a.id)).length;

  if (l) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full" /></main>;
  if (!user) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to access</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div></main>;

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div>
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
          <h1 className="text-3xl font-bold mt-1">⚡ Action Center</h1>
          <p className="text-zinc-400 text-sm mt-1">All detected issues ranked by impact. Fix the top items first for maximum score improvement.</p>
        </div>

        {actions.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Progress</span>
              <span className="text-xs text-zinc-500">{dc}/{actions.length} completed</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2.5">
              <div className="bg-emerald-500 h-2.5 rounded-full transition-all" style={{ width: `${Math.max(5, Math.round(dc / actions.length * 100))}%` }} />
            </div>
          </div>
        )}

        {!score && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-14 text-center space-y-3">
            <div className="text-4xl">🔍</div>
            <h3 className="text-lg font-semibold text-white">No data yet</h3>
            <p className="text-zinc-400">Run an analysis from Dashboard first to see recommended actions.</p>
            <Link href="/dashboard" className="text-emerald-400 hover:underline text-sm">Go to Dashboard →</Link>
          </div>
        )}

        {actions.map(a => {
          const isDone = done.has(a.id);
          return (
            <div key={a.id} className={`bg-zinc-900 border rounded-xl p-5 transition ${isDone ? "border-emerald-800/30 opacity-60" : "border-zinc-800 hover:border-zinc-700"}`}>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 text-center w-14">
                  <div className="text-amber-400 text-sm">{"★".repeat(a.impact)}{"☆".repeat(5 - a.impact)}</div>
                  <div className="text-xs text-zinc-600 mt-0.5">+{a.pts} pts</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${a.cat === "Discover" ? "bg-blue-900/30 text-blue-400" : a.cat === "Understand" ? "bg-purple-900/30 text-purple-400" : a.cat === "Trust" ? "bg-amber-900/30 text-amber-400" : "bg-emerald-900/30 text-emerald-400"}`}>{a.cat}</span>
                    <h3 className={`font-semibold ${isDone ? "text-zinc-500 line-through" : "text-white"}`}>{a.title}</h3>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">📋 {a.ev}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                    <span>⏱ {a.time}</span>
                    <span>📊 {a.difficulty}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button onClick={() => toggle(a.id)}
                    className={`w-6 h-6 rounded border-2 flex items-center justify-center transition ${isDone ? "bg-emerald-500 border-emerald-500" : "border-zinc-600 hover:border-emerald-500"}`}>
                    {isDone && <span className="text-white text-xs">✓</span>}
                  </button>
                  <Link href={a.link} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-center whitespace-nowrap">Fix Now →</Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
