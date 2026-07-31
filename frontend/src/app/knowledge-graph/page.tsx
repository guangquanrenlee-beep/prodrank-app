"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

/* ── Shared types ── */

interface GapItem { question: string; covered: boolean; priority: string; }
interface SchemaField { field: string; present: boolean; value: string; note: string; }
interface AIFieldValidation { field: string; schema_value: string; chatgpt_recognized: boolean; chatgpt_value: string; gemini_recognized: boolean; gemini_value: string; }
interface EntityProfile { pros: string[]; cons: string[]; best_for: string[]; worst_for: string[]; alternatives: string[]; price_range: string; audience: string; }

interface Report {
  url: string; title: string;
  schema_audit: { has_product_schema: boolean; has_faq_schema: boolean; field_count: number; max_fields: number; schema_fields: SchemaField[]; content_issues: string[]; content_quality_score: number; };
  ai_parse: { field_validations: AIFieldValidation[]; knowledge_dimensions: {dimension:string;label:string;covered:boolean}[]; knowledge_score: number; missing_dimensions: string[]; entity_profile: EntityProfile | null; ai_understanding: Record<string, any>; } | null;
  knowledge_gap: { category: string; total_ai_questions: number; covered_questions: number; coverage_pct: number; top_missing: string[]; gaps: GapItem[]; } | null;
}

/* ── Helpers ── */

const sc = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-amber-400" : "text-red-400";
const sb = (s: number) => s >= 70 ? "bg-emerald-500" : s >= 40 ? "bg-amber-500" : "bg-red-500";
const priorityColor = (p: string) => p === "high" ? "text-red-400 bg-red-900/20 border-red-800" : p === "medium" ? "text-amber-400 bg-amber-900/20 border-amber-800" : "text-zinc-400 bg-zinc-800 border-zinc-700";

/* ── Ecommerce: product attributes AI looks for ── */

const PRODUCT_CATEGORIES: Record<string, string[]> = {
  "Fashion": ["Material", "Fit", "Season", "Audience", "Care instructions", "Style", "Size range"],
  "Electronics": ["Battery life", "Compatibility", "Warranty", "Tech specs", "Use case", "Brand reputation"],
  "Home & Kitchen": ["Material", "Warranty", "Installation", "Dimensions", "Maintenance", "Energy efficiency"],
  "Beauty": ["Ingredients", "Skin type", "Usage frequency", "Shelf life", "Allergens", "Cruelty-free"],
  "Sports": ["Terrain", "Skill level", "Material", "Weight", "Weather suitability", "Durability"],
  "Toys & Games": ["Age range", "Safety certs", "Battery required", "Number of players", "Educational value"],
  "Food & Beverage": ["Ingredients", "Dietary tags", "Shelf life", "Origin", "Certifications", "Nutrition facts"],
};

export default function KnowledgeGraphPage() {
  const { user, loading: authLoading } = useAuth();
  const [domain, setDomain] = useState("");
  const [category, setCategory] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      const last = localStorage.getItem(`prodrank_last_kg_url_${user.id}`);
      if (last) setDomain(last);
    }
  }, [user]);

  const isProductUrl = (raw: string) => raw.includes("/products/") || raw.includes("/product/") || raw.includes("/item/") || raw.includes("/p/");
  const [siteAudit, setSiteAudit] = useState<any>(null);
  const [isBulkScan, setIsBulkScan] = useState(false);

  const runAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) return;
    setLoading(true); setError(""); setReport(null); setSiteAudit(null);
    const raw = domain.trim();
    let url: string;
    if (raw.startsWith("http")) { url = raw.replace(/\/$/, ""); }
    else { const clean = raw.replace(/^https?:\/\//, "").replace(/\/$/, ""); url = `https://${clean}`; }

    // Route: product URL → deep analysis, domain → bulk site scan
    if (isProductUrl(raw)) {
      setIsBulkScan(false);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000);
        const res = await fetch("/api/intel/full", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, brand: new URL(url).hostname, category: category || "" }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(await res.text());
        const result = await res.json();
        setReport(result);
        if (user) localStorage.setItem(`prodrank_last_kg_url_${user.id}`, raw);
      } catch (err: any) {
        if (err.name === "AbortError") setError("Analysis timed out after 90s. Try a single product URL instead.");
        else setError(err.message || "Analysis failed. The site might be blocking our crawler.");
      }
    } else {
      // Bulk site scan
      setIsBulkScan(true);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);
        const res = await fetch("/api/audit/site", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: new URL(url).hostname }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(await res.text());
        const result = await res.json();
        setSiteAudit(result);
        if (user) localStorage.setItem(`prodrank_last_kg_url_${user.id}`, raw);
      } catch (err: any) {
        if (err.name === "AbortError") setError("Bulk scan timed out. The site may have too many products or bot protection.");
        else setError(err.message || "Bulk scan failed. Try a single product URL instead.");
      }
    }
    setLoading(false);
  };

  if (authLoading) return (<main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full" /></main>);
  if (!user) return (<main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to access</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div></main>);

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">

        {/* ═══ HEADER ═══ */}
        <div>
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold mt-1">🧠 Knowledge Graph</h1>
            <span className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded-full mt-1">🛒 Store</span>
          </div>
          <p className="text-zinc-400 text-sm mt-1">See exactly what AI agents know about your products — which attributes they find, which they miss, and what to fix.</p>
        </div>

        {/* ═══ INPUT ═══ */}
        <form onSubmit={runAnalysis} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex gap-3">
            <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourstore.com or paste a product URL"
              className="flex-1 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. winter jackets (optional)"
              className="w-52 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <button type="submit" disabled={loading || !domain.trim()}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition whitespace-nowrap">
              {loading ? "Analyzing…" : "🔍 Scan Knowledge"}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        </form>

        {/* ═══ LOADING ═══ */}
        {loading && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-20 text-center space-y-3">
            <div className="animate-spin h-8 w-8 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
            <p className="text-zinc-400 font-medium">{isBulkScan ? `Scanning all products on ${domain}…` : `Scanning ${domain}…`}</p>
            <div className="text-xs text-zinc-600 space-y-1">
              {isBulkScan ? <>
                <p>🔍 Crawling sitemap to find all product pages</p>
                <p>📄 Sampling products &amp; checking Schema coverage</p>
                <p>📊 Calculating site-wide health score</p>
              </> : <>
                <p>🔍 Crawling product page &amp; reading Schema</p>
                <p>🤖 Asking ChatGPT what it knows about your products</p>
                <p>🔮 Asking Gemini to cross-validate</p>
                <p>📊 Building AI Understanding report</p>
              </>}
            </div>
            <p className="text-xs text-zinc-500 mt-4">{isBulkScan ? "May take 2-5 minutes for large stores" : "30-60 seconds for most sites"}</p>
          </div>
        )}

        {/* ═════════ SITE AUDIT RESULTS (BULK) ═══════════ */}
        {!loading && siteAudit && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
              <div className={`text-8xl font-bold tracking-tight ${siteAudit.health_score >= 70 ? "text-emerald-400" : siteAudit.health_score >= 40 ? "text-amber-400" : "text-red-400"}`}>{siteAudit.health_score || 0}</div>
              <div className="text-sm text-zinc-500 mt-1">Site Health Score</div>
              <div className="flex justify-center gap-6 mt-4 text-xs text-zinc-500">
                <span>{siteAudit.total_pages} pages found</span>
                <span>{siteAudit.pages_with_product_schema} with Product Schema</span>
                <span>{siteAudit.pages_with_faq_schema} with FAQ Schema</span>
              </div>
            </div>
            {siteAudit.top_issues?.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-lg mb-3">Top Issues Found</h3>
                <div className="space-y-2">
                  {siteAudit.top_issues.map((issue: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-zinc-300 bg-zinc-800/50 rounded-lg px-4 py-2.5">
                      <span className="text-amber-400 mt-0.5">⚠</span><span>{issue}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <Link href="/products" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition">📦 View All Products</Link>
              <Link href="/actions" className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm rounded-lg transition">⚡ Fix Issues</Link>
            </div>
            <p className="text-xs text-zinc-600 text-center">💡 Enter a specific product URL above for deep AI analysis of that single product.</p>
          </div>
        )}

        {/* ═════════ PRODUCT DEEP ANALYSIS ═══════════ */}
        {!loading && report && (
          <>
            {/* Score overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Content Quality", value: report.schema_audit.content_quality_score, sub: `${report.schema_audit.field_count}/${report.schema_audit.max_fields} schema fields` },
                { label: "AI Knowledge Score", value: report.ai_parse?.knowledge_score ?? 0, sub: `${report.ai_parse?.knowledge_dimensions?.filter(d => d.covered).length ?? 0}/${report.ai_parse?.knowledge_dimensions?.length ?? 0} dimensions covered` },
                { label: "Question Coverage", value: report.knowledge_gap?.coverage_pct ?? 0, unit: "%", sub: `${report.knowledge_gap?.covered_questions ?? 0}/${report.knowledge_gap?.total_ai_questions ?? 0} questions answered` },
              ].map((card, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                  <div className={`text-5xl font-bold ${sc(card.value)}`}>{card.value}{card.unit || ""}</div>
                  <div className="text-sm text-zinc-500 mt-1">{card.label}</div>
                  <div className="text-xs text-zinc-600 mt-1">{card.sub}</div>
                </div>
              ))}
            </div>

            {/* AI Knowledge Dimensions */}
            {report.ai_parse?.knowledge_dimensions && report.ai_parse.knowledge_dimensions.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-lg mb-4">📐 What AI Expects vs What Your Product Page Delivers</h3>
                <p className="text-xs text-zinc-500 mb-5">
                  Each dimension below is something AI agents check before recommending {report.title || domain}. Red means AI can't find it — and will skip your product.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {report.ai_parse.knowledge_dimensions.map((d, i) => (
                    <div key={i} className={`flex items-center justify-between rounded-lg p-4 border ${d.covered ? "border-emerald-800 bg-emerald-900/10" : "border-red-800/30 bg-red-900/5"}`}>
                      <div><div className="text-sm font-medium text-zinc-200">{d.label}</div><div className="text-xs text-zinc-500">{d.dimension}</div></div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${d.covered ? "bg-emerald-900/50 text-emerald-400" : "bg-red-900/50 text-red-400"}`}>
                        {d.covered ? "✓ Covered" : "✗ Missing"}
                      </span>
                    </div>
                  ))}
                </div>
                {report.ai_parse.missing_dimensions?.length > 0 && (
                  <div className="mt-4 p-4 bg-amber-900/10 border border-amber-800 rounded-lg">
                    <div className="text-sm font-medium text-amber-400 mb-2">🎯 Fix These First</div>
                    <ul className="space-y-1">{report.ai_parse.missing_dimensions.map((d, i) => (
                      <li key={i} className="text-sm text-zinc-300">• Add <span className="text-amber-400 font-medium">{d}</span> to your product page content</li>
                    ))}</ul>
                  </div>
                )}
              </div>
            )}

            {/* Schema vs AI Cross-Reference */}
            {report.ai_parse?.field_validations && report.ai_parse.field_validations.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-lg mb-4">🔬 Schema vs AI Understanding — Side by Side</h3>
                <p className="text-xs text-zinc-500 mb-5">
                  Your Schema says one thing. What does AI actually read? Mismatches here mean AI is confused about your product.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-zinc-500 text-xs border-b border-zinc-800">
                      <th className="text-left py-2 px-3">Field</th><th className="text-left py-2 px-3">Your Page</th><th className="text-left py-2 px-3">🤖 ChatGPT Reads</th><th className="text-left py-2 px-3">🔮 Gemini Reads</th>
                    </tr></thead>
                    <tbody>
                      {report.ai_parse.field_validations.map((fv, i) => (
                        <tr key={i} className="border-b border-zinc-800/50">
                          <td className="py-3 px-3 text-zinc-400 capitalize font-medium">{fv.field.replace(/_/g, " ")}</td>
                          <td className="py-3 px-3 text-zinc-500 max-w-[160px] truncate" title={fv.schema_value}>{fv.schema_value || <span className="text-zinc-700">—</span>}</td>
                          <td className="py-3 px-3">{fv.chatgpt_recognized ? <span className="text-emerald-400">{fv.chatgpt_value || "✓"}</span> : <span className="text-red-400">✗ Not found</span>}</td>
                          <td className="py-3 px-3">{fv.gemini_recognized ? <span className="text-emerald-400">{fv.gemini_value || "✓"}</span> : <span className="text-red-400">✗ Not found</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Entity Profile */}
            {report.ai_parse?.entity_profile && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-lg mb-4">🧬 How AI Agents Perceive "{report.title || domain}"</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {report.ai_parse.entity_profile.pros?.length > 0 && (<div>
                    <div className="text-xs font-medium text-zinc-500 mb-2 uppercase">✅ AI-Recognized Strengths</div>
                    <div className="flex flex-wrap gap-1.5">{report.ai_parse.entity_profile.pros.map((p,j)=><span key={j} className="text-xs bg-emerald-900/30 text-emerald-400 px-2.5 py-1 rounded border border-emerald-800/50">{p}</span>)}</div>
                  </div>)}
                  {report.ai_parse.entity_profile.cons?.length > 0 && (<div>
                    <div className="text-xs font-medium text-zinc-500 mb-2 uppercase">❌ AI-Recognized Weaknesses</div>
                    <div className="flex flex-wrap gap-1.5">{report.ai_parse.entity_profile.cons.map((c,j)=><span key={j} className="text-xs bg-red-900/30 text-red-400 px-2.5 py-1 rounded border border-red-800/50">{c}</span>)}</div>
                  </div>)}
                  {report.ai_parse.entity_profile.best_for?.length > 0 && (<div>
                    <div className="text-xs font-medium text-zinc-500 mb-2 uppercase">🎯 Best For (Use Cases AI Associates With You)</div>
                    <div className="flex flex-wrap gap-1.5">{report.ai_parse.entity_profile.best_for.map((b,j)=><span key={j} className="text-xs bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded">{b}</span>)}</div>
                  </div>)}
                  {report.ai_parse.entity_profile.alternatives?.length > 0 && (<div>
                    <div className="text-xs font-medium text-zinc-500 mb-2 uppercase">🔄 Competitors AI Recommends Instead of You</div>
                    <div className="flex flex-wrap gap-1.5">{report.ai_parse.entity_profile.alternatives.map((a,j)=><span key={j} className="text-xs bg-zinc-800 text-amber-400 px-2.5 py-1 rounded border border-amber-800/30">{a}</span>)}</div>
                  </div>)}
                </div>
                {report.ai_parse.entity_profile.price_range && (
                  <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-zinc-500">💰 Price Perception</span><div className="text-zinc-300 mt-0.5">{report.ai_parse.entity_profile.price_range}</div></div>
                    <div><span className="text-zinc-500">👥 Target Audience</span><div className="text-zinc-300 mt-0.5">{report.ai_parse.entity_profile.audience || "Not recognized"}</div></div>
                  </div>
                )}
              </div>
            )}

            {/* Knowledge Gaps */}
            {report.knowledge_gap?.gaps && report.knowledge_gap.gaps.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-lg mb-2">❓ Shopper Questions AI Answers — But Your Page Doesn't</h3>
                <p className="text-xs text-zinc-500 mb-5">
                  Shoppers ask AI {report.knowledge_gap.total_ai_questions} questions about "{report.knowledge_gap.category}". Your page covers {report.knowledge_gap.covered_questions}. Each uncovered question = AI recommending a competitor.
                </p>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {report.knowledge_gap.gaps.map((g, i) => (
                    <div key={i} className={`flex items-center justify-between rounded-lg px-4 py-2.5 border ${g.covered ? "border-emerald-800/50 bg-emerald-900/5" : "border-zinc-700 bg-zinc-800/20"}`}>
                      <div className="flex items-center gap-3"><span>{g.covered ? "✅" : "❌"}</span><span className="text-sm text-zinc-300">{g.question}</span></div>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${priorityColor(g.priority)}`}>{g.priority}</span>
                    </div>
                  ))}
                </div>
                {report.knowledge_gap.top_missing?.length > 0 && (
                  <div className="mt-5 p-4 bg-emerald-900/10 border border-emerald-800 rounded-lg">
                    <div className="text-sm font-medium text-emerald-400 mb-2">🔧 Top Questions to Add to Your Page</div>
                    <ol className="space-y-1 list-decimal pl-4">{report.knowledge_gap.top_missing.map((q, i) => (<li key={i} className="text-sm text-zinc-300">{q}</li>))}</ol>
                  </div>
                )}
              </div>
            )}

            {/* Category Attribute Reference */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="font-semibold text-lg mb-4">📂 Product Attributes AI Agents Look For</h3>
              <p className="text-xs text-zinc-500 mb-5">AI doesn't browse like a human — it matches product attributes to questions. If your page doesn't mention these, AI can't match you.</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PRODUCT_CATEGORIES).map(([cat, attrs]) => (
                  <details key={cat} className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg flex-1 min-w-[200px] group">
                    <summary className="px-4 py-3 text-sm font-medium text-zinc-300 cursor-pointer hover:text-white">{cat}</summary>
                    <div className="px-4 pb-3 space-y-1">{attrs.map(a => (
                      <div key={a} className="flex items-center gap-2 text-xs text-zinc-500"><span className="w-1 h-1 rounded-full bg-emerald-500 flex-shrink-0" />{a}</div>
                    ))}</div>
                  </details>
                ))}
              </div>
            </div>

            {/* Content Issues */}
            {report.schema_audit.content_issues?.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-lg mb-4">⚠️ Content Issues</h3>
                <div className="space-y-2">{report.schema_audit.content_issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-zinc-300 bg-zinc-800/50 rounded-lg px-4 py-2.5"><span className="text-amber-400 mt-0.5">⚠</span><span>{issue}</span></div>
                ))}</div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <Link href={`/optimize?url=${encodeURIComponent(`https://${domain}`)}`} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-center transition">
                🔧 Fix Product Schema →
              </Link>
              <Link href={`/actions?domain=${encodeURIComponent(domain)}`} className="flex-1 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-medium rounded-lg text-center transition">
                ⚡ Action Center →
              </Link>
            </div>
          </>
        )}

        {/* ═══════ EMPTY STATE ═══════ */}
        {!loading && !report && !siteAudit && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-14 text-center space-y-3">
            <div className="text-4xl">🧠</div>
            <h3 className="text-lg font-semibold text-white">Analyze Your Store</h3>
            <p className="text-zinc-400 text-sm max-w-lg mx-auto">
              <strong>Enter a domain</strong> (e.g. fashionnova.com) to scan all products and get a site-wide health score.<br />
              <strong>Or paste a product URL</strong> (e.g. .../products/...) for deep AI analysis of that single product.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
