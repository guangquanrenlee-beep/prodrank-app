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
  // Citation flow: detected category from the pasted URL + tiered sources
  const [detected, setDetected] = useState<any>(null);
  const [sources, setSources] = useState<any>(null);

  const isCitation = tool.endpoint === "/api/cite/report";
  const supportsPaste = tool.endpoint === "/api/audit/product";

  const isUrlInput = (s: string) =>
    /^https?:\/\//i.test(s.trim()) || (s.includes(".") && !s.includes(" "));

  const showError = (r: Response) => {
    const show = async () => {
      let detail = "";
      try { detail = String((await r.json()).detail || ""); } catch { /* non-JSON body */ }
      const msg = detail || `Request failed (HTTP ${r.status})`;
      if (r.status === 429) setError("Free limit reached — 3 checks/day per tool. Sign in for unlimited access, or try again tomorrow.");
      else setError(msg);
    };
    return show();
  };

  const fetchSources = async (cat: string) => {
    const r = await fetch("/api/cite/sources", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: cat }),
    });
    if (r.ok) setSources(await r.json());
    else await showError(r);
  };

  const run = async () => {
    if (!input.trim()) return;
    setLoading(true); setError(""); setResult(null); setSources(null);
    // NB: `detected` is NOT reset here — it survives so the user can edit
    // the category and re-check with their own value. Re-detect button resets it.
    try {
      if (isCitation) {
        // Citation flow: paste a product URL → detect its category → tiered
        // sources. Typing a category directly skips detection.
        if (isUrlInput(input)) {
          if (!detected) {
            const dr = await fetch("/api/cite/detect", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: input.trim() }),
            });
            if (dr.ok) {
              const dd = await dr.json();
              setDetected(dd);
              setCategory(dd.category);
              await fetchSources(dd.category);
            } else await showError(dr);
          } else {
            // URL already detected; the user edited the category — re-fetch
            // with whatever is in the category box now.
            await fetchSources(category.trim() || "general");
          }
        } else {
          await fetchSources(category.trim() || input.trim());
        }
      } else {
        const body: any = { url: input, domain: input, product_name: input };
        const r = await fetch(tool.endpoint || "", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (r.ok) { setResult(await r.json()); }
        else await showError(r);
      }
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

  const missingFields = (result?.schema_fields || result?.schema_audit?.schema_fields || [])
    .filter((f: any) => !f.present).map((f: any) => f.field);

  return (<main className="min-h-screen max-w-3xl mx-auto px-4 py-10 space-y-6">
    <Breadcrumbs items={[{ label: "Free Tools", href: "/tools" }, { label: tool.title }]} />
    <div className="text-center"><div className="text-5xl mb-3">{tool.icon}</div><h1 className="text-3xl font-bold">{tool.title}</h1><p className="text-zinc-400 mt-2">{tool.desc}</p></div>

    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-3">
      <input value={input} onChange={e => setInput(e.target.value)}
        placeholder="Paste a product page URL, e.g. yourstore.com/product/led-ring-light"
        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      {isCitation && (
        <div className="space-y-1.5">
          <input value={category} onChange={e => setCategory(e.target.value)}
            placeholder="Product category — auto-detected from your URL, edit if wrong"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          {detected && (
            <div className="text-xs text-zinc-500 flex items-center justify-between">
              <span>Detected: <span className="text-emerald-400 font-medium">{detected.category}</span> ({detected.detected_from}, {detected.confidence}% confident){detected.title ? ` — from "${detected.title.slice(0, 60)}"` : ""}</span>
              <button onClick={() => { setDetected(null); run(); }} className="text-xs text-zinc-400 hover:text-white underline">Re-detect</button>
            </div>
          )}
        </div>
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

    {/* ── Citation: tiered trusted sources ── */}
    {isCitation && sources && (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-6">
        <div className="text-center">
          <div className="text-3xl font-bold text-emerald-400">{sources.tier1_measured.length + sources.tier2_industry.length}</div>
          <div className="text-sm text-zinc-500">Trusted sources for "{sources.category}"</div>
        </div>

        {/* Tier 1 — measured */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-zinc-200">📊 Measured citations</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-900/50 text-emerald-400 border border-emerald-800/50">REAL DATA</span>
          </div>
          <p className="text-[10px] text-zinc-600 mb-2">{sources.tier1_note}</p>
          {sources.tier1_measured.length > 0 ? (
            <div className="space-y-1.5">
              {sources.tier1_measured.slice(0, 10).map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs bg-zinc-800/40 border border-zinc-700/50 rounded-lg px-3 py-2">
                  <span className="text-zinc-300">{s.domain}</span>
                  <span className="text-emerald-400">{s.count}× cited by AI</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-zinc-600 bg-zinc-800/30 border border-zinc-700/50 rounded-lg px-3 py-2">
              No measured citation history yet — this grows as our daily AI monitoring runs. For now, see the industry list below.
            </div>
          )}
        </div>

        {/* Tier 2 — industry consensus */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-zinc-200">🏛️ Industry-consensus outlets</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/50 text-amber-400 border border-amber-800/50">CURATED, NOT MEASURED</span>
          </div>
          <p className="text-[10px] text-zinc-600 mb-2">{sources.tier2_note} — good pitching targets.</p>
          <div className="space-y-2">
            {sources.tier2_industry.map((s: any, i: number) => (
              <details key={i} className="bg-zinc-800/40 border border-zinc-700/50 rounded-lg">
                <summary className="px-4 py-2.5 text-sm text-zinc-300 cursor-pointer flex items-center gap-2">
                  <span className="font-medium">{s.domain}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-400">industry</span>
                </summary>
                <div className="px-4 pb-3 space-y-1">
                  <p className="text-xs text-zinc-500">📌 {s.why}</p>
                  <p className="text-xs text-zinc-400">✉️ {s.pitch}</p>
                </div>
              </details>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-zinc-600">Honest note: neither list means "these sites cited <i>you</i>". Tier 1 = domains AI actually mentioned in real queries; Tier 2 = where the category's reviews live. Both are pitching targets, not citations of your brand.</p>
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
        ) : result.schema_audit ? (
          <div className="space-y-4">
            <div className="text-center">
              <div className={`text-4xl font-bold ${result.schema_audit.content_quality_score >= 70 ? "text-emerald-400" : result.schema_audit.content_quality_score >= 40 ? "text-yellow-400" : "text-red-400"}`}>{result.schema_audit.content_quality_score}</div>
              <div className="text-sm text-zinc-500">Content Quality Score</div>
              <div className="text-xs text-zinc-600 mt-1">{result.schema_audit.field_count}/{result.schema_audit.max_fields} schema fields present</div>
            </div>
            {result.ai_parse?.knowledge_dimensions?.length > 0 && (
              <div>
                <div className="text-xs text-zinc-500 mb-2">AI understanding dimensions ({result.ai_parse.knowledge_dimensions.filter((d: any) => d.covered).length}/{result.ai_parse.knowledge_dimensions.length} covered):</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {result.ai_parse.knowledge_dimensions.map((d: any, i: number) => (
                    <div key={i} className={`flex items-center justify-between text-xs rounded-lg px-3 py-2 border ${d.covered ? "border-emerald-800/50 bg-emerald-900/10" : "border-red-800/50 bg-red-900/10"}`}>
                      <span className="text-zinc-400">{d.label}</span>
                      <span className={d.covered ? "text-emerald-400" : "text-red-400"}>{d.covered ? "✓ Covered" : "✗ Missing"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.ai_parse?.field_validations?.length > 0 && (
              <div>
                <div className="text-xs text-zinc-500 mb-2">What AI agents recognize from your description:</div>
                <div className="space-y-1.5">
                  {result.ai_parse.field_validations.map((fv: any, i: number) => (
                    <div key={i} className="text-xs bg-zinc-800/40 border border-zinc-700/50 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-300 capitalize">{String(fv.field || "").replace(/_/g, " ")}</span>
                        <span className="flex items-center gap-2">
                          <span className={fv.chatgpt_recognized ? "text-emerald-400" : "text-red-400"}>GPT {fv.chatgpt_recognized ? "✓" : "✗"}</span>
                          <span className={fv.gemini_recognized ? "text-emerald-400" : "text-red-400"}>Gemini {fv.gemini_recognized ? "✓" : "✗"}</span>
                        </span>
                      </div>
                      {fv.chatgpt_value && <div className="text-zinc-500 mt-1 truncate">ChatGPT: {String(fv.chatgpt_value).slice(0, 100)}</div>}
                      {fv.gemini_value && <div className="text-zinc-500 truncate">Gemini: {String(fv.gemini_value).slice(0, 100)}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.ai_parse?.entity_profile && (
              <div className="text-xs bg-zinc-800/40 border border-zinc-700/50 rounded-lg px-3 py-2.5 space-y-1 text-zinc-400">
                <div className="text-zinc-500 mb-1">AI's understanding of this product:</div>
                {result.ai_parse.entity_profile.best_for && <div>Best for: <span className="text-zinc-200">{result.ai_parse.entity_profile.best_for}</span></div>}
                {result.ai_parse.entity_profile.worst_for && <div>Worst for: <span className="text-zinc-200">{result.ai_parse.entity_profile.worst_for}</span></div>}
                {result.ai_parse.entity_profile.audience && <div>Audience: <span className="text-zinc-200">{result.ai_parse.entity_profile.audience}</span></div>}
                {result.ai_parse.entity_profile.price_range && <div>Price range: <span className="text-zinc-200">{result.ai_parse.entity_profile.price_range}</span></div>}
              </div>
            )}
            {result.knowledge_gap && (
              <div className="text-xs bg-zinc-800/40 border border-zinc-700/50 rounded-lg px-3 py-2 text-zinc-400">
                Question coverage: <span className="text-zinc-200">{result.knowledge_gap.covered_questions}/{result.knowledge_gap.total_ai_questions}</span> answered
                {result.knowledge_gap.top_missing?.length > 0 && (
                  <div className="mt-1.5 text-zinc-500">Top questions to add: {result.knowledge_gap.top_missing.slice(0, 3).join(" · ")}</div>
                )}
              </div>
            )}
            {missingFields.length > 0 && (
              <div>
                <div className="text-xs text-zinc-500 mb-2">Missing schema fields:</div>
                <div className="flex flex-wrap gap-1.5">
                  {missingFields.map((f: string) => <span key={f} className="text-xs bg-red-900/20 text-red-400/90 px-2 py-1 rounded border border-red-800/40">{f}</span>)}
                </div>
              </div>
            )}
            {result.schema_audit.content_issues?.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs text-zinc-500">Content issues:</div>
                {result.schema_audit.content_issues.slice(0, 5).map((i: string, idx: number) => (
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
