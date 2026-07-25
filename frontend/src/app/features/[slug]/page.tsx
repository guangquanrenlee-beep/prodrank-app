import { FEATURES } from "@/lib/content";
import Link from "next/link";
import { notFound } from "next/navigation";

export function generateStaticParams() { return FEATURES.map(f => ({ slug: f.slug })); }

export default function FeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = params as unknown as { slug: string };
  const f = FEATURES.find(x => x.slug === slug);
  if (!f) notFound();

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-16 space-y-8">
      <Link href="/" className="text-zinc-500 text-sm">← ProdRank</Link>
      <div className="text-center space-y-4">
        <div className="text-5xl">{f.icon}</div>
        <h1 className="text-4xl font-bold">{f.title}</h1>
        <p className="text-lg text-zinc-400 max-w-xl mx-auto">{f.desc}</p>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 space-y-6">
        <h2 className="text-xl font-semibold">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div className="bg-zinc-800/50 rounded-lg p-4"><div className="text-2xl mb-2">1</div><div className="text-sm text-zinc-300">Connect your store</div><div className="text-xs text-zinc-500 mt-1">Shopify, WooCommerce, or any platform</div></div>
          <div className="bg-zinc-800/50 rounded-lg p-4"><div className="text-2xl mb-2">2</div><div className="text-sm text-zinc-300">We analyze</div><div className="text-xs text-zinc-500 mt-1">AI agents + Schema + content quality</div></div>
          <div className="bg-zinc-800/50 rounded-lg p-4"><div className="text-2xl mb-2">3</div><div className="text-sm text-zinc-300">Get optimized</div><div className="text-xs text-zinc-500 mt-1">One-click fixes + ongoing monitoring</div></div>
        </div>
      </div>
      <div className="text-center space-y-4">
        <p className="text-zinc-400">See {f.title.toLowerCase()} in action on your store.</p>
        <Link href="/" className="inline-block px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition">Try it free →</Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {FEATURES.filter(x => x.slug !== slug).slice(0, 4).map(ff => (
          <Link key={ff.slug} href={`/features/${ff.slug}`} className="bg-zinc-900 border border-zinc-800 hover:border-emerald-700 rounded-lg p-3 text-center transition">
            <div className="text-xl">{ff.icon}</div><div className="text-xs text-zinc-300 mt-1">{ff.title}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
