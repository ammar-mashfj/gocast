"use client"

import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react'
import { BroadcastManager, type BroadcastState, type BroadcastStepInfo } from '@/lib/broadcast'
import type { AudioEngine } from '@/lib/audioEngine'

interface BroadcastContextValue {
  state: BroadcastState
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
  const managerRef = useRef<BroadcastManager | null>(null)

  const start = useCallback(async (stationId: string, options?: { skipMic?: boolean }) => {
    if (managerRef.current) {
      await managerRef.current.stop()
    }

    setError(null)
    const manager = new BroadcastManager(stationId, {
      onStepChange: setSteps,
      onStateChange: (s) => {
        setState(s)
        if (s === 'live') {
          setMicStream(manager.getMicStream())
          setEngine(manager.getEngine())
        } else if (s === 'idle') {
          setMicStream(null)
          setEngine(null)
        }
      },
      onError: setError,
    })
    managerRef.current = manager
    if (options?.skipMic) {
      setMicDisabled(true)
      try { sessionStorage.setItem('broadcast:micDisabled', 'true') } catch {}
    }
    await manager.start(options)
  }, [])

  const stop = useCallback(async () => {
    if (managerRef.current) {
      await managerRef.current.stop()
      managerRef.current = null
    }
    setMicStream(null)
    setMicDisabled(false)
    try { sessionStorage.removeItem('broadcast:micDisabled') } catch {}
    setEngine(null)
    setSteps([])
    setError(null)
  }, [])

  const updateMetadata = useCallback((title: string, artist: string) => {
    managerRef.current?.updateMetadata(title, artist)
  }, [])

  return (
    <BroadcastContext.Provider value={{ state, steps, error, micStream, micDisabled, engine, start, stop, updateMetadata }}>
      {children}
    </BroadcastContext.Provider>
  )
}

export function useBroadcast() {
  const ctx = useContext(BroadcastContext)
  if (!ctx) throw new Error('useBroadcast must be used within BroadcastProvider')
  return ctx
}
