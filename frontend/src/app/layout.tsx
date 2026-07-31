import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Footer from "@/components/Footer";
import CookieBanner from "@/components/CookieBanner";
import { AuthProvider } from "@/components/AuthProvider";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ProdRank — Make AI Recommend Your Products",
  description:
    "Find Out Why AI Doesn't Recommend Your Products — And Fix It.",
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
        <script dangerouslySetInnerHTML={{ __html: "(function(){var A=window.location.hostname===\"localhost\"?\"http://localhost:8000\":\"https://api.prodrank.app\";var F=window.fetch;window.fetch=function(u,o){if(typeof u===\"string\"&&u.startsWith(\"/api/\")){u=A+u;o=o||{};o.headers=o.headers||{};try{var s=JSON.parse(localStorage.getItem(\"sb-reqacknemyxnyqzkvrpe-auth-token\")||\"{}\");var e=(s.user||{}).email;if(e)o.headers[\"X-User-Email\"]=e;}catch(_){}}return F(u,o);}})();" }} />
      </head>
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 antialiased min-h-screen flex flex-col`}>
        <AuthProvider>
          <div className="flex-1">{children}</div>
          <Footer />
          <CookieBanner />
        </AuthProvider>
      </body>
    </html>
  );
}
