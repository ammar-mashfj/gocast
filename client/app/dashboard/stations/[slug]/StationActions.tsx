"use client"

import { useState } from "react"
import Link from "next/link"
import { IconPencil, IconBroadcast, IconPlayerPlayFilled } from "@tabler/icons-react"
import { Station } from "@/interfaces/Station"
import { Button } from "@/components/ui/button"
import { StationFormDialog } from "@/components/dashboard/StationFormDialog"
import { GoLiveTrigger } from "@/components/dashboard/GoLiveTrigger"
import { useBroadcast } from "@/contexts/BroadcastContext"

interface StationActionsProps {
  station: Station
  mode: "edit" | "live"
}

export function StationActions({ station, mode }: StationActionsProps) {
  const [showEdit, setShowEdit] = useState(false)
  const broadcast = useBroadcast()
  const liveHere =
    broadcast.stationSlug === station.slug &&
    (broadcast.state === "live" || broadcast.state === "reconnecting")

  if (mode === "edit") {
    return (
      <>
        <Button variant="outline" className="flex-1 md:flex-initial" onClick={() => setShowEdit(true)}>
          <IconPencil data-icon="inline-start" />
          Edit station profile
        </Button>
        <StationFormDialog
          open={showEdit}
          onClose={() => setShowEdit(false)}
          station={station}
        />
      </>
    )
  }

  // Live, but not from this tab: an encoder or another browser holds the
  // mount, and this tab's studio has no show to return to.
  if (station.is_live && !liveHere) {
    return <p className="text-sm text-muted-foreground">Live from another browser or encoder.</p>
  }

  if (station.is_live) {
    return (
      // A Link, not an anchor: a full page load would tear down
      // BroadcastProvider and with it the live socket, dropping the very
      // broadcast this button exists to return to.
      <Button className="w-full md:w-auto" asChild>
        <Link href={`/dashboard/stations/${station.slug}/studio`}>
          <IconBroadcast data-icon="inline-start" /> Open studio
        </Link>
      </Button>
    )
  }

  return (
    <GoLiveTrigger station={station}>
      <Button className="w-full md:w-auto">
        <IconPlayerPlayFilled data-icon="inline-start" /> Go live
      </Button>
    </GoLiveTrigger>
  )
}
