"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

interface KeywordSet {
  id: string; brand_name: string;
  industry_keywords: string[]; brand_keywords: string[]; product_keywords: string[];
  is_active: boolean; created_at: string;
}

interface SocialPost {
  id: string; source: string; title: string; body: string; url: string;
  author: string; subreddit: string; is_question: boolean;
  upvotes: number; comment_count: number; posted_at: string;
  matched_keywords: string[]; matched_type: string;
  response?: { action: string; ai_draft?: string; response_text?: string } | null;
}

export default function SocialListeningPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<"keywords" | "discover" | "responses">("keywords");
  const [keywords, setKeywords] = useState<KeywordSet[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Record<string,number>>({});

  // Keyword form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState("");
  const [fBrand, setFBrand] = useState("");
  const [fIndustry, setFIndustry] = useState("");
  const [fBrandK, setFBrandK] = useState("");
  const [fProduct, setFProduct] = useState("");

  // AI draft state
  const [draftPostId, setDraftPostId] = useState("");
  const [draftStyle, setDraftStyle] = useState<"helpful"|"expert"|"promotional"|"casual">("helpful");
  const [draftText, setDraftText] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);

  useEffect(() => {
    if (user) {
      loadKeywords();
      loadStats();
    }
  }, [user]);

  const loadKeywords = async () => {
    try {
      const res = await fetch("/api/social/keywords");
      if (res.ok) setKeywords((await res.json()).keywords || []);
    } catch {}
  };

  const loadStats = async () => {
    try {
      const res = await fetch("/api/social/stats");
      if (res.ok) setStats(((await res.json()).stats || {}));
    } catch {}
  };

  const saveKeyword = async () => {
    const body = {
      brand_name: fBrand,
      industry_keywords: fIndustry.split(",").map(s => s.trim()).filter(Boolean),
      brand_keywords: fBrandK.split(",").map(s => s.trim()).filter(Boolean),
      product_keywords: fProduct.split(",").map(s => s.trim()).filter(Boolean),
    };
    try {
      const url = editId ? `/api/social/keywords/${editId}` : "/api/social/keywords";
      const method = editId ? "PUT" : "POST";
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setShowForm(false); setEditId(""); setFBrand(""); setFIndustry(""); setFBrandK(""); setFProduct("");
      loadKeywords(); loadStats();
    } catch {}
  };

  const editKeyword = (kw: KeywordSet) => {
    setEditId(kw.id); setFBrand(kw.brand_name);
    setFIndustry((kw.industry_keywords||[]).join(", "));
    setFBrandK((kw.brand_keywords||[]).join(", "));
    setFProduct((kw.product_keywords||[]).join(", "));
    setShowForm(true);
  };

  const deleteKeyword = async (id: string) => {
    await fetch(`/api/social/keywords/${id}`, { method: "DELETE" });
    loadKeywords(); loadStats();
  };

  const doScan = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/social/scan", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setPosts(data.posts || []);
        setTab("discover");
        loadStats();
      } else {
        setError("Scan failed. Make sure you have keywords set up and try again.");
      }
    } catch { setError("Network error. Try again."); }
    setLoading(false);
  };

  const loadPosts = async (status = "all") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/social/posts?status=${status}&limit=50`);
      if (res.ok) setPosts((await res.json()).posts || []);
    } catch {}
    setLoading(false);
  };

  const takeAction = async (postId: string, action: string) => {
    await fetch(`/api/social/posts/${postId}/action`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    loadPosts(tab === "responses" ? "answered" : "all");
    loadStats();
  };

  const generateDraft = async (postId: string) => {
    setDraftLoading(true);
    try {
      const res = await fetch(`/api/social/posts/${postId}/ai-draft`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style: draftStyle }),
      });
      if (res.ok) {
        const data = await res.json();
        setDraftText(data.draft || "");
        setDraftPostId(postId);
      }
    } catch {}
    setDraftLoading(false);
  };

  const timeAgo = (iso: string) => {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff/3600000);
    if (h<1) return `${Math.floor(diff/60000)}m ago`;
    if (h<24) return `${h}h ago`;
    return `${Math.floor(h/24)}d ago`;
  };

  if (authLoading) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full"/></main>;
  if (!user) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to access</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div></main>;

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div>
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
          <h1 className="text-3xl font-bold mt-1">👂 Social Listening</h1>
          <p className="text-zinc-400 text-sm mt-1">Monitor Reddit for discussions about your industry. AI drafts responses so you can engage and build brand presence.</p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Keyword Sets", value: stats.keyword_sets ?? 0 },
            { label: "Posts Found", value: stats.total_posts ?? 0 },
            { label: "Pending", value: stats.pending ?? 0 },
            { label: "Answered", value: stats.answered ?? 0 },
          ].map((s, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{s.value}</div>
              <div className="text-xs text-zinc-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-zinc-800 pb-2">
          {(["keywords","discover","responses"] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); if (t==="discover") loadPosts("all"); if (t==="responses") loadPosts("answered"); }}
              className={`px-4 py-2 text-sm rounded-t-lg transition capitalize ${tab===t?"bg-zinc-900 text-white border border-zinc-800 border-b-zinc-900":"text-zinc-500 hover:text-zinc-300"}`}>{t}</button>
          ))}
        </div>

        {/* KEYWORDS TAB */}
        {tab === "keywords" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-zinc-500">Set up keywords to monitor. System scans Reddit for matching posts.</p>
              <button onClick={() => { setShowForm(true); setEditId(""); setFBrand(""); setFIndustry(""); setFBrandK(""); setFProduct(""); }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition">+ Add Keywords</button>
            </div>

            {showForm && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
                <h3 className="font-semibold">{editId ? "Edit" : "New"} Keyword Set</h3>
                <input value={fBrand} onChange={e=>setFBrand(e.target.value)} placeholder="Brand name (e.g. MySaaS)" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm" />
                <div>
                  <label className="text-xs text-zinc-500">Industry keywords (comma-separated)</label>
                  <input value={fIndustry} onChange={e=>setFIndustry(e.target.value)} placeholder="CRM software, invoicing tool, bookkeeping" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Brand keywords (your brand + competitors)</label>
                  <input value={fBrandK} onChange={e=>setFBrandK(e.target.value)} placeholder="MySaaS, CompetitorApp" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Product keywords</label>
                  <input value={fProduct} onChange={e=>setFProduct(e.target.value)} placeholder="AI SEO, visibility score, schema generator" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm mt-1" />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveKeyword} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg">{editId?"Update":"Save"}</button>
                  <button onClick={()=>setShowForm(false)} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded-lg">Cancel</button>
                </div>
              </div>
            )}

            {keywords.length === 0 && !showForm && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-14 text-center space-y-3">
                <div className="text-4xl">🔑</div>
                <h3 className="text-lg font-semibold text-white">No keywords yet</h3>
                <p className="text-zinc-400 text-sm">Add your industry, brand, and product keywords to start monitoring Reddit.</p>
              </div>
            )}

            {keywords.map(kw => (
              <div key={kw.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{kw.brand_name || "Unnamed"}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${kw.is_active?"bg-emerald-900/30 text-emerald-400":"bg-zinc-700 text-zinc-500"}`}>{kw.is_active?"Active":"Paused"}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={()=>editKeyword(kw)} className="text-xs text-zinc-400 hover:text-white">Edit</button>
                    <button onClick={()=>deleteKeyword(kw.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  {kw.industry_keywords?.length>0 && <div><span className="text-zinc-500">Industry:</span> {kw.industry_keywords.map((k,i)=><span key={i} className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded text-xs mr-1">{k}</span>)}</div>}
                  {kw.brand_keywords?.length>0 && <div><span className="text-zinc-500">Brands:</span> {kw.brand_keywords.map((k,i)=><span key={i} className="bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded text-xs mr-1">{k}</span>)}</div>}
                  {kw.product_keywords?.length>0 && <div><span className="text-zinc-500">Products:</span> {kw.product_keywords.map((k,i)=><span key={i} className="bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded text-xs mr-1">{k}</span>)}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* DISCOVER TAB */}
        {tab === "discover" && (
          <div className="space-y-4">
            <div className="flex gap-3 items-center">
              <button onClick={doScan} disabled={loading} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">
                {loading ? "Scanning Reddit…" : "🔍 Scan Reddit Now"}
              </button>
              <span className="text-xs text-zinc-500">Scans your active keywords against recent Reddit posts</span>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}

            {posts.length === 0 && !loading && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-14 text-center space-y-3">
                <div className="text-4xl">📭</div>
                <p className="text-zinc-400">No posts found yet. Set up keywords and click Scan.</p>
              </div>
            )}

            {posts.map(post => (
              <div key={post.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <a href={post.url} target="_blank" rel="noopener" className="text-sm font-medium text-zinc-200 hover:text-emerald-400 line-clamp-2">{post.title}</a>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500">
                      <span className="text-orange-400">{post.subreddit}</span>
                      <span>▲ {post.upvotes}</span>
                      <span>💬 {post.comment_count}</span>
                      <span>{timeAgo(post.posted_at)}</span>
                      {post.is_question && <span className="bg-amber-900/30 text-amber-400 px-1.5 py-0.5 rounded">Question</span>}
                    </div>
                    {post.matched_keywords?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {post.matched_keywords.map((k,i)=><span key={i} className={`text-xs px-1.5 py-0.5 rounded-full ${post.matched_type==="industry"?"bg-blue-900/30 text-blue-400":post.matched_type==="brand"?"bg-purple-900/30 text-purple-400":"bg-emerald-900/30 text-emerald-400"}`}>{k}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {post.response?.action === "answered" ? (
                      <span className="text-xs text-emerald-400 bg-emerald-900/20 px-2 py-1 rounded">✓ Answered</span>
                    ) : post.response?.action === "ignored" ? (
                      <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded">Ignored</span>
                    ) : (
                      <>
                        <button onClick={() => { setDraftPostId(post.id); setDraftText(""); }} className="text-xs bg-blue-900/20 text-blue-400 hover:bg-blue-900/40 px-2 py-1 rounded transition">🤖 AI Draft</button>
                        <button onClick={() => takeAction(post.id, "ignored")} className="text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700 px-2 py-1 rounded">Skip</button>
                      </>
                    )}
                  </div>
                </div>

                {/* AI Draft modal */}
                {draftPostId === post.id && (
                  <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
                    <div className="flex gap-2">
                      {(["helpful","expert","promotional","casual"] as const).map(s => (
                        <button key={s} onClick={()=>setDraftStyle(s)} className={`text-xs px-2.5 py-1 rounded-full capitalize ${draftStyle===s?"bg-emerald-900/50 text-emerald-400 border border-emerald-700":"bg-zinc-800 text-zinc-400"}`}>{s}</button>
                      ))}
                      <button onClick={()=>generateDraft(post.id)} disabled={draftLoading} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-full ml-auto">{draftLoading?"Generating…":"Generate"}</button>
                    </div>
                    {draftText && (
                      <div className="space-y-2">
                        <textarea value={draftText} onChange={e=>setDraftText(e.target.value)} className="w-full h-32 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm p-3 resize-y" />
                        <div className="flex gap-2">
                          <button onClick={() => { navigator.clipboard.writeText(draftText); }} className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3 py-1.5 rounded">📋 Copy</button>
                          <button onClick={() => { takeAction(post.id, "answered"); setDraftPostId(""); }} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded">✓ Mark Answered</button>
                          <button onClick={()=>setDraftPostId("")} className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1">Close</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* RESPONSES TAB */}
        {tab === "responses" && (
          <div className="space-y-4">
            <button onClick={()=>loadPosts("answered")} className="text-xs text-emerald-400 hover:underline">Refresh</button>
            {posts.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-14 text-center space-y-3">
                <div className="text-4xl">📝</div>
                <p className="text-zinc-400">No responses yet. Go to Discover to answer posts.</p>
              </div>
            ) : posts.map(post => (
              <div key={post.id} className="bg-zinc-900 border border-emerald-800/30 rounded-xl p-5">
                <a href={post.url} target="_blank" rel="noopener" className="text-sm font-medium text-zinc-200 hover:text-emerald-400">{post.title}</a>
                <div className="text-xs text-zinc-500 mt-1">{post.subreddit} · {timeAgo(post.posted_at)}</div>
                <div className="mt-2 p-3 bg-zinc-800/50 rounded-lg text-sm text-zinc-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {post.response?.response_text || post.response?.ai_draft || "No response text"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
