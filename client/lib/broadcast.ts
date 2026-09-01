import { AudioEngine, assertBroadcastSupported } from './audioEngine'
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

/** Snapshot of the send path — see {@link BroadcastManager.getTransportStats}. */
export interface TransportStats {
  bytesSent: number
  chunksSent: number
  chunksDropped: number
  /**
   * Wall-clock milliseconds the encoder spent with nowhere to send, measured
   * only once the broadcast has actually been on air.
   *
   * Deliberately a duration, not a percentage. A percentage answers "what
   * share of this show went missing", which dilutes a real 30-second dropout
   * into a rounding error over a two-hour set. A broadcaster wants to know
   * how much audio the audience lost, and that is a number of seconds.
   */
  droppedMs: number
  /** Epoch ms of the most recent dropped frame, or 0 if none. */
  lastDropAt: number
  connected: boolean
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
 * How long to keep trying to get back on air after a mid-broadcast drop.
 *
 * This number is set by `input.harbor`'s own `timeout`, which defaults to 30s
 * on the image we run. When a broadcaster's connection dies WITHOUT a clean
 * close — a sleeping laptop, a wifi handover, a tunnel — harbor does not learn
 * the source is gone until that timeout elapses, and until it does the mount is
 * still taken and every reconnect is refused. A budget shorter than ~45s would
 * therefore give up at precisely the moment reconnecting starts working, which
 * is the worst possible behaviour. Two minutes clears it several times over and
 * also covers the ordinary case of a phone moving between networks.
 */
const RECONNECT_BUDGET_MS = 120000
/**
 * Backoff between attempts, in order; the last value repeats. The first retry
 * is deliberately quick — most drops are a single lost packet and come back
 * immediately — and it lengthens so a station that is genuinely down isn't
 * hammered for two minutes.
 */
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000]
/** ±20%, so a fleet of studios dropped by one network event don't retry in lockstep. */
const RECONNECT_JITTER = 0.2
/**
 * Readiness budget per reconnect attempt. Much shorter than a cold start: if
 * the container is up, /status answers on the first poll, and if it isn't,
 * spending 20s of a 120s window waiting for one attempt is a bad trade.
 */
const RECONNECT_STATION_READY_TIMEOUT_MS = 8000

/** The pause before the next attempt, jittered. */
function reconnectDelay(attempt: number): number {
  const base = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)]
  const spread = base * RECONNECT_JITTER
  return Math.round(base - spread + Math.random() * spread * 2)
}

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
 *
 * Recovery: a socket that closes mid-broadcast is not an error, it is the
 * normal consequence of broadcasting from a laptop. The audio engine, the
 * microphone and the queue position all survive a drop untouched — only the
 * socket is rebuilt — so a broadcaster who walks out of wifi range comes back
 * mid-sentence rather than losing their show. See {@link reconnect}.
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
  // True once the server has accepted the hello frame and kept the connection.
  // Until then openSocket() owns failure reporting; after it, a close is a real
  // mid-broadcast drop and the reconnect loop takes over.
  private established = false
  private reconnecting = false
  /**
   * Send-path tally. These count what actually left the socket, which is the
   * only honest basis for an on-air health readout: the encoder keeps
   * producing frames through a drop and they are discarded here, so anything
   * metered upstream of this point would show a healthy broadcast while the
   * audience hears nothing. See the `onChunk` callback in {@link start}.
   */
  private bytesSent = 0
  private chunksSent = 0
  private chunksDropped = 0
  private droppedMs = 0
  private lastDropAt = 0
  /** Open drop run, as epoch ms. 0 when frames are flowing. */
  private dropRunStart = 0
  /**
   * False until the first successful handshake.
   *
   * The engine is built and resumed in step 2 but the socket does not exist
   * until step 3, so lamejs spends the whole of `restoreQueue()` and the
   * handshake emitting frames of silence into a closed socket. Those are not
   * lost audio — nothing was on air and no one could have been listening —
   * and counting them made a healthy stream read as ~1% dropped on startup,
   * decaying as the show ran. Frames only count once there is a broadcast to
   * lose them from. Drops during a *reconnect* stay counted: those are real.
   */
  private countersArmed = false
  /**
   * Resolver for the current backoff pause, so it can be cut short — by the
   * tab becoming visible again, or by the broadcaster pressing stop. Without
   * this, stop() during a 15s pause would appear to hang.
   */
  private wakeFromBackoff: (() => void) | null = null
  private visibilityHandler: (() => void) | null = null
  /**
   * Last metadata pushed to harbor. Harbor forgets it when the source
   * disconnects, so a reconnect that didn't re-send it would leave every
   * listener looking at whatever was playing before the drop.
   */
  private lastMetadata: { title: string; artist: string } | null = null

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
    this.reconnecting = false
    this.lastMetadata = null
    this.steps = BroadcastManager.buildSteps(options?.skipMic)
    this.callbacks.onStateChange('connecting')
    this.callbacks.onStepChange([...this.steps])

    try {
      // Before anything with a side effect: if this page can't capture audio
      // at all, say so now. Bringing the station on air first would leave a
      // container running for a broadcast that was never possible.
      assertBroadcastSupported({ skipMic: options?.skipMic })

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
      // frames; before the socket exists — and while a reconnect is in
      // progress — they are simply dropped. Dropping is correct: buffering
      // would mean replaying stale audio into a live show on reconnect.
      this.setActiveStep('engine')
      this.engine = await AudioEngine.create(this.micStream, (chunk) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(chunk)
          if (!this.countersArmed) return
          this.bytesSent += chunk.byteLength
          this.chunksSent++
          // Close an open drop run and bank how long the audience lost.
          if (this.dropRunStart !== 0) {
            this.droppedMs += Date.now() - this.dropRunStart
            this.dropRunStart = 0
          }
        } else {
          if (!this.countersArmed) return
          const now = Date.now()
          if (this.dropRunStart === 0) this.dropRunStart = now
          this.lastDropAt = now
          this.chunksDropped++
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
      this.watchVisibility()
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
   * building its audio graph — means harbor isn't listening yet and the
   * connection is simply refused.
   *
   * The API's start is idempotent, so calling it on an already-running
   * station costs one round-trip and does not restart anything (a restart
   * would drop existing listeners). That is what makes it safe to call again
   * on every reconnect attempt, where the station may have been stopped for
   * silence while we were away.
   */
  private async ensureStationOnAir(readyTimeoutMs = STATION_READY_TIMEOUT_MS): Promise<void> {
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

    const deadline = Date.now() + readyTimeoutMs
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

    // Timed out. Publish anyway rather than refusing to broadcast: harbor
    // accepts the connection the moment it is listening, so a container that
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
   *
   * The token is minted fresh on every call, including every reconnect
   * attempt. They live about a minute, so one cached from before a drop is
   * dead on arrival — reusing it would turn a recoverable network blip into an
   * auth failure.
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

    const ws = await this.openSocket(ingestUrl, token)

    this.established = true
    // Arm on the first handshake only. A reconnect must not reset the tally —
    // frames lost mid-show are exactly what it exists to report.
    this.countersArmed = true
    this.watchForDrop(ws)
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
   *
   * Resolves with the accepted socket. Failure handling belongs entirely to
   * this method; a close AFTER it resolves is a different event with a
   * different meaning, and is handled by {@link watchForDrop}.
   */
  private openSocket(url: string, token: string): Promise<WebSocket> {
    return new Promise<WebSocket>((resolve, reject) => {
      let ws: WebSocket
      try {
        ws = new WebSocket(url, 'webcast')
      } catch {
        return reject(new Error('Could not reach the stream server'))
      }

      ws.binaryType = 'arraybuffer'
      // Adopted before the handshake completes so encoded frames start filling
      // harbor's buffer the moment it is willing to read them.
      this.ws = ws

      let settled = false
      let helloTimer: ReturnType<typeof setTimeout> | null = null

      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(connectTimer)
        if (helloTimer) clearTimeout(helloTimer)
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
            // and validates the short-lived token as the password.
            user: this.stationSlug,
            password: token,
            audio: AudioEngine.encoderInfo(),
          },
        }))

        // Survive the grace window and we are genuinely publishing.
        helloTimer = setTimeout(() => finish(() => resolve(ws)), HELLO_GRACE_MS)
      }

      ws.onerror = () => {
        finish(() => reject(new Error('Could not reach the stream server')))
      }

      ws.onclose = (event) => {
        // Closed inside the grace window: harbor refused us. Beyond a rejected
        // token, the most common cause during a reconnect is that harbor still
        // holds the mount from the connection we just lost and will not release
        // it until its own timeout expires — which is exactly what the retry
        // budget is sized to outlast.
        finish(() => reject(new Error(
          event.code === 1008 || event.code === 4001
            ? 'The stream server rejected this broadcast — the previous connection may still be closing'
            : 'The stream server closed the connection before the broadcast started',
        )))
      }
    })
  }

  /**
   * Watch an accepted socket for a mid-broadcast close and hand off to the
   * reconnect loop.
   *
   * The `this.ws !== ws` guard matters: a superseded socket from an earlier
   * attempt can still emit its close event long after a newer one is live, and
   * without the guard that stale event would tear down a healthy broadcast.
   */
  private watchForDrop(ws: WebSocket) {
    ws.onclose = () => {
      if (this.ws !== ws) return
      if (this.stopping || !this.established) return

      this.established = false
      void this.reconnect()
    }
    // Errors are always followed by a close, which is where the work happens.
    ws.onerror = () => { /* handled by onclose */ }
  }

  /**
   * Get back on air after a dropped socket, without disturbing the broadcast.
   *
   * Everything that makes this a *show* — the audio engine, the queue and its
   * position, the microphone, push-to-talk, the wake lock — is deliberately
   * left running. Only the socket is rebuilt. The encoder keeps encoding into
   * a closed socket the whole time and those frames are dropped, which is what
   * lets the broadcaster keep talking and land mid-sentence when it comes back
   * rather than replaying a backlog into a live show.
   *
   * The station itself is re-checked on every attempt, because a station with
   * no AutoDJ rotation is taken off air a minute or two after its broadcaster
   * disconnects (see StationAudioPolicy on the API). A reconnect inside that
   * window keeps the container; one that lands after it starts it again.
   *
   * That window is only reached by a DROPPED socket. Pressing End releases
   * such a station immediately — see releaseStation in BroadcastContext.
   */
  private async reconnect(): Promise<void> {
    if (this.reconnecting || this.stopping) return
    this.reconnecting = true

    this.callbacks.onStateChange('reconnecting')
    // Clear any stale message so the UI shows "reconnecting", not an old error.
    this.callbacks.onError('')

    const deadline = Date.now() + RECONNECT_BUDGET_MS
    let attempt = 0
    let lastError: unknown = null

    while (!this.stopping && Date.now() < deadline) {
      await this.backoff(reconnectDelay(attempt))
      attempt++

      if (this.stopping) break

      try {
        await this.ensureStationOnAir(RECONNECT_STATION_READY_TIMEOUT_MS)

        if (this.stopping) break

        await this.connectWebcast()

        // stop() can land while an attempt is mid-flight — it awaits an HTTP
        // round-trip and a socket handshake. Without this the broadcaster
        // would press stop and be left publishing over a socket opened after
        // the teardown had already run.
        if (this.stopping) {
          this.established = false
          try { this.ws?.close(1000, 'broadcast ended') } catch { /* already closing */ }
          this.ws = null
          break
        }

        this.reconnecting = false
        // Harbor lost our metadata with the connection; without this the
        // listener's player keeps showing whatever was playing before the drop.
        if (this.lastMetadata) {
          this.sendMetadata(this.lastMetadata.title, this.lastMetadata.artist)
        }
        this.callbacks.onError('')
        this.callbacks.onStateChange('live')
        return
      } catch (err) {
        lastError = err
      }
    }

    this.reconnecting = false

    if (this.stopping) return

    // Out of budget. Now — and only now — is this an error, and the broadcast
    // is genuinely over, so everything comes down.
    const detail = lastError instanceof Error ? ` (${lastError.message})` : ''
    await this.fail(new Error(
      `Lost the connection to the stream server and couldn't get back on air${detail}`,
    ))
  }

  /**
   * Pause between reconnect attempts, cut short if the broadcaster presses
   * stop or brings the tab back to the foreground.
   *
   * The visibility case is worth the complexity: background tabs have their
   * timers clamped to roughly once a minute, so a laptop reopened after a
   * sleep would otherwise sit idle for up to a minute before even trying.
   */
  private backoff(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        this.wakeFromBackoff = null
        resolve()
      }
      const timer = setTimeout(done, ms)
      this.wakeFromBackoff = done
    })
  }

  /** Retry immediately when the broadcaster returns to the tab. */
  private watchVisibility() {
    if (this.visibilityHandler) return
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') this.wakeFromBackoff?.()
    }
    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  private unwatchVisibility() {
    if (!this.visibilityHandler) return
    document.removeEventListener('visibilitychange', this.visibilityHandler)
    this.visibilityHandler = null
  }

  /** Push the current track's title/artist to harbor as a metadata frame. */
  private sendMetadata(title: string, artist: string): void {
    // Remembered even when it can't be sent, so the reconnect can replay it.
    this.lastMetadata = { title, artist }
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ type: 'metadata', data: { title, artist } }))
  }

  /**
   * What has actually reached the server since this broadcast went on air.
   * Everything before the first handshake is excluded — see `countersArmed`.
   */
  getTransportStats(): TransportStats {
    // Include the run still open right now, so a live dropout is visible as it
    // happens rather than only once frames start flowing again.
    const openRun = this.dropRunStart === 0 ? 0 : Date.now() - this.dropRunStart
    return {
      bytesSent: this.bytesSent,
      chunksSent: this.chunksSent,
      chunksDropped: this.chunksDropped,
      droppedMs: this.droppedMs + openRun,
      lastDropAt: this.lastDropAt,
      connected: this.ws?.readyState === WebSocket.OPEN,
    }
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
    // Set first: it is what makes an in-flight reconnect give up rather than
    // race this teardown and reopen a socket behind it.
    this.stopping = true
    this.wakeFromBackoff?.()
    this.reconnecting = false
    this.established = false
    this.unwatchVisibility()

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
    this.lastMetadata = null
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

    this.reconnecting = false
    this.established = false
    this.unwatchVisibility()

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
