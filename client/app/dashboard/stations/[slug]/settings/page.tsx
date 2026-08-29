import { notFound } from "next/navigation"
import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"
import { apiFetch, ApiFetchError } from "@/lib/api-server"
import { env } from "@/lib/env"
import { Station } from "@/interfaces/Station"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StationArtwork } from "@/components/StationArtwork"
import { StationActions } from "../StationActions"
import { DeleteStation } from "../DeleteStation"

/**
 * Hardcoded in the Liquidsoap template (`%mp3(bitrate=128, samplerate=44100)`)
 * rather than stored per station, so there is nothing to read off the API.
 * Kept in sync by hand with api/resources/views/liquidsoap/station.blade.php.
 */
const STREAM_FORMAT = "MP3 128 kbps, 44.1 kHz"

/**
 * Everything about a station you configure once and then stop thinking about.
 *
 * It exists mostly to be somewhere the danger zone can live. A delete button
 * has no business on the page you open every day to check what's playing, but
 * it cannot simply be removed either — so it needed a destination, and the
 * read-only stream facts below (mount, format, watermark) had nowhere to live
 * at all and are genuinely asked about.
 */
export default async function StationSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  let station: Station
  try {
    const res = await apiFetch<{ data: Station }>(`/stations/${slug}`)
    station = res.data
  } catch (err) {
    if (err instanceof ApiFetchError && err.status === 404) {
      notFound()
    }
    console.error(`[station/${slug}/settings] fetch failed:`, err)
    throw err
  }

  const playerUrl = `${env.appUrl}/station/${station.slug}`

  const streamFacts: Array<{ label: string; value: string; hint?: string }> = [
    { label: "Player URL", value: playerUrl },
    {
      label: "Icecast mount",
      value: station.icecast_mount,
      hint: "Only exists while the station is on air.",
    },
    { label: "Format", value: STREAM_FORMAT, hint: "The same for every station." },
  ]

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/stations/${station.slug}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground no-underline hover:text-foreground transition-colors mb-3"
        >
          <IconArrowLeft size={14} />
          Back to {station.name}
        </Link>
        <h1 className="text-2xl font-medium">Station settings</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">Details</CardTitle>
          <StationActions station={station} mode="edit" />
        </CardHeader>
        <CardContent className="flex gap-4">
          <StationArtwork
            src={station.artwork_url}
            alt={station.name}
            className="size-16 rounded-xl shrink-0"
            iconSize={22}
            sizes="64px"
          />
          <div className="min-w-0 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium truncate">{station.name}</span>
              {station.genre && (
                <Badge variant="secondary" className="shrink-0">{station.genre}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {station.description || (
                <span className="italic">
                  No description yet — two lines telling listeners what you play.
                </span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Stream</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {streamFacts.map((fact) => (
            <div key={fact.label} className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-4">
              <div className="text-xs text-muted-foreground md:w-32 md:shrink-0">{fact.label}</div>
              <div className="min-w-0">
                <code className="text-xs break-all">{fact.value}</code>
                {fact.hint && (
                  <div className="text-xs text-muted-foreground mt-0.5">{fact.hint}</div>
                )}
              </div>
            </div>
          ))}

          {/* Read-only and derived from the plan — there is no PATCH that turns
              it off, so this states the fact rather than offering a switch. */}
          {station.watermarked !== undefined && (
            <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-4 border-t border-border pt-4">
              <div className="text-xs text-muted-foreground md:w-32 md:shrink-0">Station ID</div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                {station.watermarked
                  ? "Your stream carries a spoken “powered by GoCast” ID, ducked over the audio every few minutes."
                  : "No GoCast ID is mixed into your stream."}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <DeleteStation slug={station.slug} />
    </div>
  )
}
