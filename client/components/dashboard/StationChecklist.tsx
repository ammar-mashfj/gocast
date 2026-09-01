"use client"

import { useState } from "react"
import Link from "next/link"
import { IconCheck } from "@tabler/icons-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StationFormDialog } from "@/components/dashboard/StationFormDialog"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { Station } from "@/interfaces/Station"
import { cn } from "@/lib/utils"

interface StationChecklistProps {
  station: Station
  trackCount: number
  /** All-time peak concurrent listeners — the only evidence anyone ever tuned in. */
  peakListeners: number
}

/**
 * The two or three concrete things left to do, and nothing else.
 *
 * Deliberately disappears once every item is done: a permanent checklist of
 * ticks is decoration, and this is a rail slot that a returning broadcaster
 * would rather have back. Items that have somewhere to go are clickable —
 * a checklist that only names the gap makes you go find the form yourself.
 */
export function StationChecklist({ station, trackCount, peakListeners }: StationChecklistProps) {
  const [showEdit, setShowEdit] = useState(false)

  // "Fill the AutoDJ rotation" is dropped rather than reworded on a plan that
  // does not include it. This list is the things left to DO, and an item that
  // can only be cleared by paying is not a setup step — it is an ad wearing a
  // checkbox, and it would sit here unticked forever. The rotation card and
  // the library screen carry the upsell instead.
  const locked = useAutoDjLocked()

  const items = [
    {
      key: "artwork",
      done: Boolean(station.artwork_url),
      title: "Add station artwork",
      hint: "Shows on the player page and anywhere your link is shared.",
      onClick: () => setShowEdit(true),
    },
    {
      key: "description",
      done: Boolean(station.description),
      title: "Write a description",
      hint: "Two lines telling listeners what you play.",
      onClick: () => setShowEdit(true),
    },
    ...(locked
      ? []
      : [
          {
            key: "tracks",
            done: trackCount > 0,
            title: "Fill the AutoDJ rotation",
            hint: "Without tracks the station goes on air to silence.",
            href: `/dashboard/stations/${station.slug}/library`,
          },
        ]),
    {
      key: "listener",
      done: peakListeners > 0,
      title: "Get your first listener",
      hint: "Share the link above — nobody has tuned in yet.",
    },
  ]

  const todo = items.filter((i) => !i.done)
  if (todo.length === 0) return null

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Finish setting up</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {items.map((item) => {
            const body = (
              <div className="flex items-start gap-3 text-left">
                <span
                  className={cn(
                    "size-4 mt-0.5 rounded-full shrink-0 flex items-center justify-center",
                    item.done ? "bg-emerald-500/15 text-emerald-400" : "border border-primary/50",
                  )}
                >
                  {item.done && <IconCheck size={11} stroke={3} />}
                </span>
                <div className="min-w-0">
                  <div className={cn("text-sm", item.done && "text-muted-foreground line-through")}>
                    {item.title}
                  </div>
                  {!item.done && (
                    <div className="text-xs text-muted-foreground leading-relaxed">{item.hint}</div>
                  )}
                </div>
              </div>
            )

            if (item.done) {
              return <div key={item.key}>{body}</div>
            }
            if (item.href) {
              return (
                <Link key={item.key} href={item.href} className="no-underline hover:opacity-80 transition-opacity">
                  {body}
                </Link>
              )
            }
            if (item.onClick) {
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                >
                  {body}
                </button>
              )
            }
            return <div key={item.key}>{body}</div>
          })}
        </CardContent>
      </Card>

      <StationFormDialog open={showEdit} onClose={() => setShowEdit(false)} station={station} />
    </>
  )
}
