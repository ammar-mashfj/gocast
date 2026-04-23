"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconLoader2 } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import api from "@/lib/axios"

interface DeleteStationProps {
  slug: string
}

export function DeleteStation({ slug }: DeleteStationProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (deleting) return
    if (!confirm("Permanently delete this station and all its data?")) return

    setDeleting(true)
    try {
      await api.delete(`/stations/${slug}`)
      toast.success("Station deleted")
      router.push("/dashboard/stations")
      router.refresh()
      // Leave `deleting` true so the button stays disabled through the navigation.
    } catch {
      toast.error("Failed to delete station")
      setDeleting(false)
    }
  }

  return (
    <div className="border border-destructive/20 rounded-xl p-4 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
      <div className="text-sm text-muted-foreground">
        <span className="text-destructive/60 font-medium">Danger zone</span> — permanently delete this station and all its data
      </div>
      <Button
        variant="destructive"
        size="sm"
        className="w-full md:w-auto shrink-0"
        onClick={handleDelete}
        disabled={deleting}
      >
        {deleting ? (
          <>
            <IconLoader2 size={14} className="animate-spin" data-icon="inline-start" />
            Deleting…
          </>
        ) : (
          "Delete station"
        )}
      </Button>
    </div>
  )
}
