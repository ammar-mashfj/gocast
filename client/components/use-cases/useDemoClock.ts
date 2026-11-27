"use client"

import { useEffect, useRef, useState } from "react"
import { useReducedMotion } from "@/components/homepage/heroSection/HeroHandover"

/**
 * Seconds of "air time" for an audience page's demo card: ticks once a
 * second while the card is on screen and the tab is visible, holds still
 * otherwise, and never starts under reduced motion (the card then shows its
 * first state, which reads fine as a still).
 *
 * Returns the ref to put on the card and the elapsed seconds.
 */
export function useDemoClock<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const still = useReducedMotion()
  const [secs, setSecs] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el || still) return
    let inView = false
    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
    })
    io.observe(el)
    const t = setInterval(() => {
      if (inView && !document.hidden) setSecs((s) => s + 1)
    }, 1000)
    return () => {
      clearInterval(t)
      io.disconnect()
    }
  }, [still])

  return { ref, secs }
}

/**
 * A listener count that wanders like a real one: a deterministic walk
 * around `base` (no Math.random, so server and client render the same
 * first frame), moving every few seconds.
 */
export function demoListeners(base: number, secs: number, every = 3): number {
  const step = Math.floor(secs / every)
  const wobble = Math.round(Math.sin(step * 1.7) * 3 + Math.sin(step * 0.45) * 5)
  return Math.max(1, base + wobble)
}

/** h:mm:ss / mm:ss for an on-air clock starting at `start` seconds. */
export function airClock(start: number, secs: number): string {
  const t = start + secs
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  const mm = String(m).padStart(2, "0")
  const ss = String(s).padStart(2, "0")
  return h > 0 ? `${String(h).padStart(2, "0")}:${mm}:${ss}` : `${mm}:${ss}`
}
