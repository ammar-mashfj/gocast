import type { StreamSession } from "@/interfaces/StreamSession"
import { formatAirtime } from "@/lib/format"
import { liveShows } from "@/lib/liveShows"
import { CardLink } from "@/components/ds/Card"
import { ActionRow } from "@/components/ds/List"

/**
 * Where the shows went: two links, to Audience and Your shows, each with the
 * one fact worth a glance. On a tall viewport (min-height 52rem = 832px,
 * just above a 1024×768 tablet in landscape; a height query, since no width
 * tells tablets from laptops) they are two tiles; on anything shorter, one
 * line of text, because the
 * tiles are 77px of a screen that has none spare in tablet landscape. The
 * 14-day chart and the recent-shows list used to sit here as full cards
 * (LiveShowsCard, RecentShowsCard) and were what pushed the overview below
 * the fold.
 */
export function ShowsLinks({
  slug,
  sessions,
  truncated,
  timeZone,
}: {
  slug: string
  sessions: StreamSession[]
  truncated: boolean
  timeZone: string | null
}) {
  const r = liveShows(sessions, new Date(), truncated)
  const liveHint = r.count === 0 ? "none in the last 14 days" : `${formatAirtime(r.seconds)} in the last 14 days`

  const latest = sessions[0]
  let recentHint = "none yet"
  if (latest) {
    if (!latest.ended_at) recentHint = "on air now"
    else {
      const day = new Intl.DateTimeFormat("en-GB", { timeZone: timeZone ?? "UTC", weekday: "short", day: "numeric", month: "short" })
      recentHint = `last ${day.format(new Date(latest.started_at))}`
    }
  }

  const audience = `/dashboard/stations/${slug}/audience`
  const shows = "/dashboard/broadcasts"

  return (
    <>
      <div className="hidden grid-cols-[repeat(auto-fit,minmax(min(100%,17.5rem),1fr))] gap-2.5 [@media(min-height:52rem)]:grid">
        <ActionRow title="Your live shows" description={sentence(liveHint)} href={audience} />
        <ActionRow title="Recent shows" description={sentence(recentHint)} href={shows} />
      </div>
      <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-1 text-body-sm text-text-faint [@media(min-height:52rem)]:hidden">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <CardLink href={audience}>Your live shows →</CardLink>
          <span>{liveHint}</span>
        </span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <CardLink href={shows}>Recent shows →</CardLink>
          <span>{recentHint}</span>
        </span>
      </p>
    </>
  )
}

/** "none yet" as a tile's own line: "None yet". */
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
