"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { env } from "@/lib/env"

/**
 * One cadence for every consumer of `/public/stations/{slug}/listeners`.
 *
 * Was 8s in the studio and 10s on the public pages, for no reason other than
 * which was written first. 10s wins because this is the poll that scales with
 * AUDIENCE rather than with owners: the dashboard is one person per station,
 * the public page and the embed are one of these timers per listener.
 *
 * Asking faster would not help much anyway. Half the count — the Icecast half
 * — is refreshed by `stations:sync-listeners` once a minute, so it moves in
 * minute-sized steps however often we ask. Only the HLS half, `is_live` and
 * `now_playing` are recomputed per request.
 */
const POLL_MS = 10_000

export interface PublicStationStats {
  /** Concurrent listeners. Null means "not known yet" — render nothing, never 0. */
  count: number | null
  is_live: boolean | null
  is_on_air: boolean | null
  now_playing: { title: string | null; artist: string | null }
}

type Subscriber = {
  notify: (stats: PublicStationStats) => void
  /** False keeps the feed running in a background tab. See the hook's docs. */
  pauseWhenHidden: boolean
}

interface Feed {
  subscribers: Set<Subscriber>
  timer: ReturnType<typeof setInterval> | null
  /** Last payload, handed to a late subscriber so it renders without waiting. */
  latest: PublicStationStats | null
  /** `Date.now()` of the last completed read, for the staleness check on focus. */
  readAt: number
  /** Guards against a slow request overlapping the next tick. */
  inFlight: boolean
}

/**
 * One feed per slug per tab, shared by every component that asks.
 *
 * Module scope, not context: the consumers sit on unrelated pages (the studio
 * deck, the station overview, the public player, the embed) and wrapping them
 * all in one provider would mean a provider above the whole app for a number
 * most pages never read. The registry gives the same guarantee — one timer
 * and one request per station — without one.
 */
const feeds = new Map<string, Feed>()

function normalise(body: unknown): PublicStationStats {
  const data = (body as { data?: Record<string, unknown> })?.data ?? {}
  const np = (data.now_playing ?? {}) as { title?: unknown; artist?: unknown }

  // Empty strings collapse to null here, once, so every consumer can treat
  // null as the only way of saying "no title". They arrive as "" from a
  // broadcaster that sends a blank metadata field.
  const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim() !== "" ? value : null

  return {
    count: typeof data.count === "number" ? data.count : null,
    is_live: typeof data.is_live === "boolean" ? data.is_live : null,
    is_on_air: typeof data.is_on_air === "boolean" ? data.is_on_air : null,
    now_playing: { title: text(np.title), artist: text(np.artist) },
  }
}

async function read(slug: string, feed: Feed): Promise<void> {
  if (feed.inFlight) return
  feed.inFlight = true

  try {
    const response = await fetch(`${env.apiUrl}/public/stations/${slug}/listeners`, {
      headers: { Accept: "application/json" },
    })
    if (!response.ok) return

    const stats = normalise(await response.json())
    feed.latest = stats
    feed.readAt = Date.now()

    for (const subscriber of Array.from(feed.subscribers)) {
      subscriber.notify(stats)
    }
  } catch {
    // Non-critical everywhere it is used: keep the last known values and try
    // again on the next tick. Nobody should see an error because a listener
    // count timed out.
  } finally {
    feed.inFlight = false
  }
}

/** Should this feed be running right now? */
function shouldRun(feed: Feed): boolean {
  if (feed.subscribers.size === 0) return false
  if (typeof document === "undefined" || !document.hidden) return true

  // Hidden: only keep going if somebody explicitly asked us to.
  return Array.from(feed.subscribers).some((s) => !s.pauseWhenHidden)
}

function sync(slug: string, feed: Feed): void {
  const running = feed.timer !== null

  if (shouldRun(feed)) {
    if (!running) feed.timer = setInterval(() => void read(slug, feed), POLL_MS)
    // Catch up only when the held value is actually stale. This runs on every
    // return to the tab, and alt-tabbing produces dozens of visibility
    // transitions a minute — each one an immediate request otherwise, against
    // an endpoint whose own throttle is 60/minute per IP.
    if (Date.now() - feed.readAt >= POLL_MS) void read(slug, feed)
    return
  }

  if (running) {
    clearInterval(feed.timer!)
    feed.timer = null
  }
}

let visibilityBound = false

function bindVisibility(): void {
  if (visibilityBound || typeof document === "undefined") return
  visibilityBound = true

  document.addEventListener("visibilitychange", () => {
    for (const [slug, feed] of feeds) sync(slug, feed)
  })
}

/**
 * Subscribe to a station's public stats, as a CALLBACK per read.
 *
 * The primitive the other two hooks are built on, and the right one for a
 * consumer that folds each reading into state it already owns — which is most
 * of them, because a player is also fed by in-band ID3 and must not have the
 * poll overwrite it. Taking a value and mirroring it with an effect instead
 * means a second render for every poll, and React's own lint rule says so.
 *
 * `onUpdate` is held in a ref, so callers do not have to memoise it and an
 * inline arrow does not resubscribe the feed on every render.
 *
 * Paused while the tab is hidden by default. That is the change that matters:
 * this is the only poll in the app that scales with LISTENERS rather than
 * owners, and a public station page left open in a background tab used to
 * keep asking forever.
 *
 * @param pauseWhenHidden Pass false to keep polling in a hidden tab. The
 *   studio does, and only the studio: it tracks a session peak and fires
 *   milestone toasts, and a broadcaster who alt-tabs to their music library
 *   mid-show would otherwise come back to a sparkline full of holes and a
 *   peak that missed its own high point. One broadcaster per station makes
 *   that affordable in a way an audience never is.
 */
export function usePublicStationFeed(
  slug: string | null,
  onUpdate: (stats: PublicStationStats) => void,
  { enabled = true, pauseWhenHidden = true }: { enabled?: boolean; pauseWhenHidden?: boolean } = {},
): void {
  // The "latest ref" pattern: the subscription below closes over this rather
  // than over `onUpdate`, so an inline arrow from a caller does not tear the
  // feed down and rebuild it on every render. Assigned in its own effect
  // because writing a ref during render is not allowed — the initial value
  // from useRef covers the first subscribe, which happens after this runs.
  const handler = useRef(onUpdate)
  useEffect(() => {
    handler.current = onUpdate
  })

  useEffect(() => {
    if (!enabled || !slug) return

    bindVisibility()

    let feed = feeds.get(slug)
    if (!feed) {
      feed = { subscribers: new Set(), timer: null, latest: null, readAt: 0, inFlight: false }
      feeds.set(slug, feed)
    }

    const subscriber: Subscriber = {
      notify: (stats) => handler.current(stats),
      pauseWhenHidden,
    }
    feed.subscribers.add(subscriber)

    // A second consumer of a station already being polled renders from the
    // held value immediately rather than sitting empty until the next tick.
    if (feed.latest) subscriber.notify(feed.latest)

    sync(slug, feed)

    return () => {
      feed.subscribers.delete(subscriber)
      sync(slug, feed)

      // Drop the feed once nothing wants it, so a long session that visits
      // many stations does not accumulate an entry each. `latest` goes with
      // it, which is correct — a count held across a navigation would be
      // shown as current when it is minutes old.
      if (feed.subscribers.size === 0) feeds.delete(slug)
    }
  }, [slug, enabled, pauseWhenHidden])
}

/**
 * Listener count, air state and now-playing for one station, as state.
 *
 * Every surface that wants any of these shares one timer and one request per
 * station, because they all come from the same endpoint and a page showing
 * two of them used to show two different numbers polled seconds apart.
 *
 * For a consumer that only displays what arrives. Anything that merges the
 * reading with another source should take {@link usePublicStationFeed}
 * instead and fold it in directly.
 */
export function usePublicStationStats(
  slug: string | null,
  options: { enabled?: boolean; pauseWhenHidden?: boolean } = {},
): PublicStationStats | null {
  const [stats, setStats] = useState<PublicStationStats | null>(null)

  usePublicStationFeed(slug, useCallback((next: PublicStationStats) => setStats(next), []), options)

  // Derived rather than cleared inside the effect: a station that has just
  // gone off air must stop reporting an audience on the same render, and
  // resetting state from the effect would cost an extra one to say so.
  return options.enabled === false ? null : stats
}
