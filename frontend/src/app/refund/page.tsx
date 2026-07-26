
export default function RefundPage() {
  return (<><main className="min-h-screen max-w-3xl mx-auto px-4 py-16 space-y-6">
    <Link href="/" className="text-zinc-500 text-sm">← Home</Link><h1 className="text-3xl font-bold">Refund Policy</h1>
    <div className="space-y-6 text-sm text-zinc-400 leading-relaxed">
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">14-Day Money-Back Guarantee</h2><p>All paid plans come with a 14-day money-back guarantee. If you're not satisfied within the first 14 days of your initial purchase, contact us for a full refund. Refunds are processed via Paddle within 5-10 business days.</p></section>
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">Subscription Cancellation</h2><p>You may cancel your subscription at any time from your account settings. Cancellation takes effect at the end of the current billing period. No partial refunds for mid-cycle cancellations after the 14-day guarantee period.</p></section>
      <section><h2 className="text-lg font-semibold text-zinc-200 mb-2">How to Request a Refund</h2><p>Email <a href="mailto:support@prodrank.app" className="text-emerald-400">support@prodrank.app</a> with your account email and order ID. We respond within 24 hours.</p></section>
    </div>
  </main></>);
}
