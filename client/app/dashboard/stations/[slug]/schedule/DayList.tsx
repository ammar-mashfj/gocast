"use client"

import { useState } from "react"
import Link from "next/link"
import { IconPlus } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Playlist } from "@/interfaces/Playlist"
import type { StationSchedule } from "@/interfaces/Station"
import { DAY_NAMES } from "./days"
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
                "flex h-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl transition-colors motion-reduce:transition-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet",
                on ? "bg-foreground text-background" : "bg-white/[0.04] text-foreground hover:bg-white/[0.07]",
              )}
            >
              <span className={cn("font-mono text-[10.5px] font-semibold tracking-[0.08em]", !on && "text-muted-foreground")}>
                {DAY_LABEL[weekday]}
              </span>
              <span className={cn("text-lg font-bold leading-5 tabular-nums", weekday === today && !on && "text-violet")}>
                {dates ? dates[i] : " "}
              </span>
              <span className="flex h-1.5 items-center gap-1" aria-hidden="true">
                {hasShow && <span className="size-1.5 rounded-full bg-live" />}
                {hasSlot && <span className={cn("size-1.5 rounded-full", on ? "bg-background/60" : "bg-on-air")} />}
              </span>
            </button>
          )
        })}
      </div>

      {empty ? (
        <p className="rounded-xl bg-white/[0.03] px-4 py-6 text-center text-sm text-muted-foreground">
          {locked
            ? `Nothing on ${DAY_NAMES[day]}.`
            : `Nothing on ${DAY_NAMES[day]} yet. ${defaultPlaylist?.name ?? "Your default playlist"} plays all day.`}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {dayShows.map((show) => (
            <li key={`show-${show.id}`}>
              <Link
                href={showsHref}
                title="Edit in Station settings"
                className="flex gap-3.5 rounded-xl bg-white/[0.03] p-3.5 hover:bg-white/[0.05]"
              >
                <span aria-hidden="true" className="w-1 shrink-0 rounded-full bg-live" />
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
                    "flex w-full gap-3.5 rounded-xl bg-white/[0.03] p-3.5 text-left",
                    !readOnly && "cursor-pointer hover:bg-white/[0.05]",
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
            <li className="flex gap-3.5 rounded-xl bg-white/[0.03] p-3.5">
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
          type="button"
          variant="outline"
          className="w-full"
          disabled={addSpan === null}
          title={addSpan === null ? `${DAY_NAMES[day]} is full.` : undefined}
          onClick={() => addSpan && onCreate(day, addSpan)}
        >
          <IconPlus data-icon="inline-start" />
          Add slot on {DAY_NAMES[day]}
          {addSpan && (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
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
        <span className="font-mono text-[12px] text-muted-foreground tabular-nums">{time}</span>
        <span className="truncate text-[15px] font-semibold">{title}</span>
        <span className={cn("truncate text-xs", subTone === "fault" ? "text-fault-text" : "text-muted-foreground")}>{sub}</span>
      </span>
      {now && (
        <span className="h-fit shrink-0 rounded-md bg-on-air px-1.5 py-1 font-mono text-[10px] font-semibold tracking-[0.08em] text-black">
          NOW
        </span>
      )}
    </>
  )
}

/**
 * The day-of-month for each of this week's days, Monday first, on the
 * station's calendar (or the browser's without a zone). A station in Tokyo
 * can already be on tomorrow when its owner in Lisbon opens the page.
 */
function weekDates(timeZone: string | null): number[] {
  let today: Date
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone ?? undefined,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(new Date())
    const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "", 10)
    today = new Date(get("year"), get("month") - 1, get("day"))
  } catch {
    today = new Date()
  }
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  return WEEK_ORDER.map((_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.getDate()
  })
}
