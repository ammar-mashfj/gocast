"use client"

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { toast } from 'sonner'
import { BroadcastManager, type BroadcastStartOptions, type BroadcastState, type BroadcastStepInfo, type TransportStats } from '@/lib/broadcast'
import type { AudioEngine, TrackDrop } from '@/lib/audioEngine'
import { fireOnce } from '@/lib/milestones'
import api from '@/lib/axios'

/** What the host is told when the engine takes tracks out of the running order itself. */
function dropMessage({ reason, titles }: TrackDrop): string {
  const what = titles.length === 1 ? `"${titles[0]}"` : `${titles.length} tracks`
  return reason === 'unplayable'
    ? `Couldn't play ${what}, so ${titles.length === 1 ? 'it was' : 'they were'} taken out of the running order.`
    : `${what} couldn't be read anymore and ${titles.length === 1 ? 'was' : 'were'} taken out of the running order. Add the ${titles.length === 1 ? 'file' : 'files'} again to play ${titles.length === 1 ? 'it' : 'them'}.`
}

/**
 * How long to keep asking the API to take a station off air after the socket
 * has closed, in milliseconds between attempts.
 *
 * `POST /stations/{slug}/stop` is refused with 409 `station_is_live` while a
 * StreamSession is still open, and that session is closed by harbor's
 * `live_disconnected` callback — which reaches Laravel a moment AFTER the
 * browser closes the socket. So the first attempt legitimately loses the race
 * much of the time; these delays are waiting for that event to land, not
 * retrying a failure.
 */
const RELEASE_RETRY_DELAYS_MS = [0, 400, 800, 1500, 2500]

/**
 * Take the station off air now that its broadcast has deliberately ended.
 *
 * ONLY for accounts without AutoDJ, and the caller owns that check. With a
 * rotation, ending a broadcast means handing the station back to AutoDJ and
 * the container has to stay up. Without one, the fallback arm is a silence
 * bed: leaving the container running parks the station on "On air — silence"
 * until `stations:sweep` reclaims it about 2.5 minutes later, which reads as
 * a stop button that didn't work.
 *
 * Deliberately not moved server-side onto `live_disconnected`. That event
 * cannot tell "I'm done" from "my wifi dropped", and tearing the container
 * down on every hiccup would cost a full container rebuild plus every
 * connected listener — the reconnect path (see BroadcastManager.reconnect)
 * depends on the container outliving a dropped socket. Only an explicit press
 * carries the intent, and only the client sees it.
 *
 * Best-effort: the sweep remains the backstop for every other way a broadcast
 * can end, so a failure here costs freshness, never correctness.
 */
async function releaseStation(slug: string): Promise<void> {
  for (const delay of RELEASE_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    try {
      await api.post(`/stations/${slug}/stop`)
      return
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      // 409 is the one answer worth waiting out. Anything else — a station
      // that isn't ours, a throttle, an API that is down — will not become
      // true by being asked again, and the sweep covers it.
      if (status !== 409) return
    }
  }
}

interface BroadcastContextValue {
  state: BroadcastState
  stationSlug: string | null
  steps: BroadcastStepInfo[]
  error: string | null
  micStream: MediaStream | null
  micDisabled: boolean
  engine: AudioEngine | null
  /**
   * When this broadcast first went live (epoch ms), or null when idle.
   * Owned here, not by a page: a reconnect or a trip to the library and back
   * is still the same show, and an uptime counted from when the studio
   * mounted restarted at 0:00 every time the broadcaster came back to it.
   */
  liveSince: number | null
  /**
   * Live send-path tally, or null before a broadcast exists. A function
   * rather than state: it changes on every encoded frame, and re-rendering
   * the whole dashboard at the encoder's frame rate would be absurd. Callers
   * sample it on their own cadence.
   */
  getTransportStats: () => TransportStats | null
  /** Run the go-live checklist. Ends in `ready`, with nothing on air yet. */
  start: (stationId: string, options?: BroadcastStartOptions) => Promise<void>
  /** Go on air from `ready`. See {@link BroadcastManager.goLive}. */
  goLive: () => Promise<void>
  /** Change microphone at `ready`. See {@link BroadcastManager.switchMic}. */
  switchMic: (deviceId: string) => Promise<void>
  /**
   * End the broadcast. `releaseStation` additionally takes the station off
   * air, and belongs to callers that know the account has no AutoDJ to hand
   * over to — see {@link releaseStation}. `'if-started-here'` is the Cancel
   * button's version: take it off air only if the checklist being cancelled
   * is what turned it on, so a station the host had left running stays
   * running.
   */
  stop: (options?: { releaseStation?: boolean | 'if-started-here' }) => Promise<void>
}

/**
 * Provides broadcast state (idle / connecting / ready / live / error), connection
 * step progress, the audio engine, and mic stream to all dashboard pages.
 * Wrap the dashboard layout with {@link BroadcastProvider} and consume
 * via {@link useBroadcast}.
 */
const BroadcastContext = createContext<BroadcastContextValue | null>(null)

export function BroadcastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BroadcastState>('idle')
  const [steps, setSteps] = useState<BroadcastStepInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [micStream, setMicStream] = useState<MediaStream | null>(null)
  const [engine, setEngine] = useState<AudioEngine | null>(null)
  const [micDisabled, setMicDisabled] = useState(false)
  const [stationSlug, setStationSlug] = useState<string | null>(null)
  const [liveSince, setLiveSince] = useState<number | null>(null)
  const managerRef = useRef<BroadcastManager | null>(null)
  const stationIdRef = useRef<string | null>(null)
  // Guards against a second start racing the first. Each call builds its own
  // BroadcastManager, so without this two sockets open: the first claims the
  // harbor mount and the second is refused with Mount_taken — killing a
  // broadcast that was, in fact, already live. Reproduced by a double click
  // and by React's development double-invoke.
  // Holds the pending start's own token: stop() clears it, so a Go live
  // pressed after Cancel isn't refused while the cancelled checks wind down,
  // and that old start's `finally` can't clear a newer start's guard.
  const startingRef = useRef<object | null>(null)
  // The checklist (or go-live) the current manager is running, for a Cancel
  // that wants to hand back only what that run took: whether it turned the
  // station on is only known once it has wound down past `POST /start`.
  const inFlightRef = useRef<Promise<void> | null>(null)

  const start = useCallback(async (stationId: string, options?: BroadcastStartOptions) => {
    if (startingRef.current) return
    const token = {}
    startingRef.current = token

    try {
      if (managerRef.current) {
        // Don't let a tear-down failure on the previous (possibly errored)
        // manager block a fresh start — Try again must always reach the new
        // manager.start() below.
        try { await managerRef.current.stop() } catch { /* discard */ }
      }
      // Cancelled during that teardown: don't build a manager nobody will stop.
      if (startingRef.current !== token) return

      setError(null)
      // A new start is a new show. A broadcast that died of exhausted
      // reconnects ends in 'error', not 'idle', so without this Try again
      // would inherit the dead show's clock, stats key and milestones.
      setLiveSince(null)
      const manager = new BroadcastManager(stationId, {
        onStepChange: setSteps,
        onStateChange: (s) => {
          setState(s)
          if (s === 'live') {
            // First transition only — a reconnect lands here again and must
            // not restart the show's clock.
            setLiveSince((prev) => prev ?? Date.now())
            setMicStream(manager.getMicStream())
            setEngine(manager.getEngine())
            // First-ever broadcast celebration. Subsequent milestones
            // (cumulative airtime / sessions count) live on the dashboard
            // where we have access to the stats endpoint.
            fireOnce('broadcaster:first-live', () => {
              toast.success("🎙️ You're live for the first time — share your link!")
            })
          } else if (s === 'ready') {
            // For the Ready screen's mic check: the mic is open, nothing is
            // on air, and the host should see the bars move before they go.
            setMicStream(manager.getMicStream())
          } else if (s === 'idle') {
            setMicStream(null)
            setEngine(null)
            setLiveSince(null)
          }
        },
        onError: setError,
      })
      managerRef.current = manager
      stationIdRef.current = stationId
      setStationSlug(stationId)
      setMicDisabled(!!options?.skipMic)
      const run = manager.start(options)
      inFlightRef.current = run
      await run
    } finally {
      if (startingRef.current === token) startingRef.current = null
    }
  }, [])

  const goLive = useCallback(async () => {
    const manager = managerRef.current
    if (!manager) return
    const run = manager.goLive()
    inFlightRef.current = run
    await run
  }, [])

  const switchMic = useCallback(async (deviceId: string) => {
    const manager = managerRef.current
    if (!manager) return
    setMicStream(await manager.switchMic(deviceId))
  }, [])

  const getTransportStats = useCallback(
    () => managerRef.current?.getTransportStats() ?? null,
    [],
  )

  const stop = useCallback(async (options?: { releaseStation?: boolean | 'if-started-here' }) => {
    // Captured before the teardown below clears them.
    const slug = stationIdRef.current
    const manager = managerRef.current
    const inFlight = inFlightRef.current
    startingRef.current = null
    inFlightRef.current = null

    if (manager) {
      await manager.stop()
      managerRef.current = null
    }
    if (stationIdRef.current) {
      try { localStorage.removeItem(`broadcast:micDisabled:${stationIdRef.current}`) } catch {}
      stationIdRef.current = null
    }
    setStationSlug(null)
    setLiveSince(null)
    setMicStream(null)
    setMicDisabled(false)
    setEngine(null)
    setSteps([])
    setError(null)

    // Last, and after the socket is definitely closed: harbor only reports the
    // disconnect once it sees it, and the stop is refused until it does.
    if (!options?.releaseStation || !slug) return
    if (options.releaseStation === 'if-started-here') {
      // The cancelled checklist gives up at its next await, which can be the
      // far side of `POST /start` (or a mic prompt the host has yet to
      // answer). Only once it has can the manager say whether it turned the
      // station on. The page is already back on pre-flight: nothing above
      // waited for this.
      await inFlight?.catch(() => {})
      if (!manager?.startedStationThisRun) return
      // Go live was pressed again in the meantime: the station is the new
      // run's now, and taking it off air would be pulling its chair away.
      if (managerRef.current) return
    }
    await releaseStation(slug)
  }, [])

  // Warn before a refresh or tab close takes the broadcast down. Lives here,
  // not in the studio, because the socket belongs to this provider and stays
  // open on every dashboard page — leaving from the library ends the show
  // just as surely as leaving from the studio.
  const onAir = state === 'live' || state === 'reconnecting'
  useEffect(() => {
    if (!onAir) return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [onAir])

  // A suspended audio context broadcasts silence, and only a user gesture is
  // guaranteed to wake it. Every gesture is offered, not just the first: the
  // browser can suspend it again later (the lamp says so when it does). Here
  // rather than in the studio, because the banner on every other page tells
  // the host to click to resume — and only the studio used to listen.
  useEffect(() => {
    if (!engine) return
    const resume = () => {
      if (engine.isSuspended()) void engine.resume()
    }
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
    return () => {
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
    }
  }, [engine])

  // Tracks the engine took out because they could never play. Here rather
  // than in the studio: the queue keeps playing on every dashboard page, and
  // the host should hear about it wherever they are. A rebuilt engine is a
  // new `engine`, so the subscription follows it.
  useEffect(() => {
    if (!engine) return
    return engine.onTracksDropped((drop) => toast.warning(dropMessage(drop)))
  }, [engine])

  return (
    <BroadcastContext.Provider value={{ state, stationSlug, steps, error, micStream, micDisabled, engine, liveSince, getTransportStats, start, goLive, switchMic, stop }}>
      {children}
    </BroadcastContext.Provider>
  )
}

export function useBroadcast() {
  const ctx = useContext(BroadcastContext)
  if (!ctx) throw new Error('useBroadcast must be used within BroadcastProvider')
  return ctx
}

/**
 * Same as `useBroadcast` but returns `null` outside the provider — useful
 * for components that render in both authenticated (with provider) and
 * public (without provider) layouts.
 */
export function useBroadcastOptional(): BroadcastContextValue | null {
  return useContext(BroadcastContext)
}
