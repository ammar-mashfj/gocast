"use client"

import type { BroadcastStats } from "@/hooks/useBroadcastStats"
import type { TransportHealth } from "@/components/studio/signal"
import { formatBytes, formatClock } from "@/lib/format"
import { cn } from "@/lib/utils"
import { DEFAULT_BITRATE } from "@/lib/audioEngine"

/**
 * The show's four numbers, as a strip across the top of the studio (above
 * both columns, so what's playing and the running order stay together):
 * how long you've been on, who's listening now, the most at once so far,
 * and how much audio has been lost on the way out — green while it's none.
 * Audio lost carries the bitrate going out and the data sent under it. The
 * go-live check and the in-show step-down can both lower the bitrate, and a
 * host should be able to see that: amber below the default, when the line
 * is the reason.
 */
export function StudioStats({
  stats,
  transport,
}: {
  stats: BroadcastStats
  transport: TransportHealth
}) {
  const lost = (transport.stats?.droppedMs ?? 0) / 1000
  return (
    // Hairlines between cells from the strip's own fill showing through a
    // 1px gap: works for a row of four and for the phone's 2×2 alike.
    <div className="grid grid-cols-4 gap-px overflow-hidden rounded-card bg-line max-md:rounded-panel">
      {/* No "since 7:39 PM": a show can run past midnight, or for days. */}
      {/* The listener delay, here rather than on the talk pad: it qualifies
          what "on air" means, in one short line. */}
      <Cell
        label="On air"
        value={formatClock(stats.elapsed)}
        sub={transport.stats?.ingest === "relay" ? "heard a few s later" : "heard 15–20 s later"}
      />
      <Cell label="Listening" value={stats.listeners ?? "—"} sub={stats.listeners ? "right now" : "nobody yet"} />
      <Cell label="Peak" value={stats.peak} sub="most at once" />
      <Cell
        label="Audio lost"
        value={lost > 0 ? `${lost.toFixed(1)} s` : "0 s"}
        good={lost === 0}
        sub={<Outgoing kbps={transport.stats?.bitrate ?? null} bytesSent={transport.stats?.bytesSent ?? 0} />}
      />
    </div>
  )
}

/** One number in the strip: label, value, then its detail on a line of its own. */
function Cell({ label, value, sub, good }: { label: string; value: React.ReactNode; sub?: React.ReactNode; good?: boolean }) {
  return (
    // Tight: a cell holds a label, a number and one short line — padding
    // beyond that was just empty card.
    // Phones: one compact row of four — label and number only, so the
    // running order keeps the screen.
    <div className="flex min-w-0 flex-col gap-1 bg-card px-4 py-3 max-md:gap-0.5 max-md:px-2.5 max-md:py-2 sm:px-5">
      <span className="eyebrow font-medium text-text-faint">{label}</span>
      <span className={cn("font-display text-meter-sm font-bold tabular-nums max-md:text-body xl:text-meter", good && "text-ok")}>{value}</span>
      {sub && <span className="min-w-0 truncate text-caption text-text-faint max-md:hidden">{sub}</span>}
    </div>
  )
}

/** The bitrate going out, then the data sent, on one line. */
function Outgoing({ kbps, bytesSent }: { kbps: number | null; bytesSent: number }) {
  if (kbps === null) return null
  const slow = kbps < DEFAULT_BITRATE
  return (
    // One line, cut short if it must: wrapping made the cell jump between one
    // and two lines as the "sent" figure grew.
    <span className="block truncate">
      <span
        className={slow ? "text-fault-text" : undefined}
        title={slow ? "Your upload can’t keep up with full quality, so the studio is sending less to stay on air." : undefined}
      >
        {kbps} kbps{slow && " · slow line"}
      </span>
      {" · "}
      {formatBytes(bytesSent)} sent
    </span>
  )
}
