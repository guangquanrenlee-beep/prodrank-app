"use client";

import Link from "next/link";

/* Product deep-analysis report — shared component.
   Ported from the former /knowledge-graph page; used inline on the
   Products page so one-click Analyze shows the full AI diagnosis. */

interface GapItem { question: string; covered: boolean; priority: string; }
interface SchemaField { field: string; present: boolean; value: string; note: string; }
interface AIFieldValidation { field: string; schema_value: string; chatgpt_recognized: boolean; chatgpt_value: string; gemini_recognized: boolean; gemini_value: string; }
interface EntityProfile { pros: string[]; cons: string[]; best_for: string[]; worst_for: string[]; alternatives: string[]; price_range: string; audience: string; }

export interface Report {
  url: string; title: string;
  schema_audit: { has_product_schema: boolean; has_faq_schema: boolean; field_count: number; max_fields: number; schema_fields: SchemaField[]; content_issues: string[]; content_quality_score: number; };
  ai_parse: { field_validations: AIFieldValidation[]; knowledge_dimensions: { dimension: string; label: string; covered: boolean }[]; knowledge_score: number; missing_dimensions: string[]; entity_profile: EntityProfile | null; ai_understanding: Record<string, any>; } | null;
  knowledge_gap: { category: string; total_ai_questions: number; covered_questions: number; coverage_pct: number; top_missing: string[]; gaps: GapItem[]; } | null;
}

const sc = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-amber-400" : "text-red-400";
const priorityColor = (p: string) => p === "high" ? "text-red-400 bg-red-900/20 border-red-800" : p === "medium" ? "text-amber-400 bg-amber-900/20 border-amber-800" : "text-zinc-400 bg-zinc-800 border-zinc-700";

/* Ecommerce: product attributes AI looks for */
const PRODUCT_CATEGORIES: Record<string, string[]> = {
  "Fashion": ["Material", "Fit", "Season", "Audience", "Care instructions", "Style", "Size range"],
  "Electronics": ["Battery life", "Compatibility", "Warranty", "Tech specs", "Use case", "Brand reputation"],
  "Photography": ["Lighting needs", "Mount compatibility", "Battery/AC power", "Resolution & output", "Studio vs portable", "Accessories included"],
  "Home & Kitchen": ["Material", "Warranty", "Installation", "Dimensions", "Maintenance", "Energy efficiency"],
  "Beauty": ["Ingredients", "Skin type", "Usage frequency", "Shelf life", "Allergens", "Cruelty-free"],
  "Sports": ["Terrain", "Skill level", "Material", "Weight", "Weather suitability", "Durability"],
  "Toys & Games": ["Age range", "Safety certs", "Battery required", "Number of players", "Educational value"],
  "Pet Supplies": ["Breed/size", "Age range", "Ingredients", "Safety certifications", "Maintenance", "Dietary needs"],
  "Food & Beverage": ["Ingredients", "Dietary tags", "Shelf life", "Origin", "Certifications", "Nutrition facts"],
};

/* knowledge_gap.category (backend key) → display category above */
const CATEGORY_KEY_MAP: Record<string, string> = {
  photography: "Photography",
  electronics: "Electronics",
  fashion: "Fashion",
  beauty: "Beauty",
  home: "Home & Kitchen",
  coffee: "Food & Beverage",
  sports: "Sports",
  toys: "Toys & Games",
  pet: "Pet Supplies",
  food: "Food & Beverage",
};

export default function ProductAnalysisReport({ report }: { report: Report }) {
  return (
    <div className="space-y-6">
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
            Each dimension below is something AI agents check before recommending {report.title || report.url}. Red means AI can't find it — and will skip your product.
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
          <h3 className="font-semibold text-lg mb-4">🧬 How AI Agents Perceive "{report.title || report.url}"</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {report.ai_parse.entity_profile.pros?.length > 0 && (<div>
              <div className="text-xs font-medium text-zinc-500 mb-2 uppercase">✅ AI-Recognized Strengths</div>
              <div className="flex flex-wrap gap-1.5">{report.ai_parse.entity_profile.pros.map((p, j) => <span key={j} className="text-xs bg-emerald-900/30 text-emerald-400 px-2.5 py-1 rounded border border-emerald-800/50">{p}</span>)}</div>
            </div>)}
            {report.ai_parse.entity_profile.cons?.length > 0 && (<div>
              <div className="text-xs font-medium text-zinc-500 mb-2 uppercase">❌ AI-Recognized Weaknesses</div>
              <div className="flex flex-wrap gap-1.5">{report.ai_parse.entity_profile.cons.map((c, j) => <span key={j} className="text-xs bg-red-900/30 text-red-400 px-2.5 py-1 rounded border border-red-800/50">{c}</span>)}</div>
            </div>)}
            {report.ai_parse.entity_profile.best_for?.length > 0 && (<div>
              <div className="text-xs font-medium text-zinc-500 mb-2 uppercase">🎯 Best For (Use Cases AI Associates With You)</div>
              <div className="flex flex-wrap gap-1.5">{report.ai_parse.entity_profile.best_for.map((b, j) => <span key={j} className="text-xs bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded">{b}</span>)}</div>
            </div>)}
            {report.ai_parse.entity_profile.alternatives?.length > 0 && (<div>
              <div className="text-xs font-medium text-zinc-500 mb-2 uppercase">🔄 Competitors AI Recommends Instead of You</div>
              <div className="flex flex-wrap gap-1.5">{report.ai_parse.entity_profile.alternatives.map((a, j) => <span key={j} className="text-xs bg-zinc-800 text-amber-400 px-2.5 py-1 rounded border border-amber-800/30">{a}</span>)}</div>
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
      {(() => {
        // Auto-expand + highlight the category detected for this product
        const activeCat = CATEGORY_KEY_MAP[report.knowledge_gap?.category || ""] || "";
        return (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="font-semibold text-lg mb-4">📂 Product Attributes AI Agents Look For</h3>
            <p className="text-xs text-zinc-500 mb-5">
              AI doesn't browse like a human — it matches product attributes to questions. If your page doesn't mention these, AI can't match you.
              {activeCat && <span className="text-emerald-400 font-medium"> We detected <span className="underline decoration-dotted">{activeCat}</span> — the highlighted section below is the one to focus on.</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PRODUCT_CATEGORIES).map(([cat, attrs]) => {
                const isActive = cat === activeCat;
                return (
                  <details key={cat} open={isActive}
                    className={`bg-zinc-800/30 border rounded-lg flex-1 min-w-[200px] group ${isActive ? "border-emerald-600/60 bg-emerald-900/10" : "border-zinc-700/50"}`}>
                    <summary className={`px-4 py-3 text-sm font-medium cursor-pointer hover:text-white ${isActive ? "text-emerald-400" : "text-zinc-300"}`}>
                      {cat}{isActive && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-900/60 text-emerald-400 border border-emerald-700/50">DETECTED</span>}
                    </summary>
                    <div className="px-4 pb-3 space-y-1">{attrs.map(a => (
                      <div key={a} className="flex items-center gap-2 text-xs text-zinc-500"><span className="w-1 h-1 rounded-full bg-emerald-500 flex-shrink-0" />{a}</div>
                    ))}</div>
                  </details>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Content Issues */}
      {report.schema_audit.content_issues?.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold text-lg mb-4">⚠️ Content Issues</h3>
          <div className="space-y-2">{report.schema_audit.content_issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-zinc-300 bg-zinc-800/50 rounded-lg px-4 py-2.5"><span className="text-amber-400 mt-0.5">⚠</span><span>{issue}</span></div>
          ))}</div>
        </div>
      )}

      {/* Action */}
      <div className="flex gap-3">
        <Link href={`/actions?domain=${encodeURIComponent(report.url)}`} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-center transition">
          ⚡ Action Center →
        </Link>
      </div>
    </div>
  );
}
