"use client"

import { useState } from "react"
import { IconPencil, IconBroadcast, IconPlayerPlayFilled } from "@tabler/icons-react"
import { Station } from "@/interfaces/Station"
import { Button } from "@/components/ui/button"
import { StationFormDialog } from "@/components/dashboard/StationFormDialog"
import { GoLiveTrigger } from "@/components/dashboard/GoLiveTrigger"

interface StationActionsProps {
  station: Station
  mode: "edit" | "live"
}

export function StationActions({ station, mode }: StationActionsProps) {
  const [showEdit, setShowEdit] = useState(false)

  if (mode === "edit") {
    return (
      <>
        <Button variant="outline" className="flex-1 md:flex-initial" onClick={() => setShowEdit(true)}>
          <IconPencil data-icon="inline-start" />
          Edit
        </Button>
        <StationFormDialog
          open={showEdit}
          onClose={() => setShowEdit(false)}
          station={station}
        />
      </>
    )
  }

  if (station.is_live) {
    return (
      <Button className="w-full md:w-auto" asChild>
        <a href={`/dashboard/stations/${station.slug}/studio`}>
          <IconBroadcast data-icon="inline-start" /> Open studio
        </a>
      </Button>
    )
  }

  return (
    <GoLiveTrigger slug={station.slug} name={station.name}>
      <Button className="w-full md:w-auto">
        <IconPlayerPlayFilled data-icon="inline-start" /> Go live
      </Button>
    </GoLiveTrigger>
  )
}
