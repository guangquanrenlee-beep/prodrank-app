"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

interface MarketSource {
  id: string; domain: string; url: string; source_type: string;
  name: string; description: string; category: string;
  authority_score: number; total_citations: number;
  citation_frequency: Record<string,number>;
  trend: string; estimated_cost: string; relevance_score: number;
  outreach?: { status: string; contacted_at?: string } | null;
}

interface Pitch {
  id: string; style: string; subject_line: string; pitch_text: string;
  ai_model: string; is_sent: boolean; created_at: string;
}

export default function MarketplacePage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<"discover"|"pipeline"|"pitches">("discover");
  const [sources, setSources] = useState<MarketSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Record<string,number>>({});

  // Pitch state
  const [pitchSourceId, setPitchSourceId] = useState("");
  const [pitchStyle, setPitchStyle] = useState<"professional"|"casual"|"value-first"|"partnership">("professional");
  const [pitchResult, setPitchResult] = useState<Record<string,string>|null>(null);
  const [pitchLoading, setPitchLoading] = useState(false);

  // Follow-ups
  const [followUps, setFollowUps] = useState<any[]>([]);

  useEffect(() => {
    if (user) loadStats();
  }, [user]);

  const loadStats = async () => {
    try {
      const res = await fetch("/api/marketplace/feed-stats");
      if (res.ok) setStats(((await res.json()).stats || {}));
    } catch {}
  };

  const discoverSources = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/marketplace/discover", { method: "POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({}) });
      const data = await res.json();
      if (res.ok) {
        setSources(data.sources || []);
        loadStats();
      } else setError("Discovery failed. Try running Citation Intelligence first.");
    } catch { setError("Network error."); }
    setLoading(false);
  };

  const loadSources = async (status = "all") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/marketplace/sources?status=${status}&limit=50`);
      if (res.ok) setSources((await res.json()).sources || []);
    } catch {}
    setLoading(false);
  };

  const updateStatus = async (sourceId: string, status: string) => {
    await fetch(`/api/marketplace/sources/${sourceId}/action`, {
      method: "POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ status }),
    });
    loadSources(tab === "pipeline" ? "contacted" : "all");
    loadStats();
  };

  const generatePitch = async (sourceId: string) => {
    setPitchLoading(true);
    try {
      const res = await fetch(`/api/marketplace/sources/${sourceId}/pitch`, {
        method: "POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ style: pitchStyle }),
      });
      if (res.ok) {
        setPitchResult(await res.json());
        setPitchSourceId(sourceId);
      }
    } catch {}
    setPitchLoading(false);
  };

  const loadFollowUps = async () => {
    try {
      const res = await fetch("/api/marketplace/follow-ups");
      if (res.ok) setFollowUps((await res.json()).follow_ups || []);
    } catch {}
  };

  useEffect(() => {
    if (tab === "pipeline") { loadSources("contacted"); loadFollowUps(); }
    else if (tab === "discover") loadSources("all");
  }, [tab]);

  const sc = (s:number) => s>=70?"text-emerald-400":s>=40?"text-amber-400":"text-red-400";
  const costColor = (c:string) => c==="free"?"text-emerald-400":c==="low"?"text-blue-400":c==="medium"?"text-amber-400":c==="high"?"text-red-400":"text-zinc-500";

  if (authLoading) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full"/></main>;
  if (!user) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to access</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div></main>;

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div>
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
          <h1 className="text-3xl font-bold mt-1">🏪 Source Marketplace</h1>
          <p className="text-zinc-400 text-sm mt-1">Discover which review sites, blogs, and directories cite your competitors — then reach out to get cited too.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Discovered", value: stats.discovered??0 },
            { label: "Contacted", value: stats.contacted??0 },
            { label: "Success", value: stats.success??0 },
            { label: "Follow-ups Due", value: stats.pending_follow_ups??0 },
          ].map((s,i)=>(
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{s.value}</div>
              <div className="text-xs text-zinc-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-zinc-800 pb-2">
          {(["discover","pipeline","pitches"] as const).map(t => (
            <button key={t} onClick={()=>setTab(t)} className={`px-4 py-2 text-sm rounded-t-lg transition capitalize ${tab===t?"bg-zinc-900 text-white border border-zinc-800 border-b-zinc-900":"text-zinc-500 hover:text-zinc-300"}`}>{t}</button>
          ))}
        </div>

        {/* DISCOVER TAB */}
        {tab === "discover" && (
          <div className="space-y-4">
            <div className="flex gap-3 items-center">
              <button onClick={discoverSources} disabled={loading} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">
                {loading?"Discovering…":"🔍 Discover Sources"}
              </button>
              <span className="text-xs text-zinc-500">Uses Citation Intelligence data to find sources that cite competitors</span>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}

            {sources.length===0 && !loading && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-14 text-center space-y-3">
                <div className="text-4xl">📭</div>
                <h3 className="text-lg font-semibold text-white">No sources yet</h3>
                <p className="text-zinc-400 text-sm">Click Discover to find review sites, blogs, and directories that cite your competitors.</p>
              </div>
            )}

            {sources.map(src => (
              <div key={src.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-200">{src.name || src.domain}</span>
                      <span className="text-xs bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">{src.source_type}</span>
                      {src.trend==="rising" && <span className="text-xs bg-emerald-900/30 text-emerald-400 px-1.5 py-0.5 rounded">↗ Rising</span>}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{src.domain} {src.category?`· ${src.category}`:""}</div>

                    <div className="flex items-center gap-4 mt-3 text-xs">
                      <div>
                        <span className="text-zinc-500">Authority </span>
                        <span className={sc(src.authority_score)}>{src.authority_score}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Citations </span>
                        <span className="font-medium text-zinc-300">{src.total_citations}</span>
                        {src.citation_frequency && (
                          <span className="text-zinc-600 ml-1">
                            (GPT:{src.citation_frequency.chatgpt??0} GEM:{src.citation_frequency.gemini??0} CLD:{src.citation_frequency.claude??0})
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-zinc-500">Cost </span>
                        <span className={costColor(src.estimated_cost)}>{src.estimated_cost||"?"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 flex-shrink-0 text-right">
                    {src.outreach ? (
                      <span className={`text-xs px-2 py-1 rounded ${src.outreach.status==="contacted"?"bg-blue-900/30 text-blue-400":src.outreach.status==="success"?"bg-emerald-900/30 text-emerald-400":src.outreach.status==="replied"?"bg-purple-900/30 text-purple-400":"bg-zinc-800 text-zinc-500"}`}>{src.outreach.status}</span>
                    ) : (
                      <button onClick={()=>updateStatus(src.id,"interested")} className="text-xs bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40 px-2 py-1 rounded">Interested</button>
                    )}
                    <button onClick={() => { setPitchSourceId(src.id); setPitchResult(null); }} className="text-xs bg-blue-900/20 text-blue-400 hover:bg-blue-900/40 px-2 py-1 rounded">🤖 Generate Pitch</button>
                  </div>
                </div>

                {/* Pitch generation */}
                {pitchSourceId === src.id && (
                  <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
                    <div className="flex gap-2">
                      {(["professional","casual","value-first","partnership"] as const).map(s=>(
                        <button key={s} onClick={()=>setPitchStyle(s)} className={`text-xs px-2.5 py-1 rounded-full capitalize ${pitchStyle===s?"bg-emerald-900/50 text-emerald-400 border border-emerald-700":"bg-zinc-800 text-zinc-400"}`}>{s}</button>
                      ))}
                      <button onClick={()=>generatePitch(src.id)} disabled={pitchLoading} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-full ml-auto">{pitchLoading?"Generating…":"Generate"}</button>
                    </div>
                    {pitchResult && (
                      <div className="space-y-2">
                        <div className="text-xs text-zinc-500">Subject: <span className="text-zinc-300">{pitchResult.subject}</span></div>
                        <textarea value={pitchResult.body} readOnly className="w-full h-40 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm p-3 resize-y" />
                        <div className="flex gap-2">
                          <button onClick={()=>navigator.clipboard.writeText(pitchResult.body||"")} className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3 py-1.5 rounded">📋 Copy Pitch</button>
                          <button onClick={()=>updateStatus(src.id,"contacted")} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded">✓ Mark Contacted</button>
                          <button onClick={()=>setPitchSourceId("")} className="text-xs text-zinc-500 px-2 py-1">Close</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* PIPELINE TAB */}
        {tab === "pipeline" && (
          <div className="space-y-6">
            {/* Follow-ups section */}
            {followUps.length > 0 && (
              <div className="bg-amber-900/10 border border-amber-800/50 rounded-xl p-5">
                <h3 className="font-semibold text-amber-400 mb-3">⏰ Follow-ups Due ({followUps.length})</h3>
                {followUps.map(fu => (
                  <div key={fu.id} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                    <div>
                      <span className="text-sm text-zinc-200">{fu.source?.name||fu.source?.domain||"Unknown"}</span>
                      <span className="text-xs text-zinc-500 ml-2">{fu.source?.domain}</span>
                    </div>
                    <button onClick={async ()=>{ await fetch(`/api/marketplace/follow-ups/${fu.id}/complete`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({notes:""})}); loadFollowUps(); }} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded">Done</button>
                  </div>
                ))}
              </div>
            )}

            {/* Pipeline board */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { status: "interested", label: "💡 Interested", color: "border-blue-800/30" },
                { status: "contacted", label: "📧 Contacted", color: "border-purple-800/30" },
                { status: "success", label: "✅ Success", color: "border-emerald-800/30" },
              ].map(col => {
                const items = sources.filter(s=>s.outreach?.status===col.status);
                return (
                  <div key={col.status} className={`bg-zinc-900 border ${col.color} rounded-xl p-4 min-h-[200px]`}>
                    <div className="text-sm font-semibold mb-3">{col.label} ({items.length})</div>
                    <div className="space-y-2">
                      {items.map(s=>(
                        <div key={s.id} className="bg-zinc-800/50 rounded-lg p-3 text-xs">
                          <div className="font-medium text-zinc-200 truncate">{s.name||s.domain}</div>
                          <div className="text-zinc-500 mt-0.5">{s.total_citations} citations</div>
                          <div className="flex gap-1 mt-1">
                            {col.status==="interested" && <button onClick={()=>updateStatus(s.id,"contacted")} className="text-emerald-400 hover:underline">Mark Contacted →</button>}
                            {col.status==="contacted" && <button onClick={()=>updateStatus(s.id,"success")} className="text-emerald-400 hover:underline">Mark Success →</button>}
                          </div>
                        </div>
                      ))}
                      {items.length===0 && <div className="text-zinc-600 text-xs text-center py-4">Empty</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PITCHES TAB */}
        {tab === "pitches" && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-500">Previously generated pitches. Go to Discover tab to generate new ones.</p>
            {/* Simplified: fetch all pitches from all sources */}
            <div className="text-zinc-400 text-sm text-center py-10">Pitch history loads per source. Go to Discover, click "Generate Pitch" on any source.</div>
          </div>
        )}
      </div>
    </main>
  );
}
