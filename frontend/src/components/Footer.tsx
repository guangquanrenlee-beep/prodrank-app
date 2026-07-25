import Link from "next/link";
export default function Footer() {
  return (<footer className="border-t border-zinc-800 py-8 px-4 bg-zinc-950"><div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-zinc-600"><div className="flex gap-4"><Link href="/terms" className="hover:text-zinc-400">Terms of Service</Link><Link href="/privacy" className="hover:text-zinc-400">Privacy Policy</Link><Link href="/refund" className="hover:text-zinc-400">Refund Policy</Link><Link href="/contact" className="hover:text-zinc-400">Contact</Link><Link href="/about" className="hover:text-zinc-400">About</Link></div><div>© 2026 ProdRank. All rights reserved.</div></div></footer>);
}
