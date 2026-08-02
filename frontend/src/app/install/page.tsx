"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Install your store — onboarding wizard.
 *  🛒 Shopify: enter store domain → OAuth install link
 *  📝 WordPress: download plugin zip + install steps + token guide
 */
export default function InstallPage() {
  const [shopDomain, setShopDomain] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installUrl, setInstallUrl] = useState("");
  const [error, setError] = useState("");

  const handleShopifyInstall = async () => {
    const d = shopDomain.trim().replace(/^https?:\/\//, "").split("/")[0];
    if (!d) { setError("Enter your store domain first."); return; }
    setInstalling(true); setError("");
    try {
      const r = await fetch(`/api/shopify/install?shop=${encodeURIComponent(d)}`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || "Install failed");
      setInstallUrl(data.install_url);
      window.location.href = data.install_url;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setInstalling(false);
    }
  };

  const ZIP_URL = "/downloads/prodrank-ai-seo.zip";

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <div>
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
          <h1 className="text-3xl font-bold mt-1">Install your store</h1>
          <p className="text-zinc-500 text-sm mt-1">Choose your platform. After installing, connect your store in Settings and start optimizing in AI Studio.</p>
        </div>

        {/* Shopify */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛒</span>
            <div>
              <h2 className="font-semibold text-lg">Shopify</h2>
              <p className="text-xs text-zinc-500">Install the ProdRank App via Shopify OAuth — one click, all products get Schema automatically.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              value={shopDomain}
              onChange={e => { setShopDomain(e.target.value); setError(""); }}
              placeholder="yourstore.myshopify.com"
              className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={handleShopifyInstall}
              disabled={installing || !shopDomain.trim()}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">
              {installing ? "Redirecting…" : "Install App →"}
            </button>
          </div>
          {installUrl && <p className="text-xs text-zinc-500">If nothing happened, <a href={installUrl} className="text-emerald-400 underline">open this link</a>.</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        {/* WordPress */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📝</span>
            <div>
              <h2 className="font-semibold text-lg">WordPress / WooCommerce</h2>
              <p className="text-xs text-zinc-500">Download the plugin, upload it to your site. Server-side Schema injection, Yoast/RankMath compatible.</p>
            </div>
          </div>
          <a
            href={ZIP_URL}
            download
            className="inline-block px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition">
            ⬇ Download Plugin (v0.2.0)
          </a>

          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-2 text-sm text-zinc-300">
            <div className="font-semibold text-zinc-200">Install steps</div>
            <ol className="list-decimal pl-5 space-y-1 text-xs text-zinc-400">
              <li>Download the zip above</li>
              <li>WordPress admin → <strong>Plugins → Add New → Upload Plugin</strong> → choose the zip → Install → Activate</li>
              <li>Go to <strong>WooCommerce → ProdRank SEO</strong> — copy the API token</li>
              <li>Back here → <Link href="/settings" className="text-emerald-400 underline">Settings → WordPress / WooCommerce</Link> → paste token → Connect</li>
              <li>Go to <Link href="/studio" className="text-emerald-400 underline">AI Studio</Link> → paste a product URL → Generate → Review → Publish</li>
            </ol>
            <p className="text-xs text-zinc-600 pt-1">Tip: to display AI content (FAQ, Pros/Cons…) on the product page, add the shortcode like <code className="bg-zinc-800 px-1 rounded">[prodrank_faq]</code> to your product template or use the ProdRank AI Content Gutenberg block.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
