"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

const MODES = [
  { key: "ecommerce", label: "🛒 Ecommerce Store", desc: "Shopify, WooCommerce, or any online store selling physical products." },
  { key: "saas", label: "💻 SaaS / Software", desc: "Software tools, SaaS platforms, apps, or digital services." },
];

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState("ecommerce");

  useEffect(() => {
    if (user?.email) setEmail(user.email);
    const saved = localStorage.getItem("prodrank_dashboard_mode");
    if (saved === "saas" || saved === "ecommerce") setMode(saved);
  }, [user]);

  const saveMode = (m: string) => {
    setMode(m);
    localStorage.setItem("prodrank_dashboard_mode", m);
  };

  const handleSave = async () => {
    if (!email.trim()) return;
    const { error } = await supabase.auth.updateUser({ email });
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
  };

  if (authLoading) return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="flex items-center gap-3 text-zinc-400">
        <svg className="animate-spin h-5 w-5 text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
        <span>Restoring session…</span>
      </div>
    </main>
  );

  if (!user) return (
    <main className="min-h-screen flex items-center justify-center"><p className="text-zinc-400">Sign in to access settings</p></main>
  );

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      <aside className="w-56 bg-zinc-900 border-r border-zinc-800 shrink-0 flex flex-col p-4">
        <Link href="/dashboard" className="font-bold text-emerald-400 text-lg mb-6">ProdRank</Link>
        <nav className="flex-1 space-y-1">
          {[{ label: "Dashboard", href: "/dashboard", icon: "📊" }, { label: "Settings", href: "/settings", icon: "⚙️" }].map(item => (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${item.href === "/settings" ? "bg-emerald-900/30 text-emerald-400" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"}`}>
              <span>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 max-w-2xl px-10 py-10 space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>

        {/* Dashboard Mode */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold">Dashboard Mode</h3>
          <p className="text-xs text-zinc-500">Choose your site type. Your dashboard will show the right metrics and tools for your business.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {MODES.map(m => (
              <button
                key={m.key}
                onClick={() => saveMode(m.key)}
                className={`rounded-xl p-4 text-left transition border-2 ${mode === m.key ? "border-emerald-600 bg-emerald-900/20" : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"}`}
              >
                <div className="text-lg font-medium text-zinc-200">{m.label}</div>
                <div className="text-xs text-zinc-500 mt-1">{m.desc}</div>
                {mode === m.key && <div className="text-xs text-emerald-400 mt-2">✓ Active</div>}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold">Account</h3>
          <div><label className="text-sm text-zinc-400">Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
          <button onClick={handleSave} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition">{saved ? "Saved ✓" : "Save"}</button>
        </div>

        {/* Email Preferences */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">📧 Email Reports</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Weekly AI visibility reports sent every Monday. Track your score, competitors, and alerts.</p>
            </div>
          </div>
          <EmailToggle label="Weekly Score Report" desc="Your AI Visibility Score, breakdown, and competitor watch — every Monday morning." storageKey="email_weekly" />
          <EmailToggle label="Competitor Alerts" desc="Get notified when a competitor's score changes significantly." storageKey="email_competitors" />
          <EmailToggle label="Score Drop Alerts" desc="Instant alert if your score drops more than 5 points." storageKey="email_drops" />
          <button
            onClick={async () => {
              try {
                const res = await fetch("/api/email/send-weekly", { method: "POST" });
                if (res.ok) {
                  const data = await res.json();
                  alert(data.status === "sent" ? `✅ Test report sent to ${data.email}. Check your inbox!` : `⚠️ ${data.message || "Failed to send"}`);
                } else {
                  alert("Failed. Make sure you have at least one site analyzed and RESEND_API_KEY is set on the server.");
                }
              } catch { alert("Network error"); }
            }}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-medium rounded-lg transition">
            📨 Send Test Email
          </button>
          <p className="text-xs text-zinc-600">
            Powered by Resend. Set <code className="bg-zinc-800 px-1 rounded">RESEND_API_KEY</code> env var on your VPS.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold">Plan</h3>
          <div className="flex items-center gap-3"><span className="text-sm bg-zinc-800 px-3 py-1 rounded-full text-zinc-300">Free</span><Link href="/pricing" className="text-sm text-emerald-400 hover:text-emerald-300">Upgrade →</Link></div>
        </div>

        {mode === "ecommerce" ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            <h3 className="font-semibold">Integrations</h3>
            <div className="flex items-center justify-between"><div><div className="text-sm text-zinc-200">Shopify</div><div className="text-xs text-zinc-500">Connect your store via OAuth</div></div><Link href="/api/shopify/install?shop=yourstore.myshopify.com" className="text-sm text-emerald-400 hover:text-emerald-300">Connect →</Link></div>
            <div className="flex items-center justify-between"><div><div className="text-sm text-zinc-200">WordPress</div><div className="text-xs text-zinc-500">Install the ProdRank plugin</div></div><Link href="/wordpress" className="text-sm text-emerald-400 hover:text-emerald-300">Install →</Link></div>
            <div className="flex items-center justify-between"><div><div className="text-sm text-zinc-200">Any Platform</div><div className="text-xs text-zinc-500">One line inject.js</div></div><Link href="/inject-guide" className="text-sm text-emerald-400 hover:text-emerald-300">Install →</Link></div>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            <h3 className="font-semibold">Integrations</h3>
            <div className="flex items-center justify-between"><div><div className="text-sm text-zinc-200">inject-saas.js</div><div className="text-xs text-zinc-500">One line of code. Auto-injects SoftwareApplication Schema.</div></div><Link href="/inject-guide" className="text-sm text-emerald-400 hover:text-emerald-300">Get Code →</Link></div>
            <div className="flex items-center justify-between"><div><div className="text-sm text-zinc-200">G2 / Capterra</div><div className="text-xs text-zinc-500">AI cites these for software recommendations.</div></div><a href="https://g2.com" target="_blank" rel="noopener" className="text-sm text-emerald-400 hover:text-emerald-300">Create Listing →</a></div>
            <div className="flex items-center justify-between"><div><div className="text-sm text-zinc-200">Product Hunt</div><div className="text-xs text-zinc-500">Get indexed by AI training data.</div></div><a href="https://producthunt.com" target="_blank" rel="noopener" className="text-sm text-emerald-400 hover:text-emerald-300">Submit →</a></div>
          </div>
        )}

        <button onClick={() => supabase.auth.signOut()} className="text-sm text-red-400 hover:text-red-300">Sign out</button>
      </main>
    </div>
  );
}

function EmailToggle({ label, desc, storageKey }: { label: string; desc: string; storageKey: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem(`prodrank_${storageKey}`);
    if (saved === "false") setOn(false);
  }, [storageKey]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    localStorage.setItem(`prodrank_${storageKey}`, String(next));
    // Sync to backend
    fetch("/api/email/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekly_report_enabled: next }),
    }).catch(() => {});
  };

  return (
    <div className="flex items-center justify-between py-2">
      <div><div className="text-sm text-zinc-200">{label}</div><div className="text-xs text-zinc-500">{desc}</div></div>
      <button onClick={toggle} className={`relative w-10 h-6 rounded-full transition ${on ? "bg-emerald-600" : "bg-zinc-700"}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition ${on ? "translate-x-4" : ""}`} />
      </button>
    </div>
  );
}
