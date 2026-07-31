"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface SchemaField {
  field: string;
  present: boolean;
  value: string | null;
  note: string;
}

interface ProductAuditData {
  url: string;
  title: string;
  has_product_schema: boolean;
  has_faq_schema: boolean;
  field_count: number;
  max_fields: number;
  schema_fields: SchemaField[];
  content_quality_score: number;
  content_issues: string[];
}

function ProductAuditContent() {
  const params = useSearchParams();
  const rawUrl = params.get("url") || "";
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  const domain = rawUrl.replace(/^https?:\/\//, "").split("/")[0].split("?")[0];
  const [data, setData] = useState<ProductAuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!rawUrl) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    fetch("/api/audit/product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    })
      .then((r) => { clearTimeout(timeout); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.name === "AbortError" ? "This site has bot protection that blocks automated scans. You have two options: 1) Copy and paste your product page HTML below for instant audit, or 2) Install our one-line script on your site so Schema is injected automatically without needing us to crawl." : e.message))
      .finally(() => setLoading(false));
  }, [url]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-zinc-400 animate-pulse">
          Scanning product page...
        </div>
      </div>
    );
  }

  const [manualHtml, setManualHtml] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  const handleManualAudit = async () => {
    if (!manualHtml.trim()) return;
    setManualLoading(true); setError("");
    try {
      const res = await fetch("/api/audit/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, html: manualHtml }),
      });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
      setError("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setManualLoading(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen max-w-4xl mx-auto px-4 py-12 space-y-8">
        <a href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Back</a>
        <div className="bg-amber-900/20 border border-amber-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-amber-400">Scan Failed</h2>
          <p className="text-sm text-zinc-300">{error}</p>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <p className="text-sm font-medium text-zinc-300 mb-3">Option: Paste HTML manually</p>
            <p className="text-xs text-zinc-500 mb-2">
              Open your product page → View Source → copy everything → paste below.
            </p>
            <textarea
              value={manualHtml}
              onChange={(e) => setManualHtml(e.target.value)}
              placeholder="<html>...</html>"
              className="w-full h-40 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs font-mono placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
            />
            <button
              onClick={handleManualAudit}
              disabled={manualLoading || !manualHtml.trim()}
              className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition"
            >
              {manualLoading ? "Auditing..." : "Audit Pasted HTML"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const presentCount = data.field_count;
  const scoreColor =
    data.content_quality_score >= 70
      ? "text-emerald-400"
      : data.content_quality_score >= 50
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <div>
        <a href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">
          ← Back
        </a>
        <h1 className="text-2xl font-bold mt-2">{data.title}</h1>
        <p className="text-zinc-500 text-sm truncate">{data.url}</p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <a href={`/optimize?url=${encodeURIComponent(data.url)}`} className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition text-sm">
          🔧 Fix Schema Issues
        </a>
        <a href={`/verify`} className="flex items-center gap-2 px-5 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-medium rounded-lg transition text-sm">
          📈 Verify After Fixing
        </a>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-2xl font-bold">
            {data.has_product_schema ? "✅" : "🔴"}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Product Schema</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-2xl font-bold">
            {data.has_faq_schema ? "✅" : "🔴"}
          </div>
          <div className="text-xs text-zinc-500 mt-1">FAQ Schema</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-2xl font-bold">
            {presentCount}/{data.max_fields}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Schema Fields</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className={`text-2xl font-bold ${scoreColor}`}>
            {data.content_quality_score}
          </div>
          <div className="text-xs text-zinc-500 mt-1">Content Score</div>
        </div>
      </div>

      {/* Schema field breakdown */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Schema Field Audit</h2>
        <div className="space-y-2">
          {data.schema_fields.map((f) => (
            <div
              key={f.field}
              className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0"
            >
              <div className="flex items-center gap-3">
                <span>{f.present ? "✅" : "❌"}</span>
                <span className="font-mono text-sm">{f.field}</span>
                {f.value && (
                  <span className="text-xs text-zinc-500 truncate max-w-xs">
                    {f.value}
                  </span>
                )}
              </div>
              {f.note && (
                <span className="text-xs text-zinc-500 ml-2 text-right max-w-xs">
                  {f.note}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Content issues */}
      {data.content_issues.length > 0 && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">
            Content Issues ({data.content_issues.length})
          </h2>
          <ul className="space-y-2">
            {data.content_issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-yellow-400 mt-0.5">⚠</span>
                {issue}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

export default function ProductAuditPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-zinc-400">Loading...</div>}>
      <ProductAuditContent />
    </Suspense>
  );
}
