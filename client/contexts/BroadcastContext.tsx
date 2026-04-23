"use client"

import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react'
import { toast } from 'sonner'
import { BroadcastManager, type BroadcastState, type BroadcastStepInfo } from '@/lib/broadcast'
import type { AudioEngine } from '@/lib/audioEngine'
import { fireOnce } from '@/lib/milestones'

const RECOVERY_KEY = 'broadcast:active'

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
  start: (stationId: string, options?: { skipMic?: boolean }) => Promise<void>
  stop: () => Promise<void>
  updateMetadata: (title: string, artist: string) => void
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

  const start = useCallback(async (stationId: string, options?: { skipMic?: boolean }) => {
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
  }, [])

  const stop = useCallback(async () => {
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
  }, [])

  const updateMetadata = useCallback((title: string, artist: string) => {
    managerRef.current?.updateMetadata(title, artist)
  }, [])

  return (
    <BroadcastContext.Provider value={{ state, stationSlug, steps, error, micStream, micDisabled, engine, start, stop, updateMetadata }}>
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
