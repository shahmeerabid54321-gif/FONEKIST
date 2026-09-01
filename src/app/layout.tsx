import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { publicEnv } from "@/lib/env";
import { features } from "@/lib/features";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BrandSplash, SPLASH_GATE_SCRIPT } from "@/components/brand/splash";
import { CompareTray } from "@/components/compare-tray";
import { HeaderOffset } from "@/components/header-offset";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL),
  title: {
    default: "FONEKIST, phones in Pakistan on cash or installments",
    template: "%s | FONEKIST",
  },
  description:
    "Buy phones in Pakistan with PTA status, warranty and delivery stated on every listing. Pay in full or on a monthly plan with the total cost shown before you apply.",
  applicationName: "FONEKIST",
  openGraph: { type: "website", locale: "en_PK", siteName: "FONEKIST" },
  // The card is `opengraph-image.png`, picked up by file convention. Naming the card type
  // is what makes the logo render at full width rather than as a thumbnail beside the text.
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
};

/**
 * The browser chrome takes the logo's ground in dark mode and the page's in light, so the
 * address bar and the status bar continue the page rather than framing it.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-PK"
      className={`${geistSans.variable} ${geistMono.variable}`}
      // The gate script below sets `data-splash` on this element before React hydrates, so
      // the server markup and the live DOM legitimately differ here. Without this, React
      // treats that as a mismatch and reverts the attribute, which switches the splash off
      // a few hundred milliseconds after it starts.
      suppressHydrationWarning
    >
      {/*
        Decides, before the first paint, whether this document shows the splash.

        `beforeInteractive` rather than a plain `<script>`: React does not execute a script
        element it renders itself, so the tag arrives in the markup and never runs, which
        silently disables the splash. This strategy has Next put it in the document head as
        a real parser-executed script instead. It has to be synchronous and it has to be
        first, because an attribute set after paint would flash the overlay over content the
        customer had already started reading.
      */}
      <head>
        {/*
          Decides, before the first paint, whether this document shows the splash.

          A plain inline script rather than `next/script`: `beforeInteractive` queues the
          code behind Next's own runtime, which is several hundred milliseconds after the
          first frame, so the overlay would appear over content the customer had already
          begun reading. This one is executed by the parser, in the head, before anything is
          painted at all.
        */}
        <script dangerouslySetInnerHTML={{ __html: SPLASH_GATE_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col">
        {/* A11Y-001: a keyboard user reaches the content without traversing the whole header. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[110] focus:rounded-[var(--radius-control)] focus:bg-[var(--surface-raised)] focus:px-4 focus:py-2 focus:text-[var(--text)] focus:shadow-lg"
        >
          Skip to content
        </a>
        {/*
          First in the body so it paints with the first frame rather than after the header
          has already appeared. It sits above everything and intercepts nothing.
        */}
        <BrandSplash />
        <SiteHeader />
        <HeaderOffset />
        {/*
          The single `main` landmark for every route, so the skip link always has a target
          and no page can accidentally ship two or none. Pages render sections inside it.
        */}
        <main id="main" className="flex-1">
          {children}
        </main>
        {/*
          Between the content and the footer, and sticky, so it is reachable in the tab
          order where it appears rather than being fixed over content it does not belong to.
          It renders nothing at all until at least one phone is on the shortlist.
        */}
        {features.comparison && <CompareTray />}
        <SiteFooter />
      </body>
    </html>
  );
}
