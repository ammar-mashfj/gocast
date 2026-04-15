"use client"

import { useState } from "react"
import { IconPlus } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { StationFormDialog } from "./StationFormDialog"

export function CreateStationButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)} className="text-sm cursor-pointer">
        <IconPlus size={16} data-icon="inline-start" />
        New station
      </Button>
      <StationFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
