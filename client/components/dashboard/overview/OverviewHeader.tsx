"use client"

import { useState } from "react"
import type { Station } from "@/interfaces/Station"
import { formatDate } from "@/lib/format"
import { Button } from "@/components/ds/Button"
import { Tag } from "@/components/ds/Tag"
import { StationArtwork } from "@/components/StationArtwork"
import { StationFormDialog } from "@/components/dashboard/StationFormDialog"

/**
 * Who the station is: artwork, name and genre, and how long it's been
 * around, as the first row of the hero's main panel, with Edit profile. The
 * artwork is itself the way to change it. Anything that changes what
 * listeners hear is the hero's own, and the player page link is on the Your
 * link card, with the rest of the public page. The description is not shown:
 * it is on the player page and in Edit profile, and two lines of it were
 * what kept the overview from fitting one screen.
 */
export function OverviewHeader({ station, lastLive }: { station: Station; lastLive: string | null }) {
  const [editing, setEditing] = useState(false)
  const since = new Date(station.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
  const meta = [`Since ${since}`, lastLive && station.state !== "live" ? `Last live ${formatDate(lastLive, "relative")}` : null].filter(Boolean)

  return (
    <header className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={station.artwork_url ? "Change station artwork" : "Add station artwork"}
        className="group relative shrink-0 overflow-hidden rounded-well outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <StationArtwork src={station.artwork_url} alt="" className="size-14 text-text-faint" iconSize={18} sizes="56px" priority />
        {!station.artwork_url && (
          <span className="absolute inset-x-0 bottom-1 text-center eyebrow-sm text-text-faint">Add</span>
        )}
      </button>

      <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 font-display text-title break-words">{station.name}</h1>
          {station.genre && <Tag>{station.genre}</Tag>}
        </div>
        <p className="text-body-sm text-text-faint">{meta.join(" · ")}</p>
      </div>

      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit profile</Button>

      <StationFormDialog open={editing} onClose={() => setEditing(false)} station={station} />
    </header>
  )
}
