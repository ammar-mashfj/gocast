"use client"

import { useEffect, useRef, useState } from "react"

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
export function useCountUp(target: number | null): number | null {
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
