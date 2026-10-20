"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
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
type Broadcast = ReturnType<typeof useBroadcast>

/**
 * End the show and leave its summary for the wrap screen. Also the studio's
 * way out of a show that went off air for good (reconnects spent), where the
 * manager has already torn down but the station may still be up.
 */
export async function endShow({ slug, liveSince, getTransportStats, engine, after, stop, autoDjLocked }: {
  slug: string
  liveSince: number | null
  getTransportStats: Broadcast["getTransportStats"]
  engine: Broadcast["engine"]
  after: ShowSummary["after"]
  stop: Broadcast["stop"]
  autoDjLocked: boolean
}): Promise<void> {
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
  // Not removed if this throws: stop() may already have gone idle and sent
  // the studio to the wrap screen, which reads the summary as it opens. A
  // leftover is overwritten by the next End show and goes stale in 30 min.
  await stop({ releaseStation: autoDjLocked })
}

/** What End show tells the host when ending it threw (stop() or the release). */
export function endShowFailed() {
  toast.error("Something went wrong ending your show. Check on the overview that your station is off air.")
}

/** Opens End show's confirmation from elsewhere: the studio's back-gesture guard. */
export const ASK_END_SHOW_EVENT = "gocast:ask-end-show"

export function EndBroadcastButton({ className }: { className?: string }) {
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

  // The system back gesture in the live studio asks the same question.
  useEffect(() => {
    const onAsk = () => {
      setOnFor(liveSince ? Math.round((Date.now() - liveSince) / 1000) : null)
      setOpen(true)
    }
    window.addEventListener(ASK_END_SHOW_EVENT, onAsk)
    return () => window.removeEventListener(ASK_END_SHOW_EVENT, onAsk)
  }, [liveSince])

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
    try {
      // Idle takes the studio to the wrap screen (StudioPage); a replace here
      // raced its step off the back-guard.
      await endShow({ slug: stationSlug, liveSince, getTransportStats, engine, after, stop, autoDjLocked })
    } catch {
      endShowFailed()
    } finally {
      setEnding(false)
    }
  }

  return (
    <>
      {/* The `stop` style (red outline and words), like Turn station off:
          it ends the show for everyone, so it shouldn't read as just
          another button. Outlined, not filled, so it stays quieter than the
          live controls; the dialog still carries the consequence. */}
      <Button size="lg" variant="stop" full onClick={ask} className={className}>
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
