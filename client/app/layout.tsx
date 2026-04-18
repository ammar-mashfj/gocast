import type { Metadata } from "next";
import Script from "next/script";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const montserrat = Montserrat({ subsets: ['latin'], variable: '--font-sans' });


export const metadata: Metadata = {
  title: "GoCast — Live Radio Streaming",
  description: "Your voice, on air in 60 seconds. Broadcast live radio from your browser.",
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
        {children}
        <Toaster />
        {/* lamejs MP3 encoder — loads after hydration, available before broadcasting starts */}
        <Script src="/lame.min.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
