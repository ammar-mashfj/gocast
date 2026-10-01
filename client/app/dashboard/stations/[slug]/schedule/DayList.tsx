"use client"

import { useState } from "react"
import Link from "next/link"
import { IconPlus } from "@tabler/icons-react"
import { Button } from "@/components/ds/Button"
import { cn } from "@/lib/utils"
import type { Playlist } from "@/interfaces/Playlist"
import type { StationSchedule } from "@/interfaces/Station"
import { DAY_NAMES } from "./days"
import { weekDates } from "./weekDates"
import { WEEK_ORDER, type Swatch } from "./WeekGrid"
import { DAY_MINUTES, freeSpanAt, segments, toClock, type Block } from "./weekModel"

const DAY_LABEL = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

interface Props {
  blocks: Block[]
  shows: StationSchedule[]
  showsHref: string
  playlists: Playlist[]
  swatchFor: (playlistId: string) => Swatch
  nameFor: (block: Block) => string
  overlaps: Set<string>
  /** Station-clock "now", or null before mount / without a timezone. */
  now: { day: number; minute: number } | null
  /** The station's zone, for the dates on the strip; the browser's when null. */
  timezone: string | null
  /** True after hydration: the strip's dates and the default day come from the clock. */
  mounted: boolean
  locked: boolean
  readOnly: boolean
  onSelect: (key: string) => void
  /** A new slot on `day`, as a week-minute span. */
  onCreate: (day: number, span: [number, number]) => void
}

/**
 * The week as the Android app draws it: a strip of seven days to pick from,
 * then the chosen day's rows top to bottom (mobile/src/app/station/[slug]/schedule.tsx).
 *
 * On a phone the week grid needs 44rem and turns into a sideways scroll of
 * slivers, and a finger can't draw or drag an edge without also scrolling.
 * So below `md` this replaces it: tap a row to open the same slot dialog,
 * "Add slot" puts an hour on the day being looked at, and the page's Save
 * button sends it. Same blocks, same dialog, same save; only the drawing
 * differs.
 *
 * Rows are the day's show times (emerald, linking to Station settings), then
 * the AutoDJ slots (violet, by playlist swatch), or the default playlist all
 * day when no slot falls on it. "Now" marks the row the station's clock is
 * in; what is actually playing is the banner's job, never this list's.
 */
export function DayList({
  blocks,
  shows,
  showsHref,
  playlists,
  swatchFor,
  nameFor,
  overlaps,
  now,
  timezone,
  mounted,
  locked,
  readOnly,
  onSelect,
  onCreate,
}: Props) {
  const [picked, setPicked] = useState<number | null>(null)
  // Today on the station's clock once it ticks, the browser's until then;
  // Monday on the server so the markup is stable through hydration.
  const today = mounted ? (now?.day ?? new Date().getDay()) : null
  const day = picked ?? today ?? 1
  const isToday = today === day
  const dates = mounted ? weekDates(timezone) : null

  const byId = new Map(playlists.map((p) => [p.id, p]))
  const defaultPlaylist = playlists.find((p) => p.is_default) ?? null

  const describe = (p: Playlist | undefined, lead: string) => {
    if (!p) return lead
    const parts = [lead]
    if (p.track_count !== undefined) parts.push(`${p.track_count} ${p.track_count === 1 ? "track" : "tracks"}`)
    parts.push(p.order === "shuffle" ? "on shuffle" : "in order")
    return parts.join(" · ")
  }

  const dayShows = shows
    .filter((s) => s.days.includes(day))
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
  const daySegments = blocks
    .flatMap(segments)
    .filter((s) => s.day === day)
    .sort((a, b) => a.from - b.from)

  const inNow = (from: number, to: number) => isToday && now !== null && now.minute >= from && now.minute < to

  // Where "Add slot" puts an hour: the first free hour from now on today,
  // from 06:00 on any other day, wrapping round the day before giving up.
  let addSpan: [number, number] | null = null
  if (!locked && !readOnly) {
    const first = isToday && now ? Math.min(23, Math.ceil(now.minute / 60)) : 6
    for (let i = 0; i < 24 && !addSpan; i++) {
      addSpan = freeSpanAt(blocks, day, ((first + i) % 24) * 60)
    }
  }

  const empty = dayShows.length === 0 && daySegments.length === 0

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Day" className="grid grid-cols-7 gap-1.5">
        {WEEK_ORDER.map((weekday, i) => {
          const on = weekday === day
          const hasShow = shows.some((s) => s.days.includes(weekday))
          const hasSlot = blocks.some((b) => segments(b).some((s) => s.day === weekday))
          return (
            <button
              key={weekday}
              type="button"
              role="tab"
              aria-selected={on}
              aria-label={DAY_NAMES[weekday]}
              onClick={() => setPicked(weekday)}
              className={cn(
                "flex h-17 cursor-pointer flex-col items-center justify-center gap-1 rounded-button transition-colors motion-reduce:transition-none",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "bg-foreground text-background" : "bg-card text-foreground hover:bg-surface-raised",
              )}
            >
              <span className={cn("eyebrow-sm", !on && "text-muted-foreground")}>
                {DAY_LABEL[weekday]}
              </span>
              <span className={cn("font-display text-meter-sm font-extrabold tabular-nums", weekday === today && !on && "text-on-air-text")}>
                {dates ? dates[i].getDate() : " "}
              </span>
              <span className="flex h-1.5 items-center gap-1" aria-hidden="true">
                {hasShow && <span className={cn("size-1.5 rounded-full", on ? "bg-background/50" : "bg-foreground/45")} />}
                {hasSlot && <span className={cn("size-1.5 rounded-full", on ? "bg-background/60" : "bg-on-air")} />}
              </span>
            </button>
          )
        })}
      </div>

      {empty ? (
        <p className="border-t border-line px-1 py-3.5 text-sm text-muted-foreground">
          {locked
            ? `Nothing on ${DAY_NAMES[day]}.`
            : `Nothing on ${DAY_NAMES[day]} yet. ${defaultPlaylist?.name ?? "Your default playlist"} plays all day.`}
        </p>
      ) : (
        <ul className="flex flex-col [&>li+li]:border-t [&>li+li]:border-line">
          {dayShows.map((show) => (
            <li key={`show-${show.id}`}>
              <Link
                href={showsHref}
                title="Edit in Station settings"
                className="flex gap-3.5 rounded-control px-1 py-3 hover:bg-card"
              >
                {/* Your show times: dashed, not red — red is live right now. */}
                <span aria-hidden="true" className="w-0 shrink-0 border-l-3 border-dashed border-foreground/40" />
                <Row time={show.start_time} title={show.label || "Show time"} sub="Show time · on your player page" />
              </Link>
            </li>
          ))}

          {daySegments.map((s) => {
            const swatch = swatchFor(s.block.playlistId)
            const playlist = byId.get(s.block.playlistId)
            const clash = overlaps.has(s.block.key)
            return (
              <li key={`${s.block.key}-${s.head ? "h" : "t"}`}>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => onSelect(s.block.key)}
                  className={cn(
                    "flex w-full gap-3.5 rounded-control px-1 py-3 text-left",
                    !readOnly && "cursor-pointer hover:bg-card",
                    clash && "outline-2 outline-offset-1 outline-fault",
                  )}
                >
                  <span aria-hidden="true" className={cn("w-1 shrink-0 rounded-full", swatch.dot)} />
                  <Row
                    time={s.head ? `${s.block.start} – ${s.block.end}` : `→ ${s.block.end}`}
                    title={nameFor(s.block)}
                    sub={
                      clash
                        ? "Overlaps another slot"
                        : describe(playlist, s.block.label.trim() ? (playlist?.name ?? "AutoDJ") : "AutoDJ")
                    }
                    subTone={clash ? "fault" : undefined}
                    now={inNow(s.from, s.to)}
                  />
                </button>
              </li>
            )
          })}

          {!locked && daySegments.length === 0 && (
            <li className="flex gap-3.5 px-1 py-3">
              <span aria-hidden="true" className="w-1 shrink-0 rounded-full bg-on-air/50" />
              <Row
                time="All day"
                title={defaultPlaylist?.name ?? "Default playlist"}
                sub={describe(defaultPlaylist ?? undefined, "AutoDJ")}
                now={inNow(0, DAY_MINUTES)}
              />
            </li>
          )}
        </ul>
      )}

      {!locked && !readOnly && (
        <Button
          size="lg"
          variant="ghost"
          full
          disabled={addSpan === null}
          title={addSpan === null ? `${DAY_NAMES[day]} is full.` : undefined}
          onClick={() => addSpan && onCreate(day, addSpan)}
        >
          <IconPlus />
          Add slot on {DAY_NAMES[day]}
          {addSpan && (
            <span className="font-mono text-caption text-muted-foreground tabular-nums">
              {toClock(addSpan[0])}–{toClock(addSpan[1])}
            </span>
          )}
        </Button>
      )}
    </div>
  )
}

function Row({
  time,
  title,
  sub,
  subTone,
  now = false,
}: {
  time: string
  title: string
  sub: string
  subTone?: "fault"
  now?: boolean
}) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-mono text-caption text-muted-foreground tabular-nums">{time}</span>
        <span className="truncate font-display text-lead font-bold">{title}</span>
        <span className={cn("truncate text-body-sm", subTone === "fault" ? "text-fault-text" : "text-text-faint")}>{sub}</span>
      </span>
      {now && (
        <span className="h-fit shrink-0 rounded-tag bg-on-air px-1.5 py-1 eyebrow-sm text-live-ink">
          NOW
        </span>
      )}
    </>
  )
}
