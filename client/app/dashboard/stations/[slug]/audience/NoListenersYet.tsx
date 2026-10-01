import Link from "next/link"
import { Card } from "@/components/ds/Card"
import { CopyField } from "@/components/ds/CopyField"
import { taggedStationUrl } from "@/lib/share"
import { env } from "@/lib/env"

/**
 * What the Audience page says to a station nobody has heard (in this window).
 *
 * Instead of four "—" tiles, an empty chart and four empty breakdowns: one
 * honest sentence, and the link — the one thing that changes the answer.
 */
export function NoListenersYet({
  playerUrl,
  message,
  wider,
}: {
  playerUrl: string
  /** The sentence above the link: what the page would have shown, honestly. */
  message: string
  /** Optional wider-range link, when the station had listeners before. */
  wider?: { href: string; label: string }
}) {
  const slug = playerUrl.split("/").pop() ?? ""
  return (
    <Card aria-label="No listeners yet" className="max-w-2xl">
      <p className="text-body text-pretty">{message}</p>
      <CopyField label="Station link" value={taggedStationUrl(env.appUrl, slug, "owner")} display={playerUrl.replace(/^https?:\/\//, "")} />
      {wider && (
        <Link href={wider.href} className="self-start text-body-sm font-semibold text-violet-muted hover:underline">
          {wider.label}
        </Link>
      )}
    </Card>
  )
}
