"use client"

import Link from "next/link"
import type { Programme, StationSchedule } from "@/interfaces/Station"
import { useStationStatus } from "@/hooks/useStationStatus"
import { useMounted } from "@/hooks/useMounted"
import { comingUp } from "@/lib/comingUp"
import { describeProgramme } from "@/lib/programme"
import { Card } from "@/components/ds/Card"

/**
 * Above the week: RIGHT NOW (what AutoDJ has lined up at this moment) and
 * YOUR NEXT SHOW (the next of your show times). The prototype's two cards.
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
  shows,
  settingsHref,
}: {
  slug: string
  locked: boolean
  programme: Programme | null
  timezone: string | null
  defaultName: string | null
  shows: StationSchedule[]
  settingsHref: string
}) {
  const { status } = useStationStatus(slug)
  const mounted = useMounted()
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
    const detail = planned.detail ? `${planned.detail.charAt(0).toUpperCase()}${planned.detail.slice(1)}.` : "All day, until another slot starts."
    nowSub = [detail, off ? "AutoDJ is off right now." : null].filter(Boolean).join(" ")
  } else {
    nowTitle = defaultName ?? "Your default playlist"
    nowSub = off ? "What AutoDJ plays when it’s on." : "Plays whenever nothing else is scheduled."
  }

  const next = mounted ? comingUp({ schedules: shows, programme: null, timeZone: timezone, now: new Date(), limit: 1 })[0] : undefined

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18.75rem),1fr))] gap-5">
      <Card size="none" className="gap-1.5 rounded-panel p-5">
        <span className="eyebrow text-text-faint">Right now</span>
        <span className="font-display text-heading">{nowTitle}</span>
        <span className="text-sm text-muted-foreground">{nowSub}</span>
      </Card>
      <Card size="none" className="gap-1.5 rounded-panel p-5">
        <span className="eyebrow text-text-faint">Your next show</span>
        {next ? (
          <>
            <span className="font-display text-heading">{next.title}</span>
            <span className="text-sm text-muted-foreground">{next.when}. You start it from the studio.</span>
          </>
        ) : (
          <>
            <span className="font-display text-heading">None planned</span>
            <span className="text-sm text-muted-foreground">
              <Link href={settingsHref} className="text-violet-muted hover:underline">Add show times</Link> so listeners know when to come back.
            </span>
          </>
        )}
      </Card>
    </div>
  )
}
