import Link from "next/link"
import { HandoverStack, HandoverSteps, HeroStage } from "./HeroHandover"
import { Button } from "@/components/ds/Button"

interface HeroSectionProps {
  isAuthed?: boolean
}

/**
 * The handover, acted out: 3-2-1, you're on, then AutoDJ takes over. The
 * copy and the button are server-rendered; only the stage (the glow, the
 * step chips and the floating studio) runs on the client. The real station
 * player lives in the next section (HearOneNow).
 */
export default function HeroSection({ isAuthed = false }: HeroSectionProps) {
  return (
    <HeroStage>
      {/*
        Three grid children, so phones and tablets read copy, then the call
        to action, then the studio: under the cards the button fell to the
        bottom of the screen, cut off and far from the line it answers. From
        lg the placements fold it into two columns: copy and CTA stacked on
        the left, the studio spanning both rows on the right.
      */}
      <div className="relative mx-auto grid w-full max-w-page items-center gap-8 px-gutter pt-8 pb-12 sm:pt-12 sm:pb-16 lg:grid-cols-[minmax(0,1fr)_32.5rem] lg:grid-rows-[auto_auto] lg:gap-x-10 lg:gap-y-8 lg:pt-16 lg:pb-20">
        {/* 1 — copy */}
        <div className="flex min-w-0 flex-col gap-4 sm:gap-6 lg:col-start-1 lg:row-start-1 lg:self-end">
          <h1 className="font-display text-marquee text-balance">Your voice. On air in 60 seconds.</h1>
          <p className="max-w-[29em] text-standfirst text-muted-foreground text-pretty">
            {isAuthed
              ? "Welcome back. Open your dashboard to manage stations or hit the studio and go live."
              : "Go live from your browser and your voice takes over. End the show and AutoDJ holds the station until you’re back."}
          </p>
          <HandoverSteps className="hidden lg:flex" />
        </div>

        {/* 2 — one call to action */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 lg:col-start-1 lg:row-start-2 lg:self-start">
          <Button asChild size="xl" className="w-full sm:w-auto">
            <Link href={isAuthed ? "/dashboard" : "/auth/register"} className="no-underline">
              {isAuthed ? "Open dashboard" : "Create a free station"}
            </Link>
          </Button>
        </div>

        {/* 3 — the studio */}
        <HandoverStack className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1" />
      </div>
    </HeroStage>
  )
}
