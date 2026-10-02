import * as Sentry from '@sentry/nextjs'
import { saveQueue, loadQueue, clearQueue as clearStoredQueue, savePlayback, loadPlayback, isReadable } from './queueStore'
import { DUCK_GAIN, FADE_TIME_CONSTANT, loadMicPrefs, saveMicPrefs, type MicPrefs } from './micPrefs'

export interface QueueTrack {
  id: string
  file: File
  title: string
  artist: string
  duration: number
}

/**
 * Why tracks were taken out of the queue without the broadcaster asking.
 *
 * - `unplayable`: the audio element failed on it while loading or playing —
 *   a format the browser can't decode, or a file it can no longer read.
 * - `unreadable`: the file behind it was already gone when it was added or
 *   when the queue came back after a reload (an Android picker copy that was
 *   cleaned up, storage the browser evicted).
 *
 * Either way it could never play, and leaving it in stalled the queue: a
 * track that never starts never fires `ended`, so nothing moved on.
 */
export type TrackDropReason = 'unplayable' | 'unreadable'
export interface TrackDrop {
  reason: TrackDropReason
  titles: string[]
}

/** Longest the restore waits on its readability check before going live anyway. */
const READABLE_CHECK_TIMEOUT_MS = 3000

const MIC_BOOST = 3

/**
 * Capture/encode rate. Pinned rather than taking the device default because
 * lamejs is constructed once for a fixed rate — a mismatch writes MP3 headers
 * that disagree with the samples and plays back at the wrong pitch.
 */
const SAMPLE_RATE = 44100

/**
 * Ingest bitrate, stereo. Liquidsoap re-encodes to the station's Icecast
 * output (%mp3 128k today), so this only needs enough headroom that the
 * transcode isn't the weak link — 192 is comfortably above it without
 * wasting the broadcaster's upstream.
 */
const MP3_BITRATE = 192

/**
 * Client-side cap on total queued audio bytes. The browser will already
 * enforce its own IndexedDB quota, but that fails opaquely with
 * QuotaExceededError. A friendly upfront limit lets us reject adds
 * predictably and surface usage in the UI.
 */
export const QUEUE_BYTE_LIMIT = 2 * 1024 * 1024 * 1024

/**
 * Fail early, and legibly, when the page can't broadcast at all.
 *
 * `AudioWorklet` and `navigator.mediaDevices` are both gated on a secure
 * context. Over plain http on a LAN address — a tablet pointed at a dev
 * laptop, say — they are not merely blocked but *absent*, so the first thing
 * that happens is `ctx.audioWorklet` reading as undefined and the whole
 * broadcast dying with "Cannot read properties of undefined (reading
 * 'addModule')", which says nothing about the real problem.
 *
 * localhost counts as secure, so this never fires for laptop development. The
 * ways out are an https origin, a port forward that makes the device see
 * localhost, or the browser's insecure-origin allowlist.
 */
export function assertBroadcastSupported(options?: { skipMic?: boolean }): void {
  if (typeof window === "undefined") return

  if (!window.isSecureContext) {
    throw new Error(
      `Broadcasting needs https:// or localhost — this page is on ${window.location.origin}`,
    )
  }

  if (!options?.skipMic && !navigator.mediaDevices) {
    throw new Error("This browser doesn't support microphone capture")
  }
}

/**
 * What happens when a track reaches its end on its own.
 *
 * There is no "off". Running off the end of the queue puts dead air on air,
 * and a live station has no mode in which that is what the broadcaster
 * wanted — so the queue always continues. The only real choice is whether it
 * continues to the *next* track or repeats the current one, which is how a
 * broadcaster holds a bed under a long talk break.
 *
 * Note this governs auto-advance only. An explicit `next()`/`prev()` always
 * moves: a skip is a skip, never a re-cue.
 */
export type RepeatMode = 'all' | 'one'

/**
 * Default monitor level. Speakers-only, never the stream — the monitor bus
 * hangs off `fileGain` and is deliberately not part of the encode path.
 */
const MONITOR_DEFAULT_VOLUME = 0.62

export interface AddFilesResult {
  added: number
  skipped: File[]
  /** True when at least one file was skipped because adding it would exceed the cap. */
  overLimit: boolean
}

/** Read a file's duration from its container header without decoding PCM. Cheap. */
/**
 * A metadata read that never answers is not hypothetical: Chrome defers media
 * loading in a background tab, so `loadedmetadata` simply does not fire until
 * the tab is shown again. Anything awaiting this on the way to going live
 * hung on "Setting up audio engine" for as long as the broadcaster was in
 * another tab. After this long we give up and report 0 — the play path reads
 * the real duration off the element when the track actually starts.
 */
const METADATA_TIMEOUT_MS = 4000

/** Resolves at once if the tab is showing, otherwise when it is next shown. */
function whenTabVisible(): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') return Promise.resolve()
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.visibilityState !== 'visible') return
      document.removeEventListener('visibilitychange', onChange)
      resolve()
    }
    document.addEventListener('visibilitychange', onChange)
  })
}

function readDurationFromFile(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    const timer = setTimeout(() => {
      cleanup()
      resolve(0)
    }, METADATA_TIMEOUT_MS)
    const cleanup = () => {
      clearTimeout(timer)
      audio.removeEventListener('loadedmetadata', onLoad)
      audio.removeEventListener('error', onError)
      URL.revokeObjectURL(url)
    }
    const onLoad = () => {
      const d = Number.isFinite(audio.duration) ? audio.duration : 0
      cleanup()
      resolve(d)
    }
    const onError = () => {
      cleanup()
      reject(new Error(`Failed to read metadata for ${file.name}`))
    }
    audio.addEventListener('loadedmetadata', onLoad)
    audio.addEventListener('error', onError)
    audio.preload = 'metadata'
    audio.src = url
  })
}

/**
 * Title and artist from the file's own tags (ID3, MP4, Vorbis, FLAC), falling
 * back to the filename. Every track used to read "Unknown" under the deck and
 * went out to listeners that way. An untagged "Artist - Title.mp3" is split
 * on the dash — unless the left side is a track number ("01 - Intro"). No
 * artist is '', not a placeholder: the player already hides an empty one.
 * The parser loads on first use, so it costs nothing until files are added.
 */
async function readTagsFromFile(file: File): Promise<{ title: string; artist: string }> {
  const base = file.name.replace(/\.[^.]+$/, '')
  const dash = base.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  const fallback = dash && !/^\d+$/.test(dash[1].trim())
    ? { title: dash[2].trim(), artist: dash[1].trim() }
    : { title: base, artist: '' }
  try {
    const { parseBlob } = await import('music-metadata')
    const { common } = await parseBlob(file, { duration: false, skipCovers: true })
    const title = common.title?.trim()
    const artist = (common.artist ?? common.albumartist)?.trim()
    // A tagged title with no artist keeps the tag's title; the filename's
    // artist half belongs to the filename's title, not to this one.
    return title ? { title, artist: artist ?? '' } : { title: fallback.title, artist: artist || fallback.artist }
  } catch {
    return fallback
  }
}

/**
 * Single AudioContext mixer. Files and mic route through gain nodes into an
 * AudioWorklet that captures PCM and hands it — over a MessagePort, without
 * touching the main thread — to a Worker running lamejs. The resulting MP3
 * frames go out as binary webcast frames to Liquidsoap's harbor input.
 *
 * Chain:
 *   fileSource → fileGain ───────────────────────┐
 *                                                ├→ mixer → limiter → analyser → workletNode ──port──► Worker (lamejs)
 *   micSource ─┬→ micDry ─────────────→ micGain ─┘                                                         │
 *              └→ highpass → presence → voiceComp → micWet ─┘                                              ▼
 *                                                                                               onChunk(ArrayBuffer)
 *
 * PTT: micGain 0→MIC_BOOST, fileGain 1→the chosen duck level, at the chosen
 * fade speed. Release: reverse. See `micPrefs.ts`.
 *
 * NOTE: the mixer is *not* connected to ctx.destination — broadcasters
 * shouldn't hear their own queue out of their speakers (would feed back
 * through the mic and stack).
 */
export class AudioEngine {
  private ctx: AudioContext
  private analyser: AnalyserNode
  private fileGain: GainNode
  private micGain: GainNode
  private mixer: GainNode
  private limiter: DynamicsCompressorNode
  private micDry: GainNode
  private micWet: GainNode
  private micPrefs: MicPrefs = loadMicPrefs()
  private workletNode: AudioWorkletNode
  private encoderWorker: Worker

  /**
   * Speaker monitor. Tapped off `fileGain` — post-duck, so the broadcaster
   * hears the music drop under their own voice — and never off `micGain`.
   * Monitoring your own mic through the speakers is the one routing that
   * builds a feedback loop, and hearing yourself ~40ms late is unpleasant
   * even on headphones. Off by default.
   */
  private monitorGain: GainNode
  private monitorEnabled = false
  private monitorVolume = MONITOR_DEFAULT_VOLUME

  private micSource: MediaStreamAudioSourceNode | null = null
  private isTalking = false
  private micLatched = false
  private repeatMode: RepeatMode = 'all'

  // File playback — each track is streamed through an HTMLAudioElement so the
  // browser demuxes/decodes incrementally. This keeps memory flat regardless
  // of file size (a full decode-to-AudioBuffer would allocate ~10× the source
  // file size in PCM, which hangs the tab for anything over ~30 min).
  private currentAudio: HTMLAudioElement | null = null
  private currentMediaSource: MediaElementAudioSourceNode | null = null
  private currentObjectUrl: string | null = null
  private queue: QueueTrack[] = []
  private currentIndex = -1
  private playing = false
  /**
   * A paused position with no audio element behind it yet — see cueAt. Keyed
   * by track id so a queue edit that moves the current index can't hand the
   * offset to a different song.
   */
  private cued: { trackId: string; offset: number } | null = null
  /** Slug of the station whose queue this engine persists. */
  private readonly station: string
  private progressTimer: ReturnType<typeof setInterval> | null = null
  private pageHideHandler: (() => void) | null = null

  // Reactive state: listeners are notified on any engine state change.
  // `version` is a monotonic counter that React's `useSyncExternalStore`
  // reads as its snapshot — incrementing it guarantees a new primitive
  // value each change, so components re-render reliably even though
  // internal structures (queue array, etc.) are mutated in place.
  private listeners = new Set<() => void>()
  /** Studio subscribers to {@link onTracksDropped}. */
  private dropListeners = new Set<(drop: TrackDrop) => void>()
  /** Drops that happened before anything subscribed — the restore runs during go-live, before the studio mounts. */
  private pendingDrops: TrackDrop[] = []
  /**
   * Track ids as the last restore loaded them, before unreadable ones were
   * taken out. Saved positions are indexes into THIS list; see
   * {@link restoredIndex}.
   */
  private restoredIds: string[] = []
  /** Queue-storage failures already sent to Sentry this session, by kind. */
  private reportedStorageFailures = new Set<string>()
  private version = 0

  private constructor(
    ctx: AudioContext,
    workletNode: AudioWorkletNode,
    encoderWorker: Worker,
    micStream: MediaStream | null,
    onChunk: (data: ArrayBuffer) => void,
    station: string,
  ) {
    this.ctx = ctx
    this.station = station
    this.workletNode = workletNode
    this.encoderWorker = encoderWorker

    // A suspended context encodes silence: the worklet sees no frames, so the
    // stream stays connected and listeners hear nothing. Browsers suspend it
    // without asking (Safari after a navigation, any browser without a user
    // gesture), so the studio has to be told the moment it happens.
    this.ctx.addEventListener('statechange', () => this.notify())

    this.encoderWorker.addEventListener('message', (e: MessageEvent) => {
      if (e.data?.type === 'chunk') onChunk(e.data.data as ArrayBuffer)
    })

    this.mixer = this.ctx.createGain()
    this.mixer.gain.value = 1

    // Master limiter, the last stage before the encoder. Without it a loud
    // voice over the bed sums past full scale and the MP3 carries hard
    // clipping. Near-brickwall settings: it should do nothing at all until a
    // peak would clip. The threshold sits at −2 rather than −1 because the
    // spec'd compressor adds a little automatic makeup gain on top.
    this.limiter = this.ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -2
    this.limiter.knee.value = 0
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.001
    this.limiter.release.value = 0.1
    this.mixer.connect(this.limiter)

    this.fileGain = this.ctx.createGain()
    this.fileGain.gain.value = 1
    this.fileGain.connect(this.mixer)

    // Mic gain (default 0 — silent until PTT)
    this.micGain = this.ctx.createGain()
    this.micGain.gain.value = 0
    this.micGain.connect(this.mixer)

    // "Broadcast voice": two parallel mic paths into micGain, one raw and one
    // processed, crossfaded by the toggle. Switching a gain is click-free;
    // rewiring a live graph is not.
    this.micDry = this.ctx.createGain()
    this.micWet = this.ctx.createGain()
    this.micDry.connect(this.micGain)
    this.micWet.connect(this.micGain)
    this.micDry.gain.value = this.micPrefs.broadcastVoice ? 0 : 1
    this.micWet.gain.value = this.micPrefs.broadcastVoice ? 1 : 0

    if (micStream) {
      this.micSource = this.ctx.createMediaStreamSource(micStream)
      this.micSource.connect(this.micDry)

      // Desk thumps, handling noise and room rumble live below ~80Hz; a voice
      // has almost nothing there.
      const highpass = this.ctx.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = 80
      highpass.Q.value = 0.707

      // A small lift where consonants live, so words cut through the bed.
      const presence = this.ctx.createBiquadFilter()
      presence.type = 'peaking'
      presence.frequency.value = 3000
      presence.Q.value = 1
      presence.gain.value = 3

      // Gentle levelling: brings loud and quiet words closer together.
      const comp = this.ctx.createDynamicsCompressor()
      comp.threshold.value = -20
      comp.knee.value = 6
      comp.ratio.value = 3
      comp.attack.value = 0.005
      comp.release.value = 0.15

      this.micSource.connect(highpass)
      highpass.connect(presence)
      presence.connect(comp)
      comp.connect(this.micWet)
    }

    // Speaker monitor tap. Parallel to the mixer, so nothing here reaches
    // the encoder — what the broadcaster hears cannot change what goes out.
    this.monitorGain = this.ctx.createGain()
    this.monitorGain.gain.value = 0
    this.fileGain.connect(this.monitorGain)
    this.monitorGain.connect(this.ctx.destination)

    // Analyser for level metering
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.limiter.connect(this.analyser)

    // Capture tap. The worklet only reads frames — it produces no output — so
    // nothing downstream of here is audible, which is what we want.
    this.analyser.connect(this.workletNode)

    // Save playback progress every 5 seconds, and once more as the page goes
    // away — without the last save, a refresh replays up to 5s of the track
    // when the broadcaster goes live again.
    this.progressTimer = setInterval(() => this.saveProgress(), 5000)
    this.pageHideHandler = () => this.saveProgress()
    window.addEventListener('pagehide', this.pageHideHandler)
  }

  private saveProgress() {
    if (this.playing && this.currentIndex >= 0 && this.currentAudio) {
      this.savePosition(this.currentIndex, this.currentAudio.currentTime)
    }
  }

  private savePosition(currentIndex: number, offset: number) {
    savePlayback(this.station, { currentIndex, offset }).catch((err) => this.reportStorageFailure('playback', err))
  }

  /**
   * Losing the saved queue costs the broadcaster their running order after a
   * reload, but it must never break the show — so storage failures are caught
   * here, logged, and sent to Sentry once per kind per session rather than on
   * every edit.
   */
  private reportStorageFailure(kind: string, err: unknown) {
    console.error(`[AudioEngine] queue storage (${kind}) failed:`, err)
    if (this.reportedStorageFailures.has(kind)) return
    this.reportedStorageFailures.add(kind)
    Sentry.captureException(err instanceof Error ? err : new Error(`Queue storage (${kind}) failed: ${String(err)}`), {
      tags: { queue_storage: kind },
    })
  }

  /**
   * Factory that creates an AudioEngine with a running AudioContext, PCM
   * capture worklet, and encoder Worker. Establishes a MessageChannel so the
   * worklet forwards PCM straight to the worker without bouncing through the
   * main thread.
   *
   * The context is pinned to SAMPLE_RATE: lamejs is constructed for one rate,
   * and letting the context pick the device default (often 48kHz) would emit
   * MP3 frames whose header disagrees with the actual audio, which Liquidsoap
   * decodes as the wrong pitch.
   *
   * @param station Slug of the station this show is for. The saved queue and
   *   playback position are kept per station, so two stations run from one
   *   browser no longer share a running order.
   * @param signal Aborts a build that is taking too long. A browser that has
   *   just killed one engine can hang building the next, and the context made
   *   here has to be closed by someone; on abort or any failure part-way,
   *   this closes it and the worker itself.
   */
  static async create(
    micStream: MediaStream | null,
    onChunk: (data: ArrayBuffer) => void,
    station: string,
    signal?: AbortSignal,
  ): Promise<AudioEngine> {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctor({ sampleRate: SAMPLE_RATE })
    let worker: Worker | null = null

    // Each await races the abort, so a step that never settles can't keep
    // this context alive.
    const unlessAborted = <T,>(step: Promise<T>): Promise<T> => {
      if (!signal) return step
      return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(new Error('Audio engine build was aborted'))
        if (signal.aborted) return onAbort()
        signal.addEventListener('abort', onAbort, { once: true })
        step.then(
          (value) => { signal.removeEventListener('abort', onAbort); resolve(value) },
          (err) => { signal.removeEventListener('abort', onAbort); reject(err) },
        )
      })
    }

    try {
      await unlessAborted(ctx.audioWorklet.addModule('/pcm-worklet.js'))
      const workletNode = new AudioWorkletNode(ctx, 'pcm-processor')

      const encoder = new Worker('/encoder-worker.js')
      worker = encoder
      const ready = new Promise<void>((resolve, reject) => {
        const onReady = (e: MessageEvent) => {
          if (e.data?.type === 'ready') {
            encoder.removeEventListener('message', onReady)
            encoder.removeEventListener('error', onError)
            resolve()
          }
        }
        const onError = (e: ErrorEvent) => {
          encoder.removeEventListener('message', onReady)
          encoder.removeEventListener('error', onError)
          reject(new Error(`Encoder worker failed to load: ${e.message}`))
        }
        encoder.addEventListener('message', onReady)
        encoder.addEventListener('error', onError)
      })

      const channel = new MessageChannel()
      workletNode.port.postMessage({ type: 'init', port: channel.port1 }, [channel.port1])
      encoder.postMessage(
        { type: 'init', sampleRate: SAMPLE_RATE, bitrate: MP3_BITRATE, port: channel.port2 },
        [channel.port2],
      )
      await unlessAborted(ready)

      return new AudioEngine(ctx, workletNode, encoder, micStream, onChunk, station)
    } catch (err) {
      worker?.terminate()
      if (ctx.state !== 'closed') void ctx.close().catch(() => {})
      throw err
    }
  }

  /**
   * Encoder settings, for the webcast hello frame — harbor is told what it is
   * about to receive rather than having to sniff it.
   */
  static encoderInfo(): { channels: number; samplerate: number; bitrate: number; encoder: string } {
    return { channels: 2, samplerate: SAMPLE_RATE, bitrate: MP3_BITRATE, encoder: 'libmp3lame' }
  }

  /**
   * Flush any samples still buffered inside lamejs. Called on stop so the
   * final partial MP3 frame reaches the server instead of being dropped.
   */
  flushEncoder(): Promise<void> {
    return new Promise((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'flushed') {
          this.encoderWorker.removeEventListener('message', handler)
          resolve()
        }
      }
      this.encoderWorker.addEventListener('message', handler)
      this.encoderWorker.postMessage({ type: 'flush' })
      // Never let teardown hang on a wedged worker.
      setTimeout(resolve, 1000)
    })
  }

  // ── PTT ──

  /** Activate push-to-talk: open the mic and duck the music to the chosen level. */
  pttDown() {
    if (this.isTalking) return
    this.isTalking = true
    this.applyFileGain()
    this.micGain.gain.setTargetAtTime(MIC_BOOST, this.ctx.currentTime, 0.02)
    this.notify()
  }

  /**
   * Release push-to-talk: mute the mic and bring the music back to full.
   *
   * A no-op while the mic is latched — that is the whole point of latching,
   * and it keeps a stray keyup or a mouse leaving the button from cutting
   * the broadcaster off mid-sentence.
   */
  pttUp() {
    if (this.micLatched) return
    if (!this.isTalking) return
    this.isTalking = false
    this.applyFileGain()
    this.micGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02)
    this.notify()
  }

  /**
   * Move the music to where the mic state says it should be. Only the music
   * follows the fade speed — the mic itself always opens and closes fast, so
   * a slow fade never swallows the first word or leaves a breath on air.
   */
  private applyFileGain() {
    const target = this.isTalking ? DUCK_GAIN[this.micPrefs.duck] : 1
    const param = this.fileGain.gain
    const now = this.ctx.currentTime
    // Re-anchor from the current value so a press mid-fade continues from
    // where the music actually is instead of jumping.
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)
    param.setTargetAtTime(target, now, FADE_TIME_CONSTANT[this.micPrefs.fade])
  }

  // ── Mic settings ──

  getMicPrefs(): MicPrefs { return this.micPrefs }

  /** Takes effect at once, even mid-talk, and is remembered in this browser. */
  setMicPrefs(patch: Partial<MicPrefs>) {
    const next = { ...this.micPrefs, ...patch }
    if (
      next.duck === this.micPrefs.duck &&
      next.fade === this.micPrefs.fade &&
      next.broadcastVoice === this.micPrefs.broadcastVoice
    ) return
    const voiceChanged = next.broadcastVoice !== this.micPrefs.broadcastVoice
    this.micPrefs = next
    saveMicPrefs(next)
    if (this.isTalking) this.applyFileGain()
    if (voiceChanged) {
      const now = this.ctx.currentTime
      this.micWet.gain.setTargetAtTime(next.broadcastVoice ? 1 : 0, now, 0.02)
      this.micDry.gain.setTargetAtTime(next.broadcastVoice ? 0 : 1, now, 0.02)
    }
    this.notify()
  }

  isMicActive(): boolean {
    return this.isTalking
  }

  getAnalyser(): AnalyserNode {
    return this.analyser
  }

  // ── Mic latch ──

  isMicLatched(): boolean { return this.micLatched }

  /**
   * Hold the mic open hands-free. Latching on opens it immediately; latching
   * off closes it, so the toggle never leaves the broadcaster live by accident
   * after they think they have turned it off.
   */
  setMicLatched(latched: boolean) {
    if (this.micLatched === latched) return
    this.micLatched = latched
    if (latched) {
      this.pttDown()
    } else {
      // Clear the flag first — pttUp() short-circuits while latched.
      this.pttUp()
    }
    this.notify()
  }

  // ── Monitor ──

  isMonitorEnabled(): boolean { return this.monitorEnabled }
  getMonitorVolume(): number { return this.monitorVolume }

  /** Route the file bus to the speakers. Never affects the encoded stream. */
  setMonitorEnabled(enabled: boolean) {
    if (this.monitorEnabled === enabled) return
    this.monitorEnabled = enabled
    this.applyMonitorGain()
    this.notify()
  }

  /** @param volume 0–1. Remembered while the monitor is off. */
  setMonitorVolume(volume: number) {
    const clamped = Math.min(1, Math.max(0, volume))
    if (this.monitorVolume === clamped) return
    this.monitorVolume = clamped
    this.applyMonitorGain()
    this.notify()
  }

  /** Ramped rather than stepped — a hard gain jump on a live bus clicks. */
  private applyMonitorGain() {
    const target = this.monitorEnabled ? this.monitorVolume : 0
    this.monitorGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03)
  }

  // ── Repeat ──

  getRepeatMode(): RepeatMode { return this.repeatMode }

  setRepeatMode(mode: RepeatMode) {
    if (this.repeatMode === mode) return
    this.repeatMode = mode
    this.notify()
  }

  /** Cycle all → one → all. Bound to `R` in the studio. */
  cycleRepeat(): RepeatMode {
    this.setRepeatMode(this.repeatMode === 'all' ? 'one' : 'all')
    return this.repeatMode
  }

  // ── Queue management ──

  getQueue(): QueueTrack[] { return this.queue }
  getQueueBytes(): number { return this.queue.reduce((sum, t) => sum + t.file.size, 0) }
  getCurrentIndex(): number { return this.currentIndex }
  isPlaying(): boolean { return this.playing }

  // ── Reactive subscription ──

  /** Bound for referential stability — safe to pass directly to useSyncExternalStore. */
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  /** Bound for referential stability. Increments on every state change. */
  getVersion = (): number => this.version

  private notify() {
    this.version++
    this.listeners.forEach((fn) => {
      try { fn() } catch (err) { console.error('[AudioEngine] listener threw:', err) }
    })
  }

  getCurrentTrack(): QueueTrack | null {
    return this.queue[this.currentIndex] ?? null
  }

  private persistQueue() {
    saveQueue(this.station, this.queue.map((t) => ({ id: t.id, file: t.file, title: t.title, artist: t.artist })))
      .then(({ unreadable, unsaved }) => {
        if (unsaved.length > 0) {
          this.reportStorageFailure('track', new Error(`${unsaved.length} track(s) could not be stored`))
        }
        if (unreadable.length > 0) this.dropTracks(new Set(unreadable), 'unreadable', this.playing)
      })
      .catch((err) => this.reportStorageFailure('queue', err))
  }

  /**
   * Hear about tracks the engine took out of the queue itself, to tell the
   * broadcaster. Drops from before the first subscriber are delivered on
   * subscribe. Returns the unsubscribe.
   */
  onTracksDropped(fn: (drop: TrackDrop) => void): () => void {
    this.dropListeners.add(fn)
    const pending = this.pendingDrops
    this.pendingDrops = []
    pending.forEach((drop) => fn(drop))
    return () => this.dropListeners.delete(fn)
  }

  /**
   * Take tracks that can never play out of the queue, and keep the show going.
   *
   * If the track at the playhead is among them, the next one that survives
   * takes its place — played when `play` is true, otherwise just cued — with
   * the queue's usual wrap at the end. Each call shrinks the queue, so a queue
   * of nothing but dead files ends empty and quiet rather than looping.
   */
  private dropTracks(ids: Set<string>, reason: TrackDropReason, play: boolean) {
    const dropped = this.queue.filter((t) => ids.has(t.id))
    if (dropped.length === 0) return

    const current = this.queue[this.currentIndex] ?? null
    const currentDropped = current !== null && ids.has(current.id)
    // Survivors before the playhead = where the next survivor lands.
    const nextIndex = this.queue.slice(0, Math.max(0, this.currentIndex)).filter((t) => !ids.has(t.id)).length

    if (currentDropped) this.stopCurrent()
    this.queue = this.queue.filter((t) => !ids.has(t.id))
    this.persistQueue()

    this.announceDrop({ reason, titles: dropped.map((t) => t.title) })

    if (!currentDropped) {
      this.currentIndex = current ? this.queue.indexOf(current) : -1
      this.notify()
      return
    }
    this.cued = null
    if (this.queue.length === 0) {
      this.currentIndex = -1
      this.playing = false
      this.notify()
      return
    }
    const index = nextIndex < this.queue.length ? nextIndex : 0
    if (play) {
      void this.playIndex(index)
    } else {
      this.currentIndex = index
      this.playing = false
      this.notify()
    }
  }

  private announceDrop(drop: TrackDrop) {
    if (this.dropListeners.size === 0) {
      this.pendingDrops.push(drop)
      return
    }
    this.dropListeners.forEach((fn) => {
      try { fn(drop) } catch (err) { console.error('[AudioEngine] drop listener threw:', err) }
    })
  }

  /**
   * Where a position saved against the queue as it was stored now points,
   * after the restore took unreadable tracks out. The same song when it
   * survived; otherwise the next one that did, from its start.
   *
   * Both callers hold an index into the stored order: the saved playback
   * position, and the song a rebuilt engine carries over.
   */
  restoredIndex(savedIndex: number): { index: number; sameTrack: boolean } {
    const ids = this.restoredIds.length > 0 ? this.restoredIds : this.queue.map((t) => t.id)
    for (let i = savedIndex; i < ids.length; i++) {
      const index = this.queue.findIndex((t) => t.id === ids[i])
      if (index !== -1) return { index, sameTrack: i === savedIndex }
    }
    // Nothing after it survived: the queue wraps, like next().
    return { index: this.queue.length > 0 ? 0 : -1, sameTrack: false }
  }

  /**
   * Reload queue metadata from IndexedDB. Does NOT resume playback — callers
   * must invoke {@link resumePlayback} once the webcast socket is live,
   * otherwise the first seconds of audio leave the mixer before anything is
   * encoding and shipping them.
   */
  async restoreQueue(): Promise<void> {
    // Going live waits on this. Storage that won't open costs the saved
    // running order, not the show.
    const stored = await loadQueue(this.station).catch((err) => {
      this.reportStorageFailure('load', err)
      return []
    })
    if (stored.length === 0) return
    this.restoredIds = stored.map((track) => track.id)

    // Files the browser lost since they were saved come out before the queue
    // is shown, so nothing can try to play them. A one-byte read each, in
    // parallel, with a cap: this is on the way to going live, and a check
    // that hangs must not hold the show — an unchecked file still gets caught
    // when it fails to play.
    const readable = await Promise.race([
      Promise.all(stored.map((track) => isReadable(track.file))),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), READABLE_CHECK_TIMEOUT_MS)),
    ])
    const dead = readable ? stored.filter((_, i) => !readable[i]) : []

    // The queue is back at once; durations fill in behind it. Awaiting each
    // one here put every restored file's metadata read on the critical path
    // to going live — see METADATA_TIMEOUT_MS for why that could be forever.
    const restored = stored.filter((track) => !dead.includes(track)).map((track) => ({
      id: track.id,
      file: track.file,
      title: track.title,
      artist: track.artist,
      duration: 0,
    }))
    this.queue.push(...restored)
    if (dead.length > 0) {
      this.persistQueue()
      this.announceDrop({ reason: 'unreadable', titles: dead.map((track) => track.title) })
    }
    this.notify()
    void this.fillDurations(restored)
    // Queues saved before tags were read carry the old 'Unknown' placeholder
    // and a filename title; read them properly once, behind the restore.
    void this.fillTags(restored.filter((track) => track.artist === 'Unknown'))
  }

  private async fillTags(tracks: QueueTrack[]): Promise<void> {
    if (tracks.length === 0) return
    for (const track of tracks) {
      const tags = await readTagsFromFile(track.file)
      track.title = tags.title
      track.artist = tags.artist
    }
    this.persistQueue()
    this.notify()
  }

  /**
   * Read durations for tracks that came back without one, in the background.
   *
   * One notify per pass, not per track: every notify re-renders the studio and
   * used to send harbor a metadata frame. A read that timed out because the
   * tab was hidden (see METADATA_TIMEOUT_MS) is tried once more when the tab
   * is shown — otherwise the running order's air times and totals stayed
   * wrong until each track actually played.
   */
  private async fillDurations(tracks: QueueTrack[]): Promise<void> {
    let pending = tracks
    for (let pass = 0; pass < 2 && pending.length > 0; pass++) {
      if (pass > 0) await whenTabVisible()
      let changed = false
      for (const track of pending) {
        if (track.duration || !this.queue.includes(track)) continue
        const duration = await readDurationFromFile(track.file).catch(() => 0)
        if (duration > 0 && !track.duration) {
          track.duration = duration
          changed = true
        }
      }
      if (changed) this.notify()
      pending = pending.filter((t) => !t.duration && this.queue.includes(t))
    }
  }

  /**
   * Resume playback at the saved position, if any. Pairs with
   * {@link restoreQueue}; call only after the webcast socket is live.
   *
   * @param fromStart Cue the same song but from 0:00 — the broadcaster's
   *   choice on the Go Live page, for a show that shouldn't open mid-song.
   */
  async resumePlayback(options?: { fromStart?: boolean }): Promise<void> {
    const playback = await loadPlayback(this.station)
    if (!playback || playback.currentIndex < 0) return
    // The saved index is into the queue as stored; the restore may have taken
    // unreadable tracks out since. A song that went with them resumes on the
    // next one, from its start.
    const { index, sameTrack } = this.restoredIndex(playback.currentIndex)
    if (index < 0) return
    // No clamp against track.duration here: restoreQueue fills durations in
    // behind the queue, so it is usually still 0 at this point and would send
    // every resume back to 0:00. playIndexAtOffset clamps to the real length.
    const offset = options?.fromStart || !sameTrack ? 0 : Math.max(0, playback.offset)
    if (offset > 0) {
      await this.playIndexAtOffset(index, offset)
    } else {
      await this.playIndex(index)
    }
  }

  /**
   * Append audio files to the queue, stopping once the cumulative size would
   * exceed {@link QUEUE_BYTE_LIMIT}. Reads duration metadata only — the
   * actual audio data is streamed from the File on demand at play time.
   */
  async addFiles(files: FileList | File[]): Promise<AddFilesResult> {
    const skipped: File[] = []
    let added = 0
    let currentBytes = this.getQueueBytes()

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('audio/')) continue
      if (currentBytes + file.size > QUEUE_BYTE_LIMIT) {
        skipped.push(file)
        continue
      }
      const [duration, tags] = await Promise.all([
        readDurationFromFile(file).catch(() => 0),
        readTagsFromFile(file),
      ])
      this.queue.push({
        id: crypto.randomUUID(),
        file,
        title: tags.title,
        artist: tags.artist,
        duration,
      })
      currentBytes += file.size
      added++
    }
    if (added > 0) {
      this.persistQueue()
      this.notify()
      if (!this.playing && this.queue.length > 0 && this.currentIndex === -1) {
        await this.playIndex(0)
      }
    }
    return { added, skipped, overLimit: skipped.length > 0 }
  }

  removeTrack(id: string) {
    const idx = this.queue.findIndex((t) => t.id === id)
    if (idx === -1) return
    if (idx === this.currentIndex) {
      this.stopCurrent()
      this.queue.splice(idx, 1)
      if (this.queue.length > 0) {
        this.playIndex(Math.min(idx, this.queue.length - 1))
      } else {
        this.currentIndex = -1
        this.playing = false
      }
    } else {
      this.queue.splice(idx, 1)
      if (idx < this.currentIndex) this.currentIndex--
    }
    this.persistQueue()
    this.notify()
  }

  moveTrack(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    if (fromIndex < 0 || fromIndex >= this.queue.length) return
    if (toIndex < 0 || toIndex >= this.queue.length) return

    const [moved] = this.queue.splice(fromIndex, 1)
    this.queue.splice(toIndex, 0, moved)

    // Update currentIndex to follow the playing track
    if (this.currentIndex === fromIndex) {
      this.currentIndex = toIndex
    } else if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) {
      this.currentIndex--
    } else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) {
      this.currentIndex++
    }

    this.persistQueue()
    this.notify()
  }

  /**
   * Remove every track except the one on air, and return what was removed.
   *
   * The studio's "Clear" used to be {@link clearQueue}, which also stops the
   * track playing — one click put dead air on a live station. Clearing what
   * is UP NEXT is what the button was for; the track on air is left alone.
   */
  clearUpcoming(): QueueTrack[] {
    const current = this.queue[this.currentIndex] ?? null
    const removed = this.queue.filter((t) => t !== current)
    if (removed.length === 0) return []
    this.queue = current ? [current] : []
    this.currentIndex = current ? 0 : -1
    this.persistQueue()
    this.notify()
    return removed
  }

  /**
   * Put tracks back after an undo, in the order given by `order` (the queue's
   * track ids as they stood before the removal). Tracks already in the queue
   * are not duplicated; ids the order doesn't know go to the end.
   */
  restoreTracks(tracks: QueueTrack[], order: string[]) {
    const present = new Set(this.queue.map((t) => t.id))
    const incoming = tracks.filter((t) => !present.has(t.id))
    if (incoming.length === 0) return
    const current = this.queue[this.currentIndex] ?? null
    const rank = new Map(order.map((id, i) => [id, i]))
    const merged = [...this.queue, ...incoming]
    merged.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))
    this.queue = merged
    this.currentIndex = current ? this.queue.indexOf(current) : -1
    this.persistQueue()
    this.notify()
  }

  /**
   * True while the browser holds the audio context stopped — see the
   * constructor. `interrupted` is the newer state a browser uses when the OS
   * takes the audio away (a call, another app grabbing audio focus); it isn't
   * in the DOM typings yet, hence the string compare.
   */
  isSuspended(): boolean {
    const state: string = this.ctx.state
    return state === 'suspended' || state === 'interrupted'
  }

  /** The AudioContext's state, for the studio's drop reports. */
  getContextState(): string {
    return this.ctx.state
  }

  clearQueue() {
    this.stopCurrent()
    this.queue = []
    this.currentIndex = -1
    this.playing = false
    clearStoredQueue(this.station).catch((err) => this.reportStorageFailure('clear', err))
    this.notify()
  }

  // ── Playback ──

  async play() {
    if (this.queue.length === 0) return
    await this.resume()
    if (this.currentIndex === -1) {
      await this.playIndex(0)
    } else if (!this.playing) {
      if (this.currentAudio) {
        try {
          await this.currentAudio.play()
          this.playing = true
          this.notify()
        } catch (err) {
          console.error('[AudioEngine] play() rejected:', err)
        }
      } else {
        const track = this.queue[this.currentIndex]
        const offset = track && this.cued?.trackId === track.id ? this.cued.offset : 0
        await this.playIndexAtOffset(this.currentIndex, offset)
      }
    }
  }

  /**
   * Put the queue at a song and position, playing or not. Used when the
   * broadcast manager replaces a dead engine mid-show (rebuildEngine), so a
   * song that was playing carries on and a paused one is still cued at the
   * same second for the next Play, rather than the queue starting over.
   *
   * Cueing paused creates no audio element: nothing reaches the mix until
   * Play, which picks the offset up from `cued`.
   */
  async cueAt(index: number, offset: number, play: boolean): Promise<void> {
    if (index < 0 || index >= this.queue.length) return
    if (play) {
      await this.playIndexAtOffset(index, offset)
      return
    }
    this.stopCurrent()
    this.currentIndex = index
    this.playing = false
    this.cued = { trackId: this.queue[index].id, offset: Math.max(0, offset) }
    this.notify()
  }

  pause() {
    if (!this.playing) return
    this.currentAudio?.pause()
    this.playing = false
    this.notify()
  }

  togglePlay() {
    if (this.playing) {
      this.pause()
    } else {
      void this.play()
    }
  }

  /**
   * Advance to the next track, wrapping at the end of the queue.
   *
   * The queue always wraps. This is a live station: running off the end of
   * the queue puts dead air on air, and there is no mode in which that is
   * what the broadcaster wanted.
   */
  async next() {
    if (this.queue.length === 0) return
    const nextIdx = this.currentIndex + 1
    await this.playIndex(nextIdx < this.queue.length ? nextIdx : 0)
  }

  /** Step back one track, wrapping to the end of the queue. */
  async prev() {
    if (this.queue.length === 0) return
    const prevIdx = this.currentIndex - 1
    await this.playIndex(prevIdx >= 0 ? prevIdx : this.queue.length - 1)
  }

  getElapsed(): number {
    if (this.currentIndex < 0) return 0
    if (!this.currentAudio) {
      return this.cued?.trackId === this.queue[this.currentIndex]?.id ? this.cued.offset : 0
    }
    return this.currentAudio.currentTime
  }

  private async playIndex(index: number) {
    await this.playIndexAtOffset(index, 0)
  }

  private async playIndexAtOffset(index: number, offset: number) {
    this.stopCurrent()
    this.currentIndex = index
    this.cued = null

    const track = this.queue[index]
    if (!track) return

    // Let the UI reflect the currentIndex change while the new element loads.
    this.notify()

    const audio = new Audio()
    audio.preload = 'auto'
    const url = URL.createObjectURL(track.file)
    audio.src = url

    // Route through fileGain so PTT ducking, mixing, and the MediaStream
    // destination all continue to operate exactly as before.
    const source = this.ctx.createMediaElementSource(audio)
    source.connect(this.fileGain)

    this.currentAudio = audio
    this.currentMediaSource = source
    this.currentObjectUrl = url

    // A file the element can't load or decode — on the way in or halfway
    // through — never fires `ended`, so without this the queue just stopped
    // there. ABORTED (code 1) is not the file's fault: it is what a track
    // switch does to the element it leaves behind.
    audio.addEventListener('error', () => {
      if (this.currentAudio !== audio) return
      const code = audio.error?.code
      if (code === undefined || code === MediaError.MEDIA_ERR_ABORTED) return
      console.error('[AudioEngine] could not play', track.file.name, audio.error)
      this.dropTracks(new Set([track.id]), 'unplayable', true)
    })

    audio.addEventListener('ended', () => {
      // Ignore ended events from a superseded element (track switch in flight).
      if (this.currentAudio !== audio) return
      // Auto-advance is the only place repeat applies; an explicit skip always
      // moves. Re-cueing the same index rebuilds the element from the same
      // File, which is the identical path a 1-track queue already took when
      // next() wrapped onto itself.
      if (this.repeatMode === 'one') {
        void this.playIndex(this.currentIndex)
        return
      }
      void this.next()
    })

    // Wait for metadata so the initial seek (resume offset) lands accurately.
    await new Promise<void>((resolve) => {
      const done = () => {
        audio.removeEventListener('loadedmetadata', done)
        audio.removeEventListener('error', done)
        resolve()
      }
      audio.addEventListener('loadedmetadata', done, { once: true })
      audio.addEventListener('error', done, { once: true })
    })
    if (this.currentAudio !== audio) return

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      if (!track.duration || Math.abs(track.duration - audio.duration) > 0.5) {
        track.duration = audio.duration
      }
    }

    if (offset > 0 && Number.isFinite(audio.duration)) {
      audio.currentTime = Math.min(offset, Math.max(0, audio.duration - 0.1))
    }

    await this.resume()
    try {
      await audio.play()
    } catch (err) {
      // Only a media error takes the track out, and the `error` listener
      // above has that. A rejection on its own is the browser's autoplay
      // block or a switch to another track — dropping the track for either
      // would empty the queue on a page reload.
      console.error('[AudioEngine] play() rejected for', track.file.name, err)
      return
    }
    if (this.currentAudio !== audio) return

    this.playing = true
    this.savePosition(index, offset)
    this.notify()
  }

  private stopCurrent() {
    if (this.currentAudio) {
      this.currentAudio.pause()
      this.currentAudio.removeAttribute('src')
      try { this.currentAudio.load() } catch { /* best effort */ }
    }
    if (this.currentMediaSource) {
      try { this.currentMediaSource.disconnect() } catch { /* already disconnected */ }
    }
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl)
    }
    this.currentAudio = null
    this.currentMediaSource = null
    this.currentObjectUrl = null
  }

  /** Resume the AudioContext if the browser stopped it (see isSuspended). Safe to call repeatedly. */
  async resume(): Promise<void> {
    if (this.isSuspended()) await this.ctx.resume()
  }

  /**
   * Tear down the audio graph and close the AudioContext. The playback
   * position is saved first, so an engine rebuilt mid-show (see
   * BroadcastManager.rebuildEngine) picks the song up where this one was.
   */
  async destroy(): Promise<void> {
    this.saveProgress()
    if (this.progressTimer) clearInterval(this.progressTimer)
    if (this.pageHideHandler) window.removeEventListener('pagehide', this.pageHideHandler)
    this.stopCurrent()
    this.micSource?.disconnect()
    this.monitorGain.disconnect()
    this.analyser.disconnect()
    this.mixer.disconnect()
    this.limiter.disconnect()
    this.micDry.disconnect()
    this.micWet.disconnect()
    this.fileGain.disconnect()
    this.micGain.disconnect()
    this.workletNode.disconnect()
    this.encoderWorker.terminate()
    if (this.ctx.state !== 'closed') await this.ctx.close()
  }
}
