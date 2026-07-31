"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

interface SaasAuditData {
  url: string; title: string;
  has_software_schema: boolean; has_org_schema: boolean; has_faq_schema: boolean;
  field_count: number; max_fields: number;
  schema_fields: { field: string; present: boolean; value: string | null; note: string }[];
  content_quality_score: number; content_issues: string[];
}

export default function SaasAuditPage() {
  const { user, loading: authLoading } = useAuth();
  const [url, setUrl] = useState("");
  const [data, setData] = useState<SaasAuditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true); setError(""); setData(null);
    try {
      const res = await fetch("/api/audit/saas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      setData(await res.json());
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  };

  if (authLoading) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full" /></main>;
  if (!user) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to access</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div></main>;

  const scoreColor = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-yellow-400" : "text-red-400";

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 py-10 space-y-8">
      <div>
        <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
        <h1 className="text-3xl font-bold mt-1">💻 SaaS Schema Audit</h1>
        <p className="text-zinc-400 text-sm mt-1">Check if AI agents can understand your software — SoftwareApplication Schema audit across 12 fields.</p>
      </div>

      <form onSubmit={runAudit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex gap-3">
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://yoursaas.com" className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <button type="submit" disabled={loading || !url.trim()} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">{loading ? "Auditing..." : "Audit"}</button>
      </form>
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {data && (
        <div className="space-y-8">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className="text-2xl">{data.has_software_schema ? "✅" : "🔴"}</div>
              <div className="text-xs text-zinc-500 mt-1">SoftwareApplication</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className="text-2xl">{data.has_org_schema ? "✅" : "🔴"}</div>
              <div className="text-xs text-zinc-500 mt-1">Organization</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className="text-2xl">{data.has_faq_schema ? "✅" : "🔴"}</div>
              <div className="text-xs text-zinc-500 mt-1">FAQPage</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${scoreColor(data.content_quality_score)}`}>{data.content_quality_score}</div>
              <div className="text-xs text-zinc-500 mt-1">Content Score</div>
            </div>
          </div>

          {/* Field audit */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">SoftwareApplication Schema — {data.field_count}/{data.max_fields} fields</h2>
              <span className="text-xs text-zinc-500">AI can understand {Math.round(data.field_count / data.max_fields * 100)}% of your software info</span>
            </div>
            <div className="space-y-1.5">
              {data.schema_fields.map(f => (
                <div key={f.field} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <span>{f.present ? "✅" : "❌"}</span>
                    <span className="font-mono text-sm text-zinc-300">{f.field}</span>
                    {f.value && <span className="text-xs text-zinc-500 truncate max-w-[200px]">{f.value}</span>}
                  </div>
                  {f.note && <span className="text-xs text-zinc-600 ml-2 text-right max-w-[250px]">{f.note}</span>}
                </div>
              ))}
            </div>
          </section>

          {/* Content issues */}
          {data.content_issues.length > 0 && (
            <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="font-semibold mb-4">Content Issues ({data.content_issues.length})</h2>
              <ul className="space-y-2">
                {data.content_issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                    <span className="text-yellow-400 mt-0.5">⚠</span>{issue}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            {!data.has_software_schema && (
              <Link href={`/saas-optimize?url=${encodeURIComponent(data.url)}`} className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition text-sm">
                🔧 Generate SoftwareApplication Schema
              </Link>
            )}
            <Link href="/verify" className="px-5 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-lg transition text-sm">
              📈 Verify After Fixing
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
