"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { IconPlayerStopFilled } from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { getSessionPeak } from "@/hooks/useBroadcastStats"
import { useStationStatus } from "@/hooks/useStationStatus"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/** What the overview's sign-off card reads after a show ends. */
export interface ShowSummary {
  slug: string
  endedAt: number
  durationSeconds: number
  peakListeners: number
  lostSeconds: number
  /**
   * What the station did next. `autodj`: the rotation took it back. `silence`:
   * AutoDJ took it back with nothing to play, so it goes silent and the sweep
   * turns it off within a few minutes. `off_air`: no AutoDJ, so ending the
   * show turned the station off.
   */
  after: "autodj" | "silence" | "off_air"
}

export const signOffKey = (slug: string) => `gocast:signoff:${slug}`

/**
 * Ending a show, in one place for every surface that offers it.
 *
 * The mobile bar used to call `stop()` straight from a 28px button — one
 * stray thumb cut every listener off. Now both layouts open the same dialog,
 * and both leave the same summary behind for the station overview.
 */
export function EndBroadcastButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const router = useRouter()
  const { stop, stationSlug, liveSince, getTransportStats } = useBroadcast()
  // No AutoDJ means there is nothing for the station to fall back to, so
  // ending the broadcast takes the station off air too. With AutoDJ it is a
  // handover and the station stays up. False while the plan is unknown, so an
  // account we can't identify keeps the safer behaviour of staying on air.
  const autoDjLocked = useAutoDjLocked()
  const [open, setOpen] = useState(false)
  const [ending, setEnding] = useState(false)

  // "AutoDJ takes over" is only true if it has something to play. The
  // rotation's length rides on the status poll, which only runs here while
  // the dialog is open, and only on a plan that has AutoDJ at all. Unknown
  // (still loading, or a container too old to say) keeps the AutoDJ wording:
  // that is the common case, and the overview's control strip corrects it
  // within a poll either way.
  const { status } = useStationStatus(stationSlug ?? "", open && !!stationSlug && !autoDjLocked)
  const rotationEmpty = !autoDjLocked && status?.playlist_length === 0
  const after: ShowSummary["after"] = autoDjLocked ? "off_air" : rotationEmpty ? "silence" : "autodj"

  async function end() {
    if (!stationSlug) return
    setEnding(true)
    const slug = stationSlug
    const summary: ShowSummary = {
      slug,
      endedAt: Date.now(),
      durationSeconds: liveSince ? Math.round((Date.now() - liveSince) / 1000) : 0,
      peakListeners: getSessionPeak(slug, liveSince),
      lostSeconds: (getTransportStats()?.droppedMs ?? 0) / 1000,
      after,
    }
    // Written BEFORE stop(): stop() goes idle first, the studio redirects to
    // the overview on that, and ShowSignOff reads storage once on mount — on
    // Free, long before stop() returns from releasing the station.
    try {
      sessionStorage.setItem(signOffKey(slug), JSON.stringify(summary))
    } catch {
      // Storage blocked — the show still ends; the card just won't appear.
    }
    try {
      try {
        await stop({ releaseStation: autoDjLocked })
      } catch (err) {
        try { sessionStorage.removeItem(signOffKey(slug)) } catch {}
        throw err
      }
      router.push(`/dashboard/stations/${slug}`)
      // The station page is server-rendered from desired_state, and the
      // studio redirects there the moment the socket closes — ahead of the
      // stop above. Without this it shows the old state until its next poll.
      router.refresh()
    } finally {
      setEnding(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        // Neutral on purpose: on a healthy studio the only red thing must be
        // a fault. The consequence is carried by the dialog, whose confirm is
        // the one destructive button.
        className={cn("h-11", className)}
      >
        <IconPlayerStopFilled data-icon="inline-start" />
        {compact ? "End" : "End broadcast"}
      </Button>

      {/* A dialog, not an inline confirm: the consequence has to be read
          before the only irreversible action in the studio. Not dismissable
          while the stop is in flight — it closes the socket and navigates. */}
      <Dialog open={open} onOpenChange={(next) => !ending && setOpen(next)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>End this broadcast?</DialogTitle>
            <DialogDescription>
              Everyone tuned in right now is cut off{" "}
              {after === "off_air"
                ? "and the station goes off air."
                : after === "silence"
                  ? "and AutoDJ takes over with nothing to play, so the station goes silent and switches off in a few minutes."
                  : "and AutoDJ takes over, so the station stays on air."}{" "}
              Your queue is kept for next time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="h-11" disabled={ending} onClick={() => setOpen(false)}>
              Keep going
            </Button>
            <Button variant="destructive" className="h-11" disabled={ending} onClick={end}>
              {ending ? "Ending…" : "Yes, end it"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
