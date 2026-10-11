import Link from "next/link"
import { Button } from "@/components/ds/Button"
import { TrustCues } from "@/components/common/TrustCues"

interface CtaSectionProps {
  isAuthed?: boolean
}

export default function CtaSection({ isAuthed = false }: CtaSectionProps) {
  return (
    <section className="border-t border-line">
      <div className="mx-auto flex w-full max-w-page flex-col items-center gap-6 px-gutter py-16 text-center sm:py-24 lg:py-32">
        <h2 className="font-display text-marquee text-balance">
          {isAuthed ? "Ready for your next broadcast?" : "Ready to go on air?"}
        </h2>
        <p className="text-standfirst text-muted-foreground">
          {isAuthed
            ? "Jump back into your dashboard and go live in a click."
            : "Create your station in under a minute. Free forever."}
        </p>
        <Button asChild size="xl" className="w-full sm:w-auto">
          <Link href={isAuthed ? "/dashboard/stations" : "/auth/register"} className="no-underline">
            {isAuthed ? "Open dashboard" : "Start broadcasting free"}
          </Link>
        </Button>
        {!isAuthed && <TrustCues />}
      </div>
    </section>
  )
}
