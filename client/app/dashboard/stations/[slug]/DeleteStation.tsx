"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import api from "@/lib/axios"

interface DeleteStationProps {
  slug: string
}

export function DeleteStation({ slug }: DeleteStationProps) {
  const router = useRouter()

  async function handleDelete() {
    if (!confirm("Permanently delete this station and all its data?")) return

    try {
      await api.delete(`/stations/${slug}`)
      toast.success("Station deleted")
      router.push("/dashboard/stations")
      router.refresh()
    } catch {
      toast.error("Failed to delete station")
    }
  }

  return (
    <div className="border border-destructive/20 rounded-xl p-4 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
      <div className="text-sm text-muted-foreground">
        <span className="text-destructive/60 font-medium">Danger zone</span> — permanently delete this station and all its data
      </div>
      <Button variant="destructive" size="sm" className="w-full md:w-auto shrink-0" onClick={handleDelete}>
        Delete station
      </Button>
    </div>
  )
}
