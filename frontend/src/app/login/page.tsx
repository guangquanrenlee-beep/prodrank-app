"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: "https://prodrank.app/dashboard" } });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center">
          <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Back</Link>
          <h1 className="text-2xl font-bold mt-2">Sign in to ProdRank</h1>
          <p className="text-sm text-zinc-400 mt-1">We&apos;ll email you a magic link</p>
        </div>
        {sent ? (
          <div className="bg-emerald-900/20 border border-emerald-800 rounded-xl p-4 text-center">
            <p className="text-emerald-400">Magic link sent! Check {email}</p>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@store.com" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <button type="submit" disabled={loading || !email.trim()} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition">
              {loading ? "Sending..." : "Send Magic Link"}
            </button>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="text-center"><Link href="/signup" className="text-xs text-emerald-400 hover:text-emerald-300">Don&apos;t have an account? Sign up</Link></div>
          </form>
        )}
      </div>
    </main>
  );
}
