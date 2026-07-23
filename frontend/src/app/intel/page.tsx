"use client";

import { useState } from "react";

interface IntelReport {
  url: string;
  title: string;
  schema_audit: {
    has_product_schema: boolean;
    has_faq_schema: boolean;
    field_count: number;
    max_fields: number;
    schema_fields: { field: string; present: boolean; value: string | null; note: string }[];
    content_issues: string[];
    content_quality_score: number;
  };
  ai_parse: {
    field_validations: { field: string; chatgpt_recognized: boolean | null; chatgpt_value: string; gemini_recognized: boolean | null; gemini_value: string }[] | null;
    knowledge_dimensions: { dimension: string; label: string; covered: boolean }[];
    knowledge_score: number;
    missing_dimensions: string[];
    entity_profile: { pros: string[]; cons: string[]; best_for: string; worst_for: string; alternatives: string[]; price_range: string; audience: string } | null;
    ai_understanding: Record<string, string>;
  } | null;
  knowledge_gap: {
    category: string;
    total_ai_questions: number;
    covered_questions: number;
    coverage_pct: number;
    top_missing: string[];
    gaps: { question: string; covered: boolean; priority: string }[];
  } | null;
}

function ScoreBadge({ score, max = 100 }: { score: number; max?: number }) {
  const pct = (score / max) * 100;
  const color = pct >= 70 ? "text-emerald-400" : pct >= 40 ? "text-yellow-400" : "text-red-400";
  return <span className={`text-2xl font-bold ${color}`}>{score}</span>;
}

export default function IntelPage() {
  const [url, setUrl] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<IntelReport | null>(null);
  const [error, setError] = useState("");

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true); setError(""); setData(null);

    try {
      const res = await fetch("/api/intel/full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, brand, category }),
      });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-4 py-12 space-y-8">
      <div>
        <a href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Back</a>
        <h1 className="text-3xl font-bold mt-2">AI Commerce Intelligence</h1>
        <p className="text-zinc-400">Full audit: Schema, AI understanding, knowledge gaps, entity profile</p>
      </div>

      <form onSubmit={handleScan} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Product URL *" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Brand (optional)" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category (e.g. winter jackets)" className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <button type="submit" disabled={loading || !url.trim()} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition">
          {loading ? "Scanning..." : "Run Intelligence Report"}
        </button>
      </form>

      {error && <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-400 text-sm">{error}</div>}

      {data && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">{data.title || url}</h2>

          {/* Score Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ScoreCard label="Schema Fields" value={`${data.schema_audit.field_count}/${data.schema_audit.max_fields}`} />
            <ScoreCard label="Content Score" value={`${data.schema_audit.content_quality_score}`} />
            {data.ai_parse && <ScoreCard label="Knowledge Score" value={`${data.ai_parse.knowledge_score}`} />}
            {data.knowledge_gap && <ScoreCard label="Question Coverage" value={`${data.knowledge_gap.coverage_pct}%`} />}
          </div>

          {/* AI Understanding Diff */}
          {data.ai_parse?.ai_understanding && (
            <Section title="How AI Agents See This Product">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(data.ai_parse.ai_understanding).map(([agent, desc]) => (
                  <div key={agent} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="text-sm font-medium text-zinc-400 capitalize mb-2">{agent}</div>
                    <p className="text-sm text-zinc-300">{desc}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Knowledge Dimensions */}
          {data.ai_parse?.knowledge_dimensions && data.ai_parse.knowledge_dimensions.length > 0 && (
            <Section title="Knowledge Coverage (5W1H)">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {data.ai_parse.knowledge_dimensions.map(kd => (
                  <div key={kd.dimension} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${kd.covered ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/20 text-red-400"}`}>
                    <span>{kd.covered ? "✅" : "❌"}</span>
                    <span>{kd.label}</span>
                  </div>
                ))}
              </div>
              {data.ai_parse.missing_dimensions.length > 0 && (
                <p className="text-sm text-zinc-500 mt-2">Missing: {data.ai_parse.missing_dimensions.join(", ")}</p>
              )}
            </Section>
          )}

          {/* Entity Profile */}
          {data.ai_parse?.entity_profile && (
            <Section title="AI Entity Profile">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <EntityBlock label="Pros" items={data.ai_parse.entity_profile.pros} color="text-emerald-400" />
                <EntityBlock label="Cons" items={data.ai_parse.entity_profile.cons} color="text-red-400" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
                <MiniCard label="Best For" value={data.ai_parse.entity_profile.best_for || "—"} />
                <MiniCard label="Worst For" value={data.ai_parse.entity_profile.worst_for || "—"} />
                <MiniCard label="Price Range" value={data.ai_parse.entity_profile.price_range || "—"} />
                <MiniCard label="Audience" value={data.ai_parse.entity_profile.audience || "—"} />
              </div>
              {data.ai_parse.entity_profile.alternatives.length > 0 && (
                <p className="text-sm text-zinc-500 mt-2">
                  AI considers alternatives: {data.ai_parse.entity_profile.alternatives.join(", ")}
                </p>
              )}
            </Section>
          )}

          {/* Question Gaps */}
          {data.knowledge_gap && data.knowledge_gap.gaps.length > 0 && (
            <Section title={`Question Gap — ${data.knowledge_gap.category}`}>
              <p className="text-sm text-zinc-400 mb-3">
                AI answers {data.knowledge_gap.total_ai_questions} questions about this category.
                Your page covers {data.knowledge_gap.covered_questions} ({data.knowledge_gap.coverage_pct}%).
              </p>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {data.knowledge_gap.top_missing.map((q, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm bg-red-900/10 border border-red-900/30 rounded-lg px-3 py-2">
                    <span className="text-red-400 mt-0.5">✗</span>
                    <span className="text-zinc-300">{q}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Schema Issues */}
          {data.schema_audit.content_issues.length > 0 && (
            <Section title="Content Issues">
              <div className="space-y-1">
                {data.schema_audit.content_issues.map((issue, i) => (
                  <div key={i} className="text-sm text-yellow-400">⚠ {issue}</div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      {children}
    </section>
  );
}

function ScoreCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
      <div className="text-2xl font-bold text-emerald-400">{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}

function EntityBlock({ label, items, color }: { label: string; items: string[]; color: string }) {
  return (
    <div>
      <div className={`text-sm font-medium mb-2 ${color}`}>{label}</div>
      {items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
              <span className={color}>•</span> {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">No data</p>
      )}
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-sm text-zinc-300 mt-0.5">{value}</div>
    </div>
  );
}
