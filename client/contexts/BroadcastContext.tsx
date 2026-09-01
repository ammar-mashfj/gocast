"use client"

import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react'
import { toast } from 'sonner'
import { BroadcastManager, type BroadcastState, type BroadcastStepInfo, type TransportStats } from '@/lib/broadcast'
import type { AudioEngine } from '@/lib/audioEngine'
import { fireOnce } from '@/lib/milestones'
import api from '@/lib/axios'

const RECOVERY_KEY = 'broadcast:active'

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
 * until `stations:sweep` reclaims it a minute or two later, which reads as a
 * stop button that didn't work.
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

export interface BroadcastRecoveryRecord {
  stationSlug: string
  micDisabled: boolean
  startedAt: number
}

/**
 * Read the per-tab recovery record. Returns null if there's no active
 * broadcast intent or the record is malformed. Survives page refreshes
 * (sessionStorage), dies with the tab — exactly the lifetime we want.
 */
export function readBroadcastRecovery(): BroadcastRecoveryRecord | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(RECOVERY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      typeof parsed?.stationSlug === 'string' &&
      typeof parsed?.micDisabled === 'boolean' &&
      typeof parsed?.startedAt === 'number'
    ) {
      return parsed as BroadcastRecoveryRecord
    }
    return null
  } catch {
    return null
  }
}

export function clearBroadcastRecovery() {
  if (typeof sessionStorage === 'undefined') return
  try { sessionStorage.removeItem(RECOVERY_KEY) } catch {}
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
   * Live send-path tally, or null before a broadcast exists. A function
   * rather than state: it changes on every encoded frame, and re-rendering
   * the whole dashboard at the encoder's frame rate would be absurd. Callers
   * sample it on their own cadence.
   */
  getTransportStats: () => TransportStats | null
  start: (stationId: string, options?: { skipMic?: boolean }) => Promise<void>
  /**
   * End the broadcast. `releaseStation` additionally takes the station off
   * air, and belongs to callers that know the account has no AutoDJ to hand
   * over to — see {@link releaseStation}.
   */
  stop: (options?: { releaseStation?: boolean }) => Promise<void>
}

/**
 * Provides broadcast state (idle / connecting / live / error), connection
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
  const managerRef = useRef<BroadcastManager | null>(null)
  const stationIdRef = useRef<string | null>(null)
  // Guards against a second start racing the first. Each call builds its own
  // BroadcastManager, so without this two sockets open: the first claims the
  // harbor mount and the second is refused with Mount_taken — killing a
  // broadcast that was, in fact, already live. Reproduced by a double click
  // and by React's development double-invoke.
  const startingRef = useRef(false)

  const start = useCallback(async (stationId: string, options?: { skipMic?: boolean }) => {
    if (startingRef.current) return
    startingRef.current = true

    try {
      if (managerRef.current) {
        // Don't let a tear-down failure on the previous (possibly errored)
        // manager block a fresh start — Try again must always reach the new
        // manager.start() below.
        try { await managerRef.current.stop() } catch { /* discard */ }
      }

      setError(null)
      const manager = new BroadcastManager(stationId, {
        onStepChange: setSteps,
        onStateChange: (s) => {
          setState(s)
          if (s === 'live') {
            setMicStream(manager.getMicStream())
            setEngine(manager.getEngine())
            // Persist a per-tab recovery record so an accidental refresh can
            // resume from the right station with the right mic preference.
            try {
              sessionStorage.setItem(
                RECOVERY_KEY,
                JSON.stringify({
                  stationSlug: stationId,
                  micDisabled: !!options?.skipMic,
                  startedAt: Date.now(),
                } satisfies BroadcastRecoveryRecord),
              )
            } catch {}
            // First-ever broadcast celebration. Subsequent milestones
            // (cumulative airtime / sessions count) live on the dashboard
            // where we have access to the stats endpoint.
            fireOnce('broadcaster:first-live', () => {
              toast.success("🎙️ You're live for the first time — share your link!")
            })
          } else if (s === 'idle') {
            setMicStream(null)
            setEngine(null)
            clearBroadcastRecovery()
          }
        },
        onError: setError,
      })
      managerRef.current = manager
      stationIdRef.current = stationId
      setStationSlug(stationId)
      setMicDisabled(!!options?.skipMic)
      await manager.start(options)
    } finally {
      startingRef.current = false
    }
  }, [])

  const getTransportStats = useCallback(
    () => managerRef.current?.getTransportStats() ?? null,
    [],
  )

  const stop = useCallback(async (options?: { releaseStation?: boolean }) => {
    // Captured before the teardown below clears it.
    const slug = stationIdRef.current

    if (managerRef.current) {
      await managerRef.current.stop()
      managerRef.current = null
    }
    if (stationIdRef.current) {
      try { localStorage.removeItem(`broadcast:micDisabled:${stationIdRef.current}`) } catch {}
      stationIdRef.current = null
    }
    clearBroadcastRecovery()
    setStationSlug(null)
    setMicStream(null)
    setMicDisabled(false)
    setEngine(null)
    setSteps([])
    setError(null)

    // Last, and after the socket is definitely closed: harbor only reports the
    // disconnect once it sees it, and the stop is refused until it does.
    if (options?.releaseStation && slug) {
      await releaseStation(slug)
    }
  }, [])

  return (
    <BroadcastContext.Provider value={{ state, stationSlug, steps, error, micStream, micDisabled, engine, getTransportStats, start, stop }}>
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
