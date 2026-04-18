"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { IconMicrophone, IconPencil, IconBroadcast, IconMusic, IconMicrophoneOff } from "@tabler/icons-react"
import { Station } from "@/interfaces/Station"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { StationFormDialog } from "@/components/dashboard/StationFormDialog"

interface StationActionsProps {
  station: Station
  mode: "edit" | "live"
}

export function StationActions({ station, mode }: StationActionsProps) {
  const router = useRouter()
  const [showEdit, setShowEdit] = useState(false)
  const [showModeSelect, setShowModeSelect] = useState(false)

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
    <>
      <Button className="w-full md:w-auto" onClick={() => setShowModeSelect(true)}>
        <IconMicrophone data-icon="inline-start" /> Go live
      </Button>

      <Dialog open={showModeSelect} onOpenChange={setShowModeSelect}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose broadcast mode</DialogTitle>
            <DialogDescription>
              Select how you want to broadcast on {station.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                setShowModeSelect(false)
                try { localStorage.removeItem(`broadcast:micDisabled:${station.slug}`) } catch {}
                router.push(`/dashboard/stations/${station.slug}/live`)
              }}
              className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent bg-transparent cursor-pointer"
            >
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <IconMusic size={18} className="text-primary" />
              </div>
              <div>
                <div className="text-sm font-medium">Files + Microphone</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Play audio files and talk over them with push-to-talk. Requires microphone permission.
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                setShowModeSelect(false)
                try { localStorage.setItem(`broadcast:micDisabled:${station.slug}`, 'true') } catch {}
                router.push(`/dashboard/stations/${station.slug}/live`)
              }}
              className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent bg-transparent cursor-pointer"
            >
              <div className="size-9 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <IconMicrophoneOff size={18} className="text-muted-foreground" />
              </div>
              <div>
                <div className="text-sm font-medium">Files only</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Stream audio files without a microphone. No browser permissions needed.
                </div>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
