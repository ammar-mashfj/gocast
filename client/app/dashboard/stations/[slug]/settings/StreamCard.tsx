import { env } from "@/lib/env"
import type { Station } from "@/interfaces/Station"
import { Card, CardHeader } from "@/components/ds/Card"
import { StreamLink } from "./StreamLink"

/**
 * Where listeners come out: the player page to share, and the raw stream for
 * radio apps. Read-only.
 */
export function StreamCard({ station }: { station: Station }) {
  const playerUrl = `${env.appUrl}/station/${station.slug}`
  // NEXT_PUBLIC_ICECAST_URL can be a same-origin path ("/stream-proxy" in
  // dev); a radio app needs the whole address.
  const icecast = env.icecastUrl.startsWith("/") ? `${env.appUrl}${env.icecastUrl}` : env.icecastUrl
  const directUrl = `${icecast}${station.icecast_mount}`

  return (
    <Card>
      <CardHeader title="Where listeners find you" />
      <StreamLink label="Player page" value={playerUrl} note="The link to share. Listeners press play here." open />
      <StreamLink label="Direct stream" value={directUrl} note="For radio apps and smart speakers. Works only while you’re on air." />
    </Card>
  )
}
