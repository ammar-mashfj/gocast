import { saveQueue, loadQueue, clearQueue as clearStoredQueue, savePlayback, loadPlayback } from './queueStore'

export type RepeatMode = 'off' | 'all' | 'one'

export interface QueueTrack {
  id: string
  file: File
  title: string
  artist: string
  duration: number
}

const MIC_BOOST = 3

/**
 * Client-side cap on total queued audio bytes. The browser will already
 * enforce its own IndexedDB quota, but that fails opaquely with
 * QuotaExceededError. A friendly upfront limit lets us reject adds
 * predictably and surface usage in the UI.
 */
export const QUEUE_BYTE_LIMIT = 2 * 1024 * 1024 * 1024

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
 * Single AudioContext mixer. Files and mic both route through gain nodes
 * into a MediaStreamAudioDestinationNode, whose `.stream` is handed to a
 * WHIP RTCPeerConnection upstream. The browser handles encoding (Opus)
 * inside the WebRTC stack — we don't touch PCM bytes ourselves.
 *
 * Chain:
 *   fileSource → fileGain ─┐
 *                           ├→ analyser → destination ─► MediaStream → WHIP
 *   micSource  → micGain  ─┘
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
  private destination: MediaStreamAudioDestinationNode

  private micSource: MediaStreamAudioSourceNode | null = null
  private isTalking = false

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
  private repeatMode: RepeatMode = 'all'
  private progressTimer: ReturnType<typeof setInterval> | null = null

  // Reactive state: listeners are notified on any engine state change.
  // `version` is a monotonic counter that React's `useSyncExternalStore`
  // reads as its snapshot — incrementing it guarantees a new primitive
  // value each change, so components re-render reliably even though
  // internal structures (queue array, etc.) are mutated in place.
  private listeners = new Set<() => void>()
  private version = 0

  private constructor(ctx: AudioContext, micStream: MediaStream | null) {
    this.ctx = ctx

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

    // Analyser for level metering
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.mixer.connect(this.analyser)

    // Stereo destination — WebRTC reads `.stream` from this. Opus negotiation
    // with stereo=1 happens at SDP level in BroadcastManager.
    this.destination = this.ctx.createMediaStreamDestination()
    this.analyser.connect(this.destination)

    // Save playback progress every 5 seconds
    this.progressTimer = setInterval(() => {
      if (this.playing && this.currentIndex >= 0 && this.currentAudio) {
        savePlayback({ currentIndex: this.currentIndex, offset: this.currentAudio.currentTime })
      }
    }, 5000)
  }

  /**
   * Factory that creates an AudioEngine with a running AudioContext routed
   * to a MediaStreamAudioDestinationNode. The returned engine's
   * {@link getOutputStream} feeds the WHIP peer connection.
   */
  static async create(micStream: MediaStream | null): Promise<AudioEngine> {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    // Default sample rate (usually 48kHz) — matches Opus's native rate; no
    // resampling cost on the encoder side.
    const ctx = new Ctor()
    return new AudioEngine(ctx, micStream)
  }

  /** MediaStream containing the mixed mic+files audio. Pass to RTCPeerConnection. */
  getOutputStream(): MediaStream {
    return this.destination.stream
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

  /** Release push-to-talk: mute the mic and restore file playback to 100%. */
  pttUp() {
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

  // ── Queue management ──

  getQueue(): QueueTrack[] { return this.queue }
  getQueueBytes(): number { return this.queue.reduce((sum, t) => sum + t.file.size, 0) }
  getCurrentIndex(): number { return this.currentIndex }
  isPlaying(): boolean { return this.playing }
  getRepeatMode(): RepeatMode { return this.repeatMode }

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
  cycleRepeatMode() {
    this.repeatMode = this.repeatMode === 'off' ? 'all' : this.repeatMode === 'all' ? 'one' : 'off'
    this.notify()
  }

  getCurrentTrack(): QueueTrack | null {
    return this.queue[this.currentIndex] ?? null
  }

  private persistQueue() {
    saveQueue(this.queue.map((t) => ({ id: t.id, file: t.file, title: t.title, artist: t.artist })))
  }

  /**
   * Reload queue metadata from IndexedDB. Does NOT resume playback — callers
   * must invoke {@link resumePlayback} once the WHIP connection is live,
   * otherwise the first seconds of audio leave the mixer before any
   * peer connection is consuming the destination stream.
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
   * {@link restoreQueue}; call only after the WHIP peer connection is live.
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

  async next() {
    const nextIdx = this.currentIndex + 1
    if (nextIdx < this.queue.length) {
      await this.playIndex(nextIdx)
    } else if (this.repeatMode === 'all' && this.queue.length > 0) {
      await this.playIndex(0)
    } else {
      this.stopCurrent()
      this.playing = false
      this.currentIndex = -1
      this.notify()
    }
  }

  async prev() {
    const prevIdx = this.currentIndex - 1
    if (prevIdx >= 0) {
      await this.playIndex(prevIdx)
    } else if (this.repeatMode === 'all' && this.queue.length > 0) {
      await this.playIndex(this.queue.length - 1)
    } else {
      await this.playIndex(0)
    }
  }

  getElapsed(): number {
    if (this.currentIndex < 0 || !this.currentAudio) return 0
    return this.currentAudio.currentTime
  }

  async seek(seconds: number) {
    if (this.currentIndex < 0 || !this.currentAudio) return
    const track = this.queue[this.currentIndex]
    if (!track) return
    const duration = track.duration || this.currentAudio.duration || 0
    const clamped = Math.max(0, Math.min(seconds, Math.max(0, duration - 0.1)))
    this.currentAudio.currentTime = clamped
    savePlayback({ currentIndex: this.currentIndex, offset: clamped })
    this.notify()
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
      if (this.repeatMode === 'one') {
        void this.playIndex(this.currentIndex)
      } else {
        void this.next()
      }
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
    this.analyser.disconnect()
    this.mixer.disconnect()
    this.fileGain.disconnect()
    this.micGain.disconnect()
    this.destination.disconnect()
    if (this.ctx.state !== 'closed') await this.ctx.close()
  }
}
