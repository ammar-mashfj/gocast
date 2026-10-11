import Link from "next/link"
import { getSession } from "@/lib/session"
import { Button } from "@/components/ds/Button"
import { Wordmark } from "@/components/homepage/Wordmark"
import MobileMenu from "./MobileMenu"
import UserMenu from "./UserMenu"

const NAV_LINKS = [
  { label: "How it works", href: "/#features" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Blog", href: "/blog" },
  { label: "Help", href: "/help" },
] as const

/**
 * Shared by the homepage and the rest of the marketing site. Everything here
 * is a token, so it wears the design system on the homepage and the older
 * palette elsewhere without a branch. Sticky, because the homepage is long
 * and its anchors (How it works, Pricing) are the way around it.
 */
export default async function Navbar() {
  const session = await getSession()
  const user = session?.user ?? null

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background">
      <nav className="mx-auto flex min-h-17 w-full max-w-page items-center justify-between gap-6 px-gutter py-2.5">
        <div className="flex items-center gap-10">
          <Link href="/" className="no-underline" aria-label="GoCast home">
            <Wordmark />
          </Link>
          <div className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-semibold text-muted-foreground no-underline transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <UserMenu name={user.name} />
          ) : (
            <div className="hidden items-center gap-4 md:flex">
              <Link
                href="/auth/login"
                className="text-sm font-semibold text-muted-foreground no-underline transition-colors hover:text-foreground"
              >
                Sign in
              </Link>
              <Button asChild size="md">
                <Link href="/auth/register" className="no-underline">Sign up</Link>
              </Button>
            </div>
          )}
          <MobileMenu links={NAV_LINKS} authed={!!user} />
        </div>
      </nav>
    </header>
  )
}
