"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconLoader2 } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import api from "@/lib/axios"

interface DeleteStationProps {
  slug: string
  /** Named in the confirm, so the owner reads which station is about to go. */
  name: string
}

export function DeleteStation({ slug, name }: DeleteStationProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (deleting) return

    setDeleting(true)
    try {
      await api.delete(`/stations/${slug}`)
      toast.success("Station deleted")
      router.push("/dashboard")
      router.refresh()
      // Leave `deleting` true so the dialog stays locked through the navigation.
    } catch {
      toast.error("Couldn't delete the station. Nothing was removed.")
      setDeleting(false)
    }
  }

  return (
    <div className="border border-fault/20 rounded-xl p-4 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
      <div className="text-sm text-muted-foreground">
        <span className="text-fault-text font-medium">Danger zone</span> — permanently delete this station and all its data
      </div>
      {/* Neutral on purpose: this only opens the confirm. The one red button
          is the confirm itself, after the consequence has been read. */}
      <Button
        variant="outline"
        className="w-full md:w-auto shrink-0"
        onClick={() => setOpen(true)}
      >
        Delete station
      </Button>

      {/* A dialog rather than window.confirm: the browser prompt could not
          name the station or say what stops working, and it looked like
          nothing else in the dashboard. Not dismissable mid-delete — the
          request is in flight and success navigates away. */}
      <Dialog open={open} onOpenChange={(next) => !deleting && setOpen(next)}>
        <DialogContent className="sm:max-w-sm" showCloseButton={!deleting}>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              It goes off air straight away, and its player page, stream links
              and embeds stop working. You lose its library, schedule and
              broadcast history with it. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setOpen(false)}>
              Keep station
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting && <IconLoader2 className="animate-spin" data-icon="inline-start" />}
              <span>{deleting ? "Deleting…" : "Delete station"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
