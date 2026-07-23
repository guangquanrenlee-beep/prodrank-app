import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ProdRank — AI Agent Commerce SEO",
  description:
    "Monitor and optimize your product visibility in ChatGPT, Gemini, Perplexity, and Claude.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark", "font-sans", geist.variable)}>
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 antialiased min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
