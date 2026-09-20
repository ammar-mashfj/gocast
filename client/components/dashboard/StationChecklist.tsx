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
 * The concrete things left to do on this station, and nothing else.
 *
 * Deliberately disappears once every item is done: a permanent checklist of
 * ticks is decoration, and this is a rail slot that a returning broadcaster
 * would rather have back. Items that have somewhere to go are clickable —
 * a checklist that only names the gap makes you go find the form yourself.
 *
 * Ordered as the work actually runs: make the station look right, give it
 * something to play, make it findable, then the payoff. "Get your first
 * listener" stays last because it is the only item the owner cannot simply
 * go and do.
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
            title: "Fill the default playlist",
            hint: "It is what plays when you're off air — empty, the station goes on air to silence.",
            href: `/dashboard/stations/${station.slug}/library`,
          },
        ]),
    // Both of these live on the settings page, which is the one screen a
    // broadcaster has no daily reason to open — so they are invisible unless
    // something says them out loud. They deep-link to their own card rather
    // than the top of the page: landing on "Station settings" and being left
    // to find the right box is the failure this item exists to prevent.
    {
      key: "schedule",
      done: (station.schedules?.length ?? 0) > 0,
      title: "Set your schedule",
      hint: "Tell listeners when you're on air so they know when to come back.",
      href: `/dashboard/stations/${station.slug}/settings#schedule`,
    },
    {
      key: "links",
      done: (station.social_links?.length ?? 0) > 0,
      title: "Add your social links",
      hint: "Put your socials and homepage on the player page.",
      href: `/dashboard/stations/${station.slug}/settings#links`,
    },
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
