"use client";

import { useState } from "react";
import Link from "next/link";

export default function InjectGuidePage() {
  const [site, setSite] = useState("yoursite.com");
  const code = `<script async src="https://prodrank.app/api/inject.js" data-site="${site}"></script>`;
  const [copied, setCopied] = useState(false);

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div>
        <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
        <h1 className="text-3xl font-bold mt-2">Install inject.js</h1>
        <p className="text-zinc-400">One line of code — auto-injects JSON-LD Schema on all product pages. Works on <strong>any</strong> platform.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6">
        <h2 className="font-semibold">Step 1: Enter your domain</h2>
        <input type="text" value={site} onChange={(e) => setSite(e.target.value)} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Step 2: Copy this code</h2>
        <div className="bg-zinc-950 rounded-lg p-4 relative">
          <code className="text-emerald-400 text-sm break-all">{code}</code>
          <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="absolute top-2 right-2 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 rounded transition">{copied ? "Copied!" : "Copy"}</button>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Step 3: Paste into your site template</h2>
        <p className="text-sm text-zinc-400">Paste the code just before <code className="text-zinc-300">&lt;/head&gt;</code> or anywhere in your site&apos;s global template/footer. It works like Google Analytics.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="font-medium text-zinc-200 mb-1">Shopify</div>
            <div className="text-zinc-500">Online Store → Themes → Edit code → theme.liquid → paste before &lt;/head&gt;</div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="font-medium text-zinc-200 mb-1">WordPress</div>
            <div className="text-zinc-500">Appearance → Theme Editor → header.php → paste before &lt;/head&gt;</div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="font-medium text-zinc-200 mb-1">Any other site</div>
            <div className="text-zinc-500">Global layout/template → paste before &lt;/head&gt;</div>
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="font-semibold mb-2">What happens after install</h2>
        <ul className="space-y-2 text-sm text-zinc-400">
          <li>✅ Detects product pages automatically</li>
          <li>✅ Extracts title, price, images, SKU, brand from your page</li>
          <li>✅ Injects complete Product + FAQ + Organization JSON-LD Schema</li>
          <li>✅ No code changes to individual product pages</li>
          <li>✅ New products get Schema automatically — zero maintenance</li>
          <li>✅ Silent ping to ProdRank — we track your Schema coverage</li>
        </ul>
      </div>

      <div className="bg-emerald-900/20 border border-emerald-800 rounded-xl p-4 text-center">
        <p className="text-sm text-emerald-400">Need help? <a href="mailto:support@prodrank.app" className="underline">Contact support</a> — we&apos;ll help you install it in 5 minutes.</p>
      </div>
    </main>
  );
}
