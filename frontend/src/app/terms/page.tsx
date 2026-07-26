
import Link from "next/link";

export default function TermsPage() {
  return (<><main className="min-h-screen max-w-3xl mx-auto px-4 py-16 space-y-6">
    <Link href="/" className="text-zinc-500 text-sm">← Home</Link>
    <h1 className="text-3xl font-bold">Terms of Service</h1>
    <p className="text-sm text-zinc-500">Last updated: July 25, 2026</p>
    <div className="space-y-6 text-sm text-zinc-400 leading-relaxed">
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">1. Acceptance of Terms</h2><p>By accessing or using ProdRank ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p></section>
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">2. Description of Service</h2><p>ProdRank provides AI commerce intelligence tools that analyze product visibility across AI agents including ChatGPT, Gemini, Claude, and Grok. The Service includes Schema auditing, AI ranking monitoring, citation tracking, and automated optimization.</p></section>
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">3. User Accounts</h2><p>You are responsible for maintaining the confidentiality of your account credentials. You must provide accurate and complete information when creating an account. ProdRank reserves the right to suspend or terminate accounts that violate these terms.</p></section>
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">4. Subscription & Payment</h2><p>Paid plans are billed monthly or annually via Paddle. You may cancel at any time. Refunds are governed by our Refund Policy. ProdRank reserves the right to change pricing with 30 days notice.</p></section>
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">5. Intellectual Property</h2><p>All content, code, and data provided by the Service is owned by ProdRank. You retain ownership of your store data. You grant ProdRank a limited license to process your data for the purpose of providing the Service.</p></section>
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">6. Limitation of Liability</h2><p>ProdRank is provided "as is" without warranties. We are not liable for any damages arising from use of the Service. AI agent rankings are estimates based on available data and may vary.</p></section>
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">7. Contact</h2><p>Questions about these terms? Contact us at <a href="mailto:support@prodrank.app" className="text-emerald-400">support@prodrank.app</a>.</p></section>
    </div>
  </main></>);
}
