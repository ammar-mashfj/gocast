"use client"

import { useEffect, useState } from "react"

/**
 * Refused mic prompts, per station, for this browser session, shared by the
 * Go live page's mic check and the go-live checks dialog. Chrome stops
 * showing a site's prompt after about three dismissals (it flashes and
 * auto-rejects, or never appears), so past MIC_TRIES a Try again can't work
 * and isn't offered: only the browser's settings can undo it.
 */
export const MIC_TRIES = 2

const key = (slug: string | null) => `gocast:micFailures:${slug ?? ""}`

function read(slug: string | null): number {
  try {
    return Number(sessionStorage.getItem(key(slug))) || 0
  } catch {
    return 0
  }
}

function write(slug: string | null, n: number) {
  try {
    if (n === 0) sessionStorage.removeItem(key(slug))
    else sessionStorage.setItem(key(slug), String(n))
  } catch {
    /* storage blocked: Try again simply stays */
  }
}

/**
 * The count so far. `failed` true counts once per failure (it has to go
 * false again before the next one counts); `succeeded` resets it. Adjusted
 * while rendering, React's pattern for state that follows props.
 */
export function useMicFailures(slug: string | null, failed: boolean, succeeded: boolean): number {
  const [count, setCount] = useState(() => read(slug))
  const [countedSlug, setCountedSlug] = useState(slug)
  const [counted, setCounted] = useState(false)

  // Mounted before a station was picked: re-read for the new one.
  if (slug !== countedSlug) {
    setCountedSlug(slug)
    setCount(read(slug))
  }
  if (failed && !counted) {
    setCounted(true)
    // From storage, not local state: the other surface may have counted
    // one since this mounted.
    setCount(read(slug) + 1)
  } else if (!failed && counted) {
    setCounted(false)
  }
  if (succeeded && count !== 0) setCount(0)

  useEffect(() => {
    write(slug, count)
  }, [slug, count])

  return count
}
