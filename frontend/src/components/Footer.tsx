import Link from "next/link";
export default function Footer() {
  return (<footer className="border-t border-zinc-800 py-6 px-4 bg-zinc-950"><div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-3 text-sm text-zinc-500"><div className="flex gap-5"><Link href="/terms" className="hover:text-zinc-300 transition">Terms of Service</Link><Link href="/privacy" className="hover:text-zinc-300 transition">Privacy Policy</Link><Link href="/refund" className="hover:text-zinc-300 transition">Refund Policy</Link><Link href="/contact" className="hover:text-zinc-300 transition">Contact</Link><Link href="/about" className="hover:text-zinc-300 transition">About</Link></div><div>© 2026 ProdRank. All rights reserved.</div></div></footer>);
}
