"use client"

import { useState } from "react"
import { IconPlus } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { StationFormDialog } from "./StationFormDialog"

/**
 * Creates the user's one station. Rendered only on /dashboard when they do
 * not have one yet — hence "Create station" rather than "New station", which
 * implied there could be a second.
 */
export function CreateStationButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)} className="text-sm cursor-pointer">
        <IconPlus size={16} data-icon="inline-start" />
        Create station
      </Button>
      <StationFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
