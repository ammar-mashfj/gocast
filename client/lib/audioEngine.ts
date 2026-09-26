import { saveQueue, loadQueue, clearQueue as clearStoredQueue, savePlayback, loadPlayback } from './queueStore'
import { DUCK_GAIN, FADE_TIME_CONSTANT, loadMicPrefs, saveMicPrefs, type MicPrefs } from './micPrefs'

export interface QueueTrack {
  id: string
  file: File
  title: string
  artist: string
  duration: number
}

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
  private progressTimer: ReturnType<typeof setInterval> | null = null
  private pageHideHandler: (() => void) | null = null

  // Reactive state: listeners are notified on any engine state change.
  // `version` is a monotonic counter that React's `useSyncExternalStore`
  // reads as its snapshot — incrementing it guarantees a new primitive
  // value each change, so components re-render reliably even though
  // internal structures (queue array, etc.) are mutated in place.
  private listeners = new Set<() => void>()
  private version = 0

  private constructor(
    ctx: AudioContext,
    workletNode: AudioWorkletNode,
    encoderWorker: Worker,
    micStream: MediaStream | null,
    onChunk: (data: ArrayBuffer) => void,
  ) {
    this.ctx = ctx
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
      savePlayback({ currentIndex: this.currentIndex, offset: this.currentAudio.currentTime })
    }
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
   */
  static async create(
    micStream: MediaStream | null,
    onChunk: (data: ArrayBuffer) => void,
  ): Promise<AudioEngine> {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctor({ sampleRate: SAMPLE_RATE })
    await ctx.audioWorklet.addModule('/pcm-worklet.js')
    const workletNode = new AudioWorkletNode(ctx, 'pcm-processor')

    const worker = new Worker('/encoder-worker.js')
    const ready = new Promise<void>((resolve, reject) => {
      const onReady = (e: MessageEvent) => {
        if (e.data?.type === 'ready') {
          worker.removeEventListener('message', onReady)
          worker.removeEventListener('error', onError)
          resolve()
        }
      }
      const onError = (e: ErrorEvent) => {
        worker.removeEventListener('message', onReady)
        worker.removeEventListener('error', onError)
        reject(new Error(`Encoder worker failed to load: ${e.message}`))
      }
      worker.addEventListener('message', onReady)
      worker.addEventListener('error', onError)
    })

    const channel = new MessageChannel()
    workletNode.port.postMessage({ type: 'init', port: channel.port1 }, [channel.port1])
    worker.postMessage(
      { type: 'init', sampleRate: SAMPLE_RATE, bitrate: MP3_BITRATE, port: channel.port2 },
      [channel.port2],
    )
    await ready

    return new AudioEngine(ctx, workletNode, worker, micStream, onChunk)
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
    saveQueue(this.queue.map((t) => ({ id: t.id, file: t.file, title: t.title, artist: t.artist })))
  }

  /**
   * Reload queue metadata from IndexedDB. Does NOT resume playback — callers
   * must invoke {@link resumePlayback} once the webcast socket is live,
   * otherwise the first seconds of audio leave the mixer before anything is
   * encoding and shipping them.
   */
  async restoreQueue(): Promise<void> {
    const stored = await loadQueue()
    if (stored.length === 0) return
    // The queue is back at once; durations fill in behind it. Awaiting each
    // one here put every restored file's metadata read on the critical path
    // to going live — see METADATA_TIMEOUT_MS for why that could be forever.
    const restored = stored.map((track) => ({
      id: track.id,
      file: track.file,
      title: track.title,
      artist: track.artist,
      duration: 0,
    }))
    this.queue.push(...restored)
    this.notify()
    void this.fillDurations(restored)
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
    const playback = await loadPlayback()
    if (!playback) return
    if (playback.currentIndex < 0 || playback.currentIndex >= this.queue.length) return
    // No clamp against track.duration here: restoreQueue fills durations in
    // behind the queue, so it is usually still 0 at this point and would send
    // every resume back to 0:00. playIndexAtOffset clamps to the real length.
    const offset = options?.fromStart ? 0 : Math.max(0, playback.offset)
    if (offset > 0) {
      await this.playIndexAtOffset(playback.currentIndex, offset)
    } else {
      await this.playIndex(playback.currentIndex)
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
      const duration = await readDurationFromFile(file).catch(() => 0)
      this.queue.push({
        id: crypto.randomUUID(),
        file,
        title: file.name.replace(/\.[^.]+$/, ''),
        artist: 'Unknown',
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

  /** True while the browser has the audio context suspended — see the constructor. */
  isSuspended(): boolean {
    return this.ctx.state === 'suspended'
  }

  clearQueue() {
    this.stopCurrent()
    this.queue = []
    this.currentIndex = -1
    this.playing = false
    clearStoredQueue()
    this.notify()
  }

  // ── Playback ──

  async play() {
    if (this.queue.length === 0) return
    if (this.ctx.state === 'suspended') await this.ctx.resume()
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
        await this.playIndex(this.currentIndex)
      }
    }
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
    if (this.currentIndex < 0 || !this.currentAudio) return 0
    return this.currentAudio.currentTime
  }

  private async playIndex(index: number) {
    await this.playIndexAtOffset(index, 0)
  }

  private async playIndexAtOffset(index: number, offset: number) {
    this.stopCurrent()
    this.currentIndex = index

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

    if (this.ctx.state === 'suspended') await this.ctx.resume()
    try {
      await audio.play()
    } catch (err) {
      console.error('[AudioEngine] play() rejected for', track.file.name, err)
      return
    }
    if (this.currentAudio !== audio) return

    this.playing = true
    savePlayback({ currentIndex: index, offset })
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

  /** Resume the AudioContext if suspended by the browser's autoplay policy. Safe to call repeatedly. */
  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  /** Tear down the audio graph and close the AudioContext. */
  async destroy(): Promise<void> {
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
