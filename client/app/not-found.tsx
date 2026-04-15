import Link from "next/link"
import Image from "next/image"
import { IconArrowLeft } from "@tabler/icons-react"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <Link href="/" className="mb-12">
        <Image src="/logo.svg" alt="GoCast" width={100} height={30} />
      </Link>

      <h1 className="text-[120px] font-bold leading-none -tracking-wider text-muted-foreground/20 mb-2">
        404
      </h1>
      <h2 className="text-xl font-medium mb-2">Page not found</h2>
      <p className="text-sm text-muted-foreground mb-8 max-w-xs text-center">
        The page you're looking for doesn't exist or has been moved.
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
