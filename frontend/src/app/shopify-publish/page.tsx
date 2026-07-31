"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * ⑥ One-click Publish — Dashboard entry for both store platforms:
 *
 *   Shopify:     shop + product_id → Generate (AI draft) → Publish (metafields) → Verify
 *   WooCommerce: domain + API token → Connect → Generate → Publish (post meta) → Verify
 *
 * The backend resolves Shopify tokens from the sites table; WooCommerce tokens
 * are stored on Connect. This page never handles credentials beyond that.
 */
export default function ShopifyPublishPage() {
  const [tab, setTab] = useState<"shopify" | "woocommerce">("shopify");
  const [shop, setShop] = useState("");
  const [productId, setProductId] = useState("");
  const [domain, setDomain] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"idle" | "drafted" | "published" | "verified">("idle");
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const post = async (path: string, body: any) => {
    setLoading(true); setError("");
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || d.message || "Request failed");
      return d;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const pid = Number(productId);
  const base = tab === "shopify"
    ? { shop: shop.trim(), product_id: pid }
    : { domain: domain.trim(), product_id: pid };

  const handleConnect = async () => {
    const d = await post("/api/woocommerce/connect", { domain: domain.trim(), api_token: apiToken.trim() });
    if (d) { setResult(d); setError(""); }
  };

  const handleGenerate = async () => {
    const path = tab === "shopify" ? "/api/shopify/publish/generate" : "/api/woocommerce/publish/generate";
    const d = await post(path, base);
    if (d) { setPreview(d.preview); setResult(d); setStep("drafted"); }
  };

  const handlePublish = async () => {
    const path = tab === "shopify" ? "/api/shopify/publish" : "/api/woocommerce/publish";
    const d = await post(path, { ...base, overwrite_description: overwrite });
    if (d) { setResult(d); setStep("published"); }
  };

  const handleVerify = async () => {
    const path = tab === "shopify" ? "/api/shopify/verify" : "/api/woocommerce/verify";
    const d = await post(path, base);
    if (d) { setResult(d); setStep("verified"); }
  };

  const ready = tab === "shopify" ? (shop && pid) : (domain && pid);

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div>
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
          <h1 className="text-3xl font-bold mt-1">🚀 One-click Publish</h1>
          <p className="text-zinc-500 text-sm mt-1">Generate AI content → review → publish → verify on the live page. <span className="text-zinc-600">(Content boundaries: docs/product-content-boundaries.md)</span></p>
        </div>

        <div className="flex gap-2">
          {(["shopify", "woocommerce"] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setStep("idle"); setPreview(null); setResult(null); setError(""); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
              {t === "shopify" ? "🛒 Shopify" : "📝 WooCommerce"}
            </button>
          ))}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          {tab === "shopify" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Shopify store</label>
                <input value={shop} onChange={e => setShop(e.target.value)} placeholder="yourstore.myshopify.com"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Product ID</label>
                <input value={productId} onChange={e => setProductId(e.target.value)} placeholder="1234567890"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Store domain</label>
                  <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourstore.com"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Plugin API token</label>
                  <input value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder="from WooCommerce → ProdRank SEO"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <button onClick={handleConnect} disabled={loading || !domain || !apiToken}
                className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">
                🔗 Connect Store
              </button>
            </>
          )}

          {tab === "shopify" && (
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} className="accent-emerald-500" />
              Overwrite the original product description with the AI version
              <span className="text-zinc-600 text-xs">(opt-in only — everything else stays in metafields)</span>
            </label>
          )}

          <div className="flex gap-3">
            <button onClick={handleGenerate} disabled={loading || !ready}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">1 · Generate Draft</button>
            <button onClick={handlePublish} disabled={loading || step !== "drafted"}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">2 · Publish</button>
            <button onClick={handleVerify} disabled={loading || step !== "published"}
              className="px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 text-white text-sm font-medium rounded-lg transition">3 · Verify</button>
          </div>
          {error && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-3">{error}</p>}
        </div>

        {preview && step === "drafted" && (
          <div className="bg-zinc-900 border border-emerald-800 rounded-xl p-5">
            <h2 className="font-semibold text-emerald-400 mb-3">Generated Preview (draft only — nothing published)</h2>
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
              {Object.entries(preview).map(([field, content]: any) => (
                <div key={field} className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                  <div className="text-xs font-bold text-emerald-400 uppercase mb-2">{field}</div>
                  <pre className="text-xs text-zinc-300 whitespace-pre-wrap">{JSON.stringify(content, null, 1).slice(0, 1200)}</pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {result && step !== "drafted" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="font-semibold mb-3">{step === "verified" ? "✅ Verification" : "📦 Publish result"}</h2>
            <pre className="text-xs text-zinc-300 whitespace-pre-wrap max-h-96 overflow-y-auto">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </div>
    </main>
  );
}
