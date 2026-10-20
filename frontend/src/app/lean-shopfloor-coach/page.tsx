import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Lean Shopfloor Coach — Free MCP for Claude | ProdRank",
  description:
    "Free remote MCP for Claude: practical lean / TPS shopfloor coaching (Hoshin, A3, kanban, heijunka, poka-yoke). Not affiliated with Toyota.",
  openGraph: {
    title: "Lean Shopfloor Coach — Free MCP for Claude",
    description:
      "Practical lean shopfloor coaching tools for Claude via MCP. Free beta.",
    url: "https://prodrank.app/lean-shopfloor-coach",
  },
};

const MCP_URL = "https://astarnamed.com/mcp/lean-shopfloor-coach";
const MCP_TOKEN = "c73aaab01dc6d640d759cf655216feda";

const claudeConfig = `{
  "mcpServers": {
    "lean-shopfloor-coach": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${MCP_URL}",
        "--header",
        "Authorization: Bearer ${MCP_TOKEN}"
      ]
    }
  }
}`;

export default function LeanShopfloorCoachPage() {
  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-16 space-y-8">
      <Link href="/" className="text-zinc-500 text-sm">
        ← Home
      </Link>

      <header className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Separate product · Free beta
        </p>
        <h1 className="text-3xl font-bold text-zinc-100">
          Lean Shopfloor Coach
        </h1>
        <p className="text-lg text-zinc-300 leading-relaxed">
          A free MCP for Claude that coaches lean / TPS shopfloor practices as
          practical tools—Hoshin, A3, kanban, heijunka, poka-yoke, and more—not
          a document dump.
        </p>
      </header>

      <section className="space-y-2 text-sm text-zinc-400 leading-relaxed">
        <h2 className="text-lg font-semibold text-zinc-200">What it is</h2>
        <p>
          Lean Shopfloor Coach is an independent mid-level coaching MCP. It is
          not part of the ProdRank AI commerce platform; this page only hosts
          the public landing so you can connect Claude quickly.
        </p>
      </section>

      <section className="space-y-3 text-sm text-zinc-400 leading-relaxed">
        <h2 className="text-lg font-semibold text-zinc-200">
          Connect in Claude Desktop
        </h2>
        <p>
          Remote MCP endpoint (HTTPS):
        </p>
        <pre className="overflow-x-auto rounded-lg bg-zinc-900 border border-zinc-800 p-4 text-xs text-zinc-200 whitespace-pre-wrap break-all">
{MCP_URL}
        </pre>
        <p>Free-beta Bearer token:</p>
        <pre className="overflow-x-auto rounded-lg bg-zinc-900 border border-zinc-800 p-4 text-xs text-zinc-200 whitespace-pre-wrap break-all">
{MCP_TOKEN}
        </pre>
        <p>Example Claude Desktop config (via mcp-remote):</p>
        <pre className="overflow-x-auto rounded-lg bg-zinc-900 border border-zinc-800 p-4 text-xs text-zinc-200 whitespace-pre-wrap">
{claudeConfig}
        </pre>
      </section>

      <section className="space-y-2 text-sm text-zinc-400 leading-relaxed">
        <h2 className="text-lg font-semibold text-zinc-200">Feedback</h2>
        <p>
          Questions or access issues:{" "}
          <a
            className="text-zinc-200 underline underline-offset-2"
            href="mailto:lucasloveyou777@gmail.com"
          >
            lucasloveyou777@gmail.com
          </a>
        </p>
      </section>

      <p className="text-xs text-zinc-600 leading-relaxed border-t border-zinc-800 pt-6">
        Not affiliated with Toyota Motor Corporation. Educational lean coaching
        only. Free beta; token may rotate.
      </p>
    </main>
  );
}