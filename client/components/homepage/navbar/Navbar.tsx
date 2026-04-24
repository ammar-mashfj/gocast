import Link from "next/link"
import Image from "next/image"
import { cookies } from "next/headers"
import { User } from "@/interfaces/User"
import UserMenu from "./UserMenu"
import MobileMenu from "./MobileMenu"

const NAV_LINKS = [
  { label: "How it works", href: "/#features" },
  { label: "Pricing", href: "/#pricing" },
] as const

export default async function Navbar() {
  const cookieStore = await cookies()
  const userCookie = cookieStore.get("user")?.value
  const user: User | null = userCookie
    ? JSON.parse(decodeURIComponent(userCookie))
    : null

  return (
    <nav className="flex items-center justify-between px-4 md:px-10 py-4 md:py-5 relative z-10">
      <Link href="/" className="-tracking-wide no-underline">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.svg" alt="GoCast" width={171} height={27} className="w-20 h-auto md:w-[100px]" priority />
          <span className="inline-flex items-center rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200">
            Beta
          </span>
        </div>
      </Link>
      <div className="flex items-center gap-4 md:gap-8">
        {NAV_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="hidden sm:inline text-white text-base no-underline tracking-wide hover:text-white/80 transition-colors"
          >
            {link.label}
          </a>
        ))}
        {user ? (
          <UserMenu name={user.name} />
        ) : (
          <div className="hidden sm:flex items-center gap-2 md:gap-3">
            <Link
              href="/auth/login"
              className="text-text-muted text-sm md:text-base tracking-wide hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/auth/register"
              className="bg-violet-full/15 border border-violet-border/50 text-white text-sm md:text-sm tracking-wide px-3 md:px-4 py-1.5 rounded-lg hover:bg-violet-full/25 hover:border-violet-border transition-all no-underline"
            >
              Sign up
            </Link>
          </div>
        )}
        <MobileMenu links={NAV_LINKS} authed={!!user} />
      </div>
    </nav>
  )
}
