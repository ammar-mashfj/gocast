"use client"

import { useEffect, useRef, useState } from "react"
import { IconHeadphones } from "@tabler/icons-react"
import { Card, CardContent } from "@/components/ui/card"
import { useListenerCount } from "@/hooks/useListenerCount"
import { cn } from "@/lib/utils"

/** How long the number takes to travel from the old value to the new one. */
const COUNT_MS = 650

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/**
 * Tweens a number towards `target` so a jump from 3 to 40 reads as a climb
 * rather than a flicker.
 *
 * The count is polled, not pushed, so it arrives in steps — the animation is
 * what turns those steps back into something that looks continuous. It starts
 * from 0 on the first known value so the card fills in on arrival instead of
 * snapping to its final state before the eye has landed on it.
 *
 * Returns `null` for as long as the count is unknown: an unanswered poll is
 * not the same as an empty room, and tweening towards a guess would state one
 * as the other.
 */
function useCountUp(target: number | null): number | null {
  const [animated, setAnimated] = useState(0)
  const frame = useRef<number | null>(null)
  // The value the running tween interpolates from. Kept in a ref rather than
  // read back off state: it changes on every frame, and nothing renders it.
  const from = useRef(0)

  useEffect(() => {
    if (target === null) {
      // Nothing to count towards. The next known value starts from zero, so
      // a station coming back on air fills in rather than resuming mid-climb.
      from.current = 0
      return
    }

    const origin = from.current
    // Reduced motion collapses the tween to a single frame rather than
    // skipping it: the value still arrives through the same path, so there is
    // one code path to be wrong instead of two.
    const duration = prefersReducedMotion() ? 0 : COUNT_MS
    const start = performance.now()

    function step(now: number) {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration)
      // easeOutCubic — fast off the mark, settling rather than stopping.
      const eased = 1 - (1 - t) ** 3
      const value = Math.round(origin + (target! - origin) * eased)
      from.current = value
      setAnimated(value)
      if (t < 1) frame.current = requestAnimationFrame(step)
    }

    frame.current = requestAnimationFrame(step)
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [target])

  // Derived, not stored: an unknown count must read as unknown on the very
  // render it becomes unknown, without waiting for an effect to say so.
  return target === null ? null : animated
}

interface LiveListenersProps {
  slug: string
  /**
   * Whether the station is on air. Polling is pointless off air — there is no
   * mount to be connected to — and the card says so rather than showing a
   * confident zero that is really "not applicable".
   */
  isOnAir: boolean
  /** All-time peak concurrent listeners, for scale under the live figure. */
  peakListeners?: number
}

/**
 * The audience, right now — the one number a broadcaster looks up for.
 *
 * Deliberately the largest thing in the rail: it is the only figure on the
 * page that changes while you watch it, and it is the question every other
 * card is in service of. The rings are the honest part of the animation —
 * they run only while someone is actually connected, so a glance from across
 * the room tells you whether anyone is there without reading a digit.
 */
export function LiveListeners({ slug, isOnAir, peakListeners = 0 }: LiveListenersProps) {
  const count = useListenerCount(slug, isOnAir)
  const display = useCountUp(count)
  const hasAudience = isOnAir && (count ?? 0) > 0

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col items-center gap-4 py-2 text-center">
        {/* Emblem. The rings are absolutely positioned siblings rather than
            box-shadows so they can scale past the badge without pushing the
            layout around. */}
        <div className="relative flex size-16 items-center justify-center">
          {hasAudience && (
            <>
              <span className="absolute inset-0 rounded-full bg-primary/25 motion-safe:animate-ping" />
              <span
                className="absolute inset-0 rounded-full bg-primary/20 motion-safe:animate-ping"
                // Staggered so the two rings read as a repeating pulse
                // travelling outward, not as one thick ring.
                style={{ animationDelay: "0.75s" }}
              />
            </>
          )}
          <span
            className={cn(
              "relative flex size-14 items-center justify-center rounded-full ring-1 transition-colors duration-500",
              hasAudience
                ? "bg-primary/15 text-primary ring-primary/30"
                : "bg-muted/40 text-muted-foreground ring-foreground/10",
            )}
          >
            <IconHeadphones size={26} stroke={1.5} />
          </span>
        </div>

        <div className="flex flex-col items-center gap-1">
          {display === null ? (
            // Unknown, not zero: off air there is nothing to count, and before
            // the first poll lands we simply do not know yet.
            <span className="text-4xl font-medium tabular-nums text-muted-foreground/40">
              —
            </span>
          ) : (
            <span
              // `tabular-nums` keeps the digits from reflowing mid-tween —
              // without it a proportional font shifts the whole number
              // sideways on every frame that changes a digit's width.
              className={cn(
                "text-5xl font-medium tabular-nums leading-none transition-colors duration-500",
                hasAudience ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {display}
            </span>
          )}

          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {!isOnAir
              ? "Off air"
              : count === 1
                ? "Listener right now"
                : "Listeners right now"}
          </span>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground/80">
          {!isOnAir
            ? "Put the station on air to start counting."
            : count === null
              // On air but the first poll has not answered. "Nobody tuned in
              // yet" here would be a claim about an audience we have not
              // counted, which is exactly the thing this card exists to know.
              ? "Counting who is tuned in…"
              : hasAudience
                ? "Updates every few seconds while you are on air."
                : peakListeners > 0
                  ? `Nobody tuned in yet — your peak is ${peakListeners}.`
                  : "Nobody tuned in yet. Share your link to bring someone in."}
        </p>
      </CardContent>
    </Card>
  )
}
