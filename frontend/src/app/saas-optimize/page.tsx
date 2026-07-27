"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

const CATEGORIES = [
  "BusinessApplication", "AccountingSoftware", "CRMSoftware", "ProjectManagementSoftware",
  "EmailMarketingSoftware", "AnalyticsSoftware", "HRSoftware", "PayrollSoftware",
  "CollaborationSoftware", "CustomerSupportSoftware", "ChatSoftware", "VideoSoftware",
  "DesignSoftware", "DeveloperApplication", "MarketingSoftware", "SalesSoftware",
  "FinanceApplication", "EducationApplication", "HealthApplication", "EcommerceSoftware",
];

export default function SaasOptimizePage() {
  return <Suspense fallback={<div className="p-10 text-zinc-400">Loading...</div>}><SaasOptimizeContent /></Suspense>;
}

function SaasOptimizeContent() {
  const params = useSearchParams();
  const urlParam = params.get("url") || "";
  const { user, loading: authLoading } = useAuth();

  const [url, setUrl] = useState(urlParam);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [features, setFeatures] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [ratingValue, setRatingValue] = useState("");
  const [reviewCount, setReviewCount] = useState("");
  const [generated, setGenerated] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    const featureList = features.split("\n").map(f => f.trim()).filter(Boolean);

    const softwareSchema: any = {
      "@context": "https://schema.org/",
      "@type": "SoftwareApplication",
      name: name.trim(),
      description: description.trim() || undefined,
      url: url.trim() || undefined,
      applicationCategory: category || "BusinessApplication",
      operatingSystem: "Web",
    };

    if (featureList.length > 0) softwareSchema.featureList = featureList.join(". ");
    if (screenshot.trim()) softwareSchema.screenshot = screenshot.trim();

    if (price.trim()) {
      softwareSchema.offers = {
        "@type": "Offer",
        price: price.trim(),
        priceCurrency: "USD",
      };
    }

    if (ratingValue.trim()) {
      softwareSchema.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: ratingValue.trim(),
        bestRating: "5",
        reviewCount: reviewCount.trim() || "1",
      };
    }

    // Clean undefined
    Object.keys(softwareSchema).forEach(k => {
      if (softwareSchema[k] === undefined) delete softwareSchema[k];
    });

    const orgSchema = {
      "@context": "https://schema.org/",
      "@type": "Organization",
      name: name.trim(),
      url: url.trim() || undefined,
    };

    const faqSchema = {
      "@context": "https://schema.org/",
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: `What is ${name.trim()}?`, acceptedAnswer: { "@type": "Answer", text: description.trim() || `${name.trim()} is a software platform that helps businesses work smarter.` } },
        { "@type": "Question", name: "Is there a free trial?", acceptedAnswer: { "@type": "Answer", text: `Yes, ${name.trim()} offers a free trial. Visit our pricing page for details.` } },
        { "@type": "Question", name: "How do I get support?", acceptedAnswer: { "@type": "Answer", text: "Contact us via email or live chat. We respond within 24 hours." } },
      ],
    };

    setGenerated({
      software: JSON.stringify(softwareSchema, null, 2),
      organization: JSON.stringify(orgSchema, null, 2),
      faq: JSON.stringify(faqSchema, null, 2),
      copyBlock: `${JSON.stringify(softwareSchema)}\n${JSON.stringify(orgSchema)}\n${JSON.stringify(faqSchema)}`,
    });
    setLoading(false);
  };

  const copyAll = () => {
    if (generated) {
      navigator.clipboard.writeText(generated.copyBlock);
      alert("Copied! Paste into your site's <head> section.");
    }
  };

  if (authLoading) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full" /></main>;
  if (!user) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to access</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div></main>;

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 py-10 space-y-8">
      <div>
        <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
        <h1 className="text-3xl font-bold mt-1">💻 SaaS Schema Generator</h1>
        <p className="text-zinc-400 text-sm mt-1">Generate SoftwareApplication + Organization + FAQPage JSON-LD for your SaaS site. Copy and paste into your &lt;head&gt;.</p>
      </div>

      <form onSubmit={generate} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Software Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. TallyAssistant" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Website URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://tallyassistant.com" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="TallyAssistant helps small businesses automate invoicing, expense tracking, and tax preparation..." rows={2} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="">Select category...</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Starting Price ($)</label>
            <input value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 29" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Screenshot URL</label>
            <input value={screenshot} onChange={e => setScreenshot(e.target.value)} placeholder="https://yoursite.com/screenshot.png" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Key Features <span className="text-zinc-600">(one per line)</span></label>
          <textarea value={features} onChange={e => setFeatures(e.target.value)} placeholder="Unlimited invoicing&#10;Expense tracking with AI categorization&#10;Real-time tax estimates&#10;Multi-currency support" rows={4} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y font-mono text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Rating (out of 5)</label>
            <input value={ratingValue} onChange={e => setRatingValue(e.target.value)} placeholder="e.g. 4.7" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Number of Reviews</label>
            <input value={reviewCount} onChange={e => setReviewCount(e.target.value)} placeholder="e.g. 230" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
        </div>
        <button type="submit" disabled={loading || !name.trim()} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition">
          {loading ? "Generating..." : "🔧 Generate Schema"}
        </button>
      </form>

      {generated && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Generated JSON-LD</h3>
            <button onClick={copyAll} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition">📋 Copy All</button>
          </div>

          {[
            { title: "🤖 SoftwareApplication Schema", code: generated.software, border: "border-emerald-800" },
            { title: "🏢 Organization Schema", code: generated.organization, border: "border-blue-800" },
            { title: "❓ FAQPage Schema", code: generated.faq, border: "border-amber-800" },
          ].map(section => (
            <details key={section.title} className={`bg-zinc-900 border ${section.border} rounded-xl overflow-hidden`}>
              <summary className="px-5 py-3 text-sm font-medium text-zinc-200 cursor-pointer hover:bg-zinc-800/50">{section.title}</summary>
              <pre className="px-5 pb-4 text-xs text-emerald-400 overflow-x-auto max-h-80 whitespace-pre-wrap">{section.code}</pre>
            </details>
          ))}

          <div className="bg-emerald-900/10 border border-emerald-800 rounded-xl p-4">
            <p className="text-sm text-zinc-300 mb-2"><strong>How to install:</strong></p>
            <ol className="text-xs text-zinc-400 space-y-1 list-decimal pl-4">
              <li>Click <strong>Copy All</strong> above</li>
              <li>Open your SaaS site&apos;s HTML template</li>
              <li>Paste inside the <code className="bg-zinc-800 px-1 rounded">&lt;head&gt;</code> tag</li>
              <li>Or: install <Link href="/inject-guide" className="text-emerald-400 underline">inject-saas.js</Link> to do this automatically</li>
            </ol>
          </div>
        </div>
      )}
    </main>
  );
}
