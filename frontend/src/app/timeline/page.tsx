"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

interface TimelineEvent {
  id: string;
  date: string;
  type: string;
  icon: string;
  title: string;
  detail: string;
  data?: any;
}

const TYPE_COLORS: Record<string, string> = {
  rank: "border-emerald-800 bg-emerald-900/20",
  playground: "border-purple-800 bg-purple-900/20",
  citation: "border-blue-800 bg-blue-900/20",
  verify: "border-amber-800 bg-amber-900/20",
  optimize: "border-green-800 bg-green-900/20",
  opportunity: "border-pink-800 bg-pink-900/20",
};

export default function TimelinePage() {
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [domain, setDomain] = useState("");
  const [loadingMonitor, setLoadingMonitor] = useState(false);
  const [monitorResult, setMonitorResult] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("prodrank_timeline");
      if (raw) setEvents(JSON.parse(raw));
    }
  }, []);

  const clearTimeline = () => {
    if (confirm("Clear all timeline events?")) {
      localStorage.removeItem("prodrank_timeline");
      setEvents([]);
    }
  };

  const runMonitor = async () => {
    if (!domain.trim()) return;
    setLoadingMonitor(true); setMonitorResult("");
    try {
      const res = await fetch("/api/rank/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const data = await res.json();
      setMonitorResult(`${data.brand_name} — ${data.category} — ${data.brand_known ? "Known by AI ✓" : "Not recognized ✗"}`);

      // Add to timeline
      const event: TimelineEvent = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        type: "rank",
        icon: "🏆",
        title: `Rank check: ${data.brand_name}`,
        detail: `Category: ${data.category}. ${data.brand_known ? "AI knows this brand" : "AI doesn't recognize this brand"}`,
        data,
      };
      const updated = [event, ...events].slice(0, 100);
      setEvents(updated);
      localStorage.setItem("prodrank_timeline", JSON.stringify(updated));
    } catch (e: any) { setMonitorResult(`Error: ${e.message}`); }
    setLoadingMonitor(false);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffH < 24) return `${diffH}h ago`;
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  if (authLoading) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="animate-spin h-5 w-5 text-emerald-500 border-2 border-emerald-500 border-t-transparent rounded-full" /></main>;
  if (!user) return <main className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-center space-y-4"><p className="text-zinc-400">Sign in to access</p><Link href="/login" className="text-emerald-400">Sign in →</Link></div></main>;

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      <aside className="w-56 bg-zinc-900 border-r border-zinc-800 shrink-0 flex flex-col p-4">
        <Link href="/dashboard" className="font-bold text-emerald-400 text-lg mb-6">ProdRank</Link>
        <nav className="flex-1 space-y-1">
          {[
            { label: "Dashboard", href: "/dashboard", icon: "📊" },
            { label: "AI Timeline", href: "/timeline", icon: "🕐", active: true },
          ].map(item => (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${(item as any).active ? "bg-emerald-900/30 text-emerald-400" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"}`}>
              <span>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-sm">← Dashboard</Link>
              <h1 className="text-3xl font-bold mt-1">🕐 AI Timeline</h1>
              <p className="text-zinc-400 text-sm mt-1">Chronological history of your AI visibility events. Every rank check, optimization, and discovery logged here.</p>
            </div>
            {events.length > 0 && (
              <button onClick={clearTimeline} className="text-xs text-red-400 hover:text-red-300 px-3 py-1 bg-red-900/20 border border-red-800 rounded-lg transition">Clear all</button>
            )}
          </div>

          {/* Manual trigger */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h3 className="font-semibold mb-3">Quick Domain Check</h3>
            <div className="flex gap-3">
              <input
                value={domain}
                onChange={e => setDomain(e.target.value)}
                placeholder="yourstore.com"
                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button onClick={runMonitor} disabled={loadingMonitor || !domain.trim()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition">
                {loadingMonitor ? "Checking..." : "Check Now"}
              </button>
            </div>
            {monitorResult && <p className="text-sm text-zinc-400 mt-3">{monitorResult}</p>}
          </div>

          {/* Timeline */}
          {events.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
              <div className="text-5xl mb-4">🕐</div>
              <h3 className="text-lg font-semibold text-zinc-300 mb-2">No events yet</h3>
              <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                Your AI timeline fills up as you use ProdRank. Run a domain check above, use the AI Playground, or check rankings — each action creates a timeline entry.
              </p>
              <div className="flex justify-center gap-3 mt-4">
                <Link href="/playground" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition">🧪 Open Playground</Link>
                <Link href="/rank" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition">🏆 Check Rankings</Link>
              </div>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-zinc-800" />

              <div className="space-y-4">
                {events.map((event, i) => {
                  const typeColor = TYPE_COLORS[event.type] || "border-zinc-800 bg-zinc-900";
                  return (
                    <div key={event.id} className="relative pl-14">
                      {/* Dot on timeline */}
                      <div className="absolute left-[1.15rem] top-6 w-3 h-3 rounded-full bg-emerald-500 border-2 border-zinc-950 z-10" />
                      {/* Connector to dot */}
                      <div className="absolute left-9 top-6 w-5 h-0.5 bg-zinc-800" />

                      <div className={`border rounded-xl p-4 ${typeColor}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg">{event.icon}</span>
                              <h4 className="font-medium text-zinc-200">{event.title}</h4>
                            </div>
                            <p className="text-sm text-zinc-400">{event.detail}</p>
                          </div>
                          <div className="text-xs text-zinc-600 whitespace-nowrap">{formatDate(event.date)}</div>
                        </div>
                        {event.data?.best_rank && (
                          <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
                            <span>Best rank: <span className="text-emerald-400 font-bold">#{event.data.best_rank}</span></span>
                            {event.data.mentioned_by?.length > 0 && <span>Mentioned by: <span className="text-emerald-400">{event.data.mentioned_by.join(", ")}</span></span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
