"use client"

import { useState } from "react"
import { toast } from "sonner"
import axios from "axios"
import api from "@/lib/axios"
import { Button } from "@/components/ds/Button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ds/Dialog"
import type { Station } from "@/interfaces/Station"
import { TimezoneCombobox } from "./TimezoneCombobox"

/**
 * The station timezone's only editor. It lives here because only AutoDJ
 * depends on it: slots can't be saved without one, and jingle clock times
 * fall back to UTC. The top bar's clock and the shows chart only display it.
 *
 * A null zone opens on the browser's, which is right for nearly everyone.
 */
export function TimezoneDialog({
  open,
  onOpenChange,
  slug,
  current,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  current: string | null
  onSaved: (station: Station) => void
}) {
  const [chosen, setChosen] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const zone = chosen ?? current ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  function change(next: boolean) {
    if (saving) return
    if (!next) setChosen(null)
    onOpenChange(next)
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const { data } = await api.patch<{ data: Station }>(`/stations/${slug}`, { timezone: zone })
      onSaved(data.data)
      toast.success("Timezone saved")
      setChosen(null)
      onOpenChange(false)
    } catch (error) {
      const body = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined)
        : undefined
      toast.error(Object.values(body?.errors ?? {})[0]?.[0] ?? body?.message ?? "Couldn't save the timezone")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        // The dialog hears Esc before the search field does (Radix listens on
        // the document, capturing). With the field's list open, the first Esc
        // is the list's: the field closes it, and only a second Esc closes
        // this, rather than throwing the unsaved pick away.
        onEscapeKeyDown={(e) => {
          if (document.activeElement?.getAttribute("aria-expanded") === "true") e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>Station timezone</DialogTitle>
          <DialogDescription>
            Your AutoDJ slots run on this clock.
            {current && " Changing it moves every slot to the same hours in the new zone."}
          </DialogDescription>
        </DialogHeader>
        <TimezoneCombobox id="station-timezone" value={zone} onChange={setChosen} />
        <DialogFooter>
          <Button size="lg" onClick={save} disabled={saving || zone === current}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
