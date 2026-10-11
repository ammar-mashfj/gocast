"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { getSessionPeak } from "@/hooks/useBroadcastStats"
import { useStationStatus } from "@/hooks/useStationStatus"
import { Button } from "@/components/ds/Button"
import { ConfirmDialog } from "@/components/ds/ConfirmDialog"
import { formatAirtime } from "@/lib/format"

/** What the overview's sign-off card reads after a show ends. */
export interface ShowSummary {
  slug: string
  endedAt: number
  durationSeconds: number
  peakListeners: number
  lostSeconds: number
  /** Tracks that started during the show. Absent on summaries from before it was counted. */
  tracksPlayed?: number
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
 * "End show": asks once, then ends the broadcast and leaves a summary for
 * the wrap screen (studio/wrap). The summary is written before the stop,
 * because the studio moves to the wrap screen the moment the socket closes.
 */
export function EndBroadcastButton({ className }: { className?: string }) {
  const router = useRouter()
  const { stop, stationSlug, liveSince, getTransportStats, engine } = useBroadcast()
  // No AutoDJ means there is nothing for the station to fall back to, so
  // ending the broadcast takes the station off air too. With AutoDJ it is a
  // handover and the station stays up. False while the plan is unknown, so an
  // account we can't identify keeps the safer behaviour of staying on air.
  const autoDjLocked = useAutoDjLocked()
  const [open, setOpen] = useState(false)
  const [ending, setEnding] = useState(false)
  /** How long the show has run, read when the question is asked. */
  const [onFor, setOnFor] = useState<number | null>(null)
  function ask() {
    setOnFor(liveSince ? Math.round((Date.now() - liveSince) / 1000) : null)
    setOpen(true)
  }

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
      tracksPlayed: engine?.getTracksPlayed() ?? 0,
      after,
    }
    // Written BEFORE stop(): stop() goes idle first and the studio moves to
    // the wrap screen on that — on Free, long before stop() returns from
    // releasing the station.
    try {
      sessionStorage.setItem(signOffKey(slug), JSON.stringify(summary))
    } catch {
      // Storage blocked — the show still ends; the wrap screen falls back to the overview.
    }
    try {
      try {
        await stop({ releaseStation: autoDjLocked })
      } catch (err) {
        try { sessionStorage.removeItem(signOffKey(slug)) } catch {}
        throw err
      }
      router.replace(`/dashboard/stations/${slug}/studio/wrap`)
    } finally {
      setEnding(false)
    }
  }

  return (
    <>
      {/* Neutral on purpose: the consequence is carried by the dialog. */}
      <Button size="lg" variant="ghost" full onClick={ask} className={className}>
        End show
      </Button>

      {/* Not dismissable while the stop is in flight: it closes the socket
          and navigates. Primary, not red: ending a show is ordinary, and red
          means "you're live". */}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={end}
        busy={ending}
        title="End your show?"
        description={
          (onFor !== null ? `You’ve been on for ${formatAirtime(onFor)}. ` : "") +
          (after === "off_air"
            ? "Everyone listening is cut off and the station goes off air."
            : after === "silence"
              ? "Your show stops for everyone listening. AutoDJ has nothing to play, so they hear silence and the station switches off in a few minutes."
              : "Your show stops for everyone listening, and they hear AutoDJ straight away.") +
          " Your queue is kept for next time."
        }
        confirmLabel={ending ? "Ending…" : "End show"}
        keepLabel="Keep going"
      />
    </>
  )
}
