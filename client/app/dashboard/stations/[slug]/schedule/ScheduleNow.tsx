"use client"

import type { Programme } from "@/interfaces/Station"
import { useStationStatus } from "@/hooks/useStationStatus"
import { describeProgramme } from "@/lib/programme"
import { StatusLamp } from "@/components/ds/StatusLamp"

/**
 * Under the page header: RIGHT NOW, what AutoDJ has lined up at this moment,
 * as one line (it was a card, and the page didn't fit a laptop screen). (The
 * prototype's second card, YOUR NEXT SHOW, went with show times.)
 *
 * The plan is labelled as a plan: what the station is actually doing — live,
 * off, silent — is the status band's, above every page, and this page no
 * longer repeats it. When the station is off, the card says the plan is what
 * AutoDJ would play, not that it is playing.
 */
export function ScheduleNow({
  slug,
  locked,
  programme,
  timezone,
  defaultName,
}: {
  slug: string
  locked: boolean
  programme: Programme | null
  timezone: string | null
  defaultName: string | null
}) {
  const { status } = useStationStatus(slug)
  const off = status?.state === "offline"

  let nowTitle: string
  let nowSub: string
  if (locked) {
    nowTitle = "Off air unless you’re live"
    nowSub = "With Pro, AutoDJ plays your music whenever you’re not live."
  } else if (programme) {
    const planned = describeProgramme(programme, timezone, defaultName)
    nowTitle = planned.now
    // describeProgramme's detail is a phrase ("until 10:00 · then Main
    // rotation"), so it gets its full stop here.
    nowSub = planned.detail ? `${planned.detail.charAt(0).toUpperCase()}${planned.detail.slice(1)}.` : "All day, until another slot starts."
  } else {
    nowTitle = defaultName ?? "Your default playlist"
    nowSub = off ? "What AutoDJ plays when it’s on." : "Plays whenever nothing else is scheduled."
  }

  // Violet while AutoDJ would be playing this; grey when it's off or not
  // on the plan, with an "AutoDJ off" chip so the plan isn't read as airing.
  return (
    <div className="-mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <StatusLamp tone={locked || off ? "off" : "onair"} size="sm">Right now</StatusLamp>
      <span className="text-body font-bold text-foreground">{nowTitle}</span>
      <span className="text-body-sm text-muted-foreground">{nowSub}</span>
      {off && !locked && (
        <StatusLamp variant="solid" tone="off" size="sm" className="h-6 px-2.5">AutoDJ off</StatusLamp>
      )}
    </div>
  )
}
