"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (user?.email) setEmail(user.email); }, [user]);

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

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold">Account</h3>
          <div><label className="text-sm text-zinc-400">Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full mt-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
          <button onClick={handleSave} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition">{saved ? "Saved ✓" : "Save"}</button>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold">Plan</h3>
          <div className="flex items-center gap-3"><span className="text-sm bg-zinc-800 px-3 py-1 rounded-full text-zinc-300">Free</span><Link href="/pricing" className="text-sm text-emerald-400 hover:text-emerald-300">Upgrade →</Link></div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
          <h3 className="font-semibold">Integrations</h3>
          <div className="flex items-center justify-between"><div><div className="text-sm text-zinc-200">Shopify</div><div className="text-xs text-zinc-500">Connect your store via OAuth</div></div><Link href="/api/shopify/install?shop=yourstore.myshopify.com" className="text-sm text-emerald-400 hover:text-emerald-300">Connect →</Link></div>
          <div className="flex items-center justify-between"><div><div className="text-sm text-zinc-200">WordPress</div><div className="text-xs text-zinc-500">Install the ProdRank plugin</div></div><Link href="/wordpress" className="text-sm text-emerald-400 hover:text-emerald-300">Install →</Link></div>
        </div>

        <button onClick={() => supabase.auth.signOut()} className="text-sm text-red-400 hover:text-red-300">Sign out</button>
      </main>
    </div>
  );
}
