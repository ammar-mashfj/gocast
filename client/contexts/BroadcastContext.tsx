"use client"

import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react'
import { BroadcastManager, type BroadcastState, type BroadcastStepInfo, type StudioState } from '@/lib/broadcast'

interface BroadcastContextValue {
  state: BroadcastState
  steps: BroadcastStepInfo[]
  error: string | null
  micStream: MediaStream | null
  micDisabled: boolean
  studio: StudioState | null
  sendCommand: (cmd: Record<string, unknown>) => void
  start: (stationId: string, options?: { skipMic?: boolean }) => Promise<void>
  stop: () => Promise<void>
}

const BroadcastContext = createContext<BroadcastContextValue | null>(null)

export function BroadcastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BroadcastState>('idle')
  const [steps, setSteps] = useState<BroadcastStepInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [micStream, setMicStream] = useState<MediaStream | null>(null)
  const [studio, setStudio] = useState<StudioState | null>(null)
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
        } else if (s === 'idle') {
          setMicStream(null)
          setStudio(null)
        }
      },
      onError: setError,
      onStudioState: setStudio,
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
    setStudio(null)
    setSteps([])
    setError(null)
  }, [])

  const sendCommand = useCallback((cmd: Record<string, unknown>) => {
    managerRef.current?.sendCommand(cmd)
  }, [])

  return (
    <BroadcastContext.Provider value={{ state, steps, error, micStream, micDisabled, studio, sendCommand, start, stop }}>
      {children}
    </BroadcastContext.Provider>
  )
}

export function useBroadcast() {
  const ctx = useContext(BroadcastContext)
  if (!ctx) throw new Error('useBroadcast must be used within BroadcastProvider')
  return ctx
}
