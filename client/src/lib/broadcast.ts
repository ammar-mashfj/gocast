import api from './axios'
import { AudioEngine } from './audioEngine'

export type BroadcastStep = 'mic' | 'encoder' | 'relay' | 'mount'
export type StepStatus = 'pending' | 'active' | 'done' | 'error'
export type BroadcastState = 'idle' | 'connecting' | 'live' | 'error'

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

export class BroadcastManager {
  private stationId: string
  private callbacks: BroadcastCallbacks
  private micStream: MediaStream | null = null
  private ws: WebSocket | null = null
  private sessionId: string | null = null
  private authenticated = false
  private engine: AudioEngine | null = null
  private releaseLock: (() => void) | null = null
  private steps: BroadcastStepInfo[] = [
    { id: 'mic', label: 'Requesting microphone access', status: 'pending' },
    { id: 'encoder', label: 'Setting up audio engine', status: 'pending' },
    { id: 'relay', label: 'Connecting to stream relay', status: 'pending' },
    { id: 'mount', label: 'Activating mount point', status: 'pending' },
  ]

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
    this.steps = this.steps.map((s) => ({ ...s, status: 'pending' as StepStatus, errorMessage: undefined }))
    this.callbacks.onStateChange('connecting')
    this.callbacks.onStepChange([...this.steps])

    try {
      // Step 1: Request microphone (or skip if unavailable)
      if (options?.skipMic) {
        this.updateStep('mic', 'done')
      } else {
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
          // Send MP3 binary directly over WS
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(data)
          }
        },
        () => {
          // Auto-send track metadata to Icecast when track changes
          const track = this.engine?.getCurrentTrack()
          if (track && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'metadata', title: track.title, artist: track.artist }))
          }
        },
      )
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
      this.fail(err)
    }
  }

  private connectAndAuthenticate(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = import.meta.env.VITE_WS_URL
      this.ws = new WebSocket(wsUrl)
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
          this.updateStep('mount', 'error', 'Connection to relay lost')
          this.callbacks.onError('Connection to relay lost')
          this.callbacks.onStateChange('error')
        }
      }
    })
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

  async stop(): Promise<void> {
    this.engine?.destroy()
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

  private acquireWakeLock() {
    if (!navigator.locks) return
    navigator.locks.request('gocast-broadcast', () => {
      return new Promise<void>((resolve) => {
        this.releaseLock = resolve
      })
    })
  }

  private releaseWakeLock() {
    if (this.releaseLock) {
      this.releaseLock()
      this.releaseLock = null
    }
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
    this.engine?.destroy()
    this.ws?.close()
  }
}
