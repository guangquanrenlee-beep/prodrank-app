import Footer from "@/components/Footer"; import Link from "next/link";
export default function AboutPage() {
  return (<><main className="min-h-screen max-w-3xl mx-auto px-4 py-16 space-y-6">
    <Link href="/" className="text-zinc-500 text-sm">← Home</Link><h1 className="text-3xl font-bold">About ProdRank</h1>
    <div className="space-y-6 text-sm text-zinc-400 leading-relaxed">
      <p className="text-lg text-zinc-300">ProdRank is the first AI Commerce Intelligence Platform — telling online stores exactly how ChatGPT, Gemini, Claude, and Grok see their products, and fixing it when they don't.</p>
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">Our Mission</h2><p>As AI agents become the new search engines, millions of products are invisible to them — not because they're bad products, but because their data isn't structured for AI consumption. ProdRank exists to close that gap.</p></section>
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">The Team</h2><p>ProdRank is built by an independent developer who saw the shift from Google SEO to AI Shopping visibility and decided to build the tool that didn't exist yet. We're bootstrapped, profitable, and obsessed with AI commerce.</p></section>
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">Technology</h2><p>Our platform analyzes products across 4 AI agents, audits 12 Schema.org fields, tracks citation sources, and generates optimization fixes — all powered by a combination of FastAPI, Next.js, Supabase, and multi-model AI via ofox.ai.</p></section>
    </div>
  </main><Footer /></>);
}
