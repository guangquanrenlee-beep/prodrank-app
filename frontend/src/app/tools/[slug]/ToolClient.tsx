"use client";
import { useState } from "react";
import Link from "next/link";
import { TOOLS } from "@/lib/content";
import Breadcrumbs from "@/components/Breadcrumbs";

/* Free tools — real backend endpoints (audit / calculate / optimize / cite).
   Failures are surfaced with guidance instead of dying silently:
   - HTTP errors show the backend detail (rate limit, crawl failure…)
   - anti-bot detections offer workarounds (paste HTML, install plugin)
   - homepage URLs get a "paste the product page instead" hint
*/

// Cheap heuristic: a URL that contains a product-ish path segment is
// probably a product page; a bare domain or root path is a homepage.
function looksLikeProductPage(url: string): boolean {
  const path = url.replace(/^https?:\/\//, "").split("/").slice(1).join("/").toLowerCase();
  if (!path) return false; // bare domain = homepage
  if (/\.html?$/.test(path)) return true;
  if (/^\w+\/[\w-]+$/.test(path) && /\d/.test(path)) return true; // slug-ish + digit
  return /(^|\/)(product|products|item|items|p|shop)(\/|$)/.test(path);
}

const isBlockedError = (msg: string) =>
  /stealth|blocked|bot protection|403|401|challenge|cloudflare|timeout/i.test(msg);

export function ToolClient({ tool }: { tool: typeof TOOLS[0] }) {
  const [input, setInput] = useState("");
  const [category, setCategory] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pastedHtml, setPastedHtml] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  const isCitation = tool.endpoint === "/api/cite/report";
  const supportsPaste = tool.endpoint === "/api/audit/product";

  const run = async () => {
    if (!input.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const body: any = { url: input, domain: input, product_name: input };
      if (isCitation) body.category = category.trim() || input.replace(/^https?:\/\//, "").split("/")[0];
      const r = await fetch(tool.endpoint || "", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) { setResult(await r.json()); return; }
      let detail = "";
      try { detail = String((await r.json()).detail || ""); } catch { /* non-JSON body */ }
      const msg = detail || `Request failed (HTTP ${r.status})`;
      if (r.status === 429) setError("Free limit reached — 3 checks/day per tool. Sign in for unlimited access, or try again tomorrow.");
      else setError(msg);
    } catch (e: any) {
      setError(e.message || "Network error — is the API reachable?");
    }
    setLoading(false);
  };

  // Workaround for anti-bot sites: audit pasted HTML directly, no crawl.
  const runManual = async () => {
    if (!pastedHtml.trim()) return;
    setManualLoading(true); setError(""); setResult(null);
    try {
      const r = await fetch("/api/audit/manual", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: input || "https://example.com/product", html: pastedHtml }),
      });
      if (r.ok) { setResult(await r.json()); setPastedHtml(""); }
      else setError((await r.text()) || "Paste audit failed");
    } catch (e: any) { setError(e.message); }
    setManualLoading(false);
  };

  const blocked = isBlockedError(error);
  // Homepage heuristic: audit returned no Product schema and the URL doesn't
  // look like a product page — tell the user what to paste instead.
  const homepageHint = !!result && result.field_count !== undefined && !result.has_product_schema &&
    !looksLikeProductPage(input);

  const missingFields = (result?.schema_fields || [])
    .filter((f: any) => !f.present).map((f: any) => f.field);

  return (<main className="min-h-screen max-w-3xl mx-auto px-4 py-10 space-y-6">
    <Breadcrumbs items={[{ label: "Free Tools", href: "/tools" }, { label: tool.title }]} />
    <div className="text-center"><div className="text-5xl mb-3">{tool.icon}</div><h1 className="text-3xl font-bold">{tool.title}</h1><p className="text-zinc-400 mt-2">{tool.desc}</p></div>

    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-3">
      <input value={input} onChange={e => setInput(e.target.value)}
        placeholder="Paste a product page URL, e.g. yourstore.com/product/led-ring-light"
        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      {isCitation && (
        <input value={category} onChange={e => setCategory(e.target.value)}
          placeholder="Product category, e.g. ring lights (used for the citation report)"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      )}
      <button onClick={run} disabled={loading || !input.trim()}
        className="w-full px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition">
        {loading ? "Checking…" : "Check"}
      </button>
      <p className="text-xs text-zinc-600">Free tools audit a <span className="text-zinc-400">single product page</span>. Paste the product URL — not your homepage. Free: 3 checks/day per tool.</p>
    </div>

    {/* ── Error + anti-bot workarounds ── */}
    {error && !blocked && <div className="bg-red-900/10 border border-red-800 rounded-xl p-4 text-sm text-red-300">{error}</div>}

    {blocked && (
      <div className="bg-amber-900/10 border border-amber-800 rounded-xl p-5 space-y-4">
        <div className="text-sm text-amber-300 font-medium">⚠️ We couldn't crawl that page — it may be behind bot protection (Cloudflare challenge, anti-bot wall, or the URL may not exist).</div>
        <div className="text-xs text-zinc-400 space-y-3">
          <div><span className="text-zinc-300 font-medium">Option 1 — Check the URL.</span> Make sure it's a real product page (yourstore.com/product/…), not a homepage or login page.</div>
          <div><span className="text-zinc-300 font-medium">Option 2 — Paste the page HTML.</span> Open the product page in your browser → right-click → <span className="text-zinc-300">View Page Source</span> → Ctrl+A → Ctrl+C → paste below. We audit the HTML directly — no crawling needed.
            {supportsPaste && (
              <div className="mt-3 space-y-2">
                <textarea value={pastedHtml} onChange={e => setPastedHtml(e.target.value)} rows={5}
                  placeholder="Paste the full page source here…"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <button onClick={runManual} disabled={manualLoading || !pastedHtml.trim()}
                  className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition">
                  {manualLoading ? "Auditing…" : "Audit pasted HTML"}
                </button>
              </div>
            )}
          </div>
          <div><span className="text-zinc-300 font-medium">Option 3 — Connect your store.</span> If this is your store, install our plugin and analyze from inside — no crawling at all. <Link href="/install" className="text-emerald-400 hover:underline">Install guide →</Link></div>
        </div>
      </div>
    )}

    {/* ── Homepage hint ── */}
    {homepageHint && (
      <div className="bg-amber-900/10 border border-amber-800 rounded-xl p-4 text-sm text-amber-300">
        ⚠️ This looks like a <span className="font-medium">homepage</span>, not a product page — no Product Schema was found, which is expected on a homepage. Paste a specific product URL instead, e.g. <span className="text-amber-200">yourstore.com/product/led-ring-light</span>.
      </div>
    )}

    {/* ── Results ── */}
    {result && (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        {result.ai_visibility_score !== undefined ? (
          <div className="space-y-4">
            <div className="text-center">
              <div className={`text-4xl font-bold ${result.ai_visibility_score>=70?"text-emerald-400":result.ai_visibility_score>=40?"text-yellow-400":"text-red-400"}`}>{result.ai_visibility_score}</div>
              <div className="text-sm text-zinc-500">AI Visibility Score — {result.label}</div>
            </div>
            {result.breakdown && (
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(result.breakdown).map(([k, v]: [string, any]) => (
                  <div key={k} className={`flex items-center justify-between rounded-lg px-3 py-2 border ${v.score >= 70 ? "border-emerald-800/50 bg-emerald-900/10" : v.score >= 40 ? "border-amber-800/50 bg-amber-900/10" : "border-red-800/50 bg-red-900/10"}`}>
                    <span className="text-xs text-zinc-400 capitalize">{v.label || k}</span>
                    <span className="text-sm font-bold text-zinc-200">{v.score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : result.field_count !== undefined ? (
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-emerald-400">{result.field_count}/{result.max_fields}</div>
              <div className="text-sm text-zinc-500">Schema fields present</div>
            </div>
            {result.has_faq_schema !== undefined && (
              <div className="flex gap-2 justify-center text-xs">
                <span className={`px-2 py-1 rounded-full ${result.has_product_schema ? "bg-emerald-900/50 text-emerald-400" : "bg-red-900/50 text-red-400"}`}>
                  {result.has_product_schema ? "✓ Product Schema" : "✗ No Product Schema"}
                </span>
                <span className={`px-2 py-1 rounded-full ${result.has_faq_schema ? "bg-emerald-900/50 text-emerald-400" : "bg-red-900/50 text-red-400"}`}>
                  {result.has_faq_schema ? "✓ FAQ Schema" : "✗ No FAQ Schema"}
                </span>
              </div>
            )}
            {missingFields.length > 0 && (
              <div>
                <div className="text-xs text-zinc-500 mb-2">Missing fields AI agents look for:</div>
                <div className="flex flex-wrap gap-1.5">
                  {missingFields.map((f: string) => <span key={f} className="text-xs bg-red-900/20 text-red-400/90 px-2 py-1 rounded border border-red-800/40">{f}</span>)}
                </div>
              </div>
            )}
            {result.content_issues?.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs text-zinc-500">Content issues:</div>
                {result.content_issues.slice(0, 5).map((i: string, idx: number) => (
                  <div key={idx} className="text-xs text-amber-300 bg-amber-900/10 border border-amber-800/30 rounded-lg px-3 py-2">⚠ {i}</div>
                ))}
              </div>
            )}
          </div>
        ) : result.fixes ? (
          <div className="space-y-4">
            <div className="text-center"><div className="text-4xl font-bold text-emerald-400">{result.fixes.length}</div><div className="text-sm text-zinc-500">Schema fixes generated</div></div>
            {result.ai_generated_faq && (
              <div className="text-xs text-emerald-400 bg-emerald-900/10 border border-emerald-800/40 rounded-lg px-3 py-2">✓ AI-generated FAQ included</div>
            )}
            <div className="space-y-2">
              {result.fixes.map((f: any, i: number) => (
                <details key={i} className="bg-zinc-800/40 border border-zinc-700/50 rounded-lg">
                  <summary className="px-4 py-2.5 text-sm text-zinc-300 cursor-pointer flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${f.priority === "high" ? "bg-red-900/40 text-red-400" : f.priority === "medium" ? "bg-amber-900/40 text-amber-400" : "bg-zinc-700 text-zinc-400"}`}>{f.priority}</span>
                    {f.schema_type} JSON-LD
                  </summary>
                  <div className="px-4 pb-3 space-y-2">
                    {f.note && <p className="text-xs text-zinc-500">{f.note}</p>}
                    {f.json_ld && <pre className="text-[10px] text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-lg p-3 overflow-x-auto">{JSON.stringify(f.json_ld, null, 2).slice(0, 1200)}</pre>}
                  </div>
                </details>
              ))}
            </div>
          </div>
        ) : result.total_citations !== undefined ? (
          <div className="space-y-3">
            <div className="text-center">
              <div className="text-4xl font-bold text-emerald-400">{result.total_citations}</div>
              <div className="text-sm text-zinc-500">Citations found for "{result.category || result.keyword || "this category"}"</div>
            </div>
            {result.top_domains?.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs text-zinc-500">Most-cited sources:</div>
                {result.top_domains.slice(0, 8).map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-zinc-800/40 border border-zinc-700/50 rounded-lg px-3 py-2">
                    <span className="text-zinc-300">{d.domain}</span>
                    <span className="text-zinc-500">{d.citations} citations</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
        <details><summary className="text-xs text-zinc-500 cursor-pointer">View raw response</summary><pre className="text-xs text-zinc-300 overflow-x-auto max-h-60 mt-2">{JSON.stringify(result, null, 2).slice(0, 800)}</pre></details>
      </div>
    )}

    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{TOOLS.map(t => (<Link key={t.slug} href={`/tools/${t.slug}`} className={`bg-zinc-900 border rounded-lg p-3 text-center transition ${t.slug === tool.slug ? "border-emerald-600" : "border-zinc-800 hover:border-zinc-600"}`}><div className="text-xl">{t.icon}</div><div className="text-xs text-zinc-300 mt-1">{t.title}</div></Link>))}</div>
    <div className="text-center"><Link href="/" className="inline-block px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition">Get full ProdRank →</Link></div>
  </main>);
}
