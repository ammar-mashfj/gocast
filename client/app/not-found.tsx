import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { IconArrowLeft } from "@tabler/icons-react"

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <Link href="/" className="mb-12">
        <Image src="/logo.svg" alt="GoCast" width={171} height={27} className="w-[100px] h-auto" />
      </Link>

      {/* Decorative "404" glyph — real heading is below so crawlers and
          screen readers get the actual page topic as the h1. */}
      <div
        aria-hidden="true"
        className="text-[120px] font-bold leading-none -tracking-wider text-muted-foreground/20 mb-2"
      >
        404
      </div>
      <h1 className="text-xl font-medium mb-2">Page not found</h1>
      <p className="text-sm text-muted-foreground mb-8 max-w-xs text-center">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 bg-violet-full text-white px-6 py-3 rounded-lg text-sm font-medium no-underline shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:shadow-[0_8px_30px_rgba(139,92,246,0.4)] transition-all"
      >
        <IconArrowLeft size={16} />
        Back to GoCast
      </Link>
    </div>
  )
}
