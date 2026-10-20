import Link from "next/link"
import { HeroStationPlayer } from "./HeroStationPlayer"
import { OFFICIAL_SLUG } from "./official"
import { TrustCues } from "@/components/common/TrustCues"
import { Button } from "@/components/ds/Button"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { Station } from "@/interfaces/Station"
import { env } from "@/lib/env"
import { publicApiHeaders } from "@/lib/public-api"

interface HeroSectionProps {
  isAuthed?: boolean
}

/**
 * Short revalidate because this is the card that claims to be live. Thirty
 * seconds is the window the rest of the public site uses, and the
 * client-side feed takes over once someone presses play — this fetch only
 * has to get the identity and the stream URLs right.
 */
async function getOfficialStation(): Promise<Station | null> {
  try {
    const res = await fetch(`${env.apiUrl}/public/stations/${OFFICIAL_SLUG}`, {
      headers: publicApiHeaders(),
      next: { revalidate: 30 },
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.data ?? null
  } catch {
    // Never throws. The hero is the first thing rendered on the site and it
    // must survive the API being unreachable — HeroStationPlayer renders an
    // off-air card from a null station.
    return null
  }
}

export default async function HeroSection({ isAuthed = false }: HeroSectionProps) {
  const station = await getOfficialStation()

  return (
    /*
      Three grid children, not two, so the phone can put the player between
      the copy and the call to action: you hear the thing, then you are asked
      to do something about it. The DOM order IS the phone order (copy,
      player, CTA); from lg the placements below fold it back into two
      columns, copy and CTA stacked on the left, the player spanning both
      rows on the right.
    */
    <section id="top" className="scroll-mt-17">
      <div className="mx-auto grid w-full max-w-page items-center gap-10 px-gutter pt-10 pb-14 sm:pt-16 sm:pb-20 lg:grid-cols-2 lg:grid-rows-[auto_auto] lg:gap-x-20 lg:gap-y-7 lg:pt-24 lg:pb-28">
        {/* 1 — copy */}
        <div className="flex min-w-0 flex-col gap-5 sm:gap-7 lg:col-start-1 lg:row-start-1 lg:self-end">
          <StatusLamp tone="onair" pulse>Stations are live right now</StatusLamp>
          <h1 className="font-display text-marquee text-balance">Your voice. On air in 60 seconds.</h1>
          <p className="max-w-[31em] text-standfirst text-muted-foreground text-pretty">
            {isAuthed
              ? "Welcome back. Open your dashboard to manage stations or hit the studio and go live."
              : "Go live from your browser whenever you want — and let AutoDJ hold the station the rest of the week. One shareable link, no app, no listener account."}
          </p>
        </div>

        {/* 2 — the station */}
        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <HeroStationPlayer station={station} />
        </div>

        {/* 3 — one call to action, deliberately. The card above IS listening
            to a station, so a second "listen" link here would only compete
            with it. */}
        <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 lg:col-start-1 lg:row-start-2 lg:self-start">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={isAuthed ? "/dashboard" : "/auth/register"} className="no-underline">
              {isAuthed ? "Open dashboard" : "Create a free station"}
            </Link>
          </Button>
          {!isAuthed && <TrustCues className="justify-start" />}
        </div>
      </div>
    </section>
  )
}
