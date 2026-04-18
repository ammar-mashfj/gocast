import api from './axios'
import { env } from './env'

export type BroadcastStep = 'mic' | 'relay' | 'mount'
export type StepStatus = 'pending' | 'active' | 'done' | 'error'
export type BroadcastState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error'

export interface BroadcastStepInfo {
  id: BroadcastStep
  label: string
  status: StepStatus
  errorMessage?: string
}

export interface StudioTrack {
  id: string
  title: string
  artist: string
  duration: number
}

export interface StudioState {
  playing: boolean
  currentTrackId: string | null
  currentIndex: number
  elapsed: number
  duration: number
  repeat: boolean
  queue: StudioTrack[]
}

interface BroadcastCallbacks {
  onStepChange: (steps: BroadcastStepInfo[]) => void
  onStateChange: (state: BroadcastState) => void
  onError: (message: string) => void
  onStudioState: (state: StudioState) => void
}

const WS_CLOSE_REASONS: Record<number, string> = {
  4001: 'Authentication timed out',
  4003: 'Authentication failed — invalid token',
  4004: 'Could not connect to Icecast server',
  4005: 'Icecast connection lost during broadcast',
}

/**
 * Manages the broadcast lifecycle: connect → authenticate → control.
 *
 * v2: The browser is a lightweight remote control. All audio encoding
 * and playback happens server-side. This manager handles:
 * - WebSocket connection to the relay
 * - Authentication with one-time stream token
 * - Sending playback commands (play, pause, next, prev, etc.)
 * - Receiving studio state updates from the relay
 * - Optional mic capture for PTT
 */
export class BroadcastManager {
  private stationId: string
  private callbacks: BroadcastCallbacks
  private ws: WebSocket | null = null
  private sessionId: string | null = null
  private authenticated = false
  private micStream: MediaStream | null = null
  private wakeLock: WakeLockSentinel | null = null
  private steps: BroadcastStepInfo[] = []
  private reconnecting = false
  private visibilityHandler: (() => void) | null = null
  private elapsedInterval: ReturnType<typeof setInterval> | null = null
  private lastStudioState: StudioState | null = null
  private lastStateTimestamp = 0

  private static buildSteps(skipMic?: boolean): BroadcastStepInfo[] {
    const steps: BroadcastStepInfo[] = []
    if (!skipMic) {
      steps.push({ id: 'mic', label: 'Requesting microphone access', status: 'pending' })
    }
    steps.push(
      { id: 'relay', label: 'Connecting to stream relay', status: 'pending' },
      { id: 'mount', label: 'Activating mount point', status: 'pending' },
    )
    return steps
  }

  constructor(stationId: string, callbacks: BroadcastCallbacks) {
    this.stationId = stationId
    this.callbacks = callbacks
  }

  private updateStep(id: BroadcastStep, status: StepStatus, errorMessage?: string) {
    this.steps = this.steps.map((s) =>
      s.id === id ? { ...s, status, errorMessage } : s,
    )
    this.callbacks.onStepChange([...this.steps])
  }

  private setActiveStep(id: BroadcastStep) {
    this.steps = this.steps.map((s) =>
      s.id === id ? { ...s, status: 'active' as StepStatus } : s,
    )
    this.callbacks.onStepChange([...this.steps])
  }

  async start(options?: { skipMic?: boolean }): Promise<void> {
    this.authenticated = false
    this.steps = BroadcastManager.buildSteps(options?.skipMic)
    this.callbacks.onStateChange('connecting')
    this.callbacks.onStepChange([...this.steps])

    try {
      // Step 1: Request microphone (skipped in files-only mode)
      if (!options?.skipMic) {
        this.setActiveStep('mic')
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 48000,
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        })
        this.updateStep('mic', 'done')
      }

      // Step 2: Get stream token + start session
      this.setActiveStep('relay')

      const listing = await api.get(`/stations/${this.stationId}/sessions`)
      const staleSessions = (listing.data.data as { id: string; ended_at: string | null }[])
        ?.filter((s) => !s.ended_at) ?? []
      for (const stale of staleSessions) {
        await api.delete(`/stations/${this.stationId}/sessions/${stale.id}`)
      }

      const [tokenRes, sessionRes] = await Promise.all([
        api.post(`/stations/${this.stationId}/stream-token`),
        api.post(`/stations/${this.stationId}/sessions`, { source_type: 'browser' }),
      ])
      const streamToken = tokenRes.data.data.token as string
      this.sessionId = sessionRes.data.data.id as string

      await this.connectAndAuthenticate(streamToken)

      this.startElapsedInterpolation()
      this.acquireWakeLock()
      this.callbacks.onStateChange('live')
    } catch (err) {
      this.fail(err)
    }
  }

  private connectAndAuthenticate(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(env.wsUrl)
      this.ws.binaryType = 'arraybuffer'
      let settled = false

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true
          this.ws?.close()
          reject(new Error('Connection timed out — is the relay server running?'))
        }
      }, 25000)

      const cleanup = () => clearTimeout(timeout)

      this.ws.onopen = () => {
        this.updateStep('relay', 'done')
        this.setActiveStep('mount')
        this.ws!.send(JSON.stringify({
          type: 'auth',
          stationId: this.stationId,
          token,
        }))
      }

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)

          if (msg.type === 'authenticated' && !settled) {
            settled = true
            cleanup()
            this.authenticated = true
            this.updateStep('mount', 'done')
            resolve()
          }

          if (msg.type === 'state') {
            this.lastStudioState = {
              playing: msg.playing,
              currentTrackId: msg.currentTrackId,
              currentIndex: msg.currentIndex,
              elapsed: msg.elapsed,
              duration: msg.duration,
              repeat: msg.repeat,
              queue: msg.queue,
            }
            this.lastStateTimestamp = Date.now()
            this.callbacks.onStudioState(this.lastStudioState)
          }

          if (msg.type === 'error') {
            this.callbacks.onError(msg.message)
          }
        } catch { /* non-JSON */ }
      }

      this.ws.onerror = () => {
        if (!settled) {
          settled = true
          cleanup()
          reject(new Error('Cannot connect to stream relay — is it running?'))
        }
      }

      this.ws.onclose = (event) => {
        if (!settled) {
          settled = true
          cleanup()
          const reason = WS_CLOSE_REASONS[event.code]
            || (event.code >= 4000 ? `Relay error (${event.code})` : 'Connection to relay lost')
          reject(new Error(reason))
        } else if (this.authenticated) {
          this.authenticated = false
          this.scheduleReconnect()
        }
      }
    })
  }

  private scheduleReconnect() {
    if (this.reconnecting) return
    this.reconnecting = true
    this.callbacks.onStateChange('reconnecting' as BroadcastState)

    if (document.visibilityState === 'visible') {
      this.attemptReconnect()
    } else {
      this.visibilityHandler = () => {
        if (document.visibilityState === 'visible') {
          this.removeVisibilityHandler()
          this.attemptReconnect()
        }
      }
      document.addEventListener('visibilitychange', this.visibilityHandler)
    }
  }

  private removeVisibilityHandler() {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
      this.visibilityHandler = null
    }
  }

  private async attemptReconnect() {
    try {
      const tokenRes = await api.post(`/stations/${this.stationId}/stream-token`)
      const streamToken = tokenRes.data.data.token as string
      await this.connectAndAuthenticate(streamToken)
      this.reconnecting = false
      this.callbacks.onError('')
      this.callbacks.onStateChange('live')
    } catch {
      this.reconnecting = false
      this.callbacks.onError('Connection to relay lost')
      this.callbacks.onStateChange('error')
    }
  }

  // ── Commands (sent to relay) ──

  sendCommand(cmd: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(cmd))
    }
  }

  updateMetadata(title: string, artist: string) {
    this.sendCommand({ type: 'metadata', title, artist })
  }

  getMicStream(): MediaStream | null {
    return this.micStream
  }

  getSessionId(): string | null {
    return this.sessionId
  }

  // ── Elapsed interpolation ──

  /**
   * Locally interpolate elapsed time between server state updates (1Hz)
   * so the progress bar moves smoothly.
   */
  private startElapsedInterpolation() {
    this.elapsedInterval = setInterval(() => {
      if (!this.lastStudioState?.playing) return
      const delta = (Date.now() - this.lastStateTimestamp) / 1000
      const interpolated = {
        ...this.lastStudioState,
        elapsed: this.lastStudioState.elapsed + delta,
      }
      this.callbacks.onStudioState(interpolated)
    }, 250)
  }

  // ── Teardown ──

  async stop(): Promise<void> {
    this.removeVisibilityHandler()
    this.reconnecting = false
    this.authenticated = false

    if (this.elapsedInterval) {
      clearInterval(this.elapsedInterval)
      this.elapsedInterval = null
    }

    this.sendCommand({ type: 'stop_broadcast' })
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.ws?.close()

    if (this.sessionId) {
      try {
        await api.delete(`/stations/${this.stationId}/sessions/${this.sessionId}`)
      } catch { /* best-effort */ }
    }

    this.micStream = null
    this.ws = null
    this.sessionId = null
    this.lastStudioState = null
    this.releaseWakeLock()
    this.callbacks.onStateChange('idle')
  }

  private async acquireWakeLock() {
    if (!('wakeLock' in navigator)) return
    try {
      this.wakeLock = await navigator.wakeLock.request('screen')
    } catch { /* device may not support it */ }
  }

  private releaseWakeLock() {
    this.wakeLock?.release()
    this.wakeLock = null
  }

  private fail(err: unknown) {
    const activeStep = this.steps.find((s) => s.status === 'active')

    let message = 'Something went wrong'
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      message = 'Microphone access denied — check browser permissions'
    } else if (err instanceof DOMException && err.name === 'NotFoundError') {
      message = 'No microphone found — plug one in and try again'
    } else if (err instanceof Error) {
      message = err.message
    }

    if (activeStep) {
      this.updateStep(activeStep.id, 'error', message)
    }

    this.callbacks.onError(message)
    this.callbacks.onStateChange('error')
    this.releaseWakeLock()

    this.micStream?.getTracks().forEach((t) => t.stop())
    this.ws?.close()
  }
}
