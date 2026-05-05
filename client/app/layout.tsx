import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { env } from "@/lib/env";

const montserrat = Montserrat({ subsets: ['latin'], variable: '--font-sans' });

const SITE_TITLE = "GoCast — Live Radio Streaming from Your Browser";
const SITE_DESCRIPTION = "Your voice, on air in 60 seconds. Broadcast live internet radio from your browser — no servers, no downloads, just one shareable link.";

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
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "GoCast — Live radio from your browser" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: "@gocastfm",
    creator: "@gocastfm",
    images: ["/og-image.jpg"],
  },
  alternates: { canonical: "/" },
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
      className={cn("dark h-full", "antialiased", "font-sans", montserrat.variable)}
    >
      <head>
        <Script defer src="https://cloud.umami.is/script.js" data-website-id="892346df-9d2f-4c40-b76b-442a74ee4557" strategy="afterInteractive" />
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-44FJYHJWQR" strategy="afterInteractive" />
        <Script id="gtag-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-44FJYHJWQR');`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        {/* JSON-LD as a native <script> per the Next.js docs guide —
            (https://nextjs.org/docs/app/guides/json-ld). Lives in the body
            so it stays clear of head-injecting browser extensions that
            otherwise cause hydration mismatches.
            `\u003c` substitution closes the XSS hole that JSON.stringify
            doesn't cover (per the same guide). */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(ORG_JSON_LD).replace(/</g, "\\u003c"),
          }}
        />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
