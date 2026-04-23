import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"

// Auth surfaces should never show up in search results — don't want to rank
// for "GoCast login" over the homepage. Child pages can still follow links
// out of here so crawlers discover the rest of the site.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#08080d] px-4">
      <Link href="/" className="mb-8">
        <Image src="/logo.svg" alt="GoCast" width={171} height={27} className="w-[120px] h-auto" />
      </Link>
      {children}
    </div>
  )
}
