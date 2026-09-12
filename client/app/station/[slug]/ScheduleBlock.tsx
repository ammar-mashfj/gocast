"use client"

import type { StationSchedule } from "@/interfaces/Station"

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/**
 * "Mon–Fri", "Mon, Wed, Fri", "Sun" — contiguous runs collapse to a dash.
 *
 * Runs are found in plain 0–6 order rather than wrapping through Sunday: a
 * Sat+Sun show reads "Sat, Sun", which is what a weekend show is called, and
 * "Sat–Sun" would be the same length anyway.
 */
function formatDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  const runs: number[][] = []

  for (const day of sorted) {
    const last = runs[runs.length - 1]
    if (last && day === last[last.length - 1] + 1) {
      last.push(day)
    } else {
      runs.push([day])
    }
  }

  if (runs.length === 1 && runs[0].length === 7) return "Every day"

  return runs
    .map((run) =>
      run.length >= 3
        ? `${DAY_NAMES[run[0]]}–${DAY_NAMES[run[run.length - 1]]}`
        : run.map((day) => DAY_NAMES[day]).join(", "),
    )
    .join(", ")
}

/** Short zone label for the bracketed original — "GMT+3" rather than the IANA name. */
function zoneAbbrev(instant: Date, timeZone: string): string | null {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName")

  return part?.value ?? null
}

/**
 * One schedule row, restated in the reader's own clock.
 *
 * The days have to move with the time or the row lies. "Sun 22:00" in Damascus
 * is Monday morning in Auckland, and a list that converts the clock but leaves
 * the weekday alone quietly reschedules the DJ's show — worse than not
 * converting at all.
 *
 * `next_occurrence` is what makes this possible without a date library: the
 * server resolved one real instant for this row, so the day and time in any
 * zone are a formatting call on it. The weekday shift derived from that one
 * instant is then applied to the whole day set, which holds because the offset
 * between two zones is the same all week — except across a DST change, where
 * one day of the set can be an hour out. An hour only moves a weekday when the
 * show sits within an hour of midnight, so the row is approximate in a corner
 * of a corner; the station's own time is printed next to it either way.
 *
 * Returns null when the row cannot be converted — a station with no timezone
 * has no `next_occurrence`, and there is nothing to convert from.
 */
function toViewerClock(
  schedule: StationSchedule,
  stationZone: string,
): { days: string; time: string } | null {
  if (!schedule.next_occurrence) return null

  const instant = new Date(schedule.next_occurrence)
  if (Number.isNaN(instant.getTime())) return null

  const stationWeekday = new Intl.DateTimeFormat("en-US", {
    timeZone: stationZone,
    weekday: "short",
  }).format(instant)

  const stationDay = DAY_NAMES.indexOf(stationWeekday)
  if (stationDay < 0) return null

  // Normalised to -1 | 0 | +1: a raw difference of 6 is really a day back.
  let shift = instant.getDay() - stationDay
  if (shift > 1) shift -= 7
  if (shift < -1) shift += 7

  return {
    days: formatDays(schedule.days.map((day) => (day + shift + 7) % 7)),
    time: instant.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  }
}

/**
 * The weekly grid, as sheet content.
 *
 * No disclosure of its own any more: opening the week used to reflow the
 * column it sat in, which on a centred layout moved the artwork and the
 * buttons as well. The panel that owns this decides when it is visible.
 *
 * Two clocks, but only when they disagree. A reader in the station's own zone
 * gets one time per row, because a bracketed copy of the number they are
 * already reading is noise.
 */
export function ScheduleList({
  schedules,
  timezone,
}: {
  schedules: StationSchedule[]
  timezone: string | null
}) {
  const viewerZone = typeof Intl === "undefined" ? null : Intl.DateTimeFormat().resolvedOptions().timeZone
  const showStationZone = timezone !== null && timezone !== viewerZone

  return (
    <>
      <ul className="flex list-none flex-col gap-0 pl-0">
        {schedules.map((schedule) => {
          const viewer = showStationZone && timezone ? toViewerClock(schedule, timezone) : null
          const abbrev =
            viewer && schedule.next_occurrence && timezone
              ? zoneAbbrev(new Date(schedule.next_occurrence), timezone)
              : null

          return (
            <li
              key={schedule.id}
              className="flex items-baseline justify-between gap-4 border-b border-[#2a2344] py-3 text-sm last:border-b-0"
            >
              <span className="text-foreground">{viewer?.days ?? formatDays(schedule.days)}</span>
              <span className="flex flex-col items-end gap-0.5 text-right">
                <span className="flex items-baseline gap-2">
                  {schedule.label && <span className="text-muted-foreground">{schedule.label}</span>}
                  <span className="tabular-nums text-foreground">
                    {viewer?.time ?? schedule.start_time}
                  </span>
                </span>
                {viewer && (
                  <span className="text-xs text-text-faint">
                    ({formatDays(schedule.days)} {schedule.start_time}
                    {abbrev ? ` ${abbrev}` : ""})
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {showStationZone && (
        <p className="mt-4 text-xs text-text-faint">
          Your local time, with the station&apos;s own clock in brackets ({timezone}).
        </p>
      )}
    </>
  )
}
