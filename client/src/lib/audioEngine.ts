import { saveQueue, loadQueue, clearQueue as clearStoredQueue, savePlayback, loadPlayback } from './queueStore'

// lamejs is loaded via <script> in index.html (no ESM support)
declare const lamejs: {
  Mp3Encoder: new (channels: number, sampleRate: number, bitrate: number) => {
    encodeBuffer(left: Int16Array): Int16Array
    flush(): Int16Array
  }
}

export interface QueueTrack {
  id: string
  file: File
  title: string
  artist: string
  duration: number
  buffer: AudioBuffer | null
}

const SAMPLE_RATE = 44100
const MP3_BITRATE = 320
const MIC_BOOST = 3

/**
 * Single AudioContext mixer. Files and mic both route through gain nodes
 * into one AudioWorkletNode that captures PCM and posts it to the main
 * thread for MP3 encoding.
 *
 * Chain:
 *   fileSource → fileGain ─┐
 *                           ├→ analyser → workletNode → (main thread encode → onChunk)
 *   micSource  → micGain  ─┘
 *
 * PTT: micGain 0→MIC_BOOST, fileGain 1→0.2. Release: reverse.
 */
export class AudioEngine {
  private ctx: AudioContext
  private analyser: AnalyserNode
  private workletNode: AudioWorkletNode
  private fileGain: GainNode
  private micGain: GainNode
  private mixer: GainNode
  private encoder: InstanceType<typeof lamejs.Mp3Encoder>

  // Mic
  private micSource: MediaStreamAudioSourceNode | null = null
  private isTalking = false

  // File playback
  private currentSource: AudioBufferSourceNode | null = null
  private queue: QueueTrack[] = []
  private currentIndex = -1
  private playing = false
  private repeat = true
  private trackStartTime = 0 // ctx.currentTime when track started
  private trackOffset = 0 // offset into the track (for resume)
  private progressTimer: ReturnType<typeof setInterval> | null = null

  // Callbacks
  private onChunk: (data: ArrayBuffer) => void
  private onChange: () => void

  private constructor(
    ctx: AudioContext,
    workletNode: AudioWorkletNode,
    micStream: MediaStream | null,
    onChunk: (data: ArrayBuffer) => void,
    onChange: () => void,
  ) {
    this.ctx = ctx
    this.workletNode = workletNode
    this.onChunk = onChunk
    this.onChange = onChange
    this.encoder = new lamejs.Mp3Encoder(1, SAMPLE_RATE, MP3_BITRATE) as InstanceType<typeof lamejs.Mp3Encoder>

    // Mixer node — everything merges here
    this.mixer = this.ctx.createGain()
    this.mixer.gain.value = 1

    // File gain (default 1 — full volume, primary source)
    this.fileGain = this.ctx.createGain()
    this.fileGain.gain.value = 1
    this.fileGain.connect(this.mixer)

    // Mic gain (default 0 — silent until PTT)
    this.micGain = this.ctx.createGain()
    this.micGain.gain.value = 0
    this.micGain.connect(this.mixer)

    // Wire mic through gain (skip if no mic available)
    if (micStream) {
      this.micSource = this.ctx.createMediaStreamSource(micStream)
      this.micSource.connect(this.micGain)
    }

    // Analyser for level metering
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.mixer.connect(this.analyser)

    // AudioWorkletNode captures the mixed output — encoding happens on main thread
    this.workletNode.port.onmessage = (e: MessageEvent) => {
      const channelData = e.data as Float32Array
      const chunk = this.encodeSamples(channelData)
      if (chunk) this.onChunk(chunk.buffer as ArrayBuffer)
    }
    this.analyser.connect(this.workletNode)
    this.workletNode.connect(this.ctx.destination) // keep node alive

    // Save playback progress every 5 seconds
    this.progressTimer = setInterval(() => {
      if (this.playing && this.currentIndex >= 0) {
        const offset = this.trackOffset + (this.ctx.currentTime - this.trackStartTime)
        savePlayback({ currentIndex: this.currentIndex, offset })
      }
    }, 5000)
  }

  static async create(
    micStream: MediaStream | null,
    onChunk: (data: ArrayBuffer) => void,
    onChange: () => void,
  ): Promise<AudioEngine> {
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    await ctx.audioWorklet.addModule('/pcm-worklet.js')
    const workletNode = new AudioWorkletNode(ctx, 'pcm-processor')
    return new AudioEngine(ctx, workletNode, micStream, onChunk, onChange)
  }

  private encodeSamples(channelData: Float32Array): Uint8Array | null {
    const len = channelData.length
    const samples = new Int16Array(len)
    for (let i = 0; i < len; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]))
      samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    const mp3Data = this.encoder.encodeBuffer(samples)
    if (mp3Data.length > 0) return new Uint8Array(mp3Data)
    return null
  }

  // ── PTT ──

  pttDown() {
    if (this.isTalking) return
    this.isTalking = true
    // Duck files to 20%, bring mic up with boost
    this.fileGain.gain.setTargetAtTime(0.2, this.ctx.currentTime, 0.05)
    this.micGain.gain.setTargetAtTime(MIC_BOOST, this.ctx.currentTime, 0.02)
    this.onChange()
  }

  pttUp() {
    if (!this.isTalking) return
    this.isTalking = false
    // Restore files to 100%, mute mic
    this.fileGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.05)
    this.micGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02)
    this.onChange()
  }

  isMicActive(): boolean {
    return this.isTalking
  }

  getAnalyser(): AnalyserNode {
    return this.analyser
  }

  // ── Queue management ──

  getQueue(): QueueTrack[] { return this.queue }
  getCurrentIndex(): number { return this.currentIndex }
  isPlaying(): boolean { return this.playing }
  isRepeat(): boolean { return this.repeat }
  toggleRepeat() { this.repeat = !this.repeat; this.onChange() }

  getCurrentTrack(): QueueTrack | null {
    return this.queue[this.currentIndex] ?? null
  }

  private persistQueue() {
    saveQueue(this.queue.map((t) => ({ id: t.id, file: t.file, title: t.title, artist: t.artist })))
  }

  async restoreQueue(): Promise<void> {
    const stored = await loadQueue()
    if (stored.length === 0) return
    for (const track of stored) {
      const arrayBuffer = await track.file.arrayBuffer()
      const buffer = await this.ctx.decodeAudioData(arrayBuffer)
      this.queue.push({
        id: track.id,
        file: track.file,
        title: track.title,
        artist: track.artist,
        duration: buffer.duration,
        buffer,
      })
    }

    // Restore playback position
    const playback = await loadPlayback()
    if (playback && playback.currentIndex >= 0 && playback.currentIndex < this.queue.length) {
      const track = this.queue[playback.currentIndex]
      const offset = Math.min(playback.offset, track.duration - 0.5)
      if (offset > 0) {
        this.playIndexAtOffset(playback.currentIndex, offset)
      } else {
        this.playIndex(playback.currentIndex)
      }
    }

    this.onChange()
  }

  async addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('audio/')) continue
      const arrayBuffer = await file.arrayBuffer()
      const buffer = await this.ctx.decodeAudioData(arrayBuffer)
      this.queue.push({
        id: crypto.randomUUID(),
        file,
        title: file.name.replace(/\.[^.]+$/, ''),
        artist: 'Unknown',
        duration: buffer.duration,
        buffer,
      })
    }
    this.persistQueue()
    this.onChange()
    if (!this.playing && this.queue.length > 0 && this.currentIndex === -1) {
      this.playIndex(0)
    }
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
    this.onChange()
  }

  clearQueue() {
    this.stopCurrent()
    this.queue = []
    this.currentIndex = -1
    this.playing = false
    clearStoredQueue()
    this.onChange()
  }

  // ── Playback ──

  play() {
    if (this.queue.length === 0) return
    if (this.ctx.state === 'suspended') this.ctx.resume()
    if (this.currentIndex === -1) {
      this.playIndex(0)
    } else if (!this.playing) {
      this.playIndex(this.currentIndex)
    }
  }

  pause() {
    if (!this.playing) return
    this.ctx.suspend()
    this.playing = false
    this.onChange()
  }

  togglePlay() {
    if (this.playing) {
      this.pause()
    } else if (this.ctx.state === 'suspended' && this.currentSource) {
      this.ctx.resume()
      this.playing = true
      this.onChange()
    } else {
      this.play()
    }
  }

  next() {
    if (this.ctx.state === 'suspended') this.ctx.resume()
    this.stopCurrent()
    const nextIdx = this.currentIndex + 1
    if (nextIdx < this.queue.length) {
      this.playIndex(nextIdx)
    } else if (this.repeat && this.queue.length > 0) {
      this.playIndex(0)
    } else {
      this.playing = false
      this.currentIndex = -1
      this.onChange()
    }
  }

  prev() {
    if (this.ctx.state === 'suspended') this.ctx.resume()
    this.stopCurrent()
    const prevIdx = this.currentIndex - 1
    if (prevIdx >= 0) {
      this.playIndex(prevIdx)
    } else if (this.repeat && this.queue.length > 0) {
      this.playIndex(this.queue.length - 1)
    } else {
      this.playIndex(0)
    }
  }

  getElapsed(): number {
    if (!this.playing || this.currentIndex < 0) return 0
    return this.trackOffset + (this.ctx.currentTime - this.trackStartTime)
  }

  private playIndex(index: number) {
    this.playIndexAtOffset(index, 0)
  }

  private playIndexAtOffset(index: number, offset: number) {
    this.stopCurrent()
    this.currentIndex = index

    const track = this.queue[index]
    if (!track?.buffer) return

    const source = this.ctx.createBufferSource()
    source.buffer = track.buffer
    source.connect(this.fileGain)

    source.onended = () => {
      if (this.currentSource === source) {
        this.next()
      }
    }

    source.start(0, offset)
    this.currentSource = source
    this.trackStartTime = this.ctx.currentTime
    this.trackOffset = offset
    this.playing = true
    savePlayback({ currentIndex: index, offset })
    this.onChange()
  }

  private stopCurrent() {
    if (this.currentSource) {
      try { this.currentSource.stop() } catch { /* already stopped */ }
      this.currentSource.disconnect()
      this.currentSource = null
    }
  }

  flush(): void {
    const remaining = this.encoder.flush()
    if (remaining.length > 0) {
      this.onChunk(new Uint8Array(remaining).buffer)
    }
  }

  destroy() {
    if (this.progressTimer) clearInterval(this.progressTimer)
    this.stopCurrent()
    this.flush()
    this.micSource?.disconnect()
    this.workletNode.port.onmessage = null
    this.workletNode.disconnect()
    this.analyser.disconnect()
    this.mixer.disconnect()
    this.fileGain.disconnect()
    this.micGain.disconnect()
    if (this.ctx.state !== 'closed') this.ctx.close()
  }
}
