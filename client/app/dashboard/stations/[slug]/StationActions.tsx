"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconMicrophone, IconPencil, IconBroadcast } from "@tabler/icons-react"
import { Station } from "@/interfaces/Station"
import { Button } from "@/components/ui/button"
import { StationFormDialog } from "@/components/dashboard/StationFormDialog"

interface StationActionsProps {
  station: Station
}

export function StationActions({ station }: StationActionsProps) {
  const [showEdit, setShowEdit] = useState(false)

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
          <IconPencil data-icon="inline-start" />
          Edit
        </Button>
        <Button asChild>
          <a href={station.is_live ? `/dashboard/stations/${station.slug}/studio` : `/dashboard/stations/${station.slug}/live`}>
            {station.is_live ? (
              <><IconBroadcast data-icon="inline-start" /> Open studio</>
            ) : (
              <><IconMicrophone data-icon="inline-start" /> Go live</>
            )}
          </a>
        </Button>
      </div>
      <StationFormDialog
        open={showEdit}
        onClose={() => setShowEdit(false)}
        station={station}
      />
    </>
  )
}
