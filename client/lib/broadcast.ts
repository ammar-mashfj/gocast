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

const DEVICE_ID_KEY = 'broadcast:deviceId'
const ALREADY_LIVE_MESSAGE = 'This station is already live from another device.'
const NON_RECONNECTABLE_CLOSE_CODES = new Set([4008])

const WS_CLOSE_REASONS: Record<number, string> = {
  4001: 'Authentication timed out',
  4003: 'Authentication failed',
  4004: 'Could not connect to Icecast server',
  4005: 'Icecast connection lost during broadcast',
  4007: ALREADY_LIVE_MESSAGE,
  4008: 'Broadcast session ended',
  4009: 'Could not synchronize broadcast state. Please try again.',
}

function getBroadcastDeviceId(): string {
  if (typeof localStorage === 'undefined') return 'unknown-device'

  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing

    const id = globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(DEVICE_ID_KEY, id)
    return id
  } catch {
    return `volatile-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

function getBroadcastErrorMessage(err: unknown): string | null {
  if (
    typeof err === 'object' &&
    err !== null &&
    'response' in err &&
    typeof (err as { response?: { status?: number; data?: { code?: string; message?: string } } }).response === 'object'
  ) {
    const response = (err as { response?: { status?: number; data?: { code?: string; message?: string } } }).response
    if (response?.status === 409 && response.data?.code === 'station_already_live') {
      return response.data.message || ALREADY_LIVE_MESSAGE
    }
  }

  return null
}

/**
 * Manages the full broadcast lifecycle: connect -> authenticate -> stream -> stop.
 *
 * On {@link start}, acquires the microphone, initialises the audio engine (MP3 encoder),
 * opens a WebSocket to the relay, authenticates via Laravel through the relay,
 * and begins streaming encoded audio chunks. {@link stop} tears everything down.
 */
export class BroadcastManager {
  private stationId: string
  private deviceId: string
  private callbacks: BroadcastCallbacks
  private micStream: MediaStream | null = null
  private ws: WebSocket | null = null
  private sessionId: string | null = null
  private authenticated = false
  private engine: AudioEngine | null = null
  private wakeLock: WakeLockSentinel | null = null
  private steps: BroadcastStepInfo[] = []
  private reconnecting = false
  private stopping = false
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
    this.deviceId = getBroadcastDeviceId()
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
   * connects to the relay WebSocket, and transitions state to 'live'. If any
   * step fails, {@link fail} is called and the state
   * moves to 'error'.
   */
  async start(options?: { skipMic?: boolean }): Promise<void> {
    this.authenticated = false
    this.stopping = false
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

      // Step 3: Ask the relay to authorize and start the session via Laravel.
      this.setActiveStep('relay')

      await this.connectAndAuthenticate()

      // Relay is open and authenticated — safe to resume playback now.
      // Starting earlier would encode audio that gets dropped because the
      // WebSocket isn't OPEN yet, clipping the first seconds of the stream.
      await this.engine.resumePlayback()

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
  private connectAndAuthenticate(): Promise<void> {
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
          deviceId: this.deviceId,
          sourceType: 'browser',
        }))
      }

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)
          if (msg.type === 'error' && !settled) {
            settled = true
            cleanup()
            reject(new Error(msg.message || ALREADY_LIVE_MESSAGE))
            return
          }
          if (msg.type === 'authenticated' && !settled) {
            settled = true
            cleanup()
            this.authenticated = true
            this.sessionId = typeof msg.sessionId === 'string' ? msg.sessionId : null
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
        const reason = WS_CLOSE_REASONS[event.code]
          || (event.code >= 4000 ? `Relay error (${event.code})` : 'Connection to relay lost')

        if (!settled) {
          settled = true
          cleanup()
          reject(new Error(reason))
        } else if (this.authenticated && !this.stopping) {
          this.authenticated = false

          if (NON_RECONNECTABLE_CLOSE_CODES.has(event.code)) {
            void this.fail(new Error(reason))
            return
          }

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
    if (this.reconnecting || this.stopping) return
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
   * Attempt to reconnect the WebSocket. The relay re-authorizes the same
   * device through Laravel; the audio engine and mic stream are preserved.
   */
  private async attemptReconnect() {
    try {
      if (this.stopping) { this.reconnecting = false; return }
      await this.connectAndAuthenticate()
      this.reconnecting = false
      if (this.stopping) return
      this.callbacks.onError('')
      this.callbacks.onStateChange('live')
    } catch (err) {
      this.reconnecting = false
      if (this.stopping) return
      const message = getBroadcastErrorMessage(err)
        ?? (err instanceof Error ? err.message : 'Connection to relay lost')
      this.callbacks.onError(message)
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
    this.stopping = true
    this.authenticated = false
    this.removeVisibilityHandler()
    this.reconnecting = false
    await this.engine?.destroy()
    this.micStream?.getTracks().forEach((t) => t.stop())
    if (this.ws?.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify({ type: 'stop' })) } catch { /* socket is closing */ }
    }
    this.ws?.close(1000, 'Stopped by broadcaster')

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
    } else if (getBroadcastErrorMessage(err)) {
      message = getBroadcastErrorMessage(err)!
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
    try { await this.engine?.destroy() } catch { /* already torn down */ }
    try { this.ws?.close() } catch { /* already closed */ }

    // Clear refs so a subsequent stop() (triggered by Try again → start →
    // stop on the failed manager) doesn't double-destroy and throw.
    this.micStream = null
    this.engine = null
    this.ws = null
    this.sessionId = null
    this.authenticated = false
  }
}
