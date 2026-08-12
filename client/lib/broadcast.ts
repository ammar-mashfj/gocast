import { env } from './env'
import { AudioEngine } from './audioEngine'
import api from './axios'

export type BroadcastStep = 'mic' | 'engine' | 'whip'
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

const DEFAULT_BITRATE_KBPS = 64
// ICE gathering safety timeout. Mobile broadcasters on 4G commonly need 3–5s
// to gather their full candidate set; 2s was clipping them.
const ICE_GATHER_TIMEOUT_MS = 5000

/**
 * Manages the full broadcast lifecycle: mic → audio engine → WHIP.
 *
 * On {@link start}, acquires the microphone, builds the AudioContext mixer,
 * negotiates a WebRTC connection to MediaMTX over WHIP (HTTP one-shot
 * SDP exchange), and transitions state to 'live'. {@link stop} closes the
 * peer connection (which fires MediaMTX's runOnNotReady webhook → Laravel
 * marks the station offline).
 *
 * Auth: we mint a short-lived station-scoped broadcaster token via
 * POST /api/auth/broadcast-token and append it to the WHIP URL as ?token=...
 * MediaMTX's auth webhook posts that to /api/internal/whip-auth, which
 * verifies the token's MAC + expiry + station binding. The Sanctum auth
 * token never leaves Laravel — only the scoped, 60-second token does.
 */
export class BroadcastManager {
  private stationSlug: string
  private callbacks: BroadcastCallbacks
  private micStream: MediaStream | null = null
  private engine: AudioEngine | null = null
  private pc: RTCPeerConnection | null = null
  private resourceUrl: string | null = null
  private wakeLock: WakeLockSentinel | null = null
  private steps: BroadcastStepInfo[] = []
  private stopping = false
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null
  private iceGatherTimer: ReturnType<typeof setTimeout> | null = null

  private static buildSteps(skipMic?: boolean): BroadcastStepInfo[] {
    const steps: BroadcastStepInfo[] = []
    if (!skipMic) {
      steps.push({ id: 'mic', label: 'Requesting microphone access', status: 'pending' })
    }
    steps.push(
      { id: 'engine', label: 'Setting up audio engine', status: 'pending' },
      { id: 'whip', label: 'Connecting to stream server', status: 'pending' },
    )
    return steps
  }

  constructor(stationSlug: string, callbacks: BroadcastCallbacks) {
    this.stationSlug = stationSlug
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
   * Begin broadcasting. Mic → engine → WHIP. On any failure, calls {@link fail}.
   */
  async start(options?: { skipMic?: boolean }): Promise<void> {
    this.stopping = false
    this.steps = BroadcastManager.buildSteps(options?.skipMic)
    this.callbacks.onStateChange('connecting')
    this.callbacks.onStepChange([...this.steps])

    try {
      // Step 1: Microphone (skipped in music-only mode).
      if (!options?.skipMic) {
        this.setActiveStep('mic')
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            // Defaults are tuned for voice. Studio-music broadcasters can
            // disable these via a preference later — for now, voice-friendly
            // is the right default since the queue files come through the
            // mixer untouched.
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 2,
          },
        })
        this.updateStep('mic', 'done')
      }

      // Step 2: Audio engine — wraps mic + queue mixer, exposes a MediaStream.
      this.setActiveStep('engine')
      this.engine = await AudioEngine.create(this.micStream)
      // The context starts suspended under the autoplay policy. WebRTC only
      // pulls frames from the MediaStream destination while the context is
      // running, so a suspended context = the broadcaster sends a stream of
      // discontiguous/empty Opus frames. Resume now (we're inside the user
      // gesture that triggered start()) so audio flows from the moment the
      // peer connection is up — even before any track plays or PTT is held.
      await this.engine.resume()
      await this.engine.restoreQueue()
      this.updateStep('engine', 'done')

      // Step 3: WHIP handshake.
      this.setActiveStep('whip')
      await this.connectWhip()
      this.updateStep('whip', 'done')

      // Connection is up — safe to resume saved playback. Earlier playback
      // would push audio to the destination before the peer connection was
      // pulling, clipping the first seconds.
      await this.engine.resumePlayback()

      this.acquireWakeLock()
      this.callbacks.onStateChange('live')
    } catch (err) {
      await this.fail(err)
    }
  }

  /**
   * Negotiate a WebRTC connection to MediaMTX via WHIP. Single HTTP POST:
   * we send our SDP offer, MediaMTX returns its SDP answer, we apply it,
   * ICE flows over the established channel.
   */
  private async connectWhip(): Promise<void> {
    if (!this.engine) throw new Error('Audio engine not initialized')

    // Mint the scoped broadcaster token BEFORE any expensive WebRTC work
    // (createOffer / ICE gathering). A 401/403 here fails fast instead of
    // surfacing after 5s of useless ICE candidates.
    let token: string
    try {
      // Token is scoped to this station + ~60s TTL. The endpoint 403s if
      // the caller doesn't own the station; we surface that distinctly so
      // the studio UI can show the right message.
      const tokenResp = await api.post<{ token: string }>(
        '/auth/broadcast-token',
        { station_slug: this.stationSlug },
      )
      token = tokenResp.data.token
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 403) {
        throw new Error('You do not own this station')
      }
      throw new Error('Not signed in — please sign in and try again')
    }

    const stream = this.engine.getOutputStream()
    const audioTrack = stream.getAudioTracks()[0]
    if (!audioTrack) throw new Error('No audio track on output stream')

    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })

    // If the connection drops mid-broadcast (network blip, server restart),
    // surface it as an error — auto-reconnect is intentionally deferred.
    // The user can hit "Try again" from the dashboard.
    // 'disconnected' is transient: ICE may recover within seconds. We
    // give it an 8s grace window before treating it as terminal.
    this.pc.onconnectionstatechange = () => {
      if (this.stopping) return
      const s = this.pc?.connectionState
      if (s === 'failed' || s === 'closed') {
        if (this.disconnectTimer) {
          clearTimeout(this.disconnectTimer)
          this.disconnectTimer = null
        }
        this.callbacks.onStateChange('error')
        this.callbacks.onError('Connection to stream server lost')
        return
      }
      if (s === 'disconnected') {
        this.callbacks.onStateChange('reconnecting')
        if (this.disconnectTimer) clearTimeout(this.disconnectTimer)
        this.disconnectTimer = setTimeout(() => {
          this.disconnectTimer = null
          if (this.stopping) return
          // Still not recovered — treat as terminal.
          if (this.pc?.connectionState !== 'connected') {
            this.callbacks.onStateChange('error')
            this.callbacks.onError('Connection to stream server lost')
          }
        }, 8000)
        return
      }
      if (s === 'connected') {
        if (this.disconnectTimer) {
          clearTimeout(this.disconnectTimer)
          this.disconnectTimer = null
          this.callbacks.onStateChange('live')
        }
      }
    }

    const transceiver = this.pc.addTransceiver(audioTrack, {
      direction: 'sendonly',
      streams: [stream],
    })

    // Prefer Opus explicitly — already preferred by default in modern browsers,
    // but defending against future codec-list reordering is cheap.
    if (transceiver.setCodecPreferences && typeof RTCRtpSender.getCapabilities === 'function') {
      const caps = RTCRtpSender.getCapabilities('audio')
      const opus = caps?.codecs.filter((c) => c.mimeType.toLowerCase() === 'audio/opus') ?? []
      if (opus.length) transceiver.setCodecPreferences(opus)
    }

    const offer = await this.pc.createOffer()
    // SDP munging: bump Opus to stereo + raise the maxaveragebitrate hint.
    // Browsers don't expose a clean API for this; the SDP rewrite is the
    // standard pattern (same approach lib-webrtc shims use internally).
    if (offer.sdp) {
      offer.sdp = offer.sdp.replace(/a=fmtp:(\d+) ([^\r\n]*)/g, (m, pt, params) => {
        if (!params.includes('maxaveragebitrate')) {
          return `a=fmtp:${pt} ${params};maxaveragebitrate=${DEFAULT_BITRATE_KBPS * 1000};stereo=1;sprop-stereo=1`
        }
        return m
      })
    }

    await this.pc.setLocalDescription(offer)

    // Wait for ICE gathering to complete (non-trickle WHIP).
    await new Promise<void>((resolve) => {
      if (this.pc?.iceGatheringState === 'complete') return resolve()
      const pc = this.pc
      const onChange = () => {
        if (pc?.iceGatheringState === 'complete') {
          if (this.iceGatherTimer) {
            clearTimeout(this.iceGatherTimer)
            this.iceGatherTimer = null
          }
          pc.removeEventListener('icegatheringstatechange', onChange)
          resolve()
        }
      }
      pc?.addEventListener('icegatheringstatechange', onChange)
      this.iceGatherTimer = setTimeout(() => {
        this.iceGatherTimer = null
        pc?.removeEventListener('icegatheringstatechange', onChange)
        resolve()
      }, ICE_GATHER_TIMEOUT_MS)
    })

    const sdp = this.pc.localDescription?.sdp
    if (!sdp) throw new Error('Failed to gather local SDP')

    const endpoint = `${env.whipUrl}/${this.stationSlug}/live/whip?token=${encodeURIComponent(token)}`

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: sdp,
    })

    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('Not authorized to broadcast on this station')
      }
      if (resp.status === 409 || /already|conflict/i.test(body)) {
        throw new Error('This station is already live from another device.')
      }
      throw new Error(`Stream server error (${resp.status})${body ? `: ${body.slice(0, 120)}` : ''}`)
    }

    // MediaMTX returns the WHIP resource URL in Location — DELETE it on stop
    // to cleanly release the path. Relative → absolute resolution.
    const location = resp.headers.get('Location')
    if (location) {
      this.resourceUrl = /^https?:/.test(location) ? location : new URL(location, endpoint).toString()
    }

    const answerSdp = await resp.text()
    await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
  }

  getEngine(): AudioEngine | null {
    return this.engine
  }

  getMicStream(): MediaStream | null {
    return this.micStream
  }

  getSessionId(): string | null {
    // No app-side session id under WHIP — Laravel creates the StreamSession
    // when MediaMTX fires runOnReady. The studio doesn't need it client-side.
    return null
  }

  /**
   * Tear down everything. MediaMTX will fire runOnNotReady once it sees the
   * peer connection close, and Laravel will mark the station offline.
   */
  async stop(): Promise<void> {
    this.stopping = true
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer)
      this.disconnectTimer = null
    }
    if (this.iceGatherTimer) {
      clearTimeout(this.iceGatherTimer)
      this.iceGatherTimer = null
    }
    if (this.resourceUrl) {
      // Best-effort DELETE to the WHIP resource — releases the path
      // immediately rather than waiting for the ICE timeout. `keepalive`
      // + a 2s abort cap ensure the request still flies on tab close
      // without hanging the unload handler.
      try {
        await fetch(this.resourceUrl, {
          method: 'DELETE',
          keepalive: true,
          signal: AbortSignal.timeout(2000),
        })
      } catch { /* network gone, that's fine */ }
      this.resourceUrl = null
    }
    try { this.pc?.close() } catch { /* already closed */ }
    this.pc = null
    await this.engine?.destroy()
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.micStream = null
    this.engine = null
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
    try { await this.engine?.destroy() } catch { /* already torn down */ }
    try { this.pc?.close() } catch { /* already closed */ }

    this.micStream = null
    this.engine = null
    this.pc = null
    this.resourceUrl = null
  }
}
