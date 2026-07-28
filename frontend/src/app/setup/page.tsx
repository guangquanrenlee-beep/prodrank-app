"use client";

import { useState } from "react";
import Link from "next/link";

export default function SetupPage() {
  const [shopifyId, setShopifyId] = useState("");
  const [shopifySecret, setShopifySecret] = useState("");
  const [resendKey, setResendKey] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setLoading(true); setStatus("");
    try {
      const res = await fetch("/api/admin/setup-env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          SHOPIFY_CLIENT_ID: shopifyId,
          SHOPIFY_CLIENT_SECRET: shopifySecret,
          RESEND_API_KEY: resendKey,
        }),
      });
      const data = await res.json();
      setStatus(data.status === "saved" ? "✅ Saved! VPS will restart in 10 seconds." : "⚠️ " + (data.message || "Failed"));
    } catch { setStatus("❌ Network error — is the backend running?"); }
    setLoading(false);
  };

  return (
    <main className="min-h-screen max-w-lg mx-auto px-4 py-12 space-y-8">
      <div>
        <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
        <h1 className="text-3xl font-bold mt-2">🔧 Server Setup</h1>
        <p className="text-zinc-400 text-sm mt-1">Configure API keys. These get written to the .env file on the VPS.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Shopify Client ID</label>
          <input value={shopifyId} onChange={e => setShopifyId(e.target.value)} placeholder="68693bd65e752d8ba73f896e37709114" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Shopify Client Secret</label>
          <input value={shopifySecret} onChange={e => setShopifySecret(e.target.value)} type="password" placeholder="shpss_..." className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Resend API Key (for email reports)</label>
          <input value={resendKey} onChange={e => setResendKey(e.target.value)} type="password" placeholder="re_..." className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <button onClick={save} disabled={loading || (!shopifyId && !resendKey)} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">
          {loading ? "Saving..." : "Save to Server"}
        </button>
        {status && <p className={`text-sm ${status.startsWith("✅") ? "text-emerald-400" : "text-red-400"}`}>{status}</p>}
      </div>
    </main>
  );
}
