"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function InstallCard({ icon, title, desc, href, cta }: { icon:string; title:string; desc:string; href:string; cta:string }) {
  return <a href={href} className="bg-zinc-800/50 hover:bg-zinc-800 rounded-xl p-4 transition flex flex-col justify-between"><div><div className="text-2xl mb-2">{icon}</div><div className="text-sm font-medium text-zinc-200">{title}</div><div className="text-xs text-zinc-500 mt-1">{desc}</div></div><div className="mt-3 text-xs text-emerald-400 font-medium">{cta}</div></a>;
}

export default function AnalyticsPage() { return <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-zinc-400">Loading...</div>}><AnalyticsContent /></Suspense>; }

function AnalyticsContent() {
  const params = useSearchParams();
  const domain = params.get("domain") || "";
  const [score, setScore] = useState<any>(null);
  const [cms, setCms] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!domain) return;
    const d = domain.replace(/^https?:\/\//,"").split("/")[0];
    setLoading(true);
    Promise.all([
      fetch("/api/calculate", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({url:`https://${d}`,product_name:d}) }).then(r=>{if(r.status===429)throw new Error("rate_limited");return r.json()}).catch(e=>e.message==="rate_limited"?{error:"rate_limited"}:null),
      fetch("/api/cms", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({domain:d}) }).then(r=>r.json()).catch(()=>null),
      fetch("/api/next-steps", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({url:`https://${d}`,product_name:d}) }).then(r=>r.json()).catch(()=>null),
    ]).then(([s,c,st]) => { setScore(s); setCms(c); setSteps(st?.action_plan||[]); if(s?.error==="rate_limited") setError("Daily free limit reached (3/day). Sign up for unlimited access."); setLoading(false); });
  }, [domain]);

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { if (loading) { const t = setInterval(() => setElapsed(e=>e+1), 1000); return () => clearInterval(t); } }, [loading]);
  if (loading) return <main className="min-h-screen flex items-center justify-center"><div className="text-center space-y-4"><div className="text-zinc-400 animate-pulse text-lg">Analyzing {domain||"..."} across 4 AI agents...</div><div className="text-sm text-zinc-600">{elapsed < 30 ? `Checking Schema, rankings, citations... (${elapsed}s)` : "Taking longer than expected. Our servers may be busy. This is normal for large sites."}</div></div></main>;

  const sc = (s:number) => s>=70?"text-emerald-400":s>=40?"text-yellow-400":"text-red-400";
  const auto = steps.filter((s:any)=>s.auto_fixable).length;
  const manual = steps.filter((s:any)=>!s.auto_fixable).length;

  return (<main className="min-h-screen max-w-4xl mx-auto px-4 py-10 space-y-8">
    <div>
      <Link href="/dashboard" className="text-zinc-500 text-sm">← Dashboard</Link>
      <h1 className="text-2xl font-bold mt-1">{domain}</h1>
      {cms && <p className="text-sm text-zinc-500 mt-1 capitalize">{cms.platform === "unknown" ? "Cloudflare protected — can't auto-detect. Likely Shopify or WordPress." : `${cms.platform} · ${cms.confidence}% confidence`}</p>}
    </div>

    {error && <div className="bg-amber-900/20 border border-amber-800 rounded-xl p-4 text-center"><p className="text-amber-400 text-sm">{error}</p>{error.includes("limit") && <Link href="/signup" className="inline-block mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition">Sign up for unlimited access →</Link>}</div>}

    {/* CMS Install Guide */}
    {cms && (<div className="bg-emerald-900/10 border border-emerald-800 rounded-xl p-6">
      <h2 className="font-semibold text-emerald-400 mb-3">How to install for {cms.platform === "shopify" ? "Shopify" : cms.platform === "woocommerce" || cms.platform === "wordpress" ? "WordPress" : "any platform"}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cms.platform === "shopify" ? (<>
          <InstallCard icon="📲" title="Shopify App" desc="Install from App Store. One click, auto-injects Schema on all product pages." href={`/api/shopify/install?shop=${domain}`} cta="Connect Shopify →" />
          <InstallCard icon="⚡" title="inject.js (Universal)" desc="One line of code. Works on any platform including Shopify." href="/inject-guide" cta="View Guide →" />
        </>) : cms.platform === "woocommerce" || cms.platform === "wordpress" ? (<>
          <InstallCard icon="📝" title="WordPress Plugin" desc="Upload & activate. Auto-injects Schema on all pages. Yoast/RankMath compatible." href="/wordpress" cta="Get Plugin →" />
          <InstallCard icon="⚡" title="inject.js (Universal)" desc="One line of code. Works on any platform." href="/inject-guide" cta="View Guide →" />
        </>) : (<>
          <InstallCard icon="⚡" title="inject.js (Recommended)" desc="One line of code. Auto-detects products, injects Schema. Works everywhere." href="/inject-guide" cta="View Guide →" />
          <InstallCard icon="📦" title="CSV Upload" desc="Export products from any store, upload here, get Schema for every SKU." href="/csv" cta="Upload CSV →" />
        </>)}
        <InstallCard icon="📊" title="Check AI Ranking" desc="See where your brand ranks across ChatGPT, Gemini, Claude, Grok." href={`/rank/domain?domain=${encodeURIComponent(domain)}`} cta="Check Now →" />
      </div>
    </div>)}

    {score && (<div className="space-y-8">
      {/* Big Score */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
        <div className={`text-8xl font-bold ${sc(score.ai_visibility_score||0)}`}>{score.ai_visibility_score}</div>
        <div className="text-sm text-zinc-500 mt-2">AI Visibility Score — {score.label} <span className="text-xs text-zinc-600">(avg Shopify store: 45-55. Below 30 needs urgent fixes.)</span></div>
        <div className="flex flex-wrap justify-center gap-3 mt-6">
          <Link href={`/actions?domain=${encodeURIComponent(domain)}`} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition">Fix Issues →</Link>
          <button onClick={async ()=>{const r=await fetch("/api/rec/reasons",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({product_name:domain,keyword:`best ${domain.split('.')[0]}`,brand:domain.split('.')[0]})});if(r.ok){const d=await r.json();alert(d.breakdowns?.map((b:any)=>`[${b.ai_agent}] ${b.recommended?'Recommended':'Not recommended'}\nReasons: ${b.reasons?.join(', ')||'none'}\nBarriers: ${b.barriers?.join(', ')||'none'}`).join('\n\n'));}}} className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg transition">🧠 Why am I not recommended?</button>
          <Link href={`/rank/domain?domain=${encodeURIComponent(domain)}`} className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-medium rounded-lg transition">AI Rankings →</Link>
        </div>
      </div>

      {/* Score bars + Evidence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold mb-4">What to fix</h3>
          {auto+manual===0 ? <p className="text-sm text-zinc-500">No issues detected. Run a deeper scan.</p> :
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-emerald-400">Auto-fixable</span><span className="text-emerald-400 font-bold">{auto}</span></div>
            <div className="flex justify-between text-sm"><span className="text-amber-400">Manual work</span><span className="text-amber-400 font-bold">{manual}</span></div>
            <Link href={`/actions?domain=${encodeURIComponent(domain)}`} className="inline-block mt-3 text-sm text-emerald-400 hover:text-emerald-300">Open Action Center →</Link>
          </div>}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="font-semibold mb-3">AI Score Breakdown</h3>
          <div className="space-y-2">
            {Object.entries(score.breakdown).map(([k,v]:any)=>(<div key={k}><div className="flex justify-between text-xs mb-0.5"><span className="text-zinc-500 capitalize">{k.replace(/_/g," ")}</span><span className="text-zinc-400">{v.score}/100</span></div><div className="w-full bg-zinc-800 h-1.5 rounded-full"><div className={`h-1.5 rounded-full ${v.score>=70?"bg-emerald-500":v.score>=40?"bg-yellow-500":"bg-red-500"}`} style={{width:Math.max(v.score,5)+"%"}}/></div></div>))}
          </div>
          <details className="mt-4"><summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">📋 Where do these scores come from?</summary><div className="text-xs text-zinc-600 mt-2 space-y-1"><div>Knowledge Coverage → page content + AI analysis</div><div>Question Coverage → FAQ Schema + shopping questions</div><div>Citation Authority → AI agent citation sources</div><div>Recommendation Freq → how often AI mentions your brand</div><div>External Evidence → reviews, images, certifications</div><div>Product Completeness → Schema fields + content quality</div></div></details>
        </div>
      </div>

      {/* Quick actions bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link href={`/optimize`} className="bg-zinc-900 border border-zinc-800 hover:border-emerald-700 rounded-xl p-4 text-center transition"><div className="text-xl mb-1">🔧</div><div className="text-xs font-medium text-zinc-200">Auto-Fix Schema</div></Link>
        <Link href={`/monitoring`} className="bg-zinc-900 border border-zinc-800 hover:border-emerald-700 rounded-xl p-4 text-center transition"><div className="text-xl mb-1">📡</div><div className="text-xs font-medium text-zinc-200">Track Rankings</div></Link>
        <Link href={`/compare`} className="bg-zinc-900 border border-zinc-800 hover:border-emerald-700 rounded-xl p-4 text-center transition"><div className="text-xl mb-1">⚔️</div><div className="text-xs font-medium text-zinc-200">Compare Competitors</div></Link>
        <Link href={`/cite`} className="bg-zinc-900 border border-zinc-800 hover:border-emerald-700 rounded-xl p-4 text-center transition"><div className="text-xl mb-1">📰</div><div className="text-xs font-medium text-zinc-200">Citation Sources</div></Link>
      </div>
    </div>)}
  </main>);
}
