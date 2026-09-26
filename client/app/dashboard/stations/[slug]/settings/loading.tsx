"use client"

import { useParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StationArtwork } from "@/components/StationArtwork"
import { useStationBySlug } from "@/contexts/StationContext"

/**
 * Station settings while its fetch is in flight.
 *
 * Added alongside the `(overview)` route group, which stopped this route
 * inheriting the station overview's skeleton — a power card and a listener
 * dial that settings has never had.
 *
 * The layout already carries the station's identity, so the Details card is
 * drawn for real: artwork, name, genre. Everything below it is a form bound to
 * data that has not arrived, and those are bars. Titles, field labels and the
 * explanatory copy are constants and stay as text, which keeps the page's
 * outline readable while it fills.
 *
 * The wrappers are the page's own — `sheet sheet-rules max-w-3xl` around one
 * Card per section — so every section is already flat and already opened by
 * its hairline. Each editor's body copies the editor's own rows (the tinted
 * show-time card, the link row with its icon box, the label/value facts), not
 * a generic stack of bars, so nothing below the fold moves when the forms
 * mount either.
 */
export default function SettingsLoading() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ""
  const station = useStationBySlug(slug || null)

  return (
    // The Skeleton primitive pulses unconditionally; stopping it here keeps
    // the page still for anyone who asked for reduced motion.
    <div className="sheet sheet-rules max-w-3xl flex flex-col gap-6 motion-reduce:[&_[data-slot=skeleton]]:animate-none">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Station settings</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">Details</CardTitle>
          {/* "Edit station profile": its dialog needs the full record. */}
          <Skeleton className="h-9 w-44" />
        </CardHeader>
        <CardContent className="flex gap-4">
          {station ? (
            <StationArtwork
              src={station.artwork_url}
              alt={station.name}
              className="size-16 rounded-xl shrink-0"
              iconSize={22}
              sizes="64px"
            />
          ) : (
            <Skeleton className="size-16 rounded-xl shrink-0" />
          )}
          <div className="min-w-0 flex-1 flex flex-col gap-1.5">
            {station ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium truncate">{station.name}</span>
                {station.genre && (
                  <Badge variant="secondary" className="shrink-0 text-[11px]">{station.genre}</Badge>
                )}
              </div>
            ) : (
              <Skeleton className="h-6 w-40" />
            )}
            <Skeleton className="h-5 w-full max-w-sm" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Links</CardTitle>
        </CardHeader>
        <CardContent>
          {/* LinksEditor */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="size-9 shrink-0" />
                  <Skeleton className="h-9 flex-1" />
                  <Skeleton className="h-9 w-40 shrink-0" />
                  <Skeleton className="size-9 shrink-0" />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-9 w-24" />
            </div>
            <Skeleton className="h-4 w-full max-w-lg" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Stream</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Labels, the format and the hints are constants; the two
              addresses come from the record. */}
          <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-4">
            <div className="text-xs text-muted-foreground md:w-32 md:shrink-0">Player URL</div>
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-4">
            <div className="text-xs text-muted-foreground md:w-32 md:shrink-0">Stream path</div>
            <div className="min-w-0">
              <Skeleton className="h-4 w-40" />
              <div className="text-xs text-muted-foreground mt-0.5">
                Only exists while the station is on air.
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-4">
            <div className="text-xs text-muted-foreground md:w-32 md:shrink-0">Format</div>
            <div className="min-w-0">
              <code className="text-xs break-all">MP3 128 kbps</code>
              <div className="text-xs text-muted-foreground mt-0.5">The same for every station.</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* EncoderCard. The title is shared by all three of its variants (Pro
          lock, not configured, connection details); the body is the
          connection-details one, the longest, so a shorter variant settles
          upward rather than pushing the page down. */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">Broadcast from your own software</CardTitle>
          <Skeleton className="h-8 w-24" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-4">
              <Skeleton className="h-4 w-24 md:w-32 md:shrink-0" />
              <Skeleton className="h-4 w-full max-w-xs" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* DeleteStation: its own bordered strip, not a Card, so it takes no
          rule. Neutral here — the danger colour belongs to the real control,
          not to a placeholder for it. */}
      <div className="border border-white/[0.07] rounded-xl p-4 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
        <Skeleton className="h-5 w-80 max-w-full" />
        <Skeleton className="h-8 w-full md:w-32 shrink-0" />
      </div>
    </div>
  )
}
