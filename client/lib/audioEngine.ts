import { saveQueue, loadQueue, clearQueue as clearStoredQueue, savePlayback, loadPlayback } from './queueStore'

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
function readDurationFromFile(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    const cleanup = () => {
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
 *   fileSource → fileGain ─┐
 *                           ├→ analyser → workletNode ──port──► Worker (lamejs)
 *   micSource  → micGain  ─┘                                        │
 *                                                                   ▼
 *                                                          onChunk(ArrayBuffer)
 *
 * PTT: micGain 0→MIC_BOOST, fileGain 1→0.2. Release: reverse.
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

    this.encoderWorker.addEventListener('message', (e: MessageEvent) => {
      if (e.data?.type === 'chunk') onChunk(e.data.data as ArrayBuffer)
    })

    this.mixer = this.ctx.createGain()
    this.mixer.gain.value = 1

    this.fileGain = this.ctx.createGain()
    this.fileGain.gain.value = 1
    this.fileGain.connect(this.mixer)

    // Mic gain (default 0 — silent until PTT)
    this.micGain = this.ctx.createGain()
    this.micGain.gain.value = 0
    this.micGain.connect(this.mixer)

    if (micStream) {
      this.micSource = this.ctx.createMediaStreamSource(micStream)
      this.micSource.connect(this.micGain)
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
    this.mixer.connect(this.analyser)

    // Capture tap. The worklet only reads frames — it produces no output — so
    // nothing downstream of here is audible, which is what we want.
    this.analyser.connect(this.workletNode)

    // Save playback progress every 5 seconds
    this.progressTimer = setInterval(() => {
      if (this.playing && this.currentIndex >= 0 && this.currentAudio) {
        savePlayback({ currentIndex: this.currentIndex, offset: this.currentAudio.currentTime })
      }
    }, 5000)
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

  /** Activate push-to-talk: boost mic gain and duck file playback to 20%. */
  pttDown() {
    if (this.isTalking) return
    this.isTalking = true
    this.fileGain.gain.setTargetAtTime(0.2, this.ctx.currentTime, 0.05)
    this.micGain.gain.setTargetAtTime(MIC_BOOST, this.ctx.currentTime, 0.02)
    this.notify()
  }

  /**
   * Release push-to-talk: mute the mic and restore file playback to 100%.
   *
   * A no-op while the mic is latched — that is the whole point of latching,
   * and it keeps a stray keyup or a mouse leaving the button from cutting
   * the broadcaster off mid-sentence.
   */
  pttUp() {
    if (this.micLatched) return
    if (!this.isTalking) return
    this.isTalking = false
    this.fileGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.05)
    this.micGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02)
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
    for (const track of stored) {
      const duration = await readDurationFromFile(track.file).catch(() => 0)
      this.queue.push({
        id: track.id,
        file: track.file,
        title: track.title,
        artist: track.artist,
        duration,
      })
    }
    this.notify()
  }

  /**
   * Resume playback at the saved position, if any. Pairs with
   * {@link restoreQueue}; call only after the webcast socket is live.
   */
  async resumePlayback(): Promise<void> {
    const playback = await loadPlayback()
    if (!playback) return
    if (playback.currentIndex < 0 || playback.currentIndex >= this.queue.length) return
    const track = this.queue[playback.currentIndex]
    const offset = Math.min(playback.offset, Math.max(0, track.duration - 0.5))
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
    this.stopCurrent()
    this.micSource?.disconnect()
    this.monitorGain.disconnect()
    this.analyser.disconnect()
    this.mixer.disconnect()
    this.fileGain.disconnect()
    this.micGain.disconnect()
    this.workletNode.disconnect()
    this.encoderWorker.terminate()
    if (this.ctx.state !== 'closed') await this.ctx.close()
  }
}
