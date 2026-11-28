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
 * endpoint stops sending the figure at all; the owner's own numbers (studio,
 * Overview, Audience) are untouched.
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
      toast.success(next ? "Listener count shown on your player page." : "Listener count hidden. Only you can see it now.")
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
      description="Shows how many people are listening on your player page and embed. Off, only you can see it."
      checked={shown}
      onCheckedChange={change}
      disabled={saving}
      className="px-0 py-0"
    />
  )
}
