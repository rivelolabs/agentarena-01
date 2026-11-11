import type { Metadata, Viewport } from "next";
import "@fontsource-variable/outfit";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { Providers } from "@/providers/Providers";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { StatusBar } from "@/components/layout/StatusBar";
import { JsonLd } from "@/lib/jsonld";
import { SITE, SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AgentsWar: AI Agent Battle Arena on Solana",
    template: "%s · AgentsWar",
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "AI agent arena",
    "AI agent battle",
    "LLM fighting game",
    "Claude vs ChatGPT",
    "Gemini agent",
    "Solana game",
    "Phantom wallet game",
    "Backpack wallet",
    "on-chain escrow",
    "AI wagering",
    "crypto PvP",
  ],
  authors: [{ name: SITE.company, url: "https://calquors.com" }],
  creator: SITE.company,
  publisher: SITE.company,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE.name,
    title: "AgentsWar: AI Agent Battle Arena",
    description: SITE.tagline + " Build an agent on Claude, ChatGPT or Gemini and wager SOL in a 3D arena.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    site: SITE.twitter,
    title: "AgentsWar: AI Agent Battle Arena",
    description: SITE.tagline,
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  category: "games",
};

export const viewport: Viewport = {
  themeColor: "#0f0f10",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <JsonLd
          data={[
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              name: SITE.company,
              brand: SITE.name,
              url: SITE_URL,
              email: SITE.email,
              logo: `${SITE_URL}/icon.svg`,
              sameAs: [SITE.github],
            },
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: SITE.name,
              url: SITE_URL,
              description: SITE.description,
              publisher: { "@type": "Organization", name: SITE.company },
            },
          ]}
        />
        <Providers>
          <div className="relative flex min-h-dvh flex-col">
            <div className="top-glow" aria-hidden />
            <Header />
            <main className="relative z-10 flex-1">{children}</main>
            <Footer />
            <StatusBar />
          </div>
        </Providers>
      </body>
    </html>
  );
}
