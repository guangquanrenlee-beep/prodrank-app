import Link from "next/link";
import ShopifyConnect from "@/components/ShopifyConnect";
export default function DocsPage() {
  return (<main className="min-h-screen max-w-3xl mx-auto px-4 py-10 space-y-8">
    <Link href="/" className="text-zinc-500 text-sm">← Home</Link>
    <h1 className="text-3xl font-bold">Getting Started</h1>
    <div className="space-y-6 text-sm text-zinc-400 leading-relaxed">
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2"><h2 className="text-lg font-semibold text-zinc-200">1. Analyze your store</h2><p>Enter your store domain on the homepage. We auto-detect your platform and scan your products for AI visibility.</p><p className="text-zinc-500">Takes 10-30 seconds depending on site size.</p></section>
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2"><h2 className="text-lg font-semibold text-zinc-200">2. Read your AI Score</h2><p>AI Visibility Score ranges 0-100. Average Shopify store scores 45-55. Below 30 means AI agents can barely see your products.</p></section>
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2"><h2 className="text-lg font-semibold text-zinc-200">3. Install the fix</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div className="bg-zinc-800/50 rounded-lg p-3"><div className="font-medium text-zinc-200">Shopify</div><div className="text-zinc-500 text-xs mt-1">Install our App from Shopify App Store. One click, all products get Schema.</div><ShopifyConnect shop="yourstore.myshopify.com" className="text-xs text-emerald-400 mt-2 inline-block">Connect →</ShopifyConnect></div><div className="bg-zinc-800/50 rounded-lg p-3"><div className="font-medium text-zinc-200">WordPress</div><div className="text-zinc-500 text-xs mt-1">Upload the plugin. Activates Schema automatically.</div><Link href="/wordpress" className="text-xs text-emerald-400 mt-2 inline-block">Get Plugin →</Link></div></div></section>
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2"><h2 className="text-lg font-semibold text-zinc-200">4. Track your rankings</h2><p>After installing, use Monitoring to track your products across ChatGPT, Gemini, Claude, and Grok. Come back weekly to see if your AI Score improved.</p><Link href="/monitoring" className="text-sm text-emerald-400">Go to Monitoring →</Link></section>
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2"><h2 className="text-lg font-semibold text-zinc-200">Need help?</h2><p>Contact us at <a href="mailto:support@prodrank.app" className="text-emerald-400">support@prodrank.app</a></p></section>
    </div>
  </main>);
}
