import api from './axios'
import { env } from './env'
import { AudioEngine } from './audioEngine'

export type BroadcastStep = 'mic' | 'encoder' | 'relay' | 'mount'
export type StepStatus = 'pending' | 'active' | 'done' | 'error'
export type BroadcastState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error'

export interface BroadcastStepInfo {
  id: BroadcastStep
  label: string
  status: StepStatus
  errorMessage?: string
}

interface BroadcastCallbacks {
  onStepChange: (steps: BroadcastStepInfo[]) => void
  onStateChange: (state: BroadcastState) => void
  onError: (message: string) => void
}

const WS_CLOSE_REASONS: Record<number, string> = {
  4001: 'Authentication timed out',
  4003: 'Authentication failed — invalid token',
  4004: 'Could not connect to Icecast server',
  4005: 'Icecast connection lost during broadcast',
}

/**
 * Manages the full broadcast lifecycle: connect -> authenticate -> stream -> stop.
 *
 * On {@link start}, acquires the microphone, initialises the audio engine (MP3 encoder),
 * obtains a one-time stream token from the API, opens a WebSocket to the relay,
 * authenticates, and begins streaming encoded audio chunks. {@link stop} tears
 * everything down and ends the server-side session.
 */
export class BroadcastManager {
  private stationId: string
  private callbacks: BroadcastCallbacks
  private micStream: MediaStream | null = null
  private ws: WebSocket | null = null
  private sessionId: string | null = null
  private authenticated = false
  private engine: AudioEngine | null = null
  private wakeLock: WakeLockSentinel | null = null
  private steps: BroadcastStepInfo[] = []
  private reconnecting = false
  private visibilityHandler: (() => void) | null = null

  private static buildSteps(skipMic?: boolean): BroadcastStepInfo[] {
    const steps: BroadcastStepInfo[] = []
    if (!skipMic) {
      steps.push({ id: 'mic', label: 'Requesting microphone access', status: 'pending' })
    }
    steps.push(
      { id: 'encoder', label: 'Setting up audio engine', status: 'pending' },
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

  /**
   * Begin broadcasting. Requests the microphone, sets up the MP3 encoder,
   * fetches a stream token, connects to the relay WebSocket, and transitions
   * state to 'live'. If any step fails, {@link fail} is called and the state
   * moves to 'error'.
   */
  async start(options?: { skipMic?: boolean }): Promise<void> {
    this.authenticated = false
    this.steps = BroadcastManager.buildSteps(options?.skipMic)
    this.callbacks.onStateChange('connecting')
    this.callbacks.onStepChange([...this.steps])

    try {
      // Step 1: Request microphone (skipped entirely in files-only mode)
      if (!options?.skipMic) {
        this.setActiveStep('mic')
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 44100,
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        })
        this.updateStep('mic', 'done')
      }

      // Step 2: Set up lamejs MP3 encoder + audio engine
      this.setActiveStep('encoder')
      this.engine = await AudioEngine.create(
        this.micStream,
        (data) => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(data)
          }
        },
      )
      // Push track metadata to the relay whenever engine state changes.
      this.engine.subscribe(() => {
        const track = this.engine?.getCurrentTrack()
        if (track && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'metadata', title: track.title, artist: track.artist }))
        }
      })
      await this.engine.restoreQueue()
      this.updateStep('encoder', 'done')

      // Step 3: Get stream token + start session
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

      this.acquireWakeLock()
      this.callbacks.onStateChange('live')
    } catch (err) {
      await this.fail(err)
    }
  }

  /**
   * Open a WebSocket to the relay server, send the auth message, and wait
   * for an 'authenticated' reply. Rejects if the connection fails, closes
   * unexpectedly, or the 25-second timeout elapses.
   */
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

  /**
   * Schedule a reconnect attempt. If the page is visible, reconnect immediately.
   * Otherwise, wait for a visibilitychange event to reconnect.
   */
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

  /**
   * Attempt to reconnect the WebSocket with a new stream token.
   * The audio engine and mic stream are preserved.
   */
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

  updateMetadata(title: string, artist: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'metadata', title, artist }))
    }
  }

  getEngine(): AudioEngine | null {
    return this.engine
  }

  getMicStream(): MediaStream | null {
    return this.micStream
  }

  getSessionId(): string | null {
    return this.sessionId
  }

  /**
   * Tear down the broadcast: destroy the audio engine, stop mic tracks,
   * close the WebSocket, and end the server-side session. Resets all
   * internal state back to idle.
   */
  async stop(): Promise<void> {
    this.removeVisibilityHandler()
    this.reconnecting = false
    await this.engine?.destroy()
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.ws?.close()

    if (this.sessionId) {
      try {
        await api.delete(`/stations/${this.stationId}/sessions/${this.sessionId}`)
      } catch { /* best-effort */ }
    }

    this.micStream = null
    this.ws = null
    this.engine = null
    this.sessionId = null
    this.authenticated = false
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

  /**
   * Handle a broadcast failure. Marks the currently active step as errored,
   * notifies callbacks, releases resources, and transitions state to 'error'.
   */
  private async fail(err: unknown) {
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
    await this.engine?.destroy()
    this.ws?.close()
  }
}
