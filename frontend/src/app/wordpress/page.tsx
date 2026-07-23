import Link from "next/link";

export default function WordPressPage() {
  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div>
        <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Back</Link>
        <h1 className="text-3xl font-bold mt-2">WordPress Plugin</h1>
        <p className="text-zinc-400">One-click install. All product pages get optimized Schema instantly.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Installation</h2>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="bg-emerald-900/50 text-emerald-400 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0">1</span>
            <div>
              <div className="font-medium text-zinc-200">Download the plugin</div>
              <a href="/prodrank-ai-seo.zip" className="text-sm text-emerald-400 hover:text-emerald-300">prodrank-ai-seo.zip</a>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="bg-emerald-900/50 text-emerald-400 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0">2</span>
            <div>
              <div className="font-medium text-zinc-200">Upload to WordPress</div>
              <div className="text-sm text-zinc-400">WordPress Admin → Plugins → Add New → Upload Plugin → Choose the zip file → Activate</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="bg-emerald-900/50 text-emerald-400 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0">3</span>
            <div>
              <div className="font-medium text-zinc-200">Done</div>
              <div className="text-sm text-zinc-400">Schema auto-injected on all product pages. Compatible with Yoast SEO and Rank Math.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="font-semibold mb-3">What the plugin does</h2>
        <ul className="space-y-2 text-sm text-zinc-400">
          <li>✅ Product Schema — 12-field JSON-LD on every product page</li>
          <li>✅ FAQPage Schema — AI-friendly Q&A auto-generated</li>
          <li>✅ Organization Schema — site-wide brand info</li>
          <li>✅ WebSite Schema — search action support</li>
          <li>✅ Compatible with Yoast SEO and Rank Math</li>
          <li>✅ No configuration needed</li>
        </ul>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="font-semibold mb-2">Developer? Build from source</h2>
        <code className="block bg-zinc-950 text-emerald-400 text-sm p-3 rounded-lg">
          git clone https://github.com/prodrank/wordpress-plugin.git<br />
          cd wordpress-plugin && zip -r prodrank-ai-seo.zip prodrank-ai-seo.php
        </code>
      </div>
    </main>
  );
}
