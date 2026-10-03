import { env } from "@/lib/env"
import type { Station } from "@/interfaces/Station"
import { Card, CardHeader } from "@/components/ds/Card"
import { CopyField } from "@/components/ds/CopyField"

/**
 * Hardcoded in the Liquidsoap template (`%mp3(bitrate=128, samplerate=44100)`)
 * rather than stored per station, so there is nothing to read off the API.
 * Kept in sync by hand with api/resources/views/liquidsoap/station.blade.php.
 */
const STREAM_QUALITY = "MP3 · 128 kbps · 44.1 kHz"

/**
 * Where listeners come out: the player page to share, the raw stream for
 * radio apps, and the quality. Read-only, and asked about often enough to
 * need a home.
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
      <StreamRow label="Player page" note="The link to share. Listeners press play here.">
        <CopyField label="Player page link" value={playerUrl} display={playerUrl.replace(/^https?:\/\//, "")} />
      </StreamRow>
      <StreamRow label="Direct stream" note="For radio apps and smart speakers. Works only while you’re on air.">
        <CopyField label="Direct stream address" value={directUrl} display={directUrl.replace(/^https?:\/\//, "")} />
      </StreamRow>
      <StreamRow label="Quality" note="The same for every station.">
        <span className="font-mono text-body">{STREAM_QUALITY}</span>
      </StreamRow>
    </Card>
  )
}

function StreamRow({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow text-text-faint">{label}</span>
      {children}
      <span className="text-body-sm text-text-faint">{note}</span>
    </div>
  )
}
