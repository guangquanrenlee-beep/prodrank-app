"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

interface KBEntry {
  id: string; entity_type: string; entity_value: string; entity_key: string;
  source_type: string; source_filename: string; confidence: number;
  created_at: string;
}

export default function KnowledgeBasePage() {
  const { user, loading: l } = useAuth();
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [stats, setStats] = useState<any>({});
  const [uploading, setUploading] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (user) loadEntries(); }, [user]);

  const loadEntries = async () => {
    try {
      const res = await fetch("/api/knowledge/entries?limit=100");
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setStats(data.stats || {});
      }
    } catch {}
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(""); setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/knowledge/upload", { method: "POST", body: form });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        loadEntries();
      } else {
        setError((await res.json()).detail || "Upload failed");
      }
    } catch { setError("Network error"); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleYoutube = async () => {
    if (!youtubeUrl.trim()) return;
    setUploading(true); setError(""); setResult(null);
    try {
      const form = new FormData();
      form.append("youtube_url", youtubeUrl);
      const res = await fetch("/api/knowledge/upload", { method: "POST", body: form });
      if (res.ok) {
        setResult(await res.json());
        setYoutubeUrl("");
        loadEntries();
      } else {
        setError((await res.json()).detail || "Failed");
      }
    } catch { setError("Network error"); }
    setUploading(false);
  };

  const deleteEntry = async (id: string) => {
    await fetch(`/api/knowledge/entries/${id}`, { method: "DELETE" });
    loadEntries();
  };

  const typeColor = (t: string) => {
    const colors: Record<string,string> = {material:"bg-amber-900/30 text-amber-400",audience:"bg-blue-900/30 text-blue-400",size:"bg-purple-900/30 text-purple-400",care:"bg-emerald-900/30 text-emerald-400",warranty:"bg-red-900/30 text-red-400",feature:"bg-cyan-900/30 text-cyan-400",price_range:"bg-pink-900/30 text-pink-400",use_case:"bg-indigo-900/30 text-indigo-400"};
    return colors[t] || "bg-zinc-800 text-zinc-400";
  };

  if (l) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full"/></main>;
  if (!user) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to access</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div></main>;

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div>
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
          <h1 className="text-3xl font-bold mt-1">🧠 Knowledge Base</h1>
          <p className="text-zinc-400 text-sm mt-1">Upload product materials. AI extracts structured knowledge to improve your Understand Score.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Entries", value: stats.total || entries.length },
            { label: "Unique Types", value: stats.unique_types || 0 },
            { label: "CSV", value: stats.by_source?.csv || 0 },
            { label: "AI Extracted", value: (stats.by_source?.pdf || 0) + (stats.by_source?.image || 0) + (stats.by_source?.youtube || 0) },
          ].map((s, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{s.value}</div>
              <div className="text-xs text-zinc-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Upload area */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h3 className="font-semibold">📤 Upload Product Knowledge</h3>
          <p className="text-xs text-zinc-500">Upload CSV, PDF, or images. AI auto-extracts material, audience, size, care, and more.</p>

          <div className="flex gap-4 flex-wrap">
            {/* File upload */}
            <label className="flex-1 min-w-[200px] bg-zinc-800/50 border-2 border-dashed border-zinc-700 hover:border-emerald-600 rounded-xl p-8 text-center cursor-pointer transition group">
              <input type="file" ref={fileRef} onChange={handleFileUpload} accept=".csv,.pdf,.png,.jpg,.jpeg,.webp" className="hidden" disabled={uploading} />
              <div className="text-2xl mb-2">📁</div>
              <div className="text-sm text-zinc-300 group-hover:text-emerald-400">Drop file or click</div>
              <div className="text-xs text-zinc-600 mt-1">CSV, PDF, PNG, JPG</div>
            </label>

            {/* YouTube */}
            <div className="flex-1 min-w-[200px] bg-zinc-800/30 border border-zinc-700 rounded-xl p-6 space-y-3">
              <div className="text-lg mb-1">🎬 YouTube Video</div>
              <input value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..."
                className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-xs" />
              <button onClick={handleYoutube} disabled={uploading || !youtubeUrl.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 text-white text-sm rounded-lg transition">
                {uploading ? "Processing…" : "Extract Knowledge"}
              </button>
            </div>
          </div>

          {uploading && <div className="flex items-center gap-2 text-sm text-emerald-400"><div className="animate-spin h-4 w-4 border-2 border-emerald-500 border-t-transparent rounded-full"/>AI extracting knowledge…</div>}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {result && <div className="bg-emerald-900/10 border border-emerald-800 rounded-lg p-3 text-sm text-emerald-400">✅ {result.source_type} processed — {result.entries} knowledge entries extracted</div>}
        </div>

        {/* Knowledge entries */}
        {entries.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-14 text-center space-y-3">
            <div className="text-4xl">📚</div>
            <h3 className="text-lg font-semibold text-white">No knowledge entries yet</h3>
            <p className="text-zinc-400 text-sm max-w-md mx-auto">
              Upload your product data (CSV, PDF, images, or YouTube links). AI will extract structured knowledge that boosts your Understand Score.
            </p>
            <p className="text-xs text-emerald-400">💡 Upload more → AI understands your products better → Higher scores</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Knowledge Entries ({entries.length})</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[600px] overflow-y-auto">
              {entries.map(e => (
                <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-start gap-3 group">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full mt-0.5 flex-shrink-0 ${typeColor(e.entity_type)}`}>{e.entity_type}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{e.entity_value}</div>
                    <div className="flex items-center gap-2 text-xs text-zinc-600 mt-0.5">
                      <span>{e.source_type}</span>
                      {e.confidence < 1 && <span>{Math.round(e.confidence * 100)}% confidence</span>}
                    </div>
                  </div>
                  <button onClick={() => deleteEntry(e.id)} className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-300 flex-shrink-0">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
