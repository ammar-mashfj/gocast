import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Bricolage_Grotesque, JetBrains_Mono, Onest } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { env } from "@/lib/env";
import { DEFAULT_OG_IMAGE } from "@/lib/seo";

/* The three CSS variables below are what the rest of the app binds to, so
   changing a family here is the whole swap - no component or token touches it.
   `body` sets everything readable, `display` only headings, `mono` only the
   dashboard's keys and URLs.

   Tried so far:
     body:    Onest (active) | DM Sans | Albert Sans

   Shortlisted by eye in /font-lab, then separated on metrics: all three set
   within 1% of each other per character (~7.4px at 15px, near Inter's 7.6),
   which is why they all read as open. Onest wins on x-height (0.530 against
   0.510 and 0.500), so it holds apparent size at 16px where the other two
   would want 17px.
     display: Bricolage Grotesque (active) | Space Grotesk | Instrument Serif

   Two metrics decide the body face, and they pull against each other:
   x-height sets apparent size, per-character advance sets how open the text
   feels. Inter is the benchmark on both. Plus Jakarta Sans sits 1.8% under
   Inter's x-height and within 1.3% of its advance - Inter's readability with
   different shapes. Inter Tight was a mistake here: it matches the x-height
   but sets 10.4% tighter, which reads as crowded letters.
   Swap by changing the import above and the two constructors below. */
const body = Onest({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display-face',
  display: 'swap',
});
/* Mono is only reached in the dashboard (stream keys, ingest URLs), so it
   loads on demand rather than preloading on every marketing page. */
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-face',
  display: 'swap',
  preload: false,
});

const SITE_TITLE = "GoCast — Start an Internet Radio Station in Your Browser";
const SITE_DESCRIPTION = "Go live in 60 seconds, then let AutoDJ keep your station on air 24/7. Browser broadcasting, scheduled playlists and one shareable link — no servers, no downloads.";

export const metadata: Metadata = {
  metadataBase: env.appUrl ? new URL(env.appUrl) : undefined,
  title: {
    default: SITE_TITLE,
    template: "%s — GoCast",
  },
  description: SITE_DESCRIPTION,
  applicationName: "GoCast",
  authors: [{ name: "GoCast" }],
  creator: "GoCast",
  publisher: "GoCast",
  keywords: [
    "internet radio",
    "live radio streaming",
    "browser broadcasting",
    "online radio station",
    "streaming platform",
    "Icecast",
    "live audio",
    "live audio platform",
    "free radio hosting",
  ],
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: "website",
    siteName: "GoCast",
    locale: "en_US",
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: "@gocastfm",
    creator: "@gocastfm",
    images: [DEFAULT_OG_IMAGE.url],
  },
  // No `alternates` here on purpose. Every page that does not set its own
  // inherits this object, so a canonical of "/" here told search engines
  // that /privacy and /terms were duplicates of the homepage. The homepage
  // pins its own.
};

export const viewport: Viewport = {
  themeColor: "#8b5cf6",
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
};

const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${env.appUrl}/#organization`,
      name: "GoCast",
      url: env.appUrl,
      logo: `${env.appUrl}/logo.svg`,
      description: SITE_DESCRIPTION,
      sameAs: [
        "https://x.com/gocastfm",
        "https://www.facebook.com/gocast.fm/",
        "https://www.instagram.com/gocastfm/",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        email: "hello@gocast.fm",
        contactType: "customer support",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${env.appUrl}/#website`,
      url: env.appUrl,
      name: "GoCast",
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${env.appUrl}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${env.appUrl}/#software`,
      name: "GoCast",
      url: env.appUrl,
      operatingSystem: "Web",
      applicationCategory: "MultimediaApplication",
      description: "Live internet radio broadcasting platform that runs entirely in your browser.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "dark h-full",
        "antialiased",
        "font-sans",
        body.variable,
        display.variable,
        mono.variable,
      )}
    >
      <head>
        {/* 
        only load on production environment
      */}
        {process.env.NODE_ENV === "production" && (
          <Script defer src="https://cloud.umami.is/script.js" data-website-id="892346df-9d2f-4c40-b76b-442a74ee4557" strategy="afterInteractive" />
        )}
        {process.env.NODE_ENV === "production" && (
          <Script src="https://www.googletagmanager.com/gtag/js?id=G-44FJYHJWQR" strategy="afterInteractive" />
        )}
        {process.env.NODE_ENV === "production" && (
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-44FJYHJWQR');`}
          </Script>
        )}

      </head>
      <body className="min-h-full flex flex-col">
        {/* JSON-LD as a native <script> per the Next.js docs guide —
            (https://nextjs.org/docs/app/guides/json-ld). Lives in the body
            so it stays clear of head-injecting browser extensions that
            otherwise cause hydration mismatches.
            `\u003c` substitution closes the XSS hole that JSON.stringify
            doesn't cover (per the same guide). */}
        {process.env.NODE_ENV === "production" && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(ORG_JSON_LD).replace(/</g, "\\u003c"),
            }}
          />
        )}
        {children}
        <Toaster />
      </body>
    </html>
  );
}
