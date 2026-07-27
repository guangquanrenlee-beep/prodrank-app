"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

interface GapItem {
  question: string;
  covered: boolean;
  priority: string;
}

interface SchemaField {
  field: string;
  present: boolean;
  value: string;
  note: string;
}

interface AIFieldValidation {
  field: string;
  schema_value: string;
  chatgpt_recognized: boolean;
  chatgpt_value: string;
  gemini_recognized: boolean;
  gemini_value: string;
}

interface KnowledgeDimension {
  dimension: string;
  label: string;
  covered: boolean;
}

interface Report {
  url: string;
  title: string;
  schema_audit: {
    has_product_schema: boolean;
    has_faq_schema: boolean;
    field_count: number;
    max_fields: number;
    schema_fields: SchemaField[];
    content_issues: string[];
    content_quality_score: number;
  };
  ai_parse: {
    field_validations: AIFieldValidation[];
    knowledge_dimensions: KnowledgeDimension[];
    knowledge_score: number;
    missing_dimensions: string[];
    entity_profile: {
      pros: string[];
      cons: string[];
      best_for: string[];
      worst_for: string[];
      alternatives: string[];
      price_range: string;
      audience: string;
    } | null;
    ai_understanding: Record<string, any>;
  } | null;
  knowledge_gap: {
    category: string;
    total_ai_questions: number;
    covered_questions: number;
    coverage_pct: number;
    top_missing: string[];
    gaps: GapItem[];
  } | null;
}

export default function KnowledgeGraphPage() {
  const { user, loading: authLoading } = useAuth();
  const [domain, setDomain] = useState("");
  const [category, setCategory] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"saas" | "ecommerce">("ecommerce");
  const isSaaS = mode === "saas";

  useEffect(() => {
    if (user) {
      const key = `prodrank_last_domain_${user.id}`;
      const last = localStorage.getItem(key);
      if (last) setDomain(last);
      const savedMode = localStorage.getItem("prodrank_dashboard_mode");
      if (savedMode === "saas" || savedMode === "ecommerce") setMode(savedMode);
    }
  }, [user]);

  const runAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) return;
    setLoading(true);
    setError("");
    setReport(null);

    try {
      const cleanDomain = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
      const url = `https://${cleanDomain}`;

      const res = await fetch("/api/intel/full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, brand: cleanDomain, category: category || "" }),
      });

      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);

      const data: Report = await res.json();
      setReport(data);
    } catch (err: any) {
      setError(err.message || "Analysis failed");
    }
    setLoading(false);
  };

  const priorityColor = (p: string) =>
    p === "high" ? "text-red-400 bg-red-900/20 border-red-800" :
    p === "medium" ? "text-amber-400 bg-amber-900/20 border-amber-800" :
    "text-zinc-400 bg-zinc-800 border-zinc-700";

  const scoreColor = (s: number) =>
    s >= 70 ? "text-emerald-400" : s >= 40 ? "text-amber-400" : "text-red-400";

  const scoreBg = (s: number) =>
    s >= 70 ? "bg-emerald-500" : s >= 40 ? "bg-amber-500" : "bg-red-500";

  if (authLoading) return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full" />
    </main>
  );
  if (!user) return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center space-y-4"><p className="text-zinc-400">Sign in to access</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div>
    </main>
  );

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <div>
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold mt-1">🧠 Knowledge Graph</h1>
            <span className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded-full mt-1">{isSaaS ? "💻 SaaS" : "🛒 Store"}</span>
          </div>
          <p className="text-zinc-400 text-sm mt-1">
            {isSaaS
              ? "See what AI agents know about your SaaS tool — pricing, features, use cases, and where competitors are beating you."
              : "See what AI agents know about your products — attributes, quality, and what customers are asking AI before they buy."}
          </p>
        </div>

        {/* Input */}
        <form onSubmit={runAnalysis} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex gap-3">
            <input
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="yourdomain.com"
              className="flex-1 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <input
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder={isSaaS ? "e.g. invoicing, CRM (optional)" : "e.g. winter jackets (optional)"}
              className="w-48 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={loading || !domain.trim()}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition whitespace-nowrap"
            >
              {loading ? "Analyzing…" : "🔍 Scan Knowledge"}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </form>

        {/* Loading */}
        {loading && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-20 text-center">
            <div className="animate-spin h-8 w-8 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-zinc-400">Asking AI agents what they know about {domain}…</p>
          </div>
        )}

        {/* Report */}
        {report && (
          <>
            {/* ===== Score Overview ===== */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                <div className={`text-5xl font-bold ${scoreColor(report.schema_audit.content_quality_score)}`}>
                  {report.schema_audit.content_quality_score}
                </div>
                <div className="text-sm text-zinc-500 mt-1">Content Quality</div>
                <div className="text-xs text-zinc-600 mt-1">{report.schema_audit.field_count}/{report.schema_audit.max_fields} schema fields</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                <div className={`text-5xl font-bold ${scoreColor(report.ai_parse?.knowledge_score || 0)}`}>
                  {report.ai_parse?.knowledge_score ?? "—"}
                </div>
                <div className="text-sm text-zinc-500 mt-1">AI Knowledge Score</div>
                <div className="text-xs text-zinc-600 mt-1">{report.ai_parse?.knowledge_dimensions?.filter(d => d.covered).length ?? 0}/{report.ai_parse?.knowledge_dimensions?.length ?? 0} dimensions covered</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                <div className={`text-5xl font-bold ${scoreColor(report.knowledge_gap?.coverage_pct || 0)}`}>
                  {report.knowledge_gap?.coverage_pct ?? "—"}%
                </div>
                <div className="text-sm text-zinc-500 mt-1">Question Coverage</div>
                <div className="text-xs text-zinc-600 mt-1">{report.knowledge_gap?.covered_questions ?? 0}/{report.knowledge_gap?.total_ai_questions ?? 0} questions answered</div>
              </div>
            </div>

            {/* ===== AI Knowledge Dimensions ===== */}
            {report.ai_parse?.knowledge_dimensions && report.ai_parse.knowledge_dimensions.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-lg mb-4">📐 What AI Expects vs What You Provide</h3>
                <p className="text-xs text-zinc-500 mb-5">
                  These are the knowledge dimensions AI agents look for when deciding whether to recommend {report.title || domain}. Each unchecked dimension is a missed opportunity.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {report.ai_parse.knowledge_dimensions.map((d, i) => (
                    <div key={i} className={`flex items-center justify-between rounded-lg p-4 border ${d.covered ? "border-emerald-800 bg-emerald-900/10" : "border-zinc-700 bg-zinc-800/30"}`}>
                      <div>
                        <div className="text-sm font-medium text-zinc-200">{d.label}</div>
                        <div className="text-xs text-zinc-500">{d.dimension}</div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${d.covered ? "bg-emerald-900/50 text-emerald-400" : "bg-red-900/50 text-red-400"}`}>
                        {d.covered ? "✅ Covered" : "❌ Missing"}
                      </span>
                    </div>
                  ))}
                </div>
                {report.ai_parse.missing_dimensions?.length > 0 && (
                  <div className="mt-4 p-4 bg-amber-900/10 border border-amber-800 rounded-lg">
                    <div className="text-sm font-medium text-amber-400 mb-2">🎯 Priority Fixes</div>
                    <ul className="space-y-1">
                      {report.ai_parse.missing_dimensions.map((d, i) => (
                        <li key={i} className="text-sm text-zinc-300">• Add <span className="text-amber-400 font-medium">{d}</span> to your page content or schema</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* ===== Schema + AI Cross-Reference ===== */}
            {report.ai_parse?.field_validations && report.ai_parse.field_validations.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-lg mb-4">🔬 Schema vs AI Understanding</h3>
                <p className="text-xs text-zinc-500 mb-5">
                  Left: what your Schema claims. Right: what AI actually reads. Mismatches mean AI is confused about your product.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                        <th className="text-left py-2 px-3 font-medium">Field</th>
                        <th className="text-left py-2 px-3 font-medium">Your Schema</th>
                        <th className="text-left py-2 px-3 font-medium">🤖 ChatGPT</th>
                        <th className="text-left py-2 px-3 font-medium">🔮 Gemini</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.ai_parse.field_validations.map((fv, i) => (
                        <tr key={i} className="border-b border-zinc-800/50">
                          <td className="py-3 px-3 text-zinc-400 capitalize font-medium">{fv.field.replace(/_/g, " ")}</td>
                          <td className="py-3 px-3 text-zinc-500 max-w-[180px] truncate" title={fv.schema_value}>
                            {fv.schema_value || <span className="text-zinc-700">—</span>}
                          </td>
                          <td className="py-3 px-3">
                            {fv.chatgpt_recognized ? (
                              <span className="text-emerald-400">{fv.chatgpt_value || "✓"}</span>
                            ) : (
                              <span className="text-red-400" title="ChatGPT couldn't find this info">✗ Not recognized</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {fv.gemini_recognized ? (
                              <span className="text-emerald-400">{fv.gemini_value || "✓"}</span>
                            ) : (
                              <span className="text-red-400" title="Gemini couldn't find this info">✗ Not recognized</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ===== Entity Profile ===== */}
            {report.ai_parse?.entity_profile && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-lg mb-4">🧬 How AI Perceives {report.title || domain}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {report.ai_parse.entity_profile.pros?.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-zinc-500 mb-2 uppercase">✅ AI-Recognized Strengths</div>
                      <div className="flex flex-wrap gap-1.5">
                        {report.ai_parse.entity_profile.pros.map((p, j) => (
                          <span key={j} className="text-xs bg-emerald-900/30 text-emerald-400 px-2.5 py-1 rounded border border-emerald-800/50">{p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.ai_parse.entity_profile.cons?.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-zinc-500 mb-2 uppercase">❌ AI-Recognized Weaknesses</div>
                      <div className="flex flex-wrap gap-1.5">
                        {report.ai_parse.entity_profile.cons.map((c, j) => (
                          <span key={j} className="text-xs bg-red-900/30 text-red-400 px-2.5 py-1 rounded border border-red-800/50">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.ai_parse.entity_profile.best_for?.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-zinc-500 mb-2 uppercase">🎯 Best For</div>
                      <div className="flex flex-wrap gap-1.5">
                        {report.ai_parse.entity_profile.best_for.map((b, j) => (
                          <span key={j} className="text-xs bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded">{b}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.ai_parse.entity_profile.alternatives?.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-zinc-500 mb-2 uppercase">🔄 AI-Suggested Alternatives</div>
                      <div className="flex flex-wrap gap-1.5">
                        {report.ai_parse.entity_profile.alternatives.map((a, j) => (
                          <span key={j} className="text-xs bg-zinc-800 text-amber-400 px-2.5 py-1 rounded border border-amber-800/30">{a}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {report.ai_parse.entity_profile.price_range && (
                  <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-zinc-500">💰 Price Perception</span><div className="text-zinc-300 mt-0.5">{report.ai_parse.entity_profile.price_range}</div></div>
                    <div><span className="text-zinc-500">👥 Target Audience</span><div className="text-zinc-300 mt-0.5">{report.ai_parse.entity_profile.audience || "Not identified"}</div></div>
                  </div>
                )}
              </div>
            )}

            {/* ===== Knowledge Gaps ===== */}
            {report.knowledge_gap?.gaps && report.knowledge_gap.gaps.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-lg mb-2">❓ Questions AI Answers That Your Site Doesn't</h3>
                <p className="text-xs text-zinc-500 mb-5">
                  AI agents answer these {report.knowledge_gap.total_ai_questions} questions about "{report.knowledge_gap.category}". Your site covers only {report.knowledge_gap.covered_questions}. Every uncovered question is a chance for AI to recommend a competitor instead.
                </p>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {report.knowledge_gap.gaps.map((g, i) => (
                    <div key={i} className={`flex items-center justify-between rounded-lg px-4 py-2.5 border ${g.covered ? "border-emerald-800/50 bg-emerald-900/5" : "border-zinc-700 bg-zinc-800/20"}`}>
                      <div className="flex items-center gap-3">
                        <span>{g.covered ? "✅" : "❌"}</span>
                        <span className="text-sm text-zinc-300">{g.question}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${priorityColor(g.priority)}`}>{g.priority}</span>
                    </div>
                  ))}
                </div>

                {report.knowledge_gap.top_missing?.length > 0 && (
                  <div className="mt-5 p-4 bg-emerald-900/10 border border-emerald-800 rounded-lg">
                    <div className="text-sm font-medium text-emerald-400 mb-2">🔧 Top Questions to Cover First</div>
                    <ol className="space-y-1 list-decimal pl-4">
                      {report.knowledge_gap.top_missing.map((q, i) => (
                        <li key={i} className="text-sm text-zinc-300">{q}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}

            {/* ===== Schema Issues ===== */}
            {report.schema_audit.content_issues?.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-lg mb-4">⚠️ Content Issues Found</h3>
                <div className="space-y-2">
                  {report.schema_audit.content_issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-zinc-300 bg-zinc-800/50 rounded-lg px-4 py-2.5">
                      <span className="text-amber-400 mt-0.5">⚠</span>
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ===== Actions ===== */}
            <div className="flex gap-3">
              <Link href={`/optimize?url=${encodeURIComponent(`https://${domain}`)}`} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-center transition">
                🔧 Fix Schema Issues →
              </Link>
              <Link href={`/actions?domain=${encodeURIComponent(domain)}`} className="flex-1 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-medium rounded-lg text-center transition">
                ⚡ Action Center →
              </Link>
            </div>
          </>
        )}

        {/* Empty state */}
        {!report && !loading && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-14 text-center space-y-3">
            <div className="text-4xl">🧠</div>
            <h3 className="text-lg font-semibold text-white">
              {isSaaS ? "See What AI Knows About Your SaaS" : "See What AI Knows About Your Products"}
            </h3>
            <p className="text-zinc-400 text-sm max-w-md mx-auto">
              {isSaaS
                ? "We'll check if ChatGPT, Gemini, and Claude understand your software — pricing, features, use cases, and how you compare to alternatives."
                : "Enter your product page above to scan how AI agents perceive your products — what they know, what they miss, and exactly what to fix to boost your AI visibility score."}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
