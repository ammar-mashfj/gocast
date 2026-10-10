"use client"

import { useState, useSyncExternalStore } from "react"
import type { Station } from "@/interfaces/Station"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { Button } from "@/components/ds/Button"
import { Card, CardHeader } from "@/components/ds/Card"
import { ActionRow } from "@/components/ds/List"
import { SegmentBar } from "@/components/ds/Progress"
import { StationFormDialog } from "@/components/dashboard/StationFormDialog"
import { setupItems } from "@/lib/setupItems"

const WORDS = ["", "One thing", "Two things", "Three things", "Four things", "Five things", "Six things"]

/**
 * What's left to set up, as tiles that go straight to the fix, with a bar
 * for how far along the station is. Gone once everything is done, and can be
 * hidden for now — remembered in this browser only, which is fine for a
 * nudge.
 *
 * Ordered as the work runs: make the station look right, give it something
 * to play, make it findable, then the payoff. "Get your first listener" stays
 * last: it is the one item the owner can't simply go and do.
 */
export function SetupChecklist({ station, trackCount, hasListeners }: { station: Station; trackCount: number; hasListeners: boolean }) {
  const [editing, setEditing] = useState(false)
  const locked = useAutoDjLocked()
  const [hidden, hide] = useHidden(station.slug)

  const items = setupItems(station, trackCount, hasListeners, locked)
  const todo = items.filter((i) => !i.done)
  if (todo.length === 0 || hidden) return null
  const done = items.length - todo.length

  return (
    <Card>
      <CardHeader
        title={`${WORDS[todo.length] ?? `${todo.length} things`} left to set up`}
        aside={<span className="font-mono text-caption font-semibold tracking-wider">{done} OF {items.length}</span>}
      />
      <SegmentBar done={done} total={items.length} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17.5rem),1fr))] gap-2.5">
        {todo.map((i) => (
          <ActionRow key={i.key} title={i.title} description={i.hint} href={i.href} onClick={i.edits ? () => setEditing(true) : undefined} />
        ))}
      </div>
      <Button variant="quiet" size="sm" className="-ml-3.5 self-start" onClick={hide}>
        Hide for now
      </Button>
      <StationFormDialog open={editing} onClose={() => setEditing(false)} station={station} />
    </Card>
  )
}

/** "Hide for now", per station, in this browser. Storage can be blocked: then it just hides until reload. */
function useHidden(slug: string): [boolean, () => void] {
  const key = `gocast:setup-hidden:${slug}`
  const [local, setLocal] = useState(false)
  const stored = useSyncExternalStore(
    subscribeStorage,
    () => {
      try {
        return localStorage.getItem(key) === "1"
      } catch {
        return false
      }
    },
    () => false,
  )
  return [
    stored || local,
    () => {
      setLocal(true)
      try {
        localStorage.setItem(key, "1")
      } catch {
        // Private mode or blocked storage: hidden for this visit only.
      }
    },
  ]
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange)
  return () => window.removeEventListener("storage", onChange)
}
