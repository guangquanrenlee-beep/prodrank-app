"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const MAX = 3;
const DEFAULT_FIELDS = ["description", "faq", "pros", "comparison", "use_cases", "specification", "ai_summary"];

type Step = "idle" | "resolving" | "generating" | "preview" | "history" | "publishing" | "published" | "verified" | "testing";

export default function PublishPage() {
  return <Suspense fallback={<main className="min-h-screen flex items-center justify-center bg-zinc-950"><p className="text-zinc-400">Loading…</p></main>}><PublishContent /></Suspense>;
}

function PublishContent() {
  const searchParams = useSearchParams();
  // Pre-fill from ?url= — alert "Fix in AI Studio" links land here ready to go.
  const [url, setUrl] = useState(searchParams.get("url") || "");
  const fixParam = searchParams.get("fix"); // "faq" | "content" — from report Fix links
  const [overwrite, setOverwrite] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [resolved, setResolved] = useState<any>(null); // { domain, product, has_token }
  const [preview, setPreview] = useState<Record<string, any> | null>(null);
  const [missing, setMissing] = useState<any[]>([]);
  const [subcategory, setSubcategory] = useState("");
  const [edited, setEdited] = useState<Record<string, any>>({});
  const [editField, setEditField] = useState<string | null>(null);
  const [genUsed, setGenUsed] = useState(0);
  const [genRemaining, setGenRemaining] = useState(MAX);
  const [history, setHistory] = useState<Record<string, any[]> | null>(null);
  const [result, setResult] = useState<any>(null);
  const [scanResult, setScanResult] = useState<any>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [forceFields, setForceFields] = useState<Set<string>>(new Set()); // "found" fields the merchant wants regenerated anyway

  // ── AI Recommendation Test ──
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testCategory, setTestCategory] = useState(""); // detected from product

  const apiPost = async (path: string, body: any, timeoutMs = 120000) => {
    setLoading(true); setError("");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
      const d = await r.json();
      if (!r.ok) {
        // detail can be an array of validation errors (422) or a dict —
        // String() on those yields "[object Object]", so render real JSON.
        const msg = typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail || d.message || `HTTP ${r.status}`);
        throw new Error(msg);
      }
      return d;
    } catch (e: any) {
      setError(e.name === "AbortError" ? "Request timed out — is the backend running?" : e.message);
      return null;
    }
    finally { clearTimeout(timer); setLoading(false); }
  };

  // ── Batch ──
  const [batchGroups, setBatchGroups] = useState<any>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResult, setBatchResult] = useState<any>(null);

  // Keep the port! new URL(...).hostname strips it (localhost:8081 → localhost),
  // which breaks local testing — .host preserves it (production domains have no port).
  const shopHost = () => new URL(url.startsWith("http") ? url : "https://" + url).host;

  const handleBatchGroups = async () => {
    if (!url.trim()) { setError("Enter your store URL first (any product page works)."); return; }
    setBatchLoading(true); setError("");
    const d = await apiPost("/api/batch/groups", { shop: shopHost(), platform });
    if (d) setBatchGroups(d);
    setBatchLoading(false);
  };

  const handleTemplate = async (category: string, sampleId: string) => {
    setBatchLoading(true); setError("");
    const d = await apiPost("/api/batch/generate-template", { shop: shopHost(), platform, category, sample_id: String(sampleId) });
    if (d) setBatchResult(d);
    setBatchLoading(false);
  };

  const handleApply = async (category: string) => {
    // A template must exist for this category first — apply substitutes
    // placeholders, it doesn't generate anything.
    if (batchResult?.status !== "template_drafted" || batchResult?.category !== category) {
      setError(`Generate the ${category} template first — Apply only fills in placeholders per product.`);
      return;
    }
    setBatchLoading(true); setError("");
    // Pass the exact product ids from the grouping, so apply targets the same
    // set (re-detection on apply would re-classify and skip products).
    const group = batchGroups?.groups?.find((g: any) => g.category === category);
    const ids = (group?.products || []).map((p: any) => p.id).filter(Boolean);
    // Batch apply writes to every product sequentially (~3-7s each on a cold
    // local WP) — give it a generous timeout instead of the 120s default.
    const d = await apiPost("/api/batch/apply", { shop: shopHost(), platform, category, product_ids: ids }, 300000);
    if (d) setBatchResult(d);
    setBatchLoading(false);
  };

  // ── Resolve URL ──
  const platform = url.includes("myshopify.com") ? "shopify" : url.includes("localhost") || resolved?._platform === "custom" ? "custom" : "woocommerce";

  const handleResolve = async () => {
    const isShopify = url.includes("myshopify.com");
    let d: any = null;
    if (!isShopify) {
      // Try the custom-store resolver first — connected standalone stores
      // (BaiHuoZhan etc.) resolve via /api/custom. Falls back to WooCommerce
      // when the domain isn't a connected custom store (404 → null).
      d = await apiPost("/api/custom/resolve-url", { url: url.trim() });
      if (d && d._platform === "custom") {
        setResolved({ ...d, _platform: "custom" });
        setStep("idle"); setPreview(null); setResult(null);
        setGenUsed(0); setGenRemaining(MAX);
        if (d.product?.id) loadExisting(d.domain, d.product.id, "custom");
        setError(d.has_token ? "" : "⚠ Store not connected — connect in Settings first.");
        return d;
      }
      // Not a custom store — fall through to the platform resolvers
    }
    const apiPath = isShopify
      ? "/api/shopify/resolve-url"
      : "/api/woocommerce/resolve-url";
    d = await apiPost(apiPath, { url: url.trim() });
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
    return d;
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
  const apiBase = () => resolved?._platform === "shopify" ? "/api/shopify" : resolved?._platform === "custom" ? "/api/custom" : "/api/woocommerce";
  const apiBody = () => resolved?._platform === "shopify"
    ? { shop: resolved.domain, product_id: resolved.product.id }
    : resolved?._platform === "custom"
      ? { shop: resolved.domain, product_id: resolved.product.id }
      : { domain: resolved.domain, product_id: resolved.product.id };

  /** Scan the live product page first: what info already exists (found),
   *  what's vague (fuzzy) and what's absent (missing). Only missing + fuzzy
   *  get generated — "found" fields are skipped unless the merchant opts in. */
  const handleScan = async (resolvedOverride?: any) => {
    const target = resolvedOverride || resolved;
    if (!target) return;
    setScanLoading(true); setError("");
    try {
      const r = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target.product?.url || url.trim() }) });
      const d = await r.json();
      if (!r.ok) throw new Error(typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail || "Scan failed"));
      setScanResult(d); setForceFields(new Set());
    } catch (e: any) { setError(e.message); }
    finally { setScanLoading(false); }
  };

  // "Fix in AI Studio" links (?url= + ?fix=) land here pre-filled — resolve
  // the product automatically, and when the fix targets gaps, scan the page
  // so "Generate missing" fills exactly what the report flagged.
  const autoStartRef = useRef(false);
  useEffect(() => {
    if (autoStartRef.current || !url.trim()) return;
    autoStartRef.current = true;
    (async () => {
      const d = await handleResolve();
      if (d && fixParam) handleScan(d);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleForce = (field: string) => {
    setForceFields(prev => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field); else next.add(field);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!resolved) return;
    // Skip fields the scan found on the page (unless the merchant forced them)
    const skipFields = (scanResult?.summary?.found || []).filter((f: string) => !forceFields.has(f));
    // AI generation is slow (DeepSeek reasoning model, measured 140s+ for a
    // single field) — generous timeout instead of the 120s default.
    const d = await apiPost(apiBase() + "/publish/generate", { ...apiBody(), skip_fields: skipFields }, 300000);
    if (!d) return;
    setPreview(d.preview); setEdited({});
    setMissing(d.missing || []);
    setSubcategory(d.subcategory || "");
    setGenUsed(d.generations_used || 1); setGenRemaining(d.generations_remaining ?? 2);
    setStep("preview");
  };

  const handleRegenerate = async () => {
    if (!resolved) return;
    const d = await apiPost(apiBase() + "/publish/generate",
      apiBody(), 300000);
    if (!d) return;
    setPreview(d.preview); setEdited({});
    setMissing(d.missing || []);
    setSubcategory(d.subcategory || "");
    setGenUsed(d.generations_used || 1); setGenRemaining(d.generations_remaining ?? 2);
  };

  const handlePublish = async () => {
    if (!resolved) return;
    if (Object.keys(edited).length > 0 && resolved._platform !== "custom") {
      // Custom stores have no drafts/edit endpoint yet — edited content is
      // part of the preview only; publish uses the stored draft version.
      // apiBody() sends the right key per platform (domain for WooCommerce,
      // shop for Shopify) — hardcoding shop here 422'd every WooCommerce publish.
      const editPath = resolved._platform === "shopify" ? "/api/shopify/drafts/edit" : "/api/woocommerce/drafts/edit";
      await apiPost(editPath, { ...apiBody(), fields: edited });
    }
    const d = await apiPost(apiBase() + "/publish",
      { ...apiBody(), overwrite_description: overwrite, fields: preview ? Object.keys(preview) : undefined });
    if (d) { setResult(d); setStep("published"); }
  };

  const handleVerify = async () => {
    if (!resolved) return;
    const d = await apiPost(apiBase() + "/verify",
      apiBody());
    if (d) { setResult(d); setStep("verified"); }
  };

  const handleAITest = async () => {
    if (!resolved) return;
    setTestLoading(true); setError("");
    setStep("testing");
    const brand = resolved.product?.vendor || resolved.product?.brand || resolved.domain?.split(".")[0] || "Test Brand";
    const r = await fetch("/api/test/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: resolved.domain,
        brand_name: brand,
        category: testCategory || "",
        product_id: resolved.product?.id || null,
        query_count: 30,
        models: ["deepseek"],
      }),
    });
    const d = await r.json();
    if (r.ok) setTestResult(d);
    else setError(typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail || d.message || "Test failed"));
    setTestLoading(false);
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
    ({ description: "Description", faq: "FAQ", pros: "Pros", comparison: "Comparison", use_cases: "Use Cases", buying_guide: "Buying Guide", specification: "Specifications", ai_summary: "AI Summary" }[f] || f);

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <div>
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
          <h1 className="text-3xl font-bold mt-1">AI Optimization</h1>
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

          {/* Scan — what the page already has (pre-generation decision) */}
          {resolved && !scanResult && (
            <button onClick={handleScan} disabled={scanLoading} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">
              {scanLoading ? "Scanning page…" : "🔍 Scan page first"}
            </button>
          )}
          {scanResult && (
            <div className="border border-zinc-800 rounded-xl p-4 space-y-3 bg-zinc-950/50">
              <div className="flex items-center justify-between">
                <div className="text-xs text-zinc-300 font-semibold">📋 Page scan — only <span className="text-emerald-400">missing</span> + <span className="text-amber-400">fuzzy</span> will be generated</div>
                <button onClick={() => setScanResult(null)} className="text-xs text-zinc-500 hover:text-zinc-300">✕ dismiss</button>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="space-y-1.5">
                  <div className="text-emerald-400 font-semibold">✅ Already on page ({scanResult.summary.found.length})</div>
                  {scanResult.summary.found.map((f: string) => (
                    <label key={f} className="flex items-center gap-1.5 text-zinc-400 cursor-pointer">
                      <input type="checkbox" checked={forceFields.has(f)} onChange={() => toggleForce(f)} className="accent-emerald-500" />
                      {fieldLabel(f)} <span className="text-zinc-600">(re-generate?)</span>
                    </label>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <div className="text-amber-400 font-semibold">△ Vague ({scanResult.summary.fuzzy.length})</div>
                  {scanResult.summary.fuzzy.map((f: string) => <div key={f} className="text-zinc-300">• {fieldLabel(f)}</div>)}
                </div>
                <div className="space-y-1.5">
                  <div className="text-red-400 font-semibold">✗ Missing ({scanResult.summary.missing.length})</div>
                  {scanResult.summary.missing.map((f: string) => <div key={f} className="text-zinc-300">• {fieldLabel(f)}</div>)}
                </div>
              </div>
              {scanResult.category && <p className="text-[11px] text-zinc-600">Category: {scanResult.category.key} {scanResult.subcategory ? `→ ${scanResult.subcategory}` : ""}</p>}
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
                <button onClick={handleAITest} disabled={testLoading} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">
                  {testLoading ? "Testing…" : "4 · AI Test"}
                </button>
              </>
            ) : (
              <>
                <button onClick={handleGenerate} disabled={loading || !resolved || genRemaining <= 0} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">
                  {genRemaining <= 0 ? "Limit reached" : loading ? "Generating…" : scanResult ? `1 · Generate missing (${scanResult.summary.missing.length + scanResult.summary.fuzzy.length})` : "1 · Generate Draft"}
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
              // close only when the click STARTED and ENDED on the overlay
              // itself (target === currentTarget) without dragging — clicks
              // inside the modal (buttons, field editors) must never close it
              if (e.target !== e.currentTarget) return;
              const down = (e.currentTarget as HTMLElement).dataset.down || "";
              const [x, y] = down.split(",").map(Number);
              if (x === e.clientX && y === e.clientY) setStep("idle");
            }}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-full overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between sticky top-0 bg-zinc-900 py-2 z-10 border-b border-zinc-800 pb-3">
                <div>
                  <h2 className="text-lg font-bold">{resolved?.product?.title || "Review"}</h2>
                  <p className="text-xs text-zinc-500">{resolved?.domain}{subcategory ? ` · ${subcategory}` : ""}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleRegenerate} disabled={loading || genRemaining <= 0} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 text-white text-xs rounded-lg">🔄 ({genRemaining})</button>
                  <button onClick={handleHistory} disabled={genUsed < 1} className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 text-white text-xs rounded-lg">📋</button>
                  <button onClick={handlePublish} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg">Publish →</button>
                  <button onClick={() => { setStep("idle"); setEditField(null); }} className="text-zinc-500 hover:text-zinc-300 text-xl leading-none">✕</button>
                </div>
              </div>

              {/* Mandatory review notice */}
              <div className="bg-sky-900/20 border border-sky-800 rounded-lg p-3 flex items-start gap-2">
                <span className="text-sky-400 text-lg leading-none mt-0.5">⚠️</span>
                <div>
                  <p className="text-sm text-sky-300 font-medium">Please review everything below before publishing.</p>
                  <p className="text-xs text-sky-500 mt-0.5">Check each section — edit anything that looks wrong, then publish.</p>
                </div>
              </div>

              {/* Missing fields — never fabricated, merchant decides */}
              {missing.length > 0 && (
                <div className="bg-amber-900/20 border border-amber-700 rounded-lg p-3">
                  <p className="text-sm text-amber-300 font-medium mb-2">
                    ⚠️ {missing.length} item{missing.length > 1 ? "s" : ""} could not be generated — not found in your product data (never invented).
                  </p>
                  <p className="text-xs text-amber-500 mb-2">Fill them manually, or skip — skipped sections won't appear on the page.</p>
                  <div className="space-y-1.5">
                    {missing.map((m: any) => (
                      <div key={m.field} className="flex items-center gap-2 bg-zinc-950/50 border border-amber-800/50 rounded p-2">
                        <span className="text-amber-400">⚠️</span>
                        <span className="text-xs text-zinc-300 capitalize w-32">{m.field.replace(/_/g, " ")}</span>
                        <span className="text-[10px] text-zinc-500 flex-1">{m.reason}</span>
                        <button onClick={() => startEdit(m.field)} className="text-xs text-emerald-400 hover:text-emerald-300 whitespace-nowrap">✎ Fill manually</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {genRemaining <= 0 && <p className="text-sm text-amber-400 bg-amber-900/20 border border-amber-800 rounded-lg p-3">AI limit reached. Edit manually below, then publish.</p>}
              <div className="space-y-2">
                {Object.keys(preview).filter(f => edited[f] || preview[f]).map(field => {
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

        {/* AI Recommendation Test Results */}
        {(step === "testing" || testResult) && (
          <div className="bg-zinc-900 border border-purple-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-purple-400 text-lg">🧠 AI Recommendation Test</h2>
              {testResult && (
                <button onClick={handleAITest} disabled={testLoading} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 text-white text-xs rounded-lg">
                  {testLoading ? "…" : "Re-test"}
                </button>
              )}
            </div>

            {testLoading && (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full mx-auto mb-3" />
                <p className="text-zinc-400 text-sm">Testing AI recommendations across {30} shopping queries…</p>
                <p className="text-zinc-600 text-xs mt-1">Asking DeepSeek to recommend products for each query</p>
              </div>
            )}

            {testResult && !testLoading && (
              <>
                {/* Recommendation Rate */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-purple-400">{testResult.recommendation_rate}%</div>
                    <div className="text-xs text-zinc-500 mt-1">Recommendation Rate</div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-zinc-300">{testResult.total_queries}</div>
                    <div className="text-xs text-zinc-500 mt-1">Queries Tested</div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-emerald-400">{testResult.by_model?.deepseek?.recommended || 0}</div>
                    <div className="text-xs text-zinc-500 mt-1">Times Recommended</div>
                  </div>
                </div>

                {/* Per-model breakdown */}
                {testResult.by_model && (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-500 font-medium">By Model</p>
                    {Object.entries(testResult.by_model).map(([model, data]: [string, any]) => (
                      <div key={model} className="flex items-center gap-3 bg-zinc-950 rounded-lg px-3 py-2">
                        <span className="text-sm text-zinc-300 capitalize w-20">{model}</span>
                        <div className="flex-1 bg-zinc-800 rounded-full h-3 overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${data.rate || 0}%` }} />
                        </div>
                        <span className="text-sm text-zinc-400 w-16 text-right">{data.rate || 0}%</span>
                        <span className="text-xs text-zinc-600">{data.recommended}/{data.total}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Top mentioned competitors */}
                {testResult.results && testResult.results.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 font-medium mb-2">Top Brands AI Recommended</p>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {(() => {
                        const brandCounts: Record<string, number> = {};
                        testResult.results.forEach((r: any) => {
                          (r.mentioned_brands || []).forEach((b: string) => {
                            const name = b.split(" ").slice(0, 2).join(" "); // first 2 words
                            brandCounts[name] = (brandCounts[name] || 0) + 1;
                          });
                        });
                        return Object.entries(brandCounts)
                          .sort(([, a], [, b]) => (b as number) - (a as number))
                          .slice(0, 15)
                          .map(([brand, count]) => (
                            <span key={brand} className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-400">
                              {brand} <span className="text-purple-400">×{count as number}</span>
                            </span>
                          ));
                      })()}
                    </div>
                  </div>
                )}

                {/* Sample responses */}
                <details className="text-xs">
                  <summary className="text-zinc-500 cursor-pointer hover:text-zinc-400">View sample AI responses</summary>
                  <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                    {testResult.results?.slice(0, 10).map((r: any, i: number) => (
                      <div key={i} className="bg-zinc-950 border border-zinc-800 rounded p-2">
                        <p className="text-zinc-400 font-medium">Q: {r.query}</p>
                        <p className="text-zinc-600 mt-0.5">{r.answer?.slice(0, 150) || "(no response)"}</p>
                        {r.mentioned_brands?.length > 0 && (
                          <p className="text-purple-400 mt-1">Brands: {r.mentioned_brands.slice(0, 5).join(", ")}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              </>
            )}

            {!testResult && !testLoading && (
              <div className="text-center py-6">
                <p className="text-zinc-500 text-sm">Run an AI recommendation test to see how often your brand appears in AI shopping recommendations.</p>
                <p className="text-zinc-600 text-xs mt-1">Tests {30} real shopping queries against DeepSeek — costs &lt;$0.01</p>
              </div>
            )}
          </div>
        )}

        {/* ── Batch template ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">⚡ Batch Template</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Optimize your whole catalog by category — 1 AI call per category, applied to all matching products. <span className="text-zinc-600">({"{product_name}"} / {"{price}"} / {"{brand}"} placeholders substituted per product)</span></p>
            </div>
            <button onClick={handleBatchGroups} disabled={batchLoading || !url.trim()} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">
              {batchLoading ? "…" : "Scan catalog"}
            </button>
          </div>

          {batchGroups && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">{batchGroups.total} products · {batchGroups.groups.length} categories</p>
              {batchGroups.groups.map((g: any) => (
                <div key={g.category} className="border border-zinc-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-medium text-emerald-400 capitalize">{g.label}</span>
                      <span className="text-xs text-zinc-600 ml-2">{g.products.length} products</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleTemplate(g.category, g.products[0]?.id)} disabled={batchLoading || !g.products.length}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-xs rounded-lg">
                        Generate template
                      </button>
                      <button onClick={() => handleApply(g.category)} disabled={batchLoading}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 text-white text-xs rounded-lg">
                        Apply to {g.products.length}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {g.products.slice(0, 8).map((p: any) => (
                      <span key={p.id} className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-400">{p.title.slice(0, 20)}</span>
                    ))}
                    {g.products.length > 8 && <span className="text-[10px] text-zinc-600 px-1 py-0.5">+{g.products.length - 8} more</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {batchResult && (
            <div className="bg-zinc-950 border border-emerald-800 rounded-lg p-4">
              <pre className="text-xs text-emerald-300 whitespace-pre-wrap max-h-60 overflow-y-auto">{JSON.stringify(batchResult, null, 2)}</pre>
            </div>
          )}
        </div>
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
