"use client";

import { useState } from "react";
import Link from "next/link";

interface CMSResult {
  domain: string;
  platform: string;
  confidence: number;
  markers: string[];
  auth_method: string;
  recommended_action: string;
}

export default function HomePage() {
  const [domain, setDomain] = useState("");
  const [cms, setCms] = useState<CMSResult | null>(null);
  const [cmsLoading, setCmsLoading] = useState(false);
  const [error, setError] = useState("");

  const detectPlatform = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) return;
    setCmsLoading(true);
    setError("");
    setCms(null);

    try {
      const res = await fetch("/api/cms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setCms(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCmsLoading(false);
    }
  };

  const getPlatformIcon = (platform: string) => {
    const map: Record<string, string> = {
      shopify: "🛒", likely_shopify: "🛒", woocommerce: "🛍️",
      wordpress: "📝", bigcommerce: "🏪", magento: "🔧", custom: "🌐",
    };
    return map[platform] || "🌐";
  };

  const getAuthLink = (result: CMSResult) => {
    const d = encodeURIComponent(result.domain);
    switch (result.auth_method) {
      case "oauth":
        return `/api/shopify/install?shop=${d}`;
      case "plugin":
        return "https://prodrank.app/wordpress";
      case "rest_api":
        return "https://prodrank.app/woocommerce";
      default:
        return "/csv";
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-2xl w-full space-y-10">
        {/* Hero */}
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold tracking-tight">
            Make AI see{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              your products
            </span>
          </h1>
          <p className="text-lg text-zinc-400 max-w-lg mx-auto">
            Connect your store. We&apos;ll make sure ChatGPT, Gemini, Claude, and Grok
            can find and recommend your products.
          </p>
        </div>

        {/* Main input + CMS detection */}
        <form onSubmit={detectPlatform} className="space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="yourstore.com"
              className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg"
            />
            <button
              type="submit"
              disabled={cmsLoading || !domain.trim()}
              className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition text-lg"
            >
              {cmsLoading ? "Analyzing..." : "Get Started"}
            </button>
          </div>
          <p className="text-xs text-zinc-600 text-center">
            We&apos;ll detect your platform and show you the one-click setup.
          </p>
        </form>

        {/* CMS Detection Result */}
        {cms && (
          <div className="bg-zinc-900 border border-emerald-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{getPlatformIcon(cms.platform)}</span>
              <div>
                <div className="font-semibold text-zinc-200 capitalize">
                  {cms.platform.replace("_", " ")}
                  <span className="text-xs text-zinc-500 ml-2">({cms.confidence}% confidence)</span>
                </div>
                <p className="text-sm text-zinc-400 mt-1">{cms.recommended_action}</p>
              </div>
            </div>

            {/* Action buttons based on platform */}
            <div className="flex flex-wrap gap-3">
              {cms.auth_method === "oauth" && (
                <a
                  href={getAuthLink(cms)}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition text-center"
                >
                  Connect Shopify →
                </a>
              )}
              {cms.auth_method === "plugin" && (
                <a
                  href={getAuthLink(cms)}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition"
                >
                  Install WordPress Plugin →
                </a>
              )}
              {cms.auth_method === "rest_api" && (
                <a
                  href={getAuthLink(cms)}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition"
                >
                  Connect WooCommerce →
                </a>
              )}
              <Link
                href="/csv"
                className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-lg transition inline-block"
              >
                Upload CSV →
              </Link>
              <a
                href={`/rank/domain?domain=${encodeURIComponent(cms.domain)}`}
                className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-lg transition text-sm"
              >
                Check AI visibility first →
              </a>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Footer links */}
        <div className="flex justify-center gap-6 text-xs text-zinc-600">
          <a href="/rank" className="hover:text-emerald-400 transition">Manual rank check</a>
          <a href="/intel" className="hover:text-emerald-400 transition">Full intelligence report</a>
          <span className="text-zinc-700">|</span>
          <span>ChatGPT</span><span>Gemini</span><span>Claude</span><span>Grok</span>
        </div>
      </div>
    </main>
  );
}
