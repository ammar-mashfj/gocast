import type { Metadata } from "next"
import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"
import { Wordmark } from "@/components/homepage/Wordmark"

// Auth surfaces should never show up in search results — don't want to rank
// for "GoCast login" over the homepage. Child pages can still follow links
// out of here so crawlers discover the rest of the site.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

/**
 * The auth pages wear the design system the way the homepage does:
 * `data-surface="marketing"` is what app/dashboard.css scopes the warm
 * palette and the ds tokens to.
 *
 * No menu, on purpose: the page has one job and a menu is five ways to leave
 * it. A slim bar instead — the wordmark (a link, as everywhere) and the exit
 * named in words, because a bare logo is not a reliable signal that it is
 * one. The card itself carries the switch between sign in and sign up.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="marketing" className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="mx-auto flex min-h-17 w-full max-w-page items-center justify-between gap-6 px-gutter py-2.5">
        <Link href="/" className="no-underline" aria-label="GoCast home">
          <Wordmark />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground no-underline transition-colors hover:text-foreground"
        >
          <IconArrowLeft size={15} aria-hidden="true" />
          Back to home
        </Link>
      </header>
      {/* 24px under the card on a phone, not 40: register (the tallest card)
          was 14px over an A55's visible height with the address bar up. */}
      <main className="flex flex-1 flex-col items-center justify-center px-gutter pt-2 pb-6 sm:pb-10">
        {children}
      </main>
    </div>
  )
}
