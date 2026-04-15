import Link from "next/link"
import Image from "next/image"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#08080d] px-4">
      <Link href="/" className="mb-8">
        <Image src="/logo.svg" alt="GoCast" width={120} height={40} />
      </Link>
      {children}
    </div>
  )
}
