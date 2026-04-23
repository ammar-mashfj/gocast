import Link from "next/link"
import { TrustCues } from "@/components/common/TrustCues"

interface CtaSectionProps {
  isAuthed?: boolean
}

export default function CtaSection({ isAuthed = false }: CtaSectionProps) {
  return (
    <section className="text-center py-12 md:py-24 px-4 md:px-10 relative">
      <div className="absolute top-1/2 left-1/2 w-[280px] md:w-[500px] h-[280px] md:h-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.06)_0%,transparent_65%)] pointer-events-none" />
      <h2 className="text-2xl md:text-4xl lg:text-5xl font-semibold -tracking-[1.5px] mb-4 relative z-1">
        {isAuthed ? "Ready for your next broadcast?" : "Ready to go on air?"}
      </h2>
      <p className="text-sm md:text-base text-text-muted mb-9 relative z-1 max-w-[400px] mx-auto">
        {isAuthed
          ? "Jump back into your dashboard and go live in a click."
          : "Create your station in under a minute. Free forever."}
      </p>
      <Link
        href={isAuthed ? "/dashboard/stations" : "/auth/register"}
        className="relative z-1 inline-block bg-violet-full text-white px-6 md:px-10 py-3 md:py-4 rounded-lg text-sm md:text-base font-medium no-underline cursor-pointer shadow-[0_4px_20px_rgba(139,92,246,0.25)] hover:brightness-110 hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(139,92,246,0.4)] transition-all"
      >
        {isAuthed ? "Open dashboard" : "Start broadcasting free"}
      </Link>
      {!isAuthed && <TrustCues className="relative z-1 mt-6" />}
    </section>
  )
}
