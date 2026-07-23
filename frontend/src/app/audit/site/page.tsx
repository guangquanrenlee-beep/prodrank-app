"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface SiteAuditData {
  url: string;
  total_pages: number;
  pages_with_product_schema: number;
  pages_with_faq_schema: number;
  pages_with_breadcrumb: number;
  pages_with_organization: number;
  ai_bots_blocked: Record<string, boolean>;
  js_rendering_issues: number;
  health_score: number;
  top_issues: string[];
}

function SiteAuditContent() {
  const params = useSearchParams();
  const domain = params.get("domain") || "";
  const [data, setData] = useState<SiteAuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!domain) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000); // 3 min for stealth scans

    fetch("/api/audit/site", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
      signal: controller.signal,
    })
      .then((r) => { clearTimeout(timeout); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.name === "AbortError" ? "Scan timed out — this site may have aggressive bot protection. Try installing inject.js instead." : e.message))
      .finally(() => setLoading(false));
  }, [domain]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-zinc-400 animate-pulse text-lg">
            Scanning {domain}...
          </div>
          <p className="text-sm text-zinc-600 max-w-sm">
            This may take up to 2 minutes if your site has bot protection.
            <br />
            We'll find all products and check Schema coverage.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (!data) return null;

  const scoreColor =
    data.health_score >= 70
      ? "text-emerald-400"
      : data.health_score >= 40
      ? "text-yellow-400"
      : "text-red-400";

  const productCoverage = data.total_pages > 0
    ? Math.round((data.pages_with_product_schema / data.total_pages) * 100)
    : 0;

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 py-12 space-y-8">
      <div>
        <a href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">
          ← Back
        </a>
        <h1 className="text-2xl font-bold mt-2">Site AI Health Audit</h1>
        <p className="text-zinc-500 text-sm">{data.url}</p>
      </div>

      {/* Health score */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <div className={`text-6xl font-bold ${scoreColor}`}>
          {data.health_score}
        </div>
        <div className="text-zinc-500 mt-2">AI Health Score / 100</div>
        <div className="text-sm text-zinc-600 mt-1">
          {data.total_pages} pages analyzed
        </div>
      </div>

      {/* Schema coverage grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <CoverageCard
          label="Product Schema"
          count={data.pages_with_product_schema}
          total={data.total_pages}
        />
        <CoverageCard
          label="FAQPage Schema"
          count={data.pages_with_faq_schema}
          total={data.total_pages}
        />
        <CoverageCard
          label="BreadcrumbList"
          count={data.pages_with_breadcrumb}
          total={data.total_pages}
        />
        <CoverageCard
          label="Organization"
          count={data.pages_with_organization}
          total={data.total_pages}
        />
      </div>

      {/* AI Bot access */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">AI Bot Access</h2>
        <div className="space-y-2">
          {Object.entries(data.ai_bots_blocked).map(([bot, blocked]) => (
            <div
              key={bot}
              className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0"
            >
              <span className="font-mono text-sm">{bot}</span>
              <span className={blocked ? "text-red-400" : "text-emerald-400"}>
                {blocked ? "Blocked" : "Allowed"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* JS rendering issues */}
      {data.js_rendering_issues > 0 && (
        <section className="bg-zinc-900 border border-yellow-800 rounded-xl p-6">
          <p className="text-yellow-400 text-sm">
            ⚠ {data.js_rendering_issues} pages had JavaScript rendering
            issues — AI bots may not see the full content on these pages.
          </p>
        </section>
      )}

      {/* Top issues */}
      {data.top_issues.length > 0 && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">
            Top Issues ({data.top_issues.length})
          </h2>
          <ul className="space-y-2">
            {data.top_issues.map((issue, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-zinc-400"
              >
                <span className="text-red-400 mt-0.5">•</span>
                {issue}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function CoverageCard({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const color = pct >= 70 ? "text-emerald-400" : pct >= 30 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{pct}%</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
      <div className="text-xs text-zinc-600">{count}/{total} pages</div>
    </div>
  );
}

export default function SiteAuditPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-zinc-400">Loading...</div>}>
      <SiteAuditContent />
    </Suspense>
  );
}
