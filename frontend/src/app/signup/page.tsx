"use client";

import Link from "next/link";

export default function SignupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-zinc-950">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="text-5xl">🔒</div>
        <h1 className="text-2xl font-bold text-white">Closed Beta</h1>
        <p className="text-zinc-400 text-sm">
          ProdRank is currently in closed-door testing. New signups are temporarily disabled.
        </p>
        <p className="text-zinc-500 text-xs">
          If you already have an account,{" "}
          <Link href="/login" className="text-emerald-400 hover:text-emerald-300 underline">sign in here</Link>.
        </p>
      </div>
    </main>
  );
}
