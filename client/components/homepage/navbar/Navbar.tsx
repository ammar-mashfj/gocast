import Link from "next/link"
import Image from "next/image"
import { cookies } from "next/headers"
import { User } from "@/interfaces/User"
import UserMenu from "./UserMenu"

const NAV_LINKS = [
  { label: "How it works", href: "#features" },
  { label: "Pricing", href: "#pricing" },
] as const

export default async function Navbar() {
  const cookieStore = await cookies()
  const userCookie = cookieStore.get("user")?.value
  const user: User | null = userCookie
    ? JSON.parse(decodeURIComponent(userCookie))
    : null

  return (
    <nav className="flex items-center justify-between px-10 py-5 relative z-10">
      <Link href="/" className="-tracking-wide">
        <Image src="/logo.svg" alt="GoCast" width={100} height={100} />
      </Link>
      <div className="flex items-center gap-8">
        {NAV_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="text-white text-[15px] no-underline tracking-wide hover:text-white/80 transition-colors"
          >
            {link.label}
          </a>
        ))}
        {user ? (
          <UserMenu name={user.name} />
        ) : (
          <Link
            href="/auth/login"
            className="text-text-muted text-[15px] tracking-wide bg-transparent border-none cursor-pointer hover:text-white/80 transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </nav>
  )
}
