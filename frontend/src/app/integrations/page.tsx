"use client";
import Link from "next/link";
import ShopifyConnect from "@/components/ShopifyConnect";
export default function IntegrationsPage() {
  return (<main className="min-h-screen max-w-3xl mx-auto px-4 py-10 space-y-6">
    <Link href="/dashboard" className="text-zinc-500 text-sm">← Dashboard</Link>
    <h1 className="text-2xl font-bold">Integrations</h1>
    <div className="grid grid-cols-1 gap-4">
      {[{ icon:"🛒", name:"Shopify", desc:"Install from App Store — one click, all products auto-Schema.", action:"Connect →" }, { icon:"📝", name:"WordPress / WooCommerce", desc:"Upload the plugin. Activates Schema on every product page. Yoast & RankMath compatible.", href:"/wordpress", action:"Install Plugin →" }, { icon:"🔍", name:"YouTube API", desc:"Track product review videos and influencer mentions. Set YOUTUBE_API_KEY.", href:"#", action:"Coming soon" }, { icon:"📊", name:"Google Search Console", desc:"Discover high-opportunity search queries. Requires Google OAuth.", href:"#", action:"Coming soon" }].map(r => (<div key={r.name} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-center justify-between"><div><div className="flex items-center gap-2"><span>{r.icon}</span><span className="font-medium text-zinc-200">{r.name}</span></div><div className="text-xs text-zinc-500 mt-1">{r.desc}</div></div>{r.name === "Shopify" ? <ShopifyConnect shop="yourstore.myshopify.com" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition">{r.action}</ShopifyConnect> : <Link href={r.href || "#"} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition">{r.action}</Link>}</div>))}
    </div>
  </main>);
}
