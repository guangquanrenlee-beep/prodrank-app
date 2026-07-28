"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

interface VerificationRecord {
  id: string; date: string; overall: number; delta: number; label: string;
}

export default function VerificationPage() {
  const { user, loading: l } = useAuth();
  const [domain, setDomain] = useState("");
  const [current, setCurrent] = useState<any>(null);
  const [records, setRecords] = useState<VerificationRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const sc = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-amber-400" : "text-red-400";

  useEffect(() => {
    if (user) {
      setBusy(true);
      supabase.from("sites").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1)
        .then(({ data }) => {
          if (data?.[0]) {
            setDomain(data[0].domain);
            setCurrent(data[0].score_data || null);
            fetch(`/api/score/history?domain=${encodeURIComponent(data[0].domain)}&days=30`)
              .then(r => r.json()).then(d => {
                const snaps: any[] = d.snapshots || [];
                const recs: VerificationRecord[] = [];
                for (let i = 1; i < snaps.length; i++) {
                  const delta = snaps[i].score - snaps[i - 1].score;
                  if (delta > 0) recs.push({
                    id: "v" + i, date: snaps[i].date, overall: snaps[i].score, delta,
                    label: delta >= 10 ? "Big Improvement" : delta >= 5 ? "Moderate Gain" : "Small Gain",
                  });
                }
                setRecords(recs);
              }).catch(() => {});
          }
        });
      setBusy(false);
    }
  }, [user]);

  if (l) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full" /></main>;
  if (!user) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to access</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div></main>;

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div>
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
          <h1 className="text-3xl font-bold mt-1">📈 Verification</h1>
          <p className="text-zinc-400 text-sm mt-1">Track how your optimizations improve AI visibility over time. Every scan creates a checkpoint.</p>
        </div>

        {current && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="font-semibold mb-4">Current State — {domain}</h3>
            <div className="grid grid-cols-5 gap-4 text-center">
              <div>
                <div className={`text-3xl font-bold ${sc(current.ai_visibility_score || 0)}`}>{current.ai_visibility_score || "—"}</div>
                <div className="text-xs text-zinc-500 mt-1">Overall</div>
              </div>
              {Object.entries(current.breakdown || {}).map(([key, val]: [string, any]) => (
                <div key={key}>
                  <div className={`text-2xl font-bold ${sc(val.score)}`}>{val.score}</div>
                  <div className="text-xs text-zinc-500 mt-1">{val.label || key}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {busy ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-14 text-center">
            <div className="animate-spin h-6 w-6 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
          </div>
        ) : records.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-14 text-center space-y-3">
            <div className="text-4xl">📊</div>
            <h3 className="text-lg font-semibold text-white">No verification records yet</h3>
            <p className="text-zinc-400 text-sm max-w-md mx-auto">
              Run Analyze at least twice to see before/after improvements. Come back after making changes and re-scanning.
            </p>
            <Link href="/dashboard" className="inline-block px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition">Run Analysis →</Link>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="font-semibold">Improvement History</h3>
            {records.slice(-10).reverse().map(rec => (
              <div key={rec.id} className="bg-zinc-900 border border-emerald-800/20 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-400">{rec.date}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${rec.label === "Big Improvement" ? "bg-emerald-900/30 text-emerald-400" : "bg-blue-900/30 text-blue-400"}`}>{rec.label}</span>
                  </div>
                  <span className={`text-lg font-bold ${sc(rec.overall)}`}>{rec.overall}</span>
                </div>
                <div className="flex items-center gap-3 text-sm mt-2">
                  <span className="text-zinc-500">Score Increase:</span>
                  <span className="font-medium text-emerald-400">▲ +{rec.delta} pts</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
