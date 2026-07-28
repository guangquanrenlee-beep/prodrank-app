"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

interface OptItem {
  id: string; type: string; title: string; productName: string;
  status: string; before: string; after: string; createdAt: string;
}

function getDemos(d: string): OptItem[] {
  return [
    {id:"1",type:"faq",title:"Auto-Generated FAQ",productName:d||"Store",status:"pending",before:"No FAQ found",after:"Q: How to care for this product? A: Follow care instructions. Q: Is it true to size? A: Yes, order usual size. Q: What material? A: Premium quality. Q: Shipping time? A: 5-10 business days. Q: Return policy? A: 30-day return.",createdAt:new Date().toISOString()},
    {id:"2",type:"description",title:"Enhanced Product Description",productName:"Sample Product",status:"pending",before:"Classic T-shirt. Available in multiple colors.",after:"Premium heavyweight cotton T-shirt. Breathable 220GSM fabric, relaxed fit, reinforced stitching. Pre-shrunk. Perfect year-round.",createdAt:new Date(Date.now()-86400000).toISOString()},
    {id:"3",type:"schema",title:"Complete JSON-LD Schema",productName:d||"All Products",status:"pending",before:"3 of 12 fields present",after:"12 of 12 fields: name, description, image, sku, brand, offers, aggregateRating, review, shippingDetails, returnPolicy, gtin, itemCondition",createdAt:new Date(Date.now()-172800000).toISOString()},
  ];
}

export default function OptimizationCenterPage() {
  const { user, loading: l } = useAuth();
  const [domain, setDomain] = useState("");
  const [items, setItems] = useState<OptItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      supabase.from("sites").select("domain").eq("user_id", user.id)
        .order("updated_at", { ascending: false }).limit(1)
        .then(({ data }) => { if (data?.[0]) { setDomain(data[0].domain); setItems(getDemos(data[0].domain)); } });
    }
  }, [user]);

  const approve = async (item: OptItem) => {
    setBusy(true);
    try { await fetch("/api/audit/saas/auto-fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://" + domain }) }); }
    catch {}
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "approved" } : i));
    setBusy(false);
  };

  const regenerate = async (item: OptItem) => {
    setBusy(true);
    try {
      const r = await fetch("/api/audit/saas/auto-fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://" + domain }) });
      if (r.ok) { const d = await r.json(); if (d.copy_paste) setItems(prev => prev.map(i => i.id === item.id ? { ...i, after: d.copy_paste.slice(0, 500) || i.after } : i)); }
    } catch {}
    setBusy(false);
  };

  const openEdit = (item: OptItem) => { setSelected(item.id); setEditingText(item.after || ""); };
  const saveEdit = (item: OptItem) => { setItems(prev => prev.map(i => i.id === item.id ? { ...i, after: editingText } : i)); setSelected(null); };

  const pending = items.filter(i => i.status === "pending").length;
  const approved = items.filter(i => i.status === "approved").length;

  if (l) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full" /></main>;
  if (!user) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to access</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div></main>;

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div>
          <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
          <h1 className="text-3xl font-bold mt-1">🔧 Optimization Center</h1>
          <p className="text-zinc-400 text-sm mt-1">Review and approve AI-generated content before publishing to your store.</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Pending Review", value: pending, color: "text-amber-400" },
            { label: "Approved", value: approved, color: "text-emerald-400" },
            { label: "Last Generated", value: items[0] ? new Date(items[0].createdAt).toLocaleDateString() : "—", color: "text-zinc-400" },
          ].map((s, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-zinc-500">{s.label}</div>
            </div>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-14 text-center space-y-3">
            <div className="text-4xl">📝</div>
            <h3 className="text-lg font-semibold text-white">No optimizations yet</h3>
            <p className="text-zinc-400 text-sm">Run Analyze from Dashboard, then use Auto-Fix to generate optimizations.</p>
            <Link href="/dashboard" className="text-emerald-400 hover:underline text-sm">Go to Dashboard →</Link>
          </div>
        ) : items.map(item => (
          <div key={item.id} className={`bg-zinc-900 border rounded-xl p-6 ${item.status === "approved" ? "border-emerald-800/30" : "border-zinc-800"}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${item.type === "faq" ? "bg-purple-900/30 text-purple-400" : item.type === "description" ? "bg-blue-900/30 text-blue-400" : "bg-amber-900/30 text-amber-400"}`}>
                    {item.type === "faq" ? "FAQ" : item.type === "description" ? "Description" : "JSON-LD"}
                  </span>
                  <h3 className="font-semibold text-white">{item.title}</h3>
                </div>
                <p className="text-xs text-zinc-500 mt-1">{item.productName} · {new Date(item.createdAt).toLocaleDateString()}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${item.status === "pending" ? "bg-amber-900/30 text-amber-400" : "bg-emerald-900/30 text-emerald-400"}`}>
                {item.status === "pending" ? "⏳ Pending Review" : "✅ Approved"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-zinc-800/30 rounded-lg p-4">
                <div className="text-xs text-zinc-500 mb-2">BEFORE</div>
                <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono">{item.before}</pre>
              </div>
              <div className="bg-emerald-900/10 border border-emerald-800/30 rounded-lg p-4">
                <div className="text-xs text-emerald-400 mb-2">AFTER</div>
                {selected === item.id ? (
                  <textarea value={editingText} onChange={e => setEditingText(e.target.value)}
                    className="w-full h-40 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs p-3 resize-y font-mono" />
                ) : (
                  <pre className="text-xs text-emerald-300/80 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">{item.after}</pre>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              {item.status === "pending" && (
                <>
                  <button onClick={() => approve(item)} disabled={busy}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm rounded-lg transition">✅ Approve</button>
                  <button onClick={() => regenerate(item)} disabled={busy}
                    className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm rounded-lg transition">🔄 Regenerate</button>
                  {selected === item.id ? (
                    <button onClick={() => saveEdit(item)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition">💾 Save Edit</button>
                  ) : (
                    <button onClick={() => openEdit(item)} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm rounded-lg transition">✏️ Edit</button>
                  )}
                </>
              )}
              {item.status === "approved" && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">✅ Ready to publish — use Shopify App or inject.js to publish</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
