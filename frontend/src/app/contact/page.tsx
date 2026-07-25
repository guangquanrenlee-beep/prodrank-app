import Footer from "@/components/Footer"; import Link from "next/link";
export default function ContactPage() {
  return (<><main className="min-h-screen max-w-2xl mx-auto px-4 py-16 space-y-6">
    <Link href="/" className="text-zinc-500 text-sm">← Home</Link><h1 className="text-3xl font-bold">Contact Us</h1>
    <div className="space-y-4 text-sm text-zinc-400">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"><h3 className="font-semibold text-zinc-200 mb-1">Email Support</h3><a href="mailto:support@prodrank.app" className="text-emerald-400 text-lg">support@prodrank.app</a><p className="mt-1 text-zinc-500">Typical response: within 24 hours</p></div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"><h3 className="font-semibold text-zinc-200 mb-1">Business Inquiries</h3><a href="mailto:hello@prodrank.app" className="text-emerald-400">hello@prodrank.app</a><p className="mt-1 text-zinc-500">Partnerships, enterprise plans, press</p></div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"><h3 className="font-semibold text-zinc-200 mb-1">Legal</h3><p>ProdRank is operated by an independent developer. For DMCA notices or legal correspondence, email <a href="mailto:support@prodrank.app" className="text-emerald-400">support@prodrank.app</a>.</p></div>
    </div>
  </main><Footer /></>);
}
