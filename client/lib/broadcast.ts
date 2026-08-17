import { AudioEngine } from './audioEngine'
import api from './axios'

export type BroadcastStep = 'station' | 'mic' | 'engine' | 'stream'
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

// How long to wait for the WebSocket to open. One TCP connection over the
// same host that served this page — if it hasn't opened in 10s it isn't going
// to, and the station container is more likely still booting than the network
// being slow.
const SOCKET_CONNECT_TIMEOUT_MS = 10000
// The webcast protocol has no ack for the hello frame: harbor either keeps the
// connection or drops it. Hold this long after sending hello before declaring
// the broadcast live, so a rejected credential surfaces as an error instead of
// a "live" indicator over a socket the server already closed.
const HELLO_GRACE_MS = 600
// A cold container needs roughly 3–5s to build its audio graph and connect to
// Icecast. Wait up to 20s before publishing anyway — see ensureStationOnAir.
const STATION_READY_TIMEOUT_MS = 20000
const STATION_READY_POLL_MS = 1000

/**
 * Manages the full broadcast lifecycle: mic → audio engine → webcast socket.
 *
 * On {@link start}, acquires the microphone, builds the AudioContext mixer
 * (which encodes to MP3 off the main thread), opens a webcast WebSocket to
 * the station's Liquidsoap harbor input, and transitions to 'live'.
 * {@link stop} flushes the encoder and closes the socket, which harbor sees
 * as the source disconnecting.
 *
 * Auth: we mint a short-lived station-scoped broadcaster token via
 * POST /api/auth/broadcast-token and send it as the password in the webcast
 * hello frame. Harbor's auth callback posts it to Laravel, which verifies the
 * token's MAC + expiry + station binding. The Sanctum auth token never leaves
 * Laravel — only the scoped, short-lived one does.
 */
export class BroadcastManager {
  private stationSlug: string
  private callbacks: BroadcastCallbacks
  private micStream: MediaStream | null = null
  private engine: AudioEngine | null = null
  private ws: WebSocket | null = null
  private wakeLock: WakeLockSentinel | null = null
  private steps: BroadcastStepInfo[] = []
  private stopping = false
  private helloTimer: ReturnType<typeof setTimeout> | null = null
  // True once the server has accepted the hello frame and kept the connection.
  // Until then openSocket() owns failure reporting; after it, a close is a real
  // mid-broadcast drop.
  private established = false

  private static buildSteps(skipMic?: boolean): BroadcastStepInfo[] {
    const steps: BroadcastStepInfo[] = [
      { id: 'station', label: 'Bringing your station on air', status: 'pending' },
    ]
    if (!skipMic) {
      steps.push({ id: 'mic', label: 'Requesting microphone access', status: 'pending' })
    }
    steps.push(
      { id: 'engine', label: 'Setting up audio engine', status: 'pending' },
      { id: 'stream', label: 'Connecting to stream server', status: 'pending' },
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
   * Begin broadcasting. Mic → engine → webcast. On any failure, calls {@link fail}.
   */
  async start(options?: { skipMic?: boolean }): Promise<void> {
    this.stopping = false
    this.established = false
    this.steps = BroadcastManager.buildSteps(options?.skipMic)
    this.callbacks.onStateChange('connecting')
    this.callbacks.onStepChange([...this.steps])

    try {
      // Step 0: Make sure the station is on air and its Liquidsoap container
      // is actually ready to consume our stream.
      this.setActiveStep('station')
      await this.ensureStationOnAir()
      this.updateStep('station', 'done')

      // Step 1: Microphone (skipped in music-only mode).
      if (!options?.skipMic) {
        this.setActiveStep('mic')
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            // All three OFF deliberately. They are tuned for speech on a call:
            // autoGainControl rides the level of anything it hears, and
            // noiseSuppression treats sustained tones as noise — between them
            // they audibly chew music. A radio broadcaster's mic sits in the
            // same mixer as the queue, so this must stay clean.
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2,
          },
        })
        this.updateStep('mic', 'done')
      }

      // Step 2: Audio engine — mic + queue mixer, encoding MP3 off-thread.
      // Encoded frames go straight out over the socket as binary webcast
      // frames; before the socket exists they are simply dropped.
      this.setActiveStep('engine')
      this.engine = await AudioEngine.create(this.micStream, (chunk) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(chunk)
        }
      })
      // The context starts suspended under the autoplay policy, and a
      // suspended context produces no frames for the worklet to capture.
      // Resume now — we are inside the user gesture that triggered start().
      await this.engine.resume()
      // Keep harbor's metadata in step with whatever the queue is playing.
      this.engine.subscribe(() => {
        const track = this.engine?.getCurrentTrack()
        if (track) this.sendMetadata(track.title, track.artist)
      })
      await this.engine.restoreQueue()
      this.updateStep('engine', 'done')

      // Step 3: webcast handshake.
      this.setActiveStep('stream')
      await this.connectWebcast()
      this.updateStep('stream', 'done')

      // Socket is up and accepted — safe to resume saved playback. Starting
      // earlier would encode audio that gets dropped for want of a socket,
      // clipping the first seconds of the broadcast.
      await this.engine.resumePlayback()

      this.acquireWakeLock()
      this.callbacks.onStateChange('live')
    } catch (err) {
      await this.fail(err)
    }
  }

  /**
   * Start the station if it is off air, then wait until its container
   * reports that audio is actually flowing.
   *
   * Stations are no longer running by default: creating one is configuration,
   * and a container only exists between start and stop. Publishing into a
   * station that has not been started — or one whose container is still
   * building its audio graph — means MediaMTX accepts our stream and nobody
   * hears it, because the RTSP consumer isn't there yet.
   *
   * The API's start is idempotent, so calling it on an already-running
   * station costs one round-trip and does not restart anything (a restart
   * would drop existing listeners).
   */
  private async ensureStationOnAir(): Promise<void> {
    try {
      await api.post(`/stations/${this.stationSlug}/start`)
    } catch (err) {
      const response = (err as { response?: { status?: number; data?: { message?: string } } })?.response
      // Plan limits and ownership are the two refusals worth repeating
      // verbatim — the API writes them for humans.
      if (response?.status === 422 || response?.status === 403) {
        throw new Error(response.data?.message ?? 'This station cannot go on air right now')
      }
      throw new Error('Could not bring the station on air — please try again')
    }

    const deadline = Date.now() + STATION_READY_TIMEOUT_MS
    while (Date.now() < deadline) {
      try {
        const { data } = await api.get<{ data: { ready: boolean } }>(
          `/stations/${this.stationSlug}/status`,
        )
        if (data.data.ready) return
      } catch {
        // Status is a live read from the container; a blip here is not a
        // reason to abandon the broadcast.
      }
      await new Promise((resolve) => setTimeout(resolve, STATION_READY_POLL_MS))
    }

    // Timed out. Publish anyway rather than refusing to broadcast: Liquidsoap
    // retries its RTSP pull every couple of seconds, so a container that
    // finishes booting late still picks the stream up — the broadcaster may
    // just lose the first few seconds.
  }

  /**
   * Open the webcast WebSocket to this station's Liquidsoap harbor input and
   * complete the handshake.
   *
   * The protocol is Liquidsoap's own — `input.harbor` speaks it natively
   * alongside the Icecast source protocol. Connect with the "webcast"
   * subprotocol, send a JSON `hello` frame declaring the mime type and encoder
   * settings, then stream binary MP3 frames. Metadata rides along as JSON
   * `metadata` frames whenever the current track changes.
   *
   * There is no ICE, no NAT traversal and no UDP here: it is one TCP
   * connection, so any network that can load this page can also carry the
   * broadcast. That is the entire reason for choosing it over WHIP.
   */
  private async connectWebcast(): Promise<void> {
    if (!this.engine) throw new Error('Audio engine not initialized')

    // Mint the scoped broadcaster token and learn where to publish. Doing this
    // first means a 401/403 fails immediately, before any socket work.
    let token: string
    let ingestUrl: string
    try {
      // Token is scoped to this station with a short TTL. The endpoint 403s if
      // the caller doesn't own the station; surfaced distinctly so the studio
      // can show the right message.
      const resp = await api.post<{ token: string; ingest_url: string }>(
        '/auth/broadcast-token',
        { station_slug: this.stationSlug },
      )
      token = resp.data.token
      ingestUrl = resp.data.ingest_url
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 403) {
        throw new Error('You do not own this station')
      }
      throw new Error('Not signed in — please sign in and try again')
    }

    if (!ingestUrl) {
      throw new Error('The server did not return a publish address for this station')
    }

    await this.openSocket(ingestUrl, token)
  }

  /**
   * Connect, send the hello frame, and confirm the server kept the connection.
   *
   * The webcast protocol has no acknowledgement frame — harbor either accepts
   * the hello or closes the socket. So "connected" means: the socket opened,
   * the hello went out, and the server did not hang up. We hold briefly after
   * the hello to catch a rejection, because resolving the instant the socket
   * opens would repeat the WHIP mistake of reporting success before the
   * server had agreed to anything.
   */
  private openSocket(url: string, token: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let ws: WebSocket
      try {
        ws = new WebSocket(url, 'webcast')
      } catch {
        return reject(new Error('Could not reach the stream server'))
      }

      ws.binaryType = 'arraybuffer'
      this.ws = ws

      let settled = false
      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(connectTimer)
        clearTimeout(this.helloTimer ?? undefined)
        this.helloTimer = null
        fn()
      }

      const connectTimer = setTimeout(() => {
        finish(() => {
          try { ws.close() } catch { /* already closing */ }
          reject(new Error('Timed out connecting to the stream server'))
        })
      }, SOCKET_CONNECT_TIMEOUT_MS)

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'hello',
          data: {
            mime: 'audio/mpeg',
            // Harbor's auth callback resolves the station from the user field
            // and validates the short-lived token as the password, reusing the
            // same credential the WHIP path used.
            user: this.stationSlug,
            password: token,
            audio: AudioEngine.encoderInfo(),
          },
        }))

        // Survive the grace window and we are genuinely publishing.
        this.helloTimer = setTimeout(() => {
          finish(() => {
            this.established = true
            resolve()
          })
        }, HELLO_GRACE_MS)
      }

      ws.onerror = () => {
        finish(() => reject(new Error('Could not reach the stream server')))
      }

      ws.onclose = (event) => {
        // Closed inside the grace window: harbor rejected us. The usual cause
        // is a rejected token, but a station whose container is still booting
        // has no harbor listening yet either.
        finish(() => reject(new Error(
          event.code === 1008 || event.code === 4001
            ? 'The stream server rejected this broadcast — try again'
            : 'The stream server closed the connection before the broadcast started',
        )))

        // Closed after we went live: a real mid-broadcast drop.
        if (this.established && !this.stopping) {
          this.established = false
          this.callbacks.onStateChange('error')
          this.callbacks.onError('Connection to stream server lost')
        }
      }
    })
  }

  /** Push the current track's title/artist to harbor as a metadata frame. */
  private sendMetadata(title: string, artist: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ type: 'metadata', data: { title, artist } }))
  }

  getEngine(): AudioEngine | null {
    return this.engine
  }

  getMicStream(): MediaStream | null {
    return this.micStream
  }

  getSessionId(): string | null {
    // No app-side session id under webcast — Laravel opens the StreamSession
    // from harbor's connect callback. The studio doesn't need it client-side.
    return null
  }

  /**
   * Tear down everything. Harbor sees the socket close as its source
   * disconnecting and notifies Laravel, which ends the session.
   */
  async stop(): Promise<void> {
    this.stopping = true
    if (this.helloTimer) {
      clearTimeout(this.helloTimer)
      this.helloTimer = null
    }
    this.established = false

    // Flush lamejs before closing: the final partial MP3 frame is still inside
    // the encoder, and dropping it truncates the last fraction of a second.
    if (this.ws?.readyState === WebSocket.OPEN) {
      try { await this.engine?.flushEncoder() } catch { /* worker already gone */ }
    }

    try { this.ws?.close(1000, 'broadcast ended') } catch { /* already closing */ }
    this.ws = null
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
    try { this.ws?.close() } catch { /* already closed */ }

    this.micStream = null
    this.engine = null
    this.ws = null
  }
}
