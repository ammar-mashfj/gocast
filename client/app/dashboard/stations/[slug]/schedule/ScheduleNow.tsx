"use client"

import type { Programme } from "@/interfaces/Station"
import { useStationStatus } from "@/hooks/useStationStatus"
import { describeProgramme } from "@/lib/programme"
import { Card } from "@/components/ds/Card"

/**
 * Above the week: RIGHT NOW, what AutoDJ has lined up at this moment. (The
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
    const detail = planned.detail ? `${planned.detail.charAt(0).toUpperCase()}${planned.detail.slice(1)}.` : "All day, until another slot starts."
    nowSub = [detail, off ? "AutoDJ is off right now." : null].filter(Boolean).join(" ")
  } else {
    nowTitle = defaultName ?? "Your default playlist"
    nowSub = off ? "What AutoDJ plays when it’s on." : "Plays whenever nothing else is scheduled."
  }

  return (
    <Card size="none" className="gap-1.5 rounded-panel p-5">
      <span className="eyebrow text-text-faint">Right now</span>
      <span className="font-display text-heading">{nowTitle}</span>
      <span className="text-sm text-muted-foreground">{nowSub}</span>
    </Card>
  )
}
