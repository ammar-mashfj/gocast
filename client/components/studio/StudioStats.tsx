"use client"

import type { BroadcastStats } from "@/hooks/useBroadcastStats"
import type { TransportHealth } from "@/components/studio/signal"
import { formatClock } from "@/lib/format"
import { StatTile } from "@/components/ds/Stat"

/**
 * The show's three numbers, as the prototype has them under Now playing:
 * how long you've been on, who's listening (and the most so far), and how
 * much audio has been lost on the way out — green while it's none.
 */
export function StudioStats({ stats, transport }: { stats: BroadcastStats; transport: TransportHealth }) {
  const lost = (transport.stats?.droppedMs ?? 0) / 1000
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <StatTile label="On air" value={formatClock(stats.elapsed)} />
      <StatTile label="Listening" value={stats.listeners ?? "—"} sub={`peak ${stats.peak}`} />
      <StatTile label="Audio lost" value={lost > 0 ? `${lost.toFixed(1)} s` : "0 s"} good={lost === 0} />
    </div>
  )
}
