"use client"

import type { BroadcastStats } from "@/hooks/useBroadcastStats"
import type { TransportHealth } from "@/components/studio/signal"
import { formatBytes, formatClock } from "@/lib/format"
import { StatTile } from "@/components/ds/Stat"
import { DEFAULT_BITRATE } from "@/lib/audioEngine"

/**
 * The show's three numbers, as the prototype has them under Now playing:
 * how long you've been on, who's listening (and the most so far), and how
 * much audio has been lost on the way out — green while it's none.
 *
 * Each carries one line under it: when the show started; the peak, or that
 * nobody has joined yet; and the bitrate going out with the data sent. The
 * go-live check and the in-show step-down can both lower the bitrate, and a
 * host should be able to see that: amber below the default, when the line
 * is the reason.
 */
export function StudioStats({
  stats,
  transport,
  timeZone,
}: {
  stats: BroadcastStats
  transport: TransportHealth
  /** The station's zone: the start time reads on the same clock as the top bar. Null falls back to the browser's. */
  timeZone: string | null
}) {
  const lost = (transport.stats?.droppedMs ?? 0) / 1000
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <StatTile
        compact
        label="On air"
        value={formatClock(stats.elapsed)}
        sub={
          stats.startedAt
            ? `since ${new Date(stats.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: timeZone ?? undefined })}`
            : undefined
        }
      />
      <StatTile
        compact
        label="Listening"
        value={stats.listeners ?? "—"}
        sub={stats.peak === 0 && !stats.listeners ? "nobody yet" : `peak ${stats.peak}`}
      />
      <StatTile
        compact
        label="Audio lost"
        value={lost > 0 ? `${lost.toFixed(1)} s` : "0 s"}
        good={lost === 0}
        sub={<Outgoing kbps={transport.stats?.bitrate ?? null} bytesSent={transport.stats?.bytesSent ?? 0} />}
      />
    </div>
  )
}

/** The bitrate going out, then the data sent; on a phone's narrow tile they wrap to two lines. */
function Outgoing({ kbps, bytesSent }: { kbps: number | null; bytesSent: number }) {
  if (kbps === null) return null
  const slow = kbps < DEFAULT_BITRATE
  return (
    <span className="flex flex-wrap gap-x-2">
      <span
        className={slow ? "text-fault-text" : undefined}
        title={slow ? "Your upload can’t keep up with full quality, so the studio is sending less to stay on air." : undefined}
      >
        {kbps} kbps{slow && " · slow line"}
      </span>
      <span>{formatBytes(bytesSent)} sent</span>
    </span>
  )
}
