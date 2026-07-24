"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true); setError("");
    const { error, data } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: "https://prodrank.app/dashboard" } });
    setLoading(false);
    if (error) {
      if (error.message.includes("already registered") || error.message.includes("already exists")) {
        setError("An account with this email already exists. Please sign in instead.");
      } else {
        setError(error.message);
      }
    } else if (data.user?.identities?.length === 0) {
      setError("This email is already registered. Please sign in.");
    } else {
      setDone(true);
    }
  };

  if (done) return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="text-zinc-400">We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.</p>
        <Link href="/login" className="text-emerald-400 hover:text-emerald-300 text-sm">Go to sign in →</Link>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center">
          <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Back</Link>
          <h1 className="text-2xl font-bold mt-2">Create your account</h1>
          <p className="text-sm text-zinc-400 mt-1">14-day free trial. No card required.</p>
        </div>
        <form onSubmit={handleSignup} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div><label className="block text-sm text-zinc-400 mb-1">Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@store.com" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
          <div><label className="block text-sm text-zinc-400 mb-1">Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
          <p className="text-xs text-zinc-600">You&apos;ll need to confirm your email before signing in.</p>
          <button type="submit" disabled={loading || !email.trim() || !password.trim()} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition">{loading ? "Creating..." : "Create Account"}</button>
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
          <div className="text-center"><Link href="/login" className="text-xs text-emerald-400 hover:text-emerald-300">Already have an account? Sign in</Link></div>
        </form>
      </div>
    </main>
  );
}
