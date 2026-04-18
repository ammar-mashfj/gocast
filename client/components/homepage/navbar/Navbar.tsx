import Link from "next/link"
import Image from "next/image"
import { cookies } from "next/headers"
import { User } from "@/interfaces/User"
import UserMenu from "./UserMenu"

const NAV_LINKS = [
  { label: "How it works", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Roadmap", href: "/roadmap" },
] as const

export default async function Navbar() {
  const cookieStore = await cookies()
  const userCookie = cookieStore.get("user")?.value
  const user: User | null = userCookie
    ? JSON.parse(decodeURIComponent(userCookie))
    : null

  return (
    <nav className="flex items-center justify-between px-4 md:px-10 py-4 md:py-5 relative z-10">
      <Link href="/" className="-tracking-wide">
        <Image src="/logo.svg" alt="GoCast" width={80} height={80} className="md:w-[100px]" />
      </Link>
      <div className="flex items-center gap-4 md:gap-8">
        {NAV_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="hidden sm:inline text-white text-[15px] no-underline tracking-wide hover:text-white/80 transition-colors"
          >
            {link.label}
          </a>
        ))}
        {user ? (
          <UserMenu name={user.name} />
        ) : (
          <Link
            href="/auth/login"
            className="text-text-muted text-sm md:text-[15px] tracking-wide bg-transparent border-none cursor-pointer hover:text-white/80 transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </nav>
  )
}
