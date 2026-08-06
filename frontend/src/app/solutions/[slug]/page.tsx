import { SOLUTIONS } from "@/lib/content";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";

export function generateStaticParams() { return SOLUTIONS.map(s => ({ slug: s.slug })); }

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = SOLUTIONS.find(x => x.slug === slug);
  if (!s) notFound();

  return (<main className="min-h-screen max-w-3xl mx-auto px-4 py-16 space-y-8">
    <Breadcrumbs items={[{ label: "Solutions", href: "/solutions" }, { label: s.title }]} />
    <div className="space-y-4"><h1 className="text-4xl font-bold">AI Visibility for {s.title}</h1><p className="text-lg text-zinc-400">{s.desc}</p></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"><h3 className="font-semibold mb-2">Auto Schema Injection</h3><p className="text-sm text-zinc-400">One-click install. All products get complete JSON-LD Schema automatically.</p></div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"><h3 className="font-semibold mb-2">AI Rank Tracking</h3><p className="text-sm text-zinc-400">Monitor your products across 4 AI agents daily.</p></div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"><h3 className="font-semibold mb-2">Citation Intelligence</h3><p className="text-sm text-zinc-400">Know which sources AI agents trust in your category.</p></div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"><h3 className="font-semibold mb-2">Competitor Tracking</h3><p className="text-sm text-zinc-400">See how your AI visibility compares to competitors.</p></div>
    </div>
    <div className="text-center"><Link href="/" className="inline-block px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition">Get started free →</Link></div>
  </main>);
}
