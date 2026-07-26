import Link from "next/link";

export default function PrivacyPage() {
  return (<><main className="min-h-screen max-w-3xl mx-auto px-4 py-16 space-y-6">
    <Link href="/" className="text-zinc-500 text-sm">← Home</Link><h1 className="text-3xl font-bold">Privacy Policy</h1><p className="text-sm text-zinc-500">Last updated: July 25, 2026</p>
    <div className="space-y-6 text-sm text-zinc-400 leading-relaxed">
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">1. Information We Collect</h2><p>We collect: email address (for account creation), store domain and product data (to provide AI analysis), and usage analytics (page views, features used). We do NOT collect payment information — payments are processed by Paddle.</p></section>
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">2. How We Use Your Data</h2><p>Your data is used exclusively to: provide AI visibility analysis, generate optimization recommendations, track ranking changes over time, and improve our service. We never sell your data.</p></section>
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">3. Data Storage</h2><p>Account data is stored on Supabase (US East). AI ranking queries are processed via ofox.ai API. Payment data is handled entirely by Paddle — we never see your credit card.</p></section>
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">4. Cookies</h2><p>We use essential cookies for authentication (Supabase Auth) and analytics (Cloudflare). No tracking cookies. No ad cookies.</p></section>
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">5. Your Rights</h2><p>You may request deletion of your data at any time by contacting <a href="mailto:support@prodrank.app" className="text-emerald-400">support@prodrank.app</a>. We will comply within 30 days.</p></section>
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">6. GDPR Compliance</h2><p>EU users have the right to access, rectify, and erase their personal data. ProdRank acts as a data controller for account information and a data processor for store data analyzed through the Service.</p></section>
    </div>
  </main></>);
}
