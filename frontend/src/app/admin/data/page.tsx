"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

/**
 * Internal data asset panel — question library stats.
 * Protected by X-Admin-Key (stored in localStorage after first entry).
 * NOT linked anywhere in the UI; only the owner knows the URL + key.
 */
export default function AdminDataPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("prodrank_admin_key");
    if (saved) { setKey(saved); fetchData(saved); }
  }, []);

  const fetchData = async (k: string) => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/admin/data/summary", { headers: { "X-Admin-Key": k } });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || `HTTP ${r.status}`);
      }
      setData(await r.json());
      setAuthed(true);
      localStorage.setItem("prodrank_admin_key", k);
    } catch (e: any) {
      setAuthed(false);
      setError(e.message);
    } finally { setLoading(false); }
  };

  const logout = () => { localStorage.removeItem("prodrank_admin_key"); setAuthed(false); setData(null); setKey(""); };

  if (!authed) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm space-y-4">
          <h1 className="text-lg font-bold">Admin — Data Assets</h1>
          <p className="text-xs text-zinc-500">Internal only. Enter the admin key.</p>
          <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="Admin key"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <button onClick={() => fetchData(key)} disabled={loading || !key}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg">
            {loading ? "…" : "Unlock"}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">📊 Data Assets</h1>
            <p className="text-sm text-zinc-500">Real question library — internal only. Updated {data?.generated_at?.slice(0, 16).replace("T", " ")}</p>
          </div>
          <button onClick={logout} className="text-xs text-zinc-500 hover:text-red-400">Sign out</button>
        </div>

        {/* Total */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="text-xs text-zinc-500">Total questions</div>
            <div className="text-4xl font-bold text-emerald-400">{data?.total_questions?.toLocaleString()}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="text-xs text-zinc-500">Categories</div>
            <div className="text-4xl font-bold">{Object.keys(data?.categories || {}).length}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="text-xs text-zinc-500">Today</div>
            <div className="text-4xl font-bold">{data?.last_7_days ? Object.values(data.last_7_days).pop() : 0}</div>
          </div>
        </div>

        {/* Per category dimension distribution */}
        <div className="space-y-3">
          {Object.entries(data?.categories || {}).map(([cat, c]: any) => (
            <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold capitalize">{cat}</span>
                <span className="text-xs text-zinc-500">{c.total} questions</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(c.dimensions).map(([dim, count]: any) => (
                  <span key={dim} className="text-xs bg-zinc-800 px-2.5 py-1 rounded-full text-zinc-300">
                    {dim} <span className="text-emerald-400 font-bold">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 7-day growth */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="font-semibold mb-4">Last 7 days growth</h3>
          <div className="flex items-end gap-3 h-32">
            {Object.entries(data?.last_7_days || {}).map(([day, count]: any) => {
              const max = Math.max(1, ...Object.values(data?.last_7_days || {}).map((v: any) => v));
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-zinc-400">{count}</span>
                  <div className="w-full bg-emerald-600 rounded-t" style={{ height: `${(count / max) * 80}px` }} />
                  <span className="text-[10px] text-zinc-600">{day.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-zinc-600">🔒 This page is internal. The question library is a core company asset — never exposed to users.</p>
      </div>
    </main>
  );
}
