import { openMic, rememberMicDevice, savedMicDeviceId } from './mic'
import { AudioEngine, BITRATE_TIERS, DEFAULT_BITRATE, assertBroadcastSupported, type Bitrate } from './audioEngine'
import api from './axios'
import { captureDrop, flushDrops, resolveDrop } from './studioDropLog'
import { MIN_UPLINK_KBPS, checkUplink, reportUplinkCheck } from './uplinkProbe'

/**
 * The checklist. Connecting is not one of them: it happens on Start, after
 * the list has finished, and the lamp covers it ("Going live…").
 */
export type BroadcastStep = 'network' | 'station' | 'mic' | 'engine'
export type StepStatus = 'pending' | 'active' | 'done' | 'error'
/**
 * `ready`: every check has passed and the engine is built, but no socket is
 * open, so nothing is on air. The host goes on air with {@link BroadcastManager.goLive}.
 */
export type BroadcastState = 'idle' | 'connecting' | 'ready' | 'live' | 'reconnecting' | 'error'

export interface BroadcastStartOptions {
  /** Music only: no microphone is requested or mixed. */
  skipMic?: boolean
  /**
   * Cue the saved queue's last song from 0:00 instead of where it stopped.
   * Chosen on the Go Live page; see {@link AudioEngine.resumePlayback}.
   */
  resumeFromStart?: boolean
}

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
  /** What the encoder is producing right now, in kbps. */
  bitrate: Bitrate
  /** Audio accepted by the socket but not yet sent, as playing time. */
  backlogMs: number
  /** The upload is falling behind: see CONGESTED_BACKLOG_MS. */
  congested: boolean
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

/**
 * How long a finished checklist stays good. Past this, Start runs the whole
 * checklist again before connecting: the upload measured minutes ago may not
 * be the one the show gets, and the sweep may have stopped the station.
 */
const READY_STALE_MS = 3 * 60_000
/**
 * A station the checklist brought up this recently is taken as still up when
 * Start goes on air. Start usually follows the checks within a second, and
 * asking again then was a second `POST /start` on every go-live.
 */
const STATION_FRESH_MS = 30_000
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
 *
 * Must stay below the API's `studio_gone_stop_seconds` (150s): past that, a
 * station with no AutoDJ is taken off air on the assumption that this loop
 * has given up.
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

/**
 * Most unsent audio the socket may hold before new frames are dropped
 * instead of queued. Past about 10s of silence harbor's input timeout drops
 * the source, so a backlog that is left to grow ends the broadcast; capping
 * it keeps something arriving and keeps what listeners hear close to live.
 */
const BACKLOG_CAP_MS = 4000
/** A backlog this deep means the upload is not keeping up with the encoder. */
const CONGESTED_BACKLOG_MS = 2000
/** How often the backlog is sampled, off the encoder's own frames. */
const BACKLOG_SAMPLE_MS = 1000
/** Consecutive congested samples before stepping the bitrate down. */
const STEP_DOWN_AFTER_SAMPLES = 3
/** Time for a step down to drain the backlog before judging it. */
const STEP_DOWN_COOLDOWN_MS = 10000
/** Below this the line is keeping up with room to spare. */
const CLEAR_BACKLOG_MS = 300
/**
 * How long the line must stay clear before trying one tier up. Long, because
 * stepping up onto a line that can't hold it costs listeners another stall.
 */
const STEP_UP_AFTER_CLEAR_MS = 5 * 60 * 1000
/**
 * Frame watchdog. The encoder emits a frame roughly every 93ms whenever the
 * audio graph is running, silence included, so a gap this long means the
 * graph has stopped, not that the show went quiet.
 *
 * This is separate from the socket for a reason found on a Firefox Android
 * phone in production: its audio pipeline died while the tab was in the
 * background, and every reconnect after that was accepted by harbor, sent no
 * audio, and was dropped by harbor's `timeout` (10s) moments later, every 14s
 * for as long as the host stayed. A reconnect only rebuilds the socket, so it
 * could never fix it; a fresh broadcast, with a fresh engine, did at once.
 *
 * At WAKE we ask the browser to resume the context. At REBUILD the engine is
 * replaced in place (see rebuildEngine). Both land inside harbor's 10s, so a
 * recovered stall never costs the socket.
 */
const FRAME_WATCHDOG_TICK_MS = 1000
const FRAME_STALL_WAKE_MS = 2000
const FRAME_STALL_REBUILD_MS = 5000
/**
 * Rebuilds allowed inside REBUILD_WINDOW_MS before the broadcast is ended
 * with a message to reload. An engine that keeps dying is better reported
 * than retried forever while listeners hear nothing.
 */
const MAX_REBUILDS = 3
const REBUILD_WINDOW_MS = 10 * 60 * 1000
/**
 * How long a rebuild may take to produce a new engine. The browser that
 * killed the last one can hang building the next (a worklet module that
 * never loads), and a rebuild stuck forever would leave the watchdog off for
 * the rest of the show, which is the loop this exists to end.
 */
const REBUILD_CREATE_TIMEOUT_MS = 8000

/** The pause before the next attempt, jittered. */
function reconnectDelay(attempt: number): number {
  const base = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)]
  const spread = base * RECONNECT_JITTER
  return Math.round(base - spread + Math.random() * spread * 2)
}

/** Thrown inside a checklist that stop() overtook; never reaches the host. */
class ChecksCancelled extends Error {}

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
  // Whether the broadcast wants the screen held on. The browser drops the lock
  // itself whenever the page is hidden, so this — not `wakeLock` — decides
  // whether to take it again when the page is shown.
  private wantWakeLock = false
  private wakeLockRequesting = false
  private steps: BroadcastStepInfo[] = []
  private stopping = false
  // Bumped by start() and stop(). A checklist remembers the value it began
  // with and gives up at its next await once it differs, so Cancel during the
  // checks can't later open the mic, build an engine and land in `ready`.
  // Not `stopping`: a fresh start() clears that while the old run is in flight.
  private checksRun = 0
  /**
   * Did this manager's checklist turn the station on — was it off when
   * {@link ensureStationOnAir} read it, just before `POST /start`? Read by
   * BroadcastContext.stop() when a Cancel asks it to hand back only what the
   * cancelled run took: a station the host had left running stays running.
   * Never cleared by stop(), which is when it is read.
   */
  startedStationThisRun = false
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
  /** When the current socket was accepted, for the drop report. */
  private connectedAt = 0
  /**
   * Most audio queued inside the current socket, in bytes. A backlog that
   * grows before a drop means the upload couldn't keep up with the encoder,
   * which is a different cause from the page being frozen or the network
   * vanishing. See studioDropLog.
   */
  private peakBufferedBytes = 0
  /**
   * Current ingest bitrate: set by the go-live connection check, then moved
   * a tier at a time by {@link sampleBacklog} as the upload falls behind or
   * recovers.
   */
  private bitrate: Bitrate = DEFAULT_BITRATE
  /** What the go-live check measured, for drop reports. */
  private uplinkKbps: number | null = null
  private lastBacklogSampleAt = 0
  private congestedSamples = 0
  private lastBitrateChangeAt = 0
  /** When the backlog last became clear, or 0 while it isn't. */
  private clearSince = 0
  /**
   * The socket's backlog at the last bitrate change, which was encoded at
   * the old rate: its bytes, its playing time, and {@link bytesSent} then.
   * The socket drains in order, so those bytes leave before anything newer.
   */
  private carryBytes = 0
  private carryMs = 0
  private bytesSentAtShift = 0
  /**
   * Last metadata pushed to harbor. Harbor forgets it when the source
   * disconnects, so a reconnect that didn't re-send it would leave every
   * listener looking at whatever was playing before the drop.
   */
  private lastMetadata: { title: string; artist: string } | null = null
  /**
   * Title/artist of the last frame that actually went over the socket. The
   * engine notifies on every state change (a restored queue's durations
   * alone fire one per track), and each unchanged re-send re-inserts
   * metadata into the stream.
   */
  private sentMetadataKey: string | null = null
  /** What {@link start} was called with, for a stale checklist to re-run. */
  private startOptions: BroadcastStartOptions | undefined
  /** When the checklist last finished, for {@link READY_STALE_MS}. */
  private readyAt = 0
  /** When the station was last confirmed on air, for {@link STATION_FRESH_MS}. */
  private stationCheckedAt = 0
  /**
   * Set while Start re-checks what the host already watched pass. The steps
   * still update here, so a failure can name its step, but the list on screen
   * stays as it was: showing the same checks run twice reads as the page
   * repeating itself.
   */
  private quietSteps = false
  /** When the engine last emitted an encoded frame, socket or not. */
  private lastFrameAt = 0
  private frameWatchdog: ReturnType<typeof setInterval> | null = null
  private rebuilding = false
  /** Epoch ms of recent engine rebuilds, for MAX_REBUILDS. */
  private rebuildTimes: number[] = []

  private static buildSteps(skipMic?: boolean): BroadcastStepInfo[] {
    const steps: BroadcastStepInfo[] = [
      { id: 'network', label: 'Checking your connection', status: 'pending' },
      { id: 'station', label: 'Bringing your station on air', status: 'pending' },
    ]
    if (!skipMic) {
      steps.push({ id: 'mic', label: 'Requesting microphone access', status: 'pending' })
    }
    steps.push({ id: 'engine', label: 'Setting up audio engine', status: 'pending' })
    return steps
  }

  constructor(stationSlug: string, callbacks: BroadcastCallbacks) {
    this.stationSlug = stationSlug
    this.callbacks = callbacks
  }

  private emitSteps() {
    if (!this.quietSteps) this.callbacks.onStepChange([...this.steps])
  }

  private updateStep(id: BroadcastStep, status: StepStatus, errorMessage?: string, label?: string) {
    this.steps = this.steps.map((s) =>
      s.id === id ? { ...s, status, errorMessage, label: label ?? s.label } : s,
    )
    this.emitSteps()
  }

  private setActiveStep(id: BroadcastStep) {
    this.steps = this.steps.map((s) =>
      s.id === id ? { ...s, status: 'active' as StepStatus } : s,
    )
    this.emitSteps()
  }

  /**
   * Run the go-live checklist up to, not including, the socket: connection,
   * station, mic, engine. Ends in `ready` with nothing on air, and the host
   * goes on air with {@link goLive}. On any failure, calls {@link fail}.
   *
   * The split is so the moment a host goes on air is one they choose. A
   * socket that opened the moment the checks passed put them on air on a
   * page with no controls, with the queue already playing.
   */
  async start(options?: BroadcastStartOptions): Promise<void> {
    this.stopping = false
    this.established = false
    this.reconnecting = false
    this.lastMetadata = null
    this.sentMetadataKey = null
    this.startOptions = options
    this.startedStationThisRun = false
    const run = ++this.checksRun
    this.callbacks.onStateChange('connecting')

    try {
      await this.runChecks(run, options)
      this.readyAt = Date.now()
      this.callbacks.onStateChange('ready')
    } catch (err) {
      // Cancelled: stop() has already torn down and said `idle`. A step that
      // failed on its own AFTER the cancel (the mic prompt answered Block, a
      // 422 from /start) is the same case: reporting it would put `error` on
      // a manager that is already stopped.
      if (err instanceof ChecksCancelled || run !== this.checksRun) return
      await this.fail(err)
    }
  }

  /**
   * Go on air from `ready`: open the socket, then start the queue.
   *
   * The station is checked again first, unless the checklist confirmed it
   * within {@link STATION_FRESH_MS}. `POST /start` is idempotent, so on a
   * station that is still running it costs one request; on one the sweep
   * stopped while the host sat on the Start screen it brings it back. A
   * checklist older than {@link READY_STALE_MS}, or a mic that has gone away
   * since (unplugged, revoked), is run again in full instead.
   */
  async goLive(): Promise<void> {
    if (!this.engine || this.ws) return
    const run = this.checksRun
    // stop() bumps checksRun. Every await below is a place it can land, and
    // past it this method must not touch `this` again: the engine is gone,
    // and a socket opened now would sit on the harbor mount behind an `idle`.
    const cancelled = () => run !== this.checksRun
    this.callbacks.onStateChange('connecting')
    // Inside the Start click: the one moment a resume is sure to be allowed.
    void this.engine.resume().catch(() => {})

    try {
      this.quietSteps = true
      const micGone = this.micStream?.getAudioTracks().some((t) => t.readyState === 'ended') ?? false
      if (micGone || Date.now() - this.readyAt > READY_STALE_MS) {
        this.micStream?.getTracks().forEach((t) => t.stop())
        this.micStream = null
        await this.engine.destroy()
        this.engine = null
        await this.runChecks(run, this.startOptions)
      } else if (Date.now() - this.stationCheckedAt > STATION_FRESH_MS) {
        this.setActiveStep('station')
        await this.ensureStationOnAir(run)
        if (cancelled()) throw new ChecksCancelled()
        this.updateStep('station', 'done')
      }
      this.quietSteps = false

      await this.connectWebcast(run)
      if (cancelled()) throw new ChecksCancelled()

      // Socket is up and accepted — safe to resume saved playback. Starting
      // earlier would encode audio that gets dropped for want of a socket,
      // clipping the first seconds of the broadcast.
      // Not awaited: it waits on the track's metadata, which a background tab
      // may not load until it is shown, and the broadcast is live either way.
      void this.engine?.resumePlayback({ fromStart: this.startOptions?.resumeFromStart }).catch((err) => {
        console.error('[BroadcastManager] could not resume saved playback:', err)
      })

      this.acquireWakeLock()
      this.watchVisibility()
      this.watchFrames()
      this.callbacks.onStateChange('live')
      // Reports left over from an earlier broadcast that never got out.
      void flushDrops()
    } catch (err) {
      // See start(): a cancelled run reports nothing, however it ended.
      if (err instanceof ChecksCancelled || cancelled()) return
      await this.fail(err)
    }
  }

  /**
   * The checklist itself, minus the socket. Throws on the first failure, and
   * {@link ChecksCancelled} at the first await after stop() — releasing
   * whatever this run opened that stop() could not yet see.
   */
  private async runChecks(run: number, options?: BroadcastStartOptions): Promise<void> {
    const cancelled = () => run !== this.checksRun

    this.bitrate = DEFAULT_BITRATE
    this.uplinkKbps = null
    this.lastBacklogSampleAt = 0
    this.congestedSamples = 0
    this.lastBitrateChangeAt = 0
    this.clearSince = 0
    this.carryBytes = 0
    this.carryMs = 0
    this.steps = BroadcastManager.buildSteps(options?.skipMic)
    this.emitSteps()

    // Before anything with a side effect: if this page can't capture audio
    // at all, say so now. Bringing the station on air first would leave a
    // container running for a broadcast that was never possible.
    assertBroadcastSupported({ skipMic: options?.skipMic })

    // Before the station too: a line that can't carry the lowest bitrate
    // would start a container for a show that drops within minutes.
    this.setActiveStep('network')
    let uplink: Awaited<ReturnType<typeof checkUplink>>
    try {
      uplink = await checkUplink()
    } catch (err) {
      if (cancelled()) throw new ChecksCancelled()
      reportUplinkCheck(this.stationSlug, 'failed', { kbps: null, bitrate: null })
      throw err
    }
    // Before POST /start: a cancelled check must not bring the station on air.
    if (cancelled()) throw new ChecksCancelled()
    this.uplinkKbps = uplink.kbps
    reportUplinkCheck(
      this.stationSlug,
      uplink.bitrate === null ? 'blocked' : uplink.bitrate < DEFAULT_BITRATE ? 'lowered' : 'ok',
      uplink,
    )
    if (uplink.bitrate === null) {
      throw new Error(
        `Your connection is too slow to broadcast: it uploads about ${uplink.kbps} kbps, and a show needs at least ${MIN_UPLINK_KBPS}. `
        + 'Move closer to your Wi-Fi, use a cable, or pause other uploads, then try again.',
      )
    }
    this.bitrate = uplink.bitrate
    this.updateStep(
      'network',
      'done',
      undefined,
      uplink.bitrate < DEFAULT_BITRATE ? `Slow connection: sending at ${uplink.bitrate} kbps to keep up` : undefined,
    )

    // Step 0: Make sure the station is on air and its Liquidsoap container
    // is actually ready to consume our stream.
    this.setActiveStep('station')
    await this.ensureStationOnAir(run)
    if (cancelled()) throw new ChecksCancelled()
    this.updateStep('station', 'done')

    // Step 1: Microphone (skipped in music-only mode).
    if (!options?.skipMic) {
      this.setActiveStep('mic')
      const mic = await this.openSavedMic()
      if (cancelled()) {
        mic.getTracks().forEach((t) => t.stop())
        throw new ChecksCancelled()
      }
      this.micStream = mic
      this.updateStep('mic', 'done')
    }

    // Step 2: Audio engine — mic + queue mixer, encoding MP3 off-thread.
    // Frames go out through handleChunk. Kept local until it survives both
    // awaits: stop() can only destroy what is already on `this`. (A mic it
    // reached in between, stop() has already released.)
    this.setActiveStep('engine')
    const engine = await this.createEngine()
    if (!cancelled()) await engine.restoreQueue()
    if (cancelled()) {
      await engine.destroy()
      throw new ChecksCancelled()
    }
    this.engine = engine
    this.updateStep('engine', 'done')
  }

  /**
   * Encoded frames go straight out over the socket as binary webcast frames;
   * before the socket exists — and while a reconnect is in progress — they
   * are simply dropped. Dropping is correct: buffering would mean replaying
   * stale audio into a live show on reconnect.
   */
  private handleChunk = (chunk: ArrayBuffer) => {
    this.lastFrameAt = Date.now()
    this.sampleBacklog()
    // A full backlog drops the frame like a closed socket does: queueing
    // it would only push the show further behind live.
    if (this.ws?.readyState === WebSocket.OPEN && this.backlogMs() < BACKLOG_CAP_MS) {
      this.ws.send(chunk)
      const buffered = this.ws.bufferedAmount
      if (buffered > this.peakBufferedBytes) this.peakBufferedBytes = buffered
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
  }

  /**
   * Build an engine on the current mic stream, running and wired to harbor's
   * metadata.
   *
   * @param awaitResume False for a rebuild. Outside a user gesture the
   *   browser may refuse to start the context, and then resume() stays
   *   pending until the next tap; awaiting it would hang the rebuild. The
   *   studio's "Audio paused" notice asks for that tap instead.
   */
  private async createEngine(awaitResume = true, signal?: AbortSignal): Promise<AudioEngine> {
    const engine = await AudioEngine.create(this.micStream, this.handleChunk, this.stationSlug, this.bitrate, signal)
    // The context starts suspended under the autoplay policy, and a
    // suspended context produces no frames for the worklet to capture.
    // Resume now — on a first start we are inside the user gesture that
    // triggered start().
    if (awaitResume) await engine.resume()
    else void engine.resume().catch(() => {})
    // Keep harbor's metadata in step with whatever the queue is playing.
    engine.subscribe(() => {
      if (this.engine !== engine) return
      const track = engine.getCurrentTrack()
      if (!track || `${track.title}\0${track.artist}` === this.sentMetadataKey) return
      this.sendMetadata(track.title, track.artist)
    })
    return engine
  }

  /** Watch for the engine going quiet — see FRAME_STALL_WAKE_MS. */
  private watchFrames() {
    this.lastFrameAt = Date.now()
    if (this.frameWatchdog) return
    let lastTick = Date.now()
    this.frameWatchdog = setInterval(() => {
      const now = Date.now()
      const late = now - lastTick > FRAME_STALL_WAKE_MS
      lastTick = now
      // A late tick means this page was frozen or its timers throttled (a
      // locked phone, a background tab), and frames that are on their way
      // haven't landed yet. Judging the engine on that gap would rebuild a
      // healthy one on every unlock, so start the count again from here.
      if (late) {
        this.lastFrameAt = Math.max(this.lastFrameAt, now)
        return
      }
      if (this.stopping || this.rebuilding || !this.engine) return
      const silentFor = now - this.lastFrameAt
      if (silentFor < FRAME_STALL_WAKE_MS) return
      if (this.engine.isSuspended()) {
        // Stopped by the browser: resume, or wait for the tap that can. A new
        // engine would start out just as stopped.
        void this.engine.resume().catch(() => {})
        return
      }
      if (silentFor >= FRAME_STALL_REBUILD_MS) void this.rebuildEngine()
    }, FRAME_WATCHDOG_TICK_MS)
  }

  private unwatchFrames() {
    if (this.frameWatchdog) clearInterval(this.frameWatchdog)
    this.frameWatchdog = null
  }

  /**
   * Replace a dead engine with a new one without ending the show.
   *
   * The queue and the playback position live in IndexedDB, so the new engine
   * restores them the same way a fresh Go Live does. The socket, the mic
   * stream and the wake lock are untouched. Per-show settings that are not
   * stored (repeat, monitor, a latched mic) are carried across by hand.
   */
  private async rebuildEngine(): Promise<void> {
    const old = this.engine
    if (!old || this.rebuilding || this.stopping) return

    const now = Date.now()
    this.rebuildTimes = this.rebuildTimes.filter((t) => now - t < REBUILD_WINDOW_MS)
    if (this.rebuildTimes.length >= MAX_REBUILDS) {
      await this.fail(new Error(
        "The studio's audio keeps stopping in this browser. Reload the page to go back on air.",
      ))
      return
    }
    this.rebuildTimes.push(now)
    this.rebuilding = true
    console.warn(`[BroadcastManager] no audio frames for ${now - this.lastFrameAt}ms (context ${old.getContextState()}); rebuilding the audio engine`)

    const carry = {
      playing: old.isPlaying(),
      index: old.getCurrentIndex(),
      offset: old.getElapsed(),
      repeat: old.getRepeatMode(),
      monitor: old.isMonitorEnabled(),
      monitorVolume: old.getMonitorVolume(),
      latched: old.isMicLatched(),
      tracksPlayed: old.getTracksPlayed(),
    }

    // stop() or fail() can land at any await below. Each sets `stopping` and
    // tears down whatever `this.engine` is at that moment, so the rule is:
    // re-check after every await, and an engine not yet adopted into
    // `this.engine` is ours to destroy (the finally block).
    let engine: AudioEngine | null = null
    let adopted = false
    try {
      try { await old.destroy() } catch { /* already broken: that is why we are here */ }
      if (this.stopping) return
      engine = await this.createEngineWithin(REBUILD_CREATE_TIMEOUT_MS)
      if (this.stopping) return
      this.engine = engine
      adopted = true
      this.lastFrameAt = Date.now()
      await engine.restoreQueue()
      if (this.stopping) return
      engine.setRepeatMode(carry.repeat)
      engine.setMonitorVolume(carry.monitorVolume)
      engine.setMonitorEnabled(carry.monitor)
      if (carry.latched) engine.setMicLatched(true)
      engine.carryTracksPlayed(carry.tracksPlayed)
      // Same song, same second, playing or paused. restoreQueue() brings the
      // queue back in the same order, less any file the browser has lost
      // since — restoredIndex() maps across that, and a song that was lost
      // carries on as the next one, from its start.
      const resumeAt = carry.index >= 0 ? engine.restoredIndex(carry.index) : null
      if (resumeAt && resumeAt.index >= 0) {
        const offset = resumeAt.sameTrack ? carry.offset : 0
        void engine.cueAt(resumeAt.index, offset, carry.playing).catch((err) => {
          console.error('[BroadcastManager] could not cue playback after rebuild:', err)
        })
      }
      // 'live' is what hands the studio the new engine (BroadcastContext).
      // Mid-reconnect it arrives with the reconnect's own 'live'.
      if (!this.reconnecting) this.callbacks.onStateChange('live')
    } catch (err) {
      console.error('[BroadcastManager] audio engine rebuild failed:', err)
      if (!this.stopping) {
        await this.fail(new Error(
          "The studio's audio stopped and couldn't be restarted. Reload the page to go back on air.",
        ))
      }
    } finally {
      if (engine && !adopted) void engine.destroy().catch(() => {})
      this.rebuilding = false
    }
  }

  /**
   * createEngine for a rebuild, bounded by `ms`. The abort makes
   * AudioEngine.create close the half-built context itself.
   */
  private async createEngineWithin(ms: number): Promise<AudioEngine> {
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), ms)
    try {
      return await this.createEngine(false, abort.signal)
    } catch (err) {
      throw abort.signal.aborted ? new Error(`audio engine took longer than ${ms}ms to build`) : err
    } finally {
      clearTimeout(timer)
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
   *
   * `run` is the checklist this belongs to (see `checksRun`): once stop() has
   * overtaken it, the wait for readiness ends in {@link ChecksCancelled}
   * rather than polling a station nobody is going to use for 20 more seconds.
   * The POST itself, once sent, is not undone here — whether a cancelled run
   * hands the station back is the host's call (BroadcastContext.stop()), and
   * {@link startedStationThisRun} is what tells it there is something to hand
   * back.
   *
   * @param probe Read the station first, to learn whether THIS run is the one
   *   turning it on. Off for a reconnect, where the question is moot — End
   *   releases unconditionally — and every attempt would pay the extra read.
   */
  private async ensureStationOnAir(
    run: number,
    readyTimeoutMs = STATION_READY_TIMEOUT_MS,
    probe = true,
  ): Promise<void> {
    const cancelled = () => run !== this.checksRun
    this.stationCheckedAt = 0

    // Was it off before we asked? `desired_state`, not `state`: a container
    // that died under a station the owner left running is not ours to hand
    // back, only to restore. A failed read answers "don't know", which is
    // "not ours": the sweep covers a station left on by mistake, and nothing
    // covers one taken off air by mistake.
    let wasOff = false
    if (probe) {
      try {
        const { data } = await api.get<{ data: { desired_state?: 'stopped' | 'running' } }>(
          `/stations/${this.stationSlug}/status`,
        )
        wasOff = data.data.desired_state === 'stopped'
      } catch {
        wasOff = false
      }
      // Cancelled while reading: don't send the POST at all.
      if (cancelled()) throw new ChecksCancelled()
    }

    try {
      await api.post(`/stations/${this.stationSlug}/start`)
      if (wasOff) this.startedStationThisRun = true
    } catch (err) {
      if (cancelled()) throw new ChecksCancelled()
      const response = (err as { response?: { status?: number; data?: { message?: string } } })?.response
      // Plan limits and ownership are the two refusals worth repeating
      // verbatim — the API writes them for humans.
      if (response?.status === 422 || response?.status === 403) {
        throw new Error(response.data?.message ?? 'This station cannot go on air right now')
      }
      if (response?.status === 429) {
        throw new Error('Too many tries in a row. Wait a minute, then try again.')
      }
      throw new Error('Could not bring the station on air — please try again')
    }

    const deadline = Date.now() + readyTimeoutMs
    while (Date.now() < deadline) {
      if (cancelled()) throw new ChecksCancelled()
      try {
        const { data } = await api.get<{ data: { ready: boolean } }>(
          `/stations/${this.stationSlug}/status`,
        )
        if (cancelled()) throw new ChecksCancelled()
        if (data.data.ready) {
          this.stationCheckedAt = Date.now()
          return
        }
      } catch (err) {
        if (err instanceof ChecksCancelled) throw err
        // Status is a live read from the container; a blip here is not a
        // reason to abandon the broadcast.
      }
      await new Promise((resolve) => setTimeout(resolve, STATION_READY_POLL_MS))
    }
    if (cancelled()) throw new ChecksCancelled()

    // Timed out. Publish anyway rather than refusing to broadcast: harbor
    // accepts the connection the moment it is listening, so a container that
    // finishes booting late still picks the stream up — the broadcaster may
    // just lose the first few seconds.
    this.stationCheckedAt = Date.now()
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
   *
   * `run` is the checklist (or reconnect attempt) this belongs to. stop()
   * bumps `checksRun` and nulls `this.ws` synchronously, before this method
   * can resume from either of its awaits; a run it has overtaken must not
   * open a socket, and one it opened must be closed again — not installed —
   * or it sits on the harbor mount behind an `idle` with nothing feeding it.
   */
  private async connectWebcast(run: number): Promise<void> {
    const cancelled = () => run !== this.checksRun
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
    // Before the socket exists: stop() landed during the token request.
    if (cancelled()) throw new ChecksCancelled()

    const ws = await this.openSocket(ingestUrl, token)

    // stop() landed during the handshake. It has already let go of (and
    // closed) whatever `this.ws` was at that moment; if the handshake still
    // resolved, the socket is ours to close, and never `established`.
    if (cancelled()) {
      if (this.ws === ws) this.ws = null
      try { ws.close(1000, 'broadcast ended') } catch { /* already closing */ }
      throw new ChecksCancelled()
    }

    this.established = true
    this.connectedAt = Date.now()
    this.peakBufferedBytes = 0
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
            audio: this.engine?.encoderInfo(),
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
    ws.onclose = (event) => {
      if (this.ws !== ws) return
      if (this.stopping || !this.established) return

      this.established = false
      const dropId = captureDrop(this.stationSlug, {
        closeEvent: event,
        connectedAt: this.connectedAt,
        bufferedBytes: ws.bufferedAmount,
        peakBufferedBytes: this.peakBufferedBytes,
        wakeLockHeld: this.wakeLock !== null,
        bitrate: this.bitrate,
        uplinkKbps: this.uplinkKbps,
        audioState: this.engine?.getContextState() ?? null,
        frameAgeMs: this.lastFrameAt ? Date.now() - this.lastFrameAt : null,
        engineRebuilds: this.rebuildTimes.length,
      })
      void this.reconnect(dropId)
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
   * no AutoDJ rotation is taken off air about 2.5 minutes after a studio
   * broadcaster disconnects (studio_gone_stop_seconds, StationAudioPolicy on
   * the API). That grace is sized to outlast RECONNECT_BUDGET_MS, so a
   * reconnect normally lands inside it and keeps the container; one that
   * lands after it starts the station again.
   *
   * That window is only reached by a DROPPED socket. Pressing End releases
   * such a station immediately — see releaseStation in BroadcastContext.
   */
  private async reconnect(dropId: string | null = null): Promise<void> {
    if (this.reconnecting || this.stopping) return
    this.reconnecting = true
    const droppedAt = Date.now()

    this.callbacks.onStateChange('reconnecting')
    // Clear any stale message so the UI shows "reconnecting", not an old error.
    this.callbacks.onError('')

    const deadline = Date.now() + RECONNECT_BUDGET_MS
    let attempt = 0
    let lastError: unknown = null
    const report = (outcome: 'reconnected' | 'gave_up' | 'stopped') => resolveDrop(dropId, outcome, {
      downMs: Date.now() - droppedAt,
      attempts: attempt,
      lastError: lastError instanceof Error ? lastError.message : null,
    })

    while (!this.stopping && Date.now() < deadline) {
      await this.backoff(reconnectDelay(attempt))
      attempt++

      if (this.stopping) break

      // stop() bumps checksRun, so the two calls below give up at their own
      // awaits (ChecksCancelled lands in the catch, and `stopping` ends the
      // loop) instead of finishing a round-trip nobody is waiting for.
      const run = this.checksRun
      try {
        await this.ensureStationOnAir(run, RECONNECT_STATION_READY_TIMEOUT_MS, false)

        if (this.stopping) break

        await this.connectWebcast(run)

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
        report('reconnected')
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

    if (this.stopping) {
      report('stopped')
      return
    }

    report('gave_up')

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

  /**
   * When the broadcaster returns to the tab: retry a pending reconnect now, and
   * take the screen wake lock again, since the browser released it on hide.
   */
  private watchVisibility() {
    if (this.visibilityHandler) return
    this.visibilityHandler = () => {
      if (document.visibilityState !== 'visible') return
      this.wakeFromBackoff?.()
      if (this.wantWakeLock) void this.requestWakeLock()
    }
    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  private unwatchVisibility() {
    if (!this.visibilityHandler) return
    document.removeEventListener('visibilitychange', this.visibilityHandler)
    this.visibilityHandler = null
  }

  /**
   * Unsent audio inside the socket, as playing time. Bytes queued before the
   * last bitrate change count at the rate they were encoded at: after a step
   * from 128 to 64, reading them at 64 would double the backlog, drop fresh
   * frames at the cap, and trigger a second step down on stale data.
   */
  private backlogMs(): number {
    const buffered = this.ws?.bufferedAmount ?? 0
    // Whatever is buffered beyond what was sent since the change is still
    // the old backlog draining.
    const carried = Math.min(
      this.carryBytes,
      Math.max(0, buffered - (this.bytesSent - this.bytesSentAtShift)),
    )
    const carriedMs = carried === 0 ? 0 : this.carryMs * (carried / this.carryBytes)
    // bits ÷ kbps = ms
    return carriedMs + ((buffered - carried) * 8) / this.bitrate
  }

  /**
   * Fit the bitrate to the upload, once a second off the encoder's frames.
   *
   * Not a timer: a hidden tab's timers can be throttled to once a minute, and a
   * broadcast is exactly what runs hidden. The encoder keeps its pace.
   *
   * Down a tier when the backlog stays deep for a few seconds, then wait for
   * it to drain before judging again. Up a tier only after minutes of a clear
   * line, and never past the default.
   */
  private sampleBacklog(): void {
    const now = Date.now()
    if (now - this.lastBacklogSampleAt < BACKLOG_SAMPLE_MS) return
    this.lastBacklogSampleAt = now

    if (!this.established || this.ws?.readyState !== WebSocket.OPEN) {
      this.congestedSamples = 0
      this.clearSince = 0
      return
    }

    const backlog = this.backlogMs()
    if (backlog >= CONGESTED_BACKLOG_MS) {
      this.clearSince = 0
      this.congestedSamples++
      if (
        this.congestedSamples >= STEP_DOWN_AFTER_SAMPLES
        && now - this.lastBitrateChangeAt >= STEP_DOWN_COOLDOWN_MS
      ) {
        this.shiftBitrate(1)
      }
      return
    }

    this.congestedSamples = 0
    if (backlog > CLEAR_BACKLOG_MS) {
      this.clearSince = 0
    } else if (this.clearSince === 0) {
      this.clearSince = now
    } else if (now - this.clearSince >= STEP_UP_AFTER_CLEAR_MS) {
      this.shiftBitrate(-1)
      this.clearSince = now
    }
  }

  /** One tier down (1) or up (-1) in BITRATE_TIERS, which runs best first. */
  private shiftBitrate(direction: 1 | -1): void {
    const next = BITRATE_TIERS[BITRATE_TIERS.indexOf(this.bitrate) + direction]
    if (next === undefined || !this.engine) return
    this.carryMs = this.backlogMs()
    this.carryBytes = this.ws?.bufferedAmount ?? 0
    this.bytesSentAtShift = this.bytesSent
    this.bitrate = next
    this.engine.setBitrate(next)
    this.lastBitrateChangeAt = Date.now()
    this.congestedSamples = 0
  }

  /** Push the current track's title/artist to harbor as a metadata frame. */
  private sendMetadata(title: string, artist: string): void {
    // Remembered even when it can't be sent, so the reconnect can replay it.
    this.lastMetadata = { title, artist }
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ type: 'metadata', data: { title, artist } }))
    this.sentMetadataKey = `${title}\0${artist}`
  }

  /**
   * What has actually reached the server since this broadcast went on air.
   * Everything before the first handshake is excluded — see `countersArmed`.
   */
  getTransportStats(): TransportStats {
    // Include the run still open right now, so a live dropout is visible as it
    // happens rather than only once frames start flowing again.
    const openRun = this.dropRunStart === 0 ? 0 : Date.now() - this.dropRunStart
    const backlogMs = this.ws?.readyState === WebSocket.OPEN ? this.backlogMs() : 0
    return {
      bytesSent: this.bytesSent,
      chunksSent: this.chunksSent,
      chunksDropped: this.chunksDropped,
      droppedMs: this.droppedMs + openRun,
      lastDropAt: this.lastDropAt,
      connected: this.ws?.readyState === WebSocket.OPEN,
      bitrate: this.bitrate,
      backlogMs,
      congested: backlogMs >= CONGESTED_BACKLOG_MS,
    }
  }

  getEngine(): AudioEngine | null {
    return this.engine
  }

  getMicStream(): MediaStream | null {
    return this.micStream
  }

  /**
   * The mic chosen last time, or the default when there is none or it can't
   * be opened (unplugged, renamed after a reboot): a remembered mic that has
   * gone must never be what stops a show going live. A refused permission is
   * not that case and still fails the step.
   */
  private async openSavedMic(): Promise<MediaStream> {
    const saved = savedMicDeviceId()
    if (saved) {
      try {
        return await openMic(saved)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'NotAllowedError') throw err
      }
    }
    return openMic()
  }

  /**
   * Swap to another microphone before going on air, and remember it for the
   * next show. Only at `ready`: mid-show the swap would cut the audio.
   * Throws if the device can't be opened, leaving the current mic in place.
   */
  async switchMic(deviceId: string): Promise<MediaStream> {
    if (!this.engine || !this.micStream || this.ws) throw new Error('Not ready to change microphone')
    const next = await openMic(deviceId)
    this.engine.setMicStream(next)
    this.micStream.getTracks().forEach((t) => t.stop())
    this.micStream = next
    rememberMicDevice(deviceId)
    return next
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
    this.checksRun++
    this.wakeFromBackoff?.()
    this.reconnecting = false
    this.established = false
    this.unwatchVisibility()
    this.unwatchFrames()

    // Flush lamejs before closing: the final partial MP3 frame is still inside
    // the encoder, and dropping it truncates the last fraction of a second.
    if (this.ws?.readyState === WebSocket.OPEN) {
      try { await this.engine?.flushEncoder() } catch { /* worker already gone */ }
    }

    // The browser reports this close as 1006, wasClean=false, every time:
    // harbor answers a close frame by dropping the TCP connection without
    // sending one back (checked on the raw socket, 2026-10-04). Harmless:
    // this.ws is already let go below and `stopping` is set, so watchForDrop
    // ignores it and nothing is reported or reconnected.
    try { this.ws?.close(1000, 'broadcast ended') } catch { /* already closing */ }
    this.ws = null
    // Guarded like fail(): a rebuild or a cancelled goLive can be mid-destroy
    // already, and Chrome rejects a second close on a closing AudioContext.
    // Throwing here would skip `idle`, and BroadcastContext would keep a
    // manager it believes is still running.
    try { await this.engine?.destroy() } catch { /* already torn down */ }
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.micStream = null
    this.engine = null
    this.lastMetadata = null
    this.sentMetadataKey = null
    this.releaseWakeLock()
    this.callbacks.onStateChange('idle')
  }

  private acquireWakeLock() {
    this.wantWakeLock = true
    void this.requestWakeLock()
  }

  private async requestWakeLock() {
    if (!('wakeLock' in navigator) || this.wakeLock || this.wakeLockRequesting) return
    if (document.visibilityState !== 'visible') return // rejected while hidden
    this.wakeLockRequesting = true
    try {
      const lock = await navigator.wakeLock.request('screen')
      // The broadcast may have ended while the request was pending.
      if (!this.wantWakeLock) {
        void lock.release()
        return
      }
      this.wakeLock = lock
      lock.addEventListener('release', () => {
        if (this.wakeLock === lock) this.wakeLock = null
      })
    } catch { /* unsupported, or denied (e.g. battery saver) */ } finally {
      this.wakeLockRequesting = false
    }
  }

  private releaseWakeLock() {
    this.wantWakeLock = false
    void this.wakeLock?.release()
    this.wakeLock = null
  }

  private async fail(err: unknown) {
    // A failed re-check is shown: the list below says which step it was.
    this.quietSteps = false
    // Failing ends the show as surely as stop() does, and anything still in
    // flight (a reconnect attempt, an engine rebuild) checks this flag to
    // know it must not bring the broadcast back. start() clears it.
    this.stopping = true
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
    this.unwatchFrames()

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
