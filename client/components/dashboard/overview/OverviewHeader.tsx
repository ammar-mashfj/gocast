"use client"

import { useState } from "react"
import type { Station } from "@/interfaces/Station"
import { formatDate } from "@/lib/format"
import { Button } from "@/components/ds/Button"
import { Tag } from "@/components/ds/Tag"
import { StationArtwork } from "@/components/StationArtwork"
import { StationFormDialog } from "@/components/dashboard/StationFormDialog"

/**
 * Who the station is: artwork, name and genre, its description, and how long
 * it's been around. Only identity and low-risk actions live here — anything
 * that changes what listeners hear is in the hero below. The artwork is
 * itself the way to change it.
 */
export function OverviewHeader({ station, lastLive }: { station: Station; lastLive: string | null }) {
  const [editing, setEditing] = useState(false)
  const since = new Date(station.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
  const meta = [`Since ${since}`, lastLive && station.state !== "live" ? `Last live ${formatDate(lastLive, "relative")}` : null].filter(Boolean)

  return (
    <header className="flex flex-wrap items-start gap-5">
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={station.artwork_url ? "Change station artwork" : "Add station artwork"}
        className="group relative shrink-0 overflow-hidden rounded-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <StationArtwork src={station.artwork_url} alt="" className="size-20 text-text-faint sm:size-26" iconSize={24} sizes="104px" priority />
        {!station.artwork_url && (
          <span className="absolute inset-x-0 bottom-2.5 text-center eyebrow-sm text-text-faint">Add art</span>
        )}
      </button>

      <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="min-w-0 font-display text-page break-words">{station.name}</h1>
          {station.genre && <Tag>{station.genre}</Tag>}
        </div>
        {station.description && <p className="max-w-[65ch] text-lead text-pretty text-muted-foreground line-clamp-2">{station.description}</p>}
        <p className="text-body-sm text-text-faint">{meta.join(" · ")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" asChild>
          <a href={`/station/${station.slug}`} target="_blank" rel="noopener noreferrer">Player page ↗</a>
        </Button>
        <Button variant="ghost" onClick={() => setEditing(true)}>Edit profile</Button>
      </div>

      <StationFormDialog open={editing} onClose={() => setEditing(false)} station={station} />
    </header>
  )
}
