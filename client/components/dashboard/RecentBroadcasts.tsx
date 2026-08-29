import Link from "next/link"
import { IconArrowRight } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StreamSession, StreamSessionSource } from "@/interfaces/StreamSession"
import { formatDateRange, formatDateTime } from "@/lib/format"

const LIMIT = 5

/**
 * How the broadcaster connected, in the words a broadcaster would use.
 * `browser` is the in-app studio; `external` is anything speaking the Icecast
 * source protocol at harbor directly.
 */
const SOURCE_LABEL: Record<StreamSessionSource, string> = {
  browser: "Studio",
  electron: "Desktop",
  external: "Encoder",
}

interface RecentBroadcastsProps {
  sessions: StreamSession[]
}

/**
 * The station's last few broadcasts.
 *
 * An open session (no `ended_at`) is a broadcast happening right now, and it
 * is shown rather than filtered out — it is the row someone is most likely to
 * be looking for, and hiding it made the table look stale exactly when the
 * station was busiest.
 */
export function RecentBroadcasts({ sessions }: RecentBroadcastsProps) {
  const recent = sessions.slice(0, LIMIT)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-medium">Recent broadcasts</CardTitle>
        <Link
          href="/dashboard/broadcasts"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground transition-colors"
        >
          View all
          <IconArrowRight size={14} />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_3rem] md:grid-cols-[minmax(0,1fr)_6rem_6rem_3.5rem] gap-3 px-3 pb-2 text-xs text-muted-foreground">
          <span>Started</span>
          <span className="hidden md:block">Source</span>
          <span>Duration</span>
          <span className="text-right">Peak</span>
        </div>

        {recent.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground border-t border-border">
            No broadcasts yet. Go live to see your session history here.
          </div>
        ) : (
          recent.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-[minmax(0,1fr)_4.5rem_3rem] md:grid-cols-[minmax(0,1fr)_6rem_6rem_3.5rem] gap-3 items-center px-3 py-2.5 border-t border-border text-sm"
            >
              <span className="truncate">{formatDateTime(s.started_at)}</span>
              <span className="hidden md:block">
                <Badge variant="secondary" className="text-xs font-normal">
                  {SOURCE_LABEL[s.source_type] ?? s.source_type}
                </Badge>
              </span>
              {s.ended_at ? (
                <span className="text-muted-foreground tabular-nums">
                  {formatDateRange(s.started_at, s.ended_at)}
                </span>
              ) : (
                <span className="text-emerald-400 inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Now
                </span>
              )}
              <span className="text-right text-muted-foreground tabular-nums">
                {s.peak_listeners}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
