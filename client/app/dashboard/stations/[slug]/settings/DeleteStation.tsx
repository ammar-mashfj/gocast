"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ds/Button"
import { ConfirmDialog } from "@/components/ds/ConfirmDialog"
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
    <div className="flex flex-col gap-3 rounded-card bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex flex-col gap-1">
        <span className="text-body font-semibold">Delete this station</span>
        <span className="text-body-sm text-muted-foreground">The link stops working and every track is removed.</span>
      </div>
      {/* Neutral on purpose: this only opens the confirm. The one red button
          is the confirm itself, after the consequence has been read. */}
      <Button variant="ghost" className="shrink-0" onClick={() => setOpen(true)}>
        Delete station…
      </Button>

      {/* Locked while the request is in flight: success navigates away. */}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={handleDelete}
        busy={deleting}
        tone="danger"
        title={`Delete ${name}?`}
        description="This is permanent and can’t be undone."
        consequences={[
          "Takes it off air straight away",
          "Breaks its player page, stream links and embeds",
          "Removes its library, schedule and show history",
        ]}
        confirmText={slug}
        confirmLabel={deleting ? "Deleting…" : "Delete forever"}
        keepLabel="Keep station"
      />
    </div>
  )
}
