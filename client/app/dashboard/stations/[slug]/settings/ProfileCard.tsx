"use client"

import { useState } from "react"
import { IconPencil } from "@tabler/icons-react"
import type { Station } from "@/interfaces/Station"
import { StationArtwork } from "@/components/StationArtwork"
import { StationFormDialog } from "@/components/dashboard/StationFormDialog"
import { Button } from "@/components/ds/Button"
import { Card } from "@/components/ds/Card"
import { Tag } from "@/components/ds/Tag"

/**
 * What listeners see at the top of the player page: artwork, name, genre and
 * the two lines about the station. Laid out like the Overview's header
 * (OverviewHeader): a big artwork with a pencil, which opens the station form,
 * the name with its genre inline, and Edit profile beside the artwork. Unlike
 * the Overview, the description is shown — this is where it is checked.
 */
export function ProfileCard({ station }: { station: Station }) {
  const [editing, setEditing] = useState(false)

  return (
    <Card>
      {/* Phones (below sm): the button stacked right of the artwork, the
          name and description on their own rows underneath. From sm: name,
          description and button beside a big artwork. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 sm:gap-x-5">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={station.artwork_url ? "Edit profile and artwork" : "Edit profile and add artwork"}
          className="group relative shrink-0 overflow-hidden rounded-well outline-none focus-visible:ring-2 focus-visible:ring-ring sm:row-span-2"
        >
          <StationArtwork src={station.artwork_url} alt="" className="size-44 text-text-faint sm:size-48" iconSize={36} sizes="192px" />
          {!station.artwork_url && (
            <span className="absolute inset-x-0 bottom-1 text-center eyebrow-sm text-text-faint">Add</span>
          )}
          <span aria-hidden className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur-sm">
            <IconPencil size={14} />
          </span>
        </button>

        <div className="flex min-w-0 sm:col-start-2 sm:row-start-2 sm:self-start">
          <Button variant="subtle" size="md" onClick={() => setEditing(true)}>
            Edit profile
          </Button>
        </div>

        <div className="col-span-2 flex min-w-0 flex-col gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:self-end">
          {/* The genre runs inline after the name, like a word (see OverviewHeader). */}
          <div className="min-w-0 break-words">
            <h2 className="mr-1 inline font-display text-title-sm">{station.name}</h2>
            {station.genre && <>{" "}<Tag className="align-middle">{station.genre}</Tag></>}
          </div>
          <p className="text-body-sm text-pretty text-muted-foreground">
            {station.description || "No description yet. Two lines telling listeners what you play."}
          </p>
        </div>
      </div>
      <StationFormDialog open={editing} onClose={() => setEditing(false)} station={station} />
    </Card>
  )
}
