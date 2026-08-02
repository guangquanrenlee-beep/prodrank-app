"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export default function CompetitorsPage() {
  return <Suspense fallback={<main className="min-h-screen flex items-center justify-center bg-zinc-950"><p className="text-zinc-400">Loading…</p></main>}><CompetitorsContent /></Suspense>;
}

function CompetitorsContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [shop, setShop] = useState(searchParams.get("domain") || "");
  const [sites, setSites] = useState<any[]>([]);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [running, setRunning] = useState(false);
  const [snapshotting, setSnapshotting] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase.from("sites").select("domain,platform").eq("user_id", user.id).limit(50);
        if (data) { setSites(data); if (!shop && data[0]) setShop(data[0].domain); }
      } catch {}
    })();
  }, [user]);

  useEffect(() => { if (shop) load(shop); }, [shop]);

  const load = async (s: string) => {
    try {
      const r = await fetch(`/api/competitors?shop=${encodeURIComponent(s)}`);
      if (r.ok) setCompetitors((await r.json()).competitors || []);
    } catch {}
  };

  const add = async () => {
    if (!newDomain.trim()) return;
    const r = await fetch("/api/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop, domain: newDomain.trim() }) });
    if (r.ok) { setNewDomain(""); load(shop); }
  };

  const snapshot = async (id: string) => {
    setSnapshotting(id); setLastResult(null);
    try {
      const r = await fetch("/api/competitors/snapshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ competitor_id: id }) });
      if (r.ok) setLastResult(await r.json());
    } finally { setSnapshotting(null); load(shop); }
  };

  const runAll = async () => {
    setRunning(true); setLastResult(null);
    try {
      const r = await fetch("/api/competitors/run", { method: "POST" });
      if (r.ok) setLastResult(await r.json());
    } finally { setRunning(false); load(shop); }
  };

  const remove = async (id: string) => {
    await fetch(`/api/competitors/${id}`, { method: "DELETE" });
    load(shop);
  };

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
            <h1 className="text-3xl font-bold mt-1">⚔️ Competitor Watch</h1>
            <p className="text-zinc-500 text-sm mt-1">Daily crawl of competitor stores — FAQ count, Schema types, prices. Diffs surface as alerts. No AI.</p>
          </div>
          <button onClick={runAll} disabled={running} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">
            {running ? "Running…" : "▶ Snapshot all"}
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {sites.map((s: any) => (
            <button key={s.id} onClick={() => setShop(s.domain)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition ${shop === s.domain ? "bg-emerald-900/40 border border-emerald-700 text-emerald-300" : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800"}`}>
              {s.domain}
            </button>
          ))}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Competitors {competitors.length > 0 && `(${competitors.length})`}</h2>
            <div className="flex gap-2">
              <input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="nike.com"
                     className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs placeholder:text-zinc-600 focus:outline-none" />
              <button onClick={add} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition">Add</button>
            </div>
          </div>
          {competitors.length === 0 && <p className="text-sm text-zinc-600">No competitors yet — add one above (nike.com, uniqlo.com…).</p>}
          <div className="space-y-2">
            {competitors.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3">
                <div>
                  <div className="text-sm text-zinc-200">🌐 {c.name || c.domain}</div>
                  <div className="text-xs text-zinc-600">{c.pages ? `Last snapshot ${c.last_snapshot} · ${c.pages} pages` : "Not snapshotted yet"}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => snapshot(c.id)} disabled={snapshotting === c.id}
                          className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 text-white text-xs font-medium rounded-lg transition">
                    {snapshotting === c.id ? "…" : "Snapshot"}
                  </button>
                  <button onClick={() => remove(c.id)} className="px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-300 text-xs font-medium rounded-lg transition">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {lastResult && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="font-semibold text-sm mb-3">Latest run</h3>
            {Array.isArray(lastResult.items) ? lastResult.items.map((it: any, i: number) => (
              <div key={i} className="text-xs text-zinc-400 py-1">
                {it.competitor || it.error}: {it.error ? `❌ ${it.error}` : `${it.pages} pages · ${it.changes?.length || 0} changes`}
                {it.changes?.map((c: any, j: number) => <div key={j} className={`pl-4 ${c.severity === "warning" ? "text-amber-300" : "text-emerald-400"}`}>• {c.message}</div>)}
              </div>
            )) : <p className="text-xs text-zinc-400">{JSON.stringify(lastResult).slice(0, 300)}</p>}
          </div>
        )}
      </div>
    </main>
  );
}
