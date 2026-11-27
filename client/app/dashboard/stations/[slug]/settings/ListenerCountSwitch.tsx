"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { Station } from "@/interfaces/Station"
import { SwitchRow } from "@/components/ds/Switch"
import api from "@/lib/axios"

/**
 * Whether the public player and embed say "N listening". Saves on the flip,
 * like any other switch, and puts it back if the save fails. Off, the public
 * listeners endpoint stops sending the figure; the owner's own screens read
 * the signed-in copy of that feed, so their numbers are untouched. The copy
 * does not promise nobody else can see it: a relay station's count is still
 * on Icecast's own status page.
 */
export function ListenerCountSwitch({ station }: { station: Station }) {
  const router = useRouter()
  const [shown, setShown] = useState(station.show_listener_count)
  const [saving, setSaving] = useState(false)

  async function change(next: boolean) {
    setShown(next)
    setSaving(true)
    try {
      await api.patch(`/stations/${station.slug}`, { show_listener_count: next })
      toast.success(next ? "Listener count shown on your player page." : "Listener count hidden from your player page.")
      router.refresh()
    } catch {
      setShown(!next)
      toast.error("Couldn’t save. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SwitchRow
      title="Show listener count"
      description="Off, it’s hidden from your player page and embed. You still see it in your dashboard."
      checked={shown}
      onCheckedChange={change}
      disabled={saving}
      className="px-0 py-0"
    />
  )
}
