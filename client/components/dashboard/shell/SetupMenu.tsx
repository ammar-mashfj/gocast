"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import api from "@/lib/axios"
import type { Station } from "@/interfaces/Station"
import type { Playlist } from "@/interfaces/Playlist"
import { useCurrentStation } from "@/contexts/StationContext"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { setupItems, stationHasListeners } from "@/lib/setupItems"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ds/Menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { ActionRow } from "@/components/ds/List"
import { SegmentBar } from "@/components/ds/Progress"
import { StationFormDialog } from "@/components/dashboard/StationFormDialog"

const WORDS = ["", "One thing", "Two things", "Three things", "Four things", "Five things", "Six things"]

/**
 * The setup chip in the top bar: "3 of 6 set up" with a progress ring, and a
 * panel of what's left, each row going straight to the fix. Gone once
 * everything is done. It replaced the overview's setup card so the overview
 * fits on one screen — and because the work happens in Library and Settings,
 * where the card never was.
 *
 * It fetches its own station and playlists: the layout's station context is
 * identity only and goes stale the moment artwork is saved. Re-read whenever
 * the route changes (a save on Settings or an upload in Library is usually
 * followed by one), when the panel opens, and when the edit dialog closes.
 *
 * On phones the panel is the design system's bottom sheet (ds Dialog), not a
 * popover: a dropdown hanging off a chip in the top bar is the wrong shape
 * for a thumb, and the sheet puts the rows in reach. The breakpoint matches
 * the sheet's own (640px), so the two never disagree about which one is up.
 *
 * The edit dialog is a sibling of the panel, not inside it, for the same
 * reason as in UpdatesMenu: two stacked Radix layers fight over focus, so
 * the panel closes first and must not steal focus back from the dialog.
 */
export function SetupMenu() {
  const current = useCurrentStation()
  const locked = useAutoDjLocked()
  const pathname = usePathname()
  const mobile = useIsMobile(640)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [station, setStation] = useState<Station | null>(null)
  const [trackCount, setTrackCount] = useState<number | null>(null)
  const handingOff = useRef(false)
  const slug = current?.slug ?? null

  // Bumped to re-read: when the panel opens and when the edit dialog closes.
  const [tick, setTick] = useState(0)
  const reload = () => setTick((t) => t + 1)

  useEffect(() => {
    if (!slug) return
    let stale = false
    Promise.all([
      api.get<{ data: Station }>(`/stations/${slug}`),
      // Only for "fill AutoDJ's playlist". Unknown counts as filled, so a
      // failed read never nags about a playlist it couldn't see.
      api.get<{ data: Playlist[] }>(`/stations/${slug}/playlists`).then((r) => r.data.data).catch(() => null),
    ])
      .then(([stationRes, playlists]) => {
        if (stale) return
        setStation(stationRes.data.data)
        setTrackCount(playlists ? (playlists.find((p) => p.is_default)?.track_count ?? 0) : 1)
      })
      .catch(() => {
        // Nothing to show is the honest fallback; the next route change retries.
      })
    return () => {
      stale = true
    }
  }, [slug, pathname, tick])

  if (!station || trackCount === null) return null

  const items = setupItems(station, trackCount, stationHasListeners(station), locked)
  const todo = items.filter((i) => !i.done)
  if (todo.length === 0) return null
  const done = items.length - todo.length

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) reload()
  }

  function edit() {
    handingOff.current = true
    setOpen(false)
    setEditing(true)
  }

  function closeEdit() {
    setEditing(false)
    reload()
  }

  const heading = `${WORDS[todo.length] ?? `${todo.length} things`} left to set up`
  const counter = (
    <span className="font-mono text-caption font-semibold tracking-wider text-muted-foreground">
      {done} OF {items.length}
    </span>
  )
  const rows = todo.map((i) => (
    <ActionRow
      key={i.key}
      title={i.title}
      description={i.hint}
      href={i.href}
      onClick={i.edits ? edit : i.href ? () => setOpen(false) : undefined}
      className="bg-card hover:bg-surface-raised"
    />
  ))
  const triggerClass = cn(
    "inline-flex h-9 items-center gap-2 rounded-item bg-card px-3 text-body-sm font-semibold text-foreground transition-colors",
    "hover:bg-surface-control data-[state=open]:bg-surface-control",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
  )
  const triggerLabel = `Set up your station, ${done} of ${items.length} done`
  const triggerBody = (
    <>
      <Ring done={done} total={items.length} />
      <span className="hidden sm:inline">
        {done} of {items.length} set up
      </span>
      <span className="font-mono tabular-nums sm:hidden">
        {done}/{items.length}
      </span>
    </>
  )
  const onCloseAutoFocus = (event: Event) => {
    if (handingOff.current) {
      handingOff.current = false
      event.preventDefault()
    }
  }

  return (
    <>
      {mobile ? (
        <>
          <button type="button" className={triggerClass} aria-label={triggerLabel} data-state={open ? "open" : "closed"} onClick={() => handleOpenChange(true)}>
            {triggerBody}
          </button>
          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
              <DialogHeader>
                <DialogTitle>{heading}</DialogTitle>
                <DialogDescription>Each one goes straight to where it’s done.</DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-between gap-4">
                <SegmentBar done={done} total={items.length} className="flex-1" />
                {counter}
              </div>
              <div className="flex flex-col gap-2">{rows}</div>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger className={triggerClass} aria-label={triggerLabel}>
            {triggerBody}
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-96 gap-0 overflow-hidden rounded-panel border-0 bg-surface-control p-2 shadow-panel ring-0"
            onCloseAutoFocus={onCloseAutoFocus}
          >
            <div className="flex flex-col gap-3 px-3 pt-2.5 pb-3">
              <div className="flex items-center justify-between">
                <p className="font-display text-body font-bold">{heading}</p>
                {counter}
              </div>
              <SegmentBar done={done} total={items.length} />
            </div>
            <div className="flex flex-col gap-1.5">{rows}</div>
          </PopoverContent>
        </Popover>
      )}

      <StationFormDialog open={editing} onClose={closeEdit} station={station} />
    </>
  )
}

/** A small ring: the done share in the ok green over a faint track. */
function Ring({ done, total }: { done: number; total: number }) {
  const r = 7
  const c = 2 * Math.PI * r
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="size-4.5 -rotate-90">
      <circle cx="9" cy="9" r={r} fill="none" strokeWidth="2.5" className="stroke-surface-strong" />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - done / total)}
        className="stroke-ok transition-[stroke-dashoffset]"
      />
    </svg>
  )
}
