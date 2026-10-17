import type { StreamSession } from "@/interfaces/StreamSession"
import { ActionRow } from "@/components/ds/List"

/**
 * Recent shows as a tile, at every size. Phones also get the small Get Pro
 * tile beside it (Free only); from sm the big Pro card under it
 * (OverviewBelow) takes that job, so the row is Recent shows alone.
 */
export function ShowsLinks({
  sessions,
  timeZone,
}: {
  sessions: StreamSession[]
  timeZone: string | null
}) {

  const latest = sessions[0]
  let recentHint = "none yet"
  if (latest) {
    if (!latest.ended_at) recentHint = "on air now"
    else {
      const day = new Intl.DateTimeFormat("en-GB", { timeZone: timeZone ?? "UTC", weekday: "short", day: "numeric", month: "short" })
      recentHint = `last ${day.format(new Date(latest.started_at))}`
    }
  }

  const shows = "/dashboard/broadcasts"

  return (
    <div className="grid grid-cols-2 gap-2.5 [&>:only-child]:col-span-2 sm:grid-cols-1">
      <ActionRow title="Recent shows" description={sentence(recentHint)} href={shows} className="max-sm:p-3" descriptionClassName="max-sm:hidden" />
    </div>
  )
}

/** "none yet" as a tile's own line: "None yet". */
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
