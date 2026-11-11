"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { IconAdjustmentsHorizontal } from "@tabler/icons-react"
import api from "@/lib/axios"
import { Button } from "@/components/ds/Button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { SwitchRow } from "@/components/ds/Switch"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import type { Station } from "@/interfaces/Station"

/**
 * "AutoDJ settings" in the header of each AutoDJ page (Library, Playlists,
 * Jingles, Schedule), opening a dialog with the crossfade switch.
 *
 * Hidden on Free, where those pages already show the upsell, and while
 * crossfade is off for the whole install, where the switch would do nothing.
 *
 * Saved with a button rather than on flip, like the rest of the dashboard's
 * dialogs. The API pushes it into the running station live: it applies from
 * the next song change, with nobody disconnected, live shows included.
 */
export function AutoDjSettingsButton({ station, className }: { station: Station; className?: string }) {
  const locked = useAutoDjLocked()
  const [open, setOpen] = useState(false)

  if (locked || !station.crossfade_available) return null

  return (
    <>
      <Button variant="ghost" className={className} onClick={() => setOpen(true)}>
        <IconAdjustmentsHorizontal />
        AutoDJ settings
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {/* Mounted only while open, so the draft starts from the saved value each time. */}
          {open && <SettingsForm station={station} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function SettingsForm({ station, onDone }: { station: Station; onDone: () => void }) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(station.crossfade_enabled)
  const [saving, setSaving] = useState(false)
  const changed = enabled !== station.crossfade_enabled

  async function save() {
    setSaving(true)
    try {
      await api.patch(`/stations/${station.slug}`, { crossfade_enabled: enabled })
      toast.success(enabled ? "Crossfade on. Songs will blend into each other." : "Crossfade off. Songs will change with a clean cut.")
      router.refresh()
      onDone()
    } catch {
      toast.error("Couldn't save. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>AutoDJ settings</DialogTitle>
        <DialogDescription>How AutoDJ moves from one song to the next.</DialogDescription>
      </DialogHeader>

      <SwitchRow
        title="Crossfade"
        description="Blend the end of each song into the start of the next."
        checked={enabled}
        onCheckedChange={setEnabled}
        disabled={saving}
        className="bg-surface-raised"
      />

      <div className="flex flex-col gap-2.5 text-body-sm text-muted-foreground">
        <p>
          AutoDJ listens to how loud the end of one song and the start of the next are, and only blends them
          when it will sound smooth. Otherwise it cuts cleanly. With crossfade off, every song change is a clean cut.
        </p>
        <p>Jingles and going live always cut cleanly, whichever you choose.</p>
        <p>Changes apply from the next song change. Your station stays on air and listeners aren’t interrupted.</p>
      </div>

      <DialogFooter>
        <Button size="lg" variant="ghost" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button size="lg" onClick={save} disabled={!changed || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  )
}
