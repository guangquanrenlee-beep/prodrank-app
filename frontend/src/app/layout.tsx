import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Footer from "@/components/Footer";
import CookieBanner from "@/components/CookieBanner";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ProdRank — Make AI Recommend Your Products",
  description:
    "Monitor and optimize your product visibility in ChatGPT, Gemini, Perplexity, and Claude.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark", "font-sans", geist.variable)}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var API = "http://98.159.111.217";
            var realFetch = window.fetch;
            window.fetch = function(url, opts) {
              if (typeof url === "string" && url.startsWith("/api/")) {
                url = API + url;
              }
              return realFetch(url, opts);
            };
          })();
        `}} />
      </head>
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 antialiased min-h-screen flex flex-col`}>
        <div className="flex-1">{children}</div>
        <Footer />
        <CookieBanner />
      </body>
    </html>
  );
}
