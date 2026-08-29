import { notFound } from "next/navigation"
import Link from "next/link"
import { IconHistory } from "@tabler/icons-react"
import { apiFetch } from "@/lib/api-server"
import { getMyStation } from "@/lib/station-server"
import { Station } from "@/interfaces/Station"
import { StreamSession } from "@/interfaces/StreamSession"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { formatDate, formatDateRange } from "@/lib/format"

/**
 * Every finished broadcast on the user's station, newest first.
 *
 * This used to fan out across all of the user's stations and tag each row
 * with the station it belonged to. With one station per user both the
 * fan-out and the column are noise — every row would carry the same name.
 */
export default async function BroadcastsPage() {
  let station: Station | null
  let sessions: StreamSession[]

  try {
    station = await getMyStation()
    sessions = station
      ? (await apiFetch<{ data: StreamSession[] }>(`/stations/${station.slug}/sessions`)).data
      : []
  } catch {
    notFound()
  }

  const finished = sessions
    .filter((s) => s.ended_at)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())

  if (finished.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-medium mb-6">Broadcasts</h1>
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <IconHistory size={48} />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle className="text-lg">No broadcasts yet</EmptyTitle>
            <EmptyDescription className="text-sm">
              Once you go live, every session shows up here with its duration and peak audience.
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild>
            <Link href="/dashboard">
              {station ? "Go to your station" : "Create your station"}
            </Link>
          </Button>
        </Empty>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-medium mb-6">Broadcasts</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            All broadcast sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[1fr_140px_80px] px-3 py-2 text-xs text-muted-foreground tracking-wide uppercase">
            <span>Date</span>
            <span>Duration</span>
            <span className="text-right">Peak</span>
          </div>
          <Separator />

          {finished.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-[1fr_140px_80px] px-3 py-2.5 border-t border-border text-sm"
            >
              <span className="text-muted-foreground">{formatDate(s.started_at, "short")}</span>
              <span className="text-muted-foreground">{formatDateRange(s.started_at, s.ended_at!)}</span>
              <span className="text-right text-muted-foreground">{s.peak_listeners}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
