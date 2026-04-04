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
const BUFFER_SIZE = 8192

/**
 * Single AudioContext mixer. Files and mic both route through gain nodes
 * into one ScriptProcessor that encodes to MP3 and sends via onChunk.
 *
 * Chain:
 *   fileSource → fileGain ─┐
 *                           ├→ analyser → processor → (encode MP3 → onChunk)
 *   micSource  → micGain  ─┘
 *
 * PTT: micGain 0→1, fileGain 1→0.2. Release: reverse.
 */
export class AudioEngine {
  private ctx: AudioContext
  private analyser: AnalyserNode
  private processor: ScriptProcessorNode
  private fileGain: GainNode
  private micGain: GainNode
  private mixer: GainNode // merge point
  private encoder: InstanceType<typeof lamejs.Mp3Encoder>

  // Mic
  private micSource: MediaStreamAudioSourceNode
  private isTalking = false

  // File playback
  private currentSource: AudioBufferSourceNode | null = null
  private queue: QueueTrack[] = []
  private currentIndex = -1
  private playing = false
  private repeat = true

  // Callbacks
  private onChunk: (data: ArrayBuffer) => void
  private onChange: () => void

  constructor(micStream: MediaStream, onChunk: (data: ArrayBuffer) => void, onChange: () => void) {
    this.onChunk = onChunk
    this.onChange = onChange

    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
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

    // Wire mic through gain
    this.micSource = this.ctx.createMediaStreamSource(micStream)
    this.micSource.connect(this.micGain)

    // Analyser for level metering
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.mixer.connect(this.analyser)

    // ScriptProcessor captures the mixed output and encodes to MP3
    this.processor = this.ctx.createScriptProcessor(BUFFER_SIZE, 1, 1)
    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0)
      const chunk = this.encodeSamples(input)
      if (chunk) this.onChunk(chunk.buffer as ArrayBuffer)
    }
    this.analyser.connect(this.processor)
    this.processor.connect(this.ctx.destination) // keep processor alive
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
    // Duck files to 20%, bring mic to 100%
    this.fileGain.gain.setTargetAtTime(0.2, this.ctx.currentTime, 0.05)
    this.micGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.02)
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
    this.onChange()
  }

  clearQueue() {
    this.stopCurrent()
    this.queue = []
    this.currentIndex = -1
    this.playing = false
    this.onChange()
  }

  // ── Playback ──

  play() {
    if (this.queue.length === 0) return
    if (this.currentIndex === -1) {
      this.playIndex(0)
    } else if (!this.playing) {
      // Resume from current track
      this.playIndex(this.currentIndex)
    }
  }

  pause() {
    if (!this.playing) return
    this.stopCurrent()
    this.playing = false
    this.onChange()
  }

  togglePlay() {
    if (this.playing) this.pause()
    else this.play()
  }

  next() {
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
    this.stopCurrent()
    if (this.currentIndex >= 0) {
      this.playIndex(this.currentIndex)
    } else {
      this.playIndex(Math.max(0, this.currentIndex - 1))
    }
  }

  getElapsed(): number {
    return 0
  }

  private playIndex(index: number) {
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

    source.start(0)
    this.currentSource = source
    this.playing = true
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
    this.stopCurrent()
    this.flush()
    this.micSource.disconnect()
    this.processor.disconnect()
    this.analyser.disconnect()
    this.mixer.disconnect()
    this.fileGain.disconnect()
    this.micGain.disconnect()
    if (this.ctx.state !== 'closed') this.ctx.close()
  }
}
