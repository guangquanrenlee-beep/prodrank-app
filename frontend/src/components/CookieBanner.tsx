"use client";
import { useState, useEffect } from "react";

export default function CookieBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => { if (!localStorage.getItem("cookie-consent")) setShow(true); }, []);
  if (!show) return null;
  return (<div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-zinc-900 border border-zinc-700 rounded-xl p-4 shadow-lg z-50">
    <p className="text-xs text-zinc-400 mb-3">We use essential cookies for authentication and analytics. By continuing to use this site, you agree to our <a href="/privacy" className="text-emerald-400 underline">Privacy Policy</a>.</p>
    <button onClick={() => { localStorage.setItem("cookie-consent","1"); setShow(false); }} className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition">Accept</button>
  </div>);
}
