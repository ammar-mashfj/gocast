"use client"

import { useStationStatus } from "@/hooks/useStationStatus"
import { formatSlotInstant, describeProgramme } from "@/lib/programme"
import { cn } from "@/lib/utils"
import type { Programme, StationSchedule } from "@/interfaces/Station"

interface Props {
  slug: string
  locked: boolean
  programme: Programme | null
  timezone: string | null
  defaultName: string | null
  shows: StationSchedule[]
  /** "TUE 14:20" on the station's clock, or null before mount / without a zone. */
  clock: string | null
}

/**
 * What the station is doing right now, above the week.
 *
 * The headline comes from the live status poll, never from the schedule: the
 * schedule only says which playlist AutoDJ has LINED UP, and saying "Morning
 * jazz is playing" for a station that is off, or while someone is live, is
 * exactly the kind of claim this page used to get wrong.
 */
export function ScheduleStatus({ slug, locked, programme, timezone, defaultName, shows, clock }: Props) {
  const { status } = useStationStatus(slug)
  const planned = programme ? describeProgramme(programme, timezone, defaultName) : null

  const next = shows
    .map((s) => ({ show: s, at: s.next_occurrence }))
    .filter((s): s is { show: StationSchedule; at: string } => s.at !== null)
    .sort((a, b) => a.at.localeCompare(b.at))[0]
  const nextShow = next
    ? `Your next show${next.show.label ? `, ${next.show.label},` : ""} is ${formatSlotInstant(next.at, timezone)}.`
    : null

  let pill: { text: string; tone: "live" | "autodj" | "off" | "fault" }
  let headline: string
  let detail: string | null = null

  if (!status) {
    pill = { text: "Checking", tone: "off" }
    headline = "Checking your station…"
  } else if (status.state === "live") {
    pill = { text: "Live", tone: "live" }
    headline = "You're live."
    detail = locked ? null : "AutoDJ steps back in when you stop."
  } else if (status.state === "on_air" && status.source === "autodj") {
    pill = { text: "On air · AutoDJ", tone: "autodj" }
    headline = `${programme?.playlist?.name ?? status.now_playing?.title ?? "AutoDJ"} is playing.`
    detail = planned?.detail ?? null
  } else if (status.state === "starting") {
    pill = { text: "Starting", tone: "off" }
    headline = "Your station is starting."
  } else if (status.state === "offline") {
    pill = { text: "Off", tone: "off" }
    headline = "Your station is off."
    detail = !locked && planned ? `When it's on, AutoDJ plays ${planned.now}.` : null
  } else if (status.state === "degraded") {
    // Same words as the overview pill: named for what the listener gets.
    pill = { text: "Not reaching listeners", tone: "fault" }
    headline = "Your station is on, but listeners aren't hearing it."
    detail = "Check the overview page for what's wrong."
  } else if (status.state === "on_air" && !status.reachable) {
    pill = { text: "Status unknown", tone: "off" }
    headline = "Your station isn't answering right now."
  } else if (status.state === "on_air") {
    // On with nobody live and no AutoDJ: a real state for a Free station
    // (and for a Pro one whose playlists are empty), not a fault.
    pill = { text: "No sound", tone: "off" }
    headline = "Your station is on, but nothing is playing."
    detail = locked
      ? "Listeners hear silence until you go live."
      : "AutoDJ has nothing to play. Add music to your playlists."
  } else {
    pill = { text: "Status unknown", tone: "off" }
    headline = "Your station isn't answering right now."
  }

  const sub = [detail, nextShow].filter(Boolean).join(" ")

  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-card px-5 py-4 sm:flex-row sm:items-center sm:gap-5">
      <span
        className={cn(
          // The design system's StatusLamp, solid: dark ink on red, violet
          // and amber; off air a quiet outline.
          "inline-flex w-fit shrink-0 items-center gap-2 rounded-[10px] px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em]",
          pill.tone === "live" && "bg-live text-live-ink",
          pill.tone === "autodj" && "bg-on-air text-live-ink",
          pill.tone === "off" && "border border-input text-muted-foreground",
          pill.tone === "fault" && "bg-fault text-pro-ink",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            pill.tone === "off" ? "bg-text-faint" : "bg-current",
          )}
        />
        {pill.text}
      </span>
      <div className="min-w-0 flex-1" aria-live="polite">
        <div className="font-medium">{headline}</div>
        {sub && <div className="text-sm text-muted-foreground">{sub}</div>}
      </div>
      {clock && (
        <span className="shrink-0 font-mono text-sm text-muted-foreground tabular-nums" title={`Station time (${timezone})`}>
          {clock}
        </span>
      )}
    </div>
  )
}
