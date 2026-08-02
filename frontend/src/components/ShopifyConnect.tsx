"use client";

import { useState } from "react";

/**
 * Shopify OAuth connect link.
 * Fetches the install URL from the API (returns JSON), then navigates with
 * window.location. Never follow the OAuth redirect via fetch() — Shopify has
 * no CORS headers for us, so the browser kills it with "Failed to fetch".
 */
export default function ShopifyConnect({
  shop,
  className,
  children,
}: {
  shop: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [err, setErr] = useState("");

  const connect = async (e: React.MouseEvent) => {
    e.preventDefault();
    setErr("");
    try {
      const r = await fetch(`/api/shopify/install?shop=${encodeURIComponent(shop)}`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || "Install failed");
      window.location.href = data.install_url;
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <>
      <a href="#" onClick={connect} className={className}>{children}</a>
      {err && <div className="text-xs text-red-400 mt-1">{err}</div>}
    </>
  );
}
