"use client"

import { useState } from "react"
import type { Station } from "@/interfaces/Station"
import { StationArtwork } from "@/components/StationArtwork"
import { StationFormDialog } from "@/components/dashboard/StationFormDialog"
import { Button } from "@/components/ds/Button"
import { Card, CardHeader } from "@/components/ds/Card"
import { Tag } from "@/components/ds/Tag"

/**
 * What listeners see at the top of the player page: artwork, name, genre and
 * the two lines about the station. Edit opens the station form.
 */
export function ProfileCard({ station }: { station: Station }) {
  const [editing, setEditing] = useState(false)

  return (
    <Card>
      <CardHeader
        title="Profile"
        aside={
          <Button size="sm" variant="subtle" onClick={() => setEditing(true)}>
            Edit
          </Button>
        }
      />
      <div className="flex items-start gap-4">
        <StationArtwork src={station.artwork_url} alt="" className="size-16 shrink-0 rounded-well text-text-faint" iconSize={22} sizes="64px" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-title-sm">{station.name}</span>
            {station.genre && <Tag>{station.genre}</Tag>}
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
