"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const MAX = 3;
const DEFAULT_FIELDS = ["description", "faq", "pros", "cons", "comparison", "use_cases", "specification", "ai_summary"];

type Step = "idle" | "resolving" | "generating" | "preview" | "history" | "publishing" | "published" | "verified";

export default function PublishPage() {
  const [url, setUrl] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [resolved, setResolved] = useState<any>(null); // { domain, product, has_token }
  const [preview, setPreview] = useState<Record<string, any> | null>(null);
  const [edited, setEdited] = useState<Record<string, any>>({});
  const [editField, setEditField] = useState<string | null>(null);
  const [genUsed, setGenUsed] = useState(0);
  const [genRemaining, setGenRemaining] = useState(MAX);
  const [history, setHistory] = useState<Record<string, any[]> | null>(null);
  const [result, setResult] = useState<any>(null);

  const apiPost = async (path: string, body: any) => {
    setLoading(true); setError("");
    try {
      const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || d.message || `HTTP ${r.status}`);
      return d;
    } catch (e: any) { setError(e.message); return null; }
    finally { setLoading(false); }
  };

  // ── Resolve URL ──
  const platform = url.includes("myshopify.com") ? "shopify" : "woocommerce";

  const handleResolve = async () => {
    const apiPath = platform === "shopify"
      ? "/api/shopify/resolve-url"
      : "/api/woocommerce/resolve-url";
    const d = await apiPost(apiPath, { url: url.trim() });
    if (!d) return;
    setResolved({ ...d, _platform: platform });
    setStep("idle"); setPreview(null); setResult(null);
    setGenUsed(0); setGenRemaining(MAX);
    // Load any existing generations + generation count
    if (d.product?.id) {
      loadExisting(d.domain, d.product.id, platform);
    }
    if (!d.has_token) setError("⚠ Store not connected — connect in Settings first.");
    else setError("");
  };

  const loadExisting = async (domain: string, pid: string | number, pf: string) => {
    try {
      const qp = pf === "shopify" ? `shop=${domain}` : `domain=${domain}`;
      const r = await fetch(`/api/${pf === "shopify" ? "shopify" : "woocommerce"}/drafts/count?${qp}&product_id=${pid}`);
      const c = await r.json();
      setGenUsed(c.generations_used || 0);
      setGenRemaining(c.generations_remaining ?? MAX);
    } catch { /* ignore */ }
  };

  /** Load the latest generated content (already drafted) into preview mode —
   *  usable even at the 3-generation limit (edit + publish still allowed). */
  const handleLoadExisting = async () => {
    if (!resolved) return;
    try {
      const qp = resolved._platform === "shopify" ? `shop=${resolved.domain}` : `domain=${resolved.domain}`;
      const r = await fetch(apiBase() + `/drafts?${qp}&product_id=${resolved.product.id}`);
      const d = await r.json();
      const hist = d.history || {};
      const latest: Record<string, any> = {};
      for (const [field, versions] of Object.entries(hist) as any) {
        if (versions?.length) latest[field] = versions[0].content;
      }
      if (Object.keys(latest).length === 0) {
        setError("No generated content yet — click Generate Draft.");
        return;
      }
      setPreview(latest); setEdited({});
      setStep("preview");
    } catch (e: any) { setError(e.message); }
  };

  // ── Generate ──
  const apiBase = () => resolved?._platform === "shopify" ? "/api/shopify" : "/api/woocommerce";
  const apiBody = () => resolved?._platform === "shopify"
    ? { shop: resolved.domain, product_id: resolved.product.id }
    : { domain: resolved.domain, product_id: resolved.product.id };

  const handleGenerate = async () => {
    if (!resolved) return;
    const d = await apiPost(apiBase() + "/publish/generate", apiBody());
    if (!d) return;
    setPreview(d.preview); setEdited({});
    setGenUsed(d.generations_used || 1); setGenRemaining(d.generations_remaining ?? 2);
    setStep("preview");
  };

  const handleRegenerate = async () => {
    if (!resolved) return;
    const d = await apiPost(apiBase() + "/publish/generate",
      apiBody());
    if (!d) return;
    setPreview(d.preview); setEdited({});
    setGenUsed(d.generations_used || 1); setGenRemaining(d.generations_remaining ?? 2);
  };

  const handlePublish = async () => {
    if (!resolved) return;
    if (Object.keys(edited).length > 0) {
      const editPath = resolved._platform === "shopify" ? "/api/shopify/drafts/edit" : "/api/woocommerce/drafts/edit";
      await apiPost(editPath, { shop: resolved.domain, product_id: resolved.product.id, fields: edited });
    }
    const d = await apiPost(apiBase() + "/publish",
      { shop: resolved.domain, product_id: resolved.product.id, overwrite_description: overwrite, fields: DEFAULT_FIELDS });
    if (d) { setResult(d); setStep("published"); }
  };

  const handleVerify = async () => {
    if (!resolved) return;
    const d = await apiPost(apiBase() + "/verify",
      apiBody());
    if (d) { setResult(d); setStep("verified"); }
  };

  const handleHistory = async () => {
    if (!resolved) return;
    try {
      const qp = resolved._platform === "shopify" ? `shop=${resolved.domain}` : `domain=${resolved.domain}`;
      const r = await fetch(apiBase() + `/drafts?${qp}&product_id=${resolved.product.id}`);
      setHistory((await r.json()).history || {});
      setStep("history");
    } catch (e: any) { setError(e.message); }
  };

  // ── Edit ──
  const startEdit = (field: string) => {
    setEditField(field);
    setEdited(prev => ({ ...prev, [field]: JSON.parse(JSON.stringify(preview?.[field] || {})) }));
  };
  const cancelEdit = () => setEditField(null);
  const saveEdit = () => { setEditField(null); if (editField) setPreview(prev => prev ? { ...prev, [editField]: edited[editField] } : prev); };
  const editValue = (field: string, path: string[], value: string) => {
    setEdited(prev => {
      const copy = JSON.parse(JSON.stringify(prev[field] || preview?.[field] || {}));
      let node = copy; for (let i = 0; i < path.length - 1; i++) node = node[path[i]] || (node[path[i]] = {});
      node[path[path.length - 1]] = value;
      return { ...prev, [field]: copy };
    });
  };

  const fieldLabel = (f: string) =>
    ({ description: "Description", faq: "FAQ", pros: "Pros", cons: "Cons", comparison: "Comparison", use_cases: "Use Cases", buying_guide: "Buying Guide", specification: "Specifications", ai_summary: "AI Summary" }[f] || f);

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <div>
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
          <h1 className="text-3xl font-bold mt-1">AI Content Studio</h1>
          <p className="text-zinc-500 text-sm mt-1">Paste a product URL → AI generates → you review & publish. <span className="text-zinc-600">Max {MAX} generations per product. Connect your store in Settings first.</span></p>
        </div>

        {/* URL input */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Product page URL</label>
            <div className="flex gap-2">
              <input value={url} onChange={e => { setUrl(e.target.value); setResolved(null); setPreview(null); }} placeholder="https://yourstore.com/product/backpack/" className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <button onClick={handleResolve} disabled={loading || !url.trim()} className="px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">
                {loading ? "…" : "Resolve"}
              </button>
            </div>
          </div>

          {resolved && (
            <div className="flex items-center gap-4 text-xs text-zinc-400 flex-wrap">
              <span>📦 <strong className="text-zinc-200">{resolved.product.title}</strong></span>
              {resolved.product.price && <span>💰 {resolved.product.price}</span>}
              <span>🏪 {resolved.domain}</span>
              <span>{resolved.has_token ? "✅ Connected" : "⚠ No token"}</span>
            </div>
          )}

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} className="accent-emerald-500" />
              Overwrite original description <span className="text-zinc-600 text-xs">(opt-in)</span>
            </label>
            <span className="text-xs text-zinc-500">AI: {genUsed}/{MAX}</span>
          </div>

          <div className="flex gap-3">
            {step === "preview" ? (
              <>
                <button onClick={handleRegenerate} disabled={loading || genRemaining <= 0} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">
                  🔄 Regenerate ({genRemaining})
                </button>
                <button onClick={handleHistory} disabled={genUsed < 1} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 text-white text-sm font-medium rounded-lg transition">
                  📋 History
                </button>
                <button onClick={handlePublish} disabled={loading} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">
                  2 · Publish →
                </button>
                <button onClick={handleVerify} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg transition">
                  3 · Verify
                </button>
              </>
            ) : (
              <>
                <button onClick={handleGenerate} disabled={loading || !resolved || genRemaining <= 0} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">
                  {genRemaining <= 0 ? "Limit reached" : loading ? "Generating…" : "1 · Generate Draft"}
                </button>
                {genRemaining <= 0 && genUsed > 0 && (
                  <button onClick={handleLoadExisting} disabled={loading} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition">
                    ✍️ Edit existing content
                  </button>
                )}
              </>
            )}
          </div>
          {genRemaining <= 0 && step === "preview" && (
            <p className="text-sm text-amber-400">⚠ Generation limit reached. You can still edit and publish the existing draft.</p>
          )}
          {error && <p className={`text-sm p-3 rounded-lg ${error.startsWith("⚠") ? "text-amber-400 bg-amber-900/20 border border-amber-800" : error.startsWith("✅") ? "text-emerald-400 bg-emerald-900/20 border border-emerald-800" : "text-red-400 bg-red-900/20 border border-red-800"}`}>{error}</p>}
        </div>

        {/* Preview Modal */}
        {step === "preview" && preview && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-10 overflow-auto bg-black/70"
            onMouseDown={e => { (e.currentTarget as HTMLElement).dataset.down = `${e.clientX},${e.clientY}`; }}
            onMouseUp={e => {
              const down = (e.currentTarget as HTMLElement).dataset.down || "";
              const [x, y] = down.split(",").map(Number);
              // close only on a stationary click — dragging to select text must not close
              if (x === e.clientX && y === e.clientY) setStep("idle");
            }}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-full overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between sticky top-0 bg-zinc-900 py-2 z-10 border-b border-zinc-800 pb-3">
                <div>
                  <h2 className="text-lg font-bold">{resolved?.product?.title || "Review"}</h2>
                  <p className="text-xs text-zinc-500">{resolved?.domain}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleRegenerate} disabled={loading || genRemaining <= 0} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 text-white text-xs rounded-lg">🔄 ({genRemaining})</button>
                  <button onClick={handleHistory} disabled={genUsed < 1} className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 text-white text-xs rounded-lg">📋</button>
                  <button onClick={handlePublish} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg">Publish →</button>
                  <button onClick={() => { setStep("idle"); setEditField(null); }} className="text-zinc-500 hover:text-zinc-300 text-xl leading-none">✕</button>
                </div>
              </div>
              {genRemaining <= 0 && <p className="text-sm text-amber-400 bg-amber-900/20 border border-amber-800 rounded-lg p-3">AI limit reached. Edit manually below, then publish.</p>}
              <div className="space-y-2">
                {DEFAULT_FIELDS.filter(f => edited[f] || preview[f]).map(field => {
                  const data = edited[field] || preview[field];
                  return (
                    <div key={field} className="border border-zinc-800 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/50">
                        <span className="text-xs font-bold text-emerald-400 uppercase">{fieldLabel(field)}</span>
                        {editField === field ? (
                          <div className="flex gap-2"><button onClick={saveEdit} className="text-xs text-emerald-400">Save</button><button onClick={cancelEdit} className="text-xs text-zinc-500">Cancel</button></div>
                        ) : (
                          <button onClick={() => startEdit(field)} className="text-xs text-zinc-500 hover:text-emerald-400">✎ Edit</button>
                        )}
                      </div>
                      <div className="p-4 text-sm text-zinc-300">
                        {editField === field ? <FieldEditor field={field} data={data} editValue={editValue} /> : <FieldPreview field={field} data={data} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* History Modal */}
        {step === "history" && history && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-10 overflow-auto bg-black/70"
            onMouseDown={e => { (e.currentTarget as HTMLElement).dataset.down = `${e.clientX},${e.clientY}`; }}
            onMouseUp={e => {
              const down = (e.currentTarget as HTMLElement).dataset.down || "";
              const [x, y] = down.split(",").map(Number);
              if (x === e.clientX && y === e.clientY) setStep("preview");
            }}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-full overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between"><h2 className="text-lg font-bold">History</h2><button onClick={() => setStep("preview")} className="text-zinc-500 hover:text-zinc-300 text-xl">✕</button></div>
              {Object.entries(history).map(([field, versions]: any) => (
                <div key={field} className="border border-zinc-800 rounded-lg p-3">
                  <div className="text-xs font-bold text-emerald-400 uppercase mb-2">{fieldLabel(field)}</div>
                  {versions.slice(0, 3).map((v: any, i: number) => (
                    <details key={i} className="mb-1">
                      <summary className="text-xs text-zinc-400 cursor-pointer">v{v.version} — {v.provenance?.human_edited ? "✎ edited" : "🤖 AI"} — {v.created_at?.slice(0, 10)}</summary>
                      <pre className="text-xs text-zinc-500 mt-1 pl-4 border-l border-zinc-700 whitespace-pre-wrap">{JSON.stringify(v.content, null, 1).slice(0, 600)}</pre>
                    </details>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Result */}
        {(step === "published" || step === "verified") && result && (
          <div className="bg-zinc-900 border border-emerald-800 rounded-xl p-5">
            <h2 className="font-semibold text-emerald-400 mb-3">{step === "verified" ? "✅ Verified" : "📦 Published"}</h2>
            <pre className="text-xs text-zinc-300 whitespace-pre-wrap max-h-80 overflow-y-auto">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </div>
    </main>
  );
}

// ── Sub-components ──

function FieldPreview({ field, data }: { field: string; data: any }) {
  if (!data) return <span className="text-zinc-600 italic">empty</span>;
  if (field === "description" || field === "ai_summary") return <div className="text-zinc-300 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: data.html || "" }} />;
  if (field === "faq" && data.questions) return <div className="space-y-2">{data.questions.slice(0, 3).map((q: any, i: number) => <details key={i}><summary className="text-sm cursor-pointer">{q.question}</summary><p className="text-xs text-zinc-500 mt-1">{q.answer}</p></details>)}<p className="text-xs text-zinc-600 mt-1">+{data.questions.length - 3} more</p></div>;
  if (field === "pros" || field === "cons") return <ul className="list-disc pl-4 text-sm space-y-1">{data.items?.map((item: string, i: number) => <li key={i}>{item}</li>)}</ul>;
  if (field === "comparison") return <div className="overflow-x-auto"><table className="text-xs w-full"><thead><tr className="border-b border-zinc-700"><th className="text-left py-1 pr-2">This product</th><th className="text-left py-1">{data.competitor || "Competitor"}</th></tr></thead><tbody>{data.rows?.map((r: any, i: number) => <tr key={i} className="border-b border-zinc-800"><td className="py-1 pr-2">{r.ours}</td><td className="py-1">{r.typical}</td></tr>)}</tbody></table></div>;
  if (field === "use_cases" || field === "specification") return <div className="space-y-2 text-sm">{data.items?.map((item: any, i: number) => <div key={i}><span className="font-medium text-zinc-200">{item.title || item.name}</span><span className="text-zinc-500"> — {item.description || item.value}</span></div>)}</div>;
  return <pre className="text-xs text-zinc-500 whitespace-pre-wrap">{JSON.stringify(data, null, 1).slice(0, 400)}</pre>;
}

function FieldEditor({ field, data, editValue }: { field: string; data: any; editValue: (f: string, path: string[], v: string) => void }) {
  if (field === "description" || field === "ai_summary") return (
    <div className="space-y-2">
      <input value={data?.title || ""} onChange={e => editValue(field, ["title"], e.target.value)} className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm" placeholder="Title" />
      <textarea rows={5} value={data?.html || ""} onChange={e => editValue(field, ["html"], e.target.value)} className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm font-mono" />
    </div>
  );
  if (field === "faq") return <div className="space-y-2">{data?.questions?.map((q: any, i: number) => (
    <div key={i} className="border border-zinc-800 rounded p-2">
      <input value={q.question} onChange={e => editValue(field, ["questions", String(i), "question"], e.target.value)} className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm mb-1" />
      <textarea rows={2} value={q.answer} onChange={e => editValue(field, ["questions", String(i), "answer"], e.target.value)} className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm" />
    </div>
  ))}</div>;
  if (field === "pros" || field === "cons") return <div className="space-y-1">{data?.items?.map((item: string, i: number) => (
    <input key={i} value={item} onChange={e => editValue(field, ["items", String(i)], e.target.value)} className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm" />
  ))}</div>;
  if (field === "comparison") return <div className="space-y-1">{(data?.rows || []).map((r: any, i: number) => (
    <div key={i} className="flex gap-2"><input value={r.ours} onChange={e => editValue(field, ["rows", String(i), "ours"], e.target.value)} className="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm" /><input value={r.typical} onChange={e => editValue(field, ["rows", String(i), "typical"], e.target.value)} className="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm" /></div>
  ))}</div>;
  return <textarea rows={8} value={JSON.stringify(data, null, 2)} onChange={e => { try { const parsed = JSON.parse(e.target.value); editValue(field, [], parsed); } catch { /* ignore malformed JSON */ } }} className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-xs font-mono" />;
}
